<script setup>
import { watch, nextTick, ref, computed } from 'vue'
import { store, tr, search, searchDebounced, showMore, resetFilters, hasActiveFilters, setView, useSuggestion, syncHostInput, focusHostInput, applyHash, loadPopular } from './store.js'
import { searchPageUrl, productUrl } from './api.js'
import FacetRail from './components/FacetRail.vue'
import ProductCard from './components/ProductCard.vue'
import AiBlock from './components/AiBlock.vue'
import RecBlock from './components/RecBlock.vue'
import { ai, aiEnabled, ask, dismissAi } from './ai.js'
import { loadRecs, noteSearchOpened } from './recs.js'

const inputEl = ref(null)
const showSku = !!(window.citoParams && window.citoParams.show_sku)

//one history entry per overlay session: pushed on open (so Back closes the
//overlay - the primary close gesture on mobile), consumed on close. Hash
//updates along the way use replaceState on that entry, so leaving it via
//Back also restores the pre-search URL automatically.
let historyArmed = false
let closingFromPop = false
let suppressRestore = false

watch(() => store.open, open => {
  document.documentElement.classList.toggle('cito-overlay-open', open)
  if (open) nextTick(() => inputEl.value && inputEl.value.focus())
  if (open) loadPopular() //popular-searches chips for the empty state (once per page)
  if (open) noteSearchOpened() //this visitor searches: later pages may prefetch the picks
  //personalised picks for the empty state. Deliberately here and not on a page view: the
  //visitor opening the search is the moment they went looking, which is the whole argument
  //for this surface over the popup it replaces (recs.js). Costs nothing without signals.
  if (open) loadRecs()
  if (open && !historyArmed) {
    history.pushState({ cito: 1 }, '')
    historyArmed = true
  } else if (!open && historyArmed) {
    historyArmed = false
    if (closingFromPop) {
      closingFromPop = false //browser already popped our entry
    } else {
      //closed via the UI: consume our entry (restores the pre-search URL);
      //the underlying entry may itself carry our fragment (fresh-load
      //restore) - the popstate below must strip it, not resurrect it
      if (history.state && history.state.cito) {
        suppressRestore = true
        history.back()
      }
    }
  }
})

function stripCitoHash() {
  if (location.hash.indexOf('#cito') === 0) {
    history.replaceState(history.state, '', location.pathname + location.search)
  }
}

window.addEventListener('popstate', () => {
  if (store.open) {
    //Back with the overlay open: this IS the close gesture
    closingFromPop = true
    store.open = false
    syncHostInput()
    stripCitoHash() //a leftover fragment would resurrect the search on refresh
  } else if (suppressRestore) {
    stripCitoHash()
  } else if (applyHash(location.hash)) {
    //arrived at a #cito entry with the overlay closed (in-page link, forward)
    store.open = true
    search(false)
  }
  suppressRestore = false
})

const hasQuery = computed(() => store.q.trim().length >= 2)
//compact = the search bar popped open with nothing to show yet; the panel
//hugs its content and grows to full height once a query runs.
//The empty state survives until the first results REPLACE it: dropping it on the second
//keystroke left a blank moment while the request was still in flight, which reads as
//"it disappeared" rather than "it was replaced" (2.1.9). Only the FIRST handover is gated -
//once a search has completed, further typing keeps the result view, so nothing flips back
//and forth while the visitor edits their query.
const compact = computed(() => !hasQuery.value
  || (!store.searchedQ && !store.items.length && !store.error))
const lastSearches = computed(() => {
  const p = window.citoParams
  return (compact.value && p.show_last_searches && Array.isArray(p.last_searches))
    ? p.last_searches.filter(s => s && String(s).trim().length >= 2).slice(0, 8)
    : []
})
//shop-wide popular searches, empty state only (while typing the query-scoped
//"others searched" chips take over)
const popularSearches = computed(() => (compact.value ? store.popular : []))
//recently viewed products (setting show_recently_viewed; tracked in store.js from
//citoParams.page_product), empty state only - a re-entry aid, not merchandising.
//Deliberately only 4: the row must fit without a sideways scroll (see the --wrap
//modifier below) - chips hidden behind a horizontal scroll in a search overlay are
//never seen, they only eat width and attention.
const recentViews = computed(() => (compact.value ? store.recent.slice(0, 4) : []))
//settled = the visible result set answers the query as currently typed; while the
//visitor keeps typing (debounce window) or a request is in flight, the stale empty
//state / "no exact matches" / "results for" banners must not flash with the new text
const settled = computed(() => store.searchedQ === store.q.trim())
const showEmpty = computed(() => hasQuery.value && !store.loading && !store.items.length && !store.error
  && settled.value)
//also while a filter is ACTIVE with an empty facet set (semantic rescue under a filter
//returns no facet values): the rail is then the only place to undo it (2.4.2)
const railVisible = computed(() => !!store.facets
  && ((store.facets.categories && store.facets.categories.length)
    || (store.facets.brands && store.facets.brands.length)
    || (store.facets.features && store.facets.features.length)
    || store.facets.price
    || hasActiveFilters()))

function close() {
  dismissAi() //the answer belongs to this overlay session, not the next one
  store.open = false
  syncHostInput() //leave the query visible in the page's own search box
}

let lastQ = ''
function onInput() {
  if (store.q.trim() !== lastQ) {
    lastQ = store.q.trim()
    store.offset = 0
  }
  searchDebounced()
}

//keyboard: arrows walk the results, Enter opens the selected product
//(or the full results page when nothing is selected), Esc peels back
const selected = ref(-1)
watch(() => store.items, () => { selected.value = -1 })

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (store.railOpen) store.railOpen = false
    else close()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const n = store.items.length
    if (!n) return
    e.preventDefault()
    selected.value = e.key === 'ArrowDown' ? (selected.value + 1) % n : (selected.value - 1 + n) % n
    nextTick(() => {
      const el = document.querySelectorAll('#cito_overlay_root .cito-grid .cito-card')[selected.value]
      if (el) el.scrollIntoView({ block: 'nearest' })
    })
    return
  }
  if (e.key === 'Enter') {
    if (selected.value >= 0 && store.items[selected.value]) {
      window.location.href = productUrl(store.items[selected.value])
    } else if (hasQuery.value) {
      window.location.href = searchPageUrl(store.q.trim())
    }
  }
}

const filterCount = computed(() => {
  const f = store.filters
  return f.category_ids.length + f.brands.length + (f.in_stock ? 1 : 0)
    + ((f.price_min !== '' || f.price_max !== '') ? 1 : 0)
    + Object.values(f.features || {}).reduce((n, ids) => n + ids.length, 0)
})

//no UI turns precision ON any more (the header switch is gone): it survives only
//for a deep link that carries strict=1, which is why the escape hatch below stays
function turnOffStrict() {
  store.strict = false
  search(false)
}

function clearQuery() {
  dismissAi()
  store.q = ''
  resetFilters()
  store.items = []; store.total = 0; store.facets = null; store.facetsQ = ''; store.semantic = false; store.suggestions = []; store.correction = null; store.correctedQ = ''; store.searchedQ = ''
  //panel collapses to its compact form (via `compact`); keep typing here
  inputEl.value && inputEl.value.focus()
}

function resetAll() {
  resetFilters()
  search(false)
}

function canShowMore() {
  //correctedQ: paging re-runs the ORIGINAL (typo) query, whose corrected retry is
  //skipped on offset>0 - "show more" would be a dead button; see-all covers the rest
  return !store.semantic && !store.correctedQ && store.items.length < store.total && !store.loading
}

//existing addon translation 'Did you mean [value]' - render [value] as the link
const dymParts = computed(() => {
  const parts = tr('cito.did_you_mean').split('[value]')
  return { prefix: parts[0] || '', suffix: parts[1] || '' }
})
</script>

<template>
  <div v-if="store.open" class="cito-overlay" :style="{ '--acc': store.accent }" @keydown="onKeydown">
    <div class="cito-overlay__backdrop" @click="close"></div>
    <div class="cito-overlay__panel" :class="{ 'cito-overlay__panel--compact': compact }">

      <header class="cito-head">
        <div class="cito-head__box">
          <svg class="cito-head__icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><line x1="13.5" y1="13.5" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input ref="inputEl" v-model="store.q" class="cito-head__input"
            type="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"
            @input="onInput">
          <button v-if="store.q" class="cito-head__clear" type="button" :aria-label="tr('cito.clear')" @click="clearQuery">&times;</button>
          <!-- inside the field on purpose: on phones .cito-head__box becomes its own full
               width row, so desktop and the full-screen mobile overlay get the same DOM at
               the same place - no floating button, no host-theme CSS to fight -->
          <button v-if="aiEnabled() && hasQuery" type="button" class="cito-head__ai"
            :aria-label="tr('cito.assist_ask')" :title="tr('cito.assist_ask')"
            @click="ask(store.q.trim())">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"/>
            </svg>
            <span class="cito-head__ai-label">{{ tr('cito.assist_label') }}</span>
          </button>
        </div>

        <div class="cito-viewswitch" role="group">
          <button type="button" :class="{ on: store.view === 'grid' }" :aria-label="tr('cito.view_grid')" @click="setView('grid')">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
          </button>
          <button type="button" :class="{ on: store.view === 'list' }" :aria-label="tr('cito.view_list')" @click="setView('list')">
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="3" rx="1"/><rect x="1" y="12" width="14" height="3" rx="1"/></svg>
          </button>
        </div>

        <button class="cito-head__close" type="button" :aria-label="tr('cito.close')" @click="close">
          <svg viewBox="0 0 16 16" aria-hidden="true"><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="2" x2="2" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </header>

      <div class="cito-sweep" aria-hidden="true"><div v-if="store.loading" class="cito-sweep__bar"></div></div>

      <!-- an offer for the moment before a query exists; once one does, it collapses to a
           single line instead of vanishing (RecBlock handles both states).
           Until 2.1.11 the line required the picks to have been SEEN in the empty state
           first, to keep it from reading as a new interruption. That condition turned out
           to hide the surface from the people it is for: most visitors type immediately,
           the answer takes ~2s, so they never reach the empty state at all and the feature
           was invisible to them (reported 2026-08-18 - Lorenz could not trigger it himself
           while 28 visitors a day did). One labelled line above the results is not an
           interruption, and it stays honest: the strip logs no impression, only expanding
           it does. -->
      <RecBlock :collapsed="!compact" />

      <div v-if="store.suggestions.length && hasQuery" class="cito-chips">
        <span class="cito-chips__label">{{ tr('cito.other_users_searched') }}</span>
        <button v-for="s in store.suggestions" :key="s" type="button" class="cito-chip" @click="useSuggestion(s)">{{ s }}</button>
      </div>

      <div v-if="lastSearches.length" class="cito-chips cito-chips--compact">
        <span class="cito-chips__label">{{ tr('cito.last_searches') }}</span>
        <button v-for="s in lastSearches" :key="s" type="button" class="cito-chip" @click="useSuggestion(s)">{{ s }}</button>
      </div>

      <div v-if="popularSearches.length" class="cito-chips cito-chips--compact">
        <span class="cito-chips__label">{{ tr('cito.other_users_searched') }}</span>
        <button v-for="s in popularSearches" :key="s" type="button" class="cito-chip" @click="useSuggestion(s)">{{ s }}</button>
      </div>

      <div v-if="recentViews.length" class="cito-chips cito-chips--compact">
        <span class="cito-chips__label">{{ tr('cito.recently_viewed') }}</span>
        <a v-for="v in recentViews" :key="v.id" class="cito-chip cito-chip--product" :href="v.u || undefined">
          <img v-if="v.i" :src="v.i" alt="" loading="lazy" />
          <span class="cito-chip__name">{{ v.n }}</span>
        </a>
      </div>

      <div v-if="!compact || ai.open" class="cito-body">
        <FacetRail v-if="railVisible" />

        <main class="cito-main" :class="{ 'cito-main--semantic': store.semantic }">
          <AiBlock />

          <p v-if="store.error" class="cito-error">{{ store.error }}</p>

          <p v-if="store.correction" class="cito-dym">
            {{ dymParts.prefix }}<button type="button" class="cito-dym__link" @click="useSuggestion(store.correction.q)">{{ store.correction.q }}</button>{{ dymParts.suffix }}
            <span class="cito-dym__count">({{ store.correction.count }})</span>
          </p>

          <div v-if="store.semantic && settled" class="cito-banner">
            <svg class="cito-banner__icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l1.8 4.6L16.5 8l-4.7 1.4L10 14l-1.8-4.6L3.5 8l4.7-1.4L10 2z" fill="currentColor"/><circle cx="16" cy="15" r="1.6" fill="currentColor"/><circle cx="4.5" cy="15.5" r="1.1" fill="currentColor"/></svg>
            <span>{{ tr('cito.similar_for', { q: store.semanticQ }) }}</span>
          </div>
          <div v-else-if="store.correctedQ && settled" class="cito-banner">
            <svg class="cito-banner__icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 11l4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>{{ tr('cito.results_for', { q: store.correctedQ }) }}</span>
          </div>
          <p v-if="!store.semantic && store.total" class="cito-total">
            {{ tr('cito.found_products', { n: store.total }) }}
            <span aria-hidden="true">·</span>
            <a class="cito-total__all" :href="searchPageUrl(store.q.trim())">{{ tr('cito.see_all') }}</a>
          </p>

          <button v-if="railVisible" type="button" class="cito-filtersbtn" @click="store.railOpen = true">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3h14M4 8h8M6 13h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>
            {{ tr('cito.filters') }}<span v-if="filterCount" class="cito-filtersbtn__badge">{{ filterCount }}</span>
          </button>
          <!-- filters active but no rail to change them in (no facets at all: a response
               without them on a new query, a restored #cito hash): the visitor must still
               be able to undo them (2.4.2) -->
          <button v-if="!railVisible && hasActiveFilters()" type="button" class="cito-ghost cito-resetbtn" @click="resetAll">
            {{ tr('cito.reset_filters') }} ({{ filterCount }})
          </button>

          <div v-if="showEmpty" class="cito-empty">
            <p class="cito-empty__title">{{ tr('cito.empty', { q: store.q.trim() }) }}</p>
            <p class="cito-empty__hint">{{ store.strict ? tr('cito.empty_hint_strict') : tr('cito.empty_hint') }}</p>
            <div class="cito-empty__actions">
              <button v-if="store.strict" type="button" class="cito-ghost" @click="turnOffStrict">{{ tr('cito.empty_turn_off_precision') }}</button>
              <button v-if="hasActiveFilters()" type="button" class="cito-ghost" @click="resetAll">{{ tr('cito.reset_filters') }}</button>
            </div>
          </div>

          <div class="cito-grid" :class="'cito-grid--' + store.view">
            <ProductCard v-for="(item, i) in store.items" :key="item.product_id" :item="item" :view="store.view" :show-sku="showSku" :selected="i === selected" />
          </div>

          <div v-if="canShowMore()" class="cito-more">
            <button type="button" @click="showMore">{{ tr('cito.show_more') }}</button>
          </div>
        </main>
      </div>

    </div>
  </div>
</template>

<style>
/* unscoped on purpose: body scroll lock while the overlay is open */
html.cito-overlay-open, html.cito-overlay-open body { overflow: hidden !important; }

/* Host-theme padding reset. Shop themes style the bare `button` element - WordPress
   Storefront ships `button { padding: .618em 1.41575em }` - and our buttons size
   themselves (fixed width/height, border-box), so a leaked padding eats the whole
   content box and clips the icon inside it to zero width. Unscoped on purpose: with no
   [data-v] attribute this stays at specificity (0,1,1), under every scoped `.cito-*`
   rule, so the buttons that DO set their own padding keep it whatever the source order. */
.cito-overlay button { padding: 0; }

/* ...and the theme's focus ring. Storefront paints `button:focus { outline: 2px solid
   #7f54b3 }` - plain :focus, so it fires on a MOUSE click too - and the view switch's
   `overflow: hidden` clips that ring down to a violet sliver along the button's inner
   edge. Suppressed at (0,2,1), which stays under our own `:focus-visible` ring at
   (0,3,0), so keyboard focus is still shown (in --acc) and only the mouse-click
   artefact goes away. */
.cito-overlay :is(a, button, input, textarea, select):focus { outline: none; }
</style>

<style scoped>
.cito-overlay {
  /* token system; --acc is sampled from the host theme in main.js */
  --acc-ink: color-mix(in srgb, var(--acc), #000 30%);
  --acc-soft: color-mix(in srgb, var(--acc), #fff 92%);
  --ink: #1b1b1f;
  --muted: #6e6e76;
  --line: #e9e9ec;
  --soft: #f6f6f8;

  position: fixed; inset: 0; z-index: 10000;
  display: flex; justify-content: center;
  color: var(--ink);
  font-size: 14px; line-height: 1.35;
}
.cito-overlay :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
/* ...except the result cards. They sit flush against `.cito-main`, which asks only for
   `overflow-y: auto` - and a box with a non-visible overflow on one axis computes the
   other to `auto` too, so it clips horizontally as well. The 2px-offset ring is drawn
   outside the card's box and the leftmost (in list view: every) card loses its ring on
   the container edge. Drawn inside instead: same ring, nothing to clip. Specificity
   (0,4,0) so it beats the generic rule above whatever order the chunks land in. */
.cito-grid .cito-card:focus-visible { outline-offset: -2px; }

.cito-overlay__backdrop { position: absolute; inset: 0; background: rgba(20, 20, 24, .55); }
.cito-overlay__panel {
  position: relative;
  width: min(1400px, 100%);
  height: 100%;
  background: #fff;
  display: flex; flex-direction: column;
  box-shadow: 0 0 60px rgba(0, 0, 0, .35);
  animation: cito-in .15s ease-out;
}
/* nothing to show yet: the panel is just the search bar (+ last searches) */
.cito-overlay__panel--compact {
  height: auto;
  max-height: 100%;
  align-self: flex-start; /* the flex parent would otherwise stretch it full-height */
  border-radius: 0 0 16px 16px;
  padding-bottom: 14px;
}
@keyframes cito-in { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) {
  .cito-overlay__panel { animation: none; }
}

/* ---- header ---- */
.cito-head { display: flex; align-items: center; gap: 20px; padding: 16px 24px 14px; }
.cito-head__box { position: relative; flex: 1; max-width: 620px; }
.cito-head__icon {
  position: absolute; left: 15px; top: 50%; width: 17px; height: 17px;
  transform: translateY(-50%); color: var(--muted); pointer-events: none;
}
.cito-head__input {
  width: 100%; padding: 11px 40px 11px 42px;
  border: 1.5px solid var(--line); border-radius: 12px;
  font-size: 16px; color: var(--ink); background: var(--soft);
  /* themes put an inset shadow on every text input (Storefront does) - the field
     then reads as sunken next to the flat cards */
  box-shadow: none; -webkit-appearance: none; appearance: none;
  transition: border-color .12s, background .12s;
}
.cito-head__input:focus { border-color: var(--acc); background: #fff; outline: none; }
.cito-head__clear {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px; border-radius: 50%;
  background: none; border: none; font-size: 18px; line-height: 1;
  color: var(--muted); cursor: pointer;
}
.cito-head__clear:hover { background: var(--line); color: var(--ink); }
/* AI entry, inside the field. The clear button shifts left when both are present -
   .cito-head__box:has() keeps that in CSS instead of a class on the input */
.cito-head__ai {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 11px; border-radius: 9px; cursor: pointer;
  border: 1px solid #d9c9f8; background: #f1ebfd; color: #6d28d9;
  font-size: 13px; font-weight: 600; white-space: nowrap;
  transition: background .12s, border-color .12s;
}
.cito-head__ai:hover { background: #e6dbfb; border-color: #c4adf3; }
/* the label is the discoverability bet: this button is the ONLY entry to the assistant,
   and a bare sparkle is not self-explanatory. Dropped on narrow viewports, where the
   field itself is the whole row and every pixel of typing space counts */
.cito-head__ai-label { display: none; }
@media (min-width: 620px) { .cito-head__ai-label { display: inline; } }
/* the clear button steps aside for it; the input keeps its text clear of both */
.cito-head__box:has(.cito-head__ai) .cito-head__input { padding-right: 58px; }
.cito-head__box:has(.cito-head__ai) .cito-head__clear { right: 46px; }
@media (min-width: 620px) {
  .cito-head__box:has(.cito-head__ai) .cito-head__input { padding-right: 148px; }
  .cito-head__box:has(.cito-head__ai) .cito-head__clear { right: 136px; }
}

/* view switch */
.cito-viewswitch { display: flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.cito-viewswitch button {
  width: 34px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: #fff; border: none; cursor: pointer; color: var(--muted);
}
.cito-viewswitch button + button { border-left: 1px solid var(--line); }
.cito-viewswitch button svg { width: 14px; height: 14px; fill: currentColor; }
.cito-viewswitch button.on { background: var(--soft); color: var(--ink); }

.cito-head__close {
  margin-left: auto; width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; color: var(--ink); cursor: pointer;
}
.cito-head__close svg { width: 14px; height: 14px; }
.cito-head__close:hover { background: var(--soft); }

/* loading sweep: the only loading indicator, honest about a fast engine */
.cito-sweep { height: 2px; background: var(--line); position: relative; overflow: hidden; flex: none; }
.cito-overlay__panel--compact .cito-sweep { background: transparent; }
.cito-sweep__bar {
  position: absolute; top: 0; bottom: 0; width: 30%;
  background: var(--acc);
  animation: cito-sweep .8s ease-in-out infinite;
}
@keyframes cito-sweep { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) {
  .cito-sweep__bar { animation: none; width: 100%; opacity: .5; }
}

/* chips */
/* chip rows WRAP, they never scroll sideways: three stacked scrollbars looked
   broken on phones, and chips parked off-screen are never seen anyway */
.cito-chips {
  display: flex; align-items: center; gap: 8px; row-gap: 6px;
  padding: 12px 24px 0; flex-wrap: wrap; flex: none;
}
.cito-chips__label {
  font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--muted); flex: none;
}
.cito-chip {
  padding: 5px 13px; border: 1px solid var(--line); border-radius: 15px;
  background: #fff; font-size: 13px; color: var(--ink);
  cursor: pointer; white-space: nowrap; flex: none;
}
.cito-chip:hover { border-color: var(--acc); color: var(--acc-ink); }
/* recently viewed: chips carrying a product thumbnail */
.cito-chip--product {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 3px 12px 3px 3px; text-decoration: none;
}
.cito-chip--product img {
  width: 26px; height: 26px; border-radius: 50%;
  object-fit: contain; background: #f4f4f6; flex: none;
}
.cito-chip--product .cito-chip__name {
  max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---- body ---- */
.cito-body { display: flex; flex: 1; min-height: 0; padding: 16px 24px; gap: 28px; }
.cito-main { flex: 1; overflow-y: auto; min-width: 0; padding-bottom: 8px; }
.cito-total { color: var(--muted); margin: 2px 0 14px; font-size: 13px; }
.cito-total__all { color: var(--acc-ink); text-decoration: underline; text-underline-offset: 2px; }

/* mobile-only entry to the filter drawer */
.cito-filtersbtn {
  display: none;
  align-items: center; gap: 7px;
  padding: 8px 16px; margin: 0 0 12px;
  border: 1px solid var(--line); border-radius: 10px;
  background: #fff; font-size: 13px; color: var(--ink); cursor: pointer;
}
.cito-filtersbtn svg { width: 14px; height: 14px; }
.cito-filtersbtn__badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--acc); color: #fff; font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
@media (max-width: 767px) {
  .cito-filtersbtn { display: inline-flex; }
}
.cito-resetbtn { margin: 0 0 12px; }
.cito-error { color: #b3261e; }

/* did you mean: one actionable line, the corrected term is the only accent */
.cito-dym { margin: 2px 0 10px; font-size: 13.5px; color: var(--ink); }
.cito-dym__link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: inherit; font-weight: 600;
  color: var(--acc-ink); text-decoration: underline; text-underline-offset: 2px;
}
.cito-dym__count { color: var(--muted); font-size: 12px; }

/* the rescue register: results are honest about being similar, not exact */
.cito-banner {
  display: flex; align-items: center; gap: 10px;
  background: var(--acc-soft); color: var(--acc-ink);
  border-radius: 10px; padding: 11px 14px; margin: 2px 0 16px;
  font-size: 13.5px;
}
.cito-banner__icon { width: 18px; height: 18px; flex: none; }

/* empty state gives direction, not mood */
.cito-empty { padding: 40px 0 24px; max-width: 420px; }
/* the 40px assumes the empty state stands alone in the panel. With the AI block above it
   that gap reads as a hole between the answer and the "nothing matches" line. :has() on
   the container, not a sibling combinator - the banners between them come and go */
.cito-main:has(.cito-ai) .cito-empty { padding-top: 6px; }
.cito-empty__title { font-size: 17px; font-weight: 600; margin: 0 0 6px; }
.cito-empty__hint { color: var(--muted); margin: 0 0 16px; }
.cito-empty__actions { display: flex; gap: 10px; }
.cito-ghost {
  padding: 8px 16px; border: 1px solid var(--line); border-radius: 10px;
  background: #fff; font-size: 13px; color: var(--ink); cursor: pointer;
}
.cito-ghost:hover { border-color: var(--acc); color: var(--acc-ink); }

.cito-grid--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}
.cito-grid--list { display: flex; flex-direction: column; gap: 4px; }

.cito-more { text-align: center; padding: 22px 0 10px; }
.cito-more button {
  padding: 10px 28px; border: 1px solid var(--line); border-radius: 22px;
  background: #fff; cursor: pointer; font-size: 14px; color: var(--ink);
}
.cito-more button:hover { border-color: var(--acc); color: var(--acc-ink); }

@media (max-width: 767px) {
  /* ONE header row on phones instead of two (2.1.1). The second row carried the
     grid/list switch and the close button and cost 48px of every phone screen -
     about half a product row, on the device with the least room. The switcher goes:
     there is a per-device default (default_view_mobile) and nobody toggles the view
     twice. The close button moves up beside the field, which is where a fullscreen
     layer's close is expected anyway. Tablets keep the switcher (this query stops at
     767px), where the width is free. */
  .cito-head { flex-wrap: nowrap; padding: 12px 14px 10px; gap: 8px; }
  .cito-head__box { flex: 1 1 auto; min-width: 0; max-width: none; order: -1; }
  .cito-viewswitch { display: none; }
  /* keep the 36px target: the field's own buttons (AI, clear) sit inside its right
     edge, so shrinking this one would put three small targets in a row */
  .cito-head__close { flex: none; margin-left: 0; }
  .cito-body { padding: 12px 14px; gap: 0; } /* the rail leaves the flow (drawer) */
  .cito-chips { padding: 10px 14px 0; }
  /* label onto its own line: inline it ate nearly half the width of a phone */
  .cito-chips__label { width: 100%; }
  /* and cap each row at 4 chips (child 1 is the label) so a block stays short */
  .cito-chips > :nth-child(n+6) { display: none; }
}
</style>
