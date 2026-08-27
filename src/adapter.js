//Platform adapter - the ONE place in the overlay that knows which shop system hosts it.
//Everything CS-Cart-specific (URL builders, translations, the theme's search input, the
//shop-side helper endpoints, add-to-cart) lives in `cscartDefaults`; a host page overrides
//any part of it by inlining `window.citoAdapter = { ... }` next to `citoParams`, before
//the widget initialises. Contract: ~/dev/cito/docs/CLIENT-CONTRACT.md §9 - the WordPress
//plugin implements the same surface from there. assistant.js carries an ES5 copy of the
//functions it needs (it does not go through Vite); keep the two in step.
//
//Every network function degrades silently (resolves to '', [] or false - never rejects
//with something the caller must handle): a failing shop-side helper must never break
//the search.

const cscartDefaults = {
  //the header search input(s) whose focus opens the overlay; `excludeInputWithin`
  //keeps inputs inside a matching ancestor out (CS-Cart's product-filter search box
  //would otherwise open the overlay from the category page's filter rail)
  searchInputSelector: '#search_input, form[name="search_form"] input[name="q"], form[name="search_form"] input[name="hint_q"]',
  excludeInputWithin: '.ty-product-filters',
  //submits of this form are swallowed while the overlay is open (Enter in the page's
  //own box must not navigate to the platform's result page behind the overlay)
  searchFormName: 'search_form',
  //where the theme's brand colour is sampled from, first saturated background wins
  //(main.js sampleAccent): the theme's primary controls, most specific first
  accentCandidates: [
    '.ty-btn__primary', '.ty-btn-go', 'button[type="submit"]',
    '.ut2-btn', '.ty-btn', 'a.cm-submit',
  ],
  //theaterJS for the animated typing placeholder, loaded lazily by the overlay only
  //when the shop configured phrases; '' = the host ships no theater, no placeholder
  theaterSrc: 'js/addons/nl_cito/theater.min.js',

  //product url via the storefront's own url builder when available
  productUrl(item) {
    if (typeof window.fn_url === 'function') {
      return window.fn_url('products.view?product_id=' + item.product_id)
    }
    return '?dispatch=products.view&product_id=' + item.product_id
  },
  //the platform's own result page for the same query ("see all", Enter without a card)
  searchPageUrl(q) {
    if (typeof window.fn_url === 'function') {
      return window.fn_url('products.search?search_performed=Y&q=' + encodeURIComponent(q))
    }
    return '?dispatch=products.search&search_performed=Y&q=' + encodeURIComponent(q)
  },
  //a ~360px thumbnail generated on demand by the shop (contract §8b): the index often
  //has no image url at sync time. Resolves to the url or '' - never rejects.
  fetchImage(productId) {
    return fetch(window.fn_url ? window.fn_url('cito.image?is_ajax=1') : '?dispatch=cito.image&is_ajax=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'product_id=' + encodeURIComponent(productId),
    }).then(r => r.json()).then(d => (d && d.src) ? d.src : '').catch(() => '')
  },
  //log a FINISHED search shop-side (contract §8c): feeds "others searched" and the
  //merchant's query statistics. Fire-and-forget; the caller already debounced it.
  logQuery(q, numResults) {
    if (typeof window.fn_url !== 'function' || !navigator.sendBeacon) return
    const fd = new FormData()
    fd.append('q', q)
    fd.append('num_results', numResults)
    navigator.sendBeacon(window.fn_url('cito.q'), fd)
  },
  //popular queries (contract §8c): q non-empty = queries containing it, q empty = the
  //shop-wide list for the empty state. Resolves to a string list; `signal` (optional)
  //aborts a typed query that was overtaken by the next keystroke.
  suggestions(q, signal) {
    if (typeof window.fn_url !== 'function') return Promise.resolve([])
    return fetch(window.fn_url('cito.q_suggestions?is_ajax=1'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'q=' + encodeURIComponent(q),
      signal,
    }).then(r => r.json()).then(res => (res && res.suggestions) ? res.suggestions : [])
  },
  //shop-side translation of a `cito.*` key, or undefined = "use the built-in default".
  //CS-Cart: Tygh.tr console.errors on unknown keys (our new keys until the addon ships
  //their lang vars) - probe with the noise muted; and it renders a langvar that was never
  //imported as the literal '_cito.assist_ask' (leading underscore = "not imported"),
  //which is neither empty nor equal to the key - so without this the overlay would print
  //that string to visitors whenever the alangs step was skipped on a rollout.
  tr(key) {
    const T = window.Tygh
    if (!T || typeof T.tr !== 'function') return undefined
    const origError = console.error
    console.error = () => {}
    let s
    try { s = T.tr(key) } finally { console.error = origError }
    if (typeof s !== 'string' || !s || s === key || s.charAt(0) === '_') return undefined
    return s
  },
  //add one unit of a product to the cart; resolves true when the shop confirmed it.
  //Used by the assistant's cards (the overlay's cards link to the product page).
  //CS-Cart: the native ajax pipeline updates the minicart and shows the "product added"
  //notification exactly like the shop's own buttons; without the Tygh runtime a plain
  //ajax add with no page feedback.
  addToCart(productId) {
    const $ = window.Tygh && window.Tygh.$
    if ($ && $.ceAjax) {
      return new Promise(resolve => {
        const product_data = {}
        product_data[productId] = { product_id: productId, amount: 1 }
        $.ceAjax('request', window.fn_url ? window.fn_url('checkout.add..' + productId) : '?dispatch=checkout.add..' + productId, {
          method: 'post',
          data: { product_data },
          result_ids: 'cart_status*,wish_list*,account_info*',
          caching: false,
          callback: () => resolve(true),
        })
      })
    }
    return fetch(window.fn_url ? window.fn_url('checkout.add..' + productId + '?is_ajax=1') : '?dispatch=checkout.add..' + productId + '&is_ajax=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'product_data[' + productId + '][product_id]=' + productId + '&product_data[' + productId + '][amount]=1',
    }).then(r => r.ok).catch(() => false)
  },
  //call `cb` whenever the platform re-renders the cart page by ajax (the in-page cart
  //block lives inside that table and has to be rebuilt). CS-Cart replaces the cart table
  //wholesale on quantity changes; commoninit is the event every addon re-initialises on.
  onCartRerender(cb) {
    if (window.Tygh && window.Tygh.$ && window.Tygh.$.ceEvent) {
      window.Tygh.$.ceEvent('on', 'ce.commoninit', () => cb())
    }
  },
  //the product id a click on one of the SHOP'S OWN add-to-cart controls refers to, or 0
  //(the assistant tracks adds as its strongest interest signal). Most CS-Cart add buttons
  //are named dispatch[checkout.add..<product_id>], but not all: a product-links addon
  //rewrites the name to the id-less dispatch[checkout.add], "add all" buttons never carry
  //an id and some themes only set but_id - so fall back to button_cart_<id> and to the
  //enclosing product form.
  cartedIdFromClick(e) {
    const t = e.target
    if (!t || !t.closest) return 0
    const btn = t.closest('[name^="dispatch[checkout.add"], [id^="button_cart_"]')
    if (!btn) return 0
    let m = (btn.getAttribute('name') || '').match(/checkout\.add\.\.(\d+)/)
    if (!m) m = (btn.id || '').match(/button_cart_(\d+)/)
    if (m) return parseInt(m[1], 10) || 0
    const form = btn.form || btn.closest('form')
    if (!form) return 0
    m = ((form.getAttribute('name') || '') + ' ' + (form.id || '')).match(/product_form_(\d+)/)
    if (m) return parseInt(m[1], 10) || 0
    const inp = form.querySelector('input[name^="product_data["][name*="[product_id]"]')
    return inp ? parseInt(inp.value, 10) || 0 : 0
  },
  //same for the shop's wishlist controls (almost as strong a signal as a cart add)
  wishedIdFromClick(e) {
    const t = e.target
    if (!t || !t.closest) return 0
    const btn = t.closest('[name^="dispatch[wishlist.add"]')
    if (!btn) return 0
    let m = (btn.getAttribute('name') || '').match(/wishlist\.add\.\.(\d+)/)
    if (m) return parseInt(m[1], 10) || 0
    const form = btn.form || btn.closest('form')
    if (!form) return 0
    m = ((form.getAttribute('name') || '') + ' ' + (form.id || '')).match(/product_form_(\d+)/)
    return m ? parseInt(m[1], 10) || 0 : 0
  },
}

//the live adapter. Starts as the CS-Cart defaults so module-level code can reference it;
//initAdapter() merges the host's overrides in from main.js init() - NOT at module load,
//because the bundle sits in <head> while citoAdapter/citoParams are inlined at the end
//of <body> (same reason store.js initView() runs from init)
export const adapter = Object.assign({}, cscartDefaults)

export function initAdapter() {
  Object.assign(adapter, window.citoAdapter || {})
  return adapter
}
