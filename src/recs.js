import { reactive } from 'vue'
import { recsRequest, trackRec } from './api.js'
import { recentSignals } from './store.js'

//Personalised picks in the overlay's EMPTY state - the moment after the visitor opens the
//search and before they type (2.1.4).
//
//This REPLACES the popup's 'browse' trigger rather than adding to it. That one fetched on
//ordinary page views, announced itself with a toast, an auto-opened panel or a red dot, and
//drew 2 clicks on 2,125 impressions - the single biggest share of the assistant's cost for
//the worst return (docs/ASSIST-PLACEMENT.md in the cito repo). The difference is not the
//content, it is the moment and the direction: this waits until the visitor opens the search
//themselves, so it is pull, never interruption, and it needs no announcement - which is why
//it needs no red dot either.
//
//Cost: ONE request per signal state, capped per page session. The old trigger ran on every
//page view with a 90s cooldown; this runs when someone actually goes looking.
//
//Signals come from the widget's OWN view history (recentSignals(), sessionStorage, tracked
//in store.js) - nothing is moved out of assistant.js and the two surfaces stay independent.

export const recs = reactive({
  message: '',   // the model's one-liner, '' while there is nothing to show
  items: [],     // up to 3 products
})

const K_SIG = 'citoRecsSig'    // signal state already asked about
const K_N = 'citoRecsN'        // requests made this page session
const K_DATA = 'citoRecsData'  // the picks themselves: {sig, message, items, imp}
const K_SEEN = 'citoRecsSeen'  // the visitor opened the search at least once this session
const MAX_PER_SESSION = 3

function sget(k) { try { return sessionStorage.getItem(k) || '' } catch (e) { return '' } }
function sset(k, v) { try { sessionStorage.setItem(k, v) } catch (e) { /* private mode */ } }
function sjson(k) { try { return JSON.parse(sget(k) || 'null') } catch (e) { return null } }

export function recsEnabled() {
  const p = window.citoParams
  return !!(p && p.assist_url)
}

//the search was opened by hand at least once -> from the NEXT page on, the picks may be
//fetched before the overlay opens (see loadRecs' prefetch note). Deliberately tied to a
//search the visitor really performed: paying for an answer on every page view of every
//visitor is the cost profile of the popup's old browse trigger, which earned 2 clicks on
//2,125 impressions (docs/ASSIST-PLACEMENT.md in the cito repo).
export function noteSearchOpened() {
  sset(K_SEEN, '1')
}

export function hasSearchedThisSession() {
  return recsEnabled() && sget(K_SEEN) === '1'
}

//An impression means the visitor SAW the products - so it is logged by the block itself
//when it is really open, not when the answer arrives. The collapsed strip next to search
//results does not count: it only says the picks are still there. Once per signal state,
//because the same three products shown again on the next page are not a second
//recommendation, and inflating the denominator is how a CTR stops meaning anything.
//
//Kind 'search', not 'browse' (2.1.10). The popup's browse trigger carries the same content
//in the opposite direction - unasked, on an ordinary page view - and until now both wrote
//the same letter, so neither could be read once a shop ran both surfaces. That is the whole
//point of the comparison in docs/ASSIST-PLACEMENT.md, hence a kind of its own.
export function markRecsSeen() {
  const cached = sjson(K_DATA)
  if (!recs.items.length || !cached || cached.imp) return
  cached.imp = 1
  sset(K_DATA, JSON.stringify(cached))
  trackRec('imp', 'search', recs.items.map(i => i.product_id))
}

let ctrl = null

//Called when the overlay opens AND, once the visitor has searched at all, on page load.
//Everything here is a reason NOT to spend a call.
export function loadRecs() {
  if (!recsEnabled()) return
  //Show what we already have FIRST - instantly, without waiting for anything. The answer
  //lives in sessionStorage, not just in this module: before 2.1.9 it sat in a reactive()
  //that dies on navigation while the "already asked" marker survived, so the picks
  //appeared on exactly ONE page per signal state and were thrown away the moment the
  //visitor clicked on (verified live on a shop 2026-08-17: block after 1.95s on the
  //page that fetched it, nothing at all one page later, LLM answer paid for and lost).
  const cached = sjson(K_DATA)
  if (cached && cached.items && cached.items.length && !recs.items.length) {
    recs.message = cached.message || ''
    recs.items = cached.items
  }
  //the server needs two viewed products before it answers at all (api/a.php exits on a
  //thinner session - that is the crawler signature). Asking with less is a guaranteed
  //show:0, so do not even send it. recentSignals() INCLUDES the product page the visitor
  //is standing on; the "recently viewed" row deliberately drops it, and reading the row
  //here is why the picks never appeared on a product page (two views -> one signal).
  const viewed = recentSignals()
  if (viewed.length < 2) return

  const sig = viewed.slice(0, 3).join(',')
  if (sget(K_SIG) === sig) return                                  //already asked for this state
  //ceiling reached: keep showing the picks we have. Slightly behind the newest view is a
  //far better answer than an empty block, and it costs nothing
  if ((parseInt(sget(K_N), 10) || 0) >= MAX_PER_SESSION) return

  sset(K_SIG, sig)
  sset(K_N, String((parseInt(sget(K_N), 10) || 0) + 1))

  if (ctrl) ctrl.abort()
  ctrl = new AbortController()
  const mine = ctrl
  const p = window.citoParams

  recsRequest({
    viewed,
    searches: (p.last_searches || []).slice(0, 5),
    storefront_id: p.storefront_id,
    lang_code: p.lang_code,
    currency_code: p.currency_code,
    usergroup_ids: p.usergroup_ids,
    token: p.token,
  }, mine.signal).then(d => {
    if (mine.signal.aborted) return
    if (!d || !d.show || !d.items) return         //no picks, gated, or budget spent: stay quiet
    const items = Object.values(d.items).slice(0, 3)
    if (!items.length) return
    recs.message = d.message || ''
    recs.items = items
    //kept across pages, so the next opening is instant instead of another 2s wait; the
    //impression follows from markRecsSeen() when the block is really open
    sset(K_DATA, JSON.stringify({ sig, message: recs.message, items, imp: 0 }))
  }).catch(() => { /* the shop never sees an assistant error */ })
}
