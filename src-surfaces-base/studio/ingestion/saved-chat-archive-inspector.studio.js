/* H2O Studio — Saved Chat Archive Inspector (Desktop, Phase H.2)
 *
 * Chat Saving Architecture Phase H.2. A focused, Desktop-only, READ-ONLY package
 * inspector card, mounted adjacent to the read-only Archive Health diagnostics
 * card. It lets a human select one already-written `.h2ochat` package from the
 * known archive/packages directory and verify it:
 *   - reuses the existing Desktop diagnostics validation
 *     (H2O.Studio.ingestion.validateSavedChatPackageV1) for the authoritative
 *     manifest / required-file / hash / asset checks,
 *   - reads manifest.json (identity) and chat.md (title + a short, ESCAPED text
 *     preview) read-only via the existing bounded archive fs scope,
 *   - maps the result to a granular status:
 *     verified / corrupted / missing-files / hash-mismatch / unsupported-version /
 *     read-error.
 *
 * Boundaries (H.2 — read-only):
 *   - Desktop/Tauri only. On Chrome the diagnostics API is absent, so the card is
 *     disabled with an "available in Desktop Studio only" message.
 *   - READ-ONLY. No snapshots.create / upsert, no DB insert/update, no package
 *     write/overwrite, no import. It only reads package files + reuses the
 *     read-only validator.
 *   - It inspects ONLY packages already inside archive/packages (scoped path
 *     guard); no arbitrary file paths, no new capability.
 *   - It reads chat.md (markdown text) for the preview and renders it ESCAPED. It
 *     NEVER reads or injects chat.html, never executes package HTML.
 *   - No scanner / materializer / writer call. No watcher/poller/daemon. No
 *     Chrome runtime, no sync/WebDAV/cloud/native messaging.
 *
 * Public API (H2O.Studio.archiveInspector):
 *   isDesktopCapable() -> boolean
 *   listPackages() -> Promise<[{ packagePath, packageDirName, status }]>
 *   inspectPackage({ packagePath }) -> Promise<inspection result>
 *   mapInspectStatus(diag, readError) -> status string (pure)
 *   renderArchiveInspectorCard(container, options)
 *   mountArchiveInspectorCard(healthContainer, options)
 *
 * Contracts: release-evidence/2026-06-24/saved-chat-archive-phase-h0-recovery-import-export-contract.md
 *            release-evidence/2026-06-24/saved-chat-archive-phase-h1-recovery-import-export-validator.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveInspector && H2O.Studio.archiveInspector.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-h-2';
  var APP_LOCAL_DATA = 15;                 /* Tauri BaseDirectory.AppLocalData */
  var PACKAGE_ROOT = 'archive/packages';
  var SUPPORTED_SCHEMA_VERSIONS = [1, 2];
  var PREVIEW_MAX_CHARS = 600;
  var MARKDOWN_READ_CAP = 64 * 1024;       /* preview read cap */

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeObject(v) { return isObject(v) ? v : {}; }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getIngestion() { return (H2O.Studio && H2O.Studio.ingestion) || {}; }
  function getValidateFn() {
    var ing = getIngestion();
    return (typeof ing.validateSavedChatPackageV1 === 'function') ? ing.validateSavedChatPackageV1 : null;
  }
  function getListFn() {
    var ing = getIngestion();
    return (typeof ing.listSavedChatArchivePackagesV1 === 'function') ? ing.listSavedChatArchivePackagesV1 : null;
  }
  function isDesktopCapable() {
    return detectTauri() && !!getValidateFn() && !!getListFn();
  }

  function getInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var part = cleanString(arguments[i]).replace(/^\/+|\/+$/g, '');
      if (part) parts.push(part);
    }
    return parts.join('/');
  }

  function packageDirNameForPath(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    var idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
  }

  /* Safety scope: only inspect packages already inside archive/packages, ending
   * in .h2ochat. No arbitrary file paths. */
  function packagePathIsScoped(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    return p.indexOf(PACKAGE_ROOT + '/') === 0 && /\.h2ochat$/.test(packageDirNameForPath(p));
  }

  function decodeToText(value) {
    if (typeof value === 'string') return value;
    var bytes = value;
    if (value && value.data && (Array.isArray(value.data) || value.data instanceof Uint8Array)) bytes = value.data;
    try {
      var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(asArray(bytes));
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(arr);
      var out = ''; for (var i = 0; i < arr.length; i += 1) out += String.fromCharCode(arr[i]);
      return out;
    } catch (_) { return ''; }
  }

  /* Read a package-relative text file via the existing bounded archive fs scope
   * (baseDir AppLocalData; path under archive/packages). Read-only. */
  function readPackageTextFile(packagePath, leaf) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs read_file'));
    if (!packagePathIsScoped(packagePath)) return Promise.reject(new Error('package path not scoped to ' + PACKAGE_ROOT));
    var rel = joinPath(packagePath, leaf);
    return Promise.resolve(invoke('plugin:fs|read_file', { path: rel, options: { baseDir: APP_LOCAL_DATA } }))
      .then(decodeToText);
  }

  function safeParseJson(text) {
    try { var v = JSON.parse(text); return isObject(v) ? v : null; } catch (_) { return null; }
  }

  var TEXT = {
    title: 'Inspect Saved Chat Archive Package',
    eyebrow: 'Read-only inspector · Desktop only',
    intro: 'Verify and preview a saved chat package (.h2ochat) from the Desktop archive. Read-only: it never imports, writes, or overwrites packages or the store.',
    unavailable: 'This read-only inspector is available in Desktop Studio only.',
    loadButton: 'Load packages',
    loadingList: 'Loading packages…',
    noPackages: 'No saved chat packages found in the archive.',
    selectPlaceholder: 'Select a package to inspect…',
    inspectButton: 'Inspect package',
    busy: 'Inspecting…',
    pickFirst: 'Load and select a package first.',
  };

  var STATUS_PRESENTATION = {
    'verified': { tone: 'ok', label: 'Verified', note: 'Required files present, file hashes match the manifest, and the schema/payload version is supported.' },
    'corrupted': { tone: 'block', label: 'Corrupted', note: 'The package failed integrity validation (a manifest/asset blocker). It is not safe to import.' },
    'missing-files': { tone: 'block', label: 'Missing files', note: 'One or more required package files (manifest.json / snapshot.json / chat.md / chat.html) are missing.' },
    'hash-mismatch': { tone: 'block', label: 'Hash mismatch', note: 'A recomputed file hash does not match the manifest (or contentHash mismatched). The package content does not verify.' },
    'unsupported-version': { tone: 'warn', label: 'Unsupported version', note: 'The package schemaVersion/payloadVersion is outside the supported range (v1/v2).' },
    'read-error': { tone: 'neutral', label: 'Read error', note: 'The package could not be read or is outside the archive packages directory.' },
  };

  var PILL_TONES = {
    ok: 'background:rgba(46,160,67,.18);color:#3fb950;border:1px solid rgba(46,160,67,.35)',
    warn: 'background:rgba(210,153,34,.18);color:#d29922;border:1px solid rgba(210,153,34,.35)',
    block: 'background:rgba(248,81,73,.16);color:#f85149;border:1px solid rgba(248,81,73,.35)',
    neutral: 'background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.14)',
  };

  function isVersionSupported(schemaVersion, payloadVersion) {
    var sv = isFiniteNumber(schemaVersion) ? schemaVersion : (schemaVersion == null ? 1 : Number(schemaVersion));
    if (SUPPORTED_SCHEMA_VERSIONS.indexOf(sv) === -1) return false;
    /* payloadVersion is absent on v1 (text) packages and a finite number on v2. */
    if (payloadVersion == null) return true;
    return isFiniteNumber(payloadVersion) || isFiniteNumber(Number(payloadVersion));
  }

  function blockerCodes(diag) {
    return asArray(diag && diag.blockers).map(function (b) { return cleanString(b && b.code); }).filter(Boolean);
  }

  /* Pure: map the read-only validator diagnostic + a read error into the
   * inspector's granular status vocabulary (most-specific first). */
  function mapInspectStatus(diag, readError) {
    if (readError) return 'read-error';
    var d = safeObject(diag);
    var codes = blockerCodes(d);
    var hashChecks = safeObject(d.hashChecks);
    var assetChecks = safeObject(d.assetChecks);
    if (codes.some(function (c) { return /^(manifest|snapshot|markdown|html)-missing$/.test(c); })) return 'missing-files';
    if (hashChecks.contentHashOk === false || hashChecks.snapshotShaOk === false
        || asArray(assetChecks.hashMismatches).length
        || codes.some(function (c) { return /sha|hash/i.test(c); })) return 'hash-mismatch';
    if (!isVersionSupported(d.schemaVersion, d.payloadVersion)) return 'unsupported-version';
    if (cleanString(d.status) === 'blocked' || codes.length) return 'corrupted';
    return 'verified';
  }

  function titleFromMarkdown(md) {
    var m = /^[ \t]*#\s+(.+)$/m.exec(String(md || ''));
    return m ? cleanString(m[1]) : '';
  }

  function previewFromMarkdown(md) {
    var text = String(md || '').replace(/\r/g, '');
    /* drop the leading "# title" heading line for the body preview */
    text = text.replace(/^[ \t]*#\s+.+\n+/, '');
    text = text.slice(0, PREVIEW_MAX_CHARS).trim();
    return text;
  }

  /* Read-only: list packages already in the archive (reuses the diagnostics
   * inventory). Returns [{ packagePath, packageDirName, status }]. */
  function listPackages(options) {
    var listFn = getListFn();
    if (!detectTauri() || !listFn) return Promise.resolve([]);
    return Promise.resolve()
      .then(function () { return listFn(safeObject(options)); })
      .then(function (res) {
        var rows = Array.isArray(res) ? res : asArray(res && res.packages);
        return rows.map(function (row) {
          var r = safeObject(row);
          var packagePath = cleanString(r.packagePath) || joinPath(PACKAGE_ROOT, cleanString(r.packageDirName));
          return {
            packagePath: packagePath,
            packageDirName: cleanString(r.packageDirName) || packageDirNameForPath(packagePath),
            status: cleanString(r.status),
          };
        }).filter(function (o) { return !!o.packagePath && packagePathIsScoped(o.packagePath); });
      })
      .catch(function () { return []; });
  }

  function emptyInspection(packagePath, status, error) {
    return {
      ok: false,
      status: status,
      packagePath: cleanString(packagePath) || null,
      packageDirName: packagePath ? packageDirNameForPath(packagePath) : null,
      identity: { chatId: '', snapshotId: '', title: '', contentHash: '', schemaVersion: null, payloadVersion: null, generatedAt: '', messageCount: null },
      checks: { manifestPresent: false, snapshotPresent: false, markdownPresent: false, htmlPresent: false, assetsDirPresent: false, contentHashOk: false, hashMismatchCount: 0, supportedVersion: false },
      preview: '',
      blockers: [],
      error: error || null,
    };
  }

  /* Read-only inspection of ONE scoped package. Reuses the validator for the
   * authoritative checks; reads manifest.json + chat.md (escaped preview) for
   * display. Never reads chat.html, never writes anything. */
  function inspectPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    if (!packagePath) return Promise.resolve(emptyInspection(null, 'read-error', 'no package path'));
    if (!isDesktopCapable()) return Promise.resolve(emptyInspection(packagePath, 'read-error', 'desktop-only'));
    if (!packagePathIsScoped(packagePath)) return Promise.resolve(emptyInspection(packagePath, 'read-error', 'path-not-scoped'));
    var validateFn = getValidateFn();

    var diag = null;
    var manifest = null;
    var markdown = '';
    var readError = null;

    return Promise.resolve()
      .then(function () { return validateFn({ packagePath: packagePath }); })
      .then(function (res) { diag = safeObject(res); })
      .then(function () { return readPackageTextFile(packagePath, 'manifest.json').then(function (t) { manifest = safeParseJson(t); }, function () { manifest = null; }); })
      .then(function () { return readPackageTextFile(packagePath, 'chat.md').then(function (t) { markdown = String(t || '').slice(0, MARKDOWN_READ_CAP); }, function () { markdown = ''; }); })
      .then(function () {
        var d = safeObject(diag);
        var hashChecks = safeObject(d.hashChecks);
        var m = safeObject(manifest);
        /* read-error only when the validator itself gave nothing AND we could not read the manifest */
        if (!cleanString(d.status) && !manifest) readError = 'read-failed';
        var status = mapInspectStatus(d, readError);
        var schemaVersion = isFiniteNumber(d.schemaVersion) ? d.schemaVersion : (isFiniteNumber(m.schemaVersion) ? m.schemaVersion : null);
        var payloadVersion = (d.payloadVersion != null) ? d.payloadVersion : (m.payloadVersion != null ? m.payloadVersion : null);
        return {
          ok: status === 'verified',
          status: status,
          packagePath: packagePath,
          packageDirName: packageDirNameForPath(packagePath),
          identity: {
            chatId: cleanString(d.chatId) || cleanString(m.chatId),
            snapshotId: cleanString(d.snapshotId) || cleanString(m.snapshotId),
            title: titleFromMarkdown(markdown),
            contentHash: cleanString(hashChecks.expectedContentHash) || cleanString(m.contentHash),
            schemaVersion: schemaVersion,
            payloadVersion: payloadVersion,
            generatedAt: cleanString(m.generatedAt),
            messageCount: isFiniteNumber(m.messageCount) ? m.messageCount : null,
          },
          checks: {
            manifestPresent: d.manifestPresent !== false,
            snapshotPresent: d.snapshotPresent !== false,
            markdownPresent: d.markdownPresent !== false,
            htmlPresent: d.htmlPresent !== false,
            assetsDirPresent: d.assetsDirPresent === true,
            contentHashOk: hashChecks.contentHashOk === true,
            hashMismatchCount: asArray(safeObject(d.assetChecks).hashMismatches).length,
            supportedVersion: isVersionSupported(schemaVersion, payloadVersion),
          },
          preview: previewFromMarkdown(markdown),
          blockers: blockerCodes(d),
          error: readError,
        };
      })
      .catch(function (err) {
        return emptyInspection(packagePath, 'read-error', String((err && err.message) || err || 'inspection threw'));
      });
  }

  function pillHtml(label, tone) {
    var style = PILL_TONES[tone] || PILL_TONES.neutral;
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;' + style + '">' + escapeHtml(label) + '</span>';
  }

  function renderArchiveInspectorCard(container, options) {
    if (!container || typeof container !== 'object') return null;
    if (typeof document === 'undefined') return null;
    var opts = options || {};
    var list = (typeof opts.listPackages === 'function') ? opts.listPackages : listPackages;
    var inspect = (typeof opts.inspectPackage === 'function') ? opts.inspectPackage : inspectPackage;
    var desktop = (typeof opts.isDesktop === 'boolean') ? opts.isDesktop : isDesktopCapable();

    var card = {
      desktop: desktop, busy: false, listBusy: false, listLoaded: false,
      options: [], packagePath: '', lastResult: null,
    };

    function syncPathFromSelect() {
      var sel = container.querySelector('[data-archive-inspector-select="1"]');
      if (sel && typeof sel.value === 'string') card.packagePath = sel.value.trim();
    }

    function optionsHtml() {
      if (!card.desktop) return '';
      var rows = asArray(card.options);
      var hint = '';
      if (card.listBusy) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.loadingList) + '</div>';
      else if (card.listLoaded && !rows.length) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.noPackages) + '</div>';
      var select = '';
      if (rows.length) {
        select = '<select data-archive-inspector-select="1" style="margin-top:6px;width:100%;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit">'
          + '<option value="">' + escapeHtml(TEXT.selectPlaceholder) + '</option>';
        rows.forEach(function (row) {
          var label = row.packageDirName + (row.status ? '  [' + row.status + ']' : '');
          select += '<option value="' + escapeHtml(row.packagePath) + '"' + (row.packagePath === card.packagePath ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        });
        select += '</select>';
      }
      return hint + select;
    }

    function identityRow(key, value) {
      if (!cleanString(value)) return '';
      return '<div style="display:flex;gap:8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;user-select:text">'
        + '<span style="opacity:.55;min-width:104px">' + escapeHtml(key) + '</span><span>' + escapeHtml(value) + '</span></div>';
    }

    function resultHtml() {
      if (!card.lastResult) return '';
      var r = card.lastResult;
      var preset = STATUS_PRESENTATION[r.status] || { tone: 'neutral', label: r.status, note: '' };
      var id = safeObject(r.identity);
      var ck = safeObject(r.checks);
      var idHtml = ''
        + identityRow('package', r.packageDirName)
        + identityRow('chatId', id.chatId)
        + identityRow('snapshotId', id.snapshotId)
        + identityRow('title', id.title)
        + identityRow('messageCount', id.messageCount == null ? '' : String(id.messageCount))
        + identityRow('contentHash', id.contentHash)
        + identityRow('schemaVersion', id.schemaVersion == null ? '' : String(id.schemaVersion))
        + identityRow('payloadVersion', id.payloadVersion == null ? '' : String(id.payloadVersion))
        + identityRow('generatedAt', id.generatedAt);
      var checksLine = 'files: '
        + (ck.manifestPresent ? 'manifest✓ ' : 'manifest✗ ')
        + (ck.snapshotPresent ? 'snapshot✓ ' : 'snapshot✗ ')
        + (ck.markdownPresent ? 'chat.md✓ ' : 'chat.md✗ ')
        + (ck.htmlPresent ? 'chat.html✓' : 'chat.html✗')
        + ' · contentHash ' + (ck.contentHashOk ? 'ok' : '—')
        + ' · version ' + (ck.supportedVersion ? 'supported' : 'unsupported');
      var previewHtml = cleanString(r.preview)
        ? '<div style="margin-top:8px"><div style="opacity:.55;font-size:11px;margin-bottom:4px">chat.md preview (read-only)</div>'
          + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;max-height:160px;overflow:auto;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px;user-select:text">'
          + escapeHtml(r.preview) + '</pre></div>'
        : '';
      return '<div data-archive-inspector-result="1" data-archive-inspector-status="' + escapeHtml(r.status) + '" style="margin-top:10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + pillHtml(preset.label, preset.tone) + '<span style="opacity:.6;font-size:12px">' + escapeHtml(r.status) + '</span></div>'
        + (preset.note ? '<div style="opacity:.78;font-size:12px;margin-top:5px">' + escapeHtml(preset.note) + '</div>' : '')
        + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">' + idHtml + '</div>'
        + '<div style="opacity:.7;font-size:11px;margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">' + escapeHtml(checksLine) + '</div>'
        + previewHtml
        + '</div>';
    }

    function render() {
      var disabledRun = (!card.desktop || card.busy || card.listBusy) ? ' disabled' : '';
      var disabledLoad = (!card.desktop || card.listBusy || card.busy) ? ' disabled' : '';
      var runStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(46,160,67,.16);border:1px solid rgba(46,160,67,.4);color:inherit;font:inherit;' + ((!card.desktop || card.busy) ? 'opacity:.5;cursor:default;' : '');
      var loadStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;' + ((!card.desktop || card.listBusy || card.busy) ? 'opacity:.5;cursor:default;' : '');
      var bodyHtml;
      if (!card.desktop) {
        bodyHtml = '<div style="opacity:.7;font-size:12px;margin-top:8px">' + escapeHtml(TEXT.unavailable) + '</div>';
      } else {
        bodyHtml = ''
          + optionsHtml()
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'
          + '<button type="button" data-archive-inspector-run="1" style="' + runStyle + '"' + disabledRun + '>' + escapeHtml(card.busy ? TEXT.busy : TEXT.inspectButton) + '</button>'
          + '<button type="button" data-archive-inspector-load="1" style="' + loadStyle + '"' + disabledLoad + '>' + escapeHtml(TEXT.loadButton) + '</button>'
          + '</div>'
          + resultHtml();
      }
      container.innerHTML = ''
        + '<section data-archive-inspector-card="1" style="border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:12px;background:rgba(255,255,255,.02)">'
        + '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.6">' + escapeHtml(TEXT.eyebrow) + '</div>'
        + '<div style="font-weight:600;margin-top:2px">' + escapeHtml(TEXT.title) + '</div>'
        + '<div style="opacity:.7;font-size:12px;margin-top:4px">' + escapeHtml(TEXT.intro) + '</div>'
        + bodyHtml
        + '</section>';

      var runBtn = container.querySelector('[data-archive-inspector-run="1"]');
      if (runBtn && card.desktop && !card.busy) runBtn.addEventListener('click', doInspect, { once: true });
      var loadBtn = container.querySelector('[data-archive-inspector-load="1"]');
      if (loadBtn && card.desktop && !card.listBusy && !card.busy) loadBtn.addEventListener('click', doLoad, { once: true });
      var sel = container.querySelector('[data-archive-inspector-select="1"]');
      if (sel) sel.addEventListener('change', function (ev) { var t = ev && ev.target; card.packagePath = (t && typeof t.value === 'string') ? t.value.trim() : ''; });
    }

    function doLoad() {
      if (card.listBusy || card.busy || !card.desktop) return;
      card.listBusy = true; render();
      Promise.resolve(list({})).then(function (rows) {
        card.listBusy = false; card.listLoaded = true; card.options = asArray(rows); render();
      }, function () { card.listBusy = false; card.listLoaded = true; card.options = []; render(); });
    }

    function doInspect() {
      if (card.busy || !card.desktop) return;
      syncPathFromSelect();
      if (!card.packagePath) { card.lastResult = emptyInspection(null, 'read-error', 'select a package first'); render(); return; }
      card.busy = true; card.lastResult = null; render();
      Promise.resolve(inspect({ packagePath: card.packagePath })).then(function (res) {
        card.busy = false; card.lastResult = (res && typeof res === 'object') ? res : emptyInspection(card.packagePath, 'read-error', 'no result'); render();
      }, function (err) {
        card.busy = false; card.lastResult = emptyInspection(card.packagePath, 'read-error', String((err && err.message) || err || 'inspect threw')); render();
      });
    }

    render();
    return { getState: function () { return card; }, inspect: doInspect, load: doLoad };
  }

  /* Mount the inspector card as a SIBLING below the read-only Archive Health
   * card (and the F.2/G.2 operator card), so health re-renders never wipe it.
   * Idempotent. */
  function mountArchiveInspectorCard(healthContainer, options) {
    if (typeof document === 'undefined') return null;
    if (!healthContainer || typeof healthContainer !== 'object') return null;
    var parent = healthContainer.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return null;
    var box = (typeof parent.querySelector === 'function') ? parent.querySelector('[data-archive-inspector-mount="1"]') : null;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-archive-inspector-mount', '1');
      box.style.marginTop = '12px';
      parent.insertBefore(box, healthContainer.nextSibling);
    }
    return renderArchiveInspectorCard(box, options || {});
  }

  H2O.Studio.archiveInspector = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    listPackages: listPackages,
    inspectPackage: inspectPackage,
    mapInspectStatus: mapInspectStatus,
    renderArchiveInspectorCard: renderArchiveInspectorCard,
    mountArchiveInspectorCard: mountArchiveInspectorCard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
