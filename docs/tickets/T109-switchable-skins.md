# T109 — Switchable skins (six dogfood-testable themes)

User decision (2026-06-11): build ALL six mockup directions as token
skins, switchable from Settings, and pick by dogfooding. Maintenance
tradeoff understood. Structural ideas (D3 capacity dial, D6 proportional
stack, shape-coded pillars, D4 stamp habits) stay OUT of this ticket —
cherry-picked later once a favourite emerges.

## Architecture
Convert the static Ex3Colors object + Type.kt into an Ex3Theme
(palette + typography + shape tokens) provided via CompositionLocal,
selected by a persisted Settings preference ("Skin"). All ui/* reads
stay source-compatible (Ex3Colors.x becomes a val backed by the
current theme) so the refactor is mechanical. Light skins set proper
status-bar/content contrast.

Token set per skin: bg, surface, raised, ink, inkMuted, inkFaint,
hairline, accent, accentSoft, missed, done-treatment, pillar palette
(6-8), fontBody, fontDisplay, fontMeta(mono?), radius scale, border
style (hairline vs 1px ink), letterspacing for labels.

## The seven skins (token values from the user's mockups)
0. warm-dark (current; default) — as built.
1. broadsheet — paper #f4edda, ink #221b10, faint rgba(34,27,16,0.55),
   accent #bf3517; display 'Instrument Serif', meta 'Archivo Narrow'
   smallcaps; hairlines = 1px ink rules; pillar differentiation: 6
   muted inks (hatching is structural, skip v1). LIGHT skin.
2. phosphor — bg #0b0c08, everything amber #ffb000 (dim 0.45 / faint
   0.22 alphas), mono 'JetBrains Mono', uppercase labels, square
   corners, no fills (border-only chips).
3. flightdeck — bg #14171b, panel #1a1e24, edge #272e37, text #e9e7e2,
   mute #8a929c, accent #ff5a1f, warn #e8a33d; sans 'Space Grotesk',
   numerals 'IBM Plex Mono'; pillars [#c9a84c,#4e94a3,#c05a4e,#8d7bb5,
   #cf8b3e,#8aa05a].
4. fieldnotes — paper #ede2c8, ink #2c2316, faint 0.5 alpha, accent
   #b3402a; body 'Special Elite' (typewriter), accents 'Caveat'
   (handwritten); dashed underlines as hairlines. LIGHT skin.
5. afterburner — bg #060608, card #0e0e12, edge #1d1d24, text #f2f0ee,
   mute #6f6e78, accent #ff6a00 with #ff2d78 gradient pair (use hot as
   accent, pink as second accent), numerals 'Rajdhani'.
6. bauhaus — bg #f5f0e4, ink #211d16, mute 0.55 alpha; display Archivo
   900; pillars [#d9a521,#297a80,#d4552e,#7b5ea7,#8a5a3b,#7d8c4a];
   accent = pillar yellow #d9a521 or red #d4552e (pick red for actions);
   bold borders (2px ink) instead of hairlines. LIGHT skin.

## Fonts
Bundle via Google Fonts downloadable fonts or res/font (prefer res/font
for offline: Instrument Serif, Archivo (400/600/900), Archivo Narrow,
JetBrains Mono, Space Grotesk, IBM Plex Mono, Special Elite, Caveat,
Rajdhani — license: all OFL).

## Settings
"Skin" picker (radio list with a small color-dot preview per skin) in
SettingsScreen; persisted in the existing SettingsStore; applies live
(no restart).

## Verify
All screens readable in every skin (esp. the three LIGHT skins:
status bar, hold-sweep alpha, hairlines); gradle tests green; adb
screenshot review of Today + Pages + balance sheet in each skin.
