# Choice Chaos

A mobile-first web game: a short situation appears, you pick one of 2–3 choices, and four meters move —
💰 Money, ❤️ Relationships, 😊 Happiness, ⭐ Reputation (0–100, start 50). Hit 0 or 100 on any meter and the run
ends with one of **20 endings** (8 meter endings + 12 special combinations). Every run ends with a shareable
**archetype card** drawn on a canvas.

- 100 original situations (≈70 % humour, ≈30 % serious dilemmas), English + French
- Follow-up situations: some choices come back later ("you lied to your boss…")
- Endings collection, best-run stats and a daily "Situation of the day" (same for everyone, UTC date seed)
- Tap, swipe (left = first choice, right = last choice) or keyboard (`1` `2` `3`, `←` `→`, `↑` for the middle one)
- CrazyGames HTML5 SDK v3 through a small adapter (no-op everywhere else)
- No backend, no cookies, no analytics, no external fonts/CDN (the GitHub Pages build makes zero external requests)

## Commands

```bash
npm ci                 # install
npm run dev            # local dev server
npm run check          # lint + typecheck + unit tests
npm run build          # production build (GitHub Pages) -> dist/
npm run test:e2e       # Playwright smoke test at 390px (builds must exist: run `npm run build` first)
npm run build:crazygames && npm run zip   # CrazyGames build -> choice-chaos-crazygames.zip
```

Add `?seed=123` to the URL to get a reproducible run order (used by the tests).

## Editing content (no code needed)

| What | File |
| --- | --- |
| Situation structure: effects per choice, `serious`, `art`, follow-up flags (`sets` / `requires`), `tags` | `src/data/situations.json` |
| All texts (UI, situations, endings, archetypes) per language | `src/i18n/en.json`, `src/i18n/fr.json` |

- A situation's texts are under `situations.<id>` in each language file: `text` (≤ 180 chars) and `choices`
  (≤ 40 chars each, same order as in `situations.json`).
- Effects (`fx`) use the keys `money`, `love`, `joy`, `rep`. Values are multiplied by a small escalation factor
  during a run so every run reaches an ending in ~3–5 minutes (see `escalation()` in `src/core/engine.ts`).
- Follow-ups: a choice with `"sets": "my_flag"` unlocks the situation with `"requires": "my_flag"`; it is inserted
  2–4 situations later.
- Tags: `lie`, `honest`, `kind`, `selfish` feed the archetype and the "Pinocchio" ending.
- `npm test` validates all content (lengths, translations, flags, art keys).

### Adding a language (e.g. German)

1. Copy `src/i18n/en.json` to `src/i18n/de.json` and translate every value (keep the keys).
2. In `src/i18n/index.ts`: `import de from './de.json';` and add `de` to `LOCALES`.

The language picker and browser detection pick it up automatically; the content tests check it too.

## Real choice statistics later

There is **no** "x % of players chose this" display, because there is no backend and fake numbers are not allowed.
`src/platform/stats.ts` defines `ChoiceStatsProvider`; the app uses `NullChoiceStats` (returns `null`, so nothing is
shown). To add real stats, implement the interface with your API and pass it in `src/main.ts`.

## Ads (CrazyGames)

`src/platform/ads.ts` is the interface, `src/platform/crazygames.ts` the SDK v3 implementation.

- The SDK `<script>` is only injected in the `crazygames` build mode (`vite.config.ts`).
- `SDK.init()` is awaited before anything else; `loadingStart/loadingStop` around boot;
  `gameplayStart` while a run is being played, `gameplayStop` on menus, endings and before ads
  (calls are de-duplicated by `GameplayTracker`).
- **Midgame** ad only between runs ("Play again"), at most once every 3 minutes (`MidgameThrottle`).
- **Rewarded** ads: "Undo my last choice" (once per run) and "Second chance" (continue once after a meter ending).
  The reward is only given in `adFinished`; on `adError` (no fill, adblock) a message is shown and the game continues.
- Game audio is suspended while an ad plays.
- Outside CrazyGames (`NoopPlatform`) no ad is shown and rewarded features are granted directly so they can be tested.

## Storage

Progress is stored in `localStorage` under `choice-chaos.save.v1` (all accesses wrapped in `try/catch`, with an
in-memory fallback). No cookies.
