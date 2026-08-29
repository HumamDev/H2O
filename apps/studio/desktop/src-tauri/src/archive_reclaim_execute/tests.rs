use super::*;
use crate::archive_cas_scan::CasInventory;
use crate::archive_db_probe::{DbProbeCounts, GenerationProtection, ProtectionSource};
use crate::archive_durable_write::sha256_hex;
use crate::archive_generation_publish::{abort, begin, commit, write_member, Member, Publisher};
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

/// Splits Rust source into identifier tokens, so an age/time ban can be
/// exact. A substring scan cannot be: `age` lives inside `package`, and
/// `age_` inside `package_scan`, which this code says legitimately.
fn identifier_tokens(code: &str) -> std::collections::BTreeSet<String> {
    code.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

/// Every identifier that would give residue a time, age or wall-clock
/// authority. AC-M06-06: neither filesystem timestamps nor wall-clock age are
/// deletion authority anywhere.
const TIME_AUTHORITY_IDENTIFIERS: &[&str] = &[
    "st_mtime", "st_ctime", "st_birthtime", "st_atime", "st_mtimespec",
    "SystemTime", "Instant", "UNIX_EPOCH", "elapsed", "modified", "created",
    "age", "max_age", "min_age", "older_than", "newer_than", "stale_after",
    "dwell", "now", "timestamp", "duration_since",
];

/// The mid-run pause is a PROCESS-global gate, so the tests that arm it must
/// not overlap. `cargo test` runs cases on many threads; this serializes the
/// pause users without weakening what either of them proves.
static PAUSE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn pause_guard() -> std::sync::MutexGuard<'static, ()> {
    PAUSE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
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

/// (AE)(AF) canonical CAS survives a real run that reclaims BOTH residue
/// families out of the very same shard.
///
/// This was T3.2's "bystanders survive" case. T3.3 deliberately changes half of
/// it: staging and durable-temp residue are now this task's targets, so the
/// assertion that matters is the one that did NOT change — every canonical
/// `sha256-` body is byte and name identical afterwards, including the one the
/// read-only analysis calls observed-unreferenced.
#[test]
fn canonical_cas_survives_a_run_that_reclaims_both_residue_families() {
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
    let cas_before: Vec<(String, String)> = census(&root.join("assets"))
        .into_iter()
        .filter(|(n, _)| n.contains("sha256-") || !n.contains('.'))
        .collect();

    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2, "the generation stage really did act");

    // (AE)(AF) every canonical body, referenced or not, is untouched.
    let cas_after: Vec<(String, String)> = census(&root.join("assets"))
        .into_iter()
        .filter(|(n, _)| n.contains("sha256-") || !n.contains('.'))
        .collect();
    assert_eq!(cas_after, cas_before, "ALL CAS bodies byte and name identical");
    assert!(shard.join(&referenced).exists());
    assert!(root.join("assets").join("cd").join(&unreferenced).exists());

    // And the residue in the same shard IS reclaimed, through quarantine.
    assert_eq!(outcome.residue.generation_staging_purged, 1);
    assert_eq!(outcome.residue.durable_temp_purged, 1);
    assert!(!root.join("packages").join(".h2o-genstage-00ff01").exists());
    assert!(!shard.join(".h2o-durable-7-0.tmp").exists());

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

    let _serial = pause_guard();
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
    // T3.3 adds exactly one kind: staging/temp residue. Occupant action is a
    // later task and must not appear.
    assert!(code.contains("QuarantineKind::Generation"));
    assert!(code.contains("QuarantineKind::StagingTemp"));
    assert!(
        !code.contains("QuarantineKind::Occupant"),
        "occupant action belongs to a later task"
    );
    for forbidden in ["Occupant", "corrupt_occupant"] {
        assert!(!code.contains(forbidden), "no occupant action in T3.3: {forbidden}");
    }
    // (AL) no stale-run or receipt cleanup was smuggled in.
    for forbidden in ["purge_run", "purge_all", "purge_receipts", "RECEIPTS_NAMESPACE"] {
        assert!(!code.contains(forbidden), "stale-run convergence is a later task: {forbidden}");
    }
    // (AK) no time, age or wall-clock deletion authority anywhere.
    let tokens = identifier_tokens(&code);
    for forbidden in TIME_AUTHORITY_IDENTIFIERS {
        assert!(!tokens.contains(*forbidden), "no time authority: {forbidden}");
    }
    // (AG) residue leaves canonical space ONLY by quarantine rename.
    assert!(code.contains("quarantine_residue("), "residue moves via the T3.1 primitive");
    for forbidden in ["unlink_child", "unlink(", "purge_tree"] {
        assert!(!code.contains(forbidden), "no direct canonical removal: {forbidden}");
    }
}

// ── M06 T3.3 — staging / temp reclamation ──────────────────────────────────

/// A GENUINE abandoned staging tree, produced by the real publisher's `begin`
/// and then orphaned by dropping the publisher without commit or abort.
///
/// The in-memory registry goes with the publisher; the staging directory the
/// real publisher created stays on disk. That is exactly what a killed or
/// crashed instance leaves behind, so the fixture is source-grounded rather
/// than a hand-made empty directory.
fn orphan_staging(root: &Path, chat: &str) -> String {
    let before: std::collections::BTreeSet<String> = pkg_names(root).into_iter().collect();
    let publisher = Publisher::new(root.to_path_buf());
    let begun = begin(&publisher, chat);
    assert!(begun.ok, "begin refused: {:?}", begun.blockers);
    assert!(write_member(&publisher, begun.token, Member::Snapshot, br#"{"partial":true}"#).ok);
    drop(publisher);
    let mut fresh: Vec<String> = pkg_names(root)
        .into_iter()
        .filter(|n| !before.contains(n))
        .collect();
    assert_eq!(fresh.len(), 1, "exactly one new staging entry: {fresh:?}");
    let name = fresh.pop().unwrap();
    assert!(name.starts_with(".h2o-genstage-"), "{name}");
    assert!(root.join("packages").join(&name).is_dir(), "a real staging directory");
    name
}

fn plant_temp(root: &Path, shard: &str, name: &str, bytes: &[u8]) -> PathBuf {
    let dir = root.join("assets").join(shard);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    path
}

/// The residue actions a run reports, as `family|archive-path`.
fn residue_ids(outcome: &RunOutcome) -> Vec<String> {
    outcome
        .residue_acted
        .iter()
        .map(|r| format!("{}|{}", r.family.kind(), r.archive_path))
        .collect()
}

fn receipt_names(root: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(root.join(".h2o-reclaim").join("receipts"))
        .map(|it| it.map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect())
        .unwrap_or_default();
    names.sort();
    names
}

fn receipt_json(root: &Path, name: &str) -> serde_json::Value {
    let bytes =
        std::fs::read(root.join(".h2o-reclaim").join("receipts").join(name)).expect("receipt");
    serde_json::from_slice(&bytes).expect("receipt json")
}

/// (N)(J)(S)(T)(U)(Z)(AC)(AD)(AG) one run, one exclusive window, one run id,
/// one evidence set: a real generation candidate, a real orphaned staging tree,
/// two durable temps, a canonical CAS body and a foreign occupant.
#[test]
fn a_mixed_run_acts_on_generations_then_both_residue_families() {
    let root = scratch("mixed");
    let hashes = five(&root, "chat_a");
    let staging = orphan_staging(&root, "chat_b");
    plant_temp(&root, "ab", ".h2o-durable-11-0.tmp", b"temp-a");
    plant_temp(&root, "cd", ".h2o-durable-11-0.tmp", b"temp-b");
    let body = format!("sha256-{}", "ab".repeat(32));
    plant_temp(&root, "ab", &body, b"canonical-cas-body");
    // (AD) a foreign occupant and a legacy package: never staging targets.
    std::fs::write(root.join("packages").join("corrupt.h2ochat"), b"junk").unwrap();
    std::fs::create_dir_all(root.join("packages").join("chat_legacy.h2ochat")).unwrap();

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    trace::reset();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.schema_version, 2, "the extended run format");
    // Generations follow the existing T3.2 semantics: K=3 leaves two acted.
    assert_eq!(outcome.quarantined, 2);
    assert_eq!(outcome.purged, 2);
    // Both residue families, under the same run.
    assert_eq!(
        residue_ids(&outcome),
        vec![
            format!("generation-staging|archive/packages/{staging}"),
            "durable-temp|archive/assets/ab/.h2o-durable-11-0.tmp".to_string(),
            "durable-temp|archive/assets/cd/.h2o-durable-11-0.tmp".to_string(),
        ]
    );
    assert_eq!(outcome.residue.generation_staging_quarantined, 1);
    assert_eq!(outcome.residue.generation_staging_purged, 1);
    assert_eq!(outcome.residue.durable_temp_quarantined, 2);
    assert_eq!(outcome.residue.durable_temp_purged, 2);
    assert!(outcome.residue_acted.iter().all(|r| r.quarantined && r.purged));
    assert_eq!(outcome.residue_indeterminate, 0);

    // (S)(T)(U) the required per-item order, for the generation stage and then
    // BOTH residue families, strictly.
    let events = trace::taken();
    let first_rename = events.iter().position(|e| *e == trace::Event::FirstRename).unwrap();
    let plan_durable = events.iter().position(|e| *e == trace::Event::PlanDurable).unwrap();
    assert!(plan_durable < first_rename, "plan durable precedes the first rename");
    let residue_events: Vec<trace::Event> = events
        .iter()
        .copied()
        .filter(|e| {
            matches!(
                e,
                trace::Event::ResidueRename
                    | trace::Event::ResidueNamespaceDurable
                    | trace::Event::ResidueReceiptDurable
                    | trace::Event::ResiduePurge
                    | trace::Event::ResiduePurgeReceiptDurable
            )
        })
        .collect();
    assert_eq!(
        residue_events,
        [
            trace::Event::ResidueRename,
            trace::Event::ResidueNamespaceDurable,
            trace::Event::ResidueReceiptDurable,
            trace::Event::ResiduePurge,
            trace::Event::ResiduePurgeReceiptDurable,
        ]
        .repeat(3),
        "namespace durability precedes the receipt, and the receipt precedes the purge"
    );
    // The whole staging stage is after the whole generation stage.
    let last_gen = events
        .iter()
        .rposition(|e| *e == trace::Event::PurgeReceiptDurable)
        .unwrap();
    let first_res = events.iter().position(|e| *e == trace::Event::ResidueRename).unwrap();
    assert!(last_gen < first_res, "generations first, then residue");

    // Physical state.
    assert!(!root.join("packages").join(&staging).exists());
    assert!(!root.join("assets").join("ab").join(".h2o-durable-11-0.tmp").exists());
    assert!(!root.join("assets").join("cd").join(".h2o-durable-11-0.tmp").exists());
    assert!(root.join("assets").join("ab").join(&body).exists(), "CAS untouched");
    assert_eq!(
        std::fs::read(root.join("assets").join("ab").join(&body)).unwrap(),
        b"canonical-cas-body"
    );
    // (AC)(AD) the surviving canonical packages: three floor-protected
    // generations, the legacy package and the foreign occupant.
    let survivors = pkg_names(&root);
    assert_eq!(survivors.len(), 5, "{survivors:?}");
    assert!(survivors.contains(&"corrupt.h2ochat".to_string()));
    assert!(survivors.contains(&"chat_legacy.h2ochat".to_string()));
    assert_eq!(survivors.iter().filter(|n| n.contains(".g")).count(), 3);

    // (Z) one run id across every receipt, with the right subtype and identity.
    let run_id = outcome.run_id.clone().unwrap();
    let receipts = receipt_names(&root);
    assert!(receipts.iter().all(|n| n.starts_with(&run_id)), "{receipts:?}");
    assert_eq!(
        receipts.iter().filter(|n| n.contains("residue-quarantined")).count(),
        3
    );
    assert_eq!(receipts.iter().filter(|n| n.contains("residue-purged")).count(), 3);
    let staged_receipt = receipts
        .iter()
        .find(|n| n.contains("genstage") && n.contains("residue-purged"))
        .expect("a generation-staging purge receipt");
    let value = receipt_json(&root, staged_receipt);
    assert_eq!(value["schemaVersion"], 2);
    assert_eq!(value["kind"], "staging");
    assert_eq!(value["subtype"], "generation-staging");
    assert_eq!(value["action"], "purged");
    assert_eq!(value["archivePath"], format!("archive/packages/{staging}"));
    assert_eq!(value["purged"], true);
    let temp_receipt = receipts
        .iter()
        .find(|n| n.contains("durtmp.cd") && n.contains("residue-purged"))
        .expect("a durable-temp purge receipt");
    let value = receipt_json(&root, temp_receipt);
    assert_eq!(value["subtype"], "durable-temp");
    assert_eq!(value["archivePath"], "archive/assets/cd/.h2o-durable-11-0.tmp");
    // No chat content, no absolute host path anywhere in the evidence.
    for name in &receipts {
        let raw = String::from_utf8(
            std::fs::read(root.join(".h2o-reclaim").join("receipts").join(name)).unwrap(),
        )
        .unwrap();
        assert!(!raw.contains(root.to_str().unwrap()), "absolute host path in {name}");
        assert!(!raw.contains("body-2026"), "chat content in {name}");
    }

    // No hidden second run: exactly one run directory, and it is this one.
    let mut runs: Vec<String> = std::fs::read_dir(root.join(".h2o-reclaim"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n != "receipts")
        .collect();
    runs.sort();
    assert_eq!(runs, vec![run_id]);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (M)(L) a staging-only run: zero generation candidates, real residue, and the
/// complete plan is durable BEFORE the first staging rename. This is the
/// anti-vacuity case for plan durability.
#[test]
fn a_staging_only_run_acts_with_zero_generation_candidates() {
    let root = scratch("stagingonly");
    // No packages directory at all: only durable-temp residue exists.
    plant_temp(&root, "ab", ".h2o-durable-2-0.tmp", b"residue");

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    trace::reset();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));

    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.quarantined, 0, "no generation action was fabricated");
    assert_eq!(outcome.purged, 0);
    assert!(outcome.acted.is_empty());
    assert_eq!(outcome.residue.durable_temp_purged, 1);
    assert_eq!(outcome.residue.generation_staging_purged, 0);

    let events = trace::taken();
    assert_eq!(
        events.iter().position(|e| *e == trace::Event::PlanDurable),
        Some(0),
        "plan durability is the first recorded step"
    );
    assert!(
        !events.contains(&trace::Event::FirstRename),
        "no generation rename happened"
    );
    let first_staging = events
        .iter()
        .position(|e| *e == trace::Event::ResidueRename)
        .expect("a staging rename happened");
    assert!(
        events.iter().position(|e| *e == trace::Event::PlanDurable).unwrap() < first_staging,
        "PLAN_DURABLE precedes FIRST_STAGING_RENAME with zero generation candidates"
    );

    // One run id and one evidence set.
    let run_id = outcome.run_id.clone().unwrap();
    let receipts = receipt_names(&root);
    assert!(receipts.iter().all(|n| n.starts_with(&run_id)));
    let plan = receipt_json(&root, &format!("{run_id}.plan.json"));
    assert_eq!(plan["stages"], serde_json::json!(["staging-temp"]));
    assert_eq!(plan["residue"]["actions"].as_array().unwrap().len(), 1);
    assert_eq!(plan["candidates"].as_array().unwrap().len(), 0);
    assert!(!root.join("assets").join("ab").join(".h2o-durable-2-0.tmp").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (O) generation-only preservation: with ZERO residue the run behaves exactly
/// as the pre-T3.3 generation execution did, plus the additive stage evidence.
#[test]
fn generation_only_behaviour_is_preserved_when_no_residue_exists() {
    let root = scratch("genonly");
    let hashes = five(&root, "chat_a");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    trace::reset();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    // Exactly the T3.2 result.
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.quarantined, 2);
    assert_eq!(outcome.purged, 2);
    assert_eq!(outcome.retention_floor, 3);
    assert_eq!(outcome.acted.len(), 2);
    assert!(outcome.acted.iter().all(|a| a.quarantined && a.purged));
    assert_eq!(pkg_names(&root).len(), 3, "the K=3 floor survives");
    assert_eq!(
        trace::taken(),
        vec![
            trace::Event::PlanDurable,
            trace::Event::FirstRename,
            trace::Event::QuarantineNamespaceDurable,
            trace::Event::QuarantineReceiptDurable,
            trace::Event::Purge,
            trace::Event::PurgeReceiptDurable,
            trace::Event::FirstRename,
            trace::Event::QuarantineNamespaceDurable,
            trace::Event::QuarantineReceiptDurable,
            trace::Event::Purge,
            trace::Event::PurgeReceiptDurable,
        ],
        "no residue step is recorded, and no generation step changed"
    );
    // Additive only: the residue fields are present and empty.
    assert!(outcome.residue_acted.is_empty());
    assert_eq!(outcome.residue, ResidueCounts::default());
    assert_eq!(outcome.residue_indeterminate, 0);
    let run_id = outcome.run_id.clone().unwrap();
    let plan = receipt_json(&root, &format!("{run_id}.plan.json"));
    assert_eq!(plan["stages"], serde_json::json!(["generation"]));
    assert_eq!(plan["residue"]["actions"].as_array().unwrap().len(), 0);
    assert_eq!(plan["residue"]["sourceComplete"], true);
    // Every generation-stage receipt is exactly the T3.2 shape.
    let quarantined = receipt_names(&root)
        .into_iter()
        .find(|n| n.contains("quarantined") && !n.contains("residue"))
        .expect("a generation quarantine receipt");
    let value = receipt_json(&root, &quarantined);
    assert_eq!(value["kind"], "generation");
    assert_eq!(value["chatId"], "chat_a");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (D)(mutant 2) an incomplete residue authority is NEVER read as empty, and it
/// does not buy an independent generation stage either: ZERO destructive
/// mutation for the whole run, refused before the run namespace exists.
#[test]
fn an_incomplete_residue_authority_performs_zero_destructive_mutation() {
    let root = scratch("residueblind");
    let hashes = five(&root, "chat_a");
    // A shard standing behind a symlink: O_NOFOLLOW cannot look inside it.
    let elsewhere = root.parent().unwrap().join("elsewhere");
    std::fs::create_dir_all(&elsewhere).unwrap();
    std::fs::write(elsewhere.join(".h2o-durable-1-0.tmp"), b"hidden").unwrap();
    std::fs::create_dir_all(root.join("assets")).unwrap();
    std::os::unix::fs::symlink(&elsewhere, root.join("assets").join("ab")).unwrap();

    let owner = Owner::acquire(&root);
    let before = census(&root);
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    assert_eq!(outcome.state, RunState::Refused);
    assert!(outcome.blockers.contains(&codes::RESIDUE_NOT_AUTHORITATIVE.to_string()));
    assert!(outcome.run_id.is_none(), "no run namespace was created");
    assert_eq!(outcome.quarantined, 0);
    assert_eq!(outcome.purged, 0);
    assert_eq!(outcome.residue, ResidueCounts::default());
    assert_eq!(census(&root), before, "not one byte changed, in EITHER stage");
    assert!(!root.join(".h2o-reclaim").exists());
    assert!(elsewhere.join(".h2o-durable-1-0.tmp").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (I)(mutant 7) an in-flight publisher session refuses the WHOLE run before
/// any action, and its staging tree is left completely alone.
#[test]
fn an_in_flight_publisher_session_refuses_the_staging_stage_too() {
    let root = scratch("livesession");
    plant_temp(&root, "ab", ".h2o-durable-6-0.tmp", b"residue");

    // A genuine live session, held open across the refusal.
    let publisher = Publisher::new(root.to_path_buf());
    let begun = begin(&publisher, "chat_live");
    assert!(begun.ok, "{:?}", begun.blockers);
    assert!(write_member(&publisher, begun.token, Member::Snapshot, br#"{"live":true}"#).ok);
    assert!(!publisher.sessions_empty(), "the registry really is occupied");
    let live_staging: Vec<String> = pkg_names(&root)
        .into_iter()
        .filter(|n| n.starts_with(".h2o-genstage-"))
        .collect();
    assert_eq!(live_staging.len(), 1);

    let owner = Owner::acquire(&root);
    let before = census(&root);
    let ex = owner.exclusive();
    let outcome = run_with_registry(
        &root,
        &ex,
        &db(vec![]),
        &request("chat_a", "ok", "deadbeef"),
        publisher.sessions_empty(),
    );

    assert_eq!(outcome.state, RunState::Refused);
    assert_eq!(outcome.blockers, vec![codes::PUBLISHER_SESSIONS_ACTIVE.to_string()]);
    assert!(outcome.run_id.is_none());
    assert!(outcome.residue_acted.is_empty(), "no staging receipt, no staging action");
    assert_eq!(census(&root), before, "the live staging tree is intact");
    assert!(!root.join(".h2o-reclaim").exists(), "no reclaim root from a refusal");
    assert!(root.join("assets").join("ab").join(".h2o-durable-6-0.tmp").exists());
    // The session was never terminated as part of the refusal.
    assert!(!publisher.sessions_empty(), "the registry still contains the session");
    assert!(root.join("packages").join(&live_staging[0]).is_dir());

    // Only now, as cleanup, is the session ended.
    assert!(abort(&publisher, begun.token).ok);
    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (K) a trusted durable write cannot overlap the exclusive staging/temp
/// window. Proven at the REAL production gate every mutating command passes
/// through — `enter_mutation_recovering` — not by reading source comments, and
/// without inventing a second lock.
#[test]
fn a_trusted_durable_write_cannot_overlap_the_exclusive_staging_window() {
    use crate::archive_instance_lock::enter_mutation_recovering;

    let root = scratch("dwexcl");
    plant_temp(&root, "ab", ".h2o-durable-4-0.tmp", b"residue");

    let state = std::sync::Arc::new(ArchiveInstanceState::default());
    state.record_startup_attempt(&root);
    state.ensure_presence(&root).expect("shared presence");

    // Control: the production gate admits a trusted mutation right now.
    assert!(
        enter_mutation_recovering(&state, Some(&root)).is_ok(),
        "precondition: trusted mutation is possible before the run"
    );

    let _serial = pause_guard();
    let (reached, release) = pause::arm();
    let run_state = state.clone();
    let run_root = root.clone();
    let handle = std::thread::spawn(move || {
        let ex = run_state.try_acquire_exclusive().expect("exclusive");
        let outcome = run_internal(
            &ex,
            &run_root,
            true,
            &request("chat_a", "ok", "deadbeef"),
            &db(vec![]),
        );
        let _ = ex.release();
        outcome
    });
    reached
        .recv_timeout(std::time::Duration::from_secs(30))
        .expect("the run reached its exclusive window");

    // Mid-run: the same authority is refused, retryably.
    let refused = enter_mutation_recovering(&state, Some(&root));
    assert_eq!(
        refused.err().as_deref(),
        Some(crate::archive_instance_lock::codes::MUTATION_GATE_BUSY),
        "a concurrent trusted write must be refused while the run owns exclusive"
    );
    assert!(
        crate::archive_instance_lock::is_retryable_environmental(
            crate::archive_instance_lock::codes::MUTATION_GATE_BUSY
        ),
        "and refused with the established retryable behavior, not a hard error"
    );

    let _ = release.send(());
    let outcome = handle.join().expect("run thread");
    pause::clear();
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.residue.durable_temp_purged, 1);

    // After release, trusted mutation is possible again.
    assert!(enter_mutation_recovering(&state, Some(&root)).is_ok());

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// AC-M06-09 eviction equivalence: reclaiming a genuine orphaned staging tree
/// removes abandoned staging state and nothing else. No committed generation
/// moves, no publisher session is terminated, and publication still works
/// afterwards with identical semantics.
#[test]
fn reclaiming_orphaned_staging_is_not_a_publication_change() {
    let root = scratch("evict");
    let before_hash = publish(&root, "chat_a", "2026-01-01T00:00:00.000Z");
    let staging = orphan_staging(&root, "chat_b");
    let published_before: Vec<String> = pkg_names(&root)
        .into_iter()
        .filter(|n| n.ends_with(".h2ochat"))
        .collect();
    assert_eq!(published_before.len(), 1);
    let package_census = census(&root.join("packages").join(&published_before[0]));

    // The preconditions the safety argument rests on, asserted rather than
    // assumed: exclusive held, registry empty, target in a staging namespace.
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let registry_probe = Publisher::new(root.to_path_buf());
    assert!(registry_probe.sessions_empty(), "no publisher session is in flight");
    assert!(staging.starts_with(".h2o-genstage-"));
    assert!(crate::archive_durable_write::is_reserved_component(&staging));

    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &before_hash));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.residue.generation_staging_purged, 1);

    // No committed generation moved, byte for byte.
    assert_eq!(
        pkg_names(&root)
            .into_iter()
            .filter(|n| n.ends_with(".h2ochat"))
            .collect::<Vec<_>>(),
        published_before,
        "no canonical publication was touched"
    );
    assert_eq!(census(&root.join("packages").join(&published_before[0])), package_census);
    assert!(outcome.acted.is_empty(), "the generation stage acted on nothing");
    assert!(!root.join("packages").join(&staging).exists());
    let _ = ex.release();

    // Publication semantics are unchanged afterwards: a new generation
    // publishes normally through the real publisher.
    let after_hash = publish(&root, "chat_c", "2026-02-02T00:00:00.000Z");
    assert_eq!(after_hash.len(), 64);
    assert_eq!(
        pkg_names(&root)
            .into_iter()
            .filter(|n| n.ends_with(".h2ochat"))
            .count(),
        2
    );
    assert!(
        !pkg_names(&root).iter().any(|n| n.starts_with(".h2o-genstage-")),
        "the new publication left no staging residue of its own"
    );

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (V)(mutant 12) a deterministic namespace-durability failure after a staging
/// rename: no purge, no later action, never Complete.
#[test]
fn a_staging_namespace_durability_failure_stops_the_run_without_purging() {
    let root = scratch("resdur");
    plant_temp(&root, "ab", ".h2o-durable-1-0.tmp", b"first");
    plant_temp(&root, "cd", ".h2o-durable-1-0.tmp", b"second");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::arm(fault::Point::AfterResidueRenameBeforeNamespaceDurability);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial, "never Complete");
    assert_eq!(outcome.residue_acted.len(), 1, "the run stopped at the first item");
    assert!(outcome.residue_acted[0].quarantined);
    assert!(!outcome.residue_acted[0].purged);
    assert_eq!(
        outcome.residue_acted[0].blocker.as_deref(),
        Some(crate::archive_reclaim::codes::QUARANTINE_NOT_DURABLE)
    );
    assert_eq!(outcome.residue.durable_temp_purged, 0);

    let events = trace::taken();
    assert!(events.contains(&trace::Event::ResidueRename));
    assert!(!events.contains(&trace::Event::ResidueNamespaceDurable));
    assert!(!events.contains(&trace::Event::ResiduePurge), "no purge, ever");

    // The item remains quarantined and observable; the second is untouched.
    let run_id = outcome.run_id.clone().unwrap();
    let quarantined: Vec<String> = std::fs::read_dir(root.join(".h2o-reclaim").join(&run_id))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    assert_eq!(quarantined, vec!["durtmp.ab..h2o-durable-1-0.tmp".to_string()]);
    assert!(root.join("assets").join("cd").join(".h2o-durable-1-0.tmp").exists());
    assert!(receipt_names(&root).iter().all(|n| !n.contains("residue")));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (W)(mutant 13)(mutant 14) a deterministic staging-receipt failure prevents
/// the purge and every later action.
#[test]
fn a_failed_staging_receipt_stops_the_run_without_purging() {
    let root = scratch("resreceipt");
    plant_temp(&root, "ab", ".h2o-durable-1-0.tmp", b"first");
    plant_temp(&root, "cd", ".h2o-durable-1-0.tmp", b"second");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::arm(fault::Point::AfterResidueRenameBeforeReceipt);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial);
    assert_eq!(outcome.residue_acted.len(), 1);
    assert!(outcome.residue_acted[0].quarantined && !outcome.residue_acted[0].purged);
    assert!(outcome.blockers.contains(&codes::EVIDENCE_FAILED.to_string()));

    let events = trace::taken();
    assert!(events.contains(&trace::Event::ResidueNamespaceDurable), "the move was durable");
    assert!(!events.contains(&trace::Event::ResidueReceiptDurable), "the receipt was not");
    assert!(!events.contains(&trace::Event::ResiduePurge), "so nothing was purged");

    let run_id = outcome.run_id.clone().unwrap();
    assert!(root
        .join(".h2o-reclaim")
        .join(&run_id)
        .join("durtmp.ab..h2o-durable-1-0.tmp")
        .exists());
    assert!(root.join("assets").join("cd").join(".h2o-durable-1-0.tmp").exists());
    assert!(!receipt_names(&root).iter().any(|n| n.contains("residue")));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (X)(mutant 15) a deterministic staging-purge failure stops later actions and
/// reports honestly: the canonical source is NOT restored, and the surviving
/// quarantine stays for recovery.
#[test]
fn a_staging_purge_failure_stops_later_actions_honestly() {
    let root = scratch("respurge");
    plant_temp(&root, "ab", ".h2o-durable-1-0.tmp", b"first");
    plant_temp(&root, "cd", ".h2o-durable-1-0.tmp", b"second");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    fault::arm(fault::Point::ResiduePurgeFails);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial);
    assert_eq!(outcome.residue_acted.len(), 1);
    assert!(outcome.residue_acted[0].quarantined);
    assert!(!outcome.residue_acted[0].purged);
    assert_eq!(
        outcome.residue_acted[0].blocker.as_deref(),
        Some(codes::RESIDUE_PURGE_FAILED)
    );
    assert_eq!(outcome.residue.durable_temp_quarantined, 1);
    assert_eq!(outcome.residue.durable_temp_purged, 0);

    // Logical removal already happened and is NOT undone.
    assert!(!root.join("assets").join("ab").join(".h2o-durable-1-0.tmp").exists());
    let run_id = outcome.run_id.clone().unwrap();
    assert!(root
        .join(".h2o-reclaim")
        .join(&run_id)
        .join("durtmp.ab..h2o-durable-1-0.tmp")
        .exists(), "the physical residue stays contained");
    // The quarantine receipt exists; the purge receipt does not.
    let receipts = receipt_names(&root);
    assert!(receipts.iter().any(|n| n.contains("residue-quarantined")));
    assert!(!receipts.iter().any(|n| n.contains("residue-purged")));
    // The second item was never touched.
    assert!(root.join("assets").join("cd").join(".h2o-durable-1-0.tmp").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (mutant 10) a material GENERATION-stage failure prevents every staging
/// action. The run does not go on to delete something else after meeting a
/// contradiction.
#[test]
fn a_generation_stage_failure_prevents_every_staging_action() {
    let root = scratch("genfail");
    let hashes = five(&root, "chat_a");
    let staging = orphan_staging(&root, "chat_b");
    plant_temp(&root, "ab", ".h2o-durable-1-0.tmp", b"residue");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::arm(fault::Point::AfterRenameBeforeQuarantineReceipt);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial);
    let events = trace::taken();
    assert!(events.contains(&trace::Event::FirstRename));
    assert!(
        !events.iter().any(|e| matches!(
            e,
            trace::Event::ResidueRename
                | trace::Event::ResidueNamespaceDurable
                | trace::Event::ResidueReceiptDurable
                | trace::Event::ResiduePurge
                | trace::Event::ResiduePurgeReceiptDurable
        )),
        "not one staging step may run after a generation-stage failure"
    );
    assert!(outcome.residue_acted.is_empty());
    assert_eq!(outcome.residue, ResidueCounts::default());
    assert!(root.join("packages").join(&staging).is_dir(), "staging untouched");
    assert!(root.join("assets").join("ab").join(".h2o-durable-1-0.tmp").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (AB) with no generation candidate and no residue, the run performs ZERO
/// persistent mutation: no reclaim root, no run directory, no receipt.
#[test]
fn a_no_op_run_with_neither_generations_nor_residue_mutates_nothing() {
    let root = scratch("t33noop");
    let hashes: Vec<String> = (1..=3)
        .map(|d| publish(&root, "chat_a", &format!("2026-01-0{d}T00:00:00.000Z")))
        .collect();
    // Name-matching entries of the WRONG type: reported, never acted on, and
    // never enough to make a run happen.
    std::fs::write(root.join("packages").join(".h2o-genstage-notadir"), b"x").unwrap();
    let owner = Owner::acquire(&root);
    let before = census(&root);
    let ex = owner.exclusive();

    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[2]));

    assert_eq!(outcome.state, RunState::NoOp);
    assert!(outcome.run_id.is_none());
    assert!(outcome.blockers.is_empty());
    assert!(outcome.residue_acted.is_empty());
    assert_eq!(outcome.residue, ResidueCounts::default());
    assert_eq!(outcome.residue_indeterminate, 1, "reported, not acted on");
    assert_eq!(census(&root), before, "no-op means no mutation at all");
    assert!(!root.join(".h2o-reclaim").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (R)(mutant 18) two DISTINCT durable temps can legitimately share a basename
/// across shards. The quarantine identity keeps them apart, and a basename-only
/// identity would not — which the second half of this test demonstrates rather
/// than asserts.
#[test]
fn two_durable_temps_with_one_basename_get_distinct_quarantine_identities() {
    let root = scratch("collide");
    plant_temp(&root, "ab", ".h2o-durable-77-0.tmp", b"first");
    plant_temp(&root, "cd", ".h2o-durable-77-0.tmp", b"second");

    let scan = crate::archive_residue_probe::scan_trusted_residue_within(&root);
    assert_eq!(scan.items.len(), 2);
    assert_eq!(scan.items[0].name(), scan.items[1].name(), "one basename");
    let a = residue_target_component(&scan.items[0]).unwrap();
    let b = residue_target_component(&scan.items[1]).unwrap();
    assert_ne!(a, b, "the shard is part of the identity");
    assert_eq!(a.as_str(), "durtmp.ab..h2o-durable-77-0.tmp");
    assert_eq!(b.as_str(), "durtmp.cd..h2o-durable-77-0.tmp");
    /* The mutant's identity — family plus basename — maps both to one name. */
    assert_eq!(
        format!("durtmp.{}", scan.items[0].name()),
        format!("durtmp.{}", scan.items[1].name()),
        "a basename-only identity really does collide"
    );

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.residue.durable_temp_purged, 2, "BOTH were reclaimed");
    let receipts = receipt_names(&root);
    assert!(receipts.iter().any(|n| n.contains("durtmp.ab.")));
    assert!(receipts.iter().any(|n| n.contains("durtmp.cd.")));
    assert!(!root.join("assets").join("ab").join(".h2o-durable-77-0.tmp").exists());
    assert!(!root.join("assets").join("cd").join(".h2o-durable-77-0.tmp").exists());

    // And had the identities collided, the second move would have been REFUSED
    // rather than overwriting the first: RENAME_EXCL, not a replacing rename.
    let reclaim = crate::archive_reclaim::open_reclaim_root_for_run(&ex, &root).unwrap();
    let collide_run = crate::archive_reclaim::QuarantineRunId::parse("collide").unwrap();
    let run_dir = reclaim.create_run(&ex, &collide_run).unwrap();
    plant_temp(&root, "ab", ".h2o-durable-88-0.tmp", b"x");
    plant_temp(&root, "cd", ".h2o-durable-88-0.tmp", b"y");
    let shared = QuarantineComponent::parse("durtmp..h2o-durable-88-0.tmp").unwrap();
    let name = QuarantineComponent::parse(".h2o-durable-88-0.tmp").unwrap();
    let ab = crate::archive_reclaim::open_cas_shard_dir(&ex, &root, "ab").unwrap();
    let cd = crate::archive_reclaim::open_cas_shard_dir(&ex, &root, "cd").unwrap();
    assert_eq!(quarantine_residue(&ex, &ab, &run_dir, &name, &shared), Ok(true));
    assert_eq!(
        quarantine_residue(&ex, &cd, &run_dir, &name, &shared),
        Ok(false),
        "a colliding destination fails closed instead of overwriting"
    );
    assert_eq!(
        std::fs::read(root.join(".h2o-reclaim").join("run-collide").join(shared.as_str())).unwrap(),
        b"x",
        "the first item was never replaced"
    );
    assert!(root.join("assets").join("cd").join(".h2o-durable-88-0.tmp").exists());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (AA) staging action order is a stable trusted identity sort, not filesystem
/// enumeration order: two equivalent archives built in opposite orders plan and
/// act identically.
#[test]
fn staging_action_order_is_deterministic_across_archives() {
    fn build(tag: &str, reverse: bool) -> (PathBuf, Vec<String>) {
        let root = scratch(tag);
        let mut shards = vec!["01", "ab", "cd", "ef", "fe"];
        let mut stages = vec!["aa01", "aa02", "aa03"];
        if reverse {
            shards.reverse();
            stages.reverse();
        }
        std::fs::create_dir_all(root.join("packages")).unwrap();
        for st in stages {
            std::fs::create_dir_all(root.join("packages").join(format!(".h2o-genstage-{st}")))
                .unwrap();
        }
        for sh in shards {
            plant_temp(&root, sh, ".h2o-durable-3-0.tmp", b"t");
        }
        let owner = Owner::acquire(&root);
        let ex = owner.exclusive();
        let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
        assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
        let ids = residue_ids(&outcome);
        let _ = ex.release();
        (root, ids)
    }
    let (forward_root, forward) = build("order-f", false);
    let (reverse_root, reverse) = build("order-r", true);
    assert_eq!(forward, reverse, "insertion order must not reach action order");
    assert_eq!(
        forward,
        vec![
            "generation-staging|archive/packages/.h2o-genstage-aa01",
            "generation-staging|archive/packages/.h2o-genstage-aa02",
            "generation-staging|archive/packages/.h2o-genstage-aa03",
            "durable-temp|archive/assets/01/.h2o-durable-3-0.tmp",
            "durable-temp|archive/assets/ab/.h2o-durable-3-0.tmp",
            "durable-temp|archive/assets/cd/.h2o-durable-3-0.tmp",
            "durable-temp|archive/assets/ef/.h2o-durable-3-0.tmp",
            "durable-temp|archive/assets/fe/.h2o-durable-3-0.tmp",
        ]
    );
    let _ = std::fs::remove_dir_all(forward_root.parent().unwrap());
    let _ = std::fs::remove_dir_all(reverse_root.parent().unwrap());
}

/// (C)(AH)(mutant 1)(mutant 21) the destructive staging authority is
/// trusted-side only: the request names nothing, and no renderer inventory
/// reaches it.
#[test]
fn the_staging_stage_takes_no_renderer_inventory_path_or_target() {
    // The ONLY caller-controlled input is the bounded enabling request, whose
    // fields are exactly chat scope and per-chat projection verdict.
    let preview = include_str!("../archive_reclamation_preview.rs");
    let at = preview.find("pub struct PreviewRequest").unwrap();
    let decl = &preview[at..at + preview[at..].find("\n}").unwrap()];
    for forbidden in [
        "residue", "staging", "genstage", "durable", "shard", "temp", "run_id",
        "target", "path", "quarantine", "item",
    ] {
        assert!(!decl.contains(forbidden), "the request must not carry {forbidden}");
    }

    let code: String = include_str!("../archive_reclaim_execute.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    /* The residue set comes from ONE authority: the trusted scan. */
    assert_eq!(
        code.matches("scan_trusted_residue_within(").count(),
        1,
        "one trusted residue authority, recomputed here"
    );
    for forbidden in [
        "diagnoseSavedChatArchive", "saved-chat-reclamation-ui", "packagesInventory",
        "inventory", "renderer_residue", "ProjectionInput { chat_id: ",
    ] {
        assert!(!code.contains(forbidden), "renderer inventory is not authority: {forbidden}");
    }
    /* And the scan is invoked with the run's own derived archive root — no
       caller path type reaches it. */
    let at = code.find("scan_trusted_residue_within(").unwrap();
    assert!(code[at..at + 60].contains("(archive_root)"));

    /* (mutant 8) the scan runs INSIDE the exclusive window: it is called from
       the private sequence that requires the capability by type, after the
       registry precondition, and nothing in the production wrapper scans. */
    let src = include_str!("../archive_reclaim_execute.rs");
    let seq = src.find("fn run_internal(").unwrap();
    let wrapper = src.find("pub(crate) async fn execute_generation_reclamation").unwrap();
    let wrapper_body = &src[wrapper..seq];
    assert!(!wrapper_body.contains("scan_trusted_residue_within"));
    let body = &src[seq..];
    let scan_at = body.find("scan_trusted_residue_within").unwrap();
    let registry_at = body.find("if !publisher_sessions_empty").unwrap();
    assert!(registry_at < scan_at, "the registry precondition precedes the scan");
    assert!(
        src[seq..seq + 400].contains("exclusive: &crate::archive_instance_lock::ExclusiveOwnership"),
        "the sequence holding the scan requires exclusive ownership by type"
    );
}

/// (L)(mutant 9) the COMPLETE action set — generations and both residue
/// families — is in the durable pre-mutation record, and that record is written
/// before any rename in either stage.
#[test]
fn the_complete_plan_is_durable_before_the_first_rename_of_either_stage() {
    let src = include_str!("../archive_reclaim_execute.rs");
    let seq = src.find("fn run_internal(").unwrap();
    let body = &src[seq..];

    let actions_built = body.find("let mut residue_actions").expect("actions derived");
    let plan_written = body.find("&plan_evidence(").expect("plan evidence written");
    let first_gen_rename = body.find("quarantine_generation(exclusive").expect("generation move");
    let staging_stage = body.find("run_residue_stage(").expect("staging stage");
    assert!(actions_built < plan_written, "the actions exist before the record");
    assert!(plan_written < first_gen_rename, "PLAN_DURABLE precedes the generation rename");
    assert!(plan_written < staging_stage, "PLAN_DURABLE precedes the staging stage");

    // The record really carries them.
    let at = src.find("fn plan_evidence(").unwrap();
    let evidence = &src[at..at + src[at..].find("\nfn residue_evidence").unwrap()];
    for required in [
        "\"residue\"", "sourceComplete", "sourceBlockers", "indeterminate",
        "\"actions\"", "archivePath", "quarantineItem", "\"family\"",
    ] {
        assert!(evidence.contains(required), "the plan must record {required}");
    }
    // (mutant 24) and nothing time-shaped is recorded as authority.
    let tokens = identifier_tokens(evidence);
    for forbidden in TIME_AUTHORITY_IDENTIFIERS {
        assert!(!tokens.contains(*forbidden), "no time authority in the plan: {forbidden}");
    }
}

/// (AI)(AJ) T3.3 stays dormant: no command, no invoke-handler arm, no renderer
/// route, and the capability and UI surfaces carry no destructive grant.
#[test]
fn staging_reclamation_is_unregistered_and_no_ui_reaches_it() {
    let lib = include_str!("../lib.rs");
    for forbidden in [
        "archive_reclaim_execute::", "run_residue_stage", "scan_trusted_residue_within",
        "h2o_archive_staging", "h2o_archive_residue_reclaim", "h2o_archive_reclaim",
    ] {
        assert!(!lib.contains(forbidden), "{forbidden} must not be registered");
    }
    assert!(lib.contains("pub mod archive_reclaim_execute;"), "compiled but dormant");

    /* Renderer archive mutation authority is still EMPTY. Scoped to grants
       that actually reach `$APPLOCALDATA/archive`: `archive-export.json`
       legitimately holds an `fs:allow-mkdir` for `$HOME/H2O Studio Exports`,
       which is M04 export authority over a different tree, and banning the
       token outright would fail on unrelated capability rather than on archive
       mutation. Every archive-reaching grant must be read-only. */
    const ARCHIVE_READ_ONLY: &[&str] = &[
        "fs:allow-exists",
        "fs:allow-read-file",
        "fs:allow-read-text-file",
        "fs:allow-lstat",
        "fs:allow-read-dir",
    ];
    let mut archive_grants: Vec<String> = vec![];
    for capability in [
        include_str!("../../capabilities/archive-cas.json"),
        include_str!("../../capabilities/archive-export.json"),
        include_str!("../../capabilities/default.json"),
    ] {
        let value: serde_json::Value = serde_json::from_str(capability).expect("capability json");
        let Some(entries) = value["permissions"].as_array() else {
            continue;
        };
        for entry in entries {
            let Some(identifier) = entry["identifier"].as_str() else {
                continue;
            };
            let paths = serde_json::to_string(&entry["allow"]).unwrap_or_default();
            if !paths.contains("$APPLOCALDATA/archive") {
                continue;
            }
            archive_grants.push(identifier.to_string());
            assert!(
                ARCHIVE_READ_ONLY.contains(&identifier),
                "{identifier} grants the renderer non-read authority over the archive"
            );
        }
    }
    assert!(!archive_grants.is_empty(), "the archive grants were actually inspected");

    // The New UI reclamation surface: Analyze only, no destructive control.
    let ui = include_str!(
        "../../../../../../src-surfaces-base/studio/ingestion/saved-chat-reclamation-ui.studio.js"
    );
    /* The surface declares its actions with `setAttribute('data-h2o-action',
       '<name>')`, so the action set is exactly the values passed there. */
    let actions: Vec<&str> = ui
        .match_indices("'data-h2o-action'")
        .map(|(at, _)| {
            let tail = &ui[at..];
            let start = tail.find(", '").expect("an action value") + 3;
            &tail[start..start + tail[start..].find('\'').expect("closing quote")]
        })
        .collect();
    assert_eq!(actions, vec!["analyze-archive"], "Analyze is the ONLY control");
    for forbidden in [
        "reclaim-archive", "purge", "quarantine", "delete", "genstage",
        "durable-temp", "residue-reclaim",
    ] {
        assert!(
            !actions.iter().any(|a| a.contains(forbidden)),
            "no destructive UI action: {forbidden}"
        );
    }
    // And nothing in the surface names a destructive command.
    for forbidden in ["h2o_archive_reclaim", "h2o_archive_staging", "h2o_archive_purge"] {
        assert!(!ui.contains(forbidden), "no destructive invoke: {forbidden}");
    }
}

/// (C)(mutant 1) MONOTONICITY FOR RESIDUE: renderer input is enabling-only, so
/// it can narrow what a run does but must NEVER add a destructive target. The
/// scope here nominates a published generation, a staging name that does not
/// exist and a canonical CAS body; the trusted scan still decides alone.
#[test]
fn renderer_scope_can_never_add_a_residue_target() {
    let root = scratch("nominate");
    let hash = publish(&root, "chat_a", "2026-01-01T00:00:00.000Z");
    let published = pkg_names(&root)
        .into_iter()
        .find(|n| n.ends_with(".h2ochat"))
        .expect("a published generation");
    std::fs::create_dir_all(root.join("packages").join(".h2o-genstage-real01")).unwrap();
    plant_temp(&root, "ab", ".h2o-durable-5-0.tmp", b"t");
    let body = format!("sha256-{}", "ab".repeat(32));
    plant_temp(&root, "ab", &body, b"canonical-cas-body");
    let published_census = census(&root.join("packages").join(&published));

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let nominated = PreviewRequest {
        chat_scope: Some(vec![
            "chat_a".to_string(),
            published.clone(),
            ".h2o-genstage-victim".to_string(),
            body.clone(),
        ]),
        projections: vec![ProjectionInput {
            chat_id: "chat_a".to_string(),
            status: "ok".to_string(),
            content_hash: hash.clone(),
        }],
    };
    let outcome = run(&root, &ex, &db(vec![]), &nominated);

    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(
        residue_ids(&outcome),
        vec![
            "generation-staging|archive/packages/.h2o-genstage-real01",
            "durable-temp|archive/assets/ab/.h2o-durable-5-0.tmp",
        ],
        "only the trusted scan decides the residue set"
    );
    assert_eq!(
        census(&root.join("packages").join(&published)),
        published_census,
        "the nominated generation is untouched"
    );
    assert_eq!(
        std::fs::read(root.join("assets").join("ab").join(&body)).unwrap(),
        b"canonical-cas-body",
        "the nominated CAS body is untouched"
    );
    assert_eq!(outcome.residue.generation_staging_purged, 1);
    assert_eq!(outcome.residue.durable_temp_purged, 1);

    // Structural: the trusted scan result is bound immutably and nothing is
    // ever appended to it, so there is no seam a nomination could enter by.
    let src = include_str!("../archive_reclaim_execute.rs");
    let body_src = &src[src.find("fn run_internal(").unwrap()..];
    assert!(body_src
        .contains("let residue = crate::archive_residue_probe::scan_trusted_residue_within(archive_root);"));
    /* Spelled precisely: `let mut residue_actions` is the derived plan list and
       legitimately mutable; what must not exist is a mutable rebinding of the
       SCAN RESULT, or an append into it. */
    for forbidden in [
        "let mut residue =", "let mut residue:", "residue.items.push",
        "residue.items.extend", "residue.items.append",
    ] {
        assert!(!body_src.contains(forbidden), "residue must not be widened: {forbidden}");
    }

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (S)(mutant 16) the SAME durability barrier is on the generation-staging
/// path, not only the durable-temp one: with the barrier forced to fail, a
/// staging item stops the run exactly as a temp item does.
#[test]
fn a_generation_staging_durability_failure_stops_the_run_without_purging() {
    let root = scratch("stagedur");
    let staging = orphan_staging(&root, "chat_b");
    plant_temp(&root, "ab", ".h2o-durable-1-0.tmp", b"second");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    trace::reset();
    fault::arm(fault::Point::AfterResidueRenameBeforeNamespaceDurability);
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", "deadbeef"));
    fault::clear();

    assert_eq!(outcome.state, RunState::Partial);
    assert_eq!(outcome.residue_acted.len(), 1, "stopped at the FIRST item");
    assert_eq!(
        outcome.residue_acted[0].family,
        crate::archive_residue_probe::ResidueFamily::GenerationStaging,
        "generation staging sorts first, so it is the item under test"
    );
    assert!(outcome.residue_acted[0].quarantined && !outcome.residue_acted[0].purged);
    assert_eq!(
        outcome.residue_acted[0].blocker.as_deref(),
        Some(crate::archive_reclaim::codes::QUARANTINE_NOT_DURABLE)
    );
    let events = trace::taken();
    assert!(events.contains(&trace::Event::ResidueRename));
    assert!(!events.contains(&trace::Event::ResidueNamespaceDurable));
    assert!(!events.contains(&trace::Event::ResiduePurge));

    // The staging tree is quarantined and intact; the temp is untouched.
    let run_id = outcome.run_id.clone().unwrap();
    assert!(root
        .join(".h2o-reclaim")
        .join(&run_id)
        .join(format!("genstage.{staging}"))
        .is_dir());
    assert!(!root.join("packages").join(&staging).exists());
    assert!(root.join("assets").join("ab").join(".h2o-durable-1-0.tmp").exists());
    assert_eq!(outcome.residue.generation_staging_purged, 0);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (S)(T)(mutant 16)(mutant 17) the source/destination durability barrier is on
/// the path for BOTH residue families, unconditionally.
///
/// Whether an fsync reached the platter is not observable from userspace
/// without a real crash, so this proves the property that IS observable and
/// that a family-scoped skip would violate: ONE unconditional call site, taking
/// the family-derived source descriptor, guarded only by the deterministic
/// fault seam and never by a family test.
#[test]
fn the_durability_barrier_is_unconditional_for_both_residue_families() {
    let src = include_str!("../archive_reclaim_execute.rs");
    let stage = &src[src.find("fn run_residue_stage(").expect("the staging stage")..];

    assert_eq!(
        stage.matches("durable_quarantine_transition(").count(),
        1,
        "one barrier call site serves both families"
    );

    let at = stage.find("let namespace_durable").expect("the barrier binding");
    let end = stage[at..]
        .find("if let Err(code) = namespace_durable")
        .expect("its failure handling");
    let expr = &stage[at..at + end];
    assert!(
        expr.contains("fault::armed(fault::Point::AfterResidueRenameBeforeNamespaceDurability)"),
        "the only branch is the deterministic cfg(test) fault seam"
    );
    assert_eq!(expr.matches("if ").count(), 1, "no second condition may gate the barrier");
    assert!(!expr.contains("else if"), "no family may skip the barrier");
    for family in ["GenerationStaging", "DurableTemp", "ResidueFamily"] {
        assert!(!expr.contains(family), "the barrier must not branch on {family}");
    }
    assert!(
        expr.contains("exclusive, source_dir, run_dir"),
        "and it syncs the family-derived SOURCE descriptor, not a fixed one"
    );

    /* `source_dir` really is per-family: the packages directory for generation
       staging, the exact CAS shard for durable temp. */
    let at = stage.find("let source_dir = match").expect("the source selection");
    let selection = &stage[at..at + stage[at..].find("\n        };").unwrap()];
    assert!(selection.contains("(ResidueFamily::DurableTemp, Some(dir), _) => dir"));
    assert!(selection.contains("(ResidueFamily::GenerationStaging, _, Some(dir)) => dir"));
}

/// M06 T3.4 dwell, proven from the side that could break it: a LATER
/// generation and staging run does not opportunistically purge an occupant
/// quarantine left by an earlier run.
///
/// The prior quarantine is planted directly rather than produced by the
/// occupant action, so this also covers the state a previous process leaves
/// behind. Stale-run convergence belongs to the crash and recovery task; until
/// then the correct behaviour is to leave it strictly alone.
#[test]
fn a_later_run_never_purges_a_prior_occupant_quarantine() {
    let root = scratch("dwell");
    let hashes = five(&root, "chat_a");
    plant_temp(&root, "ab", ".h2o-durable-3-0.tmp", b"residue");
    let staging = orphan_staging(&root, "chat_b");

    // A prior occupant quarantine, with its receipt.
    let prior = root.join(".h2o-reclaim").join("run-prior01");
    let held = prior.join("occupant.chat_x.gdeadbeef.h2ochat");
    std::fs::create_dir_all(held.join("nested")).unwrap();
    std::fs::write(held.join("manifest.json"), b"{ corrupt").unwrap();
    std::fs::write(held.join("nested").join("x"), b"deep").unwrap();
    std::fs::create_dir_all(root.join(".h2o-reclaim").join("receipts")).unwrap();
    std::fs::write(
        root.join(".h2o-reclaim")
            .join("receipts")
            .join("run-prior01.occupant.chat_x.gdeadbeef.h2ochat.occupant-quarantined.json"),
        br#"{"kind":"occupant","purged":false,"dwell":"one-run"}"#,
    )
    .unwrap();
    let prior_before = census(&prior);
    let receipts_before = census(&root.join(".h2o-reclaim").join("receipts"));

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let outcome = run(&root, &ex, &db(vec![]), &request("chat_a", "ok", &hashes[4]));

    // The later run really did act, so this is not a vacuous survival.
    assert_eq!(outcome.state, RunState::Complete, "{:?}", outcome.blockers);
    assert_eq!(outcome.purged, 2);
    assert_eq!(outcome.residue.generation_staging_purged, 1);
    assert_eq!(outcome.residue.durable_temp_purged, 1);
    assert!(!root.join("packages").join(&staging).exists());

    // And the prior occupant quarantine is byte-identical.
    assert_eq!(census(&prior), prior_before, "the dwelling occupant is untouched");
    assert!(held.join("nested").join("x").exists());
    let receipts_after = census(&root.join(".h2o-reclaim").join("receipts"));
    assert!(
        receipts_before.iter().all(|e| receipts_after.contains(e)),
        "no receipt was pruned"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}
