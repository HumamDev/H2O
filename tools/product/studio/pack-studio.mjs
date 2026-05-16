// @version 2.1.0
import fs from "node:fs";
import path from "node:path";

export const ARCHIVE_WORKBENCH_SOURCE_REL = path.join("surfaces", "studio");
export const ARCHIVE_WORKBENCH_SOURCE_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  // Studio Platform Adapter — must load after H2O Core and before any feature
  // module. Contracts: surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md.
  // Subdir entries; pack-studio's sync step creates parent dirs on copy.
  "platform/index.js",
  "platform/platform.mv3.js",
  "platform/platform.tauri.js",
  "platform/selectors.contract.js",

  // Studio Store (Stage 1 parallel infra) — loads after platform/ and before
  // any feature module. Contracts: surfaces/studio/store/README.md,
  // STUDIO_STORAGE_CONTRACT.md.
  "store/index.js",
  "store/highlights.js",
  "store/libraryIndex.js",
  // Desktop-only: SQLite-backed chats entity (M2a-3a). Self-detects Tauri
  // and silently no-ops on MV3 / web; safe to ship in chrome-live build.
  "store/chats.tauri.js",
  // Desktop-only: SQLite-backed snapshots entity (M2a-3b). Same gating
  // as chats.tauri.js; backs snapshots + snapshot_turns tables.
  "store/snapshots.tauri.js",
  // Desktop-only: SQLite-backed folders entity (M2a-3c). Same gating;
  // backs folders + folder_bindings tables. Must load after chats.tauri.js
  // because listChats() delegates to store.chats.
  "store/folders.tauri.js",
  // Desktop-only: SQLite-backed labels entity (M2a-3d). Same gating; backs
  // labels + label_bindings tables. Composite binding PK allows multiple
  // labels per chat. listChats() delegates to store.chats (same pattern).
  "store/labels.tauri.js",
  // Desktop-only: SQLite-backed tags entity (M2a-3e). Same gating + binding
  // shape as labels.tauri.js; tags has an auto_derived boolean and no
  // updated_at column.
  "store/tags.tauri.js",
  // Desktop-only: SQLite-backed categories entity (M2a-3f). No
  // category_bindings table — assignment lives in chats.category_id.
  // assignChat / clearChat write directly to chats; listChats delegates
  // to store.chats.
  "store/categories.tauri.js",
  // Desktop-only: full-bundle ingestion (M2b-1). dryRunImportBundle is
  // read-only; importBundle write side ships as stub returning
  // not-implemented (M2b-2 pending). Routed through callArchive's
  // Desktop branch in studio.js.
  "ingestion/import-bundle.tauri.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",

  // Library subsystem (Studio) — must match the <script> tag order in studio.html.
  // studio.html references these by filename; if any are missing from the bundle
  // the browser silently 404s the <script> tag and H2O.LibraryCore/etc. remain
  // undefined. Keep this list in lockstep with studio.html.
  "S0F0a. 🎬 Library Surface Host - Studio.js",
  // Phase 2A — shared registry core. Must load before any Library feature
  // owner so H2O.Library.RegistryCore is available when S0F1g sanitizes its
  // first record. Same index position in the OUT list.
  "S0F0c. 🎬 Library Registry Core - Studio.js",
  // Phase 2B — shared library-index core. Must load before S0F1c so the
  // shared module is available when Library Index hydrates/normalizes its
  // first row. Same index position in the OUT list.
  "S0F0d. 🎬 Library Index Core - Studio.js",
  // Phase 3B — shared folder-provider core. Must load before later folder
  // delegation phases. Same index position in the OUT list.
  "S0F0e. 🎬 Folder Provider Core - Studio.js",
  // Phase 4B — shared category-provider core. Must load before later category
  // delegation phases. Same index position in the OUT list.
  "S0F0f. 🎬 Category Provider Core - Studio.js",
  // Phase 5B — shared tag-provider core. Must load before later tag
  // delegation phases. Same index position in the OUT list.
  "S0F0g. 🎬 Tag Provider Core - Studio.js",
  // Phase 5C — shared label-provider core. Must load before later label
  // delegation phases. Same index position in the OUT list.
  "S0F0h. 🎬 Label Provider Core - Studio.js",
  // Phase 6B — shared project-provider core. Must load before later project
  // delegation phases. Same index position in the OUT list.
  "S0F0i. 🎬 Project Provider Core - Studio.js",
  "S0F1a. 🎬 Library Core - Studio.js",
  "S0F1e. 🎬 Library Store - Studio.js",
  "S0F1g. 🎬 Chat Registry - Studio.js",
  "S0F1c. 🎬 Library Index - Studio.js",
  "S0F2a. 🎬 Projects - Studio.js",
  "S0F3a. 🎬 Folders - Studio.js",
  "S0F4a. 🎬 Categories - Studio.js",
  "S0F5a. 🎬 Tags - Studio.js",
  "S0F6a. 🎬 Labels - Studio.js",
  "S0F1b. 🎬 Library Workspace - Studio.js",
  "S0F1d. 🎬 Library Insights - Studio.js",
  "S0F1f. 🎬 Library Maintenance - Studio.js",
  "S0F1h. 🎬 Library Sync - Studio.js",
  // Phase 1 — canonical services + H2O.flags. Loads after every feature owner
  // so canonical aliases resolve to real impls on the first registration pass.
  "S0F1k. 🎬 Library Canonical Services - Studio.js",
  "S0X1a. 🎬 Command Bar - Studio.js",
  "S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio.js",
  "S0Z1f. 🎬 Library Sidebar Tab - Studio.js",
  "S0Z1g. 🎬 Library Sidebar Sections - Studio.js",

  // Standalone Studio decorations referenced by studio.html.
  "S9D1a. 🎬 Auto Emoji Title - Studio.js",
]);
export const ARCHIVE_WORKBENCH_OUT_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  // Studio Platform Adapter — see SOURCE_FILES list above for context.
  "platform/index.js",
  "platform/platform.mv3.js",
  "platform/platform.tauri.js",
  "platform/selectors.contract.js",

  // Studio Store — see SOURCE_FILES list above for context.
  "store/index.js",
  "store/highlights.js",
  "store/libraryIndex.js",
  "store/chats.tauri.js",
  "store/snapshots.tauri.js",
  "store/folders.tauri.js",
  "store/labels.tauri.js",
  "store/tags.tauri.js",
  "store/categories.tauri.js",
  "ingestion/import-bundle.tauri.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",

  // Library subsystem (Studio). Out filenames are identical to source filenames —
  // studio.html references them by the same name and copyFileSync preserves them.
  // Keep this list in lockstep with ARCHIVE_WORKBENCH_SOURCE_FILES above
  // (the syncArchiveWorkbenchToOut copy is index-paired).
  "S0F0a. 🎬 Library Surface Host - Studio.js",
  "S0F0c. 🎬 Library Registry Core - Studio.js",
  "S0F0d. 🎬 Library Index Core - Studio.js",
  "S0F0e. 🎬 Folder Provider Core - Studio.js",
  "S0F0f. 🎬 Category Provider Core - Studio.js",
  "S0F0g. 🎬 Tag Provider Core - Studio.js",
  "S0F0h. 🎬 Label Provider Core - Studio.js",
  "S0F0i. 🎬 Project Provider Core - Studio.js",
  "S0F1a. 🎬 Library Core - Studio.js",
  "S0F1e. 🎬 Library Store - Studio.js",
  "S0F1g. 🎬 Chat Registry - Studio.js",
  "S0F1c. 🎬 Library Index - Studio.js",
  "S0F2a. 🎬 Projects - Studio.js",
  "S0F3a. 🎬 Folders - Studio.js",
  "S0F4a. 🎬 Categories - Studio.js",
  "S0F5a. 🎬 Tags - Studio.js",
  "S0F6a. 🎬 Labels - Studio.js",
  "S0F1b. 🎬 Library Workspace - Studio.js",
  "S0F1d. 🎬 Library Insights - Studio.js",
  "S0F1f. 🎬 Library Maintenance - Studio.js",
  "S0F1h. 🎬 Library Sync - Studio.js",
  "S0F1k. 🎬 Library Canonical Services - Studio.js",
  "S0X1a. 🎬 Command Bar - Studio.js",
  "S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio.js",
  "S0Z1f. 🎬 Library Sidebar Tab - Studio.js",
  "S0Z1g. 🎬 Library Sidebar Sections - Studio.js",

  // Standalone Studio decorations referenced by studio.html.
  "S9D1a. 🎬 Auto Emoji Title - Studio.js",
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

function tryRemoveEmptyDir(dirPath) {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    if ((fs.readdirSync(dirPath) || []).length > 0) return false;
    fs.rmdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}

export function archiveWorkbenchSourceDir(srcRoot) {
  return path.join(String(srcRoot || ""), ARCHIVE_WORKBENCH_SOURCE_REL);
}

export function getArchiveWorkbenchSourcePresence(srcRoot) {
  const dir = archiveWorkbenchSourceDir(srcRoot);
  return ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function archiveWorkbenchOutDir(outDir) {
  return path.join(String(outDir || ""), "surfaces", "studio");
}

export function getArchiveWorkbenchPresence(outDir) {
  const dir = archiveWorkbenchOutDir(outDir);
  return ARCHIVE_WORKBENCH_OUT_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function compareArchiveWorkbenchToSource(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const files = ARCHIVE_WORKBENCH_SOURCE_FILES.map((sourceName, index) => {
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    const sourcePath = path.join(sourceDir, sourceName);
    const outPath = path.join(outWorkbenchDir, outName);
    const sourceExists = fileExists(sourcePath);
    const outExists = fileExists(outPath);
    const equal = sourceExists && outExists ? readText(sourcePath) === readText(outPath) : false;
    return {
      name: outName,
      sourceName,
      outName,
      sourcePath,
      outPath,
      sourceExists,
      outExists,
      equal,
    };
  });

  return {
    sourceDir,
    outWorkbenchDir,
    files,
    matches: files.every((item) => item.sourceExists && item.outExists && item.equal),
  };
}

export function syncArchiveWorkbenchToOut(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const missingSource = ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => !fileExists(path.join(sourceDir, name)));
  if (missingSource.length) {
    throw new Error(`archive workbench source missing: ${missingSource.join(", ")}`);
  }

  ensureDir(outWorkbenchDir);
  for (let index = 0; index < ARCHIVE_WORKBENCH_SOURCE_FILES.length; index += 1) {
    const sourceName = ARCHIVE_WORKBENCH_SOURCE_FILES[index];
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    const outPath = path.join(outWorkbenchDir, outName);
    // Out filenames may now contain subdir segments (e.g. "platform/index.js"
    // for the Studio platform adapter). Ensure each parent dir exists before
    // copy so nested files don't fail with ENOENT.
    ensureDir(path.dirname(outPath));
    fs.copyFileSync(path.join(sourceDir, sourceName), outPath);
  }

  return {
    sourceDir,
    outWorkbenchDir,
    files: ARCHIVE_WORKBENCH_OUT_FILES.slice(),
  };
}

export function removeArchiveWorkbenchFromOut(outDir) {
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const removed = [];
  for (const name of ARCHIVE_WORKBENCH_OUT_FILES) {
    if (removeFileIfPresent(path.join(outWorkbenchDir, name))) removed.push(name);
  }
  tryRemoveEmptyDir(outWorkbenchDir);
  tryRemoveEmptyDir(path.dirname(outWorkbenchDir));
  return {
    outWorkbenchDir,
    removed,
  };
}
