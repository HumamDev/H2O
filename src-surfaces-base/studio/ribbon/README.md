# Studio Ribbon

Phase: **1a — passive shell only**.

A OneNote-inspired tabbed action bar that sits above the Studio reader. Surfaces
edit/format/organize/view/export actions for the **currently opened chat**.

## What this folder owns

- `ribbon-keys.js` — frozen constants (storage key strings, event names, tab ids,
  chat-type constants). No state, no DOM, no I/O.
- `ribbon-shell.studio.js` — passive tab/group/action registry + chat-type
  context tracker + UI-state persistence (active tab, collapsed) via
  `H2O.Studio.store.prefs`. **mount/unmount are no-op stubs in Phase 1a** —
  the surface module (`S0Y1a. 🎬 Studio Ribbon - Studio.js`) performs the
  actual DOM mount.

## What this folder does NOT do (Phase 1a)

- Does not mutate chat, snapshot, folder, label, tag, project, or category data.
- Does not write any storage key outside `h2o:studio:ribbon:*`.
- Does not call `chrome.*`, `localStorage`, `indexedDB`, or `fetch`.
- Does not reach into the ChatGPT replay DOM (`cgScroll`, `cgThread`, etc.).
- Does not duplicate Command Bar (system/diagnostics) or Side Actions
  Panel (user-facing per-chat persistent lists) responsibilities.

## Visibility model

The ribbon is visible only when the **currently opened context is a chat**:

| Route / state                                            | chatType  | ribbon |
| -------------------------------------------------------- | --------- | ------ |
| `#/read/<snapshotId>` with snapshot loaded               | `saved`   | shown  |
| `#/linked` with linked-reader placeholder shown in-page  | `indexed` | shown  |
| `#/saved`, `#/pinned`, `#/archive`, `#/linked` (list)    | `null`    | hidden |
| `#/library/*`, `#/settings`, `#/migrate/*`               | `null`    | hidden |
| Reader load failed (no snapshot)                         | `null`    | hidden |

`imported` and `readonly` chat-type constants are reserved for future phases
when the snapshot record carries a discriminator for them.

## Boot order

Loaded from `studio.html` in this sequence:

1. `dock/dock-keys.js` (existing)
2. **`ribbon/ribbon-keys.js`** (new)
3. `store/prefs.js` (existing)
4. `dock/dock-shell.studio.js` (existing)
5. **`ribbon/ribbon-shell.studio.js`** (new) — passive registry only
6. ... rest of Studio modules ...
7. `S0X1a. Command Bar - Studio.js`
8. `S0X1b. Library Commands (Command Bar Plugin) - Studio.js`
9. **`S0Y1a. 🎬 Studio Ribbon - Studio.js`** (new) — surface module: registers
   the 7 default tabs + placeholder actions, mounts DOM into `#studioRibbon`,
   listens for context changes from `studio.js`
10. ... `S0Z1*` sidebar modules, then `studio.js`

## State / prefs keys

Studio-local only (enforced by `H2O.Studio.store.prefs`):

- `h2o:studio:ribbon:active-tab:v1` — string id of the active tab, or `null`
- `h2o:studio:ribbon:collapsed:v1` — boolean

## Tab catalogue (Phase 1a placeholders)

All actions in Phase 1a are **disabled placeholders** with title `Coming soon`.

| Tab        | Groups (sample)                                                       |
| ---------- | --------------------------------------------------------------------- |
| Home       | Rename chat · Copy title · Undo/redo · Open original (indexed)        |
| Format     | Headings · Quote/Code/Callout · Clean spacing                         |
| Structure  | Section · Split · Collapse · Divider · TOC                            |
| AI Tools   | Summarize · Tasks · Tags · Rewrite · Study notes                      |
| Metadata   | Tags · Category · Project · Status · Source link                      |
| View       | Compact · Focus · Timestamps · MiniMap · Reading width                |
| Export     | Copy clean · Markdown · PDF · DOCX · Print                            |

For indexed (linked) chats only `Home`, `Metadata`, `View`, `Export` tabs are
shown; the other tabs are not rendered for that chat type.

## Contracts

- `src-surfaces-base/studio/STUDIO_ARCHITECTURE.md`
- `src-surfaces-base/studio/STUDIO_DEVELOPMENT_RULES.md`
- `src-surfaces-base/studio/STUDIO_PORTABILITY_CONTRACT.md`
- `src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md`
