# Icons

Tauri's `bundle.icon` config (in `../tauri.conf.json`) declares the
following icon files. M1 is committed WITHOUT real icons because they
are binary blobs and not necessary for the boot proof (`tauri dev` uses
Tauri's built-in defaults).

Expected files:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns`  (macOS)
- `icon.ico`   (Windows)

## Generate from a source PNG

Once you have a 1024x1024 source PNG for the H2O Studio logo, run:

```bash
cd ../..               # to apps/studio-desktop/
cargo tauri icon /path/to/h2o-studio-1024.png
```

This populates this directory with all required sizes + formats.

## When are icons required?

- `tauri dev` — **NOT required** (Tauri uses default placeholder icons)
- `tauri build` — **REQUIRED** (the bundler reads these to package
  the app); without them, `tauri build` fails

So M1 boot proof works without icons. M2 or later (when we want to
distribute a real `.dmg`) needs them.
