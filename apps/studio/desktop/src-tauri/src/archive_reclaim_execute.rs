//! M06 T3.2 — generation reclamation execution under full preflight.
//!
//! DORMANT. No `#[tauri::command]`, nothing in either invoke-handler arm, no
//! renderer route and no UI. G02 remains the activation gate.
//!
//! This module decides WHICH trusted generation to act on and in what order it
//! becomes durable. It owns no filesystem destruction of its own: the atomic
//! quarantine rename, the receipt writes and the purge all belong to
//! `archive_reclaim`.
//!
//! The defining rule is ANTI-STALE. A Preview candidate list is never execution
//! authority. Execution acquires exclusive ownership FIRST and then recomputes
//! the package scan, the DB protections, the CAS inventory and the whole T2.2
//! plan underneath it, so a generation that Analyze called a candidate may be
//! protected by the time Execute runs — and is then left alone.
//!
//! Ordering is load-bearing and deliberately conservative:
//!
//! ```text
//! validate request → exclusive → registry empty → recompute → plan
//!   → run plan evidence DURABLE  ── before any canonical rename
//!   → per candidate:
//!       atomic non-replacing rename out of archive/packages
//!       → quarantine receipt DURABLE  ── before any purge
//!       → confined purge
//!       → purge receipt DURABLE
//! ```
//!
//! The first material failure stops further canonical renames. A crash between
//! a successful rename and its receipt leaves the item physically present in
//! quarantine with the canonical namespace already consistent, which is
//! recoverable; a purge before that receipt is durable would not be, so it
//! never happens.
//!
//! Scope: GENERATIONS ONLY. Staging residue, temp residue and occupant action
//! belong to later tasks and are untouched here. Canonical CAS is never
//! renamed, quarantined, purged or restored — Revision 2 removed destructive
//! CAS reclamation from M06 entirely, and `observed_unreferenced` is evidence,
//! never an instruction.

// DORMANT until G02: nothing in production calls this destructive authority
// yet, so the compiler correctly reports it as unused. The attribute records
// that dormancy deliberately rather than leaving build noise; it is removed
// when the activation task wires a caller.
#![allow(dead_code)]

use crate::archive_db_probe::DbProbeResult;
use crate::archive_reclaim::{
    purge_quarantined_item, quarantine_generation, QuarantineComponent, QuarantineKind,
    QuarantineRunId, QuarantineTarget,
};
use crate::archive_reclamation_preview::PreviewRequest;
use crate::archive_retention_plan::{Decision, ReclamationPlan, RetentionInputs};

pub const RUN_SCHEMA: &str = "h2o.m06.reclamationRun";
pub const RUN_SCHEMA_VERSION: u32 = 1;

pub mod codes {
    pub const EXCLUSIVE_UNAVAILABLE: &str = "execute-exclusive-unavailable";
    pub const PUBLISHER_SESSIONS_ACTIVE: &str = "execute-publisher-sessions-active";
    pub const PLAN_NOT_AUTHORITATIVE: &str = "execute-plan-not-authoritative";
    pub const RUN_ID_UNAVAILABLE: &str = "execute-run-id-unavailable";
    pub const EVIDENCE_FAILED: &str = "execute-evidence-failed";
    pub const QUARANTINE_FAILED: &str = "execute-quarantine-failed";
    pub const QUARANTINE_COLLISION: &str = "execute-quarantine-collision";
    pub const PURGE_FAILED: &str = "execute-purge-failed";
    pub const PACKAGES_UNAVAILABLE: &str = "execute-packages-unavailable";
    pub const ARCHIVE_UNAVAILABLE: &str = "execute-archive-unavailable";
}

#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RunState {
    /// Refused before ANY mutation.
    Refused,
    /// Preconditions held; the fresh plan had nothing to act on. No mutation.
    NoOp,
    /// Every recomputed candidate was quarantined and purged.
    Complete,
    /// A material failure stopped the run. Some work may have completed.
    Partial,
}

/// What actually happened to one generation. Evidence only — no chat content,
/// no absolute host path.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ActedItem {
    /// Trusted archive-relative canonical identity, from T2.1/T2.2.
    pub canonical_path: String,
    pub chat_id: String,
    pub content_hash: String,
    pub saved_at: String,
    pub quarantined: bool,
    pub purged: bool,
    pub blocker: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct RunOutcome {
    pub schema: &'static str,
    pub schema_version: u32,
    /// Present only once a run namespace was actually created.
    pub run_id: Option<String>,
    pub state: RunState,
    pub retention_floor: usize,
    pub blockers: Vec<String>,
    /// Deterministic: ordered by trusted canonical identity.
    pub acted: Vec<ActedItem>,
    pub quarantined: usize,
    pub purged: usize,
}

impl RunOutcome {
    fn refused(code: &str) -> Self {
        RunOutcome {
            schema: RUN_SCHEMA,
            schema_version: RUN_SCHEMA_VERSION,
            run_id: None,
            state: RunState::Refused,
            retention_floor: crate::archive_retention_plan::RETENTION_FLOOR_K,
            blockers: vec![code.to_string()],
            acted: vec![],
            quarantined: 0,
            purged: 0,
        }
    }
}

/// A trusted-side run identity.
///
/// 128 bits from `getentropy(2)` — the OS CSPRNG, and the same primitive the
/// publisher already uses for its session seed. Deliberately WITHOUT that
/// function's weak pid⊕nanos fallback: a run id must be collision resistant, so
/// entropy failure fails closed rather than degrading silently.
///
/// A run id is namespace and evidence identity ONLY. No wall clock is involved
/// and nothing derives deletion authority from its ordering. The caller cannot
/// supply one.
fn generate_run_id() -> Result<QuarantineRunId, String> {
    let mut buf = [0u8; 16];
    let rc = unsafe { libc::getentropy(buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
    if rc != 0 {
        return Err(codes::RUN_ID_UNAVAILABLE.to_string());
    }
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    QuarantineRunId::parse(&hex).map_err(|_| codes::RUN_ID_UNAVAILABLE.to_string())
}

/// The freshly recomputed generations this run may act on, in deterministic
/// order. Derived ONLY from `Decision::Candidate` entries of a plan computed
/// under exclusive ownership.
struct FreshCandidate {
    canonical_path: String,
    name: String,
    chat_id: String,
    content_hash: String,
    saved_at: String,
}

fn fresh_candidates(plan: &ReclamationPlan) -> Vec<FreshCandidate> {
    let mut out: Vec<FreshCandidate> = plan
        .decisions
        .iter()
        .filter_map(|d| match &d.decision {
            Decision::Candidate { evidence } => Some(FreshCandidate {
                canonical_path: d.path.clone(),
                name: d.name.clone(),
                chat_id: d.chat_id.clone(),
                content_hash: d.content_hash.clone(),
                saved_at: evidence.saved_at.clone(),
            }),
            _ => None,
        })
        .collect();
    out.sort_by(|a, b| a.canonical_path.cmp(&b.canonical_path));
    out
}

/// The durable pre-mutation record. Written and fsynced BEFORE the first
/// canonical rename; if it cannot be persisted, nothing is renamed.
fn plan_evidence(run: &QuarantineRunId, plan: &ReclamationPlan, candidates: &[FreshCandidate]) -> Vec<u8> {
    let value = serde_json::json!({
        "schema": RUN_SCHEMA,
        "schemaVersion": RUN_SCHEMA_VERSION,
        "runId": run.component(),
        "stage": "generation-reclamation",
        "retentionFloor": plan.retention_floor,
        "planComplete": plan.complete,
        "planBlockers": plan.blockers,
        "sources": {
            "chatsInScope": plan.totals.chats_in_scope,
            "occupants": plan.totals.occupants,
            "protected": plan.totals.protected,
            "candidates": plan.totals.candidates,
            "referencedCasObjects": plan.totals.referenced_cas_objects,
        },
        "candidates": candidates
            .iter()
            .map(|c| serde_json::json!({
                "canonicalPath": c.canonical_path,
                "chatId": c.chat_id,
                "contentHash": c.content_hash,
                "savedAt": c.saved_at,
            }))
            .collect::<Vec<_>>(),
    });
    serde_json::to_vec(&value).unwrap_or_default()
}

fn item_evidence(run: &QuarantineRunId, item: &ActedItem, action: &str) -> Vec<u8> {
    let value = serde_json::json!({
        "schema": RUN_SCHEMA,
        "schemaVersion": RUN_SCHEMA_VERSION,
        "runId": run.component(),
        "kind": "generation",
        "action": action,
        "canonicalPath": item.canonical_path,
        "chatId": item.chat_id,
        "contentHash": item.content_hash,
        "savedAt": item.saved_at,
        "quarantined": item.quarantined,
        "purged": item.purged,
        "blocker": item.blocker,
    });
    serde_json::to_vec(&value).unwrap_or_default()
}

/// PRODUCTION entry point.
///
/// Acquires exclusive ownership, samples the publisher registry and derives the
/// canonical archive root itself, then recomputes every trusted fact inside the
/// destructive sequence. The ONLY caller-controlled input is the same bounded
/// enabling-only request Preview accepts: no scan, no probe result, no CAS
/// inventory, no plan, no candidate list, no path and no run id can be handed
/// in.
///
/// DORMANT: no command routes here.
pub(crate) async fn execute_generation_reclamation(
    app: &tauri::AppHandle,
    request: &PreviewRequest,
) -> RunOutcome {
    use tauri::Manager;

    let archive_root = match crate::archive_durable_write::archive_root(app) {
        Ok(root) => root,
        Err(_) => return RunOutcome::refused(codes::ARCHIVE_UNAVAILABLE),
    };
    let Some(lock) = app.try_state::<crate::archive_instance_lock::ArchiveInstanceState>() else {
        return RunOutcome::refused(codes::EXCLUSIVE_UNAVAILABLE);
    };
    // NON-BLOCKING acquisition, held for the whole window below.
    let Ok(exclusive) = lock.try_acquire_exclusive() else {
        return RunOutcome::refused(codes::EXCLUSIVE_UNAVAILABLE);
    };

    // Sampled AFTER exclusive ownership, so it cannot change underneath us.
    let sessions_empty = match app.try_state::<crate::archive_generation_publish::PublisherState>() {
        Some(state) => {
            let guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
            guard.as_ref().map(|p| p.sessions_empty()).unwrap_or(true)
        }
        None => true,
    };

    // The DB probe is the one trusted fact that needs the app handle; it is
    // taken here, still under exclusive ownership, and handed to the private
    // sequence. No production caller outside this module can supply it.
    let db = crate::archive_db_probe::probe_protection_facts(app).await;

    let outcome = run_internal(&exclusive, &archive_root, sessions_empty, request, &db);
    let _ = exclusive.release();
    outcome
}

/// The destructive sequence. PRIVATE: production reaches it only through the
/// wrapper above, so `db` cannot be forged by a caller, and the package scan
/// and CAS inventory are recomputed HERE rather than accepted.
fn run_internal(
    exclusive: &crate::archive_instance_lock::ExclusiveOwnership<'_>,
    archive_root: &std::path::Path,
    publisher_sessions_empty: bool,
    request: &PreviewRequest,
    db: &DbProbeResult,
) -> RunOutcome {
    // Same bounded enabling-only discipline Preview uses — reused, not restated.
    let (projections, scope) =
        match crate::archive_reclamation_preview::admit_request(request) {
            Ok(parts) => parts,
            Err(code) => return RunOutcome::refused(&code),
        };

    // Hard precondition: no publication session may be in flight. Checked
    // BEFORE any recomputation so a refusal costs nothing and, critically,
    // before any namespace or evidence could be created.
    if !publisher_sessions_empty {
        return RunOutcome::refused(codes::PUBLISHER_SESSIONS_ACTIVE);
    }

    // ── RECOMPUTED HERE, under exclusive ownership ───────────────────────────
    // Not accepted from a caller: a previous Preview's scan or plan is never
    // execution authority, and a stale candidate must be able to come back
    // Protected.
    let scan = crate::archive_package_scan::scan_packages_within(archive_root);
    let cas = crate::archive_cas_scan::scan_cas_within(archive_root);

    // Recomputed UNDER exclusive ownership. The caller already gathered these
    // after acquiring it; nothing from a previous Preview is consulted.
    let plan = crate::archive_retention_plan::plan(&RetentionInputs {
        scan: &scan,
        db,
        projections,
        scope,
        cas: &cas,
    });

    // An incomplete plan is never destructive authority. This subsumes the
    // package-scan and DB-probe preconditions, which the engine already turns
    // into plan blockers.
    if !plan.complete {
        let mut refused = RunOutcome::refused(codes::PLAN_NOT_AUTHORITATIVE);
        refused.blockers.extend(plan.blockers.iter().cloned());
        refused.blockers.sort();
        refused.blockers.dedup();
        return refused;
    }

    let candidates = fresh_candidates(&plan);
    if candidates.is_empty() {
        // Truthful no-op: no reclaim namespace, no run directory, no receipt.
        return RunOutcome {
            schema: RUN_SCHEMA,
            schema_version: RUN_SCHEMA_VERSION,
            run_id: None,
            state: RunState::NoOp,
            retention_floor: plan.retention_floor,
            blockers: vec![],
            acted: vec![],
            quarantined: 0,
            purged: 0,
        };
    }

    let run_id = match generate_run_id() {
        Ok(id) => id,
        Err(code) => return RunOutcome::refused(&code),
    };

    let reclaim = match crate::archive_reclaim::open_reclaim_root_for_run(exclusive, archive_root) {
        Ok(root) => root,
        Err(code) => return RunOutcome::refused(&code),
    };
    let receipts = match reclaim.receipts_dir(exclusive) {
        Ok(dir) => dir,
        Err(code) => return RunOutcome::refused(&code),
    };

    // ── Plan evidence DURABLE before the first canonical rename ──────────────
    let plan_name = match QuarantineComponent::parse(&format!("{}.plan.json", run_id.component())) {
        Ok(name) => name,
        Err(code) => return RunOutcome::refused(&code),
    };
    let plan_written = if fault::armed(fault::Point::BeforePlanDurability) {
        Err(codes::EVIDENCE_FAILED.to_string())
    } else {
        receipts.write_durable(exclusive, &plan_name, &plan_evidence(&run_id, &plan, &candidates))
    };
    if let Err(code) = plan_written {
        // Includes a receipt collision: refused BEFORE any mutation.
        let mut refused = RunOutcome::refused(codes::EVIDENCE_FAILED);
        refused.blockers.push(code);
        refused.blockers.sort();
        return refused;
    }
    trace::record(trace::Event::PlanDurable);
    pause::wait_if_armed();
    if fault::armed(fault::Point::AfterPlanDurableBeforeRename) {
        // The evidence is durable but the run stops before touching anything
        // canonical. Nothing has left archive/packages.
        let mut refused = RunOutcome::refused(codes::EVIDENCE_FAILED);
        refused.run_id = Some(run_id.component().to_string());
        return refused;
    }

    let run_dir = match reclaim.create_run(exclusive, &run_id) {
        Ok(dir) => dir,
        Err(code) => return RunOutcome::refused(&code),
    };
    let packages = match crate::archive_reclaim::open_packages_dir(exclusive, archive_root) {
        Ok(dir) => dir,
        Err(_) => return RunOutcome::refused(codes::PACKAGES_UNAVAILABLE),
    };

    let mut outcome = RunOutcome {
        schema: RUN_SCHEMA,
        schema_version: RUN_SCHEMA_VERSION,
        run_id: Some(run_id.component().to_string()),
        state: RunState::Complete,
        retention_floor: plan.retention_floor,
        blockers: vec![],
        acted: vec![],
        quarantined: 0,
        purged: 0,
    };

    for candidate in &candidates {
        let mut acted = ActedItem {
            canonical_path: candidate.canonical_path.clone(),
            chat_id: candidate.chat_id.clone(),
            content_hash: candidate.content_hash.clone(),
            saved_at: candidate.saved_at.clone(),
            quarantined: false,
            purged: false,
            blocker: None,
        };
        // The source is derived from the TRUSTED generation identity; no caller
        // filename and no renderer input reaches this.
        let (source, item) = match (
            QuarantineComponent::parse(&candidate.name),
            QuarantineComponent::parse(&candidate.name),
        ) {
            (Ok(a), Ok(b)) => (a, b),
            _ => {
                acted.blocker = Some(codes::QUARANTINE_FAILED.to_string());
                outcome.acted.push(acted);
                outcome.state = RunState::Partial;
                break;
            }
        };

        // ── ONE bounded canonical mutation ───────────────────────────────────
        trace::record(trace::Event::FirstRename);
        match quarantine_generation(exclusive, &packages, &run_dir, &source, &item) {
            Ok(true) => acted.quarantined = true,
            Ok(false) => {
                acted.blocker = Some(codes::QUARANTINE_COLLISION.to_string());
                outcome.acted.push(acted);
                outcome.blockers.push(codes::QUARANTINE_COLLISION.to_string());
                outcome.state = RunState::Partial;
                break;
            }
            Err(code) => {
                acted.blocker = Some(code.clone());
                outcome.acted.push(acted);
                outcome.blockers.push(codes::QUARANTINE_FAILED.to_string());
                outcome.state = RunState::Partial;
                break;
            }
        }
        outcome.quarantined += 1;

        // ── The namespace transition must be DURABLE before anything claims it
        //    happened, and before the item is purged. Atomic is not durable.
        let namespace_durable = if fault::armed(fault::Point::AfterRenameBeforeNamespaceDurability) {
            Err(crate::archive_reclaim::codes::QUARANTINE_NOT_DURABLE.to_string())
        } else {
            crate::archive_reclaim::durable_quarantine_transition(exclusive, &packages, &run_dir)
        };
        if let Err(code) = namespace_durable {
            // The rename result is captured as observed. No purge, no later
            // candidate, no rollback: renaming it back would conceal a failure
            // whose durability we cannot vouch for either.
            acted.blocker = Some(code);
            outcome.acted.push(acted);
            outcome.blockers.push(crate::archive_reclaim::codes::QUARANTINE_NOT_DURABLE.to_string());
            outcome.state = RunState::Partial;
            break;
        }
        trace::record(trace::Event::QuarantineNamespaceDurable);

        // ── Quarantine receipt DURABLE before any purge ──────────────────────
        let qname = QuarantineComponent::parse(&format!(
            "{}.{}.quarantined.json",
            run_id.component(),
            candidate.content_hash
        ));
        let durable = if fault::armed(fault::Point::AfterRenameBeforeQuarantineReceipt) {
            // The exact crash window: the canonical rename SUCCEEDED and the
            // receipt for it does not become durable.
            Err(codes::EVIDENCE_FAILED.to_string())
        } else {
            match qname {
                Ok(name) => receipts.write_durable(
                    exclusive,
                    &name,
                    &item_evidence(&run_id, &acted, "quarantined"),
                ),
                Err(code) => Err(code),
            }
        };
        if let Err(code) = durable {
            // The item stays in quarantine, unpurged and recoverable.
            acted.blocker = Some(code);
            outcome.acted.push(acted);
            outcome.blockers.push(codes::EVIDENCE_FAILED.to_string());
            outcome.state = RunState::Partial;
            break;
        }
        trace::record(trace::Event::QuarantineReceiptDurable);

        // ── Same-run purge, through the T3.1 confined primitive only ─────────
        let bare_id = run_id.component().trim_start_matches("run-").to_string();
        let target = match QuarantineTarget::parse(
            &bare_id,
            item.as_str(),
            QuarantineKind::Generation,
        ) {
            Ok(target) => target,
            Err(code) => {
                acted.blocker = Some(code);
                outcome.acted.push(acted);
                outcome.state = RunState::Partial;
                break;
            }
        };
        if fault::armed(fault::Point::AfterQuarantineReceiptBeforePurge) {
            // Receipt durable, purge never attempted: the item stays contained.
            outcome.acted.push(acted);
            outcome.blockers.push(codes::PURGE_FAILED.to_string());
            outcome.state = RunState::Partial;
            break;
        }
        trace::record(trace::Event::Purge);
        let mut purge = purge_quarantined_item(exclusive, &reclaim, &target);
        if fault::armed(fault::Point::PurgeFails) {
            purge.converged = false;
            purge.blockers.push(crate::archive_reclaim::codes::PURGE_FAILED.to_string());
        }
        if purge.converged {
            acted.purged = true;
            outcome.purged += 1;
        } else {
            // Logical deletion already happened; the canonical package is NOT
            // restored. The physical residue stays contained for recovery.
            acted.blocker = Some(codes::PURGE_FAILED.to_string());
            outcome.blockers.extend(purge.blockers.iter().cloned());
            outcome.acted.push(acted);
            outcome.blockers.push(codes::PURGE_FAILED.to_string());
            outcome.state = RunState::Partial;
            break;
        }

        let pname = QuarantineComponent::parse(&format!(
            "{}.{}.purged.json",
            run_id.component(),
            candidate.content_hash
        ));
        let durable = if fault::armed(fault::Point::AfterPurgeBeforePurgeReceipt) {
            Err(codes::EVIDENCE_FAILED.to_string())
        } else {
            match pname {
                Ok(name) => receipts.write_durable(
                    exclusive,
                    &name,
                    &item_evidence(&run_id, &acted, "purged"),
                ),
                Err(code) => Err(code),
            }
        };
        if let Err(code) = durable {
            acted.blocker = Some(code);
            outcome.acted.push(acted);
            outcome.blockers.push(codes::EVIDENCE_FAILED.to_string());
            outcome.state = RunState::Partial;
            break;
        }
        trace::record(trace::Event::PurgeReceiptDurable);
        outcome.acted.push(acted);
    }

    outcome.blockers.sort();
    outcome.blockers.dedup();
    outcome
}

/// Deterministic fault injection for the destructive ordering proofs.
///
/// TEST-ONLY. In a release build `armed` is a `const false`, so every call site
/// folds away and the production path is byte-for-byte the real one: there is
/// no environment variable, no runtime flag and no production switch.
pub(crate) mod fault {
    /// Exactly the points where a crash would be dangerous if the ordering were
    /// wrong.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Point {
        BeforePlanDurability,
        AfterPlanDurableBeforeRename,
        AfterRenameBeforeNamespaceDurability,
        AfterRenameBeforeQuarantineReceipt,
        AfterQuarantineReceiptBeforePurge,
        /// A deterministic mid-run pause point, used to prove that no other
        /// process can obtain archive participation while the run holds
        /// exclusive ownership.
        PauseAfterPlanDurable,
        /// Forces the confined purge to report failure, so the "stop after a
        /// material purge failure" rule is provable deterministically.
        PurgeFails,
        AfterPurgeBeforePurgeReceipt,
    }

    #[cfg(test)]
    thread_local! {
        static ARMED: std::cell::RefCell<Option<Point>> =
            const { std::cell::RefCell::new(None) };
    }

    #[cfg(test)]
    pub fn arm(point: Point) {
        ARMED.with(|a| *a.borrow_mut() = Some(point));
    }

    #[cfg(test)]
    pub fn clear() {
        ARMED.with(|a| *a.borrow_mut() = None);
    }

    #[cfg(test)]
    pub(super) fn armed(point: Point) -> bool {
        ARMED.with(|a| *a.borrow() == Some(point))
    }

    #[cfg(not(test))]
    pub(super) const fn armed(_point: Point) -> bool {
        false
    }
}

/// A deterministic mid-run pause, so a test can hold the run INSIDE its
/// exclusive window while a real second process tries to participate.
///
/// TEST-ONLY: in a release build `wait_if_armed` is an empty inlined function
/// with no state, no timer and no switch.
pub(crate) mod pause {
    #[cfg(test)]
    pub(crate) static GATE: std::sync::Mutex<Option<std::sync::mpsc::Receiver<()>>> =
        std::sync::Mutex::new(None);

    #[cfg(test)]
    pub(crate) static REACHED: std::sync::Mutex<Option<std::sync::mpsc::Sender<()>>> =
        std::sync::Mutex::new(None);

    /// Arms one pause and returns (notify-when-reached, release-handle).
    #[cfg(test)]
    pub(crate) fn arm() -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
        let (reached_tx, reached_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        *REACHED.lock().unwrap() = Some(reached_tx);
        *GATE.lock().unwrap() = Some(release_rx);
        (reached_rx, release_tx)
    }

    #[cfg(test)]
    pub(crate) fn clear() {
        *REACHED.lock().unwrap() = None;
        *GATE.lock().unwrap() = None;
    }

    #[cfg(test)]
    pub(super) fn wait_if_armed() {
        let reached = REACHED.lock().unwrap().take();
        let gate = GATE.lock().unwrap().take();
        if let (Some(tx), Some(rx)) = (reached, gate) {
            let _ = tx.send(());
            let _ = rx.recv();
        }
    }

    #[cfg(not(test))]
    #[inline(always)]
    pub(super) fn wait_if_armed() {}
}

/// Test-only ordering trace. Compiled out of production entirely, so the
/// shipped path records nothing.
pub(crate) mod trace {
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Event {
        PlanDurable,
        FirstRename,
        QuarantineNamespaceDurable,
        QuarantineReceiptDurable,
        Purge,
        PurgeReceiptDurable,
    }

    #[cfg(test)]
    thread_local! {
        static EVENTS: std::cell::RefCell<Vec<Event>> = const { std::cell::RefCell::new(Vec::new()) };
    }

    #[cfg(test)]
    pub fn record(event: Event) {
        EVENTS.with(|e| e.borrow_mut().push(event));
    }

    #[cfg(not(test))]
    pub fn record(_event: Event) {}

    #[cfg(test)]
    pub fn reset() {
        EVENTS.with(|e| e.borrow_mut().clear());
    }

    #[cfg(test)]
    pub fn taken() -> Vec<Event> {
        EVENTS.with(|e| e.borrow().clone())
    }
}

#[cfg(test)]
mod tests;
