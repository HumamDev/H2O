// ==UserScript==
// @h2o-id             s0f2a.projects.studio
// @name               S0F2a. 🎬 Projects - Studio
// @namespace          H2O.Premium.CGX.projects.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000013
// @description        Studio Projects facade. Read-only in Phase 1: derives projects from the Library Index facet (projectId → chats). Does NOT intercept native /backend-api/projects fetches (which is the responsibility of the native 0F2a Projects script). Exposes H2O.Projects.* / H2O.Library.Projects for Library Workspace + Insights + studio.js.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F2a Projects (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 30, errMax: 10 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  const NATIVE_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:native:v1';
  const state = {
    nativeProjectCatalog: [],
    nativeProjectCatalogAt: 0,
    nativeProjectCatalogSource: 'none',
    nativeProjectCatalogError: '',
    nativeBroadcastObservedAt: 0,
    nativeBroadcastPayloadKeys: [],
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function projectCore() { return H2O.Library?.ProjectProviderCore || null; }
  function hasChromeStorageRead() {
    try {
      return !!(W.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function');
    } catch {
      return false;
    }
  }

  function normalizeNativeBroadcastPayload(value) {
    const raw = value && typeof value === 'object' ? value : null;
    if (!raw) return null;
    if (raw.projectCatalog || Array.isArray(raw.linkedRecords) || raw.surface === 'native' || Array.isArray(raw.reasons)) return raw;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
    if (payload && (payload.projectCatalog || Array.isArray(payload.linkedRecords) || payload.surface === 'native' || Array.isArray(payload.reasons))) return payload;
    const nestedValue = raw.value && typeof raw.value === 'object' ? raw.value : null;
    if (nestedValue && (nestedValue.projectCatalog || Array.isArray(nestedValue.linkedRecords) || nestedValue.surface === 'native' || Array.isArray(nestedValue.reasons))) return nestedValue;
    return raw;
  }

  function fallbackProjectRef(row) {
    const src = row && typeof row === 'object' ? row : {};
    const nested = src.project && typeof src.project === 'object' ? src.project : {};
    const rawRef = src.raw?.originProjectRef && typeof src.raw.originProjectRef === 'object' ? src.raw.originProjectRef : {};
    const ref = src.originProjectRef && typeof src.originProjectRef === 'object' ? src.originProjectRef : rawRef;
    const id = String(src.projectId || nested.projectId || nested.id || ref.projectId || ref.id || '').trim();
    if (!id) return null;
    const name = String(src.projectName || nested.projectName || nested.name || nested.title || ref.projectName || ref.name || ref.title || '').trim();
    const href = String(src.nativeProjectHref || nested.nativeProjectHref || nested.href || ref.nativeProjectHref || ref.href || '').trim();
    return { projectId: id, projectName: name, nativeProjectHref: href, source: 'row-fallback' };
  }

  function collectProjectMetadataFromRows() {
    const idx = getIndex();
    const rows = typeof idx?.getAll === 'function' ? idx.getAll() : [];
    const api = projectCore();
    const byId = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      let ref = null;
      try {
        ref = api && typeof api.deriveProjectForRecord === 'function'
          ? api.deriveProjectForRecord(row)
          : fallbackProjectRef(row);
      } catch (e) {
        err('projectCore.deriveProjectForRecord', e);
        ref = fallbackProjectRef(row);
      }
      const projectId = String(ref?.projectId || ref?.id || '').trim();
      if (!projectId) continue;
      const current = byId.get(projectId) || { projectId, projectName: '', nativeProjectHref: '', source: '', rowCount: 0 };
      const projectName = String(ref?.projectName || ref?.name || '').trim();
      const nativeProjectHref = String(ref?.nativeProjectHref || ref?.href || '').trim();
      byId.set(projectId, {
        projectId,
        projectName: current.projectName || (projectName && projectName !== projectId ? projectName : ''),
        nativeProjectHref: current.nativeProjectHref || nativeProjectHref,
        source: current.source || String(ref?.source || 'row'),
        rowCount: current.rowCount + 1,
      });
    }
    return byId;
  }

  function mergeProjectMetadata(project, metadata) {
    const id = String(project?.id || project?.projectId || '').trim();
    const meta = metadata?.get?.(id) || null;
    const name = String(meta?.projectName || '').trim();
    const href = String(meta?.nativeProjectHref || '').trim();
    const out = { ...(project || {}), id };
    if (name) {
      out.name = name;
      out.title = name;
      out.projectName = name;
    }
    if (href) out.nativeProjectHref = href;
    if (meta?.source) out.projectNameSource = meta.source;
    return out;
  }

  function normalizeNativeProjectCatalogRows(catalog) {
    const rows = Array.isArray(catalog?.rows) ? catalog.rows : [];
    const api = projectCore();
    let normalized = rows;
    if (api && typeof api.normalizeProjectCatalog === 'function') {
      try {
        normalized = api.normalizeProjectCatalog({ projects: rows })?.projects || rows;
      } catch (e) {
        err('projectCore.normalizeNativeProjectCatalogRows', e);
      }
    }
    return (Array.isArray(normalized) ? normalized : [])
      .map((row, index) => {
        const src = row && typeof row === 'object' ? row : {};
        const id = String(src.id || src.projectId || '').trim();
        if (!id) return null;
        const name = String(src.name || src.title || src.projectName || id).trim() || id;
        const href = String(src.nativeProjectHref || src.href || '').trim();
        return {
          id,
          chatIds: [],
          count: 0,
          name,
          title: name,
          projectName: name,
          nativeProjectHref: href,
          projectNameSource: String(catalog?.source || src.source || 'native-broadcast-project-catalog'),
          index: Number.isFinite(Number(src.index)) ? Number(src.index) : index,
        };
      })
      .filter(Boolean);
  }

  function mergeProjectLists(facetProjects, catalogProjects) {
    const byId = new Map();
    for (const project of Array.isArray(catalogProjects) ? catalogProjects : []) {
      const id = String(project?.id || project?.projectId || '').trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, { ...project, id, chatIds: Array.isArray(project?.chatIds) ? project.chatIds.slice() : [], count: Number(project?.count || 0) || 0 });
    }
    for (const project of Array.isArray(facetProjects) ? facetProjects : []) {
      const id = String(project?.id || project?.projectId || '').trim();
      if (!id) continue;
      const current = byId.get(id) || {};
      byId.set(id, {
        ...current,
        ...project,
        id,
        chatIds: Array.isArray(project?.chatIds) ? project.chatIds.slice() : (Array.isArray(current.chatIds) ? current.chatIds.slice() : []),
        count: Number(project?.count ?? current.count ?? 0) || 0,
        name: current.name || project?.name || project?.title || project?.projectName || '',
        title: current.title || project?.title || project?.name || project?.projectName || '',
        projectName: current.projectName || project?.projectName || project?.name || project?.title || '',
        nativeProjectHref: current.nativeProjectHref || project?.nativeProjectHref || '',
        projectNameSource: current.projectNameSource || project?.projectNameSource || '',
      });
    }
    return Array.from(byId.values())
      .sort((a, b) => {
        const countDiff = (Number(b.count) || 0) - (Number(a.count) || 0);
        if (countDiff) return countDiff;
        return String(a.name || a.title || a.id).localeCompare(String(b.name || b.title || b.id), undefined, { numeric: true });
      });
  }

  function hydrateNativeProjectCatalogFromBroadcast(payload, reason = '') {
    const normalizedPayload = normalizeNativeBroadcastPayload(payload);
    state.nativeBroadcastObservedAt = normalizedPayload ? Date.now() : state.nativeBroadcastObservedAt;
    state.nativeBroadcastPayloadKeys = normalizedPayload ? Object.keys(normalizedPayload).slice(0, 24) : state.nativeBroadcastPayloadKeys;
    const catalog = normalizedPayload && typeof normalizedPayload === 'object' ? normalizedPayload.projectCatalog : null;
    const rows = normalizeNativeProjectCatalogRows(catalog);
    state.nativeProjectCatalog = rows;
    state.nativeProjectCatalogAt = Date.now();
    state.nativeProjectCatalogSource = rows.length ? String(catalog?.source || 'native-broadcast-project-catalog') : 'native-broadcast-empty';
    state.nativeProjectCatalogError = '';
    step('native-project-catalog', `${rows.length}:${reason || ''}`);
    return rows;
  }

  async function readNativeBroadcastValue(reason = '') {
    const sync = H2O.Library?.Sync || null;
    if (sync && typeof sync.refreshNativeBroadcast === 'function') {
      try {
        const refreshed = await sync.refreshNativeBroadcast(`projects:${reason || 'read'}`);
        const normalized = normalizeNativeBroadcastPayload(refreshed);
        if (normalized) return normalized;
      } catch (e) {
        err('sync.refreshNativeBroadcast', e);
      }
    }
    if (sync && typeof sync.getNativeBroadcast === 'function') {
      try {
        const cached = normalizeNativeBroadcastPayload(sync.getNativeBroadcast());
        if (cached) return cached;
      } catch (e) {
        err('sync.getNativeBroadcast', e);
      }
    }
    if (!hasChromeStorageRead()) {
      state.nativeProjectCatalogError = 'chrome-storage-unavailable';
      return null;
    }
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(NATIVE_BROADCAST_KEY, (items) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
            resolve(items && items[NATIVE_BROADCAST_KEY]);
          });
        } catch { resolve(null); }
      });
      return normalizeNativeBroadcastPayload(raw);
    } catch (e) {
      err('readNativeBroadcastValue', e);
      return null;
    }
  }

  async function readNativeProjectCatalog(reason = '') {
    try {
      const payload = await readNativeBroadcastValue(reason);
      if (!payload) {
        state.nativeProjectCatalogError = state.nativeProjectCatalogError || 'native-broadcast-unavailable';
        return state.nativeProjectCatalog;
      }
      return hydrateNativeProjectCatalogFromBroadcast(payload, reason);
    } catch (e) {
      state.nativeProjectCatalogError = String(e?.message || e || 'native-project-catalog-error');
      err('readNativeProjectCatalog', e);
      return state.nativeProjectCatalog;
    }
  }

  function normalizeProjectListFromFacets(facets) {
    const byProject = facets?.byProject || {};
    const metadata = collectProjectMetadataFromRows();
    const legacy = Object.entries(byProject).map(([id, chatIds]) => ({
      id,
      chatIds: Array.isArray(chatIds) ? chatIds.slice() : [],
      count: Array.isArray(chatIds) ? chatIds.length : Number(chatIds || 0) || 0,
    })).map((project) => mergeProjectMetadata(project, metadata))
      .sort((a, b) => b.count - a.count);

    const api = projectCore();
    const withCatalog = mergeProjectLists(legacy, state.nativeProjectCatalog);
    if (!api || typeof api.normalizeProjectCatalog !== 'function') return withCatalog;
    try {
      const diagnostics = [];
      const catalog = api.normalizeProjectCatalog({ projects: withCatalog }, { diagnostics });
      diag.lastNormalizationDiagnostics = diagnostics.concat(catalog?.diagnostics || []).slice(-10);
      const byId = new Map(withCatalog.map((project) => [project.id, project]));
      return (catalog.projects || [])
        .map((project) => {
          const legacyProject = byId.get(project.id || project.projectId) || null;
          return {
            id: legacyProject?.id || project.id || project.projectId,
            chatIds: legacyProject?.chatIds ? legacyProject.chatIds.slice() : (Array.isArray(project.chatIds) ? project.chatIds.slice() : []),
            count: Number(legacyProject?.count ?? project.count ?? 0) || 0,
            ...(legacyProject?.projectName ? {
              name: legacyProject.projectName,
              title: legacyProject.projectName,
              projectName: legacyProject.projectName,
            } : {}),
            ...(legacyProject?.nativeProjectHref ? { nativeProjectHref: legacyProject.nativeProjectHref } : {}),
            ...(legacyProject?.projectNameSource ? { projectNameSource: legacyProject.projectNameSource } : {}),
          };
        })
        .filter((project) => project.id)
        .sort((a, b) => b.count - a.count);
    } catch (e) {
      err('projectCore.normalizeProjectCatalog', e);
      return legacy;
    }
  }

  function listProjects() {
    const idx = getIndex();
    if (!idx) return [];
    const f = idx.facets();
    return normalizeProjectListFromFacets(f);
  }

  function getProjectById(id) {
    const pid = String(id || '').trim();
    if (!pid) return null;
    const projects = listProjects();
    const api = projectCore();
    if (api && typeof api.validateProjectId === 'function') {
      try {
        const valid = api.validateProjectId(pid);
        if (!valid.ok) return null;
        if (typeof api.resolveProjectId === 'function') {
          const resolved = api.resolveProjectId(valid.projectId, projects);
          if (resolved?.ok) return projects.find((p) => p.id === resolved.projectId) || null;
        }
        return projects.find((p) => p.id === valid.projectId) || null;
      } catch (e) {
        err('projectCore.resolveProjectId', e);
      }
    }
    return projects.find((p) => p.id === pid) || null;
  }

  function getChatsInProject(id) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ projectId: String(id || '') });
  }

  function projectProjectionSummary(projects) {
    const list = Array.isArray(projects) ? projects : [];
    const byProject = getIndex()?.facets?.().byProject || {};
    const metadata = collectProjectMetadataFromRows();
    let namedCount = 0;
    for (const project of list) {
      if (project?.name || project?.title || project?.projectName) namedCount++;
    }
    return {
      source: 'LibraryIndex.facets.byProject + LibraryIndex.rows.projectName + native-broadcast.projectCatalog',
      facetCount: Object.keys(byProject || {}).length,
      rowProjectMetadataCount: metadata.size,
      catalogCount: state.nativeProjectCatalog.length,
      catalogSource: state.nativeProjectCatalogSource,
      catalogAt: state.nativeProjectCatalogAt,
      catalogError: state.nativeProjectCatalogError,
      nativeBroadcastObservedAt: state.nativeBroadcastObservedAt,
      nativeBroadcastPayloadKeys: state.nativeBroadcastPayloadKeys.slice(),
      projectCount: list.length,
      namedCount,
      rawIdCount: Math.max(0, list.length - namedCount),
    };
  }

  const Projects = {
    surface: 'studio',
    listProjects,
    getProjectById,
    getChatsInProject,
    diagnose() {
      const projects = listProjects();
      return {
        surface: 'studio',
        hasIndex: !!getIndex(),
        hasProjectCore: !!projectCore(),
        projectCorePhase: projectCore()?.__phase || '',
        projects: projects.length,
        projection: projectProjectionSummary(projects),
        normalizationDiagnostics: (diag.lastNormalizationDiagnostics || []).slice(-5),
        steps: diag.steps.slice(-8),
        errors: diag.errors.slice(-5),
      };
    },
  };

  H2O.Projects = H2O.Projects || Projects;
  H2O.Library.Projects = Projects;

  function registerOnCore() {
    const core = getCore();
    if (!core) return false;
    try {
      core.registerOwner('projects', Projects, { replace: true });
      core.registerService('projects', Projects, { replace: true });
      core.registerRoute('projects', async () => { step('route:projects'); return true; }, { replace: true });
      core.registerRoute('project',  async (route) => { step('route:project', route?.id || ''); return true; }, { replace: true });
      step('register-on-core', 'projects');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });

  readNativeProjectCatalog('boot').catch(() => {});
  W.addEventListener('evt:h2o:library:native-broadcast-updated', (evt) => {
    try {
      hydrateNativeProjectCatalogFromBroadcast(evt?.detail?.payload || null, evt?.detail?.reason || 'native-broadcast-updated');
    } catch (e) { err('native-broadcast-updated', e); }
  });
  W.addEventListener('evt:h2o:library:cross-surface-sync', () => {
    readNativeProjectCatalog('cross-surface-sync').catch(() => {});
  });

  step('boot', 'studio-projects-ready');
})();
