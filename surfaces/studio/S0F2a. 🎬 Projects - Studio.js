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

  function getCore() { return H2O.LibraryCore || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function projectCore() { return H2O.Library?.ProjectProviderCore || null; }

  function normalizeProjectListFromFacets(facets) {
    const byProject = facets?.byProject || {};
    const legacy = Object.entries(byProject).map(([id, chatIds]) => ({
      id,
      chatIds: Array.isArray(chatIds) ? chatIds.slice() : [],
      count: Array.isArray(chatIds) ? chatIds.length : Number(chatIds || 0) || 0,
    })).sort((a, b) => b.count - a.count);

    const api = projectCore();
    if (!api || typeof api.normalizeProjectCatalog !== 'function') return legacy;
    try {
      const diagnostics = [];
      const catalog = api.normalizeProjectCatalog({ byProject }, { diagnostics });
      diag.lastNormalizationDiagnostics = diagnostics.concat(catalog?.diagnostics || []).slice(-10);
      const byId = new Map(legacy.map((project) => [project.id, project]));
      return (catalog.projects || [])
        .map((project) => {
          const legacyProject = byId.get(project.id || project.projectId) || null;
          return {
            id: legacyProject?.id || project.id || project.projectId,
            chatIds: legacyProject?.chatIds ? legacyProject.chatIds.slice() : (Array.isArray(project.chatIds) ? project.chatIds.slice() : []),
            count: Number(legacyProject?.count ?? project.count ?? 0) || 0,
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

  const Projects = {
    surface: 'studio',
    listProjects,
    getProjectById,
    getChatsInProject,
    diagnose() {
      return {
        surface: 'studio',
        hasIndex: !!getIndex(),
        hasProjectCore: !!projectCore(),
        projectCorePhase: projectCore()?.__phase || '',
        projects: listProjects().length,
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

  step('boot', 'studio-projects-ready');
})();
