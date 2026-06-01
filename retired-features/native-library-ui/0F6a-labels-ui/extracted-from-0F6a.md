# R4.7.3 — Extracted from 0F6a (Labels Sidebar UI)

Retirement log. Records exactly which lines of
`src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` were physically removed
in R4.7.3, which lines were turned into no-op stubs, and which
surfaces stayed.

**Commit:** _<R4.7.3 commit hash; populated post-commit>_

**Source file size before R4.7.3:** 3188 lines (post-R4.6.4 baseline)
**Source file size after R4.7.3:** 2728 lines
**Net retirement:** ~460 lines removed from 0F6a (net of new
breadcrumb comments + no-op stubs).

## Moves (fully removed from 0F6a)

| Source lines (pre-R4.7.3) | Region name | Destination |
|---|---|---|
| 128–183 | R4.6.3 per-element org gate (`R46_ORG_SELECTORS`, `syncR46OrgElements`, `installR46OrgCssGate`, `bootR46OrgCssGate` IIFE) | `labels-sidebar.js` Block 1 |
| 1483–1544 | `openLabelActionsPop` — row context-menu popup hosting sidebar rename + delete UI handlers | `labels-sidebar.js` Block 2 |
| 1799–1807 | `makeFallbackSidebarHeader` — fallback section header builder | `labels-sidebar.js` Block 3 |
| 1809–1849 | `prepareLabelsSection` — section element shell + header + list wrap construction; sets `data-cgxui="lbsc-root"` | `labels-sidebar.js` Block 4 |

At each removal site a breadcrumb comment now points to
`retired-features/native-library-ui/0F6a-labels-ui/labels-sidebar.js`.

## Stubs (kept in 0F6a as no-ops for external callers)

The following functions are kept as no-op stubs because they have
external callers we must NOT break in this slice. Their original
bodies live archivally in `labels-sidebar.js`.

| Source lines (pre-R4.7.3) | Function | Why kept (external caller) |
|---|---|---|
| 1851–2000 | `buildLabelsSection` | `MOD.buildSection` API at line 3100 (pre-R4.7.3) forwards to it. Stub returns `null`. |
| 2002–2010 | `activePageLabelKey` | Only called from `syncLabelSidebarActiveState` (also stubbed); stub returns `''`. |
| 2012–2039 | `syncLabelSidebarActiveState` | Workspace viewer paths (`closeViewer` / `openLabelsViewer` / `openLabelViewer`) call it; R4.7.4 will retire those callers. |
| 2041–2050 | `scheduleLabelSidebarActiveSync` | Only called from `ensureSidebarObserver` (also stubbed); stubbed for symmetry. |
| 2052–2066 | `rerenderLabelsSection` | Called from `createLabel`, `renameLabel`, `deleteLabel`, `afterLabelMutation`, `setTypeVisible`, and the show-counts toggle. Stub keeps the call shape; no DOM render happens. |
| 2068–2101 | `ensureSidebarObserver` | Only called from `ensureInjected` (also stubbed); stubbed for symmetry. |
| 2103–2112 | `scheduleEnsure` | Exposed via MOD API (boot late-init); stub returns `undefined`. |
| 2114–2202 | `ensureInjected` | Exposed via MOD API + called from boot late-init + `scheduleEnsure`. Stub returns `false`. |

## KEEP in 0F6a (NOT moved in R4.7.3)

These regions remain live in 0F6a per the R4.7.3 scope discipline:

### Label CRUD entrypoints (MV3 fallback dependency)

| Function | Line (post-R4.7.3) | Why kept |
|---|---|---|
| `function createLabel(typeRaw, labelRaw, opts)` | 889 | Studio MV3 fallback calls `H2O.Labels.createLabel(...)` |
| `function renameLabel(typeRaw, labelIdRaw, nextLabelRaw)` | 914 | Studio MV3 fallback calls `H2O.Labels.renameLabel(...)` |
| `function deleteLabel(typeRaw, labelIdRaw, opts)` | 933 | Studio MV3 fallback calls `H2O.Labels.deleteLabel(...)` |

The CRUD functions are exposed via `MOD.*` (lines 3069-3071
pre-R4.7.3) which means Studio's S0Z1g re-wiring path continues
to mutate the Native label catalog via these functions even after
the Native sidebar UI is gone. The validator's Section P
re-asserts these definitions are still present in 0F6a.

### Label data layer

- Catalog normalizers / readers / writers (lines 605–720)
- Bindings normalizers / readers / writers (655–720)
- Per-chat binding mutations (`setChatLabel`, `addChatLabel`,
  `removeChatLabel`, `clearChatLabels`, lines 1033–1095)
- Query API (`getChatLabels`, `flattenChatLabels`,
  `getLabelCounts`, `listChatsByLabel`, `buildLabelSummary`,
  `buildArchiveLabelAssignments`, lines 1019–1244)
- UI state read/write (`readUi`, `writeUi`, `readCfg`)

### Turn-level chip-color UI

The per-turn `lbsc-chip-color` chip rendering lives in a
DIFFERENT DOM subtree from the retired `lbsc-root` sidebar. The
chip ships with turn-level decorations (alongside 0F5a tag pills).

- `chip.style.setProperty('--lbsc-chip-color', ...)` call (line
  2055 post-R4.7.3, inside `openAssignModal`)
- Supporting CSS rules (`--lbsc-chip-color`, `color-mix`, etc.)
  at lines 2399+

### Workspace viewer + modal UI

Lives at lines 2248–2585 (pre-R4.7.3). R4.7.4 scope:
- `makeChatRow`, `makeStandalonePageShell`
- `mountPage`, `closeViewer`
- `openLabelsViewer`, `openLabelViewer`
- `openAssignModal`, `closeAssignModal`

### Module skeleton

- IIFE, `H2O.Labels` namespace, `MOD` object
- R4.6.0 flag-reader helpers + diagnose registration
- Boot late-init (`hookMenuInjectionOnce`, `hookGlobalKeysOnce`,
  `bootWhenLibraryCoreReady`, etc.)
- `ensureStyle` CSS injector (chip-color CSS lives there)

## Boundary preservation invariants

The native deprecation validator's Section P re-asserts that
after R4.7.3:

1. `retired-features/native-library-ui/0F6a-labels-ui/labels-sidebar.js`
   exists and is non-empty.
2. 0F6a no longer defines `R46_ORG_SELECTORS`,
   `syncR46OrgElements`, `installR46OrgCssGate`,
   `openLabelActionsPop`, `prepareLabelsSection`, or
   `makeFallbackSidebarHeader`.
3. 0F6a still contains the three CRUD function definitions
   (`function createLabel`, `function renameLabel`,
   `function deleteLabel`).
4. The three CRUD definitions remain ungated by any
   `library.native*` flag helper.
5. The per-turn `lbsc-chip-color` UI (both the `setProperty` call
   site and the CSS) remains present in 0F6a.
6. 0F6a still defines `function buildLabelsSection` (no-op stub
   form: body is a single `return null;` followed by `}`).
7. The MOD API exposures (`MOD.scheduleEnsure`,
   `MOD.ensureInjected`, `MOD.buildSection`) still resolve — the
   exposures bind to the stubbed functions.
8. 0F5a byte count remains exactly 273099.
9. 0D3* and 3X* capture files were not touched.
10. The 0F6a-labels-ui README and the top-level
    migration-map.md both document the
    S0Z1g + S0F1m + S0F1n + S0F6b replacement stack.

## Replacement (production)

| Native surface (retired in R4.7.3) | Replacement module(s) |
|---|---|
| Labels sidebar section root + render | `S0Z1g. 🎬 Library Sidebar Sections - Studio.js` |
| Label rename / color / delete UI (sidebar row context menu) | `S0F1m. 🎬 Library Organization Modals - Studio.js` `openLabelEditor({mode: 'rename' \| 'color' \| 'delete'})` |
| Label-create UI | `S0F1m` `openLabelEditor({mode: 'create'})` |
| Label rows + label "more" buttons | `S0Z1g` sidebar item menu + `S0F1m` modals |
| Multi-select batch operations on labels | `S0F1n. 🎬 Library Batch Toolbar - Studio.js` |
| Label business actions (set/add/remove/clear) from Library | `S0F6b. 🎬 Labels Actions - Studio.js` |

## Rollback

Two options:

1. `git revert <R4.7.3 commit hash>` — restores the source file.
2. Manual rollback: paste Blocks 1, 2, 3, 4 from `labels-sidebar.js`
   back into 0F6a at the pre-R4.7.3 line ranges above; replace each
   Block 6 stub with its original body (from Block 6 of the
   archive); remove the breadcrumb comments; remove the early
   `return null;` from `buildLabelsSection`; run
   `npm run dev:rebuild`.
