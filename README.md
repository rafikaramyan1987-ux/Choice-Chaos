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
- **Coins** buy faster machines (shorter warm-up, the time inside the green zone stays the same), decorations and
  café expansions; fancy recipes unlock with the player level (see *Progression*).
- Everything is drawn in SVG (no image files, no web fonts), sounds are synthesized with WebAudio.
- Mute button, optional vibration, `prefers-reduced-motion` support, EN/FR, portrait 360px+.
- Progress saved in `localStorage` (every access in `try/catch`, memory fallback). No cookies, no analytics.
- The GitHub Pages build makes **zero** external requests.

## Progression & reward loop

All rules are pure functions in `src/core/meta.ts` (unit tested in `tests/unit/meta.test.ts`).

- **Player level & XP.** Every order gives XP (`orderXp`), and so do missions, the day bonus and finished
  constructions. Each level-up opens a **chest** (coins + gems) and unlocks something (`levelUnlocks`): a fancy
  recipe (lv 2, 4, 6, 7, 9, 10, 12), a new guest type (fox lv 3, panda lv 5, frog lv 8), special guests (VIP lv 3,
  critic lv 5, celebrity lv 9) or a new café area in the shop.
- **Missions.** There are always 3 active missions (serve N guests, serve a recipe, perfect orders, a 3★ streak,
  coins in one day, special guests, combos, stars, large drinks), with progress bars on the café screen and the
  summary. When one is completed it pays coins/XP (sometimes a gem) and a new one appears. At most one "hard"
  mission is active at a time. You can swap a mission for 1 gem.
- **Café expansion** (long-term goal, shop → Café): tables (+1 guest a day each), sunny terrace (+15 % tips),
  bakery corner and ice-cream bar (+1 coin per item of those stations), second counter, then **staff helpers**
  (barista / baker) who make simple items by themselves, the winter theme (gems) and a lounge room. Building takes
  real time (2–30 min); you can finish it right away with a video or with gems. Everything is drawn in the café.
- **Daily.** A 7-day login calendar (day 7 is the biggest, ×2 with a video). A daily challenge: 8 guests, the same
  for everyone on that date, reach 18★ for coins, gems and XP (once a day).
- **Gift box** every 15 minutes (×2 with a video).
- **Special guests.** VIPs (double tips, tip even on 2★), food critics (triple tip + a gem for 3★) and rare
  celebrities (everything ×2 + 2 gems). Guests are never angry.
- **Sticker book.** You get a sticker the first time you serve each guest type (11 in total).
- **Achievements** (19) give gems.
- **Gems** are the second currency: premium decor, the winter theme, staff, recipes before their level, mission
  swaps and finishing constructions. They are earned only by playing — missions, achievements, level-ups, daily
  rewards, gifts, critics/celebrities, challenges. **There are no real-money purchases.**
- **End of day.** A small day bonus (more for 3★ orders, a gem for a flawless day) and the existing
  "×2 today's coins" video.

### Balance

`tests/unit/balance.test.ts` simulates a typical player (75 % 3★ steps, realistic step timings, buys what they can
afford, claims gifts) for 30 minutes. It prints the reward timeline and fails if, during the first 20 minutes, more
than **2 minutes** pass without a reward or unlock. Across 8 seeds the longest gap is currently 71–110 s. Run
`SIM_SEED=3 npx vitest run tests/unit/balance.test.ts --reporter=verbose` to see another timeline.

### Rewarded videos (always optional)

| Where | What | Limit |
| --- | --- | --- |
| End-of-day summary | "Make one order 3★" (the weakest one; or 2 gems) | 3 a day |
| Gift box | ×2 | every 15 min |
| Daily calendar | ×2 | once a day |
| Café screen | "VIP now": the first guest of the next day is a VIP (or 3 gems) | once a day |
| Shop → Café | finish a construction now | per construction |
| Shop → Recipes | unlock the next recipe now | once a day |
| End of day | ×2 today's coins | once a day |

## Commands

```bash
npm ci                 # install
npm run dev            # local dev server
npm run check          # lint + typecheck + unit tests
npm run build          # production build (GitHub Pages) -> dist/
npm run test:e2e       # Playwright smoke test at 390px (run `npm run build` first)
npm run build:crazygames && npm run zip   # CrazyGames build -> cozy-cafe-crazygames.zip
npm run covers         # CrazyGames covers from the game's own SVG art -> submission/covers/*.png
npm run videos         # CrazyGames preview videos (bot plays the built game, needs ffmpeg) -> submission/videos/*.mp4
```

### CrazyGames submission

Everything for the submission form (covers, preview videos, EN/FR descriptions, controls, tags, the requirements
checklist and where to get the zip) is in [`submission/README.md`](submission/README.md).

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
  served, `gameplayStop` on the café, summary and shop screens and before ads (de-duplicated by `GameplayTracker`).
- New players land directly in gameplay (day 1 starts at once); returning players see the café screen.
- On CrazyGames, progress is saved with the SDK **data module**, the language comes from `user.systemInfo.locale`
  and the `muteAudio` setting overrides the in-game sound toggle.
- Rewarded offers are never shown on the gameplay screen, always look like their no-video alternative and are
  hidden when ads are disabled (`adsDisabled`) or blocked (with a notice for ad-block users).
- **Midgame** ad only at the transition to the next day ("Next day", never on a navigation button), never before
  day 3 is completed, at most once every 3 minutes (`midgameAllowed`, `MidgameThrottle`).
- **Rewarded** ads: see the table in *Progression & reward loop*. The reward is only given when the video finishes. The reward is only given in
  `adFinished`; on `adError` a short message is shown and nothing is lost.
- `happytime()` is called when a recipe is unlocked (if the SDK supports it).
- Game audio is suspended while an ad plays.
