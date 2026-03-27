#!/usr/bin/env node
// @version 1.0.0
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let SHARP_LIB = null;

function getSharp() {
  if (SHARP_LIB) return SHARP_LIB;
  SHARP_LIB = require('sharp');
  return SHARP_LIB;
}

/**
 * write-extension-icons-3.1.1.mjs
 *
 * Shared icon pipeline for the Chrome live extension.
 *
 * Responsibilities:
 * - Prefer copying a ready icon pack from assets/chrome-icons/
 * - Fall back to generating high-quality PNG sizes from a master PNG
 * - Write icons into <extension-out>/icons/ for the build flow
 * - Export manifest/action icon maps so the build script stays small
 * - Still support direct CLI generation when invoked manually
 */

const DEFAULT_SIZES = [16, 32, 48, 128, 256, 512, 1024];
const REQUIRED_READY_SIZES = [16, 32, 48, 128];
const ACTION_SIZES = [16, 32];
const DEFAULT_PADDING = 0.06;
const DEFAULT_READY_DIR_NAMES = [
  ['assets', 'chrome-icons'],
  ['chrome-icons'],
];
const DEFAULT_MASTER_ICON_NAMES = [
  ['assets', 'icon-master.png'],
  ['icon-master.png'],
  ['assets', 'chrome-icon-master.png'],
  ['chrome-icon-master.png'],
];

export async function writeExtensionIcons(outDir, modeOrOptions = {}, maybeOptions = {}) {
  const options = normalizeBuildOptions(modeOrOptions, maybeOptions);
  const extensionRoot = path.resolve(outDir);
  const iconsDir = resolveIconsOutputDir(extensionRoot, options);

  ensureDir(extensionRoot);
  resetIconsDir(iconsDir);
  removeLegacyRootIcons(extensionRoot);

  const readyPack = findReadyIconDir(options);
  if (readyPack) {
    const readyResult = copyReadyExtensionIcons(readyPack, iconsDir, options);
    await writeManifestSnippet(iconsDir, readyResult.manifestIcons);
    return readyResult;
  }

  const masterPng = resolveMasterIconPath(options);
  if (!masterPng) {
    const fallback = await generateFallbackExtensionIcons(iconsDir, options);
    await writeManifestSnippet(iconsDir, fallback.manifestIcons);
    return fallback;
  }

  const generated = await generateExtensionIconsFromMaster(masterPng, iconsDir, options);
  await writeManifestSnippet(iconsDir, generated.manifestIcons);
  return generated;
}

export function applyExtensionIconsToManifest(manifest, iconOutputs) {
  if (!iconOutputs?.manifestIcons) return manifest;

  const nextManifest = {
    ...manifest,
    icons: { ...iconOutputs.manifestIcons },
  };

  if (manifest?.action) {
    nextManifest.action = {
      ...manifest.action,
      default_icon: {
        ...(manifest.action.default_icon || {}),
        ...(iconOutputs.actionIcons || {}),
      },
    };
  }

  return nextManifest;
}

function normalizeBuildOptions(modeOrOptions, maybeOptions) {
  if (typeof modeOrOptions === 'string' || modeOrOptions == null) {
    return {
      mode: modeOrOptions || 'default',
      ...maybeOptions,
    };
  }

  return { ...modeOrOptions };
}

function resolveIconsOutputDir(extensionRoot, options) {
  if (options.iconDirMode === 'direct') {
    return extensionRoot;
  }
  const subdir = options.iconsSubdir || 'icons';
  return path.join(extensionRoot, subdir);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resetIconsDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function copyFileStrict(src, dest) {
  if (!fileExists(src)) {
    throw new Error(`[write-extension-icons] Missing icon file: ${src}`);
  }
  ensureDir(path.dirname(dest));
  const temp = `${dest}.tmp-${process.pid}-${Date.now()}`;
  fs.copyFileSync(src, temp);
  fs.renameSync(temp, dest);
}

function removeLegacyRootIcons(extensionRoot) {
  for (const size of DEFAULT_SIZES) {
    const filePath = path.join(extensionRoot, `icon${size}.png`);
    if (!fileExists(filePath)) continue;
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

function uniqueExistingDirs(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

function collectSearchRoots(options) {
  const roots = [];
  if (Array.isArray(options.readyIconSearchRoots)) roots.push(...options.readyIconSearchRoots);
  if (options.scriptDir) roots.push(options.scriptDir);
  if (options.srcRoot) roots.push(options.srcRoot);
  if (process.cwd()) roots.push(process.cwd());
  return uniqueExistingDirs(roots.filter(Boolean));
}

function getReadyIconDirCandidates(options) {
  const envDir = process.env.H2O_CHROME_ICONS_DIR;
  const candidates = [];

  if (envDir) candidates.push(path.resolve(envDir));

  for (const root of collectSearchRoots(options)) {
    for (const parts of DEFAULT_READY_DIR_NAMES) {
      candidates.push(path.join(root, ...parts));
    }
  }

  return uniqueExistingDirs(candidates);
}

function findReadyIconDir(options) {
  for (const dir of getReadyIconDirCandidates(options)) {
    const hasCoreSet = REQUIRED_READY_SIZES.every((size) =>
      fileExists(path.join(dir, `icon${size}.png`)),
    );
    if (hasCoreSet) {
      return dir;
    }
  }
  return null;
}

function copyReadyExtensionIcons(readyIconDir, iconsDir, options) {
  const sizesToCopy = Array.isArray(options.sizes) && options.sizes.length
    ? normalizeSizes(options.sizes)
    : DEFAULT_SIZES;

  const copiedSizes = [];
  for (const size of sizesToCopy) {
    const filename = `icon${size}.png`;
    const srcFile = path.join(readyIconDir, filename);
    if (!fileExists(srcFile)) continue;
    copyFileStrict(srcFile, path.join(iconsDir, filename));
    copiedSizes.push(size);
  }

  const missingCore = REQUIRED_READY_SIZES.filter((size) => !copiedSizes.includes(size));
  if (missingCore.length) {
    throw new Error(
      `[write-extension-icons] Ready icon pack is incomplete in ${readyIconDir}. Missing: ${missingCore.join(', ')}`,
    );
  }

  return {
    source: 'ready-pack',
    mode: options.mode || 'default',
    extensionRoot: options.iconDirMode === 'direct' ? path.dirname(iconsDir) : path.dirname(iconsDir),
    iconsDir,
    sourcePath: null,
    readyIconDir,
    sizes: copiedSizes,
    copiedSizes,
    manifestIcons: createManifestIconsMap(REQUIRED_READY_SIZES),
    actionIcons: createActionIconsMap(),
  };
}

function resolveMasterIconPath(options) {
  if (options.sourcePath) {
    const explicit = path.resolve(options.sourcePath);
    if (fileExists(explicit)) return explicit;
  }

  const envMaster = process.env.H2O_CHROME_ICON_MASTER;
  if (envMaster) {
    const explicit = path.resolve(envMaster);
    if (fileExists(explicit)) return explicit;
  }

  const candidates = [];
  for (const root of collectSearchRoots(options)) {
    for (const parts of DEFAULT_MASTER_ICON_NAMES) {
      candidates.push(path.join(root, ...parts));
    }
  }

  for (const candidate of uniqueExistingDirs(candidates)) {
    if (fileExists(candidate)) return candidate;
  }

  return null;
}

async function generateFallbackExtensionIcons(iconsDir, options) {
  const sharp = getSharp();
  const sizes = Array.isArray(options.sizes) && options.sizes.length
    ? normalizeSizes(options.sizes)
    : DEFAULT_SIZES;

  const mode = String(options.mode || 'default').trim().toLowerCase();
  const label = mode === 'dev-lean' ? 'H2O' : 'H2O';
  const svg = createFallbackIconSvg(label, mode);
  const baseBuffer = Buffer.from(svg, 'utf8');

  for (const size of sizes) {
    await sharp(baseBuffer, { density: 384 })
      .resize(size, size, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .png({
        compressionLevel: 9,
        effort: 10,
        palette: false,
        adaptiveFiltering: true,
      })
      .toFile(path.join(iconsDir, `icon${size}.png`));
  }

  return {
    source: 'fallback-generated',
    mode,
    extensionRoot: options.iconDirMode === 'direct' ? path.dirname(iconsDir) : path.dirname(iconsDir),
    iconsDir,
    sourcePath: null,
    readyIconDir: null,
    sizes,
    copiedSizes: [...sizes],
    manifestIcons: createManifestIconsMap(REQUIRED_READY_SIZES),
    actionIcons: createActionIconsMap(),
    placeholderLabel: label,
  };
}

function createFallbackIconSvg(label, mode) {
  const isLean = String(mode || '').trim().toLowerCase() === 'dev-lean';
  const gradA = isLean ? '#4f46e5' : '#0f766e';
  const gradB = isLean ? '#2563eb' : '#22c55e';
  const ring = isLean ? 'rgba(191,219,254,0.62)' : 'rgba(187,247,208,0.62)';
  const textColor = '#f8fafc';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradA}"/>
      <stop offset="100%" stop-color="${gradB}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="36" flood-color="rgba(15,23,42,0.35)"/>
    </filter>
  </defs>
  <rect x="86" y="86" width="852" height="852" rx="224" fill="url(#g)" filter="url(#shadow)"/>
  <rect x="126" y="126" width="772" height="772" rx="188" fill="none" stroke="${ring}" stroke-width="18"/>
  <circle cx="512" cy="312" r="66" fill="rgba(255,255,255,0.14)"/>
  <text x="512" y="620"
        text-anchor="middle"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif"
        font-size="248"
        font-weight="800"
        letter-spacing="10"
        fill="${textColor}">${label}</text>
</svg>`;
}

async function generateExtensionIconsFromMaster(sourcePath, iconsDir, options) {
  const sharp = getSharp();
  const sizes = Array.isArray(options.sizes) && options.sizes.length
    ? normalizeSizes(options.sizes)
    : DEFAULT_SIZES;
  const padding = parsePadding(options.padding ?? DEFAULT_PADDING);

  await ensureReadableFile(sourcePath);

  const input = sharp(sourcePath, { unlimited: true, failOn: 'none' }).ensureAlpha();
  const metadata = await input.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('[write-extension-icons] Could not read input image dimensions.');
  }

  const trimmed = input.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const trimInfo = await trimmed.png().toBuffer({ resolveWithObject: true });
  const trimmedWidth = trimInfo.info.width;
  const trimmedHeight = trimInfo.info.height;

  if (!trimmedWidth || !trimmedHeight) {
    throw new Error('[write-extension-icons] Trimmed image has invalid dimensions.');
  }

  const squareSide = Math.max(trimmedWidth, trimmedHeight);
  const paddedSide = Math.max(1, Math.round(squareSide / (1 - 2 * padding)));
  const offsetLeft = Math.round((paddedSide - trimmedWidth) / 2);
  const offsetTop = Math.round((paddedSide - trimmedHeight) / 2);

  const squareMasterBuffer = await sharp({
    create: {
      width: paddedSide,
      height: paddedSide,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimInfo.data, left: offsetLeft, top: offsetTop }])
    .png({ compressionLevel: 9, effort: 10, palette: false, adaptiveFiltering: true })
    .toBuffer();

  const masterPath = path.join(iconsDir, 'icon-master-square.png');
  const masterTempPath = `${masterPath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(masterTempPath, squareMasterBuffer);
  await fsp.rename(masterTempPath, masterPath);

  for (const size of sizes) {
    const pipeline = sharp(squareMasterBuffer).resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    });

    if (size <= 48) {
      pipeline.sharpen({ sigma: 0.85, m1: 0.8, m2: 2.0, x1: 2.0, y2: 10.0, y3: 20.0 });
    } else if (size <= 128) {
      pipeline.sharpen({ sigma: 0.5, m1: 0.5, m2: 1.5, x1: 2.0, y2: 10.0, y3: 20.0 });
    }

    await pipeline
      .png({
        compressionLevel: 9,
        effort: 10,
        palette: false,
        adaptiveFiltering: true,
      })
      .toFile(path.join(iconsDir, `icon${size}.png`));
  }

  return {
    source: 'generated',
    mode: options.mode || 'default',
    extensionRoot: options.iconDirMode === 'direct' ? path.dirname(iconsDir) : path.dirname(iconsDir),
    iconsDir,
    sourcePath,
    readyIconDir: null,
    sizes,
    copiedSizes: [...sizes],
    manifestIcons: createManifestIconsMap(REQUIRED_READY_SIZES),
    actionIcons: createActionIconsMap(),
    masterPath,
    padding,
  };
}

function createManifestIconsMap(sizes) {
  return Object.fromEntries(
    sizes.map((size) => [String(size), `icons/icon${size}.png`]),
  );
}

function createActionIconsMap() {
  return Object.fromEntries(
    ACTION_SIZES.map((size) => [String(size), `icons/icon${size}.png`]),
  );
}

async function writeManifestSnippet(iconsDir, manifestIcons) {
  const manifestSnippetPath = path.join(iconsDir, 'manifest-icons.json');
  const tempPath = `${manifestSnippetPath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(
    tempPath,
    JSON.stringify(manifestIcons, null, 2) + '\n',
    'utf8',
  );
  await fsp.rename(tempPath, manifestSnippetPath);
}

function normalizeSizes(value) {
  const sizes = Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10));

  const valid = sizes
    .map((num) => Number(num))
    .filter((num) => Number.isInteger(num) && num > 0);

  if (!valid.length) {
    throw new Error('[write-extension-icons] No valid icon sizes were provided.');
  }

  return [...new Set(valid)].sort((a, b) => a - b);
}

function parsePadding(value) {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num < 0 || num >= 0.25) {
    throw new Error('[write-extension-icons] Padding must be a number between 0 and 0.25.');
  }
  return num;
}

async function ensureReadableFile(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }
  } catch (error) {
    throw new Error(`[write-extension-icons] Input PNG not found or unreadable: ${filePath}`, {
      cause: error,
    });
  }
}

function usage(scriptName) {
  return [
    `Usage: node ${scriptName} <input.png> <output-dir> [sizes] [padding]`,
    '',
    'Examples:',
    `  node ${scriptName} ./assets/icon-master.png ./dist/icons`,
    `  node ${scriptName} ./assets/icon-master.png ./dist/icons 16,32,48,128 0.06`,
    '',
    'Notes:',
    '- Direct CLI mode writes icons into the output directory you pass.',
    '- Build mode writes into <extension-out>/icons automatically.',
    '- Ready icon pack mode uses assets/chrome-icons when present.',
  ].join('\n');
}

const isDirectRun = (() => {
  const thisFile = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile);
})();

if (isDirectRun) {
  const [inputPathArg, outputDirArg, sizesArg, paddingArg] = process.argv.slice(2);

  if (!inputPathArg || !outputDirArg) {
    console.error(usage(path.basename(process.argv[1] || 'write-extension-icons.mjs')));
    process.exit(1);
  }

  writeExtensionIcons(outputDirArg, {
    iconDirMode: 'direct',
    sourcePath: inputPathArg,
    sizes: sizesArg ? normalizeSizes(sizesArg) : DEFAULT_SIZES,
    padding: paddingArg ?? DEFAULT_PADDING,
  })
    .then((result) => {
      console.log(JSON.stringify({
        source: result.source,
        sourcePath: result.sourcePath,
        iconsDir: result.iconsDir,
        sizes: result.sizes,
        manifestIcons: result.manifestIcons,
      }, null, 2));
    })
    .catch((error) => {
      console.error('\n❌ Icon generation failed.');
      console.error(error?.stack || error);
      process.exit(1);
    });
}
