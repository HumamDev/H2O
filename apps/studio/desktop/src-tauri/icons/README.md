# Icons — placeholders

The PNG + ICNS files in this directory were generated from
`assets/chrome-dev-lean-icons/icon1024.png` (the H2O dev-lean icon set,
not Studio-specific) at M1 commit time using macOS-built-in tools:

```bash
SRC=assets/chrome-dev-lean-icons/icon1024.png
sips -Z 32  $SRC --out 32x32.png
sips -Z 128 $SRC --out 128x128.png
sips -Z 256 $SRC --out 128x128@2x.png

# .icns via the iconset → iconutil pipeline
mkdir icon.iconset
sips -Z 16   $SRC --out icon.iconset/icon_16x16.png
sips -Z 32   $SRC --out icon.iconset/icon_16x16@2x.png
sips -Z 32   $SRC --out icon.iconset/icon_32x32.png
sips -Z 64   $SRC --out icon.iconset/icon_32x32@2x.png
sips -Z 128  $SRC --out icon.iconset/icon_128x128.png
sips -Z 256  $SRC --out icon.iconset/icon_128x128@2x.png
sips -Z 256  $SRC --out icon.iconset/icon_256x256.png
sips -Z 512  $SRC --out icon.iconset/icon_256x256@2x.png
sips -Z 512  $SRC --out icon.iconset/icon_512x512.png
sips -Z 1024 $SRC --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -r icon.iconset
```

These are sufficient to satisfy `tauri::generate_context!()` at compile
time and to serve as window / Dock / bundle icons for `tauri dev` and
`tauri build` on macOS during M1.

## Replace before public release

Before any public-facing build, replace these with real H2O Studio
icons. The cleanest path:

1. Get a 1024×1024 source PNG of the H2O Studio brand mark.
2. Run `cargo tauri icon /path/to/h2o-studio-1024.png` from
   `apps/studio/desktop/`. This regenerates all sizes consistently.
3. Replace `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` in
   this folder.

## Windows / Linux

The current `tauri.conf.json` declares only macOS-relevant icons
(`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`). When V1.x
adds Windows / Linux targets:

- Add `icon.ico` (Windows) — generate via ImageMagick:
  `convert icon.iconset/icon_256x256.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`
- Reinstate the `"icons/icon.ico"` entry in `tauri.conf.json`'s
  `bundle.icon` array.
- Linux uses the PNG variants already present.

## When are icons actually required?

- `tauri dev` — **required** (the `generate_context!()` proc-macro
  reads them at compile time and embeds them into the binary)
- `tauri build` — required for the same reason + for the bundler

So both flows need the files declared in `bundle.icon` to exist on disk.
