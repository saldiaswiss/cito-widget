# cito-widget

Storefront JavaScript of the Cito product-search service, shared by every platform client:

- `src/` – the fullscreen search overlay (Vue 3 + Vite, builds to one self-contained `widget.js`)
- `assistant/assistant.js` – the AI assistant (chat panel + in-page recommendation blocks)
- `dropdown/func.js` – the legacy search dropdown (jQuery; kept for shops that turned the overlay off)

The API these scripts talk to is described in the Cito server's `docs/CLIENT-CONTRACT.md`
(§5–§7 endpoints, §9 the `citoParams` / `citoAssist` config object and the DOM hooks).

## Status

Seeded 2026-08-27 from the CS-Cart addon `nl_cito` 2.4.2; the platform adapter landed the
same day. **The addon copy (`cs-cart-addons/cito/widget`) stays canonical until the
adapter build has been verified on a CS-Cart shop** and the addon is switched to consume
this repo's build output. Until then, do not edit both.

## Build

```
npm install
npm run build        # -> dist/widget.js (iife, css inlined)
```

The build writes `dist/widget.js`, `dist/assistant.js` and `dist/func.js` — the three files
a platform client vendors (`tools/sync-clients.sh` copies them into the client repos).

## Platform adapter

Everything platform-specific goes through one object, `window.citoAdapter`. The scripts
ship CS-Cart defaults (`src/adapter.js`; `assistant/assistant.js` carries an ES5 copy of
the functions it needs) and merge the host's object over them at init, so a host inlines
it in the page body next to `citoParams`, before `DOMContentLoaded`:

```html
<script>
var citoAdapter = {
  productUrl: function (item) { return '/?p=' + item.product_id },
  searchPageUrl: function (q) { return '/?s=' + encodeURIComponent(q) + '&post_type=product' },
  fetchImage: function (pid) { /* -> Promise<string url | ''>, never rejects */ },
  logQuery: function (q, numResults) { /* fire-and-forget */ },
  suggestions: function (q, signal) { /* -> Promise<string[]> */ },
  tr: function (key) { /* -> string, or undefined = use the built-in text */ },
  addToCart: function (pid) { /* -> Promise<boolean> */ },
  onCartRerender: function (cb) { /* call cb when the cart page is re-rendered by ajax */ },
  cartedIdFromClick: function (event) { /* -> product id of the shop's own add-to-cart control, or 0 */ },
  wishedIdFromClick: function (event) { /* -> same for wishlist controls, or 0 */ },
  searchInputSelector: 'form.search input[name="s"]',
  excludeInputWithin: '',        // inputs inside a matching ancestor are not ours
  searchFormName: '',            // submits of this form are swallowed while the overlay is open
  accentCandidates: ['.wp-block-button__link', 'button.single_add_to_cart_button'],
  theaterSrc: ''                 // path of theaterJS for the typing placeholder, '' = none
}
</script>
```

Every function runs in the visitor's browser on every page: degrade silently (resolve to
`''` / `[]` / `false`, never throw), send nothing beyond what the contract lists, and do
not assume the overlay is loaded (the assistant runs alone on shops using the dropdown).
Keys a host omits keep the CS-Cart default. The CS-Cart values are the reference
implementation in `src/adapter.js`.

## License

GPL-2.0-or-later (WordPress.org compatible).
