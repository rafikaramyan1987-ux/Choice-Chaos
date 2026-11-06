# Stick Duel — CrazyGames submission

## Files

| What | Where |
|---|---|
| Game build (zip-ready, `index.html` at the root, single file, no external requests except the CrazyGames SDK) | `build/index.html` |
| Cover 16:9 (1920×1080) | `covers/cover-1920x1080.png` |
| Cover 2:3 (800×1200) | `covers/cover-800x1200.png` |
| Cover 1:1 (800×800) | `covers/cover-800x800.png` |
| Gameplay video, landscape 1920×1080, 18 s, no sound | `videos/stick-duel-landscape-1920x1080.mp4` |
| Gameplay video, portrait 1080×1920, 18 s, no sound | `videos/stick-duel-portrait-1080x1920.mp4` |

Covers show the game title only, with the top-left corner kept clear, and are rendered from a real duel
(castle boss). The videos are recorded from real gameplay in Chromium (castle headshot, mountains axe throw,
desert spear, snow bomb, volcano boss K.O.); the first frame is the cover.

To rebuild everything: `npm ci && npm run build:crazygames && cp dist/index.html submission/build/ && npm run build && npm run covers && npm run videos`.

## Title

Stick Duel

## Description (short)

Drag back, release, bonk! Turn-based physics duels with floppy stick figures across six worlds and six bosses.

## Description (long)

Stick Duel is a juicy turn-based physics duel. Drag back and release to fire arrows, throw axes, spears,
bombs and boomerangs at your stick-figure rival. Every hit makes the ragdoll flop, stagger and tumble —
aim for the head for a HEADSHOT bonus!

Travel through six worlds — a whispering forest, castle ramparts, windy mountain peaks, a sandstorm desert,
a slippery frozen lake and a crumbling volcano — each with its own obstacles, wind and enemies. Beat the
boss at the end of every world, earn up to three stars per level and spend your coins on new weapons, hats
and colours. Duel a friend on the same device, or see how many enemies you can beat in Endless mode.

No blood, no gore: just sparks, stars and comic damage numbers.

## Controls

- Mouse / touch: drag back anywhere and release to shoot (the dotted line shows your aim, the arc shows your power).
- Tap the weapon buttons (or keys 1–6) to switch weapons.
- Keyboard: ↑/↓ aim, ←/→ power, Space/Enter fire, P/Esc pause.

## Tags

Archery, Stickman, Physics, Ragdoll, Turn Based, 2 Player, Bow, Boss, Shooting, Casual

## Details

- Languages: English, French (auto-detected, switchable in Settings)
- Platforms: desktop and mobile, landscape and portrait
- Age: suitable for PEGI 7 (cartoon, no blood)
- Save: CrazyGames Data module (progress, stars, coins, unlocks, settings)
- Ads: midgame only between levels; optional rewarded ads (revive once in a boss fight, ×2 coins, try a
  locked weapon for one duel). The game always continues if an ad is unavailable.
