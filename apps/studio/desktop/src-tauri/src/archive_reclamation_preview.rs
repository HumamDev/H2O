//! M06 T2.3 — READ-ONLY reclamation Preview / Analyze command.
//!
//! Exposes the already-committed trusted engine through one narrowly bounded
//! renderer-facing command. It answers *what would M06 currently protect, what
//! would it classify as a generation candidate, what blocks that judgement, and
//! what does read-only CAS analysis observe* — and it cannot answer
//! *"reclaim these"*, because no path here removes, renames, quarantines,
//! purges or persists anything.
//!
//! It ORCHESTRATES; it implements no authority of its own:
//!
//! * T2.1 `archive_package_scan` — enumeration, verification, classification;
//! * T1.4 `archive_db_probe` — trusted DB protection roots (this is that
//!   probe's first production consumer);
//! * T2.2 `archive_cas_scan` — canonical CAS bodies, read-only;
//! * T2.2 `archive_retention_plan` — the retention decision, including the
//!   projection-witness rule and the K=3 floor.
//!
//! No contentHash, projection, ordering, verification or enumeration logic is
//! reimplemented here, and the renderer's projection facts are passed straight
//! into T2.2 rather than pre-authorized: the on-disk witness requirement still
//! decides whether they enable anything.
//!
//! Determinism is load-bearing (G2 owns preview-idempotence). The result
//! carries no wall clock, no generatedAt, no random identifier and no
//! filesystem timestamp, so two previews over identical state are identical.
//! The contract requires no plan fingerprint, so none is invented; receipts are
//! required only "before or while destructive actions occur", so none is
//! defined or written here.

use std::collections::{BTreeMap, BTreeSet};

use crate::archive_retention_plan::{
    plan, ProjectionVerdict, ReclamationPlan, RetentionInputs,
};

/// Preview envelope identity, so T2.4 and later guarded execution can version
/// what they consume.
pub const PREVIEW_SCHEMA: &str = "h2o.m06.reclamationPreview";
pub const PREVIEW_SCHEMA_VERSION: u32 = 1;

/// Bound on renderer-supplied collections.
///
/// No bound is specified by the M06 contract, so this adopts the value the
/// repository already uses for renderer-supplied collections of this shape
/// (`MAX_INGEST_PLANS`, `MAX_CANDIDATE_IDS`). It is far above any realistic
/// saved-chat count while keeping a hostile payload from becoming an unbounded
/// allocation surface. An over-bound request is REFUSED, never truncated:
/// silently dropping projection facts would change which chats fail closed.
pub const MAX_PREVIEW_INPUTS: usize = 10_000;

pub mod codes {
    /// More renderer inputs than the bound allows.
    pub const REQUEST_TOO_LARGE: &str = "preview-request-too-large";
    /// The same chat appeared twice, which would make the result order-dependent.
    pub const DUPLICATE_CHAT: &str = "preview-request-duplicate-chat";
    /// A chat identity was empty.
    pub const EMPTY_CHAT_ID: &str = "preview-request-empty-chat-id";
    /// The canonical archive root could not be derived.
    pub const ARCHIVE_ROOT_UNAVAILABLE: &str = "preview-archive-root-unavailable";
}

/// One renderer projection verdict, in the shape the current producer emits:
/// a `status` plus a `contentHash` that is only populated when the projection
/// is authoritative.
#[derive(serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectionInput {
    pub chat_id: String,
    pub status: String,
    #[serde(default)]
    pub content_hash: String,
}

/// The ENTIRE renderer request. Deliberately minimal: there is no archive root,
/// package path, CAS path, database path, candidate path, delete target,
/// retention floor, force flag or trusted classification here, so none of those
/// can be supplied.
#[derive(serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    /// Enabling-only chat scope. Absent means every chat.
    #[serde(default)]
    pub chat_scope: Option<Vec<String>>,
    /// Per-chat projection verdicts. Enabling-only, and still subject to the
    /// trusted on-disk witness rule inside T2.2.
    #[serde(default)]
    pub projections: Vec<ProjectionInput>,
}

/// Completeness of each trusted source, surfaced separately so a consumer can
/// see WHICH authority was incomplete.
///
/// Generation-plan completeness and CAS-analysis completeness are related but
/// not identical, and T2.2's semantics are preserved exactly: an incomplete CAS
/// inventory does not by itself erase an otherwise authoritative generation
/// plan.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct SourceStates {
    pub package_scan_complete: bool,
    pub package_scan_blockers: Vec<String>,
    pub db_probe_complete: bool,
    pub db_probe_blockers: Vec<String>,
    pub cas_inventory_complete: bool,
    pub cas_inventory_blockers: Vec<String>,
}

/// The read-only Preview envelope.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct PreviewResult {
    pub schema: &'static str,
    pub schema_version: u32,
    pub sources: SourceStates,
    /// The T2.2 plan verbatim: decisions, protections, candidate evidence,
    /// totals, blockers and read-only CAS analysis.
    pub plan: ReclamationPlan,
}

/// Validates the renderer request and converts it into T2.2's enabling-only
/// inputs. Refuses rather than truncating, and refuses duplicates so no
/// ordering of the payload can change the outcome.
pub(crate) fn admit_request(
    request: &PreviewRequest,
) -> Result<(BTreeMap<String, ProjectionVerdict>, Option<BTreeSet<String>>), String> {
    if request.projections.len() > MAX_PREVIEW_INPUTS {
        return Err(codes::REQUEST_TOO_LARGE.to_string());
    }
    let mut projections: BTreeMap<String, ProjectionVerdict> = BTreeMap::new();
    for input in &request.projections {
        let chat_id = input.chat_id.trim().to_string();
        if chat_id.is_empty() {
            return Err(codes::EMPTY_CHAT_ID.to_string());
        }
        if projections.contains_key(&chat_id) {
            return Err(codes::DUPLICATE_CHAT.to_string());
        }
        // The verdict is built by T2.2's own rule; this layer never decides
        // whether a projection is authoritative.
        projections.insert(
            chat_id,
            ProjectionVerdict::from_renderer(&input.status, &input.content_hash),
        );
    }

    let scope = match &request.chat_scope {
        None => None,
        Some(list) => {
            if list.len() > MAX_PREVIEW_INPUTS {
                return Err(codes::REQUEST_TOO_LARGE.to_string());
            }
            let mut set: BTreeSet<String> = BTreeSet::new();
            for chat_id in list {
                let chat_id = chat_id.trim().to_string();
                if chat_id.is_empty() {
                    return Err(codes::EMPTY_CHAT_ID.to_string());
                }
                if !set.insert(chat_id) {
                    return Err(codes::DUPLICATE_CHAT.to_string());
                }
            }
            Some(set)
        }
    };
    Ok((projections, scope))
}

/// The orchestration seam: everything the command does once its trusted inputs
/// have been gathered. Separated so behaviour is provable against disposable
/// fixtures without a Tauri app and without touching any real database.
pub fn preview_from_parts(
    scan: &crate::archive_package_scan::PackageScan,
    db: &crate::archive_db_probe::DbProbeResult,
    cas: &crate::archive_cas_scan::CasInventory,
    request: &PreviewRequest,
) -> Result<PreviewResult, String> {
    let (projections, scope) = admit_request(request)?;
    let plan = plan(&RetentionInputs {
        scan,
        db,
        projections,
        scope,
        cas,
    });
    Ok(PreviewResult {
        schema: PREVIEW_SCHEMA,
        schema_version: PREVIEW_SCHEMA_VERSION,
        sources: SourceStates {
            package_scan_complete: scan.complete,
            package_scan_blockers: scan.blockers.clone(),
            db_probe_complete: db.complete,
            db_probe_blockers: db.blockers.clone(),
            cas_inventory_complete: cas.complete,
            cas_inventory_blockers: cas.blockers.clone(),
        },
        plan,
    })
}

/// READ-ONLY Preview / Analyze.
///
/// Registering this before G02 is correct: G02 gates DESTRUCTIVE authority, and
/// this command has none. The renderer supplies no path of any kind; the
/// canonical archive root is derived internally, once, and shared by the
/// package and CAS scans so both observe the same archive.
///
/// Domain-level incompleteness is reported INSIDE the envelope as blockers, not
/// as a command failure — an `Err` here means no trustworthy envelope could be
/// formed at all.
#[tauri::command]
pub async fn h2o_archive_reclamation_preview(
    app: tauri::AppHandle,
    request: PreviewRequest,
) -> Result<PreviewResult, String> {
    // One canonical root authority for both trusted scans.
    let root = crate::archive_durable_write::archive_root(&app)
        .map_err(|_| codes::ARCHIVE_ROOT_UNAVAILABLE.to_string())?;

    let scan = crate::archive_package_scan::scan_packages_within(&root);
    let cas = crate::archive_cas_scan::scan_cas_within(&root);
    // T1.4's trusted read-only probe, borrowing the application's existing
    // pool. No connection is opened, no database created, no migration run.
    let db = crate::archive_db_probe::probe_protection_facts(&app).await;

    preview_from_parts(&scan, &db, &cas, &request)
}

#[cfg(test)]
mod tests;
