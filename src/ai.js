import { reactive } from 'vue'
import { chatRequest, trackRec } from './api.js'
import { tr } from './store.js'

//The assistant, as a surface INSIDE the search overlay (2.1.0).
//
//Why here and not in assistant.js: that widget lives in a floating button whose
//recommendations drew 8 clicks on 6'601 impressions, while the chat - the part visitors
//actually use well - had 7 impressions because nobody can find it. The search bar is
//where people already are. See docs/ASSIST-PLACEMENT.md in the cito repo.
//
//This is step one on purpose. It does NOT touch assistant.js, does not move the
//page-level signal collection (views/cart/categories) and does not retire the floating
//button. It answers one question cheaply: does anyone use an assistant that lives in the
//search bar? Everything else waits for that answer.
//
//Two triggers only:
//  1. the visitor clicks the AI button next to the search field
//  2. a search came back with nothing, or only survived through the semantic rescue -
//     the one moment the data supports, because the need is stated and the list is empty
//Never on a search that found something: 96% of queries are 1-3 words and 0.0% contain a
//question mark, so an automatic answer on every search would fire almost exclusively on
//navigational queries, where it adds nothing and costs money.

export const ai = reactive({
  open: false,       // is the block visible at all
  pending: false,    // waiting for /chat
  error: '',         // a message we are willing to show the visitor
  msgs: [],          // [{ role: 'user'|'assistant', text, items?, hidden? }]
  asked: '',         // the query that opened the current thread
})

export function aiEnabled() {
  const p = window.citoParams
  return !!(p && p.chat_url)
}

let ctrl = null
const autoAsked = {}   // queries already auto-answered in this page session

export function dismissAi() {
  if (ctrl) { ctrl.abort(); ctrl = null }
  ai.open = false
  ai.pending = false
  ai.error = ''
  ai.msgs = []
  ai.asked = ''
}

//the thread in the shape api/chat.php wants: role + text, nothing else (the cards are
//ours). The server takes the last 12 turns and merges consecutive same-role messages, so
//a long conversation trims itself and a turn left unanswered by a failed request cannot
//break the next one.
function wire() {
  return ai.msgs.map(m => ({ role: m.role, text: m.text }))
}

//post the thread as it currently stands and append the answer to it. Every entry point
//below builds the thread first and then calls this - the request is always the WHOLE
//conversation, which is what makes a follow-up a follow-up instead of a fresh question.
function run() {
  if (ctrl) ctrl.abort()
  ctrl = new AbortController()
  const mine = ctrl

  ai.error = ''
  ai.pending = true
  const msgs = wire()

  const send = (retry) => chatRequest(msgs, mine.signal)
    .then(d => {
      if (mine.signal.aborted) return
      //a technical failure is worth exactly one silent retry - the widget's own contract
      //since 2.0.4: the shop never sees an error, the visitor sees an answer or nothing
      if (d && d.error && !retry) return setTimeout(() => send(true), 2500)
      ai.pending = false
      if (!d || !d.reply) {
        //gated, budget spent, or nothing to say. On the FIRST answer there is nothing on
        //screen worth keeping, so the block disappears as if it had never opened. Once a
        //conversation exists the visitor can see their own question sitting there, and
        //closing the whole thread under them would read as a crash - keep it, say one
        //honest line, and let them try again.
        const spoken = ai.msgs.some(m => m.role === 'assistant')
        if (d && d.error) ai.error = tr('cito.assist_tech_error')
        else if (spoken) ai.error = tr('cito.assist_error')
        else dismissAi()
        return
      }
      const items = Object.values(d.items || {}).slice(0, 4)
      ai.msgs.push({ role: 'assistant', text: d.reply, items })
      if (items.length) trackRec('imp', 'chat', items.map(i => i.product_id))
    })
    .catch(err => {
      if (err.name === 'AbortError' || mine.signal.aborted) return
      if (!retry) return setTimeout(() => send(true), 2500)
      ai.pending = false
      ai.error = tr('cito.assist_tech_error')
    })

  send(false)
}

//open a NEW thread: the search-field button and the zero-result auto-ask both start here,
//and both discard whatever was said before - a new query is a new subject.
export function ask(text, { auto = false } = {}) {
  const q = String(text || '').trim()
  if (!aiEnabled() || q.length < 2 || ai.pending) return

  ai.open = true
  ai.asked = q
  //an auto answer is not something the visitor said, so it is not SHOWN as their message -
  //but it stays in the thread, because the server and every follow-up need it as the first
  //user turn (without it "and cheaper?" has nothing to refer to)
  ai.msgs = [{ role: 'user', text: q, hidden: auto }]
  run()
}

//a follow-up turn in the same thread (2.1.0). This is the whole point of the surface: the
//transcripts that showed value were multi-turn, so one question with no way back is the
//wrong thing to measure. Costs one more LLM call against the shop's daily budget.
export function followUp(text) {
  const q = String(text || '').trim()
  if (!aiEnabled() || !q || ai.pending || !ai.msgs.length) return
  ai.msgs.push({ role: 'user', text: q })
  run()
}

//registered as the search hook in main.js: runs after every completed search, once the
//results are already on screen
export function maybeAutoAsk(q, { zero, semantic }) {
  if (!aiEnabled()) return
  //ZERO ONLY, deliberately not `semantic`. The semantic rescue means the visitor DID get
  //products - the list is not empty, so the "need stated, nothing to show" argument does
  //not hold. And the volumes are not comparable: on one shop's German widget traffic the
  //rescue fires ~406x/day against ~22 real zero-result searches, so including it would
  //blow the shop's whole 400/day budget before noon and leave the button dead.
  if (!zero) { //the search answered on its own - stay out of the way
    if (!ai.msgs.length) dismissAi()
    return
  }
  const key = q.toLowerCase()
  if (autoAsked[key]) return          //never twice for the same query in one session
  if (Object.keys(autoAsked).length >= 5) return   //cheap ceiling per page session
  autoAsked[key] = 1
  ask(q, { auto: true })
}
