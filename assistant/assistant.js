//CITO AI assistant (2.2.0). Two jobs, deliberately separated:
//
//  1. The chat panel (CITO /chat) - CONVERSATION ONLY. It opens when the visitor
//     opens it: the floating button, the AI button in the search overlay, or the
//     "question about this product?" line on a product page. It never opens itself,
//     never toasts, never lights a dot. Product cards appear in it as the ANSWER to
//     a question - the surface with by far the highest click rate.
//  2. In-page recommendation blocks (CITO /a) - rendered INTO the shop's own page,
//     never into a floating layer: the cart page (2.1.8) and sold-out product pages
//     (2.2.0). The hook template leaves an empty hidden container, this file fills it
//     and only then unhides it, so an assistant that is off, a spent daily budget and
//     a show:0 answer all leave no trace in the page.
//
//Gone with 2.2.0, and not to come back without new evidence: the unasked page-view
//round ("browse"), the floating panel after an add-to-cart click, the floating
//sold-out panel, auto-open, toast, badge dot, session delay, cooldown. Measured on
//one shop in one window, the floating cart panel produced 909 impressions / 4 clicks
/// 0 add-to-carts while the in-page cart block produced 402 / 8 / 5 - the container
//was the difference, not the moment (docs/ASSIST-PLACEMENT.md in the cito repo).
//
//All state is sessionStorage only - no cookies, no persistent identifiers.
//Inert unless the CITO server enables the shop (assist_tables).
(function () {
  'use strict';
  //CS-Cart concatenates {script} files into the head bundle, but the citoAssist/
  //citoParams config is inlined near the end of <body> - so wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    if (!window.citoParams || !window.citoAssist) return;
    var A = window.citoAssist, P = window.citoParams;
    var K_VIEWS = 'citoAssistViews'; //product ids seen this session (signal for /a)
    var K_CHAT = 'citoChatHist', K_CHAT_OPEN = 'citoChatOpen';
    var K_CART = 'citoAssistCart'; //product ids added to the cart this session
    var K_CATS = 'citoAssistCats'; //category ids visited this session
    var K_ORDER = 'citoOrderCtx'; //confirmed guest order identity {order_id, email} - the
    //server pins it after a successful lookup and pre-fetches the live status each turn

    var labels = {
      de: { label: 'KI-Assistent', close: 'Schliessen', open_chat: 'KI-Assistent öffnen',
            placeholder: 'Beschreibe, was du suchst…', send: 'Senden',
            greeting: 'Hallo! Ich schlage dir passende Produkte vor, die wirklich an Lager sind, helfe dir bei der Auswahl – und du kannst mich auch nach dem Status deiner Bestellung fragen. Was suchst du?',
            error: 'Das hat gerade nicht geklappt – versuch es bitte noch einmal.',
            tech_error: 'Ich habe gerade ein technisches Problem beim Abrufen der Antwort – bitte versuch es gleich noch einmal.',
            recs_label: 'Empfehlungen für dich', recs_label_cart: 'Passend zu deinem Warenkorb',
            recs_label_oos: 'Verfügbare Alternativen', ask_product: 'Frage zu diesem Produkt?', ask_prefill: 'Ich habe eine Frage zu «%s»: ', add_to_cart: 'In den Warenkorb', added: 'Hinzugefügt', beta: 'Beta' },
      fr: { label: 'Assistant IA', close: 'Fermer', open_chat: 'Ouvrir l’assistant IA',
            placeholder: 'Décris ce que tu cherches…', send: 'Envoyer',
            greeting: 'Salut ! Je te propose des produits adaptés et réellement en stock, je t’aide à choisir – et tu peux aussi me demander où en est ta commande. Que cherches-tu ?',
            error: 'Cela n’a pas fonctionné – réessaie, s’il te plaît.',
            tech_error: 'J’ai un problème technique pour récupérer la réponse – merci de réessayer dans un instant.',
            recs_label: 'Recommandations pour toi', recs_label_cart: 'Assorti à ton panier',
            recs_label_oos: 'Alternatives disponibles', ask_product: 'Une question sur ce produit ?', ask_prefill: 'J’ai une question sur « %s » : ', add_to_cart: 'Ajouter au panier', added: 'Ajouté', beta: 'Bêta' },
      it: { label: 'Assistente IA', close: 'Chiudi', open_chat: 'Apri l’assistente IA',
            placeholder: 'Descrivi cosa cerchi…', send: 'Invia',
            greeting: 'Ciao! Ti propongo prodotti adatti e davvero disponibili, ti aiuto a scegliere – e puoi anche chiedermi lo stato del tuo ordine. Cosa cerchi?',
            error: 'Qualcosa è andato storto – riprova per favore.',
            tech_error: 'Ho un problema tecnico nel recuperare la risposta – riprova tra un attimo, per favore.',
            recs_label: 'Consigli per te', recs_label_cart: 'Abbinati al tuo carrello',
            recs_label_oos: 'Alternative disponibili', ask_product: 'Hai una domanda su questo prodotto?', ask_prefill: 'Ho una domanda su «%s»: ', add_to_cart: 'Aggiungi al carrello', added: 'Aggiunto', beta: 'Beta' },
      en: { label: 'AI assistant', close: 'Close', open_chat: 'Open AI assistant',
            placeholder: 'Describe what you’re looking for…', send: 'Send',
            greeting: 'Hi! I suggest products that fit you and are actually in stock, help you choose – and you can also ask me about the status of your order. What are you looking for?',
            error: 'That didn’t work just now – please try again.',
            tech_error: 'I’m having a technical problem fetching the answer – please try again in a moment.',
            recs_label: 'Recommendations for you', recs_label_cart: 'Goes well with your cart',
            recs_label_oos: 'Available alternatives', ask_product: 'A question about this product?', ask_prefill: 'I have a question about “%s”: ', add_to_cart: 'Add to cart', added: 'Added', beta: 'Beta' }
    };
    var L = labels[P.lang_code] || labels.en;
    //shop-side langvars (cito.assist_*, addon.xml) override the built-in labels so
    //merchants can rephrase them; missing vars come back as '_cito.assist_*' from
    //CS-Cart (not yet imported on this shop) - keep the built-in text then
    if (window.Tygh && typeof Tygh.tr === 'function') {
      for (var lk in L) {
        var lv = Tygh.tr('cito.assist_' + lk);
        if (lv && typeof lv === 'string' && lv.charAt(0) !== '_') L[lk] = lv;
      }
    }

    function sget(k, fallback) {
      try { var v = sessionStorage.getItem(k); return v === null ? fallback : v; } catch (e) { return fallback; }
    }
    function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
    function sdel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
    function jget(k, fallback) {
      try { var v = JSON.parse(sget(k, 'null')); return v === null ? fallback : v; } catch (e) { return fallback; }
    }

    //---- view / cart / category tracking ----
    var views = jget(K_VIEWS, []);
    var pid = parseInt(A.product_id, 10) || 0;
    if (pid > 0) {
      views = [pid].concat(views.filter(function (v) { return v !== pid; })).slice(0, 15);
      sset(K_VIEWS, JSON.stringify(views));
    }
    //A sold-out product page no longer triggers anything on its own: the alternatives
    //are rendered by initOosBlock() into the container the hook template leaves in the
    //page (2.2.0). The old floating round is gone with the rest of the unasked layer.
    var cats = jget(K_CATS, []);
    var cid = parseInt(A.category_id, 10) || 0;
    if (cid > 0) {
      cats = [cid].concat(cats.filter(function (v) { return v !== cid; })).slice(0, 5);
      sset(K_CATS, JSON.stringify(cats));
    }
    var carted = jget(K_CART, []);
    //add-to-cart = strongest interest signal. Most CS-Cart add buttons are named
    //dispatch[checkout.add..<product_id>], but not all: nl_product_links rewrites the
    //name to the id-less dispatch[checkout.add], "add all" buttons never carry an id
    //and some themes only set but_id - so fall back to button_cart_<id> and to the
    //enclosing product form. A capture-phase listener catches them theme-independently.
    function cartedIdFromClick(e) {
      var t = e.target;
      if (!t || !t.closest) return 0;
      var btn = t.closest('[name^="dispatch[checkout.add"], [id^="button_cart_"]');
      if (!btn) return 0;
      var m = (btn.getAttribute('name') || '').match(/checkout\.add\.\.(\d+)/);
      if (!m) m = (btn.id || '').match(/button_cart_(\d+)/);
      if (m) return parseInt(m[1], 10) || 0;
      var form = btn.form || (btn.closest ? btn.closest('form') : null);
      if (!form) return 0;
      m = ((form.getAttribute('name') || '') + ' ' + (form.id || '')).match(/product_form_(\d+)/);
      if (m) return parseInt(m[1], 10) || 0;
      var inp = form.querySelector('input[name^="product_data["][name*="[product_id]"]');
      return inp ? parseInt(inp.value, 10) || 0 : 0;
    }
    document.addEventListener('click', function (e) {
      var id = cartedIdFromClick(e);
      if (!id) return;
      carted = [id].concat(carted.filter(function (v) { return v !== id; })).slice(0, 10);
      sset(K_CART, JSON.stringify(carted));
      //tracked as a SIGNAL only. Until 2.2.0 this also fired a floating complement
      //panel; that panel had 909 impressions and 0 add-to-carts next to the in-page
      //cart block's 402/5, so the moment now belongs to the cart page alone.
    }, true);
    //wishlist adds are almost as strong a signal as cart adds: tracked as a fresh
    //view (no separate server field needed) so the in-page blocks and the chat see it
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[name^="dispatch[wishlist.add"]');
      if (!btn) return;
      var m = (btn.getAttribute('name') || '').match(/wishlist\.add\.\.(\d+)/);
      var id = m ? parseInt(m[1], 10) || 0 : 0;
      if (!id) {
        var form = btn.form || (btn.closest ? btn.closest('form') : null);
        if (form) {
          m = ((form.getAttribute('name') || '') + ' ' + (form.id || '')).match(/product_form_(\d+)/);
          if (m) id = parseInt(m[1], 10) || 0;
        }
      }
      if (!id) return;
      views = [id].concat(views.filter(function (v) { return v !== id; })).slice(0, 15);
      sset(K_VIEWS, JSON.stringify(views));
    }, true);

    //---- shared bits ----
    function productUrl(id) {
      if (typeof window.fn_url === 'function') return window.fn_url('products.view?product_id=' + id);
      return '?dispatch=products.view&product_id=' + id;
    }
    function fetchImage(id, img, ph) {
      fetch(window.fn_url ? window.fn_url('cito.image?is_ajax=1') : '?dispatch=cito.image&is_ajax=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'product_id=' + encodeURIComponent(id)
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.src) { img.src = d.src; img.style.display = ''; ph.style.display = 'none'; }
      })['catch'](function () {});
    }
    function el(tag, cls, parent) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (parent) parent.appendChild(e);
      return e;
    }
    function slimItems(items) {//keep only what rendering needs (sessionStorage stays small)
      return (items || []).slice(0, 4).map(function (i) {
        //price is the NUMERIC one (display_price is formatted): it travels with the
        //add beacon so the stats page can show the cart value a surface produced
        return { product_id: i.product_id, name: i.name, display_price: i.display_price,
          price: (typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0), image: i.image || '' };
      });
    }
    function renderCard(item, parent, kind) {
      var a = el('a', 'cito-assist__item', parent);
      a.href = productUrl(item.product_id);
      a.addEventListener('click', function () {
        beacon({ ev: 'click', k: kind || 'chat', product_id: item.product_id });
      });
      var imgWrap = el('span', 'cito-assist__img', a);
      var img = document.createElement('img');
      img.alt = item.name || '';
      img.loading = 'lazy';
      var ph = el('span', 'cito-assist__ph', imgWrap);
      imgWrap.appendChild(img);
      if (item.image) {
        img.src = item.image;
        ph.style.display = 'none';
        img.onerror = function () { img.style.display = 'none'; ph.style.display = ''; fetchImage(item.product_id, img, ph); };
      } else {
        img.style.display = 'none';
        fetchImage(item.product_id, img, ph);
      }
      var info = el('span', 'cito-assist__info', a);
      el('span', 'cito-assist__name', info).textContent = item.name || '';
      if (item.display_price) el('span', 'cito-assist__price', info).textContent = item.display_price;
      var add = el('button', 'cito-assist__add', a);
      add.type = 'button';
      add.setAttribute('aria-label', L.add_to_cart + ': ' + (item.name || ''));
      add.title = L.add_to_cart;
      //the capture-phase carted listener above matches this name pattern, so widget
      //adds count as cart signals exactly like the shop's own buttons
      add.setAttribute('name', 'dispatch[checkout.add..' + item.product_id + ']');
      add.innerHTML = cartSvg;
      add.addEventListener('click', function (e) {
        e.preventDefault(); //the button sits inside the product link
        e.stopPropagation();
        addToCart(item.product_id, add, kind, item.price);
      });
    }
    function addToCart(id, btn, kind, price) {
      if (btn.disabled) return;
      btn.disabled = true;
      var done = function (ok) {
        if (!ok) { btn.disabled = false; return; }
        //value = the price shown on the card. Reporting only - the server bounds it
        //and never decides anything on it (api/e.php).
        beacon({ ev: 'add', k: kind || 'chat', product_id: id, value: price > 0 ? price : 0 });
        btn.innerHTML = '&#10003;';
        btn.setAttribute('aria-label', L.added);
        btn.title = L.added;
      };
      var $ = window.Tygh && window.Tygh.$;
      if ($ && $.ceAjax) {
        //native path: CS-Cart's own ajax pipeline updates the minicart and shows the
        //"product added" notification exactly like the shop's add-to-cart buttons
        var product_data = {};
        product_data[id] = { product_id: id, amount: 1 };
        $.ceAjax('request', window.fn_url ? window.fn_url('checkout.add..' + id) : '?dispatch=checkout.add..' + id, {
          method: 'post',
          data: { product_data: product_data },
          result_ids: 'cart_status*,wish_list*,account_info*',
          caching: false,
          callback: function () { done(true); }
        });
        return;
      }
      //fallback without the Tygh runtime: plain ajax add, button state only
      fetch(window.fn_url ? window.fn_url('checkout.add..' + id + '?is_ajax=1') : '?dispatch=checkout.add..' + id + '&is_ajax=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'product_data[' + id + '][product_id]=' + id + '&product_data[' + id + '][amount]=1'
      }).then(function (r) { done(r.ok); })['catch'](function () { done(false); });
    }
    function apiPost(url, payload) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, //simple request: no CORS preflight
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); });
    }
    function basePayload() {
      return {
        storefront_id: P.storefront_id,
        lang_code: P.lang_code,
        currency_code: P.currency_code,
        usergroup_ids: P.usergroup_ids,
        token: P.token
      };
    }
    //analytics beacon (fire-and-forget, /e): impressions/clicks/adds of assistant
    //product cards, tagged with the recommendation kind - the CTR base for tuning
    //and later click-based ranking. Anonymous by design: product id + event type
    //only, no cookies/identifiers. sendBeacon survives click-then-navigate.
    function beacon(rec) {
      if (!A.e_url) return;
      var body = JSON.stringify(Object.assign(basePayload(), { rec: rec }));
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(A.e_url, new Blob([body], { type: 'text/plain' }))) return;
      } catch (e) { /* fall through */ }
      try {
        fetch(A.e_url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true })['catch'](function () {});
      } catch (e) { /* never surface */ }
    }
    function impBeacon(kind, items) {
      beacon({ ev: 'imp', k: kind || 'chat', product_ids: (items || []).slice(0, 4).map(function (i) { return i.product_id; }) });
    }

    //a phone crossing 767px on rotate has to re-pick its placement offset in
    //applyPlacement() below, so the query object is kept around
    var mqMobile = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;

    //---- styles ----
    var css = '.cito-assist,.cito-chat{position:fixed;right:16px;z-index:99998;width:min(360px,calc(100vw - 24px));' +
      'background:#fff;color:#1c1c1e;border:1px solid #e4e4e7;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);' +
      'font-size:13.5px;line-height:1.45;overflow:hidden;transform:translateY(16px);opacity:0;transition:transform .3s ease,opacity .3s ease}' +
      '.cito-assist{bottom:calc(84px + var(--cito-off,0px))}' +
      '.cito-assist--in,.cito-chat--in{transform:none;opacity:1}' +
      '.cito-assist__head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid #f0f0f2}' +
      '.cito-assist__badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.05em;' +
      'text-transform:uppercase;color:#5b21b6;background:#f3eefe;border-radius:20px;padding:3px 9px}' +
      '.cito-assist__badge svg{width:11px;height:11px}' +
      '.cito-assist__beta{font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
      'color:#8e8e93;border:1px solid #d8d8dc;border-radius:5px;padding:1.5px 6px}' +
      '.cito-assist__close{margin-left:auto;border:0;background:none;cursor:pointer;color:#8e8e93;font-size:20px;line-height:1;padding:2px 6px}' +
      '.cito-assist__close:hover{color:#1c1c1e}' +
      '.cito-assist__msg{padding:12px 14px 6px;font-size:13.5px}' +
      '.cito-assist__items{padding:6px 8px 10px;display:flex;flex-direction:column}' +
      '.cito-assist__item{display:flex;align-items:center;gap:11px;padding:7px 6px;border-radius:10px;text-decoration:none;color:inherit}' +
      '.cito-assist__item:hover{background:#f6f6f8;text-decoration:none;color:inherit}' +
      '.cito-assist__img{width:52px;height:52px;min-width:52px;border-radius:8px;background:#f4f4f6;display:flex;' +
      'align-items:center;justify-content:center;overflow:hidden}' +
      '.cito-assist__img img{max-width:100%;max-height:100%;object-fit:contain;mix-blend-mode:multiply}' +
      '.cito-assist__ph{width:22px;height:22px;border-radius:5px;background:#e4e4e7}' +
      '.cito-assist__info{min-width:0;display:flex;flex-direction:column;gap:1px}' +
      '.cito-assist__name{font-size:13px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.cito-assist__price{font-weight:650;font-size:13px}' +
      '.cito-assist__add{margin-left:auto;flex:none;width:32px;height:32px;border:1px solid #ddd6f3;border-radius:9px;' +
      'background:#fff;color:#5b21b6;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px}' +
      '.cito-assist__add svg{width:16px;height:16px}' +
      '.cito-assist__add:hover{background:#f3eefe}' +
      '.cito-assist__add:disabled{opacity:.55;cursor:default;background:#fff}' +
      //floating button
      '.cito-fab{position:fixed;right:16px;bottom:calc(16px + var(--cito-off,0px));z-index:99997;width:52px;height:52px;border-radius:50%;border:0;cursor:pointer;' +
      'background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 8px 24px rgba(91,33,182,.45);transition:transform .15s ease}' +
      '.cito-fab:hover{transform:scale(1.06)}' +
      '.cito-fab svg{width:24px;height:24px}' +
      '.cito-fab__dot{position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;background:#ef4444;border:2px solid #fff}' +
      //in-page block on the cart page (2.1.8): same violet register as the panel's
      //recommendation bubble, but it sits in the shop's own page. Cards reuse the
      //panel's .cito-assist__item, so one card style everywhere; the grid gives them
      //a row on a wide cart table and a list on a phone
      '.cito-cartrecs__box{border:1px solid #e6ddfa;background:#faf8ff;border-radius:12px;padding:10px 12px;margin:12px 0}' +
      '.cito-cartrecs__head{display:flex;align-items:center;gap:8px}' +
      '.cito-cartrecs__msg{padding:7px 2px 4px;font-size:13.5px;line-height:1.45;color:#1c1c1e}' +
      //min() lets a track shrink BELOW its ideal width when the container is narrower -
      //without it three cards demand ~700px and burst out of a product page's buy
      //column (a shop 2026-08-22: the block covered the product image and ran off
      //the right edge of the page). In a wide container nothing changes.
      '.cito-cartrecs__cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));'
        + 'gap:2px;min-width:0}' +
      '.cito-cartrecs__box{max-width:100%;box-sizing:border-box}' +
      '.cito-cartrecs__cards .cito-assist__item{min-width:0}' +
      //sold-out product page: same box as the cart block, so both in-page surfaces
      //read as one thing the shop offers rather than two widgets
      '.cito-oosrecs{margin:12px 0;max-width:100%}' +
      //"a question about this product?" - an invitation, not an interruption: one
      //quiet line, no box, no colour block competing with the buy button
      //two-class selectors and an explicit width, because shop themes stretch every
      //button in the buy column to 100% - the line then reads as a second call to
      //action next to "add to cart" (a shop, 2026-08-22). This stylesheet is
      //appended to <head> at runtime, so at equal specificity it wins.
      '.cito-ask{display:flex;justify-content:flex-start;margin:10px 0;max-width:100%}' +
      '.cito-ask .cito-ask__btn{display:inline-flex;align-items:center;gap:7px;width:auto;max-width:100%;' +
      'flex:0 0 auto;align-self:flex-start;border:1px solid #e6ddfa;background:#faf8ff;' +
      'border-radius:20px;padding:7px 13px;font-size:13px;line-height:1.3;color:#5b21b6;cursor:pointer;' +
      'font-family:inherit;text-align:left;transition:background .15s ease,border-color .15s ease}' +
      '.cito-ask .cito-ask__btn:hover{background:#f3eefe;border-color:#d6c8f7}' +
      '.cito-ask .cito-ask__btn:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}' +
      '.cito-ask .cito-ask__btn svg{width:14px;height:14px;flex:none}' +
      //chat panel
      //the height has to shrink by the same offset - lifting only the bottom edge
      //would push the panel off the top of a phone screen
      '.cito-chat{bottom:calc(84px + var(--cito-off,0px));display:flex;flex-direction:column;' +
      'height:min(540px,calc(100vh - 120px - var(--cito-off,0px)));width:min(380px,calc(100vw - 24px))}' +
      //keyboard up (see applyKeyboard below): --cito-kb is the strip the on-screen
      //keyboard covers, --cito-vh what is left visible. The panel sits ON the keyboard
      //and SHRINKS - lifting it without shrinking it would push the header off the top
      //of the screen. The bottom clearance drops to 8px: the fab and whatever the shop
      //glues to the bottom edge are behind the keyboard anyway.
      '.cito-kb .cito-chat{bottom:calc(var(--cito-kb,0px) + 8px);' +
      'height:min(540px,calc(var(--cito-vh,100vh) - 24px))}' +
      '.cito-chat__body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}' +
      '.cito-chat__bubble{max-width:86%;padding:8px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
      '.cito-chat__bubble--a{background:#f4f2fa;border-bottom-left-radius:5px;align-self:flex-start}' +
      '.cito-chat__bubble--rec{background:#faf8ff;border:1px solid #e6ddfa}' +
      '.cito-chat__rec-label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7c3aed;margin-bottom:4px}' +
      '.cito-chat__bubble--u{background:#5b21b6;color:#fff;border-bottom-right-radius:5px;align-self:flex-end}' +
      '.cito-chat__cards{align-self:stretch;display:flex;flex-direction:column;background:#fafafa;border:1px solid #f0f0f2;border-radius:12px;padding:2px 4px}' +
      '.cito-chat__foot{display:flex;gap:8px;padding:10px;border-top:1px solid #f0f0f2}' +
      '.cito-chat__input{flex:1;border:1px solid #dcdce0;border-radius:10px;padding:9px 12px;font-size:13.5px;outline:none;min-width:0}' +
      '.cito-chat__input:focus{border-color:#7c3aed}' +
      '.cito-chat__send{border:0;border-radius:10px;background:#5b21b6;color:#fff;font-weight:600;padding:0 15px;cursor:pointer}' +
      '.cito-chat__send:disabled{opacity:.5;cursor:default}' +
      '.cito-chat__typing{display:inline-flex;gap:4px;padding:11px 12px}' +
      '.cito-chat__typing i{width:6px;height:6px;border-radius:50%;background:#b9a8e6;animation:citoBlink 1.2s infinite}' +
      '.cito-chat__typing i:nth-child(2){animation-delay:.2s}.cito-chat__typing i:nth-child(3){animation-delay:.4s}' +
      '@keyframes citoBlink{0%,80%,100%{opacity:.35}40%{opacity:1}}' +
      //arrival animation: a reply used to REPLACE message + cards in one frame, which
      //the eye reads as "the content changed" rather than "something new came in"
      //(reported live 2026-08-06). Motion is the cue, not colour.
      '.cito-chat__in{animation:citoIn .22s ease-out both}' +
      '@keyframes citoIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      //cards fan in behind their message instead of landing as one block. The WRAP
      //itself must not animate here - wrap plus children would move twice as far
      '.cito-chat__cards--in .cito-assist__item{animation:citoIn .22s ease-out both}' +
      '.cito-chat__cards--in .cito-assist__item:nth-child(2){animation-delay:.06s}' +
      '.cito-chat__cards--in .cito-assist__item:nth-child(3){animation-delay:.12s}' +
      '.cito-chat__cards--in .cito-assist__item:nth-child(4){animation-delay:.18s}' +
      //ONE-SHOT ring on an unasked message (proactive picks the visitor did not
      //trigger). Deliberately not a loop: an endlessly pulsing bubble is noise, and
      //would have to be switched off under prefers-reduced-motion anyway
      '.cito-chat__flash{animation:citoIn .22s ease-out both,citoFlash 1.8s ease-out .15s 1}' +
      '@keyframes citoFlash{0%{box-shadow:0 0 0 0 rgba(124,58,237,.5)}' +
      '60%{box-shadow:0 0 0 7px rgba(124,58,237,0)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}}' +
      //"new below" pill: shown instead of yanking the view when the visitor has
      //scrolled up to re-read something
      '.cito-chat__jump{position:absolute;left:50%;bottom:58px;z-index:2;border:0;cursor:pointer;' +
      'transform:translateX(-50%);background:#5b21b6;color:#fff;font-size:12px;font-weight:600;' +
      'border-radius:999px;padding:6px 13px;box-shadow:0 4px 14px rgba(91,33,182,.35)}' +
      //opposite corner, for shops that already occupy the default one (one shop keeps
      //its cookie icon bottom left, other shops put theirs bottom right)
      '.cito-side-left .cito-assist,.cito-side-left .cito-chat,.cito-side-left .cito-fab,' +
      '.cito-side-left .cito-toast{right:auto;left:16px}' +
      '@media (prefers-reduced-motion:reduce){.cito-assist,.cito-chat,.cito-fab{transition:none}' +
      '.cito-chat__in,.cito-chat__flash,.cito-chat__cards--in .cito-assist__item{animation:none}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    //Merchant-set clearance for whatever the shop glues to the bottom edge - the
    //sticky buy bar covers the fab on most phone themes, and every shop solves that
    //corner differently (cookie widgets, back-to-top buttons), so this is configured
    //per shop rather than measured at runtime: detection would have to guess through
    //shadow-DOM cookie widgets, bars that only appear on scroll and iOS toolbar
    //resizes, and a wrong guess moves the whole widget. Phones and desktop carry
    //their own value, re-picked on rotate where a phone crosses the 767px breakpoint.
    function applyPlacement() {
      var px = parseInt((mqMobile && mqMobile.matches) ? A.offset_mobile : A.offset_desktop, 10) || 0;
      if (px < 0) px = 0;
      if (px > 240) px = 240;//a mistyped value must never push the widget off-screen
      document.documentElement.style.setProperty('--cito-off', px + 'px');
    }
    applyPlacement();
    if (mqMobile && mqMobile.addEventListener) mqMobile.addEventListener('change', applyPlacement);
    if (A.side === 'left') document.documentElement.className += ' cito-side-left';

    //An on-screen keyboard does NOT shrink the layout viewport (iOS never, Android only
    //in some modes), and position:fixed anchors to exactly that layout viewport - so the
    //panel keeps its bottom edge UNDER the keyboard and the visitor types blind into an
    //input they cannot see; it only appears after pulling the keyboard down by hand
    //(reported live on a shop, 2026-08-15). The visual viewport is the only source
    //that knows better: its height is what is actually visible, and
    //innerHeight - height - offsetTop is exactly the strip the keyboard covers. Where
    //the layout viewport DOES resize with the keyboard, that comes out as 0 and nothing
    //changes - the panel already sits above it.
    var vv = window.visualViewport, kbPx = 0, kbRaf = 0;
    function applyKeyboard() {
      kbRaf = 0;
      var inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      //browser chrome collapsing on scroll moves this by a few dozen px, a phone
      //keyboard by 250+ - only the latter is worth re-laying-out the panel for
      if (inset < 120) inset = 0;
      if (inset === kbPx) return;
      var opening = inset > 0 && kbPx === 0;
      kbPx = inset;
      var root = document.documentElement;
      root.style.setProperty('--cito-kb', inset + 'px');
      root.style.setProperty('--cito-vh', Math.round(vv.height) + 'px');
      if (inset > 0) root.classList.add('cito-kb'); else root.classList.remove('cito-kb');
      //the panel just got shorter around a conversation the visitor is answering -
      //keep the end of the thread in view instead of the middle of it
      if (opening && chatBody) toBottom(false);
    }
    if (vv) {
      var onViewport = function () {
        if (!kbRaf) kbRaf = window.requestAnimationFrame(applyKeyboard);
      };
      vv.addEventListener('resize', onViewport);
      vv.addEventListener('scroll', onViewport); //iOS pans the visual viewport on focus
    }

    var sparkleSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.1 6.2L20 10l-5.9 1.8L12 18l-2.1-6.2L4 10l5.9-1.8L12 2zm7 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z"/></svg>';
    var cartSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

    function makeHead(parent, onClose) {
      var head = el('div', 'cito-assist__head', parent);
      var badge = el('span', 'cito-assist__badge', head);
      badge.innerHTML = sparkleSvg;
      badge.appendChild(document.createTextNode(L.label));
      var beta = el('span', 'cito-assist__beta', head);
      beta.textContent = L.beta;
      var close = el('button', 'cito-assist__close', head);
      close.type = 'button';
      close.setAttribute('aria-label', L.close);
      close.innerHTML = '&times;';
      close.addEventListener('click', onClose);
      return head;
    }

    //---- floating button + chat panel ----
    var chatPanel = null, chatBody = null, chatInput = null, chatSend = null, pending = false;

    var fab = el('button', 'cito-fab');
    fab.type = 'button';
    fab.setAttribute('aria-label', L.open_chat);
    fab.innerHTML = sparkleSvg;
    fab.addEventListener('click', function () {
      if (chatPanel) closeChat(); else openChat();
    });
    document.body.appendChild(fab);

    function chatHist() { return jget(K_CHAT, []); }
    function pushChat(m) {
      var h = chatHist();
      h.push(m);
      sset(K_CHAT, JSON.stringify(h.slice(-20)));
    }

    //---- arrival motion ----
    //`anim`: 0/undefined = no motion (restoring the stored thread on open - 20
    //messages animating at once is worse than none), 1 = normal arrival,
    //2 = UNASKED arrival, which additionally gets the one-shot ring
    function animClass(anim) {
      return anim ? (anim > 1 ? ' cito-chat__flash' : ' cito-chat__in') : '';
    }
    function atBottom() {
      if (!chatBody) return true;
      return chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 60;
    }
    function toBottom(smooth) {
      if (!chatBody) return;
      if (smooth && chatBody.scrollTo) chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
      else chatBody.scrollTop = chatBody.scrollHeight;
      dropJump();
    }
    //never yank the view away from a visitor who scrolled up to re-read something -
    //they get a tappable pill instead. `stick` must be sampled BEFORE the new nodes
    //are appended (appending changes scrollHeight).
    var jumpPill = null;
    function dropJump() {
      if (jumpPill && jumpPill.parentNode) jumpPill.parentNode.removeChild(jumpPill);
      jumpPill = null;
    }
    function scrollNew(stick) {
      if (!chatBody) return;
      if (stick) { toBottom(true); return; }
      if (jumpPill || !chatPanel) return;
      jumpPill = el('button', 'cito-chat__jump', chatPanel);
      jumpPill.type = 'button';
      jumpPill.textContent = L.jump_new || '↓';
      jumpPill.addEventListener('click', function () { toBottom(true); });
    }
    function bubble(role, text, anim) {
      if (!chatBody) return null; //panel closed while a reply was in flight
      var b = el('div', 'cito-chat__bubble cito-chat__bubble--' + role + animClass(anim), chatBody);
      b.textContent = text;
      if (!anim) chatBody.scrollTop = chatBody.scrollHeight;//animated callers scroll once, after the cards
      return b;
    }
    function cardsBlock(items, kind, anim) {
      if (!items || !items.length || !chatBody) return null;
      var wrap = el('div', 'cito-chat__cards' + (anim ? ' cito-chat__cards--in' : ''), chatBody);
      items.slice(0, 4).forEach(function (item) { renderCard(item, wrap, kind); });
      if (!anim) chatBody.scrollTop = chatBody.scrollHeight;
      return wrap;
    }
    //returns the rendered nodes so a standing recommendation can be swapped in place
    function renderHistMsg(m, anim) {
      var stick = atBottom();
      var b = bubble(m.r === 'u' ? 'u' : 'a', m.t || '', anim);
      if (b && m.rec) {//folded-in recommendations get their own register
        b.className += ' cito-chat__bubble--rec';
        var lab = document.createElement('span');
        lab.className = 'cito-chat__rec-label';
        //case-specific register: cart complements and OOS alternatives announce
        //themselves; everything else keeps the generic label
        lab.textContent = m.k === 'cart' ? L.recs_label_cart
          : (m.k === 'oos' ? L.recs_label_oos : L.recs_label);
        b.insertBefore(lab, b.firstChild);
      }
      var cards = m.items ? cardsBlock(m.items, m.rec ? (m.k || 'chat') : 'chat', anim) : null;
      if (anim) scrollNew(stick);
      return { bubble: b, cards: cards };
    }
    //`quiet` = opened by something other than a deliberate click on the chat button
    //(the panel is restored after a page change), so the input must not steal focus
    //and pop the phone keyboard. `restored` is kept as the second flag for callers
    //that only rebuild an already-open panel.
    function openChat(quiet, restored) {
      if (chatPanel) return;
      sset(K_CHAT_OPEN, '1');
      chatPanel = el('div', 'cito-chat');
      chatPanel.setAttribute('role', 'dialog');
      chatPanel.setAttribute('aria-label', L.label);
      makeHead(chatPanel, closeChat);
      chatBody = el('div', 'cito-chat__body', chatPanel);
      //scrolled back down by hand? then the "new below" pill has done its job
      chatBody.addEventListener('scroll', function () { if (atBottom()) dropJump(); });
      var foot = el('div', 'cito-chat__foot', chatPanel);
      chatInput = el('input', 'cito-chat__input', foot);
      chatInput.type = 'text';
      chatInput.placeholder = L.placeholder;
      chatInput.maxLength = 500;
      chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMsg(); });
      chatSend = el('button', 'cito-chat__send', foot);
      chatSend.type = 'button';
      chatSend.textContent = L.send;
      chatSend.addEventListener('click', sendMsg);
      document.body.appendChild(chatPanel);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (chatPanel) chatPanel.className = 'cito-chat cito-chat--in';
      }); });

      var h = chatHist();
      //the greeting explains what the assistant can do, so it stays up until the
      //visitor has written something. Static text, never persisted, re-rendered on
      //every open.
      var spoken = h.some(function (m) { return m.r === 'u'; });
      if (!spoken) bubble('a', L.greeting);
      h.forEach(function (m) { renderHistMsg(m); });
      requestAnimationFrame(function () {
        if (!chatBody) return;
        //a fresh panel opens at the greeting; a returning conversation stays where it
        //ended (toBottom below)
        if (!spoken) chatBody.scrollTop = 0;
        //armed AFTER the history re-render so screen readers only announce NEW
        //replies, not the whole restored thread (mutations before the attribute
        //lands are not announced)
        chatBody.setAttribute('aria-live', 'polite');
      });
      //only a deliberate open focuses the input: the restore on navigation must not
      //steal focus (mobile would pop the keyboard)
      if (!quiet) chatInput.focus();
    }

    function closeChat() {
      if (chatPanel && chatPanel.parentNode) chatPanel.parentNode.removeChild(chatPanel);
      chatPanel = chatBody = chatInput = chatSend = null;
      jumpPill = null;//lived inside the panel that was just removed
      sdel(K_CHAT_OPEN);
    }

    function sendMsg() {
      if (pending || !chatInput) return;
      var text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      pending = true;
      chatSend.disabled = true;
      bubble('u', text, 1);
      pushChat({ r: 'u', t: text });
      var typing = el('div', 'cito-chat__bubble cito-chat__bubble--a cito-chat__typing', chatBody);
      typing.innerHTML = '<i></i><i></i><i></i>';
      toBottom(false);//the visitor just sent something - always follow, and clear the pill

      //window of 12: an 8-message window lost the guest's order email once the
      //conversation grew (order follow-ups then couldn't re-trigger the lookup)
      var messages = chatHist().slice(-12).map(function (m) {
        var text = m.t || '';
        if (m.r !== 'u' && m.items && m.items.length) {
          //the cards aren't part of the text - tell the LLM what was actually shown
          //(crucial for the folded-in recommendations message and "not these" replies)
          text += '\n[shown products: ' + m.items.map(function (i) { return i.name; }).join('; ') + ']';
        }
        return { role: m.r === 'u' ? 'user' : 'assistant', text: text };
      });

      //the server already retries transient LLM failures itself; on a technical
      //failure (d.error / network) the widget quietly retries once more with the
      //typing indicator still up before admitting a problem to the visitor
      var retriesLeft = 1;
      attempt();

      function finish() {
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        pending = false;
        if (chatSend) chatSend.disabled = false;
        if (chatInput) chatInput.focus();
      }
      function attempt() {
        apiPost(A.chat_url, Object.assign(basePayload(), {
          messages: messages,
          order_ctx: jget(K_ORDER, null),
          carted: jget(K_CART, []), //cart context: server excludes these from picks, prefers complements
          page_pid: pid || 0 //current product page: grounds "similar to THIS" questions server-side
        })).then(function (d) {
          if (d && d.order_ctx) sset(K_ORDER, JSON.stringify(d.order_ctx));
          if (d && d.reply) {
            finish();
            var items = slimItems(d.items);
            var stick = atBottom();//sampled before the nodes land (they change scrollHeight)
            bubble('a', d.reply, 1);
            if (items.length) {
              cardsBlock(items, 'chat', 1);
              impBeacon('chat', items);
            }
            scrollNew(stick);
            //persisted even if the panel was closed mid-flight: reopen shows the reply
            pushChat({ r: 'a', t: d.reply, items: items.length ? items : undefined });
          } else if (d && d.error) {
            retryOrFail();
          } else {
            finish();
            bubble('a', L.error, 1); //non-technical decline (feature gated/budget): no retry
          }
        })['catch'](retryOrFail);
      }
      function retryOrFail() {
        if (retriesLeft-- > 0 && chatPanel) { setTimeout(attempt, 2500); return; }
        finish();
        bubble('a', L.tech_error, 1);
      }
    }

    //---- in-page recommendations on the cart page (2.1.8) ----
    //The hook template (hooks/checkout/extra_list.post.tpl) leaves an empty hidden row in
    //the cart table and names the REAL cart contents; we fill it and unhide it. This is
    //the one unasked surface with measured clicks, and in the page it interrupts nobody -
    //so it needs no toast, no auto-open and no red dot. Since 2.2.0 it is the ONLY
    //answer to the cart moment: the floating panel that used to react to the
    //add-to-cart click is gone.
    //Cached per cart signature: CS-Cart re-renders the cart table by ajax on every
    //quantity change, and a rebuilt (empty) container must not buy a second LLM answer
    //for a cart that did not change.
    var K_CARTREC = 'citoCartRecs'; //{sig, message, items} of the current cart
    //shared box for every in-page surface (cart page, sold-out page). One markup and
    //one card style, so the shop shows one thing the assistant does and not three
    //different widgets.
    function renderRecBox(host, label, message, items, kind, logImpression) {
      if (!host || !items || !items.length) return;
      host.innerHTML = '';
      var box = el('div', 'cito-cartrecs__box', host);
      var head = el('div', 'cito-cartrecs__head', box);
      var badge = el('span', 'cito-assist__badge', head);
      badge.innerHTML = sparkleSvg;
      badge.appendChild(document.createTextNode(label));
      el('span', 'cito-assist__beta', head).textContent = L.beta;
      if (message) el('div', 'cito-cartrecs__msg', box).textContent = message;
      var wrap = el('div', 'cito-cartrecs__cards', box);
      items.slice(0, 3).forEach(function (item) { renderCard(item, wrap, kind); });
      if (logImpression) impBeacon(kind, items);
    }
    //count an impression when the element is actually ON SCREEN. Used by the surfaces
    //introduced in 2.2.0 only: the cart block keeps counting at render time because
    //its numbers are the baseline the in-page decision was made on, and a series must
    //not change its counting rule halfway through.
    function whenVisible(node, fn) {
      if (!node) return;
      if (!window.IntersectionObserver) { fn(); return; }
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) { io.disconnect(); fn(); return; }
        }
      }, { threshold: 0.5 });
      io.observe(node);
    }
    function renderCartBlock(host, message, items, logImpression) {
      //logged ONCE per cart, not per render: CS-Cart rebuilds the cart table by ajax
      //on every quantity change, and counting that twice inflates exactly the
      //denominator this surface is supposed to be judged on
      renderRecBox(host, L.recs_label_cart, message, items, 'cartpage', logImpression);
      var row = document.getElementById('cito_cart_recs_row');
      if (row && items && items.length) row.style.display = '';
    }
    function initCartBlock() {
      var host = document.getElementById('cito_cart_recs');
      if (!host || host.getAttribute('data-cito-done')) return;
      var ids = (host.getAttribute('data-cito-cart') || '').split(',').map(function (v) {
        return parseInt(v, 10) || 0;
      }).filter(Boolean).slice(0, 10);
      if (!ids.length) return;
      host.setAttribute('data-cito-done', '1');
      var sig = ids.join(',');
      var cached = jget(K_CARTREC, null);
      if (cached && cached.sig === sig && cached.items && cached.items.length) {
        renderCartBlock(host, cached.message, cached.items, !cached.imp); //ajax rebuild: no second call
        if (!cached.imp) {
          cached.imp = 1;
          sset(K_CARTREC, JSON.stringify(cached));
        }
        return;
      }
      //the cart ids come from the SHOP, the views are ours - a.php seeds its knn on the
      //cart first and excludes every signal id from the candidates, so nothing already
      //in the cart can be recommended back
      apiPost(A.url, Object.assign(basePayload(), { viewed: views, carted: ids, cats: cats }))
        .then(function (d) {
          if (!d || !d.show || !d.items || !d.items.length) return;
          var items = slimItems(d.items);
          sset(K_CARTREC, JSON.stringify({ sig: sig, message: d.message || '', items: items, imp: 1 }));
          renderCartBlock(document.getElementById('cito_cart_recs') || host, d.message || '', items, true);
        })['catch'](function () { /* the shop never sees an assistant error */ });
    }
    initCartBlock();
    //CS-Cart replaces the cart table wholesale on quantity changes; commoninit is the
    //event every addon in the fleet re-initialises on
    if (window.Tygh && Tygh.$ && Tygh.$.ceEvent) {
      Tygh.$.ceEvent('on', 'ce.commoninit', function () { initCartBlock(); });
    }

    //---- in-page alternatives on a sold-out product page (2.2.0) ----
    //Same container pattern and the same box as the cart block: the hook template
    //(hooks/products/add_to_cart.pre.tpl) leaves an empty hidden div where the buy
    //button would be and names the product. This moment used to be answered by the
    //floating panel - the container the cart evidence rejected.
    var K_OOSREC = 'citoOosRecs'; //{pid, message, items} of the sold-out product last seen
    function initOosBlock() {
      var host = document.getElementById('cito_oos_recs');
      if (!host || host.getAttribute('data-cito-done')) return;
      var oosPid = parseInt(host.getAttribute('data-cito-oos'), 10) || 0;
      if (!oosPid) return;
      host.setAttribute('data-cito-done', '1');
      function show(message, items) {
        renderRecBox(host, L.recs_label_oos, message, items, 'oospage', false);
        host.style.display = '';
        whenVisible(host, function () { impBeacon('oospage', items); });
      }
      //back on the same sold-out product within the session: no second LLM call
      var cached = jget(K_OOSREC, null);
      if (cached && cached.pid === oosPid && cached.items && cached.items.length) {
        show(cached.message, cached.items);
        return;
      }
      //`oos` switches the server into alternatives mode; it re-checks the stock in the
      //index itself, the flag only opens the gate. No signal minimum applies - someone
      //landing from Google on a sold-out product is one page view and a real problem,
      //and api/a.php falls back to the free bestseller mode rather than staying silent.
      apiPost(A.url, Object.assign(basePayload(), { viewed: views, carted: carted, cats: cats, oos: oosPid }))
        .then(function (d) {
          if (!d || !d.show || !d.items || !d.items.length) return;
          var items = slimItems(d.items);
          sset(K_OOSREC, JSON.stringify({ pid: oosPid, message: d.message || '', items: items }));
          show(d.message || '', items);
        })['catch'](function () { /* the shop never sees an assistant error */ });
    }
    initOosBlock();

    //---- "a question about this product?" (2.2.0) ----
    //The asked entry point that replaces the interruption. It opens the same chat as
    //the floating button - and since the chat already sends page_pid, the first
    //question is grounded in THIS product without any extra plumbing. Costs nothing
    //until someone clicks it: no /a call, no LLM call, just a line in the page.
    function initProductAsk() {
      var host = document.getElementById('cito_product_ask');
      if (!host || host.getAttribute('data-cito-done')) return;
      var askPid = parseInt(host.getAttribute('data-cito-product'), 10) || 0;
      if (!askPid) return;
      host.setAttribute('data-cito-done', '1');
      var askName = (host.getAttribute('data-cito-name') || '').trim();
      var btn = el('button', 'cito-ask__btn', host);
      btn.type = 'button';
      btn.innerHTML = sparkleSvg;
      btn.appendChild(document.createTextNode(L.ask_product));
      btn.addEventListener('click', function () {
        beacon({ ev: 'click', k: 'ask', product_id: askPid });
        openChat();
        //start the sentence: an empty box right after clicking "a question about this
        //product?" makes the visitor type the product name again, and that name in the
        //message is also what the retrieval legs rank on (page_pid grounds the server
        //side, the model ranks on the text). Caret at the end, they just keep typing.
        if (chatInput && askName) {
          var prefill = L.ask_prefill.indexOf('%s') !== -1
            ? L.ask_prefill.replace('%s', askName)
            : L.ask_prefill + ' ' + askName + ': ';
          chatInput.value = prefill;
          chatInput.focus();
          try { chatInput.setSelectionRange(prefill.length, prefill.length); } catch (e) {}
        }
      });
      host.style.display = '';
      whenVisible(host, function () { beacon({ ev: 'imp', k: 'ask', product_ids: [askPid] }); });
    }
    initProductAsk();

    if (sget(K_CHAT_OPEN, '')) openChat(true, true); //restore the panel across navigation
  }
})();
