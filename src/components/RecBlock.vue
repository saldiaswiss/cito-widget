<script setup>
import { ref, computed, watch } from 'vue'
import ProductCard from './ProductCard.vue'
import { recs, markRecsSeen } from '../recs.js'
import { tr } from '../store.js'
import { trackRec } from '../api.js'

//The empty state's personalised picks: one line from the model, three products, and no way
//for it to interrupt anything. Same violet register as the answer block, so "this came from
//the assistant" stays readable at a glance; visually quieter than that one, because nobody
//asked for it.
//
//Once the visitor types, the block does NOT vanish - it collapses to a single line (2.1.9).
//Full cards next to search results would compete with the answer the visitor just asked
//for, and they are picked from browsing history, not from the query. But disappearing
//without a trace is worse: nobody guesses that clearing the search box brings them back
//(reported 2026-08-17). One line keeps the thing findable and claims almost nothing.
const props = defineProps({ collapsed: Boolean })
const expanded = ref(false)
const open = computed(() => !props.collapsed || expanded.value)
//back to the empty state: the strip has no memory, it opens on demand again
watch(() => props.collapsed, v => { if (!v) expanded.value = false })
//an impression is what was SEEN - the strip alone is not it
watch(open, v => { if (v) markRecsSeen() }, { immediate: true })
</script>

<template>
  <section v-if="recs.items.length" class="cito-recs" :class="{ 'cito-recs--strip': !open }"
           :aria-label="tr('cito.assist_label')">
    <button v-if="!open" type="button" class="cito-recs__toggle" @click="expanded = true">
      <span class="cito-recs__badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"/>
        </svg>
        {{ tr('cito.assist_label') }}
      </span>
      <span class="cito-recs__strip-text">{{ tr('cito.assist_recs_kept') }}</span>
      <svg class="cito-recs__chev" width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>

    <template v-if="open">
      <header class="cito-recs__head">
        <span class="cito-recs__badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"/>
          </svg>
          {{ tr('cito.assist_label') }}
        </span>
        <span class="cito-recs__beta">{{ tr('cito.assist_beta') }}</span>
        <button v-if="collapsed" type="button" class="cito-recs__close" @click="expanded = false"
                :aria-label="tr('cito.close')">&times;</button>
      </header>
      <p v-if="recs.message" class="cito-recs__msg">{{ recs.message }}</p>
      <div class="cito-recs__cards">
        <ProductCard
          v-for="item in recs.items"
          :key="item.product_id"
          :item="item"
          view="list"
          :show-sku="false"
          @click="trackRec('click', 'search', [item.product_id])"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.cito-recs {
  background: #faf8ff;
  border: 1px solid #e6ddfa;
  border-radius: 14px;
  padding: 10px 12px 12px;
  margin: 12px 24px 0;
  flex: none;
}
/* collapsed: one quiet line, no card surface, no fill - it must read as a trace of
   something the visitor already saw, never as a second offer next to the results */
.cito-recs--strip { background: none; border: none; border-radius: 0; padding: 0; margin: 8px 24px 0; }
.cito-recs__toggle {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; border-bottom: 1px solid #ece5fb;
  padding: 0 2px 8px; cursor: pointer; font: inherit; text-align: left;
}
.cito-recs__toggle:hover .cito-recs__strip-text { color: var(--ink); }
.cito-recs__strip-text { font-size: 13px; color: #6b6b7b; }
.cito-recs__chev { margin-left: auto; color: #7c3aed; flex: none; }
.cito-recs__close {
  margin-left: auto; border: 0; background: none; cursor: pointer;
  color: #8e8e93; font-size: 18px; line-height: 1; padding: 0 2px;
}
.cito-recs__close:hover { color: var(--ink); }
.cito-recs__head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.cito-recs__badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: #7c3aed;
}
.cito-recs__beta {
  font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: #7c3aed; background: #efe8fd; border-radius: 999px; padding: 2px 7px;
}
.cito-recs__msg { margin: 0 0 8px; font-size: 14px; line-height: 1.45; color: var(--ink); max-width: 62ch; }
.cito-recs__cards {
  display: flex; flex-direction: column; gap: 2px;
  background: #fff; border: 1px solid #ece5fb; border-radius: 12px; padding: 4px;
}
/* ProductCard is scoped, so its rows need :deep to be toned down here - they must read as
   part of the suggestion, not as a second result list */
.cito-recs__cards :deep(.cito-card) { padding: 8px; }
.cito-recs__cards :deep(.cito-card:hover) { border-color: #e6ddfa; box-shadow: none; background: #faf8ff; }
@media (max-width: 767px) {
  .cito-recs { margin: 10px 14px 0; }
  .cito-recs--strip { margin: 8px 14px 0; }
}
</style>
