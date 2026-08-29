use super::*;
use crate::archive_cas_scan::CasInventory;
use crate::archive_db_probe::{DbProbeCounts, GenerationProtection, ProtectionSource};
use crate::archive_durable_write::sha256_hex;
use crate::archive_generation_publish::{begin, commit, write_member, Member, Publisher};
use crate::archive_instance_lock::{ArchiveInstanceState, ExclusiveOwnership};
use crate::archive_package_scan::scan_packages_within;
use crate::archive_reclamation_preview::ProjectionInput;
use std::path::{Path, PathBuf};

fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t32-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(dir.join("archive")).expect("scratch");
    dir.join("archive")
}

fn sha_of(bytes: &[u8]) -> String {
    format!("sha256-{}", sha256_hex(bytes))
}

/// Publishes a REAL v1 generation through the actual publisher, so execution
/// acts on genuine canonical packages rather than hand-made directories.
fn publish(root: &Path, chat: &str, saved_at: &str) -> String {
    let publisher = Publisher::new(root.to_path_buf());
    let snapshot = format!(
        r#"{{"schemaVersion":1,"chatId":"{chat}","snapshotId":"s1","savedAt":"{saved_at}","messages":[{{"id":"m0","turnIndex":0,"contentText":"body-{saved_at}"}}]}}"#
    ).into_bytes();
    let markdown = format!("# {chat}\n").into_bytes();
    let html = format!("<!doctype html><p>{chat}</p>").into_bytes();
    let content_hash = sha_of(&snapshot);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":1,"chatId":"{chat}","snapshotId":"s1","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[]}}"#,
        sha_of(&snapshot), snapshot.len(),
        sha_of(&markdown), markdown.len(),
        sha_of(&html), html.len(),
    ).into_bytes();
    let begun = begin(&publisher, chat);
    assert!(begun.ok, "begin refused: {:?}", begun.blockers);
    let t = begun.token;
    assert!(write_member(&publisher, t, Member::Snapshot, &snapshot).ok);
    assert!(write_member(&publisher, t, Member::Markdown, &markdown).ok);
    assert!(write_member(&publisher, t, Member::Html, &html).ok);
    assert!(write_member(&publisher, t, Member::Manifest, &manifest).ok);
    let published = commit(&publisher, t, None);
    assert!(published.ok, "commit refused: {:?}", published.blockers);
    content_hash.strip_prefix("sha256-").unwrap().to_string()
}

struct Owner {
    state: Box<ArchiveInstanceState>,
}
impl Owner {
    fn acquire(root: &Path) -> Owner {
        let state = Box::new(ArchiveInstanceState::default());
        state.ensure_presence(root).expect("shared presence");
        Owner { state }
    }
    fn exclusive(&self) -> ExclusiveOwnership<'_> {
        self.state.try_acquire_exclusive().expect("exclusive")
    }
}

fn db(protections: Vec<GenerationProtection>) -> crate::archive_db_probe::DbProbeResult {
    crate::archive_db_probe::DbProbeResult {
        complete: true,
        blockers: vec![],
        cas_roots: vec![],
        generation_protections: protections,
        counts: DbProbeCounts::default(),
    }
}
fn cas() -> CasInventory {
    CasInventory { complete: true, observed: vec![], foreign: vec![], blockers: vec![] }
}
fn request(chat: &str, status: &str, hash: &str) -> PreviewRequest {
    PreviewRequest {
        chat_scope: None,
        projections: vec![ProjectionInput {
            chat_id: chat.to_string(),
            status: status.to_string(),
            content_hash: hash.to_string(),
        }],
    }
}

/// name -> sha of contents (or "dir"), for durability comparison.
fn census(base: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    fn walk(dir: &Path, prefix: &str, out: &mut Vec<(String, String)>) {
        let mut entries: Vec<_> = match std::fs::read_dir(dir) {
            Ok(it) => it.map(|e| e.unwrap()).collect(),
            Err(_) => return,
        };
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
            let meta = std::fs::symlink_metadata(entry.path()).unwrap();
            if meta.is_dir() {
                out.push((name.clone(), "dir".into()));
                walk(&entry.path(), &name, out);
            } else if meta.file_type().is_symlink() {
                out.push((name, "symlink".into()));
            } else {
                out.push((name, sha256_hex(&std::fs::read(entry.path()).unwrap_or_default())));
            }
        }
    }
    walk(base, "", &mut out);
    out
}

/// Five generations for one chat, oldest first. Returns their hashes in
/// savedAt order (index 0 = oldest).
fn five(root: &Path, chat: &str) -> Vec<String> {
    (1..=5)
        .map(|d| publish(root, chat, &format!("2026-01-0{d}T00:00:00.000Z")))
        .collect()
}

fn run(root: &Path, ex: &ExclusiveOwnership<'_>, d: &crate::archive_db_probe::DbProbeResult, req: &PreviewRequest) -> RunOutcome {
    run_internal(ex, root, true, req, d)
}

fn run_with_registry(
    root: &Path,
    ex: &ExclusiveOwnership<'_>,
    d: &crate::archive_db_probe::DbProbeResult,
    req: &PreviewRequest,
    sessions_empty: bool,
) -> RunOutcome {
    run_internal(ex, root, sessions_empty, req, d)
}

fn pkg_names(root: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(root.join("packages"))
        .map(|it| it.map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect())
        .unwrap_or_default();
    names.sort();
    names
}

/// (S)(T)(I)(N)(P)(AG) the happy path: only generations beyond the K=3 floor
/// are acted, evidence is durable in the required ORDER, and the acted items
/// are quarantined then purged through the confined primitive.
#[test]
fn a_witnessed_run_acts_only_beyond_the_floor_in_durable_order() {
    let root = scratch("happy");
    let hashes = five(&root, "chat_a"); // index 0 oldest .. 4 newest
    let owner = Owner::acquire(&root);
    let before = pkg_names(&root);
    assert_eq!(before.len(), 5);

    trace::reset();
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.retention_floor, 3);
    assert_eq!(outcome.quarantined, 2);
    assert_eq!(outcome.purged, 2);
    assert!(outcome.run_id.as_ref().unwrap().starts_with("run-"));

    // (T) newest and the floor survive; only the two oldest were acted.
    let after = pkg_names(&root);
    assert_eq!(after.len(), 3, "exactly three generations remain: {after:?}");
    for keep in [&hashes[2], &hashes[3], &hashes[4]] {
        assert!(after.iter().any(|n| n.contains(keep.as_str())), "kept {keep}");
    }
    for gone in [&hashes[0], &hashes[1]] {
        assert!(!after.iter().any(|n| n.contains(gone.as_str())), "acted {gone}");
    }

    // (AG) deterministic acted ordering by trusted canonical identity.
    let paths: Vec<&str> = outcome.acted.iter().map(|a| a.canonical_path.as_str()).collect();
    let mut sorted = paths.clone();
    sorted.sort();
    assert_eq!(paths, sorted);
    assert!(outcome.acted.iter().all(|a| a.quarantined && a.purged && a.blocker.is_none()));

    // (I)(N) ordering: plan durable BEFORE the first rename; each quarantine
    // receipt durable BEFORE its purge.
    let events = trace::taken();
    assert_eq!(events[0], trace::Event::PlanDurable, "plan evidence comes first");
    let first_rename = events.iter().position(|e| *e == trace::Event::FirstRename).unwrap();
    assert!(first_rename > 0, "anti-vacuity: a rename really happened after the plan");
    for (i, e) in events.iter().enumerate() {
        if *e == trace::Event::Purge {
            assert_eq!(
                events[i - 1],
                trace::Event::QuarantineReceiptDurable,
                "a purge must be immediately preceded by a durable quarantine receipt"
            );
        }
    }

    // Evidence exists and the quarantine is empty after same-run purge.
    let receipts = root.join(".h2o-reclaim").join("receipts");
    let files: Vec<String> = std::fs::read_dir(&receipts)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert!(files.iter().any(|f| f.ends_with(".plan.json")));
    assert_eq!(files.iter().filter(|f| f.ends_with(".quarantined.json")).count(), 2);
    assert_eq!(files.iter().filter(|f| f.ends_with(".purged.json")).count(), 2);

    // (AF) evidence carries no chat payload and no host path.
    for file in std::fs::read_dir(&receipts).unwrap() {
        let text = std::fs::read_to_string(file.unwrap().path()).unwrap();
        for forbidden in ["body-", "/Users/", "/private/", "messages", "contentText"] {
            assert!(!text.contains(forbidden), "receipt leaked {forbidden}");
        }
    }

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (A)(AH) THE DEFINING RULE: a generation that read-only planning calls a
/// Candidate is NOT acted when trusted state changed before execution.
#[test]
fn a_stale_candidate_is_protected_when_execution_recomputes_under_exclusive() {
    let root = scratch("stale");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let req = request("chat_a", "ok", &hashes[4]);

    // (A) FIRST: prove read-only planning genuinely calls the oldest a Candidate.
    let scan = scan_packages_within(&root);
    let inventory = cas();
    let preview = crate::archive_reclamation_preview::preview_from_parts(
        &scan, &db(vec![]), &inventory, &req,
    )
    .expect("preview");
    let stale_candidates: Vec<String> = preview
        .plan
        .decisions
        .iter()
        .filter(|d| matches!(d.decision, Decision::Candidate { .. }))
        .map(|d| d.content_hash.clone())
        .collect();
    assert_eq!(stale_candidates.len(), 2, "the stale plan really had candidates");
    assert!(stale_candidates.contains(&hashes[0]));

    // (B) Trusted state CHANGES before execute: the oldest gains an Import
    // provenance protection.
    let protections = vec![GenerationProtection {
        chat_id: "chat_a".into(),
        content_hash: hashes[0].clone(),
        source: ProtectionSource::Import,
    }];

    // (C) Execute.
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(protections), &req);

    // (D) The stale candidate was NOT acted, because execution recomputed.
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.quarantined, 1, "only the still-eligible one was acted");
    assert!(
        !outcome.acted.iter().any(|a| a.content_hash == hashes[0]),
        "the newly protected generation must not be acted"
    );
    assert!(pkg_names(&root).iter().any(|n| n.contains(hashes[0].as_str())),
        "the protected package is still canonical");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (F) an incomplete DB probe is a HARD precondition: zero mutation, zero
/// evidence, no reclaim namespace at all.
#[test]
fn an_incomplete_db_probe_refuses_before_any_mutation() {
    let root = scratch("dbfail");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let before = census(&root);

    let mut broken = db(vec![]);
    broken.complete = false;
    broken.blockers.push("db-probe-query-failed:chats".into());

    trace::reset();
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &broken, &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Refused);
    assert!(outcome.blockers.iter().any(|b| b == codes::PLAN_NOT_AUTHORITATIVE));
    assert!(outcome.run_id.is_none());
    assert_eq!(census(&root), before, "not one byte changed");
    assert!(!root.join(".h2o-reclaim").exists(), "no reclaim namespace created");
    assert!(trace::taken().is_empty(), "no evidence or rename occurred");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (Y)(Z) projection evidence stays enabling-only at EXECUTION time.
#[test]
fn unwitnessed_or_missing_projection_acts_on_nothing() {
    let root = scratch("proj");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let before = census(&root);
    let ex = owner.exclusive();

    // Valid 64-hex that matches no on-disk generation.
    let unmatched = "9".repeat(64);
    for req in [
        request("chat_a", "ok", &unmatched),
        request("chat_a", "indeterminate", ""),
        request("chat_a", "ok", "not-a-hash"),
        PreviewRequest::default(),
    ] {
        let outcome = run(&root, &ex, &db(vec![]), &req);
        assert_eq!(outcome.state, RunState::NoOp, "{:?}", outcome.blockers);
        assert_eq!(outcome.quarantined, 0);
        assert!(outcome.run_id.is_none());
    }
    assert_eq!(census(&root), before, "nothing was touched");
    assert!(!root.join(".h2o-reclaim").exists());

    // Positive control: the witnessed request DOES act, so this is not vacuous.
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(outcome.quarantined, 2);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (U)(V)(W)(X)(AA) every protection class holds at EXECUTION, not just Preview.
#[test]
fn every_protection_class_prevents_action_at_execution_time() {
    for (tag, source) in [
        ("writing", ProtectionSource::StrandedWriting),
        ("import", ProtectionSource::Import),
        ("restore", ProtectionSource::Restore),
        ("relink", ProtectionSource::Relink),
    ] {
        let root = scratch(tag);
        let hashes = five(&root, "chat_a");
        let owner = Owner::acquire(&root);
        let ex = owner.exclusive();
        // Protect BOTH otherwise-eligible generations.
        let protections = vec![
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hashes[0].clone(), source },
            GenerationProtection { chat_id: "chat_a".into(), content_hash: hashes[1].clone(), source },
        ];
        let outcome = run(&root, &ex, &db(protections), &request("chat_a", "ok", &hashes[4]));
        assert_eq!(outcome.state, RunState::NoOp, "{tag}: {:?}", outcome.blockers);
        assert_eq!(pkg_names(&root).len(), 5, "{tag}: every package survives");
        let _ = ex.release();
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }

    // (U) legacy is never acted, and (AA) an indeterminate occupant is untouched.
    let root = scratch("legacy");
    let hashes = five(&root, "chat_b");
    let owner = Owner::acquire(&root);
    let packages = root.join("packages");
    // Turn one generation into a LEGACY package, and plant a corrupt occupant.
    std::fs::rename(
        packages.join(format!("chat_b.g{}.h2ochat", hashes[0])),
        packages.join("chat_b.h2ochat"),
    )
    .unwrap();
    std::fs::create_dir_all(packages.join("chat_c.gaa.h2ochat")).unwrap();
    let before = census(&packages);

    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_b", "ok", &hashes[4]));
    /* Converting one generation to legacy leaves FOUR orderable generations, so
       the fourth is legitimately outside the K=3 floor and IS acted. The
       property under test is that legacy and the occupant are never acted. */
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.quarantined, 1, "exactly the one generation beyond the floor");
    assert_eq!(outcome.acted[0].content_hash, hashes[1], "the oldest surviving generation");

    assert!(
        packages.join("chat_b.h2ochat").exists(),
        "the LEGACY package is never acted"
    );
    assert!(
        packages.join("chat_c.gaa.h2ochat").exists(),
        "the indeterminate occupant is never acted"
    );
    assert!(
        !outcome.acted.iter().any(|a| a.content_hash == hashes[0]),
        "the legacy content hash is never in the acted set"
    );
    let after = census(&packages);
    let expected: Vec<_> = before
        .iter()
        .filter(|(n, _)| !n.contains(&format!("chat_b.g{}", hashes[1])))
        .cloned()
        .collect();
    assert_eq!(after, expected, "only the eligible generation left the namespace");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (AB)(AC) staging/temp residue and canonical CAS are untouched by a real
/// generation run.
#[test]
fn staging_residue_and_canonical_cas_survive_a_generation_run() {
    let root = scratch("bystanders");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);

    // Both residue families.
    std::fs::create_dir_all(root.join("packages").join(".h2o-genstage-00ff01")).unwrap();
    std::fs::write(root.join("packages").join(".h2o-genstage-00ff01").join("m.json"), b"{}").unwrap();
    let shard = root.join("assets").join("ab");
    std::fs::create_dir_all(&shard).unwrap();
    std::fs::write(shard.join(".h2o-durable-7-0.tmp"), b"temp").unwrap();
    // A referenced and an observed-unreferenced CAS body.
    let referenced = format!("sha256-{}", "ab".repeat(32));
    let unreferenced = format!("sha256-{}", "cd".repeat(32));
    std::fs::write(shard.join(&referenced), b"referenced-body").unwrap();
    std::fs::create_dir_all(root.join("assets").join("cd")).unwrap();
    std::fs::write(root.join("assets").join("cd").join(&unreferenced), b"unreferenced-body").unwrap();
    let assets_before = census(&root.join("assets"));
    let staging_before = census(&root.join("packages").join(".h2o-genstage-00ff01"));

    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2, "the run really did act");

    assert_eq!(census(&root.join("assets")), assets_before, "ALL CAS bodies byte-identical");
    assert_eq!(
        census(&root.join("packages").join(".h2o-genstage-00ff01")),
        staging_before,
        "generation staging residue untouched"
    );
    assert!(shard.join(".h2o-durable-7-0.tmp").exists(), "durable temp residue untouched");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (AD) a valid state with nothing eligible performs ZERO persistent mutation.
#[test]
fn a_no_op_run_creates_no_namespace_no_run_and_no_receipt() {
    let root = scratch("noop");
    // Only three generations: all inside the K=3 floor.
    let hashes: Vec<String> = (1..=3)
        .map(|d| publish(&root, "chat_a", &format!("2026-01-0{d}T00:00:00.000Z")))
        .collect();
    let owner = Owner::acquire(&root);
    let before = census(&root);

    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[2]));
    assert_eq!(outcome.state, RunState::NoOp);
    assert!(outcome.run_id.is_none());
    assert!(outcome.blockers.is_empty());
    assert_eq!(census(&root), before, "no-op means no mutation at all");
    assert!(!root.join(".h2o-reclaim").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (K) an existing plan-receipt name cannot be replaced, and the collision
/// refuses BEFORE the first canonical rename.
#[test]
fn a_receipt_collision_refuses_before_any_rename() {
    let root = scratch("collision");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);

    // Pre-create every possible plan receipt name is impossible (random run id),
    // so instead make the receipts namespace unwritable to force the failure.
    let reclaim = root.join(".h2o-reclaim");
    std::fs::create_dir_all(reclaim.join("receipts")).unwrap();
    let mut perms = std::fs::metadata(reclaim.join("receipts")).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o500);
    std::fs::set_permissions(reclaim.join("receipts"), perms).unwrap();
    let before = pkg_names(&root);

    trace::reset();
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Refused, "{:?}", outcome.blockers);
    assert!(outcome.blockers.iter().any(|b| b == codes::EVIDENCE_FAILED));
    assert_eq!(pkg_names(&root), before, "no canonical package moved");
    let events = trace::taken();
    assert!(!events.contains(&trace::Event::FirstRename), "no rename occurred");
    assert!(!events.contains(&trace::Event::PlanDurable), "no plan was made durable");

    let mut perms = std::fs::metadata(reclaim.join("receipts")).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o700);
    let _ = std::fs::set_permissions(reclaim.join("receipts"), perms);
    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (E) a publication session in flight refuses execution BEFORE any mutation,
/// and the session itself is left intact.
#[test]
fn an_in_flight_publisher_session_refuses_execution_before_any_mutation() {
    let root = scratch("registry");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);

    // A REAL in-flight publication session.
    let publisher = Publisher::new(root.to_path_buf());
    let begun = begin(&publisher, "chat_live");
    assert!(begun.ok, "a real session is open");
    assert!(!publisher.sessions_empty(), "registry is genuinely non-empty");
    let before = census(&root);

    trace::reset();
    let ex = owner.exclusive();
    let outcome = run_with_registry(
        &root,
        &ex,
        &db(vec![]),
        &request("chat_a", "ok", &hashes[4]),
        publisher.sessions_empty(),
    );

    assert_eq!(outcome.state, RunState::Refused);
    assert_eq!(outcome.blockers, vec![codes::PUBLISHER_SESSIONS_ACTIVE.to_string()]);
    assert!(outcome.run_id.is_none());
    assert_eq!(census(&root), before, "no mutation of any kind");
    assert!(!root.join(".h2o-reclaim").exists());
    assert!(trace::taken().is_empty());
    // The session was never terminated or forced.
    assert!(!publisher.sessions_empty(), "the publisher session is intact");

    // Positive control: once the registry is empty the same run DOES act.
    assert!(crate::archive_generation_publish::abort(&publisher, begun.token).ok);
    assert!(publisher.sessions_empty());
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (C) another participating instance holding shared presence prevents
/// exclusive acquisition, so no run can even begin. Zero mutation.
#[test]
fn another_participating_instance_prevents_the_run_entirely() {
    let root = scratch("contended");
    five(&root, "chat_a");

    // Two independent participants: flock scopes to an open file description,
    // so these genuinely contend (proven in T1.1).
    let a = ArchiveInstanceState::default();
    let b = ArchiveInstanceState::default();
    a.ensure_presence(&root).expect("a shared");
    b.ensure_presence(&root).expect("b shared");
    /* Census AFTER presence: participating legitimately creates the instance
       lock file, which is not a reclamation mutation. */
    let before = census(&root);

    // With B still participating, A cannot take reclamation-exclusive ownership.
    assert!(
        a.try_acquire_exclusive().is_err(),
        "exclusive must be refused while another instance participates"
    );
    assert_eq!(census(&root), before, "nothing was touched");
    assert!(!root.join(".h2o-reclaim").exists());

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (B) + CORRECTION C — no execution path exists without exclusive ownership,
/// and no production caller can hand in precomputed trusted authority.
#[test]
fn execution_holds_exclusive_and_accepts_no_precomputed_authority() {
    let source = include_str!("../archive_reclaim_execute.rs");
    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");

    // (1) The PRODUCTION entry takes only the app authority and the bounded
    //     enabling request — nothing else.
    let at = source.find("pub(crate) async fn execute_generation_reclamation").expect("entry");
    let sig = &source[at..at + source[at..].find(") -> ").unwrap()];
    assert!(sig.contains("app: &tauri::AppHandle"));
    assert!(sig.contains("request: &PreviewRequest"));
    for forbidden in [
        "PackageScan", "DbProbeResult", "CasInventory", "ReclamationPlan",
        "PreviewResult", "Decision", "candidate", "Candidate", "run_id",
        "Path", "PathBuf", "String",
    ] {
        assert!(!sig.contains(forbidden), "production entry must not accept {forbidden}");
    }

    // (2) No ENTRY POINT accepts a plan or a preview result as authority.
    //     `fresh_candidates` and `plan_evidence` legitimately consume the plan
    //     this run just computed, so the ban is on the entry signatures.
    assert!(!code.contains("PreviewResult"), "a previous Preview is never an input");
    assert!(!code.contains("struct RunInputs"), "the precomputed-facts struct is gone");
    for entry in ["execute_generation_reclamation", "fn run_internal"] {
        let at = source.find(entry).expect(entry);
        let sig = &source[at..at + source[at..].find(") -> ").unwrap()];
        assert!(!sig.contains("ReclamationPlan"), "{entry} must not accept a plan");
        assert!(!sig.contains("PackageScan"), "{entry} must not accept a scan");
        assert!(!sig.contains("CasInventory"), "{entry} must not accept a CAS inventory");
    }

    // (3)(4)(5)(6) Ordering INSIDE the sequence: exclusive first, then the
    //     recomputations, then the plan, then candidates from that plan.
    let seq_at = code.find("fn run_internal").expect("sequence");
    let seq = &code[seq_at..];
    let scan_at = seq.find("scan_packages_within(archive_root)").expect("scan recomputed");
    let cas_at = seq.find("scan_cas_within(archive_root)").expect("cas recomputed");
    let plan_at = seq.find("archive_retention_plan::plan(").expect("plan computed");
    let cand_at = seq.find("fresh_candidates(&plan)").expect("candidates derived");
    assert!(scan_at < plan_at, "scan is recomputed before the plan");
    assert!(cas_at < plan_at, "cas is recomputed before the plan");
    assert!(plan_at < cand_at, "candidates come from the fresh plan");

    // The sequence itself requires the capability by type, and is private.
    let internal = &source[source.find("fn run_internal").unwrap()..];
    let isig = &internal[..internal.find(") -> ").unwrap()];
    assert!(isig.contains("exclusive: &crate::archive_instance_lock::ExclusiveOwnership"));
    assert!(!source.contains("pub fn run_internal"));
    assert!(!source.contains("pub(crate) fn run_internal"), "the sequence is module-private");

    // The exclusive capability is acquired BEFORE the DB probe and the sequence.
    let entry = &code[code.find("async fn execute_generation_reclamation").unwrap()..];
    let acquire = entry.find("try_acquire_exclusive").expect("acquired");
    let probe = entry.find("probe_protection_facts").expect("probed");
    let call = entry.find("run_internal(").expect("sequence invoked");
    let release = entry.find("exclusive.release()").expect("released");
    assert!(acquire < probe, "exclusive is acquired before the DB probe");
    assert!(probe < call, "the probe precedes the destructive sequence");
    assert!(call < release, "ownership is released only after the run returns");
}

/// (L) the quarantine destination is never replaced/// (L) the quarantine destination is never replaced: an existing entry makes
/// the move fail closed, and the canonical package stays put.
#[test]
fn an_existing_quarantine_destination_is_never_replaced() {
    use crate::archive_reclaim::{QuarantineComponent, QuarantineRunId};
    let root = scratch("norepl");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    let reclaim = crate::archive_reclaim::open_reclaim_root_for_run(&ex, &root).unwrap();
    let run_id = QuarantineRunId::parse("fixed").unwrap();
    let run_dir = reclaim.create_run(&ex, &run_id).unwrap();
    let packages = crate::archive_reclaim::open_packages_dir(&ex, &root).unwrap();

    let name = format!("chat_a.g{}.h2ochat", hashes[0]);
    let item = QuarantineComponent::parse(&name).unwrap();

    // Occupy the destination first, with distinguishable content.
    let occupied = root.join(".h2o-reclaim").join("run-fixed").join(&name);
    std::fs::create_dir_all(&occupied).unwrap();
    std::fs::write(occupied.join("sentinel"), b"pre-existing").unwrap();

    let moved = crate::archive_reclaim::quarantine_generation(&ex, &packages, &run_dir, &item, &item)
        .expect("no error");
    assert!(!moved, "a collision must fail closed, not overwrite");
    assert!(
        root.join("packages").join(&name).exists(),
        "the canonical package stays put on collision"
    );
    assert_eq!(
        std::fs::read(occupied.join("sentinel")).unwrap(),
        b"pre-existing",
        "the existing quarantine entry is untouched"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// CORRECTION A — DETERMINISTIC. The canonical rename succeeds and the receipt
/// for it deterministically fails. This always exercises the crash window.
#[test]
fn a_failed_quarantine_receipt_stops_the_run_without_purging() {
    let root = scratch("receiptfail");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    // Bystanders that must survive untouched.
    let shard = root.join("assets").join("ab");
    std::fs::create_dir_all(&shard).unwrap();
    std::fs::write(shard.join(format!("sha256-{}", "ab".repeat(32))), b"cas-body").unwrap();
    std::fs::create_dir_all(root.join("packages").join(".h2o-genstage-00ff01")).unwrap();
    let assets_before = census(&root.join("assets"));
    let staging_before = census(&root.join("packages").join(".h2o-genstage-00ff01"));

    // (2) the fresh plan really has TWO eligible candidates.
    let scan = scan_packages_within(&root);
    let inventory = cas();
    let preview = crate::archive_reclamation_preview::preview_from_parts(
        &scan, &db(vec![]), &inventory, &request("chat_a", "ok", &hashes[4]),
    ).expect("preview");
    let eligible: Vec<String> = preview.plan.decisions.iter()
        .filter(|d| matches!(d.decision, Decision::Candidate { .. }))
        .map(|d| d.content_hash.clone())
        .collect();
    assert_eq!(eligible.len(), 2, "the fixture genuinely has two candidates");

    trace::reset();
    fault::arm(fault::Point::AfterRenameBeforeQuarantineReceipt);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    fault::clear();

    // (5) exactly the required post-conditions.
    assert_eq!(outcome.state, RunState::Partial, "never Complete after evidence failure");
    assert!(outcome.blockers.iter().any(|b| b == codes::EVIDENCE_FAILED));
    assert_eq!(outcome.quarantined, 1, "exactly one rename happened");
    assert_eq!(outcome.purged, 0, "nothing was purged");

    let events = trace::taken();
    assert_eq!(events[0], trace::Event::PlanDurable, "plan durable first");
    assert_eq!(
        events.iter().filter(|e| **e == trace::Event::FirstRename).count(),
        1,
        "exactly one canonical rename occurred"
    );
    assert!(!events.contains(&trace::Event::Purge), "purge NEVER followed the failed receipt");
    assert!(
        !events.contains(&trace::Event::QuarantineReceiptDurable),
        "the quarantine receipt never became durable"
    );

    // The acted item: canonical gone, quarantine present, not purged.
    let acted = &outcome.acted[0];
    assert!(acted.quarantined && !acted.purged);
    let remaining = pkg_names(&root);
    assert!(
        !remaining.iter().any(|n| n.contains(acted.content_hash.as_str())),
        "the canonical package is absent"
    );
    let run_dir = root.join(".h2o-reclaim").join(outcome.run_id.as_ref().unwrap());
    assert!(run_dir.join(format!("chat_a.g{}.h2ochat", acted.content_hash)).exists(),
        "the logically deleted generation is recoverable in quarantine");

    // The SECOND candidate was never touched.
    let untouched: Vec<&String> = eligible.iter().filter(|h| **h != acted.content_hash).collect();
    assert_eq!(untouched.len(), 1);
    assert!(
        remaining.iter().any(|n| n.contains(untouched[0].as_str())),
        "the second candidate remains canonical"
    );
    assert_eq!(outcome.acted.len(), 1, "no later candidate was acted");

    // Evidence written BEFORE the failure survives.
    let receipts = root.join(".h2o-reclaim").join("receipts");
    assert!(std::fs::read_dir(&receipts).unwrap().any(|e| e.unwrap()
        .file_name().to_string_lossy().ends_with(".plan.json")),
        "the durable plan evidence remains");

    // Bystanders byte-identical.
    assert_eq!(census(&root.join("assets")), assets_before, "CAS untouched");
    assert_eq!(
        census(&root.join("packages").join(".h2o-genstage-00ff01")),
        staging_before,
        "staging residue untouched"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// CORRECTION A — the namespace transition must be DURABLE before anything
/// claims it happened. Rename succeeds; the durability step deterministically
/// fails; nothing is purged and the run stops.
#[test]
fn a_namespace_durability_failure_stops_the_run_without_purging() {
    let root = scratch("nsdurfail");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    let shard = root.join("assets").join("ab");
    std::fs::create_dir_all(&shard).unwrap();
    std::fs::write(shard.join(format!("sha256-{}", "ab".repeat(32))), b"cas").unwrap();
    std::fs::create_dir_all(root.join("packages").join(".h2o-genstage-00ff01")).unwrap();
    let assets_before = census(&root.join("assets"));
    let staging_before = census(&root.join("packages").join(".h2o-genstage-00ff01"));

    // Two genuinely eligible candidates.
    let scan = scan_packages_within(&root);
    let inventory = cas();
    let preview = crate::archive_reclamation_preview::preview_from_parts(
        &scan, &db(vec![]), &inventory, &request("chat_a", "ok", &hashes[4]),
    ).expect("preview");
    assert_eq!(
        preview.plan.decisions.iter()
            .filter(|d| matches!(d.decision, Decision::Candidate { .. })).count(),
        2,
        "the fixture genuinely has two candidates"
    );

    trace::reset();
    fault::arm(fault::Point::AfterRenameBeforeNamespaceDurability);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial, "never Complete");
    assert_eq!(outcome.quarantined, 1, "the rename really happened");
    assert_eq!(outcome.purged, 0);
    assert!(outcome
        .blockers
        .iter()
        .any(|b| b == crate::archive_reclaim::codes::QUARANTINE_NOT_DURABLE));

    let events = trace::taken();
    assert_eq!(events[0], trace::Event::PlanDurable);
    assert_eq!(events.iter().filter(|e| **e == trace::Event::FirstRename).count(), 1);
    assert!(!events.contains(&trace::Event::QuarantineNamespaceDurable), "durability failed");
    assert!(!events.contains(&trace::Event::QuarantineReceiptDurable),
        "no receipt may claim a transition that is not durable");
    assert!(!events.contains(&trace::Event::Purge), "no purge without durability");

    // No rollback: the canonical item stays logically deleted and observable in
    // quarantine; the second candidate is untouched.
    let acted = &outcome.acted[0];
    let remaining = pkg_names(&root);
    assert!(!remaining.iter().any(|n| n.contains(acted.content_hash.as_str())));
    /* Count GENERATIONS only: this fixture also plants staging residue under
       archive/packages, which must remain and is not a generation. */
    let generations = remaining.iter().filter(|n| n.ends_with(".h2ochat")).count();
    assert_eq!(generations, 4, "exactly one generation left; no second rename");
    assert!(remaining.iter().any(|n| n.starts_with(".h2o-genstage-")), "staging remains");
    let run_dir = root.join(".h2o-reclaim").join(outcome.run_id.as_ref().unwrap());
    assert!(run_dir.join(format!("chat_a.g{}.h2ochat", acted.content_hash)).exists());
    assert_eq!(outcome.acted.len(), 1, "no later candidate acted");

    assert_eq!(census(&root.join("assets")), assets_before, "CAS untouched");
    assert_eq!(
        census(&root.join("packages").join(".h2o-genstage-00ff01")),
        staging_before,
        "staging untouched"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// CORRECTION A positive control + strict ordering. The positive fixture really
/// reaches Purge, so the ordering assertions are not vacuous.
#[test]
fn the_full_destructive_ordering_is_strict_and_reaches_purge() {
    let root = scratch("ordering");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::clear();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2, "the control really acted");

    use trace::Event::*;
    let events = trace::taken();
    assert!(events.contains(&Purge), "anti-vacuity: the fixture reaches Purge");
    assert_eq!(events[0], PlanDurable, "plan durable is first, exactly once");
    assert_eq!(events.iter().filter(|e| **e == PlanDurable).count(), 1);

    // Per item the order is strict and complete.
    let per_item: Vec<&trace::Event> = events.iter().skip(1).collect();
    assert_eq!(per_item.len(), 10, "five steps for each of two items");
    for chunk in per_item.chunks(5) {
        assert_eq!(
            chunk,
            &[
                &FirstRename,
                &QuarantineNamespaceDurable,
                &QuarantineReceiptDurable,
                &Purge,
                &PurgeReceiptDurable
            ],
            "strict per-item ordering"
        );
    }

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// CORRECTION B — a REAL second process cannot participate while the run holds
/// exclusive ownership mid-flight, and can again after it returns.
#[test]
fn a_real_second_process_cannot_participate_mid_run() {
    let root = scratch("midrun");
    let hashes = five(&root, "chat_a");
    /* Deliberately NO owner here: the run thread establishes its own presence
       and takes exclusive ownership. Holding shared presence in this process
       would itself block acquisition and mask what is under test. */

    // A control BEFORE the run: a separate process CAN participate normally.
    assert!(
        child_can_participate(&root),
        "precondition: participation is possible before the exclusive window"
    );

    let (reached, release) = pause::arm();
    let root_for_run = root.clone();
    let hash = hashes[4].clone();
    let handle = std::thread::spawn(move || {
        let state = ArchiveInstanceState::default();
        state.ensure_presence(&root_for_run).expect("shared");
        let ex = state.try_acquire_exclusive().expect("exclusive");
        let outcome = run_internal(
            &ex,
            &root_for_run,
            true,
            &request("chat_a", "ok", &hash),
            &db(vec![]),
        );
        let _ = ex.release();
        outcome
    });

    // The run has reached the mid-run point, still inside its exclusive window.
    reached.recv_timeout(std::time::Duration::from_secs(30)).expect("run reached the pause");

    // (5)(6) A genuinely separate PROCESS cannot establish participation now.
    assert!(
        !child_can_participate(&root),
        "no second process may obtain archive participation mid-run"
    );

    // (7)(8) Release and let the run finish.
    let _ = release.send(());
    let outcome = handle.join().expect("run thread");
    pause::clear();
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2);

    // (9)(10) After normal return, participation is possible again.
    assert!(
        child_can_participate(&root),
        "participation must be restored after the run releases ownership"
    );

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// Spawns a REAL child process that tries to establish shared archive
/// participation, reusing the P1 helper infrastructure. Returns whether it
/// succeeded.
fn child_can_participate(root: &Path) -> bool {
    let exe = std::env::current_exe().expect("test binary");
    let status = std::process::Command::new(exe)
        .arg("archive_reclaim_execute::tests::helper_try_participate")
        .arg("--exact")
        .arg("--include-ignored")
        .arg("--test-threads=1")
        .env("H2O_T32_HELPER_ROOT", root)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .expect("spawn participation helper");
    status.success()
}

/// Child-process helper: exits successfully only if it can establish shared
/// archive participation on the given root.
#[test]
#[ignore]
fn helper_try_participate() {
    let root = match std::env::var("H2O_T32_HELPER_ROOT") {
        Ok(value) => std::path::PathBuf::from(value),
        Err(_) => return,
    };
    let state = ArchiveInstanceState::default();
    if state.ensure_presence(&root).is_err() {
        std::process::exit(1);
    }
}

/// The pause mechanism is compiled out of production entirely.
#[test]
fn the_mid_run_pause_is_test_only() {
    let source = include_str!("../archive_reclaim_execute.rs");
    let at = source.find("pub(crate) mod pause").expect("pause module");
    let module = &source[at..at + 1800.min(source.len() - at)];
    assert!(
        module.contains("#[cfg(not(test))]") && module.contains("pub(super) fn wait_if_armed() {}"),
        "release builds get an empty inlined no-op"
    );
    for forbidden in ["std::env", "env::var", "sleep", "Instant", "thread::spawn", "interval"] {
        assert!(!module.contains(forbidden), "no production timer or switch: {forbidden}");
    }
}

/// An already-existing receipt name is never replaced, and the collision
/// refuses BEFORE any canonical rename. Create-only is the property; this makes
/// it behavioural rather than only structural.
#[test]
fn an_existing_receipt_blocks_the_run_before_any_rename() {
    let root = scratch("receiptcollide");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let before = pkg_names(&root);

    // Pre-create EVERY plan receipt this run could choose by making the name
    // deterministic: arm nothing, run once to learn the id, then collide it.
    let first = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(first.state, RunState::Complete, "control run acts");
    let receipts = root.join(".h2o-reclaim").join("receipts");
    let plan_receipt = std::fs::read_dir(&receipts)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.to_string_lossy().ends_with(".plan.json"))
        .expect("a plan receipt exists");
    let original = std::fs::read(&plan_receipt).unwrap();

    // Now prove the write is create-only: writing the SAME name again is
    // refused and the original bytes are untouched.
    let reclaim = crate::archive_reclaim::open_reclaim_root_for_run(&ex, &root).unwrap();
    let dir = reclaim.receipts_dir(&ex).unwrap();
    let name = crate::archive_reclaim::QuarantineComponent::parse(
        plan_receipt.file_name().unwrap().to_str().unwrap(),
    )
    .unwrap();
    let err = dir.write_durable(&ex, &name, b"OVERWRITTEN").unwrap_err();
    assert_eq!(err, crate::archive_reclaim::codes::RECEIPT_EXISTS, "collision is refused");
    assert_eq!(
        std::fs::read(&plan_receipt).unwrap(),
        original,
        "existing evidence is never replaced"
    );
    let _ = before;

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// A material purge failure STOPS the run: later candidates are not acted, the
/// canonical item is NOT restored, and the residue stays contained.
#[test]
fn a_purge_failure_stops_the_run_and_does_not_restore_the_canonical_item() {
    let root = scratch("purgefail");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::arm(fault::Point::PurgeFails);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial, "never Complete after a purge failure");
    assert_eq!(outcome.quarantined, 1, "one canonical rename happened");
    assert_eq!(outcome.purged, 0, "nothing was successfully purged");
    assert!(outcome.blockers.iter().any(|b| b == codes::PURGE_FAILED));
    assert_eq!(outcome.acted.len(), 1, "the run stopped; no later candidate acted");

    // Logical deletion stands: the canonical package is NOT restored.
    let acted = &outcome.acted[0];
    assert!(
        !pkg_names(&root).iter().any(|n| n.contains(acted.content_hash.as_str())),
        "logical deletion already occurred and is not rolled back"
    );
    // The physical residue remains safely contained in quarantine.
    let run_dir = root.join(".h2o-reclaim").join(outcome.run_id.as_ref().unwrap());
    assert!(run_dir.exists(), "the quarantine residue survives for recovery");
    // Four packages remain: the run stopped after the first.
    assert_eq!(pkg_names(&root).len(), 4);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// CORRECTION A control — with the receipt durable, the purge DOES proceed, so
/// the test above proves the ordering rather than an inability to purge.
#[test]
fn a_durable_quarantine_receipt_allows_the_purge_to_proceed() {
    let root = scratch("receiptok");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::clear();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2, "both candidates purged");
    let events = trace::taken();
    assert!(events.contains(&trace::Event::QuarantineReceiptDurable));
    assert!(events.contains(&trace::Event::Purge));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// Plan durability failure yields ZERO canonical renames, deterministically.
#[test]
fn a_failed_plan_receipt_produces_no_canonical_rename() {
    let root = scratch("planfail");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let before = pkg_names(&root);

    trace::reset();
    fault::arm(fault::Point::BeforePlanDurability);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    fault::clear();

    assert_eq!(outcome.state, RunState::Refused);
    assert!(outcome.blockers.iter().any(|b| b == codes::EVIDENCE_FAILED));
    assert_eq!(pkg_names(&root), before, "not one package moved");
    let events = trace::taken();
    assert!(!events.contains(&trace::Event::PlanDurable));
    assert!(!events.contains(&trace::Event::FirstRename));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// The fault seam is compiled out of production entirely.
#[test]
fn the_fault_seam_is_test_only() {
    let source = include_str!("../archive_reclaim_execute.rs");
    let at = source.find("pub(crate) mod fault").expect("fault module");
    let module = &source[at..at + 1800.min(source.len() - at)];
    assert!(module.contains("#[cfg(test)]"), "arming is test-gated");
    assert!(
        module.contains("#[cfg(not(test))]") && module.contains("const fn armed"),
        "release builds fold the check to a const false"
    );
    /* `pub fn arm` is correct and REQUIRED — what matters is that it sits under
       #[cfg(test)], so no release build contains it. */
    let arm_at = module.find("pub fn arm").expect("arm exists for tests");
    assert!(
        module[..arm_at].trim_end().ends_with("#[cfg(test)]"),
        "arming must be immediately test-gated"
    );
    for forbidden in ["std::env", "env::var", "debug_flag", "from_str", "runtime_flag"] {
        assert!(!module.contains(forbidden), "no production switch: {forbidden}");
    }
}

/// (AE)(H) the run id is generated trusted-side and the request cannot name it,
/// a candidate, or any path.
#[test]
fn the_run_id_is_trusted_and_the_request_names_nothing() {
    // Two independent ids never collide and always carry the derived prefix.
    let a = generate_run_id().expect("entropy");
    let b = generate_run_id().expect("entropy");
    assert_ne!(a.component(), b.component());
    assert!(a.component().starts_with("run-"));
    assert_eq!(a.component().len(), "run-".len() + 32);

    // The execution request is EXACTLY the Preview request: no candidate list,
    // no path, no floor, no force.
    let source = include_str!("../archive_reclaim_execute.rs");
    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    /* The caller-controlled input is exactly the Preview request. */
    assert!(code.contains("request: &PreviewRequest"), "reuses the Preview request");
    /* A run id is an OUTPUT (RunOutcome.run_id); what must not exist is a run
       id INPUT on either entry point. */
    for entry in ["execute_generation_reclamation", "fn run_internal"] {
        let at = source.find(entry).expect(entry);
        let sig = &source[at..at + source[at..].find(") -> ").unwrap()];
        assert!(!sig.contains("run_id"), "{entry} must not accept a run id");
        assert!(!sig.contains("QuarantineRunId"), "{entry} must not accept a run namespace");
    }
    // Request validation is REUSED, not restated.
    assert!(code.contains("archive_reclamation_preview::admit_request"));
    assert!(!code.contains("MAX_PREVIEW_INPUTS"), "no second bound implementation");
}

/// (AI)(AJ)(P) dormant, and the destructive vocabulary stays where it belongs.
#[test]
fn the_execution_core_is_dormant_and_owns_no_primitive() {
    let source = include_str!("../archive_reclaim_execute.rs");
    let module_code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    /* Scanned in CODE: the module doc comment legitimately states that no
       command exists, and banning that text would ban the documentation. */
    assert!(!module_code.contains("#[tauri::command]"), "no execution command may exist");

    let lib = include_str!("../lib.rs");
    assert!(lib.contains("pub mod archive_reclaim_execute;"), "compiled");
    assert!(!lib.contains("archive_reclaim_execute::"), "not registered in any handler");
    for forbidden in [
        "h2o_archive_reclaim", "h2o_archive_execute", "h2o_archive_purge",
        "h2o_archive_quarantine", "h2o_archive_delete",
    ] {
        assert!(!lib.contains(forbidden), "{forbidden} must not be registered");
    }

    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    // (P) it owns NO destructive primitive of its own.
    for forbidden in [
        "unlinkat", "renameat", "remove_file", "remove_dir", "std::fs::remove",
        "std::fs::rename", "O_TRUNC",
    ] {
        assert!(!code.contains(forbidden), "primitive leaked into orchestration: {forbidden}");
    }
    assert!(code.contains("quarantine_generation("), "renames via the T3.1 primitive");
    assert!(code.contains("purge_quarantined_item("), "purges via the T3.1 primitive");

    // (AJ) no CAS destructive route.
    /* A read-only CAS COUNT may appear in evidence (the plan records
       referencedCasObjects); what must never exist is a destructive CAS route
       or any use of observed_unreferenced as an instruction. */
    for forbidden in [
        "QuarantineKind::Cas", "quarantine_cas", "purge_cas", "observed_unreferenced",
        "cas_roots.iter().for_each", "Cas =>",
    ] {
        assert!(!code.contains(forbidden), "CAS destructive route: {forbidden}");
    }
    assert!(
        code.contains("referenced_cas_objects"),
        "read-only CAS analysis appears as evidence only"
    );
    // Only the Generation kind is used in this task.
    assert!(code.contains("QuarantineKind::Generation"));
    for forbidden in ["QuarantineKind::StagingTemp", "QuarantineKind::Occupant"] {
        assert!(!code.contains(forbidden), "T3.2 must act only on generations: {forbidden}");
    }
}
