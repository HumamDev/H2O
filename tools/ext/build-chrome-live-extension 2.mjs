// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  removeArchiveWorkbenchFromOut,
  syncArchiveWorkbenchToOut,
} from "./pack-studio.mjs";
import {
  applyExtensionIconsToManifest,
  writeExtensionIcons,
} from "./write-extension-icons.mjs";
import { createChromeLiveBuildContext } from "./chrome-live-build-context.mjs";
import { createChromeLiveSourceSnapshots } from "./chrome-live-source-snapshots.mjs";
import { makeChromeLiveManifest } from "./chrome-live-manifest.mjs";
import { makeChromeLiveFolderBridgePageJs } from "./chrome-live-folder-bridge.mjs";
import { makeChromeLiveBackgroundJs } from "./chrome-live-background.mjs";
import { makeChromeLiveLoaderJs } from "./chrome-live-loader.mjs";
import { makeChromeLivePopupHtml } from "./chrome-live-popup-html.mjs";
import { makeChromeLivePopupCss } from "./chrome-live-popup-css.mjs";
import { makeChromeLivePopupJs } from "./chrome-live-popup-js.mjs";
import { makeChromeLiveReadme } from "./chrome-live-readme.mjs";
// @version 1.3.0

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PANEL_ICON_DIR_CANDIDATES = [
  ["assets", "dev-controls-icons"],
  ["dev-controls-icons"],
];
const PANEL_ICON_SOURCE_FILE = "icon128.png";
const PANEL_ICON_OUTPUT_DIR = "panel-icons";
const PANEL_ICON_OUTPUT_FILE = "icon128.png";

const {
  SRC,
  OUT_DIR,
  PROXY_PACK_URL,
  CHAT_MATCH,
  STORAGE_KEY,
  STORAGE_ORDER_OVERRIDES_KEY,
  DEV_HAS_CONTROLS,
  DEV_VERSION,
  DEV_TITLE,
  DEV_NAME,
  DEV_DESCRIPTION,
  DEV_TAG,
  DEV_ORDER_FILE,
  PAGE_FOLDER_BRIDGE_FILE,
} = createChromeLiveBuildContext();

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeTextFileAtomic(fp, txt) {
  const target = path.resolve(fp);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(temp, String(txt), "utf8");
  fs.renameSync(temp, target);
}

function copyFileAtomic(sourceFile, outFile) {
  const target = path.resolve(outFile);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.copyFileSync(sourceFile, temp);
  fs.renameSync(temp, target);
}

const {
  DEV_ORDER_SECTIONS_SNAPSHOT,
  DEV_ALIAS_FILENAME_MAP,
  DEV_SCRIPT_CATALOG,
} = createChromeLiveSourceSnapshots({
  srcRoot: SRC,
  orderFile: DEV_ORDER_FILE,
});

function writeFile(fp, txt) {
  writeTextFileAtomic(fp, txt);
}

function fileExists(fp) {
  try {
    fs.accessSync(fp, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((value) => path.resolve(value)))];
}

function resolvePanelIconSourceDir() {
  const roots = uniquePaths([SRC, path.resolve(SRC, ".."), SCRIPT_DIR, process.cwd()]);
  for (const root of roots) {
    for (const parts of PANEL_ICON_DIR_CANDIDATES) {
      const candidate = path.join(root, ...parts);
      if (fileExists(path.join(candidate, PANEL_ICON_SOURCE_FILE))) {
        return candidate;
      }
    }
  }
  return null;
}

function copyPanelIconAsset(outDir) {
  const sourceDir = resolvePanelIconSourceDir();
  if (!sourceDir) {
    throw new Error(
      `[H2O] Missing panel icon pack. Expected ${PANEL_ICON_SOURCE_FILE} in assets/dev-controls-icons.`,
    );
  }

  const outSubdir = path.join(outDir, PANEL_ICON_OUTPUT_DIR);
  const sourceFile = path.join(sourceDir, PANEL_ICON_SOURCE_FILE);
  const outFile = path.join(outSubdir, PANEL_ICON_OUTPUT_FILE);
  ensureDir(outSubdir);
  copyFileAtomic(sourceFile, outFile);
  return `${PANEL_ICON_OUTPUT_DIR}/${PANEL_ICON_OUTPUT_FILE}`;
}

async function main() {
  ensureDir(OUT_DIR);

  const iconOutputs = await writeExtensionIcons(OUT_DIR, {
    mode: DEV_HAS_CONTROLS ? "dev" : "dev-lean",
    scriptDir: SCRIPT_DIR,
    srcRoot: SRC,
  });

  const manifest = applyExtensionIconsToManifest(
    makeChromeLiveManifest({
      PROXY_PACK_URL,
      CHAT_MATCH,
      PAGE_FOLDER_BRIDGE_FILE,
      DEV_HAS_CONTROLS,
      DEV_TITLE,
      DEV_NAME,
      DEV_VERSION,
      DEV_DESCRIPTION,
    }),
    iconOutputs,
  );

  writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFile(path.join(OUT_DIR, "bg.js"), makeChromeLiveBackgroundJs({
    DEV_TAG,
    CHAT_MATCH,
    DEV_HAS_CONTROLS,
  }));
  writeFile(path.join(OUT_DIR, "loader.js"), makeChromeLiveLoaderJs({
    DEV_TAG,
    DEV_TITLE,
    DEV_HAS_CONTROLS,
    PROXY_PACK_URL,
    DEV_SCRIPT_CATALOG,
    DEV_ORDER_SECTIONS_SNAPSHOT,
    STORAGE_KEY,
    STORAGE_ORDER_OVERRIDES_KEY,
    PAGE_FOLDER_BRIDGE_FILE,
  }));
  writeFile(path.join(OUT_DIR, PAGE_FOLDER_BRIDGE_FILE), makeChromeLiveFolderBridgePageJs());

  if (DEV_HAS_CONTROLS) {
    const panelLogoPath = copyPanelIconAsset(OUT_DIR);
    writeFile(path.join(OUT_DIR, "popup.html"), makeChromeLivePopupHtml({ panelLogoPath }));
    writeFile(path.join(OUT_DIR, "popup.css"), makeChromeLivePopupCss());
    writeFile(path.join(OUT_DIR, "popup.js"), makeChromeLivePopupJs({
      PROXY_PACK_URL,
      STORAGE_KEY,
      STORAGE_ORDER_OVERRIDES_KEY,
      DEV_ORDER_SECTIONS_SNAPSHOT,
      DEV_ALIAS_FILENAME_MAP,
    }));
    syncArchiveWorkbenchToOut(SRC, OUT_DIR);
  } else {
    for (const n of ["popup.html", "popup.css", "popup.js"]) {
      try {
        fs.unlinkSync(path.join(OUT_DIR, n));
      } catch {}
    }
    removeArchiveWorkbenchFromOut(OUT_DIR);
  }

  writeFile(path.join(OUT_DIR, "README.txt"), makeChromeLiveReadme({
    OUT_DIR,
    PROXY_PACK_URL,
    DEV_HAS_CONTROLS,
  }));

  console.log("[H2O] " + (DEV_HAS_CONTROLS ? "dev controls" : "dev lean loader") + " extension generated:");
  console.log("[H2O] out:", OUT_DIR);
  console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
  console.log("[H2O] proxy pack:", PROXY_PACK_URL);
  console.log(
    "[H2O] icons:",
    iconOutputs.source === "ready-pack"
      ? `ready pack ${iconOutputs.readyIconDir}`
      : `generated from ${iconOutputs.sourcePath}`,
  );
  console.log("[H2O] icon sizes:", iconOutputs.copiedSizes.join(", "));
}

main().catch((error) => {
  console.error("[H2O] Chrome live extension build failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
