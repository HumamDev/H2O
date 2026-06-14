#!/usr/bin/env node
/* create-dmg.mjs
 *
 * Deterministic macOS DMG packaging for the Desktop Studio release build.
 *
 * Tauri's generated `bundle_dmg.sh` styles the DMG using Finder AppleScript.
 * That path is GUI-dependent and can time out in headless/sandboxed release
 * dry-runs. This script intentionally creates a plain compressed DMG with
 * `hdiutil create -srcfolder`, avoiding Finder while still failing loudly if
 * disk-image packaging itself fails.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const tauriRoot = path.join(desktopRoot, 'src-tauri');
const targetRoot = path.join(tauriRoot, 'target', 'release');
const bundleRoot = path.join(targetRoot, 'bundle');
const macosBundleRoot = path.join(bundleRoot, 'macos');
const dmgBundleRoot = path.join(bundleRoot, 'dmg');
const tauriConfigPath = path.join(tauriRoot, 'tauri.conf.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function archName() {
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'x64') return 'x64';
  return process.arch;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || desktopRoot,
    stdio: options.stdio || 'inherit',
    env: process.env
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const rendered = [command, ...args].join(' ');
    throw new Error(`${rendered} exited with ${result.status}`);
  }
  return result;
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function ensureAppBundle(appBundle) {
  const executableDir = path.join(appBundle, 'Contents', 'MacOS');
  if (!fs.existsSync(appBundle) || !fs.statSync(appBundle).isDirectory()) {
    throw new Error(`[create-dmg] missing app bundle: ${appBundle}`);
  }
  if (!fs.existsSync(executableDir)) {
    throw new Error(`[create-dmg] invalid app bundle; missing Contents/MacOS: ${appBundle}`);
  }
}

function createDmg() {
  if (process.platform !== 'darwin') {
    throw new Error('[create-dmg] DMG packaging is only supported on macOS');
  }

  const config = readJson(tauriConfigPath);
  const productName = config.productName || 'H2O Studio';
  const version = config.version || '0.0.0';
  const appBundle = path.join(macosBundleRoot, `${productName}.app`);
  const dmgName = `${productName}_${version}_${archName()}.dmg`;
  const dmgPath = path.join(dmgBundleRoot, dmgName);
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-studio-dmg-'));

  ensureAppBundle(appBundle);
  fs.mkdirSync(dmgBundleRoot, { recursive: true });

  try {
    const stagedApp = path.join(stageRoot, `${productName}.app`);
    const applicationsLink = path.join(stageRoot, 'Applications');

    run('/usr/bin/ditto', [appBundle, stagedApp]);
    fs.symlinkSync('/Applications', applicationsLink);

    run('/usr/bin/hdiutil', [
      'create',
      '-volname', productName,
      '-srcfolder', stageRoot,
      '-ov',
      '-format', 'UDZO',
      dmgPath
    ]);

    const stat = fs.statSync(dmgPath);
    const digest = sha256File(dmgPath);
    console.log(`[create-dmg] wrote ${path.relative(desktopRoot, dmgPath)}`);
    console.log(`[create-dmg] size=${stat.size} sha256=${digest}`);
    return { dmgPath, size: stat.size, sha256: digest };
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

try {
  createDmg();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
