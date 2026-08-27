import { reactive } from 'vue'
import { searchRequest, buildPayload } from './api.js'

export const store = reactive({
  open: false,
  q: '',
  strict: false,
  view: localStorage.getItem('cito_view') === 'list' ? 'list' : 'grid',
  accent: '', // sampled from the host theme in main.js
  loading: false,
  error: '',
  items: [],
  total: 0,
  semantic: false,
  semanticQ: '', // the query the rescue answered (q may have changed since)
  correctedQ: '', // server auto-corrected the query (s.php corrected_q) - items are real keyword results
  searchedQ: '', // the query the last COMPLETED search answered - gates the empty state so
  // "no results" never flashes for a query still being typed/debounced/fetched
  suggestions: [], // "others searched" chips
  popular: [], // shop-wide popular searches for the empty state (2.0.9)
  recent: [], // recently viewed products for the empty state (2.0.13, sessionStorage)
  correction: null, // {q, count} - "did you mean" from f.php
  facets: null, // {categories:[{category_id,category,cnt}], brands:[{brand,cnt}], price:{min,max},
  // features:[{feature_id,feature,values:[{id,variant,cnt}]}] - only values present in the result set}
  facetsQ: '', // the query the facets describe (2.4.2): a same-query response without facets keeps them
  filters: { category_ids: [], brands: [], price_min: '', price_max: '', in_stock: false, features: {} },
  railOpen: false, // mobile filter drawer
  limit: 20,
  offset: 0,
})

export function setView(view) {
  store.view = view
  try { localStorage.setItem('cito_view', view) } catch (e) { /* private mode */ }
}

//initial grid/list view: an explicit choice by THIS visitor always wins (setView
//persists it); otherwise the shop's per-device default decides - phones default to
//the list, where a grid squeezes cards into unreadable columns. Runs from main.js
//init(), not at module load: citoParams is inlined at the end of <body> while this
//bundle sits in the head, so it does not exist yet when the store is created.
export function initView() {
  let stored = null
  try { stored = localStorage.getItem('cito_view') } catch (e) { /* private mode */ }
  if (stored === 'list' || stored === 'grid') return
  const p = window.citoParams || {}
  const mobile = window.matchMedia ? window.matchMedia('(max-width: 767px)').matches : false
  const want = mobile ? p.default_view_mobile : p.default_view_desktop
  store.view = want === 'list' ? 'list' : (want === 'grid' ? 'grid' : (mobile ? 'list' : 'grid'))
}

//---- url + history: the current search lives in a hash fragment (#cito?q=...)
//so refresh restores it, links are shareable, and back-from-a-product reopens
//the search. A fragment never reaches the server -> page/CDN caches unaffected.
//Only ONE history entry exists (pushed when the overlay opens, so Back closes
//it); query/filter changes use replaceState and never stack entries.
export function stateToHash() {
  const f = store.filters
  const p = new URLSearchParams()
  p.set('q', store.q.trim())
  if (store.strict) p.set('strict', '1')
  if (f.category_ids.length) p.set('c', f.category_ids.join('.'))
  if (f.brands.length) p.set('b', f.brands.join('|'))
  if (f.price_min !== '' && f.price_min !== null) p.set('pmin', f.price_min)
  if (f.price_max !== '' && f.price_max !== null) p.set('pmax', f.price_max)
  if (f.in_stock) p.set('stock', '1')
  const fg = Object.entries(f.features || {}).filter(([, ids]) => ids.length)
  if (fg.length) p.set('f', fg.map(([fid, ids]) => fid + '.' + ids.join('.')).join('|'))
  return '#cito?' + p.toString()
}

export function applyHash(hash) {
  if (!hash || hash.indexOf('#cito?') !== 0) return false
  const p = new URLSearchParams(hash.slice(6))
  const q = (p.get('q') || '').trim()
  if (q.length < 2) return false
  store.q = q
  store.strict = p.get('strict') === '1'
  store.filters = {
    category_ids: (p.get('c') || '').split('.').filter(Boolean).map(Number),
    brands: (p.get('b') || '').split('|').filter(Boolean),
    price_min: p.get('pmin') !== null ? p.get('pmin') : '',
    price_max: p.get('pmax') !== null ? p.get('pmax') : '',
    in_stock: p.get('stock') === '1',
    features: (p.get('f') || '').split('|').filter(Boolean).reduce((acc, part) => {
      const nums = part.split('.').filter(Boolean).map(Number)
      const fid = nums.shift()
      if (fid && nums.length) acc[fid] = nums
      return acc
    }, {}),
  }
  return true
}

//the page's own search box the overlay was opened from: keep its text in sync
//so closing the overlay leaves the query visible in the page header
let hostInput = null
export function setHostInput(el) { hostInput = el }
export function syncHostInput() { if (hostInput) hostInput.value = store.q }
export function focusHostInput() { if (hostInput) hostInput.focus() }

//translations: printed by the tpl via Tygh.tr; fall back to english defaults
const TR_DEFAULTS = {
  'cito.recently_viewed': 'Recently viewed',
  'cito.filters': 'Filters',
  'cito.categories': 'Categories',
  'cito.brands': 'Brands',
  'cito.price': 'Price',
  'cito.in_stock_only': 'In stock only',
  'cito.reset_filters': 'Reset filters',
  'cito.show_more': 'Show more products',
  'cito.found_products': 'Found [n] products',
  'cito.similar_for': 'No exact matches for “[q]”. These are the closest products.',
  'cito.results_for': 'Results for “[q]”',
  'cito.empty': 'Nothing matches “[q]”.',
  'cito.empty_hint': 'Try fewer words, or check the spelling.',
  'cito.empty_hint_strict': 'Precision search is on — it only finds literal matches.',
  'cito.empty_turn_off_precision': 'Turn off Precision search',
  'cito.other_users_searched': 'Popular searches',
  'cito.see_all': 'See all',
  'cito.show_products': 'Show [n] products',
  'cito.view_grid': 'Grid view',
  'cito.view_list': 'List view',
  'cito.close': 'Close search',
  'cito.clear': 'Clear search text',
  'cito.no_results': 'No results',
  'cito.in_stock': 'In stock',
  'cito.in_stock_supplier': 'In stock at the supplier',
  'cito.assist_label': 'AI assistant',
  'cito.assist_ask': 'Ask the AI assistant',
  'cito.assist_thinking': 'Looking for an answer…',
  'cito.assist_beta': 'Beta',
  'cito.assist_error': 'That didn’t work just now – please try again.',
  'cito.assist_tech_error': 'I’m having a technical problem fetching the answer – please try again in a moment.',
  'cito.assist_close': 'Close',
  //shared with the floating chat since 2.0.x - the overlay reuses the wording so a shop
  //that translated one surface has already translated the other
  'cito.assist_placeholder': 'Describe what you’re looking for…',
  'cito.assist_send': 'Send',
  //the collapsed picks next to search results (2.1.9). Built-in default on purpose: a shop
  //that never imports the langvar still gets a readable line instead of a raw key
  'cito.assist_recs_kept': 'Your suggestions',
}
const trCache = {}
export function tr(key, repl) {
  let s = trCache[key]
  if (s === undefined) {
    const T = window.Tygh
    if (T && typeof T.tr === 'function') {
      //Tygh.tr console.errors on unknown keys (our new keys until the addon ships
      //their lang vars); probe once per key with the noise muted
      const origError = console.error
      console.error = () => {}
      try { s = T.tr(key) } finally { console.error = origError }
    }
    //CS-Cart renders a langvar that was never imported as the literal '_cito.assist_ask'
    //(leading underscore = "not imported"), which is neither empty nor equal to the key -
    //so without this the overlay would print that string to visitors whenever the alangs
    //step was skipped on a rollout. Fall back to the built-in default instead.
    if (typeof s === 'string' && s.charAt(0) === '_') s = ''
    if (!s || s === key) s = TR_DEFAULTS[key] || key
    trCache[key] = s
  }
  if (repl) for (const k in repl) s = s.replace('[' + k + ']', repl[k])
  return s
}

let ctrl = null
let debounceTimer = null

export function resetFilters() {
  store.filters = { category_ids: [], brands: [], price_min: '', price_max: '', in_stock: false, features: {} }
}

export function hasActiveFilters() {
  const f = store.filters
  return f.category_ids.length || f.brands.length || f.in_stock
    || f.price_min !== '' || f.price_max !== ''
    || Object.keys(f.features || {}).length
}

//the assistant registers here (main.js) instead of being imported by store.js - keeps
//the dependency one-way, so the search has no idea an assistant exists
let searchHook = null
export function setSearchHook(fn) { searchHook = fn }

//append=true keeps current items and loads the next page (show more)
export function search(append = false) {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  if (ctrl) ctrl.abort()

  const q = store.q.trim()
  if (q.length < 2) {
    store.items = []; store.total = 0; store.facets = null; store.facetsQ = ''; store.semantic = false; store.correction = null; store.correctedQ = ''; store.searchedQ = ''
    store.loading = false
    return
  }

  if (!append) store.offset = 0
  ctrl = new AbortController()
  store.loading = true
  store.error = ''

  searchRequest(buildPayload(store), ctrl.signal)
    .then(data => {
      store.loading = false
      if (data.code && data.code !== 200) {
        store.error = data.text || ('Error ' + data.code)
        return
      }
      const items = Object.values(data.items || {})
      store.items = append ? store.items.concat(items) : items
      store.total = Number(data.total) || 0
      store.semantic = !!data.semantic
      if (store.semantic) store.semanticQ = q
      store.searchedQ = q
      store.correctedQ = data.corrected_q || ''
      //facets: a response WITH them always wins. Without them a NEW query clears the rail
      //(stale facets would filter a query they don't describe - semantic rescue, pre-v2
      //API), but the SAME query keeps the last rail (2.4.2). The server omits `facets`
      //when its facet pass fails (2026-08-25..26: every price-filtered search, s.php
      //eff_price alias) - unmounting the rail then took the mobile filter drawer AND the
      //only way to undo the filter away the moment the slider was released (a shop)
      if (data.facets) { store.facets = data.facets; store.facetsQ = q }
      else if (!append && q !== store.facetsQ) { store.facets = null; store.facetsQ = '' }
      if (!append) {
        if (store.correctedQ) store.correction = null //server already auto-corrected
        //rescue answers are "similar" items, not keyword hits: a correction must not
        //have to beat their inflated total in f.php (that suppressed corrections)
        else loadCorrection(q, store.semantic ? 0 : store.total)
      }
      if (!append && store.open) {
        history.replaceState(history.state, '', stateToHash())
      }
      logSearch(q, store.total)
      //LAST, deliberately: everything above has already been assigned, so the grid
      //paints in this same tick and the result list never waits for the LLM
      if (!append && searchHook) searchHook(q, { zero: !items.length, semantic: !!data.semantic })
    })
    .catch(err => {
      if (err.name === 'AbortError') return
      store.loading = false
      store.error = String(err)
    })

  if (!append) loadSuggestions(q)
}

//"others searched" chips via the addon's cito.q_suggestions controller (shop-side)
let suggestionsCtrl = null
function loadSuggestions(q) {
  const p = window.citoParams
  if (!p.show_other_users_searched || typeof window.fn_url !== 'function') return
  if (suggestionsCtrl) suggestionsCtrl.abort()
  suggestionsCtrl = new AbortController()
  fetch(window.fn_url('cito.q_suggestions?is_ajax=1'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'q=' + encodeURIComponent(q),
    signal: suggestionsCtrl.signal,
  }).then(r => r.json()).then(res => {
    const list = (res && res.suggestions) ? res.suggestions : []
    store.suggestions = list.filter(s => s.trim().toLowerCase() !== q.toLowerCase()).slice(0, 6)
  }).catch(() => {})
}

//shop-wide popular searches for the empty state: same controller with an empty q
//(top-N by count, dead/rare queries filtered server-side). Fetched once per page -
//the list changes slowly no matter how often the popup reopens; the visitor's own
//last searches are excluded on both sides (session server-side, citoParams here)
let popularLoaded = false
export function loadPopular() {
  const p = window.citoParams
  if (popularLoaded || !p.show_other_users_searched || typeof window.fn_url !== 'function') return
  popularLoaded = true
  fetch(window.fn_url('cito.q_suggestions?is_ajax=1'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'q=',
  }).then(r => r.json()).then(res => {
    const list = (res && res.suggestions) ? res.suggestions : []
    const own = (p.last_searches || []).map(s => String(s).trim().toLowerCase())
    store.popular = list
      .filter(s => s && String(s).trim().length >= 2 && !own.includes(String(s).trim().toLowerCase()))
      .slice(0, 8)
  }).catch(() => { popularLoaded = false }) //transient failure: retry on next open
}

//recently viewed products: the widget itself tracks them on product pages via
//citoParams.page_product (id/name/url/thumb inlined by the tpl) - sessionStorage only,
//same privacy model as everything else.
//TRACKING always runs, because this list is also the signal source for the empty
//state's personalised picks (recs.js); only the compact-state ROW is the merchant's
//setting (show_recently_viewed). Before 2.1.7 the whole function returned early when
//the setting was off, which silently disabled the picks on those shops too.
let recentAll = [] //the tracked list, unfiltered - see recentSignals() below
export function initRecent() {
  const p = window.citoParams
  let list = []
  try { list = JSON.parse(sessionStorage.getItem('citoRecentViews') || '[]') } catch (e) { /* private mode */ }
  if (!Array.isArray(list)) list = []
  const cur = p.page_product
  if (cur && cur.id) {
    list = [{ id: cur.id, n: cur.name || '', u: cur.url || '', i: cur.image || '' }]
      .concat(list.filter(v => v && v.id !== cur.id)).slice(0, 10)
    try { sessionStorage.setItem('citoRecentViews', JSON.stringify(list)) } catch (e) { /* private mode */ }
  }
  recentAll = list
  //the ROW never offers the product the visitor is standing on
  store.recent = p.show_recently_viewed ? list.filter(v => v && v.n && (!cur || v.id !== cur.id)) : []
}

//what this visitor looked at, MOST RECENT FIRST and INCLUDING the page they are on -
//the signal list for the assistant, which is not the same thing as the row above: the
//product in front of them is their strongest signal, and api/a.php excludes every
//signal id from its candidates, so it can never be recommended back. Feeding it
//store.recent instead meant the picks could never appear ON a product page - two
//viewed products left exactly one signal there, one below the server's minimum.
export function recentSignals() {
  return recentAll.map(v => v && v.id).filter((id, i, a) => id && a.indexOf(id) === i)
}

export function useSuggestion(s) {
  store.q = s
  search(false)
}

//"did you mean" via the api's f endpoint (QSUGGEST-based corrections)
let correctionCtrl = null
function loadCorrection(q, numResults) {
  store.correction = null
  const p = window.citoParams
  if (!p.show_correction || !p.show_correction_url) return
  if (correctionCtrl) correctionCtrl.abort()
  correctionCtrl = new AbortController()
  fetch(p.show_correction_url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      q,
      q_results: numResults,
      storefront_id: p.storefront_id,
      lang_code: p.lang_code,
      usergroup_ids: p.usergroup_ids,
      token: p.token,
    }),
    signal: correctionCtrl.signal,
  }).then(r => r.json()).then(data => {
    if (!data || store.q.trim() !== q) return //stale
    const corrected = (data.correct_q || '').trim()
    if (corrected && Number(data.correct_count) > 0 && corrected.toLowerCase() !== q.toLowerCase()) {
      store.correction = { q: corrected, count: Number(data.correct_count) }
    }
  }).catch(() => {})
}

export function searchDebounced(delay = 200) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => search(false), delay)
}

export function showMore() {
  store.offset += store.limit
  search(true)
}

//query logging for the "other users searched" suggestions (same beacon as func.js)
let logTimer = null
function logSearch(q, numResults) {
  if (logTimer) clearTimeout(logTimer)
  logTimer = setTimeout(() => {
    if (typeof window.fn_url !== 'function' || !navigator.sendBeacon) return
    const fd = new FormData()
    fd.append('q', q)
    fd.append('num_results', numResults)
    navigator.sendBeacon(window.fn_url('cito.q'), fd)
  }, 2000)
}
