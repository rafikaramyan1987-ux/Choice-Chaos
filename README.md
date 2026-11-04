# Cozy Café

*(working title)*

A relaxing, mobile-first cooking game: you run a small warm café-bar. Guests arrive and show their order as
**pictures** (no reading needed), you prepare it step by step, then ring the bell to serve.

- **Varied orders from the first guest.** The basic menu (coffee, latte, hot chocolate, orange juice, croissant,
  toastie, crepe) is available from the start. Every order is a random combination with small variations:
  size S/M/L, with/without milk, sugar, ice, foam, extra topping… **Never the same order twice in a row.**
- **Quality, not pressure.**
  - *Tap* ingredients like a cup, bread or a cheese slice (or drag them onto the counter).
  - *Hold to pour* liquids and toppings: a fill gauge shows a clearly visible **green zone**. Releasing inside it
    is perfect, a bit outside is OK, far outside is poor. The cup/plate fills live while you hold.
  - *Machines* (coffee is poured, toaster, griddle, oven, blender): a bar rises — tap when it is in the green.
    Toast and crepes visibly turn golden (or darker if left too long).
  - The green zone starts wide and only slowly gets a little smaller (`zoneWidth`).
  - The first time each action appears, a hand shows what to do (tap / hold / tap in the green).
- **1–3 stars per order** from the combined quality. 3★ = big happy face + hearts, 2★ = smile, 1★ = a neutral
  "meh". Guests are **never** angry, sad or leaving; there is **no game over**. A wrong ingredient is only a
  gentle "oops".
- **Pay = base price × quality**: 3★ 100 % + tip (bigger when quick and without mistakes), 2★ 70 %, 1★ 40 %.
  S/M/L cups cost ×0.8 / ×1 / ×1.3.
- **Days**: 6–10 guests, then a calm summary. Combo orders (2–3 items) become a bit more frequent over the days.
- **Coins unlock** fancy recipes (cake, ice-cream cone, sundae, smoothies, veggie toastie, berry crepe), faster
  machines (shorter warm-up, the time inside the green zone stays the same) and decorations shown in the café.
- Everything is drawn in SVG (no image files, no web fonts), sounds are synthesized with WebAudio.
- Mute button, optional vibration, `prefers-reduced-motion` support, EN/FR, portrait 360px+.
- Progress saved in `localStorage` (every access in `try/catch`, memory fallback). No cookies, no analytics.
- The GitHub Pages build makes **zero** external requests.

## Commands

```bash
npm ci                 # install
npm run dev            # local dev server
npm run check          # lint + typecheck + unit tests
npm run build          # production build (GitHub Pages) -> dist/
npm run test:e2e       # Playwright smoke test at 390px (run `npm run build` first)
npm run build:crazygames && npm run zip   # CrazyGames build -> cozy-cafe-crazygames.zip
npm run covers         # CrazyGames covers from the game's own SVG art -> covers/*.png
```

### CrazyGames covers

`covers/cover-1920x1080.png` (landscape 16:9), `covers/cover-800x1200.png` (portrait 2:3) and
`covers/cover-800x800.png` (square) are rendered by `scripts/covers.mjs` from `src/ui/art.ts` (café, guests,
a latte, a croissant, minimal text). Re-run `npm run covers` after changing the art.

Add `?seed=123` to the URL for reproducible orders (used by tests).

## Code map

| What | File |
| --- | --- |
| Ingredients (action: tap / pour / topping / timing), recipes (steps, optional extras, sizes, price, cost), equipment, decorations | `src/core/recipes.ts` |
| Rules: order generator, step validation, quality → stars → coins, unlocks, `DayRun` | `src/core/game.ts` |
| Gauge timing (`actionLevel`) and all interaction | `src/ui/app.ts` |
| All drawings (items built layer by layer, guests, café, icons) | `src/ui/art.ts` |
| Screens & interaction (title, service, summary, shop) | `src/ui/app.ts` |
| Texts (EN/FR) | `src/i18n/en.json`, `src/i18n/fr.json` |
| Save data (`cozy-cafe.save.v1`) | `src/platform/save.ts` |
| Sounds & vibration | `src/platform/audio.ts` |
| Ads / SDK adapter | `src/platform/ads.ts`, `src/platform/crazygames.ts` |

### Adding a recipe

1. Add it to `RECIPES` in `src/core/recipes.ts`: `steps` in order, `optional` extras, `sized`, `station`, `price`,
   `cost` (0 = basic menu). A station shows at most 8 ingredient buttons (unit-tested).
2. New ingredient? Add it to `INGREDIENTS` with its action, draw its button in `ICONS` and its layer in
   `drawItem` (`src/ui/art.ts`) — layers take an amount (0..1) so they grow while pouring.
3. Add its name to every language file (`recipes`, `ingredients`). `npm test` checks all of this.

### Quality & coins

- Each pour/topping/timing step is judged where it is released: inside the green zone = 3, within
  `OK_MARGIN` (0.12) outside = 2, further = 1. Tap steps don't count.
- Stars = average of the step qualities (≥ 2.5 → 3★, ≥ 1.75 → 2★, else 1★).
- Pay = base × 100 % / 70 % / 40 %. Only 3★ orders get a tip:
  `round(base × (0.1 + 0.25 × speed + 0.15 × accuracy))`, at least 1 coin. Time with the tab hidden is not counted.

## Ads (CrazyGames SDK v3)

- The SDK `<script>` is only injected in the `crazygames` build mode (`vite.config.ts`); elsewhere `NoopPlatform`
  is used and the game works normally (rewarded features are granted directly so they can be tested).
- `SDK.init()` is awaited first; `loadingStart/loadingStop` around boot; `gameplayStart` while a day is being
  served, `gameplayStop` on the title, summary and shop screens and before ads (de-duplicated by `GameplayTracker`).
- **Midgame** ad only between days ("Next day"), never before day 3 is completed, at most once every 3 minutes
  (`midgameAllowed`, `MidgameThrottle`).
- **Rewarded** ads: "Double today's coins" on the end-of-day summary (once per day), and "Unlock now" in the shop
  for a fancy recipe you cannot afford yet (once per day). The reward is only given in
  `adFinished`; on `adError` a short message is shown and nothing is lost.
- `happytime()` is called when a recipe is unlocked (if the SDK supports it).
- Game audio is suspended while an ad plays.
