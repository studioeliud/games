# Notices

The additional ground effects and spell icons are rendered from
[PixelFX at 5294518](https://github.com/patch-gg/pixelfx/tree/5294518ce7c72e48b6100a744596e0acf57f2826)
under the accompanying MIT license. The frost ring adapts the palette and ground-plane angle of
`water/ripples`. Additional effects were rendered against transparent
backgrounds at 24 fps and packed into sprite atlases. The matching icons
are cropped frames from the same effects.
The basic fire attack uses the burning atlas from the PixelFX status/burning preset.

`coin-collect-burst.png` and `coin-collect-token.png` adapt the same revision's
`ui/coin-collect` preset. The flight and counter use the game's Gold HUD.

Combat runs 61 presets from the same revision in the browser, including ui/damage-number and ui/crit-number.
`scripts/build-hex-fx.mjs` selects the modules from the spell catalog and bundles
them with the PixelFX renderer. The spell preview and combat share these modules.

**Hugo Duprez.** `src/core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.

**Hollow Crown.** `src/core/act.js` adapts how Hollow Crown plays its skills (poses on 12 fps steps, hit-stops, the springy
straw target), from
https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026 rehan-remade, MIT License.

**Patch Pixel.** The font in `gallery/fonts` is Patch's own and is not covered by this repository's MIT license. See
`gallery/fonts/NOTICE.md`.
