#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const files = {
  rust: 'apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs',
  lib: 'apps/studio/desktop/src-tauri/src/lib.rs',
  cargo: 'apps/studio/desktop/src-tauri/Cargo.toml',
  tauriConf: 'apps/studio/desktop/src-tauri/tauri.conf.json',
  ui: 'src-surfaces-base/studio/sync/webdav-transport-setup-ui.tauri.js',
  html: 'src-surfaces-base/studio/studio.html',
  pack: 'tools/product/studio/pack-studio.mjs',
  evidence: 'release-evidence/2026-07-06/real-transport-w3-1-webdav-setup-ui-implementation.md',
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function mustContain(source, needle, label) {
  assert(source.includes(needle), `${label}: missing ${needle}`);
}

function mustNotContain(source, needle, label) {
  assert(!source.includes(needle), `${label}: forbidden ${needle}`);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

for (const [label, rel] of Object.entries(files)) {
  assert(fs.existsSync(path.join(ROOT, rel)), `${label}: file missing ${rel}`);
}

const rust = read(files.rust);
const lib = read(files.lib);
const cargo = read(files.cargo);
const tauriConf = read(files.tauriConf);
const ui = read(files.ui);
const html = read(files.html);
const pack = read(files.pack);
const evidence = read(files.evidence);

for (const anchor of [
  '38d7d18b',
  '6a5e8bbe',
  'b61aeee1',
  'f670a18c',
  '979e8a5b',
  'd1ef0995',
  '5dd884ae',
  '89b6ec47',
  'af886b2f',
]) {
  mustContain(evidence, anchor, 'evidence anchors');
}

mustContain(rust, 'pub fn h2o_rt_capability_probe', 'rust command');
mustContain(rust, 'pub fn h2o_rt_prepare_webdav_setup', 'rust setup command');
mustContain(rust, 'pub fn h2o_rt_webdav_setup_status', 'rust status command');
mustContain(rust, 'prepare_webdav_setup', 'rust setup implementation');
mustContain(rust, 'webdav_setup_status', 'rust status implementation');
mustContain(rust, 'DEFAULT_DESCRIPTOR_REGISTRY_FILE', 'private registry default');
mustContain(rust, 'network_attempted: false', 'setup network invariant');
mustContain(rust, 'product_sync_ready: false', 'setup readiness invariant');
mustContain(rust, 'transport_ready: false', 'setup readiness invariant');
mustContain(rust, 'writes_webdav: false', 'setup write invariant');
mustContain(rust, 'descriptor_ref_hash("endpoint"', 'endpoint descriptor semantics');
mustContain(rust, 'descriptor_ref_hash("remote-root"', 'remote root descriptor semantics');
mustContain(rust, 'descriptor_ref_hash("credential"', 'credential descriptor semantics');
mustContain(rust, 'credential_ref_hash', 'credential ref hash output');

assert(count(lib, 'real_transport_capability_probe::h2o_rt_prepare_webdav_setup') === 2,
  'lib.rs: setup command must be registered in debug and release invoke handlers');
assert(count(lib, 'real_transport_capability_probe::h2o_rt_webdav_setup_status') === 2,
  'lib.rs: status command must be registered in debug and release invoke handlers');

mustNotContain(rust, 'h2o_rt_first_write', 'rust source');
mustNotContain(lib, 'h2o_rt_first_write', 'invoke handler');
mustNotContain(ui, 'h2o_rt_first_write', 'ui source');
mustNotContain(evidence, 'h2o_rt_first_write was added', 'evidence');

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'plugin:fs|write',
  'plugin:sql|execute',
]) {
  mustNotContain(ui, forbidden, 'ui zero-write scan');
}

mustContain(ui, 'realTransportWebDavSetupUi', 'ui API namespace');
mustContain(ui, 'wbRealTransportWebDavSetupCard', 'ui card id');
mustContain(ui, 'h2o_rt_prepare_webdav_setup', 'ui setup invoke');
mustContain(ui, 'h2o_rt_webdav_setup_status', 'ui status invoke');
mustNotContain(ui, 'h2o_rt_capability_probe', 'ui must not run live probe');
mustContain(ui, "'password'", 'credential field must be masked');
mustContain(ui, 'confirmNonProduction', 'non-production confirmation');
mustContain(ui, 'confirmReadOnlySafe', 'read-only confirmation');
mustContain(ui, 'confirmSacrificialWriteNotApproved', 'no sacrificial write confirmation');
mustContain(ui, 'Read-only probe', 'future read-only section');
mustContain(ui, 'Write approval', 'future write approval section');
mustContain(ui, 'disabled title="Future phase: read-only remote-root probe"', 'probe disabled');
mustContain(ui, 'disabled title="Future phase: separately approved write"', 'write approval disabled');
mustContain(ui, 'networkAttempted: false', 'ui diagnose invariant');
mustContain(ui, 'writesWebDAV: false', 'ui diagnose invariant');
mustContain(ui, 'productSyncReady: false', 'ui diagnose invariant');
mustContain(ui, 'transportReady: false', 'ui diagnose invariant');

const uiScript = './sync/webdav-transport-setup-ui.tauri.js';
assert(count(html, uiScript) === 1, 'studio.html: WebDAV setup UI script must be registered exactly once');
assert(count(pack, '"sync/webdav-transport-setup-ui.tauri.js"') === 2,
  'pack-studio.mjs: WebDAV setup UI must appear in both explicit lists');
assert(
  html.indexOf('./sync/real-transport-first-write-preflight.js') <
    html.indexOf(uiScript),
  'studio.html: WebDAV setup UI must load after W2 first-write preflight substrate',
);

mustContain(evidence, 'IMPLEMENTED AS SETUP/STORAGE FOUNDATION ONLY', 'evidence verdict');
mustContain(evidence, 'Desktop Studio now loads `sync/webdav-transport-setup-ui.tauri.js`', 'evidence UI');
mustContain(evidence, '`h2o_rt_prepare_webdav_setup`', 'evidence setup command');
mustContain(evidence, '`h2o_rt_webdav_setup_status`', 'evidence status command');
mustContain(evidence, '`networkAttempted:false`', 'evidence network invariant');
mustContain(evidence, '`writesWebDAV:false`', 'evidence write invariant');
mustContain(evidence, '`productSyncReady:false`', 'evidence readiness invariant');
mustContain(evidence, '`transportReady:false`', 'evidence readiness invariant');
mustContain(evidence, '`h2o_rt_first_write` remains absent', 'evidence no first write');
mustContain(evidence, 'No write command was added', 'evidence no write command');
mustContain(evidence, 'No live WebDAV/cloud/relay/CAS/file probe was performed', 'evidence no live probe');
mustContain(evidence, 'No WebDAV/cloud/relay/CAS/file write occurred', 'evidence no write');
mustContain(evidence, 'does not define Desktop-only remote protocol semantics', 'evidence cross-client');

for (const forbidden of [
  'http://',
  'https://',
  'rawEndpoint',
  'rawRemotePath',
  'payloadBody',
  'casKey',
  'writesWebDAV:true',
  'enqueuesRelay:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'productSyncReady:true',
  'transportReady:true',
]) {
  mustNotContain(evidence, forbidden, 'evidence forbidden literal scan');
}

mustNotContain(cargo, 'tauri-plugin-http', 'Cargo.toml');
mustNotContain(tauriConf, 'connect-src *', 'tauri CSP');

console.log('W3_1_WEBDAV_SETUP_UI_IMPLEMENTATION_PASS');
