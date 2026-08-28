<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { productUrl, fetchImage, trackClick } from '../api.js'
import { tr, store } from '../store.js'

const props = defineProps({
  item: { type: Object, required: true },
  view: { type: String, default: 'grid' },
  showSku: { type: Boolean, default: true },
  selected: { type: Boolean, default: false }, // keyboard navigation highlight
})

//`stock` is the TOTAL (own shelf + supplier), `stock_ext` the supplier share - so nothing
//of it is ours exactly when the supplier share covers the whole amount. Written as >= on
//purpose: stock_reserve can push the own part negative, and a product with -2 own and 5 at
//the supplier is still a supplier product. Missing stock_ext (unmigrated table) = 0 = the
//old two-state behaviour.
const supplierOnly = computed(() => {
  const ext = Number(props.item.stock_ext || 0)
  return ext > 0 && ext >= Number(props.item.stock || 0)
})

//images are often missing from the index (thumbnails are generated lazily by the
//shop); load them via cito.image only when the card scrolls into view
const imgSrc = ref(props.item.image || '')
const noImage = ref(false)
const cardEl = ref(null)
let observer = null
let triedFallback = false

function loadFallback() {
  if (triedFallback) { noImage.value = true; return }
  triedFallback = true
  fetchImage(props.item.product_id).then(src => {
    if (src) imgSrc.value = src
    else noImage.value = true
  })
}

onMounted(() => {
  if (imgSrc.value) return
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) {
      observer.disconnect()
      observer = null
      loadFallback()
    }
  }, { root: null, rootMargin: '200px' })
  observer.observe(cardEl.value)
})
onBeforeUnmount(() => { if (observer) observer.disconnect() })
</script>

<template>
  <a ref="cardEl" class="cito-card" :class="['cito-card--' + view, { 'cito-card--selected': selected }]" :href="productUrl(item)"
     @click="trackClick(store.q, item.product_id, 'click')">
    <span class="cito-card__img">
      <img v-if="imgSrc && !noImage" :src="imgSrc" loading="lazy" :alt="item.name" @error="loadFallback">
      <span v-else class="cito-card__noimg"></span>
    </span>
    <span class="cito-card__info">
      <small v-if="item.brand" class="cito-card__brand">{{ item.brand }}</small>
      <span class="cito-card__name">{{ item.name }}</span>
      <small v-if="showSku && item.product_code" class="cito-card__sku">{{ item.product_code }}</small>
      <span class="cito-card__foot">
        <span v-if="item.display_price" class="cito-card__price">{{ item.display_price }}</span>
        <!-- three states, not two: a product whose whole stock sits at the supplier used to
             claim "in stock" here while its own detail page said "in stock at the supplier,
             delivery approx. 3 working days" (customer report, a shop, 2026-08-14). The
             index now carries the supplier share separately; stock_ext is absent on tables
             that have not been migrated, and then this behaves exactly as before. -->
        <span v-if="Number(item.stock) > 0" class="cito-card__stock"
          :class="{ 'cito-card__stock--ext': supplierOnly }">
          <i aria-hidden="true"></i>{{ supplierOnly ? tr('cito.in_stock_supplier') : tr('cito.in_stock') }}
        </span>
      </span>
    </span>
  </a>
</template>

<style scoped>
.cito-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-decoration: none;
  color: var(--ink);
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 10px;
  transition: border-color .12s, box-shadow .12s;
}
.cito-card:hover { border-color: var(--line); box-shadow: 0 4px 18px rgba(0,0,0,.07); }
.cito-card--selected { border-color: var(--acc); box-shadow: 0 4px 18px rgba(0,0,0,.07); }
.cito-card__img {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  background: var(--soft);
  border-radius: 9px;
  overflow: hidden;
}
.cito-card__img img {
  max-width: 100%; max-height: 100%; object-fit: contain; mix-blend-mode: multiply;
  transition: transform .15s ease-out;
}
.cito-card:hover .cito-card__img img { transform: scale(1.03); }
@media (prefers-reduced-motion: reduce) {
  .cito-card__img img { transition: none; }
  .cito-card:hover .cito-card__img img { transform: none; }
}
.cito-card__noimg { width: 34%; aspect-ratio: 1; background: var(--line); border-radius: 8px; }
.cito-card__info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cito-card__brand {
  font-size: 11px; font-weight: 600; color: var(--muted);
  text-transform: uppercase; letter-spacing: .06em;
}
.cito-card__name {
  font-size: 14px; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cito-card__sku { color: var(--muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.cito-card__foot { display: flex; align-items: baseline; gap: 10px; margin-top: 3px; }
.cito-card__price { font-weight: 650; font-size: 15px; font-variant-numeric: tabular-nums; }
.cito-card__stock { display: inline-flex; align-items: center; gap: 5px; color: #2e7d32; font-size: 12px; }
.cito-card__stock i { width: 6px; height: 6px; border-radius: 50%; background: #2e7d32; }
/* available, but not from our own shelf: amber rather than green, so the two states are
   distinguishable at a glance and not only by reading the label */
.cito-card__stock--ext { color: #b26a00; }
.cito-card__stock--ext i { background: #b26a00; }

.cito-card--list { flex-direction: row; align-items: center; gap: 14px; padding: 8px 10px; }
.cito-card--list .cito-card__img { width: 64px; min-width: 64px; aspect-ratio: 1; }
.cito-card--list .cito-card__name { -webkit-line-clamp: 1; }
</style>
