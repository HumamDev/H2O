# Sync Product Strategy — Local-First vs WebDAV, Chrome-Light vs Desktop-Full

Date: 2026-06-22
Status: **STRATEGY / RECOMMENDATION — no code changed.** Third companion to `sync-architecture-reopen-audit.md` and `sync-architecture-opinion-recommendation.md`. Reflects Phases 1–3 (`fbbdb74`, `0f317ee`, `02a1e7a`).
Scope guard: sync architecture + product surface contract only. No Identity UI / Billing / onboarding / signing / packaging / unrelated Desktop UI. No s-file moves.

---

## Two repo facts that decide most of this

1. **The codebase already is "Desktop-heavy, Chrome-light."** The sync layer ships **62 Tauri-only modules vs 5 MV3-only modules**; **78** studio files bail unless Tauri. The entire operation-log / relay / convergence / WebDAV engine is already Desktop-only (all `.tauri.js`). Chrome's sync surface is 5 modules (the Chrome exporter, the latest.json importer, two previews, tombstone-reviews). **Formalizing Chrome-as-companion ratifies what the code already does — it is not a pivot.**
2. **The local-folder transport has a structural Chrome ceiling.** Phase 3 (`02a1e7a`) proved Chrome cannot write `chrome-latest.json` in the background without a **File System Access user gesture** (`permission-required`), persisted `mode:"manual"` config silently beat the new auto default, and coarse whole-bundle `exportId` conflicts couldn't distinguish a safe field-merge from a real conflict. And cross-machine, `~/H2O Studio Sync/` is only "local" if the user **already runs Dropbox/iCloud/Syncthing** to replicate that folder between machines. So the local-folder transport is genuinely automatic only for **same-machine** Desktop↔Chrome; cross-machine it secretly depends on a third-party replicator.

These two facts both **confirm the hypothesis** (local-first foundation; Chrome light; WebDAV later) and **sharpen it**: WebDAV is not merely a "nice later" — it is the *natural* transport for the two cases local-folder can't serve well (Chrome background writes; cross-machine without a third-party replicator). It still must come *after* the engine is stable.

---

## A. Executive Verdict

- **Does local Chrome ↔ Desktop sync make sense?** Yes — as the **foundation layer**, exactly as hypothesized. It forces the hard problems (canonical identity, conflict, delete) to be solved with zero network noise, preserves privacy/offline/zero-backend, and is trivially automatic for the highest-value onboarding case (Desktop installed next to Chrome on the same machine).
- **Worth doing before WebDAV?** Yes. Adding a network transport on top of an unstable canonical/conflict/delete model would multiply failure modes and tempt you to make a server authoritative (which kills local-first). Get the engine right over a folder first.
- **WebDAV better now or later?** **Later — as a transport adapter, never as source of truth.** It is the right answer for cross-machine and for Chrome background writes, but only once the local engine is release-grade.
- **Chrome light or full?** **Light companion.** Capture + basic organization + sync. The code already gates the heavy engine to Desktop; make it an explicit contract.
- **Desktop the canonical professional workspace?** **Yes.** Desktop/Tauri is the system of record and the home of the heavy engine (op-log, conflict review, backup, deep index, operator tools).

**Net: evolve, don't replace; ratify Chrome-light; WebDAV as a post-stability adapter.**

---

## B. Transport / Engine Comparison

Scale: ◎ strong · ○ adequate · △ weak · ✕ poor.

| Criterion | Local folder (now) | WebDAV (adapter) | Custom backend/cloud | Op-log local-first engine | **Hybrid (recommended)** |
|---|---|---|---|---|---|
| Complexity to build | ◎ low | ○ medium | ✕ high | △ high | ○ medium (phased) |
| User value (same machine) | ◎ | ○ | ○ | ◎ | ◎ |
| User value (cross machine) | △ (needs Dropbox/etc.) | ◎ | ◎ | ◎ | ◎ |
| Privacy / user-owned | ◎ | ○ (self-host ◎) | △ | ◎ | ◎ |
| Offline | ◎ | ○ | △ | ◎ | ◎ |
| Reliability | ○ (config drift, FSA gesture) | ○ (network/auth) | ○ | ◎ | ◎ |
| Debuggability | ◎ (plain JSON files) | ○ | △ | ○ | ◎ |
| Multi-device | △ | ◎ | ◎ | ◎ | ◎ |
| Browser/MV3 fit | △ (FSA gesture, SW lifecycle) | **◎ (fetch/PUT, no FS gesture)** | ◎ | n/a (engine, not transport) | ◎ |
| Release readiness today | ○ | ✕ | ✕ | △ (dormant) | ○ |
| Long-term scalability | △ | ○ | ◎ | ◎ | ◎ |

Key reading: **WebDAV is the one transport that fixes Chrome's structural weakness** (HTTP PUT needs no file-system gesture), while **local folder is the cheapest, most private, most debuggable foundation**. The op-log is an *engine* concern, orthogonal to transport. The mature design is the **hybrid**: one local-first engine, snapshot bundle as base + bounded op-log for deltas, transport adapters (folder now, WebDAV/relay later).

---

## C. Chrome Studio vs Desktop Studio — Product Contract

| Feature | Chrome role | Desktop role | Sync requirement | Reason |
|---|---|---|---|---|
| Quick save / add chat (capture) | **Primary** | Supported | Both ways (refs) | Capture happens where chats live (browser) |
| Basic library view | Full (read) | Full | Both ways (refs) | Lightweight, expected on both |
| Saved / linked chats | View + basic edit | Authoritative store | Both ways (refs, not full content) | Refs are small; content is heavy → Desktop-primary |
| Folder create / rename / color | **Full (companion)** | Full (canonical) | **Both ways** | Core organization; small metadata; already works post P1/P2 |
| Folder delete | Gesture-gated, request only | **Authority** | Deferred / Desktop-confirmed | Destructive; needs tombstone lifecycle (Phase 6) |
| Chat–folder bindings | Full | Full (canonical) | Both ways | Small, high-value organization data |
| Tags / categories | Basic | Full | Both ways (metadata) | Metadata light; bulk editing → Desktop |
| Bulk operations | ✕ (or tiny batches) | **Desktop-only** | n/a | Long-running; MV3 SW will die mid-job |
| Deep search / indexing | Shallow/in-memory | **Desktop-only** | Index Desktop-primary | Index is large; IndexedDB quota/eviction risk |
| Large archive management | View slice | **Desktop-only** | Desktop-primary | Heavy storage; not browser-suitable |
| Import / export | Basic bundle in/out | Full + scheduled | Engine-mediated | Desktop owns scheduled/auto export |
| Backup / restore | ✕ | **Desktop-only** | n/a | Filesystem + large data; native job |
| Diagnostics | **Sync Health only** | Full diagnostics | n/a | Chrome needs "is sync OK"; deep diag = Desktop |
| Conflict resolution | Auto-merge safe fields; surface only | **Review UI authority** | Engine | Reviewed-apply machinery is already Desktop-only |
| Sync health | **Yes (one-click)** | Yes | n/a | Both surfaces must show truthful sync state |
| Analytics / insights | Light/none | **Desktop-only** | Desktop-primary | Heavy compute over the archive |
| Heavy AI processing | ✕ | **Desktop-only** | n/a | Long-running; native resources |
| Release / evidence / operator tools | ✕ | **Desktop-only** | n/a | Already Tauri-gated; never ship to Chrome |

---

## D. Sync Data Contract

1. **Must sync both ways (small, high-value):** folder catalog (`folderId`, normalizedName, name, color/iconColor, order), chat↔folder bindings, category/tag *metadata*, saved/linked chat *references* (ids + light fields), folder/category appearance.
2. **Desktop-primary, visible (read-mostly) in Chrome:** full transcript content, large archive bodies, deep search index, insights/analytics, capture provenance.
3. **Chrome-local only:** capture staging buffers, ephemeral UI state, device-local view prefs, the FSA folder handle, transient import/export status.
4. **Desktop-only:** operation-log / relay outbox-inbox / convergence ledgers, backup snapshots, operator/release/evidence artifacts, heavy diagnostics, conflict-review state.
5. **Deferred / high-risk:** **deletes & tombstones**, bulk destructive ops, retention/purge. Do not auto-propagate destructive deletes until Phase 6; a delete must tombstone and **never destroy member chats** (they fall back to Unfiled).

---

## E. Browser-Suitable (keep in Chrome)

Quick capture/save; basic library browsing; folder create/rename/color + bindings; basic tags/categories; per-chat *decoration* features that run on an already-rendered chat (MiniMap, highlights, answer/question numbering, quote tracking, timestamps — these read the open page, not the archive); a **one-click Sync Health**; small bundle import/export; truthful permission/sync status. All are small-state, short-lived, gesture-friendly.

## F. Desktop-Only (keep native)

Large archive management; deep search/indexing; bulk operations; backup/restore; heavy diagnostics; conflict-review UI; the operation-log/relay/convergence engine; WebDAV/cloud transport hosting; delete/tombstone authority; analytics/insights; heavy AI processing; operator/release/evidence tools. All are large-data, long-running, or filesystem-heavy — and already Tauri-gated today.

---

## G. WebDAV Decision

- **Introduce now?** **No.**
- **When?** After the local engine is release-grade: one canonical store, one mutation contract, field/op-level conflict handling, delete/tombstone lifecycle, and a green two-way lifecycle matrix + Folder Sync Health (Phases 1–7 below). Concretely: **Phase 8.**
- **Transport adapter or core?** **Adapter only — never source of truth.** The canonical state stays local; WebDAV is one more way to move the same envelopes the folder transport moves. Self-hosted/Nextcloud WebDAV keeps the privacy story intact.
- **What the engine should look like first:** canonical Studio organization store → mutation contract → snapshot bundle as base + bounded op-log deltas → conflict (LWW + sourcePeer; reviewed-apply for structural) → tombstones → Folder Sync Health. Transport is a thin `put(envelope)/list()/get()` interface that folder-transport already implicitly satisfies.
- **Risks if added too early:** debugging network + auth + availability on top of an unstable canonical/conflict model; the gravitational pull to make the server authoritative (kills local-first); doubling the MV3 failure surface; masking that delete/identity/conflict aren't solved yet. WebDAV would *hide* engine bugs behind transport noise.

**Important nuance:** WebDAV is the proper fix for Chrome's FSA-gesture ceiling and for cross-machine sync without a third-party replicator — so it is genuinely valuable, just *sequenced last*.

---

## H. Recommended Architecture (plain terms)

- **Chrome Studio = light capture/organization companion.** Capture, browse, organize folders, basic tags, sync, and show Sync Health. No heavy storage, no long jobs, no engine internals.
- **Desktop Studio = canonical professional workspace.** System of record; hosts the heavy engine, conflict review, backup, deep index, operator tools.
- **Local-first sync core.** One canonical organization store (Studio-owned). Native ChatGPT is an **ingest adapter**, not the mutation authority for Studio organization.
- **Snapshot ⇄ op-log relationship.** Snapshot bundle = base/seed (full state, durable, debuggable). Bounded **op-log = deltas** for incremental edits (reuse the dormant `*-apply-event` + ledger scaffolding) so a color tweak doesn't ship the whole archive and conflicts resolve at field/op granularity.
- **Transport adapters behind one interface.** (1) local folder now (same-machine = automatic; cross-machine = works if the user already replicates the folder), (2) WebDAV later (cross-machine + Chrome background writes), (3) optional cloud/relay later. Same envelopes, same engine, swap the pipe.

---

## I. Implementation Roadmap

1. **Finish local mutation correctness** — generalize P1/P2 (confirm-before-toast, owned-write-wins, mutability gating) to create/rename/move/delete + bindings, both surfaces.
2. **Finish automatic local Chrome↔Desktop sync** — complete the Phase-3 repair: data-change-driven export, migrate stale `mode:"manual"` configs, field-level conflict classification, honest `permission-required`. Prove the same-machine matrix.
3. **Define Chrome/Desktop feature contract** — ratify §C as a written surface contract; gate accordingly.
4. **Define sync data contract** — ratify §D; enforce what Chrome may/may not store.
5. **Add Folder Sync Health diagnostic** — one-click, user-facing, truthful (last export/import, conflicts, permission, divergence). Ship early so 6–8 are observable.
6. **Add safe delete/tombstone lifecycle** — tombstone schema; member chats → Unfiled; Desktop delete authority; no destructive auto-propagation.
7. **Add operation-log deltas if needed** — light up the existing apply-event/ledger path for one entity class on top of the snapshot base; only if snapshot-only conflicts prove too coarse.
8. **Add WebDAV transport** — only after 1–7 are green; as an adapter, not source of truth.
9. **Packaged sync smoke test** — run the two-way matrix on built dist artifacts, not just base files (closes the "false-green on diagnostics" gap that caused the reopen).
10. **Public release packaging/signing** — only after 1–9.

---

## J. What to Avoid

- Making Chrome as heavy as Desktop (bulk ops, deep index, large archives in the extension).
- Using WebDAV (or any server) as the **source of truth** — keep it a transport.
- Adding remote sync before local **identity / conflict / delete** are stable.
- Hiding sync failures behind false success toasts (the original reopen cause) — Phase 1/2 already moved to confirm-before-toast; keep that everywhere.
- Syncing large indexes/full content into Chrome — sync refs + metadata, keep bodies Desktop-primary.
- Enabling destructive delete sync too early, or letting a folder delete destroy member chats.
- Letting the dormant op-log/relay/convergence machinery keep growing while switched off — consolidate-and-gate, decide its fate via ADR.
- Relying on focus/visibility as the *only* sync trigger; relying on Chrome background FS writes without acknowledging the gesture requirement.
- Treating same-machine and cross-machine as the same case — they have different transport realities.

---

## K. Final Recommendation (plainspoken)

**Evolve local-first sync; keep it first; make Chrome a light companion; bring WebDAV in last.**

Your hypothesis is right, and the repo already agrees with it more than you may realize: the heavy engine is Desktop-only today (62:5), so "Chrome light / Desktop full" is the path of least resistance, not a rewrite. Local-folder transport is the correct foundation because it makes you solve identity, conflict, and delete with no network to hide behind, and it is *instantly* automatic for the most important onboarding case — Desktop installed next to Chrome on one machine. Don't replace it.

But be honest about its two ceilings: Chrome can't write the sync folder in the background without a user gesture, and cross-machine "local" sync quietly requires the user to run Dropbox/iCloud/Syncthing. **WebDAV is the clean answer to both** — which is exactly why it should be a *first-class transport adapter*, just sequenced **after** the engine is release-grade, never as the source of truth.

**Next best architectural decision to document as an ADR — write two, in this order:**
1. **ADR-001: "Studio is the canonical owner of the organization layer; transports are pluggable adapters (folder now, WebDAV later, cloud optional); the canonical store is always local-first."** This locks the source-of-truth and prevents WebDAV-as-authority drift.
2. **ADR-002: "Chrome Studio is a companion surface — capability & sync-data contract."** This codifies §C and §D so Chrome never accretes Desktop weight and the sync payload stays small.

Get those two ADRs written before Phase 8, and the WebDAV question stops being a fork and becomes a scheduled adapter.
