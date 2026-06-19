// ==UserScript==
// @h2o-id             s0f1b.library_workspace.studio
// @name               S0F1b. 🎬 Library Workspace - Studio
// @namespace          H2O.Premium.CGX.library_workspace.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000006
// @description        Studio Library Workspace: canonical model facade for studio.js and Library Insights. Exposes getKnownChats / getFolders / getCategories / getLabels / getTags / getProjects with built-in caching and event subscriptions. Replaces ad-hoc chrome.runtime calls in studio.js with one stable API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1b Library Workspace (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const LAYOUT_KEY = 'h2o:prm:cgx:library-workspace:sidebar-layout:v1';
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const NATIVE_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:native:v1';
  const FOLDER_PARITY_RUNTIME_VERSION = 'f19.7-folder-fallback-v2';
  const FOLDER_PARITY_RUNTIME_LOADED_AT = new Date().toISOString();
  const FOLDER_PARITY_SCRIPT_URL = (() => {
    try { return String(W.document?.currentScript?.src || '').trim(); }
    catch { return ''; }
  })();

  // TODO(P8f): fill canonical palette (color/iconColor) from a native runtime probe.
  // These entries are used only when the native broadcast and stored folder-state
  // are both unavailable (cold boot or storage error). IDs, names, normalizedName,
  // icon, and sortOrder are stable; color/iconColor will be filled in P8f.
  const KNOWN_NATIVE_CANONICAL_FOLDERS = [
    { id: 'f_7050f49d3f341819dba53d547', folderId: 'f_7050f49d3f341819dba53d547', name: 'Study',   normalizedName: 'study',   icon: 'folder', color: '', iconColor: '', sortOrder: 1 },
    { id: 'f_5d9431084707f19dba53d548',  folderId: 'f_5d9431084707f19dba53d548',  name: 'Case',    normalizedName: 'case',    icon: 'folder', color: '', iconColor: '', sortOrder: 2 },
    { id: 'f_0606ea698948f19dba53d548',  folderId: 'f_0606ea698948f19dba53d548',  name: 'Dev',     normalizedName: 'dev',     icon: 'folder', color: '', iconColor: '', sortOrder: 3 },
    { id: 'f_e301f3506938c19dbac0e304',  folderId: 'f_e301f3506938c19dbac0e304',  name: 'Code',    normalizedName: 'code',    icon: 'folder', color: '', iconColor: '', sortOrder: 4 },
    { id: 'f_3bf15f43b835d19dbac0fb13',  folderId: 'f_3bf15f43b835d19dbac0fb13',  name: 'Tech',    normalizedName: 'tech',    icon: 'folder', color: '', iconColor: '', sortOrder: 5 },
    { id: 'f_2bb1037f88b2719dbac10c22',  folderId: 'f_2bb1037f88b2719dbac10c22',  name: 'English', normalizedName: 'english', icon: 'folder', color: '', iconColor: '', sortOrder: 6 },
  ];
  const CANONICAL_FOLDER_DISPLAY_COLORS = Object.freeze([
    ['f_7050f49d3f341819dba53d547', 'study',   '#F472B6'],
    ['f_5d9431084707f19dba53d548',  'case',    '#3B82F6'],
    ['f_0606ea698948f19dba53d548',  'dev',     '#22C55E'],
    ['f_e301f3506938c19dbac0e304',  'code',    '#A855F7'],
    ['f_3bf15f43b835d19dbac0fb13',  'tech',    '#14B8A6'],
    ['f_2bb1037f88b2719dbac10c22',  'english', '#FF914D'],
  ]);
  const CANONICAL_FOLDER_DISPLAY_COLOR_BY_ID = new Map(
    CANONICAL_FOLDER_DISPLAY_COLORS.map(([id, , color]) => [String(id || '').trim(), String(color || '').trim()])
      .filter(([id, color]) => id && color)
  );
  const CANONICAL_FOLDER_DISPLAY_COLOR_BY_NAME = new Map(
    CANONICAL_FOLDER_DISPLAY_COLORS.map(([, name, color]) => [normalizeFolderName(name), String(color || '').trim()])
      .filter(([name, color]) => name && color)
  );
  const CANONICAL_FOLDER_DISPLAY_ORDER_BY_ID = new Map(
    KNOWN_NATIVE_CANONICAL_FOLDERS.map((folder) => [String(folder.id || folder.folderId || '').trim(), Number(folder.sortOrder || 0)])
      .filter(([id, order]) => id && Number.isFinite(order) && order > 0)
  );
  const CANONICAL_FOLDER_DISPLAY_ORDER_BY_NAME = new Map(
    KNOWN_NATIVE_CANONICAL_FOLDERS.map((folder) => [normalizeFolderName(folder.normalizedName || folder.name), Number(folder.sortOrder || 0)])
      .filter(([name, order]) => name && Number.isFinite(order) && order > 0)
  );
  const KNOWN_NATIVE_CANONICAL_BINDING_COUNT = 8;
  const KNOWN_TEST_FOLDER_NAMES = new Set([
    'case-rt',
    'empty test folder',
    'empty-rt',
    'english-rt',
    'f5d test folder',
    'f5d.1 test folder a',
    'f5d.1 test folder b',
  ]);
  const PRIMARY_CANONICAL_FOLDER_IDS = new Set(KNOWN_NATIVE_CANONICAL_FOLDERS.map((folder) => String(folder.id || folder.folderId || '').trim()).filter(Boolean));
  const FOLDER_UI_VISIBLE_REVIEW_NAMES = new Set([
    'case',
    'english',
    'case-rt',
    'empty test folder',
    'empty-rt',
    'english-rt',
  ]);

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 100, errMax: 25 };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  const cache = {
    folders: { value: null, ts: 0, ttl: 60_000 },
    categories: { value: null, ts: 0, ttl: 60_000 },
    labels: { value: null, ts: 0, ttl: 60_000 },
    layout: null,
  };
  const state = {
    lastReads: Object.create(null),
    lastWrites: Object.create(null),
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function getChatList() { return getCore()?.getService?.('chat-list') || null; }
  function getRouteSvc() { return getCore()?.getService?.('route') || null; }
  function getUIShell() { return getCore()?.getService?.('ui-shell') || null; }
  function getPageHost() { return getCore()?.getService?.('page-host') || null; }
  function getSidebarSvc() { return getCore()?.getService?.('native-sidebar') || null; }
  function getRegistry() { return H2O.ChatRegistry || null; }

  function normalizeFolderName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function folderIdOf(row) {
    return String(row?.id || row?.folderId || '').trim();
  }

  function folderDiagnosticHash(value) {
    const text = String(value || '');
    if (!text) return '';
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return `h:${h.toString(16).padStart(8, '0').slice(0, 8)}`;
  }

  function redactFolderParityScriptUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
      .replace(/^chrome-extension:\/\/[^/]+\//i, 'chrome-extension://<redacted>/')
      .replace(/^moz-extension:\/\/[^/]+\//i, 'moz-extension://<redacted>/');
  }

  function folderNameOf(row) {
    const id = folderIdOf(row);
    return String(row?.name || row?.title || row?.label || id).trim() || id;
  }

  function finiteNumberFrom(values, fallback = null) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return fallback;
  }

  function canonicalFolderDisplayOrder(row) {
    const id = folderIdOf(row);
    const byId = CANONICAL_FOLDER_DISPLAY_ORDER_BY_ID.get(id);
    if (Number.isFinite(byId) && byId > 0) return byId;
    const byName = CANONICAL_FOLDER_DISPLAY_ORDER_BY_NAME.get(normalizeFolderName(row?.normalizedName || folderNameOf(row)));
    if (Number.isFinite(byName) && byName > 0) return byName;
    const explicit = finiteNumberFrom([row?.sortOrder, row?.sort_order, row?.displayOrder, row?.order, row?.position], null);
    if (Number.isFinite(explicit) && explicit > 0) return 1000 + explicit;
    const index = finiteNumberFrom([row?.index], null);
    return Number.isFinite(index) ? 1000 + Math.max(0, index) : 1000;
  }

  function folderColorOf(row) {
    return String(row?.iconColor || row?.color || row?.folderColor || row?.accentColor || '').trim();
  }

  function folderMetaOf(row) {
    return (row?.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
  }

  function canonicalFolderDisplayColor(row) {
    const byId = CANONICAL_FOLDER_DISPLAY_COLOR_BY_ID.get(folderIdOf(row));
    if (byId) return byId;
    return CANONICAL_FOLDER_DISPLAY_COLOR_BY_NAME.get(normalizeFolderName(row?.normalizedName || folderNameOf(row))) || '';
  }

  function indexFoldersById(folders) {
    const out = new Map();
    for (const folder of Array.isArray(folders) ? folders : []) {
      const id = folderIdOf(folder);
      if (id && !out.has(id)) out.set(id, folder);
    }
    return out;
  }

  function decorateCanonicalFolderColorSources(folder, storedById, nativeById) {
    const id = folderIdOf(folder);
    const storedRow = storedById instanceof Map ? storedById.get(id) : null;
    const nativeRow = nativeById instanceof Map ? nativeById.get(id) : null;
    const rowColor = folderColorOf(folder);
    const storedColor = folderColorOf(storedRow);
    const nativeColor = folderColorOf(nativeRow);
    const displayColor = canonicalFolderDisplayColor(folder) || rowColor || nativeColor || storedColor || '';
    const colorSource = canonicalFolderDisplayColor(folder)
      ? 'known-canonical-display-palette'
      : rowColor
        ? 'canonical-row'
        : nativeColor
          ? 'native-broadcast'
          : storedColor
            ? 'stored-folder-state'
            : 'default';
    const conflictValues = Array.from(new Set([displayColor, rowColor, nativeColor, storedColor].filter(Boolean)));
    return {
      ...folder,
      color: displayColor,
      iconColor: displayColor,
      displayColor,
      colorSource,
      rowColor,
      nativeColor,
      storedColor,
      colorConflict: conflictValues.length > 1,
    };
  }

  function normalizeFolderRow(row, index = 0, source = '') {
    const id = folderIdOf(row);
    if (!id) return null;
    const name = folderNameOf(row);
    const color = String(row?.color || row?.iconColor || '').trim();
    const iconColor = String(row?.iconColor || row?.color || '').trim();
    const icon = String(row?.icon || row?.iconKey || '').trim();
    const rawSortOrder = finiteNumberFrom([row?.sortOrder, row?.sort_order, row?.displayOrder, row?.order, row?.position], null);
    const stableCanonicalOrder = canonicalFolderDisplayOrder({ ...row, id, folderId: id, name });
    const sortOrder = Number.isFinite(stableCanonicalOrder) && stableCanonicalOrder > 0
      ? stableCanonicalOrder
      : (Number.isFinite(rawSortOrder) ? rawSortOrder : index);
    const out = {
      id,
      folderId: id,
      name,
      normalizedName: normalizeFolderName(name),
      source: String(row?.source || source || '').trim(),
      stateSource: String(source || row?.stateSource || '').trim(),
      index,
      sortOrder,
    };
    const meta = folderMetaOf(row);
    if (Object.keys(meta).length > 0) out.meta = { ...meta };
    if (row?.userCreated === true || meta.userCreated === true) out.userCreated = true;
    if (row?.materializedUserFolder === true || meta.materializedUserFolder === true) out.materializedUserFolder = true;
    if (row?.trustedFolderDisplay === true || meta.trustedFolderDisplay === true) out.trustedFolderDisplay = true;
    if (color) out.color = color;
    if (iconColor) out.iconColor = iconColor;
    if (icon) out.icon = icon;
    return out;
  }

  function isNativeOwnedFolderMirrorRow(row) {
    const source = String(row?.source || '').trim().toLowerCase();
    const kind = String(row?.kind || '').trim().toLowerCase();
    if (source === 'native-folder-catalog') return true;
    if (source === 'native-folder-state') return true;
    if (source === 'native-broadcast') return true;
    if (source === 'native-h2o-folder-state') return true;
    if (source.includes('native') && (source.includes('folder') || source.includes('catalog'))) return true;
    if (kind === 'native-folder-catalog' || kind === 'native-folder-state') return true;
    return false;
  }

  const LOCAL_REVIEW_BUCKET_ORDER = ['conflict', 'test', 'extra', 'desktop-only', 'chrome-only', 'review-required'];

  function formatCanonicalCountLabel(row) {
    const native = Number(row?.nativeMembershipCount ?? row?.canonicalCount ?? 0);
    const known = Number(row?.knownStudioCount ?? row?.knownCount ?? 0);
    return `${native} native · ${known} known here`;
  }

  function deriveReviewBucket(rowLike) {
    if (!rowLike || rowLike.isCanonical) return null;
    if (rowLike.isConflict) return 'conflict';
    if (rowLike.isTestCandidate) return 'test';
    // Source-origin heuristic: P8b only assigns desktop-only / chrome-only when the
    // source tag clearly names the origin store. Ambiguous tags fall back to 'extra'
    // so P8e can tighten the routing once renderers wire in.
    const source = String(rowLike.source || '').toLowerCase();
    if (source.includes('desktop') || source.includes('sqlite') || source.includes('tauri')) return 'desktop-only';
    if (source.includes('chat-list') || source.includes('bridge') || source.includes('chrome-only')) return 'chrome-only';
    return 'extra';
  }

  function sortCanonicalRows(rows) {
    const arr = Array.isArray(rows) ? rows.slice() : [];
    return arr.sort((a, b) => {
      const so = canonicalFolderDisplayOrder(a) - canonicalFolderDisplayOrder(b);
      if (so !== 0) return so;
      const ix = (Number(a?.index) || 0) - (Number(b?.index) || 0);
      if (ix !== 0) return ix;
      return String(a?.normalizedName || '').localeCompare(String(b?.normalizedName || ''));
    });
  }

  function sortLocalReviewRows(rows) {
    const arr = Array.isArray(rows) ? rows.slice() : [];
    return arr.sort((a, b) => {
      const ai = LOCAL_REVIEW_BUCKET_ORDER.indexOf(String(a?.reviewBucket || ''));
      const bi = LOCAL_REVIEW_BUCKET_ORDER.indexOf(String(b?.reviewBucket || ''));
      const aIdx = ai === -1 ? LOCAL_REVIEW_BUCKET_ORDER.length : ai;
      const bIdx = bi === -1 ? LOCAL_REVIEW_BUCKET_ORDER.length : bi;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return String(a?.normalizedName || '').localeCompare(String(b?.normalizedName || ''));
    });
  }

  function normalizeFolderStateForParity(raw, source = '') {
    const src = raw && typeof raw === 'object' ? raw : {};
    const folders = (Array.isArray(src.folders) ? src.folders : [])
      .map((row, index) => normalizeFolderRow(row, index, source || src.source || 'folder-state'))
      .filter(Boolean);
    const inputItems = src.items && typeof src.items === 'object' ? src.items : {};
    const items = {};
    for (const folder of folders) {
      const values = Array.isArray(inputItems[folder.id]) ? inputItems[folder.id] : [];
      items[folder.id] = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    }
    return { folders, items };
  }

  function mergeTrustedCanonicalFolderStates(primaryState, secondaryState, primaryLabel = '', secondaryLabel = '') {
    const primary = primaryState && typeof primaryState === 'object' ? primaryState : { folders: [], items: {} };
    const secondary = secondaryState && typeof secondaryState === 'object' ? secondaryState : { folders: [], items: {} };
    const primaryIsAuthoritativeNative = String(primaryLabel || '').toLowerCase().includes('native');
    const primaryIds = new Set((Array.isArray(primary.folders) ? primary.folders : []).map((row) => folderIdOf(row)).filter(Boolean));
    const folders = [];
    const seen = new Set();
    const push = (row, label, isSecondary = false) => {
      const id = folderIdOf(row);
      if (!id || seen.has(id)) return;
      if (isSecondary && primaryIsAuthoritativeNative && isNativeOwnedFolderMirrorRow(row) && !primaryIds.has(id)) return;
      const next = {
        ...row,
        source: String(row?.source || label || '').trim(),
      };
      folders.push(next);
      seen.add(id);
    };
    (Array.isArray(primary.folders) ? primary.folders : []).forEach((row) => push(row, primaryLabel));
    (Array.isArray(secondary.folders) ? secondary.folders : []).forEach((row) => push(row, secondaryLabel, true));

    const items = {};
    folders.forEach((folder) => {
      const id = folderIdOf(folder);
      const primaryItems = Array.isArray(primary.items?.[id]) ? primary.items[id] : [];
      const secondaryItems = Array.isArray(secondary.items?.[id]) ? secondary.items[id] : [];
      const values = primaryIsAuthoritativeNative && primaryIds.has(id) ? primaryItems : [...primaryItems, ...secondaryItems];
      items[id] = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    });
    return { folders, items };
  }

  function enrichKnownCanonicalFallbackRows(knownRows, storedRows) {
    const rows = Array.isArray(knownRows) ? knownRows : [];
    const stored = Array.isArray(storedRows) ? storedRows : [];
    const knownIds = new Set(rows.map((row) => folderIdOf(row)).filter(Boolean));
    const storedById = new Map();
    for (const row of stored) {
      const id = folderIdOf(row);
      if (!id || !knownIds.has(id)) continue;
      storedById.set(id, row);
    }

    const knownOrder = rows.map((row) => folderIdOf(row)).filter(Boolean).join('\n');
    const storedOrder = stored
      .map((row) => folderIdOf(row))
      .filter((id) => id && knownIds.has(id))
      .join('\n');
    const canUseStoredOrder = !!storedOrder && storedOrder === knownOrder;
    let enriched = false;

    const enrichedRows = rows.map((row) => {
      const id = folderIdOf(row);
      const storedRow = storedById.get(id);
      if (!storedRow) return row;
      const next = { ...row };
      const storedName = String(storedRow?.name || storedRow?.title || '').trim();
      const storedColor = String(storedRow.color || '').trim();
      const storedIconColor = String(storedRow.iconColor || '').trim();
      const storedIcon = String(storedRow.icon || '').trim();
      if (storedName && storedName !== next.name) {
        next.name = storedName;
        next.normalizedName = normalizeFolderName(storedName);
        next.title = storedName;
        enriched = true;
      }
      if (!next.color && storedColor) {
        next.color = storedColor;
        enriched = true;
      }
      if (!next.iconColor && storedIconColor) {
        next.iconColor = storedIconColor;
        enriched = true;
      }
      if (!next.icon && storedIcon) {
        next.icon = storedIcon;
        enriched = true;
      }
      if (canUseStoredOrder) {
        const storedSortOrder = Number(storedRow.sortOrder);
        const storedIndex = Number(storedRow.index);
        if (Number.isFinite(storedSortOrder) && Number(next.sortOrder) !== storedSortOrder) {
          next.sortOrder = storedSortOrder;
          enriched = true;
        }
        if (Number.isFinite(storedIndex) && Number(next.index) !== storedIndex) {
          next.index = storedIndex;
          enriched = true;
        }
      }
      return next;
    });

    return { rows: enrichedRows, enriched };
  }

  function countFolderStateBindings(items) {
    if (!items || typeof items !== 'object') return 0;
    return Object.values(items).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0);
  }

  function normalizeNativeBroadcastPayload(value) {
    const raw = value && typeof value === 'object' ? value : null;
    if (!raw) return null;
    if (raw.folderState || raw.projectCatalog || Array.isArray(raw.linkedRecords) || raw.surface === 'native') return raw;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
    if (payload && (payload.folderState || payload.projectCatalog || Array.isArray(payload.linkedRecords) || payload.surface === 'native')) return payload;
    const nestedValue = raw.value && typeof raw.value === 'object' ? raw.value : null;
    if (nestedValue && (nestedValue.folderState || nestedValue.projectCatalog || Array.isArray(nestedValue.linkedRecords) || nestedValue.surface === 'native')) return nestedValue;
    return raw;
  }

  function readStorageKey(key) {
    return new Promise((resolve) => {
      try {
        const chromeLocal = W.chrome?.storage?.local;
        if (chromeLocal && typeof chromeLocal.get === 'function') {
          chromeLocal.get([key], (items) => {
            try {
              const lastError = W.chrome?.runtime?.lastError;
              if (lastError) {
                resolve({ source: 'chrome.storage.local', error: String(lastError.message || lastError) });
                return;
              }
              resolve({ source: 'chrome.storage.local', value: items ? items[key] : undefined });
            } catch (e) {
              resolve({ source: 'chrome.storage.local', error: String(e?.message || e) });
            }
          });
          return;
        }
      } catch (e) {
        resolve({ source: 'chrome.storage.local', error: String(e?.message || e) });
        return;
      }
      try {
        const raw = W.localStorage?.getItem?.(key);
        resolve({ source: 'localStorage', value: raw ? JSON.parse(raw) : undefined });
      } catch (e) {
        resolve({ source: 'localStorage', error: String(e?.message || e) });
      }
    });
  }

  function groupDuplicateFolderNames(folders) {
    const byName = new Map();
    for (const folder of Array.isArray(folders) ? folders : []) {
      const normalizedName = normalizeFolderName(folder?.normalizedName || folderNameOf(folder));
      if (!normalizedName || normalizedName === 'unfiled') continue;
      const row = byName.get(normalizedName) || { normalizedName, name: folderNameOf(folder), ids: [], folders: [] };
      const id = folderIdOf(folder);
      if (id && !row.ids.includes(id)) row.ids.push(id);
      row.folders.push(folder);
      byName.set(normalizedName, row);
    }
    return Array.from(byName.values()).filter((row) => row.ids.length > 1);
  }

  function detectTestFolderCandidates(folders) {
    return (Array.isArray(folders) ? folders : [])
      .filter((folder) => {
        const name = normalizeFolderName(folder?.normalizedName || folderNameOf(folder));
        const id = folderIdOf(folder).toLowerCase();
        if (!name || name === 'unfiled') return false;
        return KNOWN_TEST_FOLDER_NAMES.has(name) || /^f5d/.test(id) || /^fld-rt-/.test(id) || /^fld-empty-/.test(id);
      })
      .map((folder) => ({
        id: folderIdOf(folder),
        folderId: folderIdOf(folder),
        name: folderNameOf(folder),
        normalizedName: normalizeFolderName(folder?.normalizedName || folderNameOf(folder)),
      }));
  }

  function isF5DReviewFolder(row) {
    const name = normalizeFolderName(row?.normalizedName || folderNameOf(row));
    const id = folderIdOf(row).toLowerCase();
    return /^f5d/.test(id) || name.startsWith('f5d ');
  }

  function isPrimaryCanonicalFolder(row) {
    return PRIMARY_CANONICAL_FOLDER_IDS.has(folderIdOf(row));
  }

  function isStoredFolderStateRow(row) {
    const stateSource = String(row?.stateSource || '').trim().toLowerCase();
    return stateSource === 'stored-folder-state' || stateSource === 'folder-state';
  }

  function isMaterializedUserFolder(row) {
    const id = folderIdOf(row);
    const name = normalizeFolderName(row?.normalizedName || folderNameOf(row));
    if (!id || !name || name === 'unfiled') return false;
    if (isPrimaryCanonicalFolder(row) || isF5DReviewFolder(row)) return false;
    const meta = folderMetaOf(row);
    if (row?.materializedUserFolder === true || meta.materializedUserFolder === true) return true;
    if (row?.trustedFolderDisplay === true || meta.trustedFolderDisplay === true) return true;
    const source = String(row?.source || meta.source || '').trim().toLowerCase();
    if ((row?.userCreated === true || meta.userCreated === true) && source.includes('desktop')) return true;
    return false;
  }

  function isCanonicalDisplayFolder(row) {
    return isPrimaryCanonicalFolder(row) || isStoredFolderStateRow(row) || isMaterializedUserFolder(row);
  }

  function filterFolderStateForNormalDisplay(stateInput, includeStoredDynamic = false) {
    const src = stateInput && typeof stateInput === 'object' ? stateInput : { folders: [], items: {} };
    const folders = (Array.isArray(src.folders) ? src.folders : [])
      .filter((folder) => isPrimaryCanonicalFolder(folder) || (includeStoredDynamic && isStoredFolderStateRow(folder)));
    const ids = new Set(folders.map((folder) => folderIdOf(folder)).filter(Boolean));
    const items = {};
    Object.keys(src.items || {}).forEach((folderId) => {
      if (!ids.has(folderId)) return;
      items[folderId] = Array.isArray(src.items[folderId]) ? src.items[folderId].slice() : [];
    });
    return { folders, items };
  }

  function mergeCanonicalFolderDisplaySource(localRow, canonicalRow, canonicalMirrorAvailable) {
    const canonical = canonicalRow && typeof canonicalRow === 'object' ? canonicalRow : {};
    const local = localRow && typeof localRow === 'object' ? localRow : {};
    const next = { ...canonical };
    const canonicalName = String(next.name || next.title || '').trim();
    const localName = String(local.name || local.title || '').trim();
    if (!canonicalMirrorAvailable && localName && localName !== canonicalName) {
      next.name = localName;
      next.title = localName;
      next.normalizedName = normalizeFolderName(localName);
    }
    if (!canonicalMirrorAvailable) {
      const localColor = String(local.iconColor || local.color || '').trim();
      if (!String(next.color || '').trim() && localColor) next.color = localColor;
      if (!String(next.iconColor || '').trim() && localColor) next.iconColor = localColor;
      const localIcon = String(local.icon || local.iconKey || '').trim();
      if (!String(next.icon || '').trim() && localIcon) next.icon = localIcon;
    }
    const stableOrder = canonicalFolderDisplayOrder(next);
    if (Number.isFinite(stableOrder) && stableOrder > 0) next.sortOrder = stableOrder;
    return next;
  }

  function isVisibleFolderUiReviewRow(row, canonicalNames) {
    const id = folderIdOf(row);
    const name = normalizeFolderName(row?.normalizedName || folderNameOf(row));
    if (!id || !name || name === 'unfiled') return false;
    if (isPrimaryCanonicalFolder(row)) return false;
    if (isF5DReviewFolder(row)) return false;
    if (FOLDER_UI_VISIBLE_REVIEW_NAMES.has(name)) return true;
    if (canonicalNames?.has?.(name) && /^fld-/.test(id.toLowerCase())) return true;
    if (/^fld-rt-/.test(id.toLowerCase()) || /^fld-empty-/.test(id.toLowerCase())) return true;
    return false;
  }

  function summarizeKnownRowsByFolder() {
    const byFolder = getIndex()?.facets?.()?.byFolder || {};
    const out = {};
    for (const [folderId, chatIds] of Object.entries(byFolder || {})) {
      out[folderId] = Array.isArray(chatIds) ? chatIds.length : 0;
    }
    return out;
  }

  function summarizeIndexRowsByFolder() {
    const idx = getIndex();
    const rows = idx && typeof idx.getAll === 'function' ? idx.getAll() : [];
    const out = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const folderId = String(row?.folderId || row?.folder || '').trim();
      if (!folderId) continue;
      const bucket = out[folderId] || { known: 0, saved: 0, linked: 0, chatIds: [] };
      bucket.known += 1;
      const view = String(row?.view || '').trim().toLowerCase();
      if (view === 'saved') bucket.saved += 1;
      if (view === 'linked') bucket.linked += 1;
      if (row?.chatId) bucket.chatIds.push(String(row.chatId));
      out[folderId] = bucket;
    }
    return out;
  }

  // ── Layout persistence ─────────────────────────────────────────────────────
  function loadLayout() {
    if (cache.layout) return cache.layout;
    try {
      const raw = W.localStorage.getItem(LAYOUT_KEY);
      cache.layout = raw ? JSON.parse(raw) : { sidebarExpanded: true, view: 'saved' };
    } catch (e) { err('loadLayout', e); cache.layout = { sidebarExpanded: true, view: 'saved' }; }
    return cache.layout;
  }
  function saveLayout(patch) {
    try {
      const next = { ...loadLayout(), ...(patch || {}) };
      cache.layout = next;
      W.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      step('saveLayout', JSON.stringify(next));
      return true;
    } catch (e) { err('saveLayout', e); return false; }
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────
  function isFresh(slot) {
    return slot && slot.value != null && (Date.now() - slot.ts) < slot.ttl;
  }
  function setCache(slot, value) {
    slot.value = value;
    slot.ts = Date.now();
  }
  function itemCount(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  }
  function cacheAge(slot) {
    return slot && slot.ts ? Math.max(0, Date.now() - slot.ts) : null;
  }
  function recordRead(name, payload) {
    try {
      state.lastReads[String(name || '')] = {
        ...(payload || {}),
        at: Date.now(),
      };
    } catch {}
  }
  function recordWrite(name, payload) {
    try {
      const clean = { ...(payload || {}) };
      if (clean.result && typeof clean.result === 'object') {
        clean.resultSummary = {
          ok: clean.result.ok,
          status: clean.result.status || clean.result.reason || '',
          keys: Object.keys(clean.result).slice(0, 16),
        };
        delete clean.result;
      }
      state.lastWrites[String(name || '')] = {
        ...clean,
        at: Date.now(),
      };
    } catch {}
  }
  function bustCaches(reason) {
    cache.folders.value = null;
    cache.categories.value = null;
    cache.labels.value = null;
    step('cache-bust', String(reason || ''));
    // Notify subscribers that derived caches were invalidated. Library Sync uses
    // this to coordinate cross-surface refreshes; Insights uses it to re-render.
    try {
      W.dispatchEvent(new CustomEvent('evt:h2o:library-workspace:cache-bust', {
        detail: { reason: String(reason || ''), surface: 'studio', t: Date.now() },
      }));
    } catch {}
  }

  // ── Desktop (Tauri) catalog source — M2c-1 ───────────────────────────────
  // On Tauri Studio Desktop, the chat-list service (MV3 archive bridge) is
  // unavailable, so the original getFolders/getCategories/getLabels paths
  // silently return []. Branch each getter on LW_isTauri() and source the
  // catalog rows from the SQLite-backed entity stores instead:
  //   store.folders.list()    → workspace folder shape (id, name, kind, …)
  //   store.categories.list() → workspace category shape (id, name, status, …)
  //   store.labels.list()     → workspace label shape (id, name, type, …)
  // Cache invalidation already piggybacks on the existing bindIndex →
  // bustCaches chain: any SQLite write fires LibraryIndex subscribers
  // (M2a-3g), which fires the Index subscriber inside Workspace, which
  // calls bustCaches — clearing the desktop-sourced cache too. No new
  // subscription required.
  function LW_isTauri() {
    try {
      return !!(W.H2O && W.H2O.Studio && W.H2O.Studio.platform
        && W.H2O.Studio.platform.env && W.H2O.Studio.platform.env.isTauri === true);
    } catch { return false; }
  }
  function getStudioStores() {
    try { return (W.H2O && W.H2O.Studio && W.H2O.Studio.store) || {}; }
    catch { return {}; }
  }
  function epochToIso(ms) {
    if (!ms || typeof ms !== 'number' || ms <= 0) return '';
    try { return new Date(ms).toISOString(); }
    catch { return ''; }
  }
  /* Map SQLite folder row → MV3 chat-list folder shape consumed by
   * S0Z1g sidebar sections + studio.js folder picker + S0F3a Folders. */
  function projectFolderRowForWorkspace(row) {
    if (!row || !row.folderId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    const color = row.color || meta.iconColor || meta.color || '';
    return {
      id: row.folderId,
      name: row.name || '',
      createdAt: epochToIso(row.createdAt),
      updatedAt: epochToIso(row.updatedAt),
      kind: meta.kind || 'local',
      parentId: row.parentId || meta.parentId || '',
      source: row.source || meta.source || 'desktop-sqlite',
      sortOrder: (typeof row.sortOrder === 'number') ? row.sortOrder : ((typeof meta.sortOrder === 'number') ? meta.sortOrder : 0),
      projectRef: (meta.projectRef && typeof meta.projectRef === 'object') ? meta.projectRef : null,
      color,
      iconColor: color,
      icon: meta.icon || meta.iconKey || '',
      meta,
      userCreated: row.userCreated === true || meta.userCreated === true,
      materializedUserFolder: row.materializedUserFolder === true || meta.materializedUserFolder === true,
      trustedFolderDisplay: row.trustedFolderDisplay === true || meta.trustedFolderDisplay === true,
    };
  }
  function deriveFolderRowsFromIndex() {
    const index = getIndex();
    const rows = index && typeof index.getAll === 'function' ? index.getAll() : [];
    const byId = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row?.folderId || row?.folder || '').trim();
      if (!id) continue;
      const name = String(row?.folderName || row?.folderLabel || row?.folderTitle || id).trim() || id;
      const prev = byId.get(id) || {};
      byId.set(id, {
        ...prev,
        id,
        folderId: id,
        name: prev.name && prev.name !== id ? prev.name : name,
        kind: prev.kind || 'local',
        projectRef: prev.projectRef || null,
        iconColor: prev.iconColor || '',
        source: 'library-index-derived',
      });
    }
    return Array.from(byId.values()).sort((a, b) => (
      String(a.name || a.id).localeCompare(String(b.name || b.id))
      || String(a.id).localeCompare(String(b.id))
    ));
  }
  /* Map SQLite category row → MV3 chat-list category shape. status defaults
   * to 'active' since our V1 schema has no separate replacement model. */
  function projectCategoryRowForWorkspace(row) {
    if (!row || !row.categoryId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    return {
      id: row.categoryId,
      name: row.name || '',
      description: meta.description || '',
      color: meta.color || '',
      sortOrder: (typeof meta.sortOrder === 'number') ? meta.sortOrder : 0,
      createdAt: epochToIso(row.createdAt),
      updatedAt: epochToIso(row.updatedAt),
      status: meta.status || 'active',
      replacementCategoryId: meta.replacementCategoryId || null,
      aliases: Array.isArray(meta.aliases) ? meta.aliases.slice() : [],
    };
  }
  /* Map SQLite label row → MV3 chat-list label shape. type defaults to
   * 'custom' (the MV3 fallback bucket) when not present in meta. */
  function projectLabelRowForWorkspace(row) {
    if (!row || !row.labelId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    return {
      id: row.labelId,
      name: row.name || '',
      type: meta.type || 'custom',
      color: row.color || '',
      sortOrder: (typeof meta.sortOrder === 'number') ? meta.sortOrder : 0,
      createdAt: epochToIso(row.createdAt),
    };
  }
  /* Shared Desktop catalog fetcher used by all three getters. Caches the
   * result and records the read source so diagnose() reports it. On error,
   * falls back to the prior cache value (rather than throwing) so UI stays
   * stable. */
  async function desktopFetchCatalog(slot, name, sqliteFetcher) {
    try {
      const list = await sqliteFetcher();
      const safe = Array.isArray(list) ? list : [];
      setCache(slot, safe);
      /* Tag the slot so the cache fast-path in getFolders/Categories/Labels
       * can tell Desktop-sourced cache from MV3-sourced cache. Without this,
       * a stale [] left over from an MV3-fallback call would shadow the
       * Desktop branch on subsequent reads. */
      slot.source = 'desktop-sqlite';
      recordRead(name, { source: 'desktop-sqlite', count: safe.length, fresh: true });
      return safe;
    } catch (e) {
      recordRead(name, {
        source: 'desktop-sqlite-error',
        count: itemCount(slot.value),
        fresh: true,
        error: String((e && e.message) || e),
      });
      err('desktopFetch.' + name, e);
      return slot.value || [];
    }
  }

  // ── Model fetchers ─────────────────────────────────────────────────────────
  async function getKnownChats({ view = 'saved', folderId = '', filters = {}, fresh = false } = {}) {
    const index = getIndex();
    if (!index) {
      const cl = getChatList();
      if (cl) {
        try { return await cl.listByView(view); } catch (e) { err('getKnownChats.fallback', e); return []; }
      }
      return [];
    }
    if (fresh) {
      try { await index.refresh('workspace.fresh'); } catch (e) { err('getKnownChats.refresh', e); }
    }
    const rows = index.query({ view, folderId, ...filters });
    return rows;
  }

  async function getFolders({ fresh = false } = {}) {
    const desktop = LW_isTauri();
    /* On Tauri, only honor cache that was last populated by the Desktop
     * SQLite branch — never reuse a stale MV3 chat-list cache (which on
     * Desktop would be []) or an untagged pre-M2c-1 cache. */
    if (!fresh && isFresh(cache.folders) && (!desktop || cache.folders.source === 'desktop-sqlite')) {
      if (!desktop && itemCount(cache.folders.value) === 0 && deriveFolderRowsFromIndex().length > 0) {
        // Fall through: the bridge/catalog cache is empty but archive rows have
        // folder assignments, so derive a read-only folder catalog from them.
      } else {
        recordRead('folders', { source: 'cache', count: itemCount(cache.folders.value), fresh: false });
        return cache.folders.value;
      }
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.folders, 'folders', async () => {
        const store = getStudioStores().folders;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectFolderRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('folders', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getFoldersList();
      const safe = Array.isArray(list) ? list : [];
      const derived = safe.length ? [] : deriveFolderRowsFromIndex();
      setCache(cache.folders, safe.length ? safe : derived);
      cache.folders.source = safe.length ? 'chat-list.bridge' : 'library-index-derived';
      recordRead('folders', { source: cache.folders.source, count: itemCount(cache.folders.value), fresh: !!fresh });
      return cache.folders.value;
    } catch (e) {
      const derived = deriveFolderRowsFromIndex();
      if (derived.length) {
        setCache(cache.folders, derived);
        cache.folders.source = 'library-index-derived-after-error';
        recordRead('folders', { source: cache.folders.source, count: itemCount(cache.folders.value), fresh: !!fresh, error: String(e?.message || e) });
        return cache.folders.value;
      }
      recordRead('folders', { source: 'error', count: itemCount(cache.folders.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getFolders', e);
      return cache.folders.value || [];
    }
  }

  async function getCategories({ fresh = false } = {}) {
    const desktop = LW_isTauri();
    if (!fresh && isFresh(cache.categories) && (!desktop || cache.categories.source === 'desktop-sqlite')) {
      recordRead('categories', { source: 'cache', count: itemCount(cache.categories.value), fresh: false });
      return cache.categories.value;
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.categories, 'categories', async () => {
        const store = getStudioStores().categories;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectCategoryRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('categories', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getCategoriesCatalog();
      setCache(cache.categories, Array.isArray(list) ? list : []);
      recordRead('categories', { source: 'chat-list.bridge', count: itemCount(cache.categories.value), fresh: !!fresh });
      return cache.categories.value;
    } catch (e) {
      recordRead('categories', { source: 'error', count: itemCount(cache.categories.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getCategories', e);
      return cache.categories.value || [];
    }
  }

  async function getLabels({ fresh = false } = {}) {
    const desktop = LW_isTauri();
    if (!fresh && isFresh(cache.labels) && (!desktop || cache.labels.source === 'desktop-sqlite')) {
      recordRead('labels', { source: 'cache', count: itemCount(cache.labels.value), fresh: false });
      return cache.labels.value;
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.labels, 'labels', async () => {
        const store = getStudioStores().labels;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectLabelRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('labels', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getLabelsCatalog();
      setCache(cache.labels, Array.isArray(list) ? list : []);
      recordRead('labels', { source: 'chat-list.bridge', count: itemCount(cache.labels.value), fresh: !!fresh });
      return cache.labels.value;
    } catch (e) {
      recordRead('labels', { source: 'error', count: itemCount(cache.labels.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getLabels', e);
      return cache.labels.value || [];
    }
  }

  async function getTags() {
    const index = getIndex();
    if (!index) {
      recordRead('tags', { source: 'unavailable', count: 0 });
      return [];
    }
    const counts = index.counts().tags || {};
    const tags = Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    recordRead('tags', { source: 'LibraryIndex.counts.tags', count: tags.length });
    return tags;
  }

  async function getProjects() {
    const projectsFacade = H2O.Projects;
    if (projectsFacade && typeof projectsFacade.listProjects === 'function') {
      try {
        const projects = projectsFacade.listProjects();
        if (Array.isArray(projects) && projects.length) {
          recordRead('projects', { source: 'H2O.Projects.listProjects', count: projects.length });
          return projects;
        }
      } catch (e) {
        recordRead('projects', { source: 'H2O.Projects.error', count: 0, error: String(e?.message || e) });
        err('getProjects.facade', e);
      }
    }
    const index = getIndex();
    if (!index) {
      recordRead('projects', { source: 'unavailable', count: 0 });
      return [];
    }
    const f = index.facets();
    const projects = Object.entries(f.byProject || {})
      .map(([id, chatIds]) => ({ id, chatIds: chatIds.slice(), count: chatIds.length }));
    recordRead('projects', { source: 'LibraryIndex.facets.byProject', count: projects.length });
    return projects;
  }

  async function resolveFolderBindings(chatIds) {
    const cl = getChatList();
    if (!cl) {
      recordRead('folderBindings', { source: 'unavailable', count: 0, requested: Array.isArray(chatIds) ? chatIds.length : 0 });
      return {};
    }
    try {
      const result = await cl.resolveFolderBindings(chatIds);
      recordRead('folderBindings', {
        source: 'chat-list.bridge',
        count: itemCount(result),
        requested: Array.isArray(chatIds) ? chatIds.length : 0,
      });
      return result;
    }
    catch (e) {
      recordRead('folderBindings', {
        source: 'error',
        count: 0,
        requested: Array.isArray(chatIds) ? chatIds.length : 0,
        error: String(e?.message || e),
      });
      err('resolveFolderBindings', e);
      return {};
    }
  }

  // ── Mutations (write through to archive bridge, then refresh) ──────────────
  // Every mutation:
  //   1. Sends the write through the chat-list service (archive bridge).
  //   2. Busts the local Workspace caches so the next read picks up fresh data.
  //   3. Triggers a Library Index refresh (in-flight calls dedup automatically,
  //      so a batch of 50 mutations costs only one archive scan).
  //   4. Emits 'library-workspace:updated' so Insights/Sidebar/studio.js
  //      subscribers re-render.
  //   5. Library Sync (S0F1h) picks up the resulting chrome.storage changes
  //      and broadcasts to native — closing the cross-surface loop.

  function folderWriteFailure(status, chatId, folderId, reason) {
    return {
      ok: false,
      status: String(status || 'folder-write-failed'),
      reason: String(reason || status || 'folder-write-failed'),
      chatId: String(chatId || ''),
      folderId: String(folderId || ''),
      folderName: '',
    };
  }

  function isFolderBridgeTransportError(error) {
    const msg = String(error?.stack || error?.message || error || '');
    return /Could not establish connection|Receiving end does not exist|folder bridge|chat-list service unavailable|open a ChatGPT tab to access folders|Extension context invalidated|context invalidated/i.test(msg);
  }

  /* M2c-2 Desktop folder write. folderId truthy → store.folders.bindChat
   * (INSERT OR REPLACE; chat_id is PK so prior binding is replaced
   * atomically). folderId empty/null → unbind via listForChat + unbindChat
   * for every current folder (typically 0 or 1 per V1 chat). Returns a
   * result shape compatible with MV3's setFolderBinding so studio.js's
   * picker handler doesn't need to branch.
   *
   * R4.4: SQLite-write delegation now goes through
   *   H2O.Studio.actions.folders.bindChat / unbindChat
   * when that module is loaded (S0F3b). Behavior PRESERVED — same
   * return shape, same `folder-binding-changed` event dispatch via
   * emitUpdated, same bustCaches, same explicit getIndex().refresh(),
   * same recordWrite('folderBinding', ...) diagnostic, same failure
   * codes. The actions module fires its own canonical refresh-request
   * event too; both go through S0F1c's single-flight runRefresh so
   * coalescing is automatic.
   *
   * If actions.folders is NOT loaded (defensive: bundle missing S0F3b
   * for any reason), this function transparently falls back to the
   * direct store.folders.* calls — preserving the pre-R4.4 contract. */
  async function desktopSetFolderBinding(chatId, folderId, opts) {
    const cid = String(chatId || '').trim();
    const folder = String(folderId || '').trim();
    if (!cid) {
      const result = folderWriteFailure('missing-chat-id', cid, folder, 'chatId required');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    const store = getStudioStores().folders;
    if (!store) {
      const result = folderWriteFailure('desktop-store-unavailable', cid, folder, 'store.folders unavailable');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    /* R4.4: prefer the actions module when loaded; gracefully fall
     * back to the legacy direct-store path otherwise. */
    const actions = (W.H2O && W.H2O.Studio && W.H2O.Studio.actions && W.H2O.Studio.actions.folders) || null;
    try {
      let folderName = '';
      if (folder) {
        let bindOk = false;
        let actionResult = null;
        if (actions && typeof actions.bindChat === 'function') {
          actionResult = await actions.bindChat(cid, folder);
          bindOk = !!(actionResult && actionResult.ok);
        } else {
          /* Legacy fallback: direct store call (pre-R4.4 behavior). */
          bindOk = await store.bindChat(folder, cid, { assignedAt: Date.now() });
        }
        if (!bindOk) {
          /* Surface action-side failure codes if available — gives
           * callers a richer diagnostic than the legacy boolean. */
          const reason = (actionResult && actionResult.status === 'folder-not-found')
            ? 'folder not found in store'
            : 'bindChat returned false';
          const result = folderWriteFailure('desktop-bind-failed', cid, folder, reason);
          recordWrite('folderBinding', { ...result });
          return result;
        }
        try {
          const f = (typeof store.get === 'function') ? await store.get(folder) : null;
          folderName = (f && f.name) || '';
        } catch (_) { /* name lookup is best-effort */ }
      } else {
        /* Unbind: clear every folder currently bound to this chat. V1's
         * folder_bindings.PRIMARY KEY (chat_id) means listForChat returns
         * at most one row, but loop defensively in case the caller has
         * relaxed that. */
        if (actions && typeof actions.unbindChat === 'function') {
          /* actions.unbindChat already does the listForChat + loop;
           * it's a no-op if the chat had no folder. */
          try { await actions.unbindChat(cid); }
          catch (e) { err('desktopSetFolderBinding.unbind.actions', e); }
        } else {
          /* Legacy fallback. */
          const bound = (typeof store.listForChat === 'function') ? await store.listForChat(cid) : [];
          for (const f of (Array.isArray(bound) ? bound : [])) {
            const fid = f && f.folderId;
            if (fid && typeof store.unbindChat === 'function') {
              try { await store.unbindChat(fid, cid); }
              catch (e) { err('desktopSetFolderBinding.unbind', e); }
            }
          }
        }
      }
      bustCaches('desktop-setFolderBinding');
      try { await getIndex()?.refresh('desktop-setFolderBinding'); } catch {}
      emitUpdated('folder-binding-changed', {
        chatId: cid, folderId: folder, source: (opts && opts.source) || 'desktop-sqlite',
      });
      const result = { ok: true, status: 'desktop-sqlite', chatId: cid, folderId: folder, folderName };
      recordWrite('folderBinding', { ...result });
      return result;
    } catch (e) {
      const result = folderWriteFailure('desktop-write-failed', cid, folder, String((e && e.message) || e));
      recordWrite('folderBinding', { ...result, error: String((e && e.stack) || e) });
      err('desktopSetFolderBinding', e);
      return result;
    }
  }

  async function setFolderBinding(chatId, folderId, opts = {}) {
    if (LW_isTauri()) return await desktopSetFolderBinding(chatId, folderId, opts);
    const cid = String(chatId || '');
    const folder = String(folderId || '');
    const cl = getChatList();
    if (!cl) {
      const result = folderWriteFailure('folder-bridge-unavailable', cid, folder, 'chat-list service unavailable');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    let result;
    try {
      result = await cl.setFolderBinding(chatId, folderId, opts);
    } catch (e) {
      const status = isFolderBridgeTransportError(e) ? 'folder-bridge-unavailable' : 'folder-write-failed';
      const result = folderWriteFailure(status, cid, folder, String(e?.message || e || status));
      recordWrite('folderBinding', { ...result, error: String(e?.stack || e) });
      step('setFolderBinding.rejected', status);
      err('setFolderBinding', e);
      return result;
    }
    if (result?.ok === false) {
      recordWrite('folderBinding', { ok: false, status: String(result.status || result.reason || 'rejected'), chatId: cid, folderId: folder, result });
      step('setFolderBinding.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setFolderBinding');
    try { await getIndex()?.refresh('setFolderBinding'); } catch {}
    emitUpdated('folder-binding-changed', { chatId, folderId, source: opts?.source || null });
    recordWrite('folderBinding', { ok: result?.ok !== false, status: String(result?.status || 'ok'), chatId: cid, folderId: folder, result });
    return result;
  }

  function categoryWriteFailure(status, snapshotId, chatId, categoryId, reason) {
    return {
      ok: false,
      status: String(status || 'category-write-failed'),
      reason: String(reason || status || 'category-write-failed'),
      snapshotId: String(snapshotId || ''),
      chatId: String(chatId || ''),
      categoryId: String(categoryId || ''),
    };
  }

  function isCategoryBridgeTransportError(error) {
    const msg = String(error?.stack || error?.message || error || '');
    return /Could not establish connection|Receiving end does not exist|archive bridge|category bridge|Extension context invalidated|context invalidated/i.test(msg);
  }

  /* M2c-2 Desktop category write. SQLite category assignment is per-chat
   * (chats.category_id) rather than per-snapshot — snapshotId is preserved
   * in the result for UI/event compatibility but ignored for the write.
   * Empty categoryId triggers clearChat. assignChat/clearChat return false
   * if no chat row matches; that surfaces as ok:false without throwing. */
  async function desktopSetSnapshotCategory(snapshotId, chatId, categoryId) {
    const sid = String(snapshotId || '').trim();
    const cid = String(chatId || '').trim();
    const category = String(categoryId || '').trim();
    if (!cid) {
      const result = categoryWriteFailure('missing-chat-id', sid, cid, category, 'chatId required on Desktop');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    const store = getStudioStores().categories;
    if (!store) {
      const result = categoryWriteFailure('desktop-store-unavailable', sid, cid, category, 'store.categories unavailable');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    try {
      let writeOk;
      if (category) {
        if (typeof store.assignChat !== 'function') {
          const result = categoryWriteFailure('desktop-assign-unavailable', sid, cid, category, 'store.categories.assignChat unavailable');
          recordWrite('snapshotCategory', { ...result });
          return result;
        }
        writeOk = await store.assignChat(category, cid);
      } else {
        if (typeof store.clearChat !== 'function') {
          const result = categoryWriteFailure('desktop-clear-unavailable', sid, cid, category, 'store.categories.clearChat unavailable');
          recordWrite('snapshotCategory', { ...result });
          return result;
        }
        writeOk = await store.clearChat(cid);
      }
      bustCaches('desktop-setSnapshotCategory');
      try { await getIndex()?.refresh('desktop-setSnapshotCategory'); } catch {}
      emitUpdated('category-changed', { snapshotId: sid, chatId: cid, categoryId: category });
      const result = {
        ok: writeOk !== false,
        status: 'desktop-sqlite',
        snapshotId: sid,
        chatId: cid,
        categoryId: category,
      };
      recordWrite('snapshotCategory', { ...result });
      return result;
    } catch (e) {
      const result = categoryWriteFailure('desktop-write-failed', sid, cid, category, String((e && e.message) || e));
      recordWrite('snapshotCategory', { ...result, error: String((e && e.stack) || e) });
      err('desktopSetSnapshotCategory', e);
      return result;
    }
  }

  async function setSnapshotCategory(snapshotId, chatId, categoryId) {
    if (LW_isTauri()) return await desktopSetSnapshotCategory(snapshotId, chatId, categoryId);
    const sid = String(snapshotId || '').trim();
    const cid = String(chatId || '').trim();
    const category = String(categoryId || '').trim();
    if (!sid) {
      const result = categoryWriteFailure('missing-snapshot-id', sid, cid, category);
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    if (!category) {
      const result = categoryWriteFailure('missing-category-id', sid, cid, category);
      recordWrite('snapshotCategory', { ...result });
      return result;
    }

    const cl = getChatList();
    if (!cl || typeof cl.setSnapshotCategory !== 'function') {
      const result = categoryWriteFailure('category-bridge-unavailable', sid, cid, category, 'chat-list service unavailable');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }

    let result;
    try {
      result = await cl.setSnapshotCategory(sid, cid, category);
    } catch (e) {
      const status = isCategoryBridgeTransportError(e) ? 'category-bridge-unavailable' : 'category-write-failed';
      step('setSnapshotCategory.rejected', status);
      err('setSnapshotCategory', e);
      const result = categoryWriteFailure(status, sid, cid, category, String(e?.message || e || status));
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    if (result?.ok === false) {
      recordWrite('snapshotCategory', { ok: false, status: String(result.status || result.reason || 'rejected'), snapshotId: sid, chatId: cid, categoryId: category, result });
      step('setSnapshotCategory.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setSnapshotCategory');
    try { await getIndex()?.refresh('setSnapshotCategory'); } catch {}
    emitUpdated('category-changed', { snapshotId: sid, chatId: cid, categoryId: category });
    recordWrite('snapshotCategory', { ok: result?.ok !== false, status: String(result?.status || 'ok'), snapshotId: sid, chatId: cid, categoryId: category, result });
    return result;
  }

  async function reclassifySnapshotCategory(snapshotId) {
    const cl = getChatList();
    if (!cl || typeof cl.reclassifySnapshotCategory !== 'function') {
      throw new Error('reclassifySnapshotCategory unavailable on chat-list service');
    }
    const result = await cl.reclassifySnapshotCategory(snapshotId);
    bustCaches('reclassifySnapshotCategory');
    try { await getIndex()?.refresh('reclassifySnapshotCategory'); } catch {}
    emitUpdated('category-reclassified', { snapshotId });
    recordWrite('snapshotCategoryReclassify', { ok: result?.ok !== false, status: String(result?.status || 'ok'), snapshotId: String(snapshotId || ''), result });
    return result;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subscribers = new Set();
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }
  function emitUpdated(reason, detail) {
    const payload = { reason: String(reason || ''), detail: detail || null, t: Date.now(), surface: 'studio' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library-workspace:updated', { detail: payload })); } catch {}
    try { W.H2O?.events?.emit?.('library-workspace:updated', payload); } catch {}
    subscribers.forEach((fn) => { try { fn(payload); } catch (e) { err('subscriber', e); } });
  }

  // When Index refreshes, bust caches and propagate.
  function bindIndex() {
    const idx = getIndex();
    if (!idx || typeof idx.subscribe !== 'function') return false;
    idx.subscribe((detail) => {
      bustCaches('index-updated');
      emitUpdated('index-updated', detail);
    });
    return true;
  }

  function getFolderParityDiagnostics() {
    const idx = getIndex();
    const folderFacets = idx?.facets?.()?.byFolder || {};
    const cached = Array.isArray(cache.folders.value) ? cache.folders.value : [];
    const summaries = cached.map((folder) => {
      const id = String(folder?.id || folder?.folderId || '').trim();
      const chatIds = Array.isArray(folderFacets[id]) ? folderFacets[id].map((value) => String(value || '').trim()).filter(Boolean) : [];
      return {
        id,
        folderId: id,
        name: String(folder?.name || folder?.label || folder?.title || id).trim() || id,
        kind: String(folder?.kind || 'local').trim() || 'local',
        source: String(folder?.source || cache.folders.source || '').trim(),
        color: String(folder?.color || folder?.iconColor || '').trim(),
        iconColor: String(folder?.iconColor || folder?.color || '').trim(),
        icon: String(folder?.icon || '').trim(),
        bindingCount: chatIds.length,
        empty: chatIds.length === 0,
        chatIds,
      };
    });
    const derivedOnlyIds = Object.keys(folderFacets || {}).filter((folderId) => (
      folderId && !summaries.some((folder) => folder.id === folderId)
    ));
    const bindingCount = Object.values(folderFacets || {}).reduce((sum, ids) => sum + (Array.isArray(ids) ? ids.length : 0), 0);
    return {
      phase: 'folder-parity-diagnostic',
      surface: LW_isTauri() ? 'desktop-studio' : 'chrome-studio',
      source: String(cache.folders.source || (cached.length ? 'workspace-cache' : 'not-loaded')).trim(),
      catalogCached: !!cache.folders.value,
      catalogCount: summaries.length,
      bindingCount,
      emptyFolderCount: summaries.filter((folder) => folder.empty).length,
      boundFolderCount: summaries.filter((folder) => !folder.empty).length,
      indexFacetCount: Object.keys(folderFacets || {}).length,
      derivedOnlyFolderIds: derivedOnlyIds,
      folderNames: summaries.map((folder) => folder.name),
      folderIds: summaries.map((folder) => folder.id),
      colorsModeled: summaries.some((folder) => !!(folder.color || folder.iconColor)),
      iconsModeled: summaries.some((folder) => !!folder.icon),
      emptyFoldersRepresented: summaries.some((folder) => folder.empty),
      folders: summaries,
    };
  }

  async function countDesktopFolderBindings(folders) {
    if (!LW_isTauri()) return null;
    const store = getStudioStores().folders;
    if (!store || typeof store.listChats !== 'function') return null;
    let total = 0;
    const byFolder = {};
    for (const folder of Array.isArray(folders) ? folders : []) {
      const id = folderIdOf(folder);
      if (!id) continue;
      try {
        const rows = await store.listChats(id);
        const count = Array.isArray(rows) ? rows.length : 0;
        byFolder[id] = count;
        total += count;
      } catch (e) {
        byFolder[id] = 0;
        err('folderParity.desktopBindings', e);
      }
    }
    return { total, byFolder };
  }

  function countItemsForFolder(items, folderId) {
    const values = items && typeof items === 'object' ? items[String(folderId || '').trim()] : null;
    return Array.isArray(values) ? values.length : 0;
  }

  function buildFolderDisplayRows({
    canonicalFolders,
    localFolders,
    canonicalItems,
    storedItems,
    canonicalMirrorAvailable,
    rowStatsByFolder,
    desktopBindings,
    duplicateGroups,
    testFolderCandidates,
  }) {
    const canonicalRows = Array.isArray(canonicalFolders) ? canonicalFolders : [];
    const localRows = Array.isArray(localFolders) ? localFolders : [];
    const primaryCanonicalRows = canonicalRows.filter(isCanonicalDisplayFolder);
    const primaryCanonicalIds = new Set(primaryCanonicalRows.map((folder) => folderIdOf(folder)).filter(Boolean));
    const materializedLocalRows = localRows
      .filter((folder) => {
        const id = folderIdOf(folder);
        return id && !primaryCanonicalIds.has(id) && isMaterializedUserFolder(folder);
      });
    primaryCanonicalRows.push(...materializedLocalRows);
    const canonicalIds = new Set(primaryCanonicalRows.map((folder) => folderIdOf(folder)).filter(Boolean));
    const canonicalNames = new Set(primaryCanonicalRows.map((folder) => normalizeFolderName(folderNameOf(folder))).filter(Boolean));
    const duplicateNames = new Set((Array.isArray(duplicateGroups) ? duplicateGroups : []).map((group) => normalizeFolderName(group.name || group.normalizedName)).filter(Boolean));
    const testIds = new Set((Array.isArray(testFolderCandidates) ? testFolderCandidates : []).map((folder) => folderIdOf(folder)).filter(Boolean));
    const localById = new Map(localRows.map((folder) => [folderIdOf(folder), folder]));
    const localBindingByFolder = desktopBindings?.byFolder || Object.fromEntries(
      Object.keys(storedItems || {}).map((folderId) => [folderId, countItemsForFolder(storedItems, folderId)])
    );
    const statsFor = (folderId) => rowStatsByFolder?.[folderId] || { known: 0, saved: 0, linked: 0, chatIds: [] };
    const common = (folder, isCanonical) => {
      const folderId = folderIdOf(folder);
      const name = folderNameOf(folder);
      const stats = statsFor(folderId);
      const knownCount = Number(stats.known || 0);
      const savedCount = Number(stats.saved || 0);
      const linkedCount = Number(stats.linked || 0);
      const localBindingCount = Number(localBindingByFolder[folderId] || 0);
      const canonicalCount = isCanonical && canonicalMirrorAvailable ? countItemsForFolder(canonicalItems, folderId) : 0;
      const isTestCandidate = testIds.has(folderId);
      const isExtra = !isCanonical;
      const isConflict = isExtra && canonicalNames.has(normalizeFolderName(name));
      const badges = [];
      if (isExtra) badges.push('extra');
      if (isTestCandidate) badges.push('test');
      if (isConflict || (isCanonical && duplicateNames.has(normalizeFolderName(name)))) badges.push('conflict');
      if (isCanonical && canonicalMirrorAvailable && knownCount > canonicalCount) badges.push('count-mismatch');
      if (isTestCandidate && localBindingCount > 0) badges.push('review');
      let displayCountLabel = '';
      if (isCanonical) {
        displayCountLabel = canonicalMirrorAvailable
          ? formatCanonicalCountLabel({ nativeMembershipCount: canonicalCount, knownStudioCount: knownCount })
          : `canonical mirror unavailable${localBindingCount ? ` · ${localBindingCount} local` : ''}`;
        if (badges.includes('count-mismatch')) displayCountLabel += ' · count-mismatch';
      } else {
        const base = localBindingCount > 0 ? `${localBindingCount} local` : `${knownCount} known here`;
        displayCountLabel = [base, ...badges.filter((badge) => ['extra', 'test', 'conflict', 'review'].includes(badge))].join(' · ');
      }
      const rawSortOrder = Number(folder?.sortOrder);
      const folderIndex = Number(folder?.index);
      const stableOrder = canonicalFolderDisplayOrder(folder);
      const rowSortOrder = Number.isFinite(stableOrder) && stableOrder > 0
        ? stableOrder
        : (Number.isFinite(rawSortOrder) ? rawSortOrder : (Number.isFinite(folderIndex) ? folderIndex : 0));
      const reviewBucket = isCanonical ? null : deriveReviewBucket({
        isCanonical,
        isExtra,
        isTestCandidate,
        isConflict,
        source: folder?.source,
      });
      return {
        folderId,
        id: folderId,
        name,
        normalizedName: normalizeFolderName(name),
        source: String(folder?.source || '').trim(),
        color: String(folder?.color || folder?.iconColor || '').trim(),
        iconColor: String(folder?.iconColor || folder?.color || '').trim(),
        colorSource: String(folder?.colorSource || '').trim(),
        rowColor: String(folder?.rowColor || '').trim(),
        nativeColor: String(folder?.nativeColor || '').trim(),
        storedColor: String(folder?.storedColor || '').trim(),
        colorConflict: folder?.colorConflict === true,
        icon: String(folder?.icon || '').trim(),
        index: Number.isFinite(folderIndex) ? folderIndex : 0,
        sortOrder: rowSortOrder,
        isCanonical,
        isExtra,
        isTestCandidate,
        isConflict,
        reviewBucket,
        canonicalMirrorAvailable: !!canonicalMirrorAvailable,
        canonicalCount,
        nativeMembershipCount: canonicalCount,
        knownCount,
        knownStudioCount: knownCount,
        savedCount,
        linkedCount,
        orphanCount: isCanonical && canonicalMirrorAvailable ? Math.max(0, canonicalCount - knownCount) : 0,
        localBindingCount,
        badges,
        displayCountLabel,
      };
    };

    const out = [];
    const reviewSeen = new Set();
    for (const folder of primaryCanonicalRows) {
      const id = folderIdOf(folder);
      out.push(common(mergeCanonicalFolderDisplaySource(localById.get(id), folder, canonicalMirrorAvailable), true));
    }
    for (const folder of canonicalRows) {
      const id = folderIdOf(folder);
      if (!id || canonicalIds.has(id) || reviewSeen.has(id)) continue;
      if (!isVisibleFolderUiReviewRow(folder, canonicalNames)) continue;
      out.push(common(folder, false));
      reviewSeen.add(id);
    }
    for (const folder of localRows) {
      const id = folderIdOf(folder);
      const normalizedName = normalizeFolderName(folderNameOf(folder));
      if (!id || canonicalIds.has(id) || reviewSeen.has(id) || normalizedName === 'unfiled') continue;
      if (!isVisibleFolderUiReviewRow(folder, canonicalNames)) continue;
      out.push(common(folder, false));
      reviewSeen.add(id);
    }
    return out;
  }

  function buildProtectedCanonicalFallbackDisplayRows(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const reason = String(opts.reason || 'known-current-canonical-fallback').trim() || 'known-current-canonical-fallback';
    const fallbackFolders = KNOWN_NATIVE_CANONICAL_FOLDERS
      .map((folder, index) => normalizeFolderRow({ ...folder, source: reason }, index, reason))
      .filter(Boolean)
      .map((folder) => decorateCanonicalFolderColorSources(folder, new Map(), new Map()));
    return buildFolderDisplayRows({
      canonicalFolders: fallbackFolders,
      localFolders: [],
      canonicalItems: {},
      storedItems: {},
      canonicalMirrorAvailable: false,
      rowStatsByFolder: opts.rowStatsByFolder || {},
      desktopBindings: opts.desktopBindings || null,
      duplicateGroups: [],
      testFolderCandidates: [],
    });
  }

  function buildProtectedCanonicalFallbackDisplayRowsSafe(options = {}) {
    try {
      const rows = buildProtectedCanonicalFallbackDisplayRows(options);
      return { rows: Array.isArray(rows) ? rows : [], error: '' };
    } catch (e) {
      err('folderParity.protectedCanonicalFallback', e);
      return { rows: [], error: String(e?.message || e || 'protected canonical fallback failed') };
    }
  }

  function folderParityRuntimeMarkers(extra = {}) {
    return {
      folderParityVersion: FOLDER_PARITY_RUNTIME_VERSION,
      s0f1bLoadedVersion: FOLDER_PARITY_RUNTIME_VERSION,
      s0f1bLoadedAt: FOLDER_PARITY_RUNTIME_LOADED_AT,
      scriptUrl: redactFolderParityScriptUrl(FOLDER_PARITY_SCRIPT_URL),
      hasKnownCanonicalFallbackBuilder: typeof buildProtectedCanonicalFallbackDisplayRows === 'function',
      knownCanonicalFallbackRawCount: KNOWN_NATIVE_CANONICAL_FOLDERS.length,
      ...extra,
    };
  }

  async function diagnoseFolderParity(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const warnings = ['Read-only. No cleanup performed. Cleanup requires reviewed approval.'];
    const surface = LW_isTauri() ? 'desktop-studio' : 'chrome-studio';
    const syncDiag = (() => {
      try { return H2O.Library?.Sync?.diagnose?.() || null; }
      catch (e) { warnings.push('Library Sync diagnostics unavailable: ' + String(e?.message || e)); return null; }
    })();

    const localFoldersRaw = await getFolders({ fresh: !!opts.fresh });
    const localFolders = (Array.isArray(localFoldersRaw) ? localFoldersRaw : [])
      .map((folder, index) => normalizeFolderRow(folder, index, surface))
      .filter(Boolean);

    const storedRead = await readStorageKey(FOLDER_STATE_DATA_KEY);
    if (storedRead.error) warnings.push('Folder-state key read failed: ' + storedRead.error);
    const storedState = normalizeFolderStateForParity(storedRead.value, storedRead.source || 'stored-folder-state');

    const nativeRead = await readStorageKey(NATIVE_BROADCAST_KEY);
    if (nativeRead.error) warnings.push('Native broadcast read failed: ' + nativeRead.error);
    const nativePayload = normalizeNativeBroadcastPayload(nativeRead.value);
    const nativeState = normalizeFolderStateForParity(nativePayload?.folderState, 'native-broadcast');

    const canonicalFromBroadcast = nativeState.folders.length > 0;
    const canonicalFromStoredMirror = storedState.folders.length > 0;
    const mergedTrustedCanonical = canonicalFromStoredMirror
      ? filterFolderStateForNormalDisplay(storedState, true)
      : (canonicalFromBroadcast ? filterFolderStateForNormalDisplay(nativeState, false) : { folders: [], items: {} });
    const knownCanonicalFallbackRows = KNOWN_NATIVE_CANONICAL_FOLDERS
      .map((folder, index) => normalizeFolderRow(folder, index, 'known-current-canonical'))
      .filter(Boolean);
    const fallbackCanonical = enrichKnownCanonicalFallbackRows(knownCanonicalFallbackRows, storedState.folders);
    const canonicalFoldersRaw = mergedTrustedCanonical.folders.length
      ? mergedTrustedCanonical.folders
      : fallbackCanonical.rows;
    const storedById = indexFoldersById(storedState.folders);
    const nativeById = indexFoldersById(nativeState.folders);
    const canonicalFolders = canonicalFoldersRaw.map((folder) => (
      isPrimaryCanonicalFolder(folder)
        ? decorateCanonicalFolderColorSources(folder, storedById, nativeById)
        : folder
    ));
    const fallbackVisualsEnriched = !mergedTrustedCanonical.folders.length && !!fallbackCanonical.enriched;
    const canonicalIds = new Set(canonicalFolders.map((folder) => folder.id).filter(Boolean));
    const canonicalBindingCount = canonicalFromBroadcast
      ? countFolderStateBindings(mergedTrustedCanonical.items)
      : canonicalFromStoredMirror
        ? countFolderStateBindings(storedState.items)
      : Number(syncDiag?.projection?.nativeBroadcast?.folderBindingCount
        || syncDiag?.projection?.nativeFolderStateMerge?.incomingBindingCount
        || KNOWN_NATIVE_CANONICAL_BINDING_COUNT
        || 0);
    if (!mergedTrustedCanonical.folders.length) warnings.push('Canonical folders are using the current known native fallback list; run native probes if this differs from live ChatGPT.');

    const rowStatsByFolder = summarizeIndexRowsByFolder();
    const knownStudioRowCountByFolder = Object.fromEntries(Object.entries(rowStatsByFolder).map(([folderId, stats]) => [folderId, Number(stats.known || 0)]));
    const knownStudioRowTotal = Object.values(knownStudioRowCountByFolder).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const canonicalKnownRowCount = canonicalFolders.reduce((sum, folder) => sum + (Number(knownStudioRowCountByFolder[folder.id]) || 0), 0);
    const desktopBindings = await countDesktopFolderBindings(localFolders);
    const storedBindingCount = countFolderStateBindings(storedState.items);
    const localBindingCount = desktopBindings ? desktopBindings.total : (storedBindingCount || knownStudioRowTotal);

    const duplicateGroups = groupDuplicateFolderNames(localFolders).map((group) => ({
      normalizedName: group.normalizedName,
      name: group.name,
      ids: group.ids,
    }));
    const testFolderCandidates = detectTestFolderCandidates(localFolders);
    const missingCanonicalFolders = canonicalFolders
      .filter((folder) => !localFolders.some((local) => local.id === folder.id))
      .map((folder) => ({ id: folder.id, folderId: folder.id, name: folder.name, normalizedName: folder.normalizedName }));
    const extraLocalFolders = localFolders
      .filter((folder) => {
        const name = normalizeFolderName(folder.name);
        if (isMaterializedUserFolder(folder)) return false;
        return name !== 'unfiled' && folder.id && !canonicalIds.has(folder.id);
      })
      .map((folder) => ({
        id: folder.id,
        folderId: folder.id,
        name: folder.name,
        normalizedName: folder.normalizedName,
        bindingCount: Number(knownStudioRowCountByFolder[folder.id] || 0),
      }));
    const materializedUserFolders = localFolders
      .filter(isMaterializedUserFolder)
      .map((folder) => ({
        id: folder.id,
        folderId: folder.id,
        name: folder.name,
        normalizedName: folder.normalizedName,
        source: folder.source,
        bindingCount: Number(knownStudioRowCountByFolder[folder.id] || 0),
      }));
    const hiddenLocalOnlyFolders = localFolders
      .filter((folder) => {
        const id = folderIdOf(folder);
        const name = normalizeFolderName(folder?.normalizedName || folderNameOf(folder));
        if (!id || !name || name === 'unfiled') return false;
        if (isPrimaryCanonicalFolder(folder) || isMaterializedUserFolder(folder) || isVisibleFolderUiReviewRow(folder, canonicalNames)) return false;
        return !canonicalIds.has(id);
      })
      .map((folder) => ({
        id: folder.id,
        folderId: folder.id,
        name: folder.name,
        normalizedName: folder.normalizedName,
        source: folder.source,
        reason: 'local-only-not-materialized',
      }));
    const orphanBindingCount = Math.max(0, canonicalBindingCount - canonicalKnownRowCount);
    const riskLevel = (missingCanonicalFolders.length || duplicateGroups.length || testFolderCandidates.length || extraLocalFolders.length || orphanBindingCount)
      ? 'review-required'
      : 'ok';
    const canonicalMirrorAvailable = mergedTrustedCanonical.folders.length > 0;
    const canonicalItems = mergedTrustedCanonical.folders.length ? mergedTrustedCanonical.items : storedState.items;
    const nativeOnlyDisplaySuppressedFolders = nativeState.folders
      .filter((folder) => !isPrimaryCanonicalFolder(folder) && !storedState.folders.some((stored) => stored.id === folder.id))
      .map((folder) => ({
        id: folder.id,
        folderId: folder.id,
        name: folder.name,
        normalizedName: folder.normalizedName,
        source: folder.source || 'native-broadcast',
        reason: 'native-only-not-materialized',
      }));
    const rawFolderDisplayRows = buildFolderDisplayRows({
      canonicalFolders,
      localFolders,
      canonicalItems,
      storedItems: storedState.items,
      canonicalMirrorAvailable,
      rowStatsByFolder,
      desktopBindings,
      duplicateGroups,
      testFolderCandidates,
    });
    const rawCanonicalDisplayRowCount = rawFolderDisplayRows.filter((row) => row && row.isCanonical).length;
    let protectedCanonicalFallbackSource = '';
    let fallbackBuilderError = '';
    let protectedFallbackRows = !mergedTrustedCanonical.folders.length
      ? rawFolderDisplayRows.filter((row) => row && row.isCanonical)
      : [];
    if (protectedFallbackRows.length) protectedCanonicalFallbackSource = 'known-current-canonical-fallback';
    if (!protectedFallbackRows.length && rawCanonicalDisplayRowCount <= 0) {
      const built = buildProtectedCanonicalFallbackDisplayRowsSafe({
        reason: 'known-current-canonical-fallback-empty-model',
        rowStatsByFolder,
        desktopBindings,
      });
      protectedFallbackRows = built.rows;
      fallbackBuilderError = built.error;
      if (protectedFallbackRows.length) protectedCanonicalFallbackSource = 'known-current-canonical-fallback-empty-model';
      if (fallbackBuilderError) warnings.push('Protected canonical fallback builder failed: ' + fallbackBuilderError);
    }
    const folderDisplayRows = rawCanonicalDisplayRowCount > 0
      ? rawFolderDisplayRows
      : protectedFallbackRows.length
      ? [
        ...protectedFallbackRows,
        ...rawFolderDisplayRows.filter((row) => row && !row.isCanonical),
      ]
      : rawFolderDisplayRows;
    const canonicalDisplayRowCount = folderDisplayRows.filter((row) => row && row.isCanonical).length;
    const displayModelAvailable = canonicalDisplayRowCount > 0;
    const fallbackUsed = !mergedTrustedCanonical.folders.length || protectedFallbackRows.length > 0;
    const renderBlockedReason = displayModelAvailable
      ? ''
      : (folderDisplayRows.length ? 'folder-display-model-has-no-canonical-rows' : 'folder-display-model-empty');
    const probeNames = Array.from(new Set([
      normalizeFolderName(opts.folderName || opts.probeName || ''),
      'sport',
      'zz-sync-test-folder',
    ].filter(Boolean)));
    const probeFolderCollections = {
      localSqlite: localFolders,
      storedFolderState: storedState.folders,
      nativeBroadcast: nativeState.folders,
      displayModel: folderDisplayRows,
      protectedCanonicalFallback: protectedFallbackRows,
      materializedUserFolders,
      hiddenLocalOnlyFolders,
      nativeOnlyDisplaySuppressedFolders,
    };
    const folderNameProbe = {};
    probeNames.forEach((probeName) => {
      folderNameProbe[probeName] = Object.fromEntries(Object.entries(probeFolderCollections).map(([key, rows]) => [
        key,
        (Array.isArray(rows) ? rows : []).filter((row) => normalizeFolderName(row?.normalizedName || row?.name || row?.title || '') === probeName).map((row) => ({
          idHash: folderDiagnosticHash(row.id || row.folderId || ''),
          normalizedName: normalizeFolderName(row.normalizedName || row.name || row.title),
          source: row.source || '',
          isCanonical: row.isCanonical === true,
          isMaterializedUserFolder: isMaterializedUserFolder(row),
        })),
      ]));
    });

    return {
      ...folderParityRuntimeMarkers({
        protectedCanonicalFallbackCount: protectedFallbackRows.length,
        protectedCanonicalFallbackSource,
        fallbackBuilderError,
      }),
      readOnly: true,
      surface,
      generatedAt: new Date().toISOString(),
      canonicalSource: canonicalFromBroadcast
        ? (canonicalFromStoredMirror && storedState.folders.length > nativeState.folders.length ? 'native-broadcast+stored-folder-state' : 'native-broadcast')
        : (canonicalFromStoredMirror ? 'stored-folder-state' : 'known-current-canonical-fallback'),
      fallbackVisualsEnriched,
      folderCatalogReady: canonicalMirrorAvailable,
      displayModelAvailable,
      fallbackModelUsed: fallbackUsed,
      protectedCanonicalFallbackCount: protectedFallbackRows.length,
      protectedCanonicalFallbackSource,
      fallbackBuilderError,
      storedModelAvailable: storedState.folders.length > 0,
      nativeBroadcastAvailable: nativeState.folders.length > 0,
      nativeBroadcastRequired: !displayModelAvailable,
      renderBlockedReason,
      canonicalMirrorAvailable,
      canonicalFolderCount: canonicalFolders.length,
      localFolderCount: localFolders.length,
      canonicalBindingCount,
      localBindingCount,
      knownStudioRowCountByFolder,
      rowStatsByFolder,
      knownStudioRowTotal,
      desktopSqliteBindingCount: desktopBindings ? desktopBindings.total : null,
      storedFolderState: {
        key: FOLDER_STATE_DATA_KEY,
        source: storedRead.source || '',
        folderCount: storedState.folders.length,
        bindingCount: storedBindingCount,
      },
      nativeBroadcast: {
        key: NATIVE_BROADCAST_KEY,
        source: nativeRead.source || '',
        folderCount: nativeState.folders.length,
        bindingCount: countFolderStateBindings(nativeState.items),
        ts: nativePayload?.ts || '',
        sourceExtensionId: nativePayload?.sourceExtensionId || '',
      },
      canonicalMerge: {
        trustedNativeFolderCount: nativeState.folders.length,
        trustedStoredFolderCount: storedState.folders.length,
        mergedFolderCount: mergedTrustedCanonical.folders.length,
        dynamicStoredFolderIds: storedState.folders
          .map((folder) => folder.id)
          .filter((id) => id && !nativeState.folders.some((folder) => folder.id === id))
          .slice(0, 16),
        nativeOnlySuppressedFolderCount: nativeOnlyDisplaySuppressedFolders.length,
      },
      nativeOnlyDisplaySuppressedFolders,
      hiddenDynamicNativeOnlyCount: nativeOnlyDisplaySuppressedFolders.length,
      hiddenLocalOnlyFolders,
      hiddenLocalOnlyCount: hiddenLocalOnlyFolders.length,
      materializedUserFolders,
      materializedUserFolderCount: materializedUserFolders.length,
      folderNameProbe,
      canonicalFolders,
      localFolders,
      folderDisplayRows,
      duplicateGroups,
      testFolderCandidates,
      extraLocalFolders,
      missingCanonicalFolders,
      orphanBindingCount,
      riskLevel,
      recommendedNextStep: riskLevel === 'ok'
        ? 'No folder parity action required.'
        : 'Review the folder parity report before any cleanup; P4a does not delete, merge, repair, or normalize folders.',
      warnings,
      sourceDiagnostics: {
        workspace: getFolderParityDiagnostics(),
        sync: syncDiag?.projection ? {
          nativeBroadcast: syncDiag.projection.nativeBroadcast || null,
          nativeFolderStateMerge: syncDiag.projection.nativeFolderStateMerge || null,
        } : null,
        desktopFolders: (() => {
          try { return getStudioStores().folders?.diagnose?.() || null; }
          catch { return null; }
        })(),
      },
    };
  }

  function folderParitySeverityRank(severity) {
    const s = String(severity || 'ok');
    if (s === 'error') return 4;
    if (s === 'review-required') return 3;
    if (s === 'warning') return 2;
    if (s === 'info') return 1;
    return 0;
  }

  function folderParityMaxSeverity(checks) {
    let out = 'ok';
    for (const check of Array.isArray(checks) ? checks : []) {
      if (check?.ok) continue;
      const severity = String(check?.severity || 'ok');
      if (folderParitySeverityRank(severity) > folderParitySeverityRank(out)) out = severity;
    }
    return out;
  }

  async function selfCheckFolderParity(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const report = opts.report && typeof opts.report === 'object'
      ? opts.report
      : await diagnoseFolderParity({ fresh: !!opts.fresh });
    const now = new Date().toISOString();
    const surface = String(report?.surface || (LW_isTauri() ? 'desktop-studio' : 'chrome-studio'));
    const displayRows = Array.isArray(report?.folderDisplayRows) ? report.folderDisplayRows : [];
    const summary = {
      canonicalFolderCount: Number(report?.canonicalFolderCount || 0),
      localFolderCount: Number(report?.localFolderCount || 0),
      canonicalBindingCount: Number(report?.canonicalBindingCount || 0),
      localBindingCount: Number(report?.localBindingCount || 0),
      duplicateGroupCount: Array.isArray(report?.duplicateGroups) ? report.duplicateGroups.length : 0,
      testCandidateCount: Array.isArray(report?.testFolderCandidates) ? report.testFolderCandidates.length : 0,
      missingCanonicalCount: Array.isArray(report?.missingCanonicalFolders) ? report.missingCanonicalFolders.length : 0,
      extraLocalCount: Array.isArray(report?.extraLocalFolders) ? report.extraLocalFolders.length : 0,
      orphanMembershipCount: Number(report?.orphanBindingCount || 0),
      canonicalRowsCount: displayRows.filter((row) => row && row.isCanonical).length,
      localReviewRowsCount: displayRows.filter((row) => row && !row.isCanonical).length,
      fallbackUsed: String(report?.canonicalSource || '') === 'known-current-canonical-fallback',
    };
    const checks = [];
    const addCheck = (id, ok, severity, message, details = null) => {
      checks.push({
        id: String(id || ''),
        ok: !!ok,
        severity: ok ? (severity === 'info' ? 'info' : 'ok') : String(severity || 'warning'),
        message: String(message || ''),
        details,
      });
    };

    addCheck(
      'folder.canonical.available',
      !!report?.canonicalMirrorAvailable,
      'warning',
      report?.canonicalMirrorAvailable
        ? 'Canonical folder mirror is available.'
        : 'Canonical folder mirror is unavailable; using fallback diagnostics.',
      { canonicalSource: report?.canonicalSource || '', storedFolderState: report?.storedFolderState || null, nativeBroadcast: report?.nativeBroadcast || null }
    );
    addCheck(
      'folder.canonical.count',
      Number.isFinite(summary.canonicalFolderCount) && summary.canonicalFolderCount > 0,
      'warning',
      summary.canonicalFolderCount > 0
        ? `Canonical folder count is ${summary.canonicalFolderCount}.`
        : 'Canonical folder count is unavailable or zero.',
      { count: summary.canonicalFolderCount }
    );
    addCheck(
      'folder.local.count',
      Number.isFinite(summary.localFolderCount),
      'warning',
      Number.isFinite(summary.localFolderCount)
        ? `Local folder count is ${summary.localFolderCount}.`
        : 'Local folder count is unavailable.',
      { count: summary.localFolderCount }
    );
    addCheck(
      'folder.missingCanonical',
      summary.missingCanonicalCount === 0,
      'review-required',
      summary.missingCanonicalCount === 0
        ? 'No canonical folders are missing locally.'
        : `${summary.missingCanonicalCount} canonical folder(s) are missing locally.`,
      report?.missingCanonicalFolders || []
    );
    addCheck(
      'folder.extraLocal',
      summary.extraLocalCount === 0,
      'review-required',
      summary.extraLocalCount === 0
        ? 'No extra local folders are present.'
        : `${summary.extraLocalCount} extra local folder(s) require review.`,
      report?.extraLocalFolders || []
    );
    addCheck(
      'folder.duplicateName',
      summary.duplicateGroupCount === 0,
      'review-required',
      summary.duplicateGroupCount === 0
        ? 'No duplicate normalized folder names are present.'
        : `${summary.duplicateGroupCount} duplicate normalized folder name group(s) require review.`,
      report?.duplicateGroups || []
    );
    addCheck(
      'folder.testCandidate',
      summary.testCandidateCount === 0,
      'review-required',
      summary.testCandidateCount === 0
        ? 'No test-folder candidates are present.'
        : `${summary.testCandidateCount} test-folder candidate(s) require review.`,
      report?.testFolderCandidates || []
    );
    addCheck(
      'folder.binding.canonicalVsLocal',
      summary.canonicalBindingCount === summary.localBindingCount,
      'warning',
      summary.canonicalBindingCount === summary.localBindingCount
        ? 'Canonical membership count matches local binding count.'
        : `Canonical memberships (${summary.canonicalBindingCount}) differ from local bindings (${summary.localBindingCount}).`,
      { canonicalBindingCount: summary.canonicalBindingCount, localBindingCount: summary.localBindingCount }
    );
    addCheck(
      'folder.binding.orphan',
      summary.orphanMembershipCount === 0,
      'review-required',
      summary.orphanMembershipCount === 0
        ? 'No canonical memberships are orphaned from known Studio rows.'
        : `${summary.orphanMembershipCount} canonical membership(s) are not represented by known Studio rows.`,
      { orphanMembershipCount: summary.orphanMembershipCount, knownStudioRowTotal: report?.knownStudioRowTotal || 0 }
    );
    addCheck(
      'folder.displayModel.available',
      Array.isArray(report?.folderDisplayRows) && report.folderDisplayRows.some((row) => row && row.isCanonical),
      'error',
      Array.isArray(report?.folderDisplayRows) && report.folderDisplayRows.some((row) => row && row.isCanonical)
        ? `Folder display model is available with ${report.folderDisplayRows.length} row(s).`
        : 'Folder display model is unavailable.',
      {
        rowCount: Array.isArray(report?.folderDisplayRows) ? report.folderDisplayRows.length : null,
        renderBlockedReason: report?.renderBlockedReason || '',
      }
    );
    if (surface === 'desktop-studio') {
      addCheck(
        'folder.desktop.sqliteBindings',
        typeof report?.desktopSqliteBindingCount === 'number',
        'warning',
        typeof report?.desktopSqliteBindingCount === 'number'
          ? `Desktop SQLite binding count is ${report.desktopSqliteBindingCount}.`
          : 'Desktop SQLite binding count is unavailable.',
        { desktopSqliteBindingCount: report?.desktopSqliteBindingCount ?? null }
      );
    } else {
      addCheck(
        'folder.desktop.sqliteBindings',
        true,
        'info',
        'Desktop SQLite binding check is not applicable on this surface.',
        { surface }
      );
    }
    addCheck(
      'folder.cleanupControls.absent',
      true,
      'info',
      'FolderParity exposes read-only diagnostics only; no cleanup, delete, merge, repair, or normalize API is exposed.',
      { apiMethods: ['diagnose', 'getDisplayModel', 'selfCheck'] }
    );

    const severity = folderParityMaxSeverity(checks);
    const ok = !checks.some((check) => !check.ok && folderParitySeverityRank(check.severity) >= folderParitySeverityRank('warning'));
    const recommendedNextStep = severity === 'error'
      ? 'Folder parity self-check could not complete; inspect diagnostics before any action.'
      : severity === 'review-required'
        ? 'Review duplicate, extra, test, and orphan folder findings before any cleanup; no cleanup was performed.'
        : severity === 'warning'
          ? 'Review folder parity warnings and refresh diagnostics after the next cross-surface sync.'
          : 'No folder parity action required.';

    return {
      ok,
      readOnly: true,
      noMutation: true,
      severity,
      checkedAt: now,
      surface,
      summary,
      checks,
      recommendedNextStep,
    };
  }

  const FolderParity = {
    surface: 'studio',
    version: FOLDER_PARITY_RUNTIME_VERSION,
    folderParityVersion: FOLDER_PARITY_RUNTIME_VERSION,
    s0f1bLoadedVersion: FOLDER_PARITY_RUNTIME_VERSION,
    runtimeMarkers: folderParityRuntimeMarkers,
    getRuntimeMarkers: folderParityRuntimeMarkers,
    diagnose: diagnoseFolderParity,
    selfCheck: selfCheckFolderParity,
    formatCanonicalCountLabel,
    async getDisplayModel(options = {}) {
      const report = await diagnoseFolderParity(options);
      let all = Array.isArray(report?.folderDisplayRows) ? report.folderDisplayRows : [];
      let displayModelFallbackRows = [];
      let displayModelFallbackError = '';
      if (!all.some((row) => row && row.isCanonical)) {
        const built = buildProtectedCanonicalFallbackDisplayRowsSafe({
          reason: 'get-display-model-empty-report',
          rowStatsByFolder: report?.rowStatsByFolder || {},
        });
        displayModelFallbackRows = built.rows;
        displayModelFallbackError = built.error;
        if (displayModelFallbackRows.length) {
          all = [
            ...displayModelFallbackRows,
            ...all.filter((row) => row && !row.isCanonical),
          ];
        }
      }
      const canonicalRows = sortCanonicalRows(all.filter((row) => row && row.isCanonical));
      const localReviewRows = sortLocalReviewRows(all.filter((row) => row && !row.isCanonical));
      const canonicalSource = String(report?.canonicalSource || '');
      const canonicalOrderTokens = canonicalRows.map((row) => `${String(row.folderId || row.id || '').trim()}:${canonicalFolderDisplayOrder(row)}`);
      const canonicalColorTokens = canonicalRows.map((row) => `${String(row.folderId || row.id || '').trim()}:${String(row.iconColor || row.color || '').trim()}`);
      const materializedUserFolders = Array.isArray(report?.materializedUserFolders) ? report.materializedUserFolders : [];
      const hiddenLocalOnlyFolders = Array.isArray(report?.hiddenLocalOnlyFolders) ? report.hiddenLocalOnlyFolders : [];
      const displayModelAvailable = canonicalRows.length > 0;
      const protectedCanonicalFallbackCount = Number(report?.protectedCanonicalFallbackCount || 0) || displayModelFallbackRows.length;
      const protectedCanonicalFallbackSource = String(report?.protectedCanonicalFallbackSource || (displayModelFallbackRows.length ? 'get-display-model-empty-report' : '') || '');
      const fallbackBuilderError = String(report?.fallbackBuilderError || displayModelFallbackError || '');
      return {
        ...folderParityRuntimeMarkers({
          protectedCanonicalFallbackCount,
          protectedCanonicalFallbackSource,
          fallbackBuilderError,
        }),
        readOnly: true,
        surface: report.surface,
        generatedAt: report.generatedAt,
        canonicalMirrorAvailable: report.canonicalMirrorAvailable,
        folderCatalogReady: report?.folderCatalogReady === true,
        displayModelAvailable: displayModelAvailable || report?.displayModelAvailable === true,
        fallbackModelUsed: report?.fallbackModelUsed === true || canonicalSource === 'known-current-canonical-fallback' || protectedCanonicalFallbackCount > 0,
        protectedCanonicalFallbackCount,
        protectedCanonicalFallbackSource,
        fallbackBuilderError,
        storedModelAvailable: report?.storedModelAvailable === true,
        nativeBroadcastAvailable: report?.nativeBroadcastAvailable === true,
        nativeBroadcastRequired: !displayModelAvailable && report?.nativeBroadcastRequired === true,
        renderBlockedReason: displayModelAvailable ? '' : (report?.renderBlockedReason || 'folder-display-model-empty'),
        canonicalFolderCount: canonicalRows.length,
        localFolderCount: localReviewRows.length,
        canonicalBindingCount: report.canonicalBindingCount,
        localBindingCount: report.localBindingCount,
        canonicalSource,
        canonicalOrderTokens,
        canonicalColorTokens,
        fallbackUsed: canonicalSource === 'known-current-canonical-fallback' || protectedCanonicalFallbackCount > 0,
        fallbackVisualsEnriched: !!report.fallbackVisualsEnriched,
        riskLevel: report.riskLevel,
        materializedUserFolderCount: Number(report?.materializedUserFolderCount || materializedUserFolders.length) || 0,
        materializedUserFolders,
        hiddenDynamicNativeOnlyCount: Number(report?.hiddenDynamicNativeOnlyCount || 0) || 0,
        hiddenLocalOnlyCount: Number(report?.hiddenLocalOnlyCount || hiddenLocalOnlyFolders.length) || 0,
        hiddenLocalOnlyFolders,
        folderNameProbe: report?.folderNameProbe || {},
        canonicalRows,
        localReviewRows,
        rows: [...canonicalRows, ...localReviewRows],
        warnings: report.warnings || [],
      };
    },
  };

  // ── Public API ─────────────────────────────────────────────────────────────
  const Workspace = {
    surface: 'studio',

    // Model accessors
    getKnownChats,
    getFolders,
    getCategories,
    getLabels,
    getTags,
    getProjects,
    resolveFolderBindings,

    // Mutations
    setFolderBinding,
    setSnapshotCategory,
    reclassifySnapshotCategory,
    folderParity: FolderParity,

    // Layout
    getLayout: loadLayout,
    setLayout: saveLayout,

    // Routing helpers
    parseRoute() { return getRouteSvc()?.current?.() || null; },
    onRouteChange(fn) { return getRouteSvc()?.on?.(fn) || (() => {}); },
    buildLibraryHash(view, id) { return getRouteSvc()?.buildLibraryHash?.(view, id) || ''; },

    // Renderers / surface helpers
    services() {
      return {
        uiShell: getUIShell(),
        pageHost: getPageHost(),
        sidebar: getSidebarSvc(),
        route: getRouteSvc(),
        chatList: getChatList(),
        registry: getRegistry(),
        index: getIndex(),
      };
    },

    // Subscriptions
    subscribe,

    // Internals (used by Library Sync)
    _bustCaches: bustCaches,

    // Diagnose / self-check
    diagnose() {
      const idx = getIndex();
      return {
        surface: 'studio',
        ready: !!idx && idx.diagnose().ready,
        services: {
          uiShell: !!getUIShell(),
          pageHost: !!getPageHost(),
          sidebar: !!getSidebarSvc(),
          route: !!getRouteSvc(),
          chatList: !!getChatList(),
          registry: !!getRegistry(),
          index: !!idx,
        },
        cache: {
          folders: { hasValue: !!cache.folders.value, ts: cache.folders.ts, ageMs: cacheAge(cache.folders), count: itemCount(cache.folders.value) },
          categories: { hasValue: !!cache.categories.value, ts: cache.categories.ts, ageMs: cacheAge(cache.categories), count: itemCount(cache.categories.value) },
          labels: { hasValue: !!cache.labels.value, ts: cache.labels.ts, ageMs: cacheAge(cache.labels), count: itemCount(cache.labels.value) },
        },
        sources: {
          bridgeAvailability: {
            folders: typeof getChatList()?.getFoldersList === 'function',
            categories: typeof getChatList()?.getCategoriesCatalog === 'function',
            labels: typeof getChatList()?.getLabelsCatalog === 'function',
            folderBindings: typeof getChatList()?.resolveFolderBindings === 'function',
            folderWrite: typeof getChatList()?.setFolderBinding === 'function',
            categoryWrite: typeof getChatList()?.setSnapshotCategory === 'function',
          },
          lastReads: { ...state.lastReads },
          lastWrites: { ...state.lastWrites },
        },
        folderParity: getFolderParityDiagnostics(),
        indexCounts: idx?.counts?.() || null,
        layout: loadLayout(),
        subscribers: subscribers.size,
        steps: diag.steps.slice(-20),
        errors: diag.errors.slice(-10),
      };
    },
  };

  // Wait for ready Promise
  Object.defineProperty(Workspace, 'ready', {
    get() {
      const idx = getIndex();
      return idx ? idx.ready : Promise.resolve();
    },
  });

  H2O.LibraryWorkspace = Workspace;
  H2O.Library.Workspace = Workspace;
  H2O.Library.FolderParity = FolderParity;

  // Register on Library Core
  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-workspace', Workspace, { replace: true });
      core.registerService('library-workspace', Workspace, { replace: true });
      // Register routes for Library views
      core.registerRoute('library', async (route) => {
        emitUpdated('route', route);
        return true;
      }, { replace: true });
      ['dashboard', 'saved', 'recents', 'organize', 'analytics', 'explorer'].forEach((view) => {
        core.registerRoute(view, async (route) => {
          emitUpdated(`route:${view}`, route);
          return true;
        }, { replace: true });
      });
      step('register-on-core', 'library-workspace');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  // Bind to Index updates once it's available.
  function bootBinding() {
    if (bindIndex()) {
      step('bind-index', 'ok');
      return;
    }
    W.setTimeout(bootBinding, 200);
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => { registerOnCore(); bootBinding(); }, { once: true });
  } else {
    bootBinding();
  }

  // Listen to route changes from S0D3e
  const routeSvc = getRouteSvc();
  if (routeSvc?.on) routeSvc.on((route) => emitUpdated('route-change', route));

  step('boot', 'studio-library-workspace-ready');
})();
