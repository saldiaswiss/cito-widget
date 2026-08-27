import { adapter } from './adapter.js'

//API client for the cito search endpoint (citoParams.url -> api/s.php).
//JSON body with Content-Type text/plain: keeps the request "simple" (no CORS
//preflight - the API only sends Access-Control-Allow-Origin); the API merges
//a JSON request body into $_REQUEST regardless of content type.
export function searchRequest(payload, signal) {
  const p = window.citoParams
  return fetch(p.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    signal,
  }).then(res => res.json())
}

export function buildPayload(store) {
  const p = window.citoParams
  const payload = {
    q: store.q,
    facets: 1,
    limit: store.limit,
    offset: store.offset,
    storefront_id: p.storefront_id,
    lang_code: p.lang_code,
    currency_code: p.currency_code,
    usergroup_ids: p.usergroup_ids,
    weights: p.weights,
    show_zero_price: p.show_zero_price ? 1 : '',
    token: p.token,
  }
  if (store.strict) payload.strict = 1
  const f = store.filters
  if (f.category_ids.length) payload.filter_category_ids = f.category_ids
  if (f.brands.length) payload.filter_brands = f.brands
  if (f.price_min !== '' && f.price_min !== null) payload.filter_price_min = f.price_min
  if (f.price_max !== '' && f.price_max !== null) payload.filter_price_max = f.price_max
  if (f.in_stock) payload.filter_in_stock = 1
  //feature filters travel as groups of variant ids: one group per feature (the
  //server ORs within a group, ANDs across groups)
  const fgroups = Object.values(f.features || {}).filter(ids => ids.length)
  if (fgroups.length) payload.filter_features = fgroups
  return payload
}

//lazy product images: the index often has no thumbnail url at sync time; the shop
//generates one on demand through the adapter (contract §8b; same fallback func.js
//used onerror, here also used for empty images, driven by an IntersectionObserver).
//Cached per page here, whatever the adapter does - one request per product id.
const imgCache = new Map()
export function fetchImage(productId) {
  if (!imgCache.has(productId)) {
    const req = Promise.resolve()
      .then(() => adapter.fetchImage(productId))
      .then(src => (typeof src === 'string' ? src : ''))
      .catch(() => '') //a host adapter that throws must not break the card
    imgCache.set(productId, req)
  }
  return imgCache.get(productId)
}

//url builders live in the adapter (platform-specific); re-exported here so the
//components keep importing everything network-ish from one module
export function productUrl(item) { return adapter.productUrl(item) }
export function searchPageUrl(q) { return adapter.searchPageUrl(q) }

//ask the AI assistant from inside the search overlay (2.0.30). Same transport contract
//as searchRequest: text/plain keeps it a simple request with no CORS preflight, and the
//identity fields are the ones citoParams already carries - api/chat.php needs nothing
//that the search does not already send. Returns {reply, items, error} or throws.
export function chatRequest(messages, signal) {
  const p = window.citoParams
  return fetch(p.chat_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      storefront_id: p.storefront_id,
      lang_code: p.lang_code,
      currency_code: p.currency_code,
      usergroup_ids: p.usergroup_ids,
      token: p.token,
      messages,
      //the product page the overlay was opened FROM. api/chat.php grounds the answer on
      //it (row for the prompt context + its knn neighbours as candidates), which is why
      //assistant.js has always sent it - the overlay did not, so a question asked from
      //the search bar on a product page lost that context. citoParams.page_product is
      //already inlined by the storefront template for the recently-viewed row.
      page_pid: (p.page_product && p.page_product.id) || 0,
    }),
    signal,
  }).then(res => res.json())
}

//personalised picks for the overlay's empty state (2.1.4 -> api/a.php). Same transport
//contract as searchRequest and chatRequest: text/plain, no preflight, identity fields the
//widget already carries. Returns {show, message, items} - show:0 is a normal answer, not
//an error (gated shop, thin session, spent budget).
export function recsRequest(payload, signal) {
  return fetch(window.citoParams.assist_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    signal,
  }).then(res => res.json())
}

//which result the visitor actually opened - the other half of the search analytics
//(api/e.php -> click_events -> the clicks/add_to_carts columns of search_stats_daily,
//which sat at zero because nothing ever wrote them). Runs while the page is already
//navigating away, so sendBeacon, not fetch. text/plain keeps it a simple request with
//no CORS preflight, same reasoning as searchRequest above. Fire-and-forget by
//contract: analytics must never surface an error in the shop.
//assistant-side analytics: impressions and clicks of the AI block's cards, so they land
//in assist_events (kind 'h' = chat) instead of click_events. Same endpoint, different
//payload shape - api/e.php branches on `rec` vs `action` and writes the matching table.
export function trackRec(ev, kind, productIds) {
  const p = window.citoParams
  if (!p || !p.e_url || !productIds || !productIds.length) return
  try {
    const body = JSON.stringify({
      storefront_id: p.storefront_id,
      lang_code: p.lang_code,
      usergroup_ids: p.usergroup_ids,
      token: p.token,
      rec: { ev, k: kind, product_ids: productIds.slice(0, 4).map(Number) },
    })
    if (typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(p.e_url, new Blob([body], { type: 'text/plain' }))) return
    fetch(p.e_url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {})
  } catch (e) { /* never break the shop for a beacon */ }
}

export function trackClick(q, productId, action) {
  const p = window.citoParams
  if (!p || !p.e_url || !productId || typeof navigator.sendBeacon !== 'function') return
  try {
    const body = JSON.stringify({
      storefront_id: p.storefront_id,
      lang_code: p.lang_code,
      usergroup_ids: p.usergroup_ids,
      token: p.token,
      action: action || 'click',
      product_id: productId,
      q: (q || '').slice(0, 255),
    })
    if (navigator.sendBeacon(p.e_url, new Blob([body], { type: 'text/plain' }))) return
    //queue full / blocked: keepalive fetch survives the navigation too (same
    //fallback chain as assistant.js)
    fetch(p.e_url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {})
  } catch (e) { /* never break the shop for a beacon */ }
}
