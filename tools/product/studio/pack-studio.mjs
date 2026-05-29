// @version 2.3.0  (Phase 8L-5: source folder renamed to src-surfaces-base/)
import fs from "node:fs";
import path from "node:path";

import { SURFACES_BASE_REL } from "../../paths.mjs";

// Phase 8L-5: source-side path authority. Post-rename resolves to
// "src-surfaces-base/studio". The bundle-output path `<outDir>/surfaces/studio`
// (see archiveWorkbenchOutDir below) is INTENTIONALLY decoupled — it stays
// literal "surfaces/studio" so chrome.runtime.getURL strings inside bundled
// bg.js / Studio mirrors continue to resolve.
export const ARCHIVE_WORKBENCH_SOURCE_REL = path.join(SURFACES_BASE_REL, "studio");
export const ARCHIVE_WORKBENCH_SOURCE_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  // Studio Platform Adapter — must load after H2O Core and before any feature
  // module. Contracts: src-surfaces-base/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md.
  // Subdir entries; pack-studio's sync step creates parent dirs on copy.
  "platform/index.js",
  "platform/platform.mv3.js",
  "platform/platform.tauri.js",
  "platform/selectors.contract.js",

  // Dock Panel shell — passive, mountless tab registry. studio.html references
  // dock/dock-keys.js and dock/dock-shell.studio.js between platform/ and
  // store/; without this entry the extension build emits ERR_FILE_NOT_FOUND
  // for those <script> tags. Contracts: src-surfaces-base/studio/dock/README.md.
  "dock/dock-keys.js",
  "dock/dock-shell.studio.js",

  // Dock Panel read-only tab modules (Phase 1b-1e + Finder). studio.html
  // references all eight after their store façades; without these entries
  // the build emits ERR_FILE_NOT_FOUND for the dock/tabs/*.tab.studio.js
  // <script> tags. Keep parallel to ARCHIVE_WORKBENCH_OUT_FILES below.
  "dock/tabs/highlights.tab.studio.js",
  "dock/tabs/bookmarks.tab.studio.js",
  "dock/tabs/notes.tab.studio.js",
  "dock/tabs/attachments.tab.studio.js",
  "dock/tabs/navigator.tab.studio.js",
  "dock/tabs/context.tab.studio.js",
  "dock/tabs/capture.tab.studio.js",
  "dock/tabs/finder.tab.studio.js",

  // Studio Ribbon shell — passive constants and registry. studio.html
  // references these before the visible S0Y1a ribbon surface module.
  "ribbon/ribbon-keys.js",
  "ribbon/ribbon-shell.studio.js",

  // Studio Edit Overlay — overlay keys/applier (Phase 2a) plus the Markdown
  // serializer (Phase 3a) and DOCX writer (Phase 3c), all extended for inline
  // formatting in Phase 5d. studio.html references all four before
  // store/editOverlay.js; keep copied with the same subdir names to avoid
  // runtime script 404s. Keep parallel to ARCHIVE_WORKBENCH_OUT_FILES below.
  "overlay/overlay-keys.js",
  "overlay/overlay-applier.studio.js",
  "overlay/overlay-serializer.studio.js",
  "overlay/overlay-docx-writer.studio.js",

  // Studio Appearance / View Options (v2.5.8) — top-right options panel.
  // Passive constants + store + panel. studio.html references all three;
  // missing any of them produces a 404 and the Appearance trigger never
  // mounts. Same subdir copy pattern as dock/ribbon/overlay.
  // Contracts: src-surfaces-base/studio/appearance/.
  "appearance/appearance-keys.js",
  "appearance/appearance-store.studio.js",
  "appearance/appearance-panel.studio.js",

  // Studio Store (Stage 1 parallel infra) — loads after platform/ and before
  // any feature module. Contracts: src-surfaces-base/studio/store/README.md,
  // STUDIO_STORAGE_CONTRACT.md.
  "store/index.js",
  "store/highlights.js",
  // Studio-local edit overlay records. Passive until future ribbon phases
  // create overlay operations.
  "store/editOverlay.js",
  // Dock Panel read-only feature store façades (Phase 1b-1e). Each is a
  // passive, sync-API/async-hydrate facade over a native engine's
  // chrome.storage keys. studio.html references all four; without these
  // entries the build emits silent 404s and H2O.Studio.store.{prefs,
  // context, bookmarks, notes} remain undefined at runtime. Order
  // matches the studio.html script ordering (prefs → context →
  // bookmarks → notes).
  "store/prefs.js",
  "store/context.js",
  "store/bookmarks.js",
  "store/notes.js",
  "store/navigator.js",
  "store/capture.js",
  "store/libraryIndex.js",
  // Desktop-only: SQLite-backed chats entity (M2a-3a). Self-detects Tauri
  // and silently no-ops on MV3 / web; safe to ship in chrome-live build.
  "store/chats.tauri.js",
  // Desktop-only: SQLite-backed snapshots entity (M2a-3b). Same gating
  // as chats.tauri.js; backs snapshots + snapshot_turns tables.
  "store/snapshots.tauri.js",
  // Desktop-only: SQLite-backed folders entity (M2a-3c). Same gating;
  // backs folders + folder_bindings tables. Must load after chats.tauri.js
  // because listChats() delegates to store.chats.
  "store/folders.tauri.js",
  // Desktop-only: SQLite-backed labels entity (M2a-3d). Same gating; backs
  // labels + label_bindings tables. Composite binding PK allows multiple
  // labels per chat. listChats() delegates to store.chats (same pattern).
  "store/labels.tauri.js",
  // Desktop-only: SQLite-backed tags entity (M2a-3e). Same gating + binding
  // shape as labels.tauri.js; tags has an auto_derived boolean and no
  // updated_at column.
  "store/tags.tauri.js",
  // Desktop-only: SQLite-backed categories entity (M2a-3f). No
  // category_bindings table — assignment lives in chats.category_id.
  // assignChat / clearChat write directly to chats; listChats delegates
  // to store.chats.
  "store/categories.tauri.js",
  // Desktop-only: SQLite-backed tombstones entity (F5C). Inert scaffold;
  // no existing delete path calls it and no export/import behavior changes.
  "store/tombstones.tauri.js",
  // Desktop-only: SQLite-backed tombstone review queue (F5F.1). Inert
  // scaffold; no importer integration and no remote delete apply.
  "store/tombstone-reviews.tauri.js",
  // Desktop-only: SQLite-backed general sync conflict queue (F6.1b.1).
  // Read-only diagnostics/list/get scaffold over sync_conflicts.
  "store/conflicts.tauri.js",
  // Desktop-only: debug F6 final validation harness. Dormant until manually
  // invoked through H2O.Studio.devValidation.f6FinalValidation.
  "dev/f6-final-validation.tauri.js",
  // Chrome/MV3-only: IndexedDB-backed tombstone review queue scaffold
  // (F5F.4c.1). API parity with Desktop scaffold, excluding ingestion/apply.
  "store/tombstone-reviews.mv3.js",
  // Desktop-only: full-bundle ingestion (M2b-1). dryRunImportBundle is
  // read-only; importBundle write side ships as stub returning
  // not-implemented (M2b-2 pending). Routed through callArchive's
  // Desktop branch in studio.js.
  "ingestion/import-bundle.tauri.js",
  // Desktop-only: full-bundle export. Reads SQLite-backed public store
  // adapters and emits Chrome-compatible h2o.studio.fullBundle.v2.
  "ingestion/export-bundle.tauri.js",
  // Desktop-only: manual folder sync (M2d-1a). Wraps the M2b ingestion
  // importer with file-system scan + fingerprint dedupe + sync ledger.
  // No watcher yet — that lands in M2d-1b.
  "sync/folder-sync.tauri.js",
  // Desktop-only: opt-in latest-bundle auto-export (R2A-2). Extends
  // H2O.Studio.sync with debounced manual-export scheduling.
  "sync/auto-export.tauri.js",
  // Chrome/MV3-only: manual sync-folder import (R2B). Reads latest.json from
  // a user-picked directory handle and calls the existing merge importer.
  "sync/folder-import.mv3.js",
  // F10.3: Chrome/MV3-only bundle-envelope preview bridge. Operator-triggered
  // diagnostic only; reads the existing sync-folder latest.json (read-only)
  // and presents it as a redacted cross-platform `bundle` envelope per
  // F10.2.0. No merge, no apply, no proposal, no write-back.
  "sync/bundle-envelope-preview.mv3.js",
  // F10.5: Chrome/MV3-only native-extension capture evidence preview
  // bridge. Operator-triggered diagnostic only; observes existing
  // native ChatGPT extension capture-store data via the read-only
  // H2O.Studio.store.capture facade and presents counts + structural
  // metadata as a redacted cross-platform `evidence` envelope per
  // F10.2.0. Never copies capture text / title / tags into payload.
  // No native-extension code change. No new chrome.runtime MSG_* type.
  // No chrome.storage write.
  "sync/capture-evidence-preview.mv3.js",
  // F10.6.1: Chrome Studio read-only folder sync canonicalizer. Operator-
  // triggered diagnostic only; canonicalizes existing folder diagnostics into
  // folder.metadata and diff/preview-only folderBinding objects. No diff
  // engine, proposal, conflictCandidate, applyEvent, storage write,
  // runtime broadcast, polling, WebDAV, or write-back.
  "sync/folder-sync-canonical.js",
  // F10.6.2: read-only folder sync diff engine. Consumes F10.6.1 canonical
  // snapshots only and returns a report-only diff. No proposal envelope,
  // conflictCandidate envelope emission, applyEvent, merge, write-back,
  // storage write, transport, polling, or WebDAV.
  "sync/folder-sync-diff.js",
  // F10.6.3: Chrome Studio proposal-preview envelope generation. Converts
  // proposalEligible F10.6.2 folder diff entries into F10.2 kind="preview" /
  // dryRun=true envelopes only. No proposal, conflictCandidate, applyEvent,
  // merge, write-back, storage write, runtime broadcast, polling, or WebDAV.
  "sync/folder-sync-proposal-preview.mv3.js",
  // F10.6.4: read-only folder conflict report layer. Consumes F10.6.2 diff
  // output only and returns enum-only hard/soft report rows. No proposal,
  // conflictCandidate envelope, applyEvent, merge, write-back, storage write,
  // runtime broadcast, polling, or WebDAV.
  "sync/folder-sync-conflict-report.js",
  // F2: peer-identity scaffold. Mints + persists per-install peer identity
  // (installId / physicalDeviceId / syncPeerId, surfaceKind / appKind /
  // storeKind). Single persistent key 'h2o:sync:peer-identity:v1' via
  // chrome.storage.local (Tauri kv shim on Desktop). Loads BEFORE the
  // multi-peer diagnostics so consumers find H2O.Studio.identity available.
  "sync/peer-identity.js",
  // F3: outbound export log. Mints exportId / sequenceNumber on every
  // disk-writing export and tracks previousExportId. Single persistent
  // key 'h2o:sync:export-log:v1'. Only mutated by exportLatestSyncBundle.
  // exportFullBundle (in-memory) never touches this log.
  "sync/export-log.js",
  // F4: producer-side per-peer local transport mirror. Writes only
  // devices/<encodeURIComponent(syncPeerId)> after the canonical root
  // latest.json commit succeeds.
  "sync/peer-transport.js",
  // F4.x: Desktop-only read-only peer discovery diagnostics for devices/*
  // state/checksum integrity. No imports, writes, polling, manifests, or history.
  "sync/peer-discovery.js",
  // F5H.5-b: read-only peer watermark diagnostics. Aggregates existing peer,
  // export, import, tombstone, and review evidence; no schema or lifecycle writes.
  "sync/peer-watermarks.js",
  // F1A: pure, synchronous multi-peer diff analyzer. Surface-agnostic.
  // Registers H2O.Studio.diagnostics.multiPeerDiff and collectLocalState.
  // No IO; safe to ship dormant on every surface.
  "sync/multi-peer-diff.js",
  // F7.1b: pure folder.metadata bidirectional preview comparator. Counts-only,
  // redacted, no storage reads/writes, no apply, no F6 ingest.
  "sync/bidirectional-folder-preview.js",
  // F7.4.1b: pure dry-run folder.metadata color apply planner. Simulated
  // checks only; no reads, writes, apply, F5 calls, or F6 calls.
  "sync/folder-metadata-apply-plan.js",
  // F7.4.1c: Tauri-only read layer for the dry-run apply planner. Reads
  // folder/tombstone state only; no writes, apply, F5 mutation, or F6 mutation.
  "sync/folder-metadata-apply-checks.tauri.js",
  // F10.7.1: Desktop/Tauri-only folder color apply gate. Consumes approved
  // preview envelopes, enforces color-only local apply, and delegates to the
  // existing transactional F7 Tauri command. No applyEvent, remote apply,
  // WebDAV, mobile write-back, retry, or automatic merge.
  "sync/folder-color-apply.tauri.js",
  // F10.7.2: Desktop/Tauri-only applyEvent receipt builder. Emits redacted
  // past-tense local apply receipts after successful local color commits.
  // No remote apply, WebDAV, convergence, storage write, or mutation.
  "sync/folder-apply-event.tauri.js",
  // F10.8.1: Desktop/Tauri-only local relay outbox. Appends validated
  // envelopes to durable local staging only. No upload, download, inbox,
  // WebDAV, convergence, remote apply, or automatic sync.
  "sync/relay-outbox.tauri.js",
  // F10.8.2: Desktop/Tauri-only local relay inbox. Validates, dedupes,
  // quarantines, and stores remote envelopes only. No apply, convergence,
  // WebDAV, networking, automatic review, or automatic sync.
  "sync/relay-inbox.tauri.js",
  // F10.8.3: Desktop/Tauri-only manual WebDAV relay adapter. Uploads outbox
  // envelopes and downloads remote blobs into inbox validation only. No
  // convergence, apply, automatic merge, review, polling, or sync loop.
  "sync/webdav-relay.tauri.js",
  // F10.8.4: Desktop/Tauri-only relay index and dedupe ledger. Derived from
  // durable outbox/inbox stores only. No writes, transport, convergence,
  // apply, or automatic sync.
  "sync/relay-index.tauri.js",
  // F10.8.5: Desktop/Tauri-only manual sync UI. Counts-first operator
  // surface over existing relay APIs. No automatic sync, convergence, merge,
  // or apply.
  "sync/manual-sync-ui.tauri.js",
  // F10.8.6a: Desktop/Tauri-only convergence readiness diagnostic. Reads
  // installed sync primitive availability and local relay/readiness state only.
  // No convergence, proposal generation, apply, WebDAV, storage mutation,
  // polling, network, automatic repair, or mobile write-back.
  "sync/convergence-readiness.tauri.js",
  // F10.8.6b: Desktop/Tauri-only remote envelope projector. Reads accepted
  // relay inbox envelopes into a redacted remote-observed state only. No
  // convergence, apply, proposal generation, conflictCandidate generation,
  // WebDAV changes, storage mutation, or mobile write-back.
  "sync/remote-envelope-projector.tauri.js",
  // F10.8.6c: Desktop/Tauri-only convergence planner. Classifies remote
  // observed state against a local canonical snapshot and readiness signals
  // only. No convergence, apply, proposal generation, conflictCandidate
  // generation, WebDAV changes, storage mutation, or mobile write-back.
  "sync/convergence-planner.tauri.js",
  // F10.8.6d: Desktop/Tauri-only manual convergence review UI. Renders
  // buildConvergencePlan() buckets only. No convergence actions, apply
  // buttons, proposal creation, WebDAV calls, auto-refresh, or merge.
  "sync/convergence-review-ui.tauri.js",
  // F10.8.6e: Desktop/Tauri-only proposal candidate generator. Converts
  // currently revalidated proposalEligible planner entries into local
  // generated proposal candidates only. No publish, outbox enqueue, apply,
  // applyEvent, conflictCandidate, convergence, or WebDAV.
  "sync/convergence-proposal-generator.tauri.js",
  // F10.8.6f: Desktop/Tauri-only conflictCandidate generator. Converts
  // currently revalidated conflicted planner entries into local generated
  // conflictCandidate candidates only. No publish, outbox enqueue, apply,
  // proposal, applyEvent, convergence, or WebDAV.
  "sync/convergence-conflict-candidate-generator.tauri.js",
  // F10.8.6g1: Desktop/Tauri-only shared publication ledger. Appends and
  // lists local publication lifecycle rows only. No publish, outbox enqueue,
  // upload, apply, convergence, or remote mutation.
  "sync/publication-ledger.tauri.js",
  // F10.8.6g2: Desktop/Tauri-only proposal publication. Publishes generated
  // proposal candidates into the local relay outbox only. No upload, WebDAV,
  // apply, applyEvent, convergence, or remote mutation.
  "sync/proposal-publication.tauri.js",
  // F10.8.6g3: Desktop/Tauri-only conflictCandidate publication. Publishes
  // generated conflictCandidate artifacts into the local relay outbox only.
  // No upload, WebDAV, apply, applyEvent, convergence, or remote mutation.
  "sync/conflict-publication.tauri.js",
  // F10.8.7: Desktop/Tauri-only convergence watermark persistence. Explicit
  // append-only per-peer/per-subject watermark records only. No automatic
  // advancement, convergence, apply, publication, WebDAV, or remote mutation.
  "sync/convergence-watermarks.tauri.js",
  // F10.8.8: Desktop/Tauri-only consumed operation ledger. Records processed,
  // ignored, blocked, duplicate, replay, expired, or superseded operations only.
  // No convergence, apply, watermark advancement, publication, transport,
  // WebDAV, or remote mutation.
  "sync/consumed-operation-ledger.tauri.js",
  // F10.8.9a: Desktop/Tauri-only convergence preflight. Validates selected
  // color-only proposalEligible planner entries only. No convergence, apply,
  // watermark advancement, applyEvent, publication, transport, or mutation.
  "sync/convergence-preflight.tauri.js",
  // F10.8.9b: Desktop/Tauri-only local color convergence action. Executes one
  // approved color-only local apply and returns an applyEvent receipt only.
  // No watermark, consumed ledger, publication, transport, or batch action.
  "sync/color-convergence-action.tauri.js",
  // F10.8.9c: Desktop/Tauri-only convergence bookkeeping. Finalizes one
  // successful local color convergence by recording consumed-operation and
  // watermark rows only. No apply, publication, transport, or remote mutation.
  "sync/convergence-bookkeeping.tauri.js",
  // F10.8.9d: Desktop/Tauri-only convergence action review UI. Calls existing
  // preflight, local color convergence, and bookkeeping APIs only from explicit
  // operator controls. No new convergence logic or transport.
  "sync/convergence-action-ui.tauri.js",
  // F10.9.1: Desktop/Tauri-only rename materialization diagnostic. Verifies
  // local proposedName against remote targetNameHash and safety ledgers only.
  // No rename, apply, convergence, publication, transport, or mutation.
  "sync/rename-materialization-diagnostic.tauri.js",
  // F10.9.2: Desktop/Tauri-only rename convergence preflight. Wraps the
  // materialization diagnostic and blocks rename-vs-move/delete cases only.
  // No rename, apply, convergence, publication, transport, or mutation.
  "sync/rename-convergence-preflight.tauri.js",
  // F10.9.3: Desktop/Tauri-only rename proposal candidate generator. Emits
  // local generated proposal candidates with targetNameHash only. No rename,
  // apply, publication, outbox enqueue, convergence, or transport.
  "sync/rename-proposal-candidate-generator.tauri.js",
  // F10.9.4: Desktop/Tauri-only local rename convergence action. Executes one
  // approved local folder rename only. No applyEvent, publication, bookkeeping,
  // transport, move, create, delete, binding, or mobile write-back.
  "sync/rename-convergence-action.tauri.js",
  // F10.9.5: Desktop/Tauri-only rename applyEvent receipt builder. Emits
  // redacted applyEvent evidence only after successful local rename results.
  // No rename, apply, watermark, consumed ledger, publication, or transport.
  "sync/rename-apply-event.tauri.js",
  // F10.9.6: Desktop/Tauri-only rename convergence bookkeeping. Builds the
  // rename applyEvent receipt, records consumed-operation and watermark rows
  // only. No rename, second apply, publication, enqueue, upload, or WebDAV.
  "sync/rename-convergence-bookkeeping.tauri.js",
  // F10.9.7: Desktop/Tauri-only rename convergence review/action UI. Calls
  // existing materialization, preflight, local rename, and bookkeeping APIs
  // from explicit operator controls only. No new rename logic or transport.
  "sync/rename-convergence-ui.tauri.js",
  // F10.9.8: Desktop/Tauri-only rename convergence runtime proof harness.
  // Orchestrates existing rename validation/action APIs only. No new
  // convergence behavior, publication, transport, WebDAV, or mobile write-back.
  "sync/rename-convergence-proof.tauri.js",
  // Desktop-only: debug F7.4.3 folder color apply validation harness. Dormant
  // until manually invoked through H2O.Studio.devValidation.
  "dev/f7-folder-color-apply-validation.tauri.js",
  // F1B: hidden/gated readiness runner. Mounts only when BOTH
  //   H2O.flags.experimentalMultiPeer === true AND
  //   location.hash === '#/dev/multi-peer-readiness'
  // are true. Counts-only DOM render; no writes; no sample content.
  "sync/multi-peer-runner.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",

  // Library subsystem (Studio) — must match the <script> tag order in studio.html.
  // studio.html references these by filename; if any are missing from the bundle
  // the browser silently 404s the <script> tag and H2O.LibraryCore/etc. remain
  // undefined. Keep this list in lockstep with studio.html.
  "S0F0a. 🎬 Library Surface Host - Studio.js",
  // Phase 2A — shared registry core. Must load before any Library feature
  // owner so H2O.Library.RegistryCore is available when S0F1g sanitizes its
  // first record. Same index position in the OUT list.
  "S0F0c. 🎬 Library Registry Core - Studio.js",
  // Phase 2B — shared library-index core. Must load before S0F1c so the
  // shared module is available when Library Index hydrates/normalizes its
  // first row. Same index position in the OUT list.
  "S0F0d. 🎬 Library Index Core - Studio.js",
  // Phase 3B — shared folder-provider core. Must load before later folder
  // delegation phases. Same index position in the OUT list.
  "S0F0e. 🎬 Folder Provider Core - Studio.js",
  // Phase 4B — shared category-provider core. Must load before later category
  // delegation phases. Same index position in the OUT list.
  "S0F0f. 🎬 Category Provider Core - Studio.js",
  // Phase 5B — shared tag-provider core. Must load before later tag
  // delegation phases. Same index position in the OUT list.
  "S0F0g. 🎬 Tag Provider Core - Studio.js",
  // Phase 5C — shared label-provider core. Must load before later label
  // delegation phases. Same index position in the OUT list.
  "S0F0h. 🎬 Label Provider Core - Studio.js",
  // Phase 6B — shared project-provider core. Must load before later project
  // delegation phases. Same index position in the OUT list.
  "S0F0i. 🎬 Project Provider Core - Studio.js",
  // Phase 7B — shared LibraryActionsCore. Must load before later LibraryActions
  // facade delegation phases. Same index position in the OUT list.
  "S0F0j. 🎬 Library Actions Core - Studio.js",
  "S0F1a. 🎬 Library Core - Studio.js",
  "S0F1e. 🎬 Library Store - Studio.js",
  "S0F1g. 🎬 Chat Registry - Studio.js",
  "S0F1c. 🎬 Library Index - Studio.js",
  // Phase 7D — Studio LibraryActions facade. Must load after core/registry/index
  // and before command/feature consumers. Same index position in the OUT list.
  "S0F1j. 🎬 Library Actions - Studio.js",
  "S0F2a. 🎬 Projects - Studio.js",
  "S0F3a. 🎬 Folders - Studio.js",
  "S0F4a. 🎬 Categories - Studio.js",
  "S0F5a. 🎬 Tags - Studio.js",
  "S0F6a. 🎬 Labels - Studio.js",
  "S0F1b. 🎬 Library Workspace - Studio.js",
  "S0F1d. 🎬 Library Insights - Studio.js",
  "S0F1f. 🎬 Library Maintenance - Studio.js",
  "S0F1h. 🎬 Library Sync - Studio.js",
  // F10.4: read-only Settings card for the F10.3 bundle-envelope preview
  // diagnostic. Mounts a sibling card after #wbSettingsSyncBox in
  // Settings → Local Sync. Operator-triggered; no Apply / Merge / Sync
  // Now / Proposal buttons; no chrome.storage write, no chrome.runtime
  // broadcast, no folder-import call.
  "S0F1i. 🎬 Cross-Platform Envelope Preview - Studio.js",
  // Phase 1 — canonical services + H2O.flags. Loads after every feature owner
  // so canonical aliases resolve to real impls on the first registration pass.
  "S0F1k. 🎬 Library Canonical Services - Studio.js",
  "S0X1a. 🎬 Command Bar - Studio.js",
  "S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio.js",
  "S0Z1f. 🎬 Library Sidebar Tab - Studio.js",
  "S0Z1g. 🎬 Library Sidebar Sections - Studio.js",

  // Studio Ribbon visible surface module. Loads after core reader/router
  // surfaces so it can observe reader context without owning it.
  "S0Y1a. 🎬 Studio Ribbon - Studio.js",

  // Standalone Studio decorations referenced by studio.html.
  "S9D1a. 🎬 Auto Emoji Title - Studio.js",
]);
export const ARCHIVE_WORKBENCH_OUT_FILES = Object.freeze([
  "studio.html",
  "studio.css",
  "studio.js",
  "S0D3e. 🎬 Transcript Studio Host - Studio.js",

  "S0A2a. 🎬 Observer Hub - Studio.js",
  "S0A1a. 🎬 H2O Core - Studio.js",

  // Studio Platform Adapter — see SOURCE_FILES list above for context.
  "platform/index.js",
  "platform/platform.mv3.js",
  "platform/platform.tauri.js",
  "platform/selectors.contract.js",

  // Dock Panel shell — see SOURCE_FILES list above for context.
  "dock/dock-keys.js",
  "dock/dock-shell.studio.js",

  // Dock Panel read-only tab modules — see SOURCE_FILES list above.
  "dock/tabs/highlights.tab.studio.js",
  "dock/tabs/bookmarks.tab.studio.js",
  "dock/tabs/notes.tab.studio.js",
  "dock/tabs/attachments.tab.studio.js",
  "dock/tabs/navigator.tab.studio.js",
  "dock/tabs/context.tab.studio.js",
  "dock/tabs/capture.tab.studio.js",
  "dock/tabs/finder.tab.studio.js",

  // Studio Ribbon shell — see SOURCE_FILES list above for context.
  "ribbon/ribbon-keys.js",
  "ribbon/ribbon-shell.studio.js",

  // Studio Edit Overlay — see SOURCE_FILES list above for context.
  "overlay/overlay-keys.js",
  "overlay/overlay-applier.studio.js",
  "overlay/overlay-serializer.studio.js",
  "overlay/overlay-docx-writer.studio.js",

  // Studio Appearance / View Options — see SOURCE_FILES list above.
  "appearance/appearance-keys.js",
  "appearance/appearance-store.studio.js",
  "appearance/appearance-panel.studio.js",

  // Studio Store — see SOURCE_FILES list above for context.
  "store/index.js",
  "store/highlights.js",
  "store/editOverlay.js",
  // Dock Panel read-only feature store façades (Phase 1b-1e). See SOURCE_FILES.
  "store/prefs.js",
  "store/context.js",
  "store/bookmarks.js",
  "store/notes.js",
  "store/navigator.js",
  "store/capture.js",
  "store/libraryIndex.js",
  "store/chats.tauri.js",
  "store/snapshots.tauri.js",
  "store/folders.tauri.js",
  "store/labels.tauri.js",
  "store/tags.tauri.js",
  "store/categories.tauri.js",
  "store/tombstones.tauri.js",
  "store/tombstone-reviews.tauri.js",
  "store/conflicts.tauri.js",
  "dev/f6-final-validation.tauri.js",
  "store/tombstone-reviews.mv3.js",
  "ingestion/import-bundle.tauri.js",
  "ingestion/export-bundle.tauri.js",
  "sync/folder-sync.tauri.js",
  "sync/auto-export.tauri.js",
  "sync/folder-import.mv3.js",
  "sync/bundle-envelope-preview.mv3.js",
  "sync/capture-evidence-preview.mv3.js",
  "sync/folder-sync-canonical.js",
  "sync/folder-sync-diff.js",
  "sync/folder-sync-proposal-preview.mv3.js",
  "sync/folder-sync-conflict-report.js",
  "sync/peer-identity.js",
  "sync/export-log.js",
  "sync/peer-transport.js",
  "sync/peer-discovery.js",
  "sync/peer-watermarks.js",
  "sync/multi-peer-diff.js",
  "sync/bidirectional-folder-preview.js",
  "sync/folder-metadata-apply-plan.js",
  "sync/folder-metadata-apply-checks.tauri.js",
  "sync/folder-color-apply.tauri.js",
  "sync/folder-apply-event.tauri.js",
  "sync/relay-outbox.tauri.js",
  "sync/relay-inbox.tauri.js",
  "sync/webdav-relay.tauri.js",
  "sync/relay-index.tauri.js",
  "sync/manual-sync-ui.tauri.js",
  "sync/convergence-readiness.tauri.js",
  "sync/remote-envelope-projector.tauri.js",
  "sync/convergence-planner.tauri.js",
  "sync/convergence-review-ui.tauri.js",
  "sync/convergence-proposal-generator.tauri.js",
  "sync/convergence-conflict-candidate-generator.tauri.js",
  "sync/publication-ledger.tauri.js",
  "sync/proposal-publication.tauri.js",
  "sync/conflict-publication.tauri.js",
  "sync/convergence-watermarks.tauri.js",
  "sync/consumed-operation-ledger.tauri.js",
  "sync/convergence-preflight.tauri.js",
  "sync/color-convergence-action.tauri.js",
  "sync/convergence-bookkeeping.tauri.js",
  "sync/convergence-action-ui.tauri.js",
  "sync/rename-materialization-diagnostic.tauri.js",
  "sync/rename-convergence-preflight.tauri.js",
  "sync/rename-proposal-candidate-generator.tauri.js",
  "sync/rename-convergence-action.tauri.js",
  "sync/rename-apply-event.tauri.js",
  "sync/rename-convergence-bookkeeping.tauri.js",
  "sync/rename-convergence-ui.tauri.js",
  "sync/rename-convergence-proof.tauri.js",
  "dev/f7-folder-color-apply-validation.tauri.js",
  "sync/multi-peer-runner.js",

  "S1A1a. 🎬 MiniMap Kernel - Studio.js",
  "S1A1f. 🎬 MiniMap Views - Studio.js",
  "S1A1e. 🎬 MiniMap Skin - Studio.js",
  "S1A1d. 🎬 MiniMap Shell - Studio.js",
  "S1A1b. 🎬 MiniMap Core - Studio.js",
  "S1A1c. 🎬 MiniMap Engine - Studio.js",

  "S3H1a. 🎬 Highlights Engine - Studio.js",
  "S1A3a. 🎬 Highlight Dots - Studio.js",
  "S1A2a. 🎬 Answer Wash Engine - Studio.js",
  "S1C1a. 🎬 Turn Title Bar - Studio.js",

  "S2A1a. 🎬 Question Wrapper - Studio.js",
  "S2B1a. 🎬 Quote Tracker - Studio.js",
  "S2C1a. 🎬 Question Wash Engine - Studio.js",

  "S1Z1a. 🎬 Answer Timestamp - Studio.js",
  "S2Z1a. 🎬 Question Timestamp - Studio.js",
  "S1X1a. 🎬 Answer Numbers - Studio.js",

  // Library subsystem (Studio). Out filenames are identical to source filenames —
  // studio.html references them by the same name and copyFileSync preserves them.
  // Keep this list in lockstep with ARCHIVE_WORKBENCH_SOURCE_FILES above
  // (the syncArchiveWorkbenchToOut copy is index-paired).
  "S0F0a. 🎬 Library Surface Host - Studio.js",
  "S0F0c. 🎬 Library Registry Core - Studio.js",
  "S0F0d. 🎬 Library Index Core - Studio.js",
  "S0F0e. 🎬 Folder Provider Core - Studio.js",
  "S0F0f. 🎬 Category Provider Core - Studio.js",
  "S0F0g. 🎬 Tag Provider Core - Studio.js",
  "S0F0h. 🎬 Label Provider Core - Studio.js",
  "S0F0i. 🎬 Project Provider Core - Studio.js",
  "S0F0j. 🎬 Library Actions Core - Studio.js",
  "S0F1a. 🎬 Library Core - Studio.js",
  "S0F1e. 🎬 Library Store - Studio.js",
  "S0F1g. 🎬 Chat Registry - Studio.js",
  "S0F1c. 🎬 Library Index - Studio.js",
  "S0F1j. 🎬 Library Actions - Studio.js",
  "S0F2a. 🎬 Projects - Studio.js",
  "S0F3a. 🎬 Folders - Studio.js",
  "S0F4a. 🎬 Categories - Studio.js",
  "S0F5a. 🎬 Tags - Studio.js",
  "S0F6a. 🎬 Labels - Studio.js",
  "S0F1b. 🎬 Library Workspace - Studio.js",
  "S0F1d. 🎬 Library Insights - Studio.js",
  "S0F1f. 🎬 Library Maintenance - Studio.js",
  "S0F1h. 🎬 Library Sync - Studio.js",
  "S0F1i. 🎬 Cross-Platform Envelope Preview - Studio.js",
  "S0F1k. 🎬 Library Canonical Services - Studio.js",
  "S0X1a. 🎬 Command Bar - Studio.js",
  "S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio.js",
  "S0Z1f. 🎬 Library Sidebar Tab - Studio.js",
  "S0Z1g. 🎬 Library Sidebar Sections - Studio.js",

  // Studio Ribbon visible surface module — see SOURCE_FILES list above.
  "S0Y1a. 🎬 Studio Ribbon - Studio.js",

  // Standalone Studio decorations referenced by studio.html.
  "S9D1a. 🎬 Auto Emoji Title - Studio.js",
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function removeFileIfPresent(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

function tryRemoveEmptyDir(dirPath) {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
  } catch {
    return false;
  }
  try {
    if ((fs.readdirSync(dirPath) || []).length > 0) return false;
    fs.rmdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}

export function archiveWorkbenchSourceDir(srcRoot) {
  return path.join(String(srcRoot || ""), ARCHIVE_WORKBENCH_SOURCE_REL);
}

export function getArchiveWorkbenchSourcePresence(srcRoot) {
  const dir = archiveWorkbenchSourceDir(srcRoot);
  return ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function archiveWorkbenchOutDir(outDir) {
  return path.join(String(outDir || ""), "surfaces", "studio");
}

export function getArchiveWorkbenchPresence(outDir) {
  const dir = archiveWorkbenchOutDir(outDir);
  return ARCHIVE_WORKBENCH_OUT_FILES.filter((name) => fileExists(path.join(dir, name)));
}

export function compareArchiveWorkbenchToSource(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const files = ARCHIVE_WORKBENCH_SOURCE_FILES.map((sourceName, index) => {
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    const sourcePath = path.join(sourceDir, sourceName);
    const outPath = path.join(outWorkbenchDir, outName);
    const sourceExists = fileExists(sourcePath);
    const outExists = fileExists(outPath);
    const equal = sourceExists && outExists ? readText(sourcePath) === readText(outPath) : false;
    return {
      name: outName,
      sourceName,
      outName,
      sourcePath,
      outPath,
      sourceExists,
      outExists,
      equal,
    };
  });

  return {
    sourceDir,
    outWorkbenchDir,
    files,
    matches: files.every((item) => item.sourceExists && item.outExists && item.equal),
  };
}

export function syncArchiveWorkbenchToOut(srcRoot, outDir) {
  const sourceDir = archiveWorkbenchSourceDir(srcRoot);
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const missingSource = ARCHIVE_WORKBENCH_SOURCE_FILES.filter((name) => !fileExists(path.join(sourceDir, name)));
  if (missingSource.length) {
    throw new Error(`archive workbench source missing: ${missingSource.join(", ")}`);
  }

  ensureDir(outWorkbenchDir);
  for (let index = 0; index < ARCHIVE_WORKBENCH_SOURCE_FILES.length; index += 1) {
    const sourceName = ARCHIVE_WORKBENCH_SOURCE_FILES[index];
    const outName = ARCHIVE_WORKBENCH_OUT_FILES[index];
    const outPath = path.join(outWorkbenchDir, outName);
    // Out filenames may now contain subdir segments (e.g. "platform/index.js"
    // for the Studio platform adapter). Ensure each parent dir exists before
    // copy so nested files don't fail with ENOENT.
    ensureDir(path.dirname(outPath));
    fs.copyFileSync(path.join(sourceDir, sourceName), outPath);
  }

  return {
    sourceDir,
    outWorkbenchDir,
    files: ARCHIVE_WORKBENCH_OUT_FILES.slice(),
  };
}

export function removeArchiveWorkbenchFromOut(outDir) {
  const outWorkbenchDir = archiveWorkbenchOutDir(outDir);
  const removed = [];
  for (const name of ARCHIVE_WORKBENCH_OUT_FILES) {
    if (removeFileIfPresent(path.join(outWorkbenchDir, name))) removed.push(name);
  }
  tryRemoveEmptyDir(outWorkbenchDir);
  tryRemoveEmptyDir(path.dirname(outWorkbenchDir));
  return {
    outWorkbenchDir,
    removed,
  };
}
