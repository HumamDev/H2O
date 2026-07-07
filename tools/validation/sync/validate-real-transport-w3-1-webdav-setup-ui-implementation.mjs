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
  studio: 'src-surfaces-base/studio/studio.js',
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
const studio = read(files.studio);
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
mustContain(rust, 'registry_path_source', 'redacted registry path source output');
mustContain(rust, 'credential_material_present', 'redacted credential material presence output');
mustContain(rust, 'credential_input_received_this_save', 'redacted credential input receipt output');
mustContain(rust, 'credential_material_updated_this_save', 'redacted credential material update output');
mustContain(rust, 'saved_server_url', 'saved server URL status for reload hydration');
mustContain(rust, 'saved_root_path', 'saved root path status for reload hydration');
mustContain(rust, 'saved_credential_identifier', 'saved username status for reload hydration');
mustContain(rust, 'credential_identifier_from_auth_header_private', 'status must recover username without exposing credential material');
mustContain(rust, 'split_once(\':\')', 'status must split Basic auth without returning credential material');
mustContain(rust, 'previous_auth_header_private', 'private credential update comparison');
mustContain(rust, 'previous_auth_header.as_deref() != Some(auth_header_private.as_str())', 'credential update comparison must stay private');
mustContain(rust, 'credential_secret.is_none() && previous_auth_header.is_none()', 'setup must require credential only when no saved material exists');
mustContain(rust, 'let credential_input_received_this_save = credential_secret.is_some();', 'setup must distinguish new credential input from saved material reuse');
mustContain(rust, '.or_else(|| previous_auth_header.clone())', 'setup must preserve saved private credential when token input is empty');
mustContain(rust, 'preserved.credential_secret = None;', 'rust tests must cover saved credential reuse');
mustContain(rust, 'assert!(!preserved_result.credential_input_received_this_save);', 'rust tests must prove reuse does not claim new credential input');
mustContain(rust, 'assert!(!preserved_result.credential_material_updated_this_save);', 'rust tests must prove reuse does not claim credential update');
mustContain(rust, 'status.saved_server_url.as_deref()', 'rust tests must prove saved server URL returns for reload hydration');
mustContain(rust, 'status.saved_root_path.as_deref()', 'rust tests must prove saved folder returns for reload hydration');
mustContain(rust, 'status.saved_credential_identifier.as_deref()', 'rust tests must prove saved username returns for reload hydration');

assert(count(lib, 'real_transport_capability_probe::h2o_rt_prepare_webdav_setup') === 2,
  'lib.rs: setup command must be registered in debug and release invoke handlers');
assert(count(lib, 'real_transport_capability_probe::h2o_rt_webdav_setup_status') === 2,
  'lib.rs: status command must be registered in debug and release invoke handlers');

mustNotContain(rust, 'h2o_rt_first_write', 'rust source');
mustNotContain(lib, 'h2o_rt_first_write', 'invoke handler');
mustNotContain(studio, 'h2o_rt_first_write', 'settings shell');
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
mustContain(studio, 'webdav: { label: "WebDAV", hash: "#/settings/sync/webdav" }', 'settings sync WebDAV subtab');
mustContain(studio, 'subsection === "webdav"', 'settings WebDAV route handling');
mustContain(studio, 'realTransportWebDavSetupUi?.openSettingsSubtab', 'settings WebDAV subtab opener');
mustContain(studio, 'subsection !== "webdav"', 'settings manual sync filter must not hide WebDAV panel');
mustContain(ui, 'openSettingsSubtab', 'ui settings subtab API');
mustContain(ui, 'captureDraft', 'ui draft capture API');
mustContain(ui, 'captureDraftFromDom', 'ui draft capture helper');
mustContain(ui, 'applyDraftToDom', 'ui draft restore helper');
mustContain(ui, 'hydrateDraftFromStatus', 'ui must hydrate form from prepared resolver status after reload');
mustContain(ui, 'result.savedServerUrl', 'ui must restore saved server URL after reload');
mustContain(ui, 'result.savedRootPath', 'ui must restore saved folder after reload');
mustContain(ui, 'result.savedCredentialIdentifier', 'ui must restore saved username after reload');
mustContain(ui, 'result.credentialMaterialPresent === true && state.draft.rememberCredential !== true', 'ui must auto-check Remember when saved credential exists');
mustContain(ui, "['confirmNonProduction', 'confirmReadOnly', 'confirmNoSacrificialWrite']", 'ui must restore safety confirmations when resolver is prepared');
mustContain(ui, "state.draft.credentialSecret = '';", 'ui must keep password token empty after reload hydration');
mustContain(ui, 'state.draft', 'ui draft state');
mustContain(ui, 'draftValue(\'serverUrl\')', 'server URL must be draft-backed');
mustContain(ui, 'draftValue(\'rootPath\')', 'folder must be draft-backed');
mustContain(ui, 'draftValue(\'credentialSecret\')', 'credential must be draft-backed');
mustContain(ui, 'state.draft.credentialSecret = \'\';', 'credential clears only after prepare success');
mustContain(studio, 'realTransportWebDavSetupUi?.captureDraft?.()', 'settings shell captures WebDAV draft before rebuild');
mustContain(ui, '#/settings/sync/webdav', 'ui mounts only on WebDAV sync subtab');
mustContain(ui, 'wbRealTransportWebDavSetupSubtab', 'ui subtab panel id');
mustNotContain(ui, "insertAdjacentHTML('afterend'", 'ui must not mount buried duplicate after sync box');
mustContain(ui, 'Use the same URL and Folder as the native extension.', 'native extension model helper');
mustContain(ui, 'For Koofr, URL is usually https://app.koofr.net/dav/Koofr', 'native extension URL helper');
mustContain(ui, 'Folder can be H2O-Test for this W3.1 setup.', 'native extension folder example');
mustContain(ui, 'Server URL is required.', 'user-actionable server missing state');
mustContain(ui, 'Folder / remote root is required.', 'user-actionable folder missing state');
mustContain(ui, 'Username is required.', 'user-actionable username missing state');
mustContain(ui, 'Password/token is required.', 'user-actionable credential missing state');
mustContain(ui, 'credentialVisible: false', 'credential field must be masked by default');
mustContain(ui, 'credentialReveal', 'credential reveal control id');
mustContain(ui, 'Show password / token', 'credential reveal show label');
mustContain(ui, 'Hide password / token', 'credential reveal hide label');
mustContain(ui, "secret.type = state.credentialVisible ? 'text' : 'password'", 'credential reveal must be local input type toggle');
mustContain(ui, 'grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;min-width:0', 'password field must remain wide beside compact reveal button');
mustContain(ui, 'padding:7px 12px;white-space:nowrap', 'show hide button must stay compact and not squeeze password field');
mustContain(ui, 'style="\' + INPUT_STYLE + \';min-width:0"', 'password input must be overflow-safe');
mustContain(ui, 'Remember credential on this device', 'remember credential checkbox');
mustContain(ui, 'Stores the token in the private Desktop resolver store. Nothing is synced or written to WebDAV.', 'remember credential tooltip');
mustContain(ui, 'Enable Remember credential to prepare WebDAV settings.', 'remember credential required validation');
mustContain(ui, 'padding:2px 0 0', 'remember credential must be a compact checkbox row');
mustContain(ui, 'Credential ready to save', 'credential ready indicator');
mustContain(ui, 'Token required', 'empty credential indicator');
mustContain(ui, 'Enable remember to prepare', 'remember-required credential indicator');
mustContain(ui, 'Using saved credential', 'saved credential reuse indicator');
mustContain(ui, 'savedCredentialPresent', 'saved credential presence helper');
mustContain(ui, 'rememberCredential && !hasDraftCredential && !hasSavedCredential', 'validation must allow empty token when saved credential exists');
mustContain(ui, 'Enable Remember credential to use the saved credential.', 'remember-required saved credential message');
mustContain(ui, 'style="\' + MUTED_STYLE + \'">Token required</span>', 'credential state must render below password as subtle helper text');
mustNotContain(ui, 'credentialReady.style.borderColor', 'credential state must not be a large badge beside password');
mustNotContain(ui, 'credentialReady.style.background', 'credential state must not be a large badge beside password');
mustContain(ui, 'Enable Remember credential to prepare.', 'remember-required credential friendly message');
mustContain(ui, 'Credential ready to save.', 'credential ready friendly message');
mustContain(ui, 'Credential updated for this prepare.', 'credential updated friendly message');
mustContain(ui, 'Credential received. Same as existing saved credential.', 'credential same-as-existing friendly message');
mustContain(ui, 'Existing saved credential used.', 'existing credential friendly message');
mustContain(ui, 'credentialStatusMessage', 'credential message helper');
mustContain(ui, 'if (secret) secret.value = \'\';', 'credential field cleared after prepare');
mustContain(ui, 'state.credentialVisible = false;', 'credential reveal state resets after prepare');
mustContain(ui, 'Saved credentials are not revealed.', 'show hide must not reveal saved stored credential');
mustContain(ui, 'registry path source', 'redacted registry path source status');
mustContain(ui, 'credential material present', 'redacted credential material presence status');
mustContain(ui, 'credential received this prepare', 'redacted credential input receipt status');
mustContain(ui, 'credential updated this prepare', 'redacted credential update status');
mustContain(ui, 'result && result.registryPathSource', 'registry path source render');
mustContain(ui, 'result && result.credentialMaterialPresent', 'credential material presence render');
mustContain(ui, 'result && result.credentialInputReceivedThisSave', 'credential input receipt render');
mustContain(ui, 'result && result.credentialMaterialUpdatedThisSave', 'credential update render');
mustContain(ui, 'shortHash(result && result.descriptorRegistryRefHash)', 'visible registry hash must be shortened');
mustContain(ui, 'overflow-wrap:anywhere', 'status values must wrap');
mustContain(ui, 'minmax(0,1fr)', 'status grid must prevent overflow');
mustContain(ui, 'HASH_VALUE_STYLE', 'advanced hash values must have dedicated wrapping');
mustContain(ui, 'hashRowHtml', 'advanced hash rows must wrap safely');
mustContain(ui, 'display:flex;flex-direction:column;gap:12px;min-width:0', 'readiness and advanced hash status must stack');
mustContain(ui, 'INFO_STYLE', 'compact info tooltip style');
mustContain(ui, 'infoIconHtml', 'compact info tooltip helper');
mustContain(ui, 'confirmNonProduction', 'non-production confirmation');
mustContain(ui, 'confirmReadOnlySafe', 'read-only confirmation');
mustContain(ui, 'confirmSacrificialWriteNotApproved', 'no sacrificial write confirmation');
mustContain(ui, 'Folder / remote root', 'native extension folder wording');
mustContain(ui, 'Use the same folder as the native extension, e.g. H2O.', 'native extension folder helper');
mustContain(ui, 'Use a non-production test folder for W3.1.', 'non-production folder helper');
mustContain(ui, "'H2O-Test'", 'safe folder placeholder');
mustContain(ui, "'Missing: ' + (validationResult.missing.join(' ')", 'disabled reason lists missing items');
mustContain(ui, 'DEFAULT_ENDPOINT_DESCRIPTOR_LABEL', 'endpoint descriptor label default');
mustContain(ui, 'DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL', 'remote root descriptor label default');
mustContain(ui, 'DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL', 'credential descriptor label default');
mustContain(ui, 'descriptorLabelValue(ID.endpointLabel, DEFAULT_ENDPOINT_DESCRIPTOR_LABEL)', 'endpoint descriptor label fallback');
mustContain(ui, 'descriptorLabelValue(ID.remoteRootLabel, DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL)', 'remote root descriptor label fallback');
mustContain(ui, 'descriptorLabelValue(ID.credentialLabel, DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL)', 'credential descriptor label fallback');
mustContain(ui, 'Advanced descriptor labels', 'advanced descriptor labels section');
mustContain(ui, 'Most operators should leave them unchanged.', 'advanced descriptor labels helper');
mustNotContain(ui, 'Endpoint descriptor label is required.', 'descriptor label must not block Save/Prepare');
mustNotContain(ui, 'Remote-root descriptor label is required.', 'descriptor label must not block Save/Prepare');
mustNotContain(ui, 'Credential descriptor label is required.', 'descriptor label must not block Save/Prepare');
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
