# Sync Architecture — Opinion & Recommendation (Desktop ↔ Chrome Studio)

Date: 2026-06-22
Status: **OPINION / RECOMMENDATION — no code changed.** Companion to `sync-architecture-reopen-audit.md`. Reflects Phase-1 desktop color reconcile (`fbbdb74`).
Scope guard: sync architecture only. No Identity UI / Billing / onboarding / signing / packaging / unrelated Desktop UI.

---

## The one thing that reframes everything

The repo is running **two sync architectures at the same time**, and only one of them works:

1. **Live path — snapshot-bundle file transport (R2/R3).** ~8 wired modules: `auto-export.tauri`, `folder-import.mv3`, `auto-import.mv3` (the Chrome *exporter*), `focus-import.tauri`, `folder-sync.tauri`, `manual-sync-ui`, `folder-color-apply`, plus the mv3 previews. Full-bundle JSON (`h2o.studio.fullBundle.v2`) moved through `~/H2O Studio Sync/{latest.json, chrome-latest.json}`. Manual / focus-triggered, opt-in, replace-merge.
2. **Dormant path — operation-log + relay + convergence (the F10.8 "relay" series).** ~50 modules, all **script-loaded but inert**: `*-apply-event` (receipt builders), `consumed-operation-ledger` / `publication-ledger` (append-only ledgers), `relay-outbox` / `relay-inbox` / `relay-index`, `webdav-relay`, `convergence-planner` / `*-proposal-candidate-generator` / `*-reviewed-apply` / `*-convergence-proof` / `convergence-watermarks` / `convergence-conflict-candidate-generator`. Every header declares the same invariants: *"no apply, no network, no automatic merge, no polling, manual only."*

So H2O has **already built most of a Git-shaped local-first operation-log/convergence engine — and ships it switched off** — while the actual sync users touch is a hand-rolled Dropbox-shaped snapshot replicator. That straddle, not any single bug, is the core architectural problem. Phase-1 (`fbbdb74`) is correct triage but it "fixed" the split store by **dual-writing** color into both SQLite *and* the folder-state mirror — which buys correctness for one field while deepening the two-stores-kept-in-sync-by-hand smell. That does not scale to create/rename/move/delete/bindings × two surfaces.

---

## A. Executive Verdict

- **Is the current approach good?** Good *enough as an MVP/bootstrap.* It is genuinely local-first, private, offline, backend-free, and inspectable. Those are real, hard-won properties. As a **premium product** sync, no — it is manual, focus-triggered, and built on a split source-of-truth plus a split *ownership* model (Desktop owns folders in SQLite; Chrome does not own folders at all — the native ChatGPT tab does).
- **Is it optimum?** No. It is an intermediate architecture carrying the cost of *two* designs (snapshot + inert op-log) without the full benefit of either.
- **Is it release-grade?** No — not for "premium automatic both-ways sync." It can be made release-grade for a **scoped, honest** promise ("explicit Sync now, deterministic, safe") much sooner.
- **Keep / evolve / replace?** **Evolve.** Keep local-first and keep the snapshot bundle (as a *seed/base*, not as the only mechanism). Collapse the dual store to one canonical Studio organization model, make a deliberate decision about the dormant op-log engine (activate-and-consolidate, or quarantine), and drive sync from data changes instead of window focus. Do **not** replace wholesale and do **not** jump to cloud/CRDT yet.

---

## B. Comparison Table — where H2O actually sits

| Dimension | **H2O (live snapshot path)** | **H2O (dormant op-log path)** | Obsidian (+Sync) | Syncthing | OneNote | Notion | Git | Dropbox/iCloud |
|---|---|---|---|---|---|---|---|---|
| Authority | Local, split (SQLite vs mirror; native-owner on Chrome) | Local, receipt/ledger | Local vault | Local replicas | Cloud server | Cloud server | Local + remotes | Cloud |
| Granularity | **Whole-bundle snapshot** | **Per-op events** | Per-file | Per-file | Per page/section | Per block | Per commit (tree) | Per file |
| Transport | Shared local folder JSON | Outbox/inbox + WebDAV (inert) | Files; Sync=E2EE relay | P2P block protocol | HTTPS | HTTPS/WS | pack over ssh/https | Cloud client |
| Trigger | **Manual / focus** | Manual (no apply) | Continuous (Sync) | **Continuous daemon** | Continuous | Real-time | Manual push/pull | Continuous |
| Merge | **Overwrite/replace-merge** | Reviewed-apply (human) | 3-way / conflict file | Conflict copies | Auto server merge | Server authoritative | 3-way + manual | LWW / conflict copy |
| Conflict model | `updatedAt`/exportId/seq, mostly *deferred* | Conflict-candidate + review UI | Per-file | `.sync-conflict` files | Server | Server | Explicit | Conflicted copy |
| History | **None (last bundle wins)** | Append-only ledger | File history (Sync) | File versioning | Version history | Page history | **Full DAG** | Version history |
| Offline | **Yes** | Yes | Yes | Yes | Partial | Poor | Yes | Cache |
| Backend needed | **No** | No (relay optional) | Optional | No | Required | Required | Remote optional | Required |
| Real-time | No | No | ~min | Seconds | Yes | Yes | No | Seconds |

**Net positioning:** the *live* path is closest to **"moving a vault through a shared folder" (Dropbox/Syncthing-shaped) but coarse-grained and without the daemon** — i.e. manual Obsidian-vault copying, not Obsidian Sync. The *dormant* path is closest to **Git** (receipts/ledger/reviewed-apply) reaching toward **local-first CRDT** systems (Automerge/Replicache/ElectricSQL) but with human review instead of automatic convergence. Honest one-liner: **Git-aspirational, Dropbox-actual.**

---

## C. Current Architecture Map (condensed; full detail in the reopen audit)

- **Transport:** `~/H2O Studio Sync/latest.json` (Desktop→Chrome) and `chrome-latest.json` (Chrome→Desktop). Full `h2o.studio.fullBundle.v2` snapshots. No watcher, no polling.
- **Source of truth:** Desktop = SQLite folders table for writes, but render+export read the **folder-state mirror** `h2o:prm:cgx:fldrs:state:data:v1` (`S0F1b` `diagnoseFolderParity`/`mergeCanonicalFolderDisplaySource`); plus a hardcoded `KNOWN_NATIVE_CANONICAL_FOLDERS` fallback. Chrome = **native ChatGPT catalog** is the mutation authority (`0F3a`), mirrored into broadcast + folder-state keys; imported Desktop folders have no native backing.
- **Mutation model:** Desktop → `actions.folders.*` → SQLite (Phase-1 now also dual-writes color to the mirror). Chrome → `folderMetadataOperations.request` → broadcast → native owner preview/apply (stale-guarded).
- **Export/import model:** opt-in, default OFF, focus/visibility-triggered; full-bundle replace-merge.
- **Conflict model:** `updatedAt`/`exportId`/`sequenceNumber`/checksum + `skippedStale` exist; most resolution **deferred**. The op-log conflict-candidate + reviewed-apply machinery is built but inert.
- **Delete model:** Chrome delete = native-owner, empty-only, "DELETE EMPTY FOLDER" confirmation; Desktop sidebar delete effectively **unavailable** (mv3-gated; desktop bridge omits `delete-folder`). No live tombstone propagation.
- **Diagnostics:** rich per-module `diagnose()`, `FolderParity` report, F-series validators in `tools/validation/sync/`. Missing: a single user-facing "is sync healthy right now" instrument and live two-way convergence proofs.

---

## D. Benefits

| Benefit | Why it matters | Strength |
|---|---|---|
| Local-first / offline | Works with no network; no service dependency | Strong |
| No backend | Zero server cost, no auth/infra to operate or breach | Strong |
| Privacy / user-owned data | Chat content never leaves the machine/sync folder | Strong (premium differentiator) |
| Inspectable / debuggable | Plain JSON bundles + checksums + diagnostics | Strong |
| Cheap to bootstrap | File transport shipped fast without a sync service | Strong (already realized) |
| Evolvable transport | Relay/WebDAV/cloud scaffolding lets the same engine later run over a relay | Latent (built, inert) |
| Safety-first culture | Append-only ledgers, redaction, "no apply" guards reduce data-loss blast radius | Strong (but currently *over*-applied → nothing applies) |

---

## E. Disadvantages / Risks

| Risk | Impact | Severity |
|---|---|---|
| **Split source-of-truth** (SQLite vs mirror vs native) | Display ≠ persistence ≠ export; Phase-1 dual-write doesn't scale to all ops | **High** |
| **Split ownership model** (Desktop owns folders; Chrome's owner is native ChatGPT) | Chrome can show but not mutate imported folders → `folder-not-found`; no real peer symmetry | **High** |
| **Snapshot overwrite/staleness** | Whole-bundle replace-merge can clobber concurrent edits; coarse granularity | High |
| **No real-time / focus-only triggers** | Sync "feels manual," unreliable; UX risk for a premium claim | High |
| **Weak delete/tombstone lifecycle** | Deletes don't propagate safely; Desktop delete missing; chat-orphaning risk | High |
| **Two parallel architectures** | ~50 inert op-log modules accrue maintenance cost with zero runtime value today | High (strategic) |
| **Conflict complexity deferred** | Real concurrent edits unhandled; reviewed-apply UI exists but unwired | Medium |
| **Chrome MV3 limits** | Service-worker lifecycle, user-gesture for File System Access, no daemon | Medium |
| **Structured app-state through files** | Folders/categories/bindings as one JSON blob is hard to merge field-wise | Medium |
| **False-green risk** | RC closed on diagnostics, not on visible behavior (caused this reopen) | Medium |

---

## F. Recommended Final Architecture

**Decide the canonical owner first (the strategic fork).** Per the product's own definition — *Studio is a Notion/OneNote-style hub that renders its own copy and decorates it, not chatgpt.com* — **Studio should be the system of record for the organization layer** (folders, colors, tags, categories, bindings). Native ChatGPT becomes **one ingest adapter**, not the mutation authority. Without this, Chrome can never reach folder-editing parity with Desktop, and `folder-not-found` is structural, not a bug.

- **Short-term target (make the live path honest & correct):**
  - One **canonical identity resolver** → `{folderId, normalizedName, sourceKind, owner, mutable}`; gate the action menu on `mutable` so the UI never round-trips to `folder-not-found`.
  - One **mutation contract** called by every entry point; one **color/name resolver** shared by render + export. Generalize Phase-1's confirm-before-toast to all ops.
  - Keep the snapshot bundle as transport, but make it **data-change-driven** (export on commit) and **reconcile-on-broadcast** on import (drop focus-only). Add a "Premium Sync ON" master switch.
  - Initially keep **one writer per entity** to sidestep conflicts; ship **Folder Sync Health**.
- **Medium-term target (collapse to one canonical store + deltas):**
  - One Studio canonical organization store; the folder-state mirror becomes a *projection*, not a second authority. Eliminate dual-write.
  - Snapshot bundle = **base/seed**; add a **bounded operation log** for incremental deltas (reuse the existing `*-apply-event` + `*-ledger` scaffolding) so tiny edits stop shipping whole bundles.
  - Tombstones + `updatedAt`/`sourcePeer` **last-writer-wins**; member chats of a deleted folder → Unfiled, never deleted.
- **Long-term target (premium local-first engine):**
  - Activate the **relay** (outbox/inbox + WebDAV/cloud) as an *optional* transport so the same engine runs over a folder, a relay, or a future E2EE cloud with no core change (this is the genuine differentiator the F10.8 work was reaching for).
  - **CRDT only where it pays:** per-field LWW/registers for color/name (auto-resolve trivial conflicts); keep **reviewed-apply** for structural conflicts (deletes/moves). Don't CRDT everything.

---

## G. Premium Sync Checklist (must be true before public/premium)

1. One canonical store per entity class; display = persistence = export from the same bytes.
2. One identity resolver + one mutation contract; all UI entry points go through them.
3. `mutable`/`owner` gating — no `folder-not-found` reachable from the UI.
4. Automatic both-way propagation **without any console command**, driven by data change (not focus).
5. Deletes tombstone and **never destroy chats**; non-empty cross-peer delete is blocked/operator-gated.
6. Deterministic conflict resolution (LWW + sourcePeer tiebreak), with review only for structural conflicts.
7. Green **two-way lifecycle test matrix** (create/rename/color/delete × both directions + a conflict case) on **built artifacts**.
8. One-click **Folder Sync Health** diagnostic surfaced to the user.
9. Decision recorded on the dormant op-log engine (activated-and-consolidated, or quarantined) — no third silent architecture.
10. *Then* signing/notarization/packaging — never before sync passes.

---

## H. Recommended Next Implementation Phases

1. **Local mutation correctness** — extend Phase-1's pattern (confirm-before-toast, owned-write-wins) to create/rename/move/delete + bindings, both surfaces. *(In progress: color done.)*
2. **Chrome folder resolver / folder-not-found** — `mutable`/`owner` resolver; gate menu pre-flight; map "not editable here" before any native round-trip.
3. **Automatic export/import** — data-change-driven export + reconcile-on-broadcast import; "Premium Sync" master switch; keep focus as supplementary only.
4. **Operation log / apply events** — light up the existing `*-apply-event` + ledger path for deltas on top of the snapshot base (one entity class first, e.g. folder color/rename).
5. **Delete/tombstone lifecycle** — tombstone schema in the bundle; member-chat → Unfiled; Desktop delete wired.
6. **Conflict resolution** — LWW + sourcePeer; reviewed-apply for structural conflicts only.
7. **Folder Sync Health diagnostic** — ship early (after phase 2) so phases 3–6 are observable.
8. **Packaged sync smoke test** — run the G-matrix on dist artifacts, not just base files.
9. **Public release packaging/signing** — only after 1–8 are green.

**Phase order rationale:** local correctness + resolver + health diagnostic first (stop lying to the user and instrument the system), automatic transport next, op-log/tombstone/conflict after the canonical model is real, packaging last.

**Do NOT over-engineer yet:** full CRDT everywhere; >2-peer topology; sub-second real-time; activating WebDAV/cloud relay; bespoke conflict UI for cases LWW handles. Consolidate-and-gate the dormant convergence machinery; do not expand it until the canonical model lands.

---

## I. Final Opinion (plainspoken)

**Evolve it into a real local-first sync engine — do not keep it as-is, and do not throw it away.**

The local-first, file-transport, user-owned-data instinct is *right* and is a premium differentiator most competitors (OneNote/Notion) can't claim. Keep that. But today the product pays for two architectures and ships neither cleanly: a coarse snapshot replicator that only works when you babysit it, and a sophisticated operation-log/convergence engine that's wired in but switched off. The two reported bugs (Desktop color not repainting, Chrome `folder-not-found`) are not isolated defects — they are the visible edge of **split state and split ownership**.

Concretely: make **Studio the canonical owner** of its organization layer, collapse to **one store + one resolver + one mutation contract**, drive sync from **data changes** rather than focus, and treat the **snapshot bundle as the base with a bounded operation log for deltas** — reusing the F10.8 scaffolding you already built instead of letting it rot. Defer cloud/relay/CRDT until that spine is solid. Ship the **Folder Sync Health** diagnostic now so you stop closing the lane on diagnostics that don't match what the user sees.

Do that and "premium automatic sync, privately, on your own machine" becomes a real, defensible claim — comparable to Obsidian's local-first ethos but with a cleaner managed engine, rather than a manual Dropbox-of-JSON that occasionally disagrees with itself.
