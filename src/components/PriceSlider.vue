<script setup>
import { ref, computed, watch } from 'vue'
import { store, search } from '../store.js'

//dual-handle range over the facet price bounds. Bounds come from the backend
//with the price dimension's own filter excluded, so they stay stable while
//the user drags. Handles reset when a new query changes the bounds and no
//price filter is active.
const lo = ref(0)
const hi = ref(0)

const bounds = computed(() => store.facets && store.facets.price ? store.facets.price : null)

watch(bounds, b => {
  if (!b) return
  const f = store.filters
  lo.value = f.price_min !== '' ? Number(f.price_min) : b.min
  hi.value = f.price_max !== '' ? Number(f.price_max) : b.max
}, { immediate: true })

function clamp() {
  const b = bounds.value
  lo.value = Math.max(b.min, Math.min(Number(lo.value) || b.min, hi.value))
  hi.value = Math.min(b.max, Math.max(Number(hi.value) || b.max, lo.value))
}

function apply() {
  const b = bounds.value
  clamp()
  store.filters.price_min = lo.value > b.min ? lo.value : ''
  store.filters.price_max = hi.value < b.max ? hi.value : ''
  search(false)
}

const fillStyle = computed(() => {
  const b = bounds.value
  if (!b || b.max <= b.min) return {}
  const p1 = ((lo.value - b.min) / (b.max - b.min)) * 100
  const p2 = ((hi.value - b.min) / (b.max - b.min)) * 100
  return { left: p1 + '%', width: Math.max(0, p2 - p1) + '%' }
})
</script>

<template>
  <div v-if="bounds && bounds.max > bounds.min" class="cito-slider">
    <div class="cito-slider__inputs">
      <input type="number" v-model.number="lo" :min="bounds.min" :max="bounds.max" @change="apply" :aria-label="'min'">
      <span class="cito-slider__dash" aria-hidden="true"></span>
      <input type="number" v-model.number="hi" :min="bounds.min" :max="bounds.max" @change="apply" :aria-label="'max'">
    </div>
    <div class="cito-slider__track-wrap">
      <div class="cito-slider__track"><div class="cito-slider__fill" :style="fillStyle"></div></div>
      <input class="cito-slider__range" type="range" v-model.number="lo"
        :min="bounds.min" :max="bounds.max" @input="clamp" @change="apply">
      <input class="cito-slider__range" type="range" v-model.number="hi"
        :min="bounds.min" :max="bounds.max" @input="clamp" @change="apply">
    </div>
    <div class="cito-slider__bounds"><span>{{ bounds.min }}</span><span>{{ bounds.max }}</span></div>
  </div>
</template>

<style scoped>
.cito-slider__inputs { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.cito-slider__inputs input {
  width: 74px; padding: 6px 8px;
  border: 1px solid var(--line); border-radius: 8px;
  font-size: 13px; font-variant-numeric: tabular-nums;
  color: var(--ink); background: #fff; box-shadow: none;
}
.cito-slider__inputs input:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; border-color: transparent; }
.cito-slider__dash { flex: 0 0 10px; height: 1px; background: var(--muted); }

.cito-slider__track-wrap { position: relative; height: 18px; }
.cito-slider__track {
  position: absolute; top: 7px; left: 0; right: 0; height: 4px;
  background: var(--line); border-radius: 2px;
}
.cito-slider__fill { position: absolute; top: 0; bottom: 0; background: var(--acc); border-radius: 2px; }
.cito-slider__range {
  position: absolute; inset: 0; width: 100%; margin: 0;
  -webkit-appearance: none; appearance: none; background: none;
  pointer-events: none; height: 18px;
}
.cito-slider__range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #fff; border: 2px solid var(--acc);
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
  pointer-events: auto; cursor: grab; margin-top: 1px;
}
.cito-slider__range::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%;
  background: #fff; border: 2px solid var(--acc);
  box-shadow: 0 1px 3px rgba(0,0,0,.2);
  pointer-events: auto; cursor: grab;
}
.cito-slider__range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--acc); outline-offset: 2px; }

.cito-slider__bounds {
  display: flex; justify-content: space-between; margin-top: 4px;
  font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums;
}
</style>
