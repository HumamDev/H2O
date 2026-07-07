/* W3.1.5L Desktop WebDAV setup UI.
 *
 * Product-grade setup card for the W3 real-transport descriptor resolver.
 * The card collects operator-entered WebDAV setup values and sends them to
 * Rust for private out-of-repo descriptor-registry storage. It does not run a
 * probe, does not call WebDAV/cloud/relay/CAS, does not enqueue, does not
 * create outbox/ledger/store rows, and does not flip productSyncReady or
 * transportReady.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  if (H2O.Studio.sync.__realTransportWebDavSetupUiInstalled) return;

  var API = H2O.Studio.sync.realTransportWebDavSetupUi =
    H2O.Studio.sync.realTransportWebDavSetupUi || {};

  var ID = {
    card: 'wbRealTransportWebDavSetupCard',
    form: 'wbRealTransportWebDavSetupForm',
    serverUrl: 'wbRealTransportWebDavServerUrl',
    rootPath: 'wbRealTransportWebDavRootPath',
    credentialIdentifier: 'wbRealTransportWebDavCredentialIdentifier',
    credentialSecret: 'wbRealTransportWebDavCredentialSecret',
    endpointLabel: 'wbRealTransportWebDavEndpointLabel',
    remoteRootLabel: 'wbRealTransportWebDavRemoteRootLabel',
    credentialLabel: 'wbRealTransportWebDavCredentialLabel',
    confirmNonProduction: 'wbRealTransportWebDavConfirmNonProduction',
    confirmReadOnly: 'wbRealTransportWebDavConfirmReadOnly',
    confirmNoSacrificialWrite: 'wbRealTransportWebDavConfirmNoSacrificialWrite',
    saveBtn: 'wbRealTransportWebDavPrepareBtn',
    statusBtn: 'wbRealTransportWebDavStatusBtn',
    statusBadge: 'wbRealTransportWebDavStatusBadge',
    statusSummary: 'wbRealTransportWebDavStatusSummary',
    registryPathSource: 'wbRealTransportWebDavRegistryPathSource',
    registryHash: 'wbRealTransportWebDavRegistryHash',
    jsonParses: 'wbRealTransportWebDavJsonParses',
    privateFields: 'wbRealTransportWebDavPrivateFields',
    credentialMaterialPresent: 'wbRealTransportWebDavCredentialMaterialPresent',
    credentialInputReceivedThisSave: 'wbRealTransportWebDavCredentialInputReceivedThisSave',
    credentialMaterialUpdatedThisSave: 'wbRealTransportWebDavCredentialMaterialUpdatedThisSave',
    endpointReady: 'wbRealTransportWebDavEndpointReady',
    reachableCandidate: 'wbRealTransportWebDavReachableCandidate',
    networkAttempted: 'wbRealTransportWebDavNetworkAttempted',
    writesWebDav: 'wbRealTransportWebDavWritesWebDav',
    productSyncReady: 'wbRealTransportWebDavProductSyncReady',
    transportReady: 'wbRealTransportWebDavTransportReady',
    endpointRefHash: 'wbRealTransportWebDavEndpointRefHash',
    remoteRootRefHash: 'wbRealTransportWebDavRemoteRootRefHash',
    credentialRefHash: 'wbRealTransportWebDavCredentialRefHash',
    blockers: 'wbRealTransportWebDavBlockers',
    desktopOnly: 'wbRealTransportWebDavDesktopOnly',
  };

  var CARD_STYLE = 'display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid rgba(96,165,250,.24);border-radius:10px;background:rgba(96,165,250,.045);margin:0 0 28px';
  var MUTED_STYLE = 'opacity:.72;font-size:12px;line-height:1.45';
  var BTN_STYLE = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;text-decoration:none;display:inline-block';
  var INPUT_STYLE = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-size:13px';
  var GRID_STYLE = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px';
  var STATUS_GRID_STYLE = 'display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace';
  var DEFAULT_ENDPOINT_DESCRIPTOR_LABEL = 'Non-production WebDAV endpoint';
  var DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL = 'Non-production WebDAV folder';
  var DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL = 'Non-production WebDAV credential';

  var state = {
    mounted: false,
    inFlight: false,
    lastStatus: null,
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function detectTauri() {
    try {
      if (global.__TAURI_INTERNALS__ && typeof global.__TAURI_INTERNALS__.invoke === 'function') return true;
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') return true;
      if (global.__TAURI__ && typeof global.__TAURI__.invoke === 'function') return true;
    } catch (_) { /* ignore */ }
    try {
      return !!(global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
        global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true);
    } catch (_) {
      return false;
    }
  }

  function getInvoke() {
    try {
      if (global.__TAURI_INTERNALS__ && typeof global.__TAURI_INTERNALS__.invoke === 'function') {
        return global.__TAURI_INTERNALS__.invoke.bind(global.__TAURI_INTERNALS__);
      }
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function value(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function checked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value == null || value === '' ? '-' : String(value);
  }

  function yesNo(value) {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return '-';
  }

  function prop(object, first, second) {
    if (!object || typeof object !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(object, first)) return object[first];
    if (second && Object.prototype.hasOwnProperty.call(object, second)) return object[second];
    return undefined;
  }

  function looksReservedInvalid(value) {
    var normalized = String(value || '').toLowerCase();
    return normalized.indexOf('reserved-invalid-domain') !== -1 ||
      normalized.indexOf('private.invalid') !== -1 ||
      /\.invalid(?::|\/|$)/.test(normalized);
  }

  function validation() {
    var missing = [];
    if (!value(ID.serverUrl)) missing.push('Server URL is required.');
    if (!value(ID.rootPath)) missing.push('Folder / remote root is required.');
    if (!value(ID.credentialIdentifier)) missing.push('Username is required.');
    if (!value(ID.credentialSecret)) missing.push('Password/token is required.');
    if (looksReservedInvalid(value(ID.serverUrl))) missing.push('Endpoint still looks like a placeholder.');
    if (!checked(ID.confirmNonProduction)) missing.push('Confirm this is a non-production endpoint.');
    if (!checked(ID.confirmReadOnly)) missing.push('Confirm read-only method safety.');
    if (!checked(ID.confirmNoSacrificialWrite)) missing.push('Confirm sacrificial write is not approved.');
    return { ok: missing.length === 0, missing: missing };
  }

  function fieldHtml(id, label, type, autocomplete, placeholder, helper, defaultValue) {
    return ''
      + '<label style="display:flex;flex-direction:column;gap:5px;font-size:12px">'
      +   '<span style="opacity:.78">' + esc(label) + '</span>'
      +   '<input id="' + id + '" type="' + type + '" autocomplete="' + esc(autocomplete || 'off') + '" spellcheck="false"'
      +     ' placeholder="' + esc(placeholder || '') + '" value="' + esc(defaultValue || '') + '" style="' + INPUT_STYLE + '" />'
      +   (helper ? '<span style="' + MUTED_STYLE + '">' + esc(helper) + '</span>' : '')
      + '</label>';
  }

  function descriptorLabelValue(id, fallback) {
    return value(id) || fallback;
  }

  function checkboxHtml(id, label) {
    return ''
      + '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.4;cursor:pointer">'
      +   '<input id="' + id + '" type="checkbox" style="margin-top:2px" />'
      +   '<span>' + esc(label) + '</span>'
      + '</label>';
  }

  function statusRowHtml(label, id) {
    return '<span style="opacity:.62">' + esc(label) + '</span><span id="' + id + '">-</span>';
  }

  function buildCardHtml() {
    var desktop = detectTauri();
    return ''
      + '<section id="' + ID.card + '" class="wbSettingsCard" style="' + CARD_STYLE + '" aria-label="WebDAV transport setup">'
      +   '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">'
      +     '<div>'
      +       '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.62;font-weight:700">Real Transport Setup</div>'
      +       '<div style="font-weight:650;font-size:15px">WebDAV endpoint setup</div>'
      +       '<div style="' + MUTED_STYLE + '">Prepare the private Desktop resolver registry for future read-only probing. This does not sync, probe, enqueue, or write.</div>'
      +     '</div>'
      +     '<span id="' + ID.statusBadge + '" style="font-weight:650;padding:3px 8px;border-radius:5px;background:rgba(255,255,255,.06);font-size:12px">Not prepared</span>'
      +   '</div>'
      +   '<div id="' + ID.desktopOnly + '" style="' + MUTED_STYLE + ';' + (desktop ? 'display:none' : '') + '">Desktop Studio is required. Browser and extension surfaces keep this setup disabled until a compatible native resolver is available.</div>'
      +   '<form id="' + ID.form + '" style="display:flex;flex-direction:column;gap:12px;' + (desktop ? '' : 'opacity:.55;pointer-events:none') + '">'
      +     '<div style="' + MUTED_STYLE + '">Use the same URL and Folder as the native extension. For Koofr, URL is usually https://app.koofr.net/dav/Koofr and Folder can be H2O-Test for this W3.1 setup.</div>'
      +     '<div style="' + GRID_STYLE + '">'
      +       fieldHtml(ID.serverUrl, 'Server URL', 'url', 'off', 'WebDAV server address')
      +       fieldHtml(ID.rootPath, 'Folder / remote root', 'text', 'off', 'H2O-Test', 'Use the same folder as the native extension, e.g. H2O. Use a non-production test folder for W3.1.')
      +       fieldHtml(ID.credentialIdentifier, 'Username or credential identifier', 'text', 'username', 'operator or key label')
      +       fieldHtml(ID.credentialSecret, 'Password / token', 'password', 'current-password', '')
      +     '</div>'
      +     '<details style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
      +       '<summary style="cursor:pointer;font-weight:650;font-size:13px">Advanced descriptor labels</summary>'
      +       '<div style="' + MUTED_STYLE + ';margin:6px 0 10px">These labels are generated for the private Rust resolver. Most operators should leave them unchanged.</div>'
      +       '<div style="' + GRID_STYLE + '">'
      +         fieldHtml(ID.endpointLabel, 'Endpoint descriptor label', 'text', 'off', DEFAULT_ENDPOINT_DESCRIPTOR_LABEL, '', DEFAULT_ENDPOINT_DESCRIPTOR_LABEL)
      +         fieldHtml(ID.remoteRootLabel, 'Folder descriptor label', 'text', 'off', DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL, '', DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL)
      +         fieldHtml(ID.credentialLabel, 'Credential descriptor label', 'text', 'off', DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL, '', DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL)
      +       '</div>'
      +     '</details>'
      +     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.10)">'
      +       checkboxHtml(ID.confirmNonProduction, 'This endpoint is non-production and safe for setup.')
      +       checkboxHtml(ID.confirmReadOnly, 'The endpoint is safe for future read-only OPTIONS, PROPFIND, HEAD, and GET checks.')
      +       checkboxHtml(ID.confirmNoSacrificialWrite, 'Sacrificial write is not approved in this step.')
      +     '</div>'
      +     '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +       '<button id="' + ID.saveBtn + '" type="submit" style="' + BTN_STYLE + '" disabled>Save / Prepare</button>'
      +       '<button id="' + ID.statusBtn + '" type="button" style="' + BTN_STYLE + '">Status</button>'
      +       '<button type="button" style="' + BTN_STYLE + ';opacity:.55;cursor:not-allowed" disabled title="Future phase: read-only remote-root probe">Read-only probe</button>'
      +       '<button type="button" style="' + BTN_STYLE + ';opacity:.55;cursor:not-allowed" disabled title="Future phase: separately approved write">Write approval</button>'
      +       '<span id="' + ID.statusSummary + '" style="' + MUTED_STYLE + '">Fill all fields and confirmations to prepare resolver storage.</span>'
      +     '</div>'
      +   '</form>'
      +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">'
      +     '<div style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
      +       '<div style="font-weight:650;font-size:13px;margin-bottom:8px">Redacted readiness</div>'
      +       '<div style="' + STATUS_GRID_STYLE + '">'
      +         statusRowHtml('descriptorRegistryRefHash', ID.registryHash)
      +         statusRowHtml('registry path source', ID.registryPathSource)
      +         statusRowHtml('JSON parses', ID.jsonParses)
      +         statusRowHtml('private fields', ID.privateFields)
      +         statusRowHtml('credential material present', ID.credentialMaterialPresent)
      +         statusRowHtml('credential received this prepare', ID.credentialInputReceivedThisSave)
      +         statusRowHtml('credential updated this prepare', ID.credentialMaterialUpdatedThisSave)
      +         statusRowHtml('endpoint ready', ID.endpointReady)
      +         statusRowHtml('reachable candidate', ID.reachableCandidate)
      +         statusRowHtml('networkAttempted', ID.networkAttempted)
      +         statusRowHtml('writesWebDAV', ID.writesWebDav)
      +         statusRowHtml('productSyncReady', ID.productSyncReady)
      +         statusRowHtml('transportReady', ID.transportReady)
      +       '</div>'
      +     '</div>'
      +     '<details style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
      +       '<summary style="cursor:pointer;font-weight:650;font-size:13px">Advanced hash status</summary>'
      +       '<div style="' + STATUS_GRID_STYLE + ';margin-top:8px">'
      +         statusRowHtml('endpointRefHash', ID.endpointRefHash)
      +         statusRowHtml('remoteRootRefHash', ID.remoteRootRefHash)
      +         statusRowHtml('credentialRefHash', ID.credentialRefHash)
      +         '<span style="opacity:.62">blockers</span><span id="' + ID.blockers + '">-</span>'
      +       '</div>'
      +     '</details>'
      +   '</div>'
      + '</section>';
  }

  function renderStatus(result) {
    state.lastStatus = result || null;
    var ok = !!(result && result.ok);
    var badge = document.getElementById(ID.statusBadge);
    if (badge) {
      badge.textContent = ok ? 'Prepared' : 'Blocked';
      badge.style.background = ok ? 'rgba(34,197,94,.18)' : 'rgba(248,113,113,.18)';
    }
    setText(ID.statusSummary, ok ? 'Resolver registry is prepared. No probe or write was run.' : 'Resolver setup is blocked. Review required fields and confirmations.');
    setText(ID.registryHash, result && result.descriptorRegistryRefHash);
    setText(ID.registryPathSource, result && result.registryPathSource);
    setText(ID.jsonParses, yesNo(result && result.jsonParses));
    setText(ID.privateFields, yesNo(result && result.requiredPrivateFieldsPresent));
    setText(ID.credentialMaterialPresent, yesNo(result && result.credentialMaterialPresent));
    setText(ID.credentialInputReceivedThisSave, yesNo(result && result.credentialInputReceivedThisSave));
    setText(ID.credentialMaterialUpdatedThisSave, yesNo(result && result.credentialMaterialUpdatedThisSave));
    setText(ID.endpointReady, yesNo(result && result.endpointNoLongerReservedInvalidDomain));
    setText(ID.reachableCandidate, yesNo(result && result.reachableCandidate));
    setText(ID.networkAttempted, yesNo(result && result.networkAttempted));
    setText(ID.writesWebDav, yesNo(prop(result, 'writesWebdav', 'writesWebDAV')));
    setText(ID.productSyncReady, yesNo(result && result.productSyncReady));
    setText(ID.transportReady, yesNo(result && result.transportReady));
    setText(ID.endpointRefHash, result && result.endpointRefHash);
    setText(ID.remoteRootRefHash, result && result.remoteRootRefHash);
    setText(ID.credentialRefHash, result && result.credentialRefHash);
    var blockers = result && Array.isArray(result.blockers) ? result.blockers : [];
    setText(ID.blockers, blockers.length ? blockers.join(', ') : '-');
  }

  function renderValidation() {
    var validationResult = validation();
    var save = document.getElementById(ID.saveBtn);
    if (save) {
      save.disabled = state.inFlight || !validationResult.ok || !detectTauri();
      save.style.opacity = save.disabled ? '.55' : '1';
      save.style.cursor = save.disabled ? 'not-allowed' : 'pointer';
    }
    if (!state.lastStatus) {
      setText(ID.statusSummary, validationResult.ok
        ? 'Ready to prepare resolver storage. No probe or write will run.'
        : 'Missing: ' + (validationResult.missing.join(' ') || 'Fill all required fields and confirmations.'));
    }
  }

  async function invokeStatus() {
    var invoke = getInvoke();
    if (!invoke) {
      renderStatus({ ok: false, blockers: ['desktop-tauri-invoke-unavailable'] });
      return;
    }
    state.inFlight = true;
    renderValidation();
    try {
      var result = await invoke('h2o_rt_webdav_setup_status');
      renderStatus(result);
    } catch (_) {
      renderStatus({ ok: false, blockers: ['real-transport-webdav-setup-status-command-failed'] });
    } finally {
      state.inFlight = false;
      renderValidation();
    }
  }

  async function invokePrepare() {
    var validationResult = validation();
    if (!validationResult.ok) {
      renderValidation();
      return;
    }
    var invoke = getInvoke();
    if (!invoke) {
      renderStatus({ ok: false, blockers: ['desktop-tauri-invoke-unavailable'] });
      return;
    }
    state.inFlight = true;
    renderValidation();
    try {
      var result = await invoke('h2o_rt_prepare_webdav_setup', {
        request: {
          serverUrl: value(ID.serverUrl),
          rootPath: value(ID.rootPath),
          credentialIdentifier: value(ID.credentialIdentifier),
          credentialSecret: value(ID.credentialSecret),
          endpointDescriptorLabel: descriptorLabelValue(ID.endpointLabel, DEFAULT_ENDPOINT_DESCRIPTOR_LABEL),
          remoteRootDescriptorLabel: descriptorLabelValue(ID.remoteRootLabel, DEFAULT_REMOTE_ROOT_DESCRIPTOR_LABEL),
          credentialDescriptorLabel: descriptorLabelValue(ID.credentialLabel, DEFAULT_CREDENTIAL_DESCRIPTOR_LABEL),
          confirmNonProduction: checked(ID.confirmNonProduction),
          confirmReadOnlySafe: checked(ID.confirmReadOnly),
          confirmSacrificialWriteNotApproved: checked(ID.confirmNoSacrificialWrite),
        },
      });
      var secret = document.getElementById(ID.credentialSecret);
      if (secret) secret.value = '';
      renderStatus(result);
    } catch (_) {
      renderStatus({ ok: false, blockers: ['real-transport-webdav-setup-prepare-command-failed'] });
    } finally {
      state.inFlight = false;
      renderValidation();
    }
  }

  function wireCard() {
    var form = document.getElementById(ID.form);
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        invokePrepare();
      });
      form.addEventListener('input', function () {
        state.lastStatus = null;
        renderValidation();
      });
      form.addEventListener('change', function () {
        state.lastStatus = null;
        renderValidation();
      });
    }
    var statusBtn = document.getElementById(ID.statusBtn);
    if (statusBtn) {
      statusBtn.addEventListener('click', function (event) {
        event.preventDefault();
        invokeStatus();
      });
    }
    renderValidation();
  }

  var activeObserver = null;

  function tryMount() {
    try {
      if (document.getElementById(ID.card)) return true;
      var anchor = document.querySelector('#wbSettingsSyncBox');
      if (!anchor) return false;
      anchor.insertAdjacentHTML('afterend', buildCardHtml());
      wireCard();
      state.mounted = true;
      if (state.lastStatus) renderStatus(state.lastStatus);
      return true;
    } catch (_) {
      return false;
    }
  }

  function installObserver() {
    if (activeObserver || typeof global.MutationObserver !== 'function') return;
    try {
      activeObserver = new global.MutationObserver(function () {
        tryMount();
      });
      activeObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (_) { /* keep Settings route resilient */ }
  }

  function bootstrap() {
    tryMount();
    installObserver();
    try { global.addEventListener('hashchange', tryMount); } catch (_) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  API.diagnose = function () {
    return {
      installed: true,
      mounted: !!document.getElementById(ID.card),
      desktopRuntime: detectTauri(),
      commandSurface: !!getInvoke(),
      networkAttempted: false,
      writesWebDAV: false,
      productSyncReady: false,
      transportReady: false,
    };
  };

  H2O.Studio.sync.__realTransportWebDavSetupUiInstalled = true;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
