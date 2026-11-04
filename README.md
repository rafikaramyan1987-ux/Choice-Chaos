# Cozy Café

*(working title)*

A relaxing, mobile-first cooking game: you run a small warm café-bar. Guests arrive and show their order as
**pictures** (no reading needed), you prepare it by tapping — or dragging — ingredients in the right order, then
ring the bell to serve. Happy guests pay coins plus a tip.

- **No losing.** No timer bar, no angry guests, no game over. A wrong ingredient is a gentle "oops" — just pick the
  right one (or start the item over). Faster and correct service only means a bigger tip.
- **Days**: 6–10 guests per day, then a calm end-of-day summary (sales, tips, perfect orders).
- **Progression**: coins unlock recipes (hot drinks, juices, toasties, crepes, pastries, ice cream, smoothies),
  faster equipment (coffee machine, oven & griddle, blender) and decorations that appear in the café.
- **Gentle difficulty**: day 1 = one simple recipe; new recipes become available day by day, and combo orders
  (2–3 items) appear slowly. The recipe strip always shows the steps; after a few idle seconds the right
  ingredient glows.
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
```

Add `?seed=123` to the URL for reproducible orders (used by tests).

## Code map

| What | File |
| --- | --- |
| Ingredients, recipes (steps, price, unlock cost, day), equipment, decorations | `src/core/recipes.ts` |
| Rules: step validation, coins & tips, day generation, unlocks, `DayRun` | `src/core/game.ts` |
| All drawings (items built layer by layer, guests, café, icons) | `src/ui/art.ts` |
| Screens & interaction (title, service, summary, shop) | `src/ui/app.ts` |
| Texts (EN/FR) | `src/i18n/en.json`, `src/i18n/fr.json` |
| Save data (`cozy-cafe.save.v1`) | `src/platform/save.ts` |
| Sounds & vibration | `src/platform/audio.ts` |
| Ads / SDK adapter | `src/platform/ads.ts`, `src/platform/crazygames.ts` |

### Adding a recipe

1. Add it to `RECIPES` in `src/core/recipes.ts` (`steps` in order, `station`, `price`, `cost`, `day`).
   A station shows at most 8 ingredient buttons (unit-tested).
2. New ingredient? Add it to `INGREDIENTS`, draw its button in `ICONS` and its layer in `drawItem` (`src/ui/art.ts`).
3. Add its name to every language file (`recipes`, `ingredients`). `npm test` checks all of this.

### Tips formula

Guests always pay the full price. `tip = round(price × (0.1 + 0.3 × speed + 0.2 × accuracy))`, at least 1 coin.
`speed` is 1 up to the par time (3 s + 1.6 s per step) and fades to 0 at 3× par; `accuracy` is 1 / 0.5 / 0.25 / 0
for 0 / 1 / 2 / 3+ mistakes. Faster machines therefore mean bigger tips. Time with the tab hidden is not counted.

## Ads (CrazyGames SDK v3)

- The SDK `<script>` is only injected in the `crazygames` build mode (`vite.config.ts`); elsewhere `NoopPlatform`
  is used and the game works normally (rewarded features are granted directly so they can be tested).
- `SDK.init()` is awaited first; `loadingStart/loadingStop` around boot; `gameplayStart` while a day is being
  served, `gameplayStop` on the title, summary and shop screens and before ads (de-duplicated by `GameplayTracker`).
- **Midgame** ad only between days ("Next day"), never before day 3 is completed, at most once every 3 minutes
  (`midgameAllowed`, `MidgameThrottle`).
- **Rewarded** ads: "Double today's coins" on the end-of-day summary (once per day), and "Unlock now" in the shop
  for a recipe that is available by day but not yet affordable (once per day). The reward is only given in
  `adFinished`; on `adError` a short message is shown and nothing is lost.
- `happytime()` is called when a recipe is unlocked (if the SDK supports it).
- Game audio is suspended while an ad plays.
