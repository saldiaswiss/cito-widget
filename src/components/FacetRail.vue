<script setup>
import { reactive } from 'vue'
import { store, tr, search, resetFilters, hasActiveFilters } from '../store.js'
import PriceSlider from './PriceSlider.vue'

//long value lists (a brand-heavy search on one shop listed 25+ brands) collapse to the
//first 10 plus a localized "see all" line; categories deliberately stay FULL - they
//are the primary navigation. Purely client-side. A SELECTED value below the fold is
//always kept visible, so an active filter can never hide from its own list.
const SHOW_COLLAPSED = 10
const expandedGroups = reactive({})
function visibleValues(key, list, isSelected) {
  if (expandedGroups[key] || list.length <= SHOW_COLLAPSED) return list
  const head = list.slice(0, SHOW_COLLAPSED)
  for (const v of list.slice(SHOW_COLLAPSED)) if (isSelected(v)) head.push(v)
  return head
}
function collapsed(key, list) {
  return !expandedGroups[key] && list.length > SHOW_COLLAPSED
}

function shortCategory(path) {
  if (!path) return ''
  const parts = String(path).split(' / ')
  return parts[parts.length - 1]
}

function toggleCategory(id) {
  const ids = store.filters.category_ids
  const i = ids.indexOf(id)
  i === -1 ? ids.push(id) : ids.splice(i, 1)
  search(false)
}

function toggleBrand(brand) {
  const brands = store.filters.brands
  const i = brands.indexOf(brand)
  i === -1 ? brands.push(brand) : brands.splice(i, 1)
  search(false)
}

function toggleStock() {
  store.filters.in_stock = !store.filters.in_stock
  search(false)
}

//feature filters: one entry per feature_id, holding the chosen variant ids. Only
//values present in the current result set are ever offered (the server counts them
//over the same match as the results) - same rule as categories and brands.
function toggleFeature(fid, id) {
  const map = store.filters.features
  const ids = map[fid] || (map[fid] = [])
  const i = ids.indexOf(id)
  i === -1 ? ids.push(id) : ids.splice(i, 1)
  if (!ids.length) delete map[fid]
  search(false)
}
function featureChecked(fid, id) {
  return (store.filters.features[fid] || []).includes(id)
}

function reset() {
  resetFilters()
  search(false)
}
</script>

<template>
  <aside class="cito-rail" :class="{ 'cito-rail--open': store.railOpen }">
    <div class="cito-rail__mhead">
      <strong>{{ tr('cito.filters') }}</strong>
      <!-- the desktop head (with its reset link) is hidden in the drawer, so the drawer
           needs its own way out of a filter (2.4.2) -->
      <button v-if="hasActiveFilters()" type="button" class="cito-rail__mreset" @click="reset">{{ tr('cito.reset_filters') }}</button>
      <button type="button" class="cito-rail__mclose" :aria-label="tr('cito.close')" @click="store.railOpen = false">&times;</button>
    </div>

    <div class="cito-rail__head">
      <span class="cito-rail__eyebrow">{{ tr('cito.filters') }}</span>
      <button v-if="hasActiveFilters()" class="cito-rail__reset" type="button" @click="reset">{{ tr('cito.reset_filters') }}</button>
    </div>

    <section v-if="store.facets.categories && store.facets.categories.length" class="cito-rail__group">
      <span class="cito-rail__eyebrow">{{ tr('cito.categories') }}</span>
      <label v-for="c in store.facets.categories" :key="c.category_id" class="cito-rail__item" :title="c.category">
        <input type="checkbox"
          :checked="store.filters.category_ids.includes(Number(c.category_id))"
          @change="toggleCategory(Number(c.category_id))">
        <span class="cito-rail__box" aria-hidden="true"></span>
        <span class="cito-rail__label">{{ shortCategory(c.category) }}</span>
        <span class="cito-rail__count">{{ c.cnt }}</span>
      </label>
    </section>

    <section v-if="store.facets.brands && store.facets.brands.length" class="cito-rail__group">
      <span class="cito-rail__eyebrow">{{ tr('cito.brands') }}</span>
      <label v-for="b in visibleValues('b', store.facets.brands, x => store.filters.brands.includes(x.brand))"
        :key="b.brand" class="cito-rail__item">
        <input type="checkbox"
          :checked="store.filters.brands.includes(b.brand)"
          @change="toggleBrand(b.brand)">
        <span class="cito-rail__box" aria-hidden="true"></span>
        <span class="cito-rail__label">{{ b.brand }}</span>
        <span class="cito-rail__count">{{ b.cnt }}</span>
      </label>
      <button v-if="collapsed('b', store.facets.brands)" type="button" class="cito-rail__more"
        @click="expandedGroups['b'] = true">{{ tr('cito.see_all') }} ({{ store.facets.brands.length }})</button>
    </section>

    <section v-for="ft in (store.facets.features || [])" :key="ft.feature_id" class="cito-rail__group">
      <span class="cito-rail__eyebrow">{{ ft.feature }}</span>
      <label v-for="v in visibleValues('f' + ft.feature_id, ft.values, x => featureChecked(ft.feature_id, x.id))"
        :key="v.id" class="cito-rail__item" :title="v.variant">
        <input type="checkbox"
          :checked="featureChecked(ft.feature_id, v.id)"
          @change="toggleFeature(ft.feature_id, v.id)">
        <span class="cito-rail__box" aria-hidden="true"></span>
        <span class="cito-rail__label">{{ v.variant }}</span>
        <span class="cito-rail__count">{{ v.cnt }}</span>
      </label>
      <button v-if="collapsed('f' + ft.feature_id, ft.values)" type="button" class="cito-rail__more"
        @click="expandedGroups['f' + ft.feature_id] = true">{{ tr('cito.see_all') }} ({{ ft.values.length }})</button>
    </section>

    <!-- same condition as PriceSlider's own v-if: a result set whose products all cost
         the same (one hit, or one price) has no range to drag, and an eyebrow with
         nothing under it made the standalone stock toggle below read as a price option -->
    <section v-if="store.facets.price && store.facets.price.max > store.facets.price.min" class="cito-rail__group">
      <span class="cito-rail__eyebrow">{{ tr('cito.price') }}</span>
      <PriceSlider />
    </section>

    <section class="cito-rail__group">
      <label class="cito-rail__item">
        <input type="checkbox" :checked="store.filters.in_stock" @change="toggleStock">
        <span class="cito-rail__box" aria-hidden="true"></span>
        <span class="cito-rail__label">{{ tr('cito.in_stock_only') }}</span>
      </label>
    </section>

    <button type="button" class="cito-rail__apply" @click="store.railOpen = false">
      {{ tr('cito.show_products', { n: store.total }) }}
    </button>
  </aside>
</template>

<style scoped>
.cito-rail { width: 236px; min-width: 236px; overflow-y: auto; padding: 2px 14px 12px 2px; }
.cito-rail__head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line);
}
.cito-rail__eyebrow {
  display: block; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
  margin-bottom: 8px;
}
.cito-rail__head .cito-rail__eyebrow { margin-bottom: 0; color: var(--ink); }
.cito-rail__reset {
  background: none; border: none; padding: 0;
  color: var(--acc-ink); cursor: pointer; font-size: 12px;
}
.cito-rail__reset:hover { text-decoration: underline; }
.cito-rail__more {
  background: none; border: none; padding: 4px 0 0 25px;
  color: var(--acc-ink); cursor: pointer; font-size: 12px; text-align: left;
}
.cito-rail__more:hover { text-decoration: underline; }

.cito-rail__group { margin-bottom: 20px; }

.cito-rail__item {
  display: flex; align-items: center; gap: 9px;
  padding: 4px 0; cursor: pointer; font-size: 13px;
}
/* !important: shop themes restyle native checkboxes with higher specificity
   (one shop's theme: body[class*="screen"] input[type="checkbox"] { appearance:none; width:22px; ... })
   which resurrects this deliberately-hidden input and indents the whole row */
.cito-rail__item input { position: absolute !important; opacity: 0 !important; width: 1px !important; height: 1px !important; margin: 0 !important; }
.cito-rail__box {
  flex: none; width: 16px; height: 16px;
  border: 1.5px solid #cfcfd6; border-radius: 5px; background: #fff;
  transition: background .1s, border-color .1s;
  position: relative;
}
.cito-rail__item input:checked + .cito-rail__box { background: var(--acc); border-color: var(--acc); }
.cito-rail__item input:checked + .cito-rail__box::after {
  content: ''; position: absolute; left: 4px; top: 1px;
  width: 4px; height: 8px;
  border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
}
.cito-rail__item input:focus-visible + .cito-rail__box { outline: 2px solid var(--acc); outline-offset: 2px; }
.cito-rail__item:hover .cito-rail__box { border-color: var(--acc); }

.cito-rail__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.cito-rail__count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

/* mobile drawer chrome, hidden on desktop */
.cito-rail__mhead, .cito-rail__apply { display: none; }

@media (max-width: 767px) {
  .cito-rail {
    position: fixed; inset: 0; z-index: 20;
    width: auto; min-width: 0;
    background: #fff; padding: 0 16px 16px;
    transform: translateX(-100%);
    transition: transform .2s ease-out;
    display: flex; flex-direction: column;
  }
  .cito-rail--open { transform: none; }
  @media (prefers-reduced-motion: reduce) {
    .cito-rail { transition: none; }
  }
  .cito-rail__head { display: none; } /* replaced by the drawer header */
  .cito-rail__mhead {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 0 10px; margin-bottom: 12px;
    border-bottom: 1px solid var(--line);
    font-size: 15px;
  }
  .cito-rail__mreset {
    margin-left: auto; margin-right: 6px; padding: 4px 0;
    background: none; border: none; cursor: pointer;
    color: var(--acc-ink); font-size: 12px;
  }
  .cito-rail__mclose {
    width: 32px; height: 32px; border-radius: 50%;
    background: none; border: none; font-size: 24px; line-height: 1;
    color: var(--ink); cursor: pointer;
  }
  .cito-rail__apply {
    display: block;
    position: sticky; bottom: 8px; /* visible while the filter list scrolls */
    margin-top: auto;
    padding: 12px; border: none; border-radius: 12px;
    background: var(--acc); color: #fff;
    font-size: 14px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.18);
  }
}
</style>
