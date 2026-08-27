# cito-widget

Storefront JavaScript of the Cito product-search service, shared by every platform client:

- `src/` – the fullscreen search overlay (Vue 3 + Vite, builds to one self-contained `widget.js`)
- `assistant/assistant.js` – the AI assistant (chat panel + in-page recommendation blocks)
- `dropdown/func.js` – the legacy search dropdown (jQuery; kept for shops that turned the overlay off)

The API these scripts talk to is described in the Cito server's `docs/CLIENT-CONTRACT.md`
(§5–§7 endpoints, §9 the `citoParams` / `citoAssist` config object and the DOM hooks).

## Status

Seeded 2026-08-27 from the CS-Cart addon `nl_cito` 2.4.2. **The addon copy
(`cs-cart-addons/cito/widget`) stays canonical until the platform adapter lands here** and
the addon is switched to consume this repo's build output. Until then, do not edit both.

## Build

```
npm install
npm run build        # -> dist/widget.js (iife, css inlined)
```

## Platform adapter (the work in progress)

Everything CS-Cart-specific is being pulled behind one injectable adapter so the same build
runs in CS-Cart and WordPress: URL builders (`fn_url`), translations (`Tygh.tr`),
add-to-cart (`$.ceAjax` / `wc-ajax`), the header search-input selector, and the shop-side
helper endpoints (`cito.q`, `cito.q_suggestions`, `cito.image`).

## License

GPL-2.0-or-later (WordPress.org compatible).
