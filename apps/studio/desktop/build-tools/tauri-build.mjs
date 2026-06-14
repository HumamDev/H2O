#!/usr/bin/env node
/* tauri-build.mjs
 *
 * Desktop Studio release build wrapper.
 *
 * The default Tauri macOS DMG bundler uses Finder AppleScript for visual DMG
 * layout. F18.1 proved that app bundling succeeds but Finder styling can time
 * out during RC dry-runs. This wrapper keeps Tauri as the authority for the
 * binary and `.app`, then uses `create-dmg.mjs` for deterministic DMG output.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${[command, ...args].join(' ')} exited with ${result.status}`);
  }
}

function splitBundleValue(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseArgs(args) {
  const forwarded = [];
  let requestedBundles = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--bundles' || arg === '-b') {
      requestedBundles = splitBundleValue(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--bundles=')) {
      requestedBundles = splitBundleValue(arg.slice('--bundles='.length));
      continue;
    }
    forwarded.push(arg);
  }

  return { forwarded, requestedBundles };
}

function wantsDmg(requestedBundles) {
  if (!requestedBundles) return true;
  return requestedBundles.includes('all') || requestedBundles.includes('dmg');
}

function validateBundleRequest(requestedBundles) {
  if (!requestedBundles) return;
  const supported = new Set(['all', 'app', 'dmg']);
  const unsupported = requestedBundles.filter((item) => !supported.has(item));
  if (unsupported.length) {
    throw new Error(`[tauri-build] unsupported macOS bundle target(s): ${unsupported.join(', ')}`);
  }
}

try {
  const { forwarded, requestedBundles } = parseArgs(process.argv.slice(2));
  validateBundleRequest(requestedBundles);

  run('npm', ['run', 'prepare-dist']);
  run('tauri', ['build', '--bundles', 'app', ...forwarded]);

  if (wantsDmg(requestedBundles)) {
    run('node', ['./build-tools/create-dmg.mjs']);
  }
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
