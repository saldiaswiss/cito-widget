<script setup>
import { ref, watch, nextTick } from 'vue'
import ProductCard from './ProductCard.vue'
import { ai, dismissAi, followUp } from '../ai.js'
import { tr } from '../store.js'
import { trackRec } from '../api.js'

//The assistant's answer, ABOVE the result grid and never instead of it. The violet
//register is deliberate: if AI picks looked like the result list, nobody could tell what
//the catalog found from what the model suggested, and "additive, never modal" would be a
//claim rather than a property.

const draft = ref('')
const inputEl = ref(null)
const endEl = ref(null)

function submit() {
  const q = draft.value.trim()
  if (!q || ai.pending) return
  draft.value = ''
  followUp(q)
}

//the overlay's own keyboard handler (App.vue) walks the result grid with the arrows and
//opens the selected product on Enter - inside a text field that is sabotage, so every key
//stops here. Escape keeps a meaning of its own: it leaves the field, rather than closing
//the whole overlay out from under someone who is mid-sentence.
function onKeydown(e) {
  e.stopPropagation()
  if (e.key === 'Escape' && inputEl.value) inputEl.value.blur()
}

//a new turn grows the block downwards, and the composer travels with it - without this the
//answer to a follow-up can land below the fold of the results pane
watch(() => ai.msgs.length, () => {
  nextTick(() => endEl.value && endEl.value.scrollIntoView({ block: 'nearest' }))
})
</script>

<template>
  <section v-if="ai.open" class="cito-ai" :aria-label="tr('cito.assist_label')">
    <header class="cito-ai__head">
      <span class="cito-ai__badge">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z"/>
        </svg>
        {{ tr('cito.assist_label') }}
      </span>
      <span class="cito-ai__beta">{{ tr('cito.assist_beta') }}</span>
      <button type="button" class="cito-ai__close" :aria-label="tr('cito.assist_close')" @click="dismissAi()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
      </button>
    </header>

    <div class="cito-ai__body" aria-live="polite">
      <template v-for="(m, i) in ai.msgs" :key="i">
        <!-- hidden = the auto-ask on a zero-result search: the visitor never typed it as a
             message, so showing it as one would put words in their mouth. It stays in the
             thread for the server (see ai.js) -->
        <p v-if="!m.hidden" :class="['cito-ai__bubble', 'cito-ai__bubble--' + m.role]">{{ m.text }}</p>
        <div v-if="m.items && m.items.length" class="cito-ai__cards">
          <ProductCard
            v-for="item in m.items"
            :key="item.product_id"
            :item="item"
            view="list"
            :show-sku="false"
            @click="trackRec('click', 'chat', [item.product_id])"
          />
        </div>
      </template>

      <div v-if="ai.pending" class="cito-ai__pending">
        <p class="cito-ai__bubble cito-ai__bubble--assistant cito-ai__skeleton">
          <i></i><i></i><i></i>
        </p>
        <span class="cito-ai__thinking">{{ tr('cito.assist_thinking') }}</span>
      </div>

      <p v-if="ai.error" class="cito-ai__bubble cito-ai__bubble--assistant">{{ ai.error }}</p>
      <span ref="endEl" aria-hidden="true"></span>
    </div>

    <!-- the follow-up turn. Without it this surface tests the wrong thing: a single
         question answered once is a lookup, and the conversations that showed value in the
         transcripts were all multi-turn -->
    <form class="cito-ai__ask" @submit.prevent="submit">
      <input ref="inputEl" v-model="draft" type="text" class="cito-ai__input"
        :placeholder="tr('cito.assist_placeholder')" :aria-label="tr('cito.assist_placeholder')"
        autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
        @keydown="onKeydown">
      <button type="submit" class="cito-ai__send" :disabled="!draft.trim() || ai.pending">
        {{ tr('cito.assist_send') }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.cito-ai {
  /* its own colour world, not the theme accent - the visitor must never have to guess
     which block is the catalog and which is the model */
  background: #faf8ff;
  border: 1px solid #e6ddfa;
  border-radius: 14px;
  padding: 12px 14px 14px;
  margin-bottom: 16px;
  flex: none;
}
.cito-ai__head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cito-ai__badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: #7c3aed;
}
.cito-ai__beta {
  font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  color: #7c3aed; background: #efe8fd; border-radius: 999px; padding: 2px 7px;
}
.cito-ai__close {
  margin-left: auto; display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: 0; border-radius: 8px; cursor: pointer;
  background: transparent; color: #7c3aed;
}
.cito-ai__close:hover { background: #efe8fd; }
.cito-ai__body { display: flex; flex-direction: column; gap: 10px; }
.cito-ai__bubble {
  margin: 0; font-size: 14.5px; line-height: 1.5; max-width: 62ch;
  align-self: flex-start; /* hug the text - a stretched bubble reads as a panel, not speech */
  border-radius: 14px 14px 14px 5px; padding: 10px 13px;
  background: #fff; border: 1px solid #ece5fb; color: var(--ink);
}
.cito-ai__bubble--user {
  align-self: flex-end; border-radius: 14px 14px 5px 14px;
  background: #5b21b6; border-color: #5b21b6; color: #fff;
}
.cito-ai__cards {
  display: flex; flex-direction: column; gap: 2px;
  background: #fff; border: 1px solid #ece5fb; border-radius: 12px; padding: 4px;
}
.cito-ai__pending { display: flex; align-items: center; gap: 10px; }
.cito-ai__thinking { font-size: 12.5px; color: #7c3aed; }
.cito-ai__skeleton { display: inline-flex; gap: 5px; padding: 13px; }
.cito-ai__skeleton i {
  width: 6px; height: 6px; border-radius: 50%; background: #c4b5fd;
  animation: cito-ai-dot 1.1s infinite ease-in-out;
}
.cito-ai__skeleton i:nth-child(2) { animation-delay: .15s; }
.cito-ai__skeleton i:nth-child(3) { animation-delay: .3s; }
@keyframes cito-ai-dot { 0%, 80%, 100% { opacity: .35; } 40% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cito-ai__skeleton i { animation: none; }
}
/* the follow-up composer: quiet enough not to compete with the search field above it,
   present enough that nobody has to wonder whether they may answer back */
.cito-ai__ask { display: flex; gap: 8px; margin-top: 12px; }
.cito-ai__input {
  flex: 1; min-width: 0;
  padding: 9px 13px; border-radius: 10px;
  border: 1px solid #e6ddfa; background: #fff; color: var(--ink);
  font-size: 16px; /* under 16px iOS zooms the whole overlay on focus */
  line-height: 1.3;
}
.cito-ai__input:focus { border-color: #a78bfa; outline: none; }
.cito-ai__input::placeholder { color: #9a93a8; }
.cito-ai__send {
  flex: none; padding: 0 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid #5b21b6; background: #5b21b6; color: #fff;
  font-size: 13.5px; font-weight: 600; white-space: nowrap;
}
.cito-ai__send:hover:not(:disabled) { background: #4c1d95; border-color: #4c1d95; }
.cito-ai__send:disabled { opacity: .45; cursor: default; }

/* ProductCard's styles are scoped, so the list rows inside the block need :deep to be
   toned down - they must read as part of the answer, not as a second result list */
.cito-ai__cards :deep(.cito-card) { padding: 8px; }
.cito-ai__cards :deep(.cito-card:hover) { border-color: #e6ddfa; box-shadow: none; background: #faf8ff; }
</style>
