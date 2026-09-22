# PaintAI — vector rebuild v2

Editable vector artwork and desktop app icon exports. This is a design revision for review; it has not been installed or tested in a running PaintAI application.

## Design

- Nested Gem-style wire with an open outer end holding the brush.
- The inner return forms the P; no separate P glyph or panel.
- Eyes sit on the wire. Brows only; no mouth or catchlights.
- Main SVG: 64-unit grid, 4-unit strokes with round caps and joins throughout.
- Charcoal #252B30, teal #00B8A9. Dark-surface variant uses #F4F7F7 wire and charcoal pupils.
- The 16px optical master has a 1.5px wire and removes eyes/brows. Used at 16–24px. The mascot appears from 32px upward.
- No text is embedded in the icon.

## Files

`svg/paintai-icon.svg`: editable full mascot.
`svg/paintai-icon-16.svg`: dedicated small-size source.
`svg/paintai-icon-dark.svg`, `svg/paintai-icon-16-dark.svg`: dark-surface sources.
`svg/paintai-symbol.svg`: face-free color symbol.
`svg/paintai-silhouette.svg`: black wire and brush, without face details.
`svg/paintai-wordmark.svg`: standalone outlined wordmark; no installed font required to display.
`svg/paintai-lockup.svg`: horizontal icon + wordmark.
`png/`: transparent RGBA exports at 16, 24, 32, 48, 64, 128, 256, 512, 1024 pixels.
`src-tauri/icons/`: desktop PNG, ICO and ICNS assets.
`PaintAI-Vector-Preview.png`: light/dark, silhouette and actual-size review sheet.

## Tauri desktop integration

Copy `src-tauri/icons/` into the application's corresponding directory. Merge the `bundle.icon` array from `tauri-bundle-icons.json` into the existing configuration. Do not replace the full configuration.

ICO embeds native-size layers for 16, 24, 32, 48, 64 and 256 pixels; 32px is first. ICNS includes 16 through 1024 pixels plus retina slots. PNG exports are square RGBA. These follow Tauri's documented manual desktop icon requirements:
https://v2.tauri.app/develop/icons/

The included set targets desktop, not the generated iOS or Android project asset catalogs. Keep the manually tuned small-size exports if regenerating icons with the Tauri CLI; a single large SVG cannot automatically retain the alternate micro artwork.

## Rebuilding

Requires Python with Pillow and fontTools, Node.js with sharp, and DejaVu Sans Bold at the path used in `source/build.py`. The font is only needed to regenerate the already outlined wordmark.

Run from the package directory:

    python source/build.py
    node source/render.cjs
    python source/package.py

`CODEX_PRIMARY_RUNTIME_NODE_MODULES` is optional; when absent, install sharp in the local working directory.

Validation performed: all PNG dimensions/modes, ICO layer dimensions, ICNS decoding, small-size border checks, and visual inspection of the preview. The silhouette has not been tested with independent viewers. Evaluate recognition in context before choosing this as the final brand.
