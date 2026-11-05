# Cozy Café — CrazyGames submission package

Everything you need for the CrazyGames Developer Portal submission form.

| Item | Where |
| --- | --- |
| Game build (zip, `index.html` at the root) | CI artifact **`cozy-cafe-crazygames`** → `cozy-cafe-crazygames.zip` (see *Build* below) |
| Cover 16:9 (1920×1080) | [`covers/cover-1920x1080.png`](covers/cover-1920x1080.png) |
| Cover 2:3 (800×1200) | [`covers/cover-800x1200.png`](covers/cover-800x1200.png) |
| Cover 1:1 (800×800) | [`covers/cover-800x800.png`](covers/cover-800x800.png) |
| Preview video, landscape 1080p 16:9 | [`videos/cozy-cafe-landscape-1920x1080.mp4`](videos/cozy-cafe-landscape-1920x1080.mp4) |
| Preview video, portrait 1080p 2:3 | [`videos/cozy-cafe-portrait-1080x1620.mp4`](videos/cozy-cafe-portrait-1080x1620.mp4) |

## Title

**Cozy Café**

## Description (EN)

Run your own little café and make every guest smile! Cozy Café is a relaxing cooking game where orders are shown
as pictures: a frothy latte, a warm croissant, a berry smoothie, a cheesy toastie or a chocolate crêpe. Tap the
ingredients in the right order, hold to pour milk or sauce and release in the green zone, and tap the toaster or
blender at just the right moment. Better quality means more stars, happier guests and bigger tips. There is no timer
stress and no game over, so you can play at your own pace. Earn coins to unlock new recipes, faster machines and
lovely decorations, and expand your café with tables, a sunny terrace, a bakery corner, an ice-cream bar and helpful
staff. Complete daily missions, claim gifts, take on the daily challenge, collect stickers of all your guests and
welcome VIPs, food critics and even celebrities!

## Description (FR)

Tiens ton propre petit café et fais sourire chaque client ! Cozy Café est un jeu de cuisine relaxant où les
commandes s'affichent en images : un latte mousseux, un croissant tiède, un smoothie aux baies, un croque fondant ou
une crêpe au chocolat. Touche les ingrédients dans le bon ordre, maintiens pour verser le lait ou la sauce et relâche
dans la zone verte, puis arrête le grille-pain ou le mixeur au bon moment. Plus la qualité est bonne, plus tu gagnes
d'étoiles, de sourires et de pourboires. Pas de chrono stressant, pas de game over : tu joues à ton rythme. Gagne des
pièces pour débloquer de nouvelles recettes, des machines plus rapides et de jolies décorations, puis agrandis ton
café avec des tables, une terrasse ensoleillée, un coin boulangerie, un bar à glaces et une équipe pour t'aider.
Réussis les missions du jour, ouvre des cadeaux, relève le défi quotidien, collectionne les autocollants de tes
clients et accueille des VIP, des critiques culinaires et même des célébrités !

## Controls

**EN**
- Mouse / touch: tap an ingredient to add it (or drag it onto the counter).
- Hold the button on liquids and toppings to pour; release in the green zone.
- For the toaster, griddle, oven and blender: tap, then tap again when the bar is in the green zone.
- Tap the bell to serve.
- Keyboard: Tab to focus an ingredient, then Space/Enter (hold Space to pour).

**FR**
- Souris / tactile : touche un ingrédient pour l'ajouter (ou glisse-le sur le comptoir).
- Maintiens le bouton des liquides et garnitures pour verser, puis relâche dans la zone verte.
- Grille-pain, crêpière, four et mixeur : touche, puis touche à nouveau quand la barre est dans le vert.
- Touche la cloche pour servir.
- Clavier : Tab pour choisir un ingrédient, puis Espace/Entrée (maintiens Espace pour verser).

## Category & tags (suggestion)

These are suggestions only; choose the closest entries from the lists the Developer Portal offers.

- **Category:** Casual
- **Tags:** Cooking, Restaurant, Food, Management, Relaxing, Cute, Mouse,
  Touch / Mobile
- **Orientation:** both. Portrait on phones, and a two-column landscape layout on desktop/tablet (16:9 and 4:3).
- **Progress save toggle:** **ON**. The game saves through the SDK data module on CrazyGames.

## CrazyGames requirements check

Checked against docs.crazygames.com/requirements (technical, gameplay, ads, game covers) on 2026-11-05.

| Requirement | Status |
| --- | --- |
| Initial download ≤ 50 MB (≤ 20 MB for the mobile homepage) | ✅ about 0.15 MB unpacked, 50 KB zipped |
| Total ≤ 250 MB, ≤ 1,500 files, relative paths only | ✅ 4 files, all `./` paths |
| SDK v3: `init`, `loadingStart/Stop`, `gameplayStart/Stop` (no duplicates), `happytime` | ✅ |
| Land new users directly in gameplay | ✅ **fixed**: a new player starts day 1 immediately (no menu, no popup) |
| Ads only through the SDK; game paused/muted while an ad plays (muted only when it really starts) | ✅ |
| Midgame only at a level transition, never on a navigation button | ✅ **fixed**: only on "Next day" (was also on "Café") |
| Rewarded button never on an active gameplay screen | ✅ **fixed**: the "make an order 3★" offer moved from gameplay to the end-of-day summary |
| Rewarded: optional, video icon, same look as the "no video" choice, an alternative way, capped | ✅ **fixed**: equal-looking buttons, gem alternatives (VIP call, 3★ upgrade, recipe unlock, construction), daily caps |
| No reward on `adError`; `adsDisabled` (Basic Launch) / adblock → no video buttons left without effect | ✅ **added**: video offers are hidden, with a notice when an ad blocker is detected |
| Works with an ad blocker | ✅ fully playable, nothing locked |
| `muteAudio` game setting respected (overrides the in-game toggle) | ✅ **added** |
| Progress saved with the SDK data module | ✅ **added** (localStorage elsewhere) |
| Language from the SDK locale (`systemInfo.locale`), English fallback, EN + FR | ✅ **added** |
| Readable on 16:9 iframe sizes (907×510 … 1920×1080, 800×450 mobile) | ✅ **added**: landscape layout scaled to fit, no scrolling during play (tested) |
| No custom fullscreen button, no external links / cross-promotion / other portals' branding | ✅ |
| PEGI 12 | ✅ friendly cooking content only; no violence, no purchases |
| iOS audio resumes after interruption (touchend/click), `user-select: none`, safe-area padding | ✅ |
| No console errors | ✅ checked in Playwright at 390×844, 907×510, 800×450 and 1920×1080 (the SDK script itself only loads on CrazyGames) |
| Covers: 1920×1080, 800×1200, 800×800, consistent, title only, no borders/icons/logos | ✅ |
| Videos: 15–20 s, ≤ 50 MB, 1080p 16:9 and 2:3, no sound, no fast-forward, cover as first frame, no cursor, no black frames/bars, no promo text | ✅ 19 s, about 2 MB each, H.264, no audio track; blackdetect found 0 black frames |

## Build

The CrazyGames build is made by CI on every push and pull request (`.github/workflows/ci.yml`, step
"Build CrazyGames zip").

To download it:
1. Open the repository's **Actions** tab and pick the latest green **CI** run.
2. Download the artifact **`cozy-cafe-crazygames`**. It contains `cozy-cafe-crazygames.zip`.
3. Upload that zip as the HTML5 game.

To build it locally:

```bash
npm ci
npm run build:crazygames && npm run zip     # → cozy-cafe-crazygames.zip (index.html at the zip root)
```

## Re-generating covers and videos

```bash
npm run covers                       # → submission/covers/*.png (uses the game's SVG art + the title)
npm run build && npm run videos      # → submission/videos/*.mp4 (needs ffmpeg; the bot plays the real game)
VIDEO_SEED=20 npm run videos         # other orders (default 50: a VIP latte, then a food critic's smoothie)
```

The cover title uses the Fredoka font (SIL Open Font License 1.1). It is a dev dependency used only to render the
covers and is not shipped in the game.
