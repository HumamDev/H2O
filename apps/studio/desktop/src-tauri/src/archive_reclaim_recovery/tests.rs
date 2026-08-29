use super::*;
use crate::archive_durable_write::sha256_hex;
use crate::archive_instance_lock::ArchiveInstanceState;
use std::path::{Path, PathBuf};

fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t35r-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(dir.join("archive")).expect("scratch");
    dir.join("archive")
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

/// Plants `<reclaim>/run-<id>/<item>` with real content, as a crashed run would.
fn plant(root: &Path, run: &str, item: &str) -> PathBuf {
    let dir = root.join(".h2o-reclaim").join(format!("run-{run}")).join(item);
    std::fs::create_dir_all(dir.join("nested")).unwrap();
    std::fs::write(dir.join("manifest.json"), b"{}").unwrap();
    std::fs::write(dir.join("nested").join("x"), b"deep").unwrap();
    dir
}

fn gen_name(chat: &str, hex: u8) -> String {
    format!("{chat}.g{}.h2ochat", format!("{hex:02x}").repeat(32))
}

/// (A) a clean archive: the pass proves an absence and MANUFACTURES nothing.
#[test]
fn a_clean_archive_needs_no_recovery_and_creates_nothing() {
    let root = scratch("clean");
    std::fs::create_dir_all(root.join("packages")).unwrap();
    let owner = Owner::acquire(&root);
    let before = census(&root);
    let ex = owner.exclusive();

    let out = recover_and_record(&ex, &root);
    assert_eq!(out.state, RecoveryState::Clean);
    assert!(out.may_proceed() && !out.acted());
    assert_eq!(out.purged, 0);
    assert!(out.runs.is_empty() && out.blockers.is_empty());
    assert_eq!(census(&root), before, "a clean pass mutates nothing");
    assert!(!root.join(".h2o-reclaim").exists(), "and creates no namespace");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (B) all three committed families converge, through the T3.1 confined purge,
/// and the run namespace is left behind as evidence that a run existed.
#[test]
fn every_committed_family_converges_from_a_prior_run() {
    let root = scratch("families");
    let generation = plant(&root, "aa01", &gen_name("chat_a", 0xab));
    let staging = plant(&root, "aa01", "genstage..h2o-genstage-00ff01");
    let temp = plant(&root, "aa02", "durtmp.ab..h2o-durable-7-0.tmp");
    let occupant = plant(&root, "aa03", &format!("occupant.{}", gen_name("chat_b", 0xcd)));
    for p in [&generation, &staging, &temp, &occupant] {
        assert!(p.is_dir(), "the fixture really holds physical quarantine state");
    }

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let out = recover_and_record(&ex, &root);

    assert_eq!(out.state, RecoveryState::Converged, "{:?}", out.blockers);
    assert!(out.may_proceed() && out.acted());
    assert_eq!(out.purged, 4);
    assert_eq!(out.runs, vec!["run-aa01", "run-aa02", "run-aa03"]);
    assert!(out.unattributable.is_empty() && out.unrecognized_runs.is_empty());
    let mut kinds: Vec<&str> = out.recovered.iter().map(|r| r.kind).collect();
    kinds.sort();
    assert_eq!(kinds, vec!["generation", "occupant", "staging-temp", "staging-temp"]);
    assert!(out.recovered.iter().all(|r| r.purged && r.blocker.is_none()));

    for p in [&generation, &staging, &temp, &occupant] {
        assert!(!p.exists(), "{p:?} did not converge");
    }
    // The run namespaces remain: a recovery pass removes items, never evidence
    // that a run happened.
    for run in ["run-aa01", "run-aa02", "run-aa03"] {
        assert!(root.join(".h2o-reclaim").join(run).is_dir());
    }

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (C) REPEATED RECOVERY IS IDEMPOTENT: the first pass materially changes the
/// archive, the second changes nothing at all.
#[test]
fn repeated_recovery_is_idempotent() {
    let root = scratch("idempotent");
    plant(&root, "bb01", &gen_name("chat_a", 0xab));
    plant(&root, "bb01", "durtmp.cd..h2o-durable-1-0.tmp");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    let before = census(&root);
    let first = recover_and_record(&ex, &root);
    assert_eq!(first.purged, 2, "anti-vacuity: the first pass really acted");
    let after_first = census(&root);
    assert_ne!(after_first, before, "the first pass materially changed state");

    let second = recover_and_record(&ex, &root);
    assert_eq!(second.state, RecoveryState::Clean);
    assert_eq!(second.purged, 0);
    assert!(second.blockers.is_empty());
    assert_eq!(census(&root), after_first, "the second pass changed nothing");

    // And a third, to show convergence is stable rather than alternating.
    let third = recover_and_record(&ex, &root);
    assert_eq!(third.purged, 0);
    assert_eq!(census(&root), after_first);

    // Exactly ONE recovery record: a no-op pass owes no evidence and cannot
    // collide with the acting pass's receipt.
    let records: Vec<String> = std::fs::read_dir(root.join(".h2o-reclaim").join("receipts"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .filter(|n| n.contains("recovery"))
        .collect();
    assert_eq!(records.len(), 1, "{records:?}");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (D) RUN RECOGNITION. Only `run-<validated-id>` directories are runs. The
/// receipts sibling, foreign directories, malformed names and symlinks are
/// never purged, and the ambiguous ones stop the pass.
#[test]
fn only_validated_run_directories_are_recognized() {
    let root = scratch("recognition");
    let real = plant(&root, "cc01", &gen_name("chat_a", 0xab));
    let reclaim = root.join(".h2o-reclaim");
    // Evidence, a foreign directory and malformed run names.
    std::fs::create_dir_all(reclaim.join("receipts")).unwrap();
    std::fs::write(reclaim.join("receipts").join("prior.json"), b"{}").unwrap();
    std::fs::create_dir_all(reclaim.join("foreign")).unwrap();
    std::fs::write(reclaim.join("foreign").join("keep"), b"keep").unwrap();
    std::fs::create_dir_all(reclaim.join("run-")).unwrap();
    /* Ids the run charset genuinely refuses: a dot, a space, and the reserved
       prefix smuggled back in. (`run-bad` would be VALID — `bad` is a legal
       id — so it would be a recognized run, not a malformed one.) */
    std::fs::create_dir_all(reclaim.join("run-has.dot")).unwrap();
    std::fs::create_dir_all(reclaim.join("run-has space")).unwrap();
    std::fs::create_dir_all(reclaim.join("run-run-nested")).unwrap();
    std::fs::write(reclaim.join("notes.txt"), b"x").unwrap();
    let untouched = census(&reclaim.join("foreign"));

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let out = recover_stale_quarantine(&ex, &root);

    // `run-` with an empty id and `run-bad` are not validated ids; `foreign`,
    // `notes.txt` and the nested name are not runs at all.
    assert_eq!(out.runs, vec!["run-cc01"], "only the validated run");
    assert!(out.unrecognized_runs.contains(&"foreign".to_string()));
    assert!(out.unrecognized_runs.contains(&"notes.txt".to_string()));
    for malformed in ["run-", "run-has.dot", "run-has space", "run-run-nested"] {
        assert!(
            out.unrecognized_runs.contains(&malformed.to_string()),
            "{malformed} must be unrecognized"
        );
    }
    assert!(
        !out.unrecognized_runs.contains(&"receipts".to_string()),
        "the reserved evidence sibling is known, not unrecognized"
    );
    assert_eq!(out.purged, 1, "the real run still converged");
    assert!(!real.exists());

    // Nothing unrecognized was erased.
    assert_eq!(census(&reclaim.join("foreign")), untouched);
    assert!(reclaim.join("receipts").join("prior.json").exists());
    assert!(reclaim.join("notes.txt").exists());
    assert!(reclaim.join("run-").is_dir());
    assert!(reclaim.join("run-has.dot").is_dir());
    assert!(reclaim.join("run-has space").is_dir());
    assert!(reclaim.join("run-run-nested").is_dir());

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (E) a `run-` shaped SYMLINK is never followed and never purged: the pass
/// stops rather than guessing, and the link target survives byte-identical.
#[test]
fn a_symlinked_run_entry_is_refused_and_never_followed() {
    let root = scratch("runlink");
    let outside = root.parent().unwrap().join("outside");
    std::fs::create_dir_all(outside.join("precious")).unwrap();
    std::fs::write(outside.join("precious").join("data"), b"must survive").unwrap();
    let before_outside = census(&outside);
    std::fs::create_dir_all(root.join(".h2o-reclaim")).unwrap();
    std::os::unix::fs::symlink(&outside, root.join(".h2o-reclaim").join("run-dd01")).unwrap();

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let out = recover_stale_quarantine(&ex, &root);

    assert_eq!(out.state, RecoveryState::Blocked, "fail closed");
    assert!(!out.may_proceed(), "a governed run must not proceed over this");
    assert!(out
        .blockers
        .contains(&crate::archive_reclaim::codes::RUN_NOT_A_DIRECTORY.to_string()));
    assert_eq!(out.purged, 0);
    assert!(out.runs.is_empty(), "it never became a run");
    assert_eq!(census(&outside), before_outside, "the target is untouched");
    assert!(root.join(".h2o-reclaim").join("run-dd01").exists(), "the link itself remains");

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (F) ATTRIBUTION. Every committed family grammar is recognized; anything else
/// is unattributable, stops the pass, and is LEFT IN PLACE.
#[test]
fn an_unattributable_quarantine_entry_fails_closed_and_survives() {
    let root = scratch("attribution");
    // Exactly the four committed identity grammars.
    assert_eq!(
        attribute(&QuarantineComponent::parse(&gen_name("chat_a", 0xab)).unwrap()),
        Some(QuarantineKind::Generation)
    );
    assert_eq!(
        attribute(&QuarantineComponent::parse("genstage..h2o-genstage-00ff01").unwrap()),
        Some(QuarantineKind::StagingTemp)
    );
    assert_eq!(
        attribute(&QuarantineComponent::parse("durtmp.ab..h2o-durable-1-0.tmp").unwrap()),
        Some(QuarantineKind::StagingTemp)
    );
    assert_eq!(
        attribute(&QuarantineComponent::parse("occupant.chat_a.h2ochat").unwrap()),
        Some(QuarantineKind::Occupant)
    );
    // And nothing else.
    for foreign in [
        "notes.txt", "chat_a.h2ochat", "genstage", "durtmp", "occupant",
        "sha256-abc", "random", ".h2o-genstage-00ff01",
    ] {
        assert_eq!(
            attribute(&QuarantineComponent::parse(foreign).unwrap()),
            None,
            "{foreign} must not be attributable"
        );
    }

    let survivor = plant(&root, "ee01", "mystery-entry");
    let sibling = plant(&root, "ee01", &gen_name("chat_a", 0xab));
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let out = recover_stale_quarantine(&ex, &root);

    assert_eq!(out.state, RecoveryState::Blocked);
    assert!(!out.may_proceed());
    assert!(out.blockers.contains(&codes::ITEM_UNATTRIBUTABLE.to_string()));
    assert!(out.unattributable.contains(&"run-ee01/mystery-entry".to_string()));
    assert!(survivor.is_dir(), "an unattributable entry is never deleted");
    assert!(sibling.is_dir(), "and the pass stopped before its siblings");
    assert_eq!(out.purged, 0);

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (G) recovery reaches NO canonical namespace. It cannot restore, and it
/// cannot touch a package or a CAS body, because it opens neither.
#[test]
fn recovery_can_reach_no_canonical_namespace() {
    let code: String = include_str!("../archive_reclaim_recovery.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    for forbidden in [
        "open_packages_dir", "open_cas_shard_dir", "CAS_DIR", "\"packages\"",
        "\"assets\"", "sha256-", "archive_cas_scan", "observed_unreferenced",
        "quarantine_generation", "quarantine_residue", "quarantine_occupant",
        /* Spelled precisely: a bare "rename" is a substring of serde's
           `rename_all` attribute, which this module uses legitimately. */
        "rename_within", "renameat", "std::fs::rename", "promote_",
        "restore", "purge_run", "purge_all", "PathBuf",
        "std::fs::", "unlinkat", "remove_dir", "remove_file",
    ] {
        assert!(!code.contains(forbidden), "recovery must not reach {forbidden}");
    }
    /* It removes ONLY through the T3.1 confined primitive, and names its
       targets only through the typed constructor. */
    assert_eq!(code.matches("purge_quarantined_item(").count(), 1);
    assert_eq!(code.matches("QuarantineTarget::parse(").count(), 1);
    // Exact identifier tokens: no time authority of any kind.
    let tokens: std::collections::BTreeSet<&str> = code
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .collect();
    for forbidden in [
        "st_mtime", "st_ctime", "st_birthtime", "SystemTime", "Instant",
        "UNIX_EPOCH", "elapsed", "modified", "created", "age", "older_than",
        "now", "timestamp", "Duration", "sort_by_key", "dwell_expired",
    ] {
        assert!(!tokens.contains(forbidden), "no time authority: {forbidden}");
    }
    // Dormant.
    assert!(!code.contains("#[tauri::command]"));
    let lib = include_str!("../lib.rs");
    assert!(lib.contains("pub mod archive_reclaim_recovery;"));
    assert!(!lib.contains("archive_reclaim_recovery::"), "registered in no handler");
}

/// (H) the recovery record accounts for what the pass did, in the committed
/// schema-v2 family, and is written ONLY by a pass that acted.
#[test]
fn the_recovery_record_accounts_for_every_purged_item() {
    let root = scratch("record");
    plant(&root, "ff01", &gen_name("chat_a", 0xab));
    plant(&root, "ff01", "occupant.chat_b.gcd.h2ochat");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();

    let out = recover_and_record(&ex, &root);
    assert_eq!(out.purged, 2, "{:?}", out.blockers);

    let file = std::fs::read_dir(root.join(".h2o-reclaim").join("receipts"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.to_string_lossy().contains("recovery"))
        .expect("a recovery record");
    let name = file.file_name().unwrap().to_string_lossy().to_string();
    assert!(name.starts_with("recovery-"), "distinct from a run namespace: {name}");
    assert!(!name.starts_with("run-"), "a recovery record is not a run");
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    assert_eq!(value["schema"], "h2o.m06.reclamationRun");
    assert_eq!(value["schemaVersion"], 2);
    assert_eq!(value["stages"], serde_json::json!(["stale-quarantine-recovery"]));
    assert_eq!(value["recovery"]["state"], "converged");
    assert_eq!(value["recovery"]["purged"], 2);
    let items = value["recovery"]["items"].as_array().unwrap();
    assert_eq!(items.len(), 2, "every acted item is accounted for");
    assert!(items.iter().all(|i| i["purged"] == true));
    assert!(items.iter().any(|i| i["kind"] == "generation"));
    assert!(items.iter().any(|i| i["kind"] == "occupant"));
    // No absolute host path in the evidence.
    let raw = std::fs::read_to_string(&file).unwrap();
    assert!(!raw.contains(root.to_str().unwrap()));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

// ── M06 P3 assembled gate evidence ─────────────────────────────────────────

/// Every M06 module that participates in candidacy, residue, dwell or recovery.
const M06_MODULES: &[(&str, &str)] = &[
    ("archive_reclaim", include_str!("../archive_reclaim.rs")),
    ("archive_reclaim_execute", include_str!("../archive_reclaim_execute.rs")),
    ("archive_occupant_quarantine", include_str!("../archive_occupant_quarantine.rs")),
    ("archive_reclaim_recovery", include_str!("../archive_reclaim_recovery.rs")),
    ("archive_residue_probe", include_str!("../archive_residue_probe.rs")),
    ("archive_retention_plan", include_str!("../archive_retention_plan.rs")),
    ("archive_package_scan", include_str!("../archive_package_scan.rs")),
    ("archive_generation_order", include_str!("../archive_generation_order.rs")),
    ("archive_db_probe", include_str!("../archive_db_probe.rs")),
    ("archive_cas_scan", include_str!("../archive_cas_scan.rs")),
    ("archive_reclamation_preview", include_str!("../archive_reclamation_preview.rs")),
];

fn code_of(source: &str) -> String {
    source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn tokens_of(code: &str) -> std::collections::BTreeSet<String> {
    code.split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

/// AC-M06-06 — NO TIME AUTHORITY, across every M06 module at final P3 HEAD.
///
/// Not one of them can read a filesystem timestamp or a wall clock, so neither
/// deletion candidacy, residue identity, stale-run recognition nor occupant
/// dwell can possibly derive from age. `savedAt` remains ordering authority and
/// is content, parsed by T1.5 — never a filesystem attribute.
#[test]
fn no_m06_module_holds_a_timestamp_or_age_authority() {
    for (name, source) in M06_MODULES {
        let tokens = tokens_of(&code_of(source));
        for forbidden in [
            "st_mtime", "st_ctime", "st_birthtime", "st_atime", "st_mtimespec",
            "SystemTime", "Instant", "UNIX_EPOCH", "elapsed", "modified",
            "created", "now", "timestamp", "Duration", "duration_since",
            "age", "max_age", "older_than", "newer_than", "expires",
        ] {
            assert!(!tokens.contains(forbidden), "[{name}] time authority: {forbidden}");
        }
    }
    /* And dwell specifically is a run/event relationship, not an ordering: the
       recovery pass precedes the fresh run id, so what it can see is a prior
       run by construction. Nothing sorts run ids to decide age. */
    let execute = code_of(include_str!("../archive_reclaim_execute.rs"));
    let recovery_at = execute.find("recover_and_record(exclusive, archive_root)").expect("wired");
    /* The CALL site, not the definition, which appears earlier in the file. */
    let run_id_at = execute
        .find("let run_id = match generate_run_id()")
        .expect("the fresh run id is minted in the sequence");
    assert!(
        recovery_at < run_id_at,
        "recovery must run BEFORE the current run has an identity, or dwell needs a clock"
    );
    let recovery = code_of(include_str!("../archive_reclaim_recovery.rs"));
    for forbidden in ["sort_by_key", "cmp_by_time", "is_older", "run_id <", "run_id >"] {
        assert!(!recovery.contains(forbidden), "run ids are identity, not a clock: {forbidden}");
    }
}

/// AC-M06-02 — NO CAS DESTRUCTIVE ROUTE, across every M06 module at final P3
/// HEAD. Canonical CAS is analysed read-only and mutated nowhere.
#[test]
fn no_m06_module_holds_a_cas_destructive_route() {
    for (name, source) in M06_MODULES {
        let code = code_of(source);
        /* Spelled to hit DESTRUCTION only. `collect_cas_roots` is the T1.4
           read-only reference collection, which §G explicitly permits for
           analysis, so a bare "collect_cas" would ban the analysis rather than
           a mutation. */
        for forbidden in [
            "QuarantineKind::Cas", "quarantine_cas", "purge_cas", "unlink_cas",
            "restore_cas", "collect_cas_object", "cas_purge", "cas_unlink",
            "cas_rename", "Cas =>",
        ] {
            assert!(!code.contains(forbidden), "[{name}] CAS destructive route: {forbidden}");
        }
    }
    /* The kind enum is matched EXHAUSTIVELY here: adding a Cas variant fails to
       compile this test rather than slipping past a token scan. */
    for kind in [
        QuarantineKind::Generation,
        QuarantineKind::StagingTemp,
        QuarantineKind::Occupant,
    ] {
        let label = match kind {
            QuarantineKind::Generation => "generation",
            QuarantineKind::StagingTemp => "staging-temp",
            QuarantineKind::Occupant => "occupant",
        };
        assert!(!label.contains("cas") && !label.contains("asset") && !label.contains("sha"));
    }
    /* Exactly ONE seam names the CAS root at all, and it is a rename SOURCE
       opener whose only consumer refuses every non-reserved source name. */
    let reclaim = code_of(include_str!("../archive_reclaim.rs"));
    assert_eq!(reclaim.matches("CAS_DIR").count(), 1);
    assert!(reclaim.contains("is_reserved_component(source.as_str())"));
    // Recovery reaches no canonical namespace at all.
    let recovery = code_of(include_str!("../archive_reclaim_recovery.rs"));
    for forbidden in ["CAS_DIR", "open_cas_shard_dir", "open_packages_dir", "assets"] {
        assert!(!recovery.contains(forbidden), "recovery must not reach {forbidden}");
    }
}

/// AC-M06-13 — DORMANCY at final P3 HEAD. Not one destructive authority is
/// registered: not generation execute, not staging, not occupant, not recovery.
#[test]
fn the_whole_destructive_core_is_unregistered_at_final_p3_head() {
    let lib = include_str!("../lib.rs");
    for module in [
        "archive_reclaim", "archive_reclaim_execute", "archive_occupant_quarantine",
        "archive_reclaim_recovery",
    ] {
        assert!(lib.contains(&format!("pub mod {module};")), "{module} compiled");
        assert!(
            !lib.contains(&format!("{module}::")),
            "{module} must appear in no handler arm"
        );
    }
    for forbidden in [
        "h2o_archive_reclaim", "h2o_archive_execute", "h2o_archive_purge",
        "h2o_archive_quarantine", "h2o_archive_delete", "h2o_archive_occupant",
        "h2o_archive_recover", "h2o_archive_staging",
        "execute_generation_reclamation", "execute_occupant_quarantine",
        "recover_and_record", "run_residue_stage",
    ] {
        assert!(!lib.contains(forbidden), "{forbidden} must not be registered");
    }
    // No destructive module declares a command, in code.
    for (name, source) in M06_MODULES {
        if *name == "archive_residue_probe" || *name == "archive_reclamation_preview" {
            // These own the T1.3 / T2.3 READ-ONLY commands.
            continue;
        }
        assert!(
            !code_of(source).contains("#[tauri::command]"),
            "[{name}] declares a command"
        );
    }
    // The two registered M06 commands are read-only by name and by module.
    for command in ["h2o_archive_durable_temp_residue", "h2o_archive_reclamation_preview"] {
        assert!(lib.contains(command), "{command} is the read-only surface");
    }
}

/// AC-M06-05 / AC-M06-13 — renderer surface preservation at final P3 HEAD:
/// no archive mutation grant, and an Analyze-only New UI.
#[test]
fn the_renderer_surface_remains_read_only_and_analyze_only() {
    const ARCHIVE_READ_ONLY: &[&str] = &[
        "fs:allow-exists", "fs:allow-read-file", "fs:allow-read-text-file",
        "fs:allow-lstat", "fs:allow-read-dir",
    ];
    let mut inspected = 0;
    for capability in [
        include_str!("../../capabilities/archive-cas.json"),
        include_str!("../../capabilities/archive-export.json"),
        include_str!("../../capabilities/default.json"),
    ] {
        let value: serde_json::Value = serde_json::from_str(capability).expect("capability json");
        let Some(entries) = value["permissions"].as_array() else { continue };
        for entry in entries {
            let Some(identifier) = entry["identifier"].as_str() else { continue };
            if !serde_json::to_string(&entry["allow"])
                .unwrap_or_default()
                .contains("$APPLOCALDATA/archive")
            {
                continue;
            }
            inspected += 1;
            assert!(
                ARCHIVE_READ_ONLY.contains(&identifier),
                "{identifier} grants the renderer non-read authority over the archive"
            );
        }
    }
    assert!(inspected > 0, "the archive grants were actually inspected");

    let ui = include_str!(
        "../../../../../../src-surfaces-base/studio/ingestion/saved-chat-reclamation-ui.studio.js"
    );
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
        "h2o_archive_reclaim", "h2o_archive_occupant", "h2o_archive_recover",
        "h2o_archive_purge", "h2o_archive_execute",
    ] {
        assert!(!ui.contains(forbidden), "no destructive invoke in the UI: {forbidden}");
    }
}

/// AC-M06-12 — NO COLLATERAL at final P3 HEAD: no migration, no live-v3
/// activation and no Sync or Chrome reach from any M06 module.
#[test]
fn no_m06_module_reaches_migration_live_v3_sync_or_chrome() {
    for (name, source) in M06_MODULES {
        let code = code_of(source);
        /* MUTATING SQL only. `PRAGMA table_info` is read-only introspection —
           it is how the trusted probe proves a required table exists and fails
           closed when it does not — so banning the bare word would ban the
           fail-closed check itself. */
        for forbidden in [
            "migration", "MIGRATION", "user_version =", "PRAGMA user_version",
            "ALTER TABLE", "CREATE TABLE", "DROP TABLE", "INSERT INTO",
            "UPDATE ", "DELETE FROM", "live_v3", "liveV3", "H2O Studio Sync",
            "chrome", "buildSavedChatPackageV3",
        ] {
            assert!(!code.contains(forbidden), "[{name}] collateral reach: {forbidden}");
        }
    }
}

/// (mutant 8) FIRST MATERIAL FAILURE. A purge that genuinely cannot complete
/// stops the pass before any later item, and blocks the governed run.
///
/// The failure is real, not injected: the run directory is made unwritable, so
/// the confined purge cannot unlink out of it.
#[test]
fn a_real_purge_failure_stops_recovery_before_the_next_item() {
    use std::os::unix::fs::PermissionsExt;

    let root = scratch("purgefail");
    let first = plant(&root, "aa01", &gen_name("chat_a", 0x11));
    let second = plant(&root, "aa01", &gen_name("chat_b", 0x22));
    let other_run = plant(&root, "bb02", &gen_name("chat_c", 0x33));
    let run_dir = root.join(".h2o-reclaim").join("run-aa01");
    std::fs::set_permissions(&run_dir, std::fs::Permissions::from_mode(0o500)).unwrap();

    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    let out = recover_stale_quarantine(&ex, &root);

    assert_eq!(out.state, RecoveryState::Blocked, "a purge failure must block");
    assert!(!out.may_proceed(), "the governed run must not proceed");
    assert!(out.blockers.contains(&codes::PURGE_FAILED.to_string()));
    assert_eq!(out.purged, 0, "nothing converged");
    assert_eq!(out.recovered.len(), 1, "it stopped at the FIRST failing item");
    assert!(!out.recovered[0].purged);
    assert_eq!(out.recovered[0].blocker.as_deref(), Some(codes::PURGE_FAILED));

    // The later item and the later run were never attempted.
    assert!(second.exists(), "the next item in the run was not attempted");
    assert!(other_run.exists(), "and neither was the next run");
    assert!(first.exists(), "the failing item's own directory survives");

    // A governed run over this archive refuses rather than layering fresh
    // deletions on top of an unconverged one.
    std::fs::set_permissions(&run_dir, std::fs::Permissions::from_mode(0o700)).unwrap();
    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}
