import { createApp } from 'vue'
import App from './App.vue'
import { store, search, setHostInput, applyHash, initRecent, initView, setSearchHook } from './store.js'
import { adapter, initAdapter } from './adapter.js'
import { maybeAutoAsk } from './ai.js'
import { loadRecs, hasSearchedThisSession } from './recs.js'

//fullscreen overlay search widget (v2 UI). Mounted once per page; opens when the
//storefront search input gets focus and takes over from there. The legacy
//dropdown (func.js) must NOT be loaded at the same time - the tpl hook loads
//one or the other.
//borrow the host shop's brand color so the widget reads as native everywhere:
//sample the first saturated background among the theme's primary controls
//(adapter.accentCandidates; fallback: a neutral dark red that survives any theme)
function sampleAccent() {
  for (const sel of adapter.accentCandidates || []) {
    for (const el of document.querySelectorAll(sel)) {
      const c = getComputedStyle(el).backgroundColor
      const m = c && c.match(/\d+(\.\d+)?/g)
      if (!m || (m.length > 3 && parseFloat(m[3]) < 0.9)) continue
      const [r, g, b] = m.map(Number)
      const max = Math.max(r, g, b), min = Math.min(r, g, b)
      const saturated = max - min > 40
      const notWhiteish = (r + g + b) / 3 < 225
      const notBlackish = (r + g + b) / 3 > 25
      if (saturated && notWhiteish && notBlackish) return 'rgb(' + r + ', ' + g + ', ' + b + ')'
    }
  }
  return '#C8102E'
}

//the page's own search input(s) - the adapter knows the theme; anything inside
//`excludeInputWithin` (e.g. a filter rail's own search box) is not ours
function isOurInput(el) {
  if (!el || !el.matches || !el.matches(adapter.searchInputSelector)) return false
  const excl = adapter.excludeInputWithin
  return !(excl && el.closest(excl))
}

//animated typing placeholder in the page's search box (same theater.min.js and
//phrases the legacy dropdown used; loaded only when the shop configured phrases
//AND the host ships the library - adapter.theaterSrc '' = no placeholder)
function initTheater() {
  const phrases = window.citoParams.searchPhrases
  if (!Array.isArray(phrases) || !phrases.length || !adapter.theaterSrc) return
  const s = document.createElement('script')
  s.src = adapter.theaterSrc
  s.onload = () => {
    if (typeof window.theaterJS !== 'function') return
    const theater = window.theaterJS()
    theater.addActor('searchInput', { accuracy: 0.6, speed: 0.8 }, displayValue => {
      document.querySelectorAll(adapter.searchInputSelector).forEach(input => {
        if (isOurInput(input)) input.setAttribute('placeholder', displayValue)
      })
    })
    phrases.forEach(phrase => theater.addScene('searchInput:' + phrase, 1800))
    theater.addScene(theater.replay)
  }
  document.head.appendChild(s)
}

function init() {
  if (!window.citoParams || document.getElementById('cito_overlay_root')) return

  initAdapter() //host overrides (window.citoAdapter) are inlined by now, like citoParams
  store.accent = sampleAccent()

  const host = document.createElement('div')
  host.id = 'cito_overlay_root'
  document.body.appendChild(host)
  createApp(App).mount(host)
  window.__citoStore = store //dev/service handle (nothing secret in it)

  initTheater()
  initRecent() //track + load "recently viewed" for the overlay's empty state
  //Prefetch the empty-state picks BEFORE the overlay opens - but only for a visitor who
  //has already opened the search once this session. The answer takes ~2s (measured on
  //a shop 2026-08-17), longer than the pause before the first keystroke, so waiting for
  //the opening means most visitors never see it. Paying on every page view of every
  //visitor instead would be the cost profile of the popup's old browse trigger, which
  //earned 2 clicks on 2,125 impressions - hence the "has searched at all" condition.
  //Still one request per signal state and at most 3 per session (recs.js).
  if (hasSearchedThisSession()) loadRecs()
  initView() //per-device default view unless the visitor already picked one
  //the assistant only ever reacts to a FINISHED search (results already on screen);
  //it does nothing at all unless citoParams.chat_url is present
  setSearchHook(maybeAutoAsk)

  //a #cito?... fragment (refresh, shared link, back-from-a-product) restores
  //the search - query, filters, precision - and reopens the overlay
  if (applyHash(location.hash)) {
    store.open = true
    search(false)
  }

  const matchInput = e => {
    const t = e.target
    if (!isOurInput(t) || t.closest('#cito_overlay_root')) return null
    return t
  }

  //focusing the page's search box opens the overlay in its COMPACT form (just
  //the search bar + last searches); it grows to the full panel once a query
  //of 2+ characters produces something to show (see `compact` in App.vue)
  document.addEventListener('focusin', e => {
    const input = matchInput(e)
    if (!input) return
    setHostInput(input)
    const val = (input.value || '').trim() === (input.title || '') ? '' : input.value
    openOverlay(input, val)
  })

  //safety net (autofill, programmatic value changes while the overlay is closed)
  document.addEventListener('input', e => {
    const input = matchInput(e)
    if (!input || store.open) return
    setHostInput(input)
    if (input.value.trim().length >= 2) openOverlay(input, input.value)
  })

  //also catch submits of the header search form while the overlay is closed
  document.addEventListener('submit', e => {
    const form = e.target
    if (adapter.searchFormName && form.name === adapter.searchFormName && store.open) {
      e.preventDefault()
    }
  })
}

function openOverlay(input, val) {
  input.blur() //the overlay has its own input; avoid the page one grabbing keys
  store.q = val
  store.open = true
  if (val.trim().length >= 2) search(false)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
