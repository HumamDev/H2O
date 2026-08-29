use super::*;
use crate::archive_durable_write::sha256_hex;
use crate::archive_instance_lock::ArchiveInstanceState;
use std::path::{Path, PathBuf};

/// A disposable archive root. Never the production archive.
fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t31-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(dir.join("archive")).expect("scratch");
    dir.join("archive")
}

/// Real P1 exclusive ownership over the disposable root. The purge primitive
/// cannot be called without this, so every test must legitimately acquire it.
struct Owner {
    state: Box<ArchiveInstanceState>,
}
impl Owner {
    fn acquire(root: &Path) -> Owner {
        let state = Box::new(ArchiveInstanceState::default());
        state.ensure_presence(root).expect("shared presence");
        Owner { state }
    }
    fn exclusive(&self) -> crate::archive_instance_lock::ExclusiveOwnership<'_> {
        self.state.try_acquire_exclusive().expect("exclusive ownership")
    }
}

/// Canonical archive content that MUST survive every destructive fixture.
fn plant_canonical(root: &Path) -> Vec<(String, String)> {
    let pkg = root.join("packages").join("chat_a.gaa.h2ochat");
    std::fs::create_dir_all(&pkg).unwrap();
    std::fs::write(pkg.join("manifest.json"), b"{\"schema\":\"x\"}").unwrap();
    std::fs::write(pkg.join("snapshot.json"), b"{\"savedAt\":\"x\"}").unwrap();
    let shard = root.join("assets").join("ab");
    std::fs::create_dir_all(&shard).unwrap();
    std::fs::write(shard.join(format!("sha256-{}", "ab".repeat(32))), b"cas-body").unwrap();
    std::fs::write(root.join(".h2o-archive.lock"), b"").unwrap();
    census(root)
}

/// name -> sha256 of contents (or "dir"), for every entry under `base`.
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

fn canonical_only(all: &[(String, String)]) -> Vec<(String, String)> {
    all.iter()
        .filter(|(n, _)| !n.starts_with("/.h2o-reclaim"))
        .cloned()
        .collect()
}

/// Plants `<reclaim>/<run>/<item>` with a nested tree, returning the item path.
fn plant_quarantined(root: &Path, run: &str, item: &str) -> PathBuf {
    let item_dir = root.join(".h2o-reclaim").join(run).join(item);
    std::fs::create_dir_all(item_dir.join("assets")).unwrap();
    std::fs::create_dir_all(item_dir.join("nested").join("deeper")).unwrap();
    std::fs::write(item_dir.join("manifest.json"), b"{}").unwrap();
    std::fs::write(item_dir.join("assets").join("a.png"), b"bytes").unwrap();
    std::fs::write(item_dir.join("nested").join("deeper").join("x"), b"deep").unwrap();
    item_dir
}

/// (A) the namespace is the T1.2 canonical identity, not a restated literal.
#[test]
fn the_quarantine_namespace_is_the_canonical_t12_identity() {
    assert_eq!(RECLAIM_NAMESPACE_COMPONENT, ".h2o-reclaim");
    let source = include_str!("../archive_reclaim.rs");
    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(
        !code.contains("\".h2o-reclaim\""),
        "the namespace must be consumed from the canonical constant, not restated"
    );
    assert!(code.contains("RECLAIM_NAMESPACE_COMPONENT"));
    // And it is reserved by the T1.2 authority.
    assert!(crate::archive_durable_write::is_reserved_component(".h2o-reclaim"));
}

/// (K) traversal, separators and absolute paths are refused at construction.
#[test]
fn components_refuse_traversal_separators_and_absolute_paths() {
    for bad in ["", "   ", ".", "..", "a/b", "a\\b", "/abs", "../escape", "a/../b"] {
        assert!(
            QuarantineComponent::parse(bad).is_err(),
            "{bad:?} must be refused"
        );
    }
    assert!(QuarantineComponent::parse("run-1").is_ok());
    assert!(QuarantineComponent::parse("chat_a.gaa.h2ochat").is_ok());

    // (J) the receipts namespace is not a run.
    assert_eq!(
        QuarantineTarget::parse(RECEIPTS_NAMESPACE, "x", QuarantineKind::Generation)
            .err()
            .as_deref(),
        Some(codes::COMPONENT_RESERVED)
    );
}

/// (E)(F)(G)(H)(I) the canonical archive is UNREACHABLE — not refused at
/// runtime, but unnameable by the argument types.
#[test]
fn the_canonical_archive_cannot_be_named_by_the_purge_api() {
    // Every canonical location requires a separator or traversal to express,
    // and both are refused at construction.
    for canonical in [
        "archive", "archive/packages", "packages", "archive/assets", "assets",
        "assets/ab/sha256-aaaa", "../packages", "../../archive",
        ".h2o-reclaim", "/Users/x/Library/Application Support",
    ] {
        let refused = QuarantineComponent::parse(canonical).is_err()
            || QuarantineTarget::parse(canonical, "x", QuarantineKind::Generation).is_err();
        assert!(refused || !canonical.contains('/'), "{canonical:?}");
    }
    // A bare name that IS parseable can still only ever address
    // <reclaim>/<run>/<item> — never a sibling of the reclaim root.
    let t = QuarantineTarget::parse("packages", "chat_a.gaa.h2ochat", QuarantineKind::Generation)
        .expect("parses as a run IDENTITY");
    assert_eq!(
        t.archive_relative_path(),
        "archive/.h2o-reclaim/run-packages/chat_a.gaa.h2ochat",
        "a run id of 'packages' still resolves INSIDE quarantine, under run-"
    );
    assert!(t.archive_relative_path().starts_with("archive/.h2o-reclaim/"));

    // (I) there is no API that addresses the reclaim root or a whole run.
    let source = include_str!("../archive_reclaim.rs");
    assert!(!source.contains("pub fn purge_run"));
    assert!(!source.contains("pub fn purge_reclaim_root"));
    assert!(!source.contains("pub fn purge_all"));
}

/// CORRECTION B — the run namespace is structurally `run-<id>`. A caller
/// supplies an IDENTITY, never a directory name, so no arbitrary top-level
/// component can become a run.
#[test]
fn the_quarantine_run_namespace_is_structurally_run_prefixed() {
    // (4) a valid identity derives exactly run-<id>.
    let run = QuarantineRunId::parse("1").expect("valid id");
    assert_eq!(run.component(), "run-1");
    assert_eq!(QuarantineRunId::parse("abc_DEF-9").unwrap().component(), "run-abc_DEF-9");

    let target = QuarantineTarget::parse("1", "chat_a.gaa.h2ochat", QuarantineKind::Generation)
        .expect("valid target");
    assert_eq!(target.run_component(), "run-1");
    assert_eq!(
        target.archive_relative_path(),
        "archive/.h2o-reclaim/run-1/chat_a.gaa.h2ochat"
    );
    assert!(target.archive_relative_path().starts_with("archive/.h2o-reclaim/run-"));

    // (5) a bare arbitrary component can never BE the run directory: it is
    // always re-prefixed, so `foo` addresses `run-foo`, never `foo`.
    for arbitrary in ["foo", "tmp", "receipts2", "packages", "assets"] {
        let t = QuarantineTarget::parse(arbitrary, "x", QuarantineKind::Occupant).unwrap();
        assert_eq!(t.run_component(), format!("run-{arbitrary}"));
        assert_ne!(t.run_component(), arbitrary, "the raw component is unreachable");
    }

    // (6) reserved siblings cannot be constructed as a run at all.
    for reserved in [RECEIPTS_NAMESPACE, RECLAIM_NAMESPACE_COMPONENT] {
        assert_eq!(
            QuarantineRunId::parse(reserved).err().as_deref(),
            Some(codes::COMPONENT_RESERVED),
            "{reserved} must not be a run"
        );
    }

    // (7) malformed identities are refused.
    let cases: &[(&str, &str)] = &[
        ("", codes::RUN_ID_EMPTY),
        ("   ", codes::RUN_ID_EMPTY),
        (".", codes::COMPONENT_TRAVERSAL),
        ("..", codes::COMPONENT_TRAVERSAL),
        ("a/b", codes::COMPONENT_SEPARATOR),
        ("a\\b", codes::COMPONENT_SEPARATOR),
        ("/abs", codes::COMPONENT_SEPARATOR),
        ("a\0b", codes::COMPONENT_SEPARATOR),
        ("run-1", codes::RUN_ID_PREFIXED),
        ("run-", codes::RUN_ID_PREFIXED),
        ("has space", codes::RUN_ID_CHARSET),
        ("dots.in.id", codes::RUN_ID_CHARSET),
    ];
    for (bad, expected) in cases {
        assert_eq!(
            QuarantineRunId::parse(bad).err().as_deref(),
            Some(*expected),
            "{bad:?} must be refused"
        );
    }

    // A doubly-prefixed directory can never be produced.
    assert!(!QuarantineRunId::parse("1").unwrap().component().contains("run-run-"));
}

/// CORRECTION B behavioural — a run directory that is NOT `run-` prefixed is
/// unreachable, so quarantine content parked under a bare name is untouched.
#[test]
fn a_non_run_prefixed_directory_cannot_be_addressed() {
    let root = scratch("bare-run");
    let canonical_before = plant_canonical(&root);
    let owner = Owner::acquire(&root);

    // Content parked under a BARE component beside a real run.
    let bare = root.join(".h2o-reclaim").join("foo");
    std::fs::create_dir_all(bare.join("item")).unwrap();
    std::fs::write(bare.join("item").join("x"), b"bare").unwrap();
    let real = plant_quarantined(&root, "run-1", "item");
    std::fs::create_dir_all(root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE)).unwrap();
    std::fs::write(
        root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE).join("r.json"),
        b"{}",
    )
    .unwrap();

    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");

    // Asking for "foo" resolves to run-foo, which does not exist.
    let t = QuarantineTarget::parse("foo", "item", QuarantineKind::Occupant).unwrap();
    let outcome = purge_quarantined_item(&ex, &reclaim, &t);
    assert!(outcome.already_absent, "run-foo does not exist");
    assert_eq!(outcome.removed, 0);
    assert!(bare.join("item").join("x").exists(), "the bare directory is untouched");

    // Receipts remain unreachable and intact.
    assert!(QuarantineTarget::parse(RECEIPTS_NAMESPACE, "r.json", QuarantineKind::Occupant).is_err());
    assert!(root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE).join("r.json").exists());

    // The real run-1 item still purges normally, so this is not vacuous.
    let real_target = QuarantineTarget::parse("1", "item", QuarantineKind::Generation).unwrap();
    let ok = purge_quarantined_item(&ex, &reclaim, &real_target);
    assert!(ok.converged && !ok.already_absent, "{:?}", ok.blockers);
    assert!(!real.exists());
    assert!(bare.join("item").join("x").exists(), "still untouched");
    assert_eq!(canonical_only(&census(&root)), canonical_only(&canonical_before));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (P) NO CAS destructive target exists — the Revision 2 pin. Structural, and
/// executable: the kind enum is matched exhaustively.
#[test]
fn no_cas_destructive_target_type_or_route_exists() {
    // Exhaustive match: adding a Cas variant fails to compile here.
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
    let code: String = include_str!("../archive_reclaim.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    for forbidden in [
        "Cas", "CasObject", "Asset", "Sha", "\"assets\"", "CAS_DIR",
        "archive_cas_scan", "sha256-",
    ] {
        assert!(!code.contains(forbidden), "no CAS destructive route: {forbidden}");
    }
}

/// (C)(M)(O) a nested quarantined item purges fully, and every canonical byte
/// and sibling survives byte/name-identical.
#[test]
fn a_nested_quarantined_item_purges_while_canonical_state_survives() {
    let root = scratch("purge");
    // 1. disposable pre-state
    let canonical_before = plant_canonical(&root);
    let owner = Owner::acquire(&root);
    let item = plant_quarantined(&root, "run-1", "chat_a.gaa.h2ochat");
    let sibling = plant_quarantined(&root, "run-2", "chat_b.gbb.h2ochat");
    std::fs::create_dir_all(root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE)).unwrap();
    std::fs::write(
        root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE).join("run-1.json"),
        b"{\"evidence\":true}",
    )
    .unwrap();
    let reclaim_before = census(&root.join(".h2o-reclaim"));
    // 2. the target really is inside quarantine
    assert!(item.starts_with(root.join(".h2o-reclaim")));
    assert!(item.exists());

    // 3. ONE bounded mutation
    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");
    let target =
        QuarantineTarget::parse("1", "chat_a.gaa.h2ochat", QuarantineKind::Generation).unwrap();
    let outcome = purge_quarantined_item(&ex, &reclaim, &target);

    // 4. first result
    assert!(outcome.converged, "{:?}", outcome.blockers);
    assert!(!outcome.already_absent);
    assert!(outcome.removed >= 6, "nested tree removed: {}", outcome.removed);
    assert!(outcome.blockers.is_empty());
    assert!(!item.exists(), "the target is gone");

    // 5. everything else is byte/name-identical
    assert_eq!(
        canonical_only(&census(&root)),
        canonical_only(&canonical_before),
        "canonical archive must be untouched"
    );
    assert!(sibling.exists(), "the sibling run survives");
    assert!(
        root.join(".h2o-reclaim").join(RECEIPTS_NAMESPACE).join("run-1.json").exists(),
        "receipts survive item purge"
    );
    let reclaim_after = census(&root.join(".h2o-reclaim"));
    let survivors: Vec<_> = reclaim_before
        .iter()
        .filter(|(n, _)| !n.starts_with("/run-1/chat_a.gaa.h2ochat"))
        .cloned()
        .collect();
    assert_eq!(reclaim_after, survivors, "only the target subtree changed");

    // (F) A run literally named "packages" must still resolve inside
    // quarantine. The real canonical package of the same name must survive —
    // this is what fails if the .h2o-reclaim confinement is ever removed.
    let real_package = root.join("packages").join("chat_a.gaa.h2ochat");
    assert!(real_package.exists(), "precondition: the canonical package exists");
    let decoy =
        QuarantineTarget::parse("packages", "chat_a.gaa.h2ochat", QuarantineKind::Generation)
            .unwrap();
    let decoy_outcome = purge_quarantined_item(&ex, &reclaim, &decoy);
    assert!(decoy_outcome.already_absent, "nothing of that name exists in quarantine");
    assert_eq!(decoy_outcome.removed, 0);
    assert!(real_package.exists(), "the CANONICAL package must be untouched");
    assert!(real_package.join("manifest.json").exists());

    // (G) the same for a CAS-shaped run/item pair.
    let cas_object = root.join("assets").join("ab").join(format!("sha256-{}", "ab".repeat(32)));
    assert!(cas_object.exists(), "precondition: the CAS body exists");
    let cas_decoy = QuarantineTarget::parse("assets", "ab", QuarantineKind::Occupant).unwrap();
    let cas_outcome = purge_quarantined_item(&ex, &reclaim, &cas_decoy);
    assert!(cas_outcome.already_absent);
    assert!(cas_object.exists(), "the CANONICAL CAS body must be untouched");

    // 6. re-run convergence (D): idempotent, and siblings still intact
    let again = purge_quarantined_item(&ex, &reclaim, &target);
    assert!(again.converged && again.already_absent && again.removed == 0);
    assert_eq!(census(&root.join(".h2o-reclaim")), reclaim_after);
    assert_eq!(canonical_only(&census(&root)), canonical_only(&canonical_before));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (L) a symlink inside quarantine has its ENTRY removed and is never
/// traversed: the external sentinel is untouched.
#[test]
fn a_symlink_inside_quarantine_cannot_escape() {
    let root = scratch("symlink");
    let canonical_before = plant_canonical(&root);
    let owner = Owner::acquire(&root);

    // An external sentinel, outside the archive entirely.
    let outside = scratch("sentinel");
    let sentinel_dir = outside.join("precious");
    std::fs::create_dir_all(&sentinel_dir).unwrap();
    std::fs::write(sentinel_dir.join("keep.txt"), b"must survive").unwrap();
    let sentinel_before = census(&outside);

    let item = plant_quarantined(&root, "run-1", "item");
    std::os::unix::fs::symlink(&sentinel_dir, item.join("escape")).unwrap();
    std::os::unix::fs::symlink(root.join("packages"), item.join("to-packages")).unwrap();
    std::os::unix::fs::symlink(root.join("assets"), item.join("to-assets")).unwrap();

    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");
    let target = QuarantineTarget::parse("1", "item", QuarantineKind::Occupant).unwrap();
    let outcome = purge_quarantined_item(&ex, &reclaim, &target);

    assert!(outcome.converged, "{:?}", outcome.blockers);
    assert!(!item.exists());
    // The symlink targets are all intact.
    assert_eq!(census(&outside), sentinel_before, "external sentinel untouched");
    assert!(sentinel_dir.join("keep.txt").exists());
    assert_eq!(
        canonical_only(&census(&root)),
        canonical_only(&canonical_before),
        "packages and assets untouched through the symlinks"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
    let _ = std::fs::remove_dir_all(outside.parent().unwrap());
}

/// (L) the QUARANTINED ITEM ITSELF being a symlink: its entry is removed and
/// the target is never followed. Distinct from a symlink nested inside the
/// item, and it exercises a different branch.
#[test]
fn a_quarantined_item_that_is_itself_a_symlink_cannot_escape() {
    let root = scratch("item-symlink");
    let canonical_before = plant_canonical(&root);
    let owner = Owner::acquire(&root);

    let outside = scratch("item-sentinel");
    let sentinel_dir = outside.join("precious");
    std::fs::create_dir_all(&sentinel_dir).unwrap();
    std::fs::write(sentinel_dir.join("keep.txt"), b"must survive").unwrap();
    let sentinel_before = census(&outside);

    // The ITEM is a symlink, not a directory.
    let run_dir = root.join(".h2o-reclaim").join("run-1");
    std::fs::create_dir_all(&run_dir).unwrap();
    let link = run_dir.join("item");
    std::os::unix::fs::symlink(&sentinel_dir, &link).unwrap();
    // A second item that is a symlink to the canonical packages directory.
    let pkg_link = run_dir.join("to-packages");
    std::os::unix::fs::symlink(root.join("packages"), &pkg_link).unwrap();

    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");

    for name in ["item", "to-packages"] {
        let target = QuarantineTarget::parse("1", name, QuarantineKind::Occupant).unwrap();
        let outcome = purge_quarantined_item(&ex, &reclaim, &target);
        assert!(outcome.converged, "{name}: {:?}", outcome.blockers);
        assert_eq!(outcome.removed, 1, "{name}: exactly the link entry");
    }
    assert!(!link.exists() && !pkg_link.exists(), "the link entries are gone");

    // Nothing the links pointed at was touched.
    assert_eq!(census(&outside), sentinel_before, "external sentinel untouched");
    assert!(sentinel_dir.join("keep.txt").exists());
    assert_eq!(
        canonical_only(&census(&root)),
        canonical_only(&canonical_before),
        "the canonical packages directory survived a symlinked item"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
    let _ = std::fs::remove_dir_all(outside.parent().unwrap());
}

/// (D) an absent run or item converges idempotently without damaging anything.
#[test]
fn purging_an_absent_target_converges_without_damage() {
    let root = scratch("absent");
    let canonical_before = plant_canonical(&root);
    let owner = Owner::acquire(&root);
    let keeper = plant_quarantined(&root, "run-keep", "keep-me");

    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");
    for (run, item) in [("missing", "x"), ("keep", "missing-item")] {
        let target = QuarantineTarget::parse(run, item, QuarantineKind::StagingTemp).unwrap();
        let outcome = purge_quarantined_item(&ex, &reclaim, &target);
        assert!(outcome.converged && outcome.already_absent, "{run}/{item}");
        assert_eq!(outcome.removed, 0);
        assert!(outcome.blockers.is_empty());
    }
    assert!(keeper.exists(), "the real item is untouched");
    assert_eq!(canonical_only(&census(&root)), canonical_only(&canonical_before));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (N) partial failure is reported honestly rather than claimed as converged.
#[test]
fn a_blocked_subtree_reports_partial_failure_honestly() {
    let root = scratch("partial");
    let owner = Owner::acquire(&root);
    let item = plant_quarantined(&root, "run-1", "item");
    // Make one nested directory unreadable/unmodifiable so removal must fail.
    let blocked = item.join("nested");
    let mut perms = std::fs::metadata(&blocked).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o500);
    std::fs::set_permissions(&blocked, perms).unwrap();

    let ex = owner.exclusive();
    let reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");
    let target = QuarantineTarget::parse("1", "item", QuarantineKind::Generation).unwrap();
    let outcome = purge_quarantined_item(&ex, &reclaim, &target);

    if outcome.converged {
        // Running as a user who can bypass the mode bit; disclose rather than
        // assert a guarantee the environment did not provide.
        assert!(!item.exists());
    } else {
        assert!(!outcome.blockers.is_empty(), "failure must be reported");
        assert!(item.exists(), "a failed purge must not claim the item is gone");
    }

    let mut perms = std::fs::metadata(&blocked).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut perms, 0o700);
    let _ = std::fs::set_permissions(&blocked, perms);
    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (B) the reclaim root is derived only beneath a supplied trusted archive
/// root, and there is no host-path purge API.
#[test]
fn the_reclaim_root_is_derived_only_beneath_a_trusted_archive_root() {
    let root = scratch("derive");
    let owner = Owner::acquire(&root);
    let ex = owner.exclusive();
    assert!(!root.join(".h2o-reclaim").exists(), "precondition");
    let _reclaim = open_reclaim_root_for_test(&ex, &root).expect("reclaim root");
    assert!(root.join(".h2o-reclaim").is_dir(), "created beneath the given root");

    // A nonexistent archive root fails closed and creates nothing.
    let missing = root.parent().unwrap().join("no-such-archive");
    assert!(open_reclaim_root_for_test(&ex, &missing).is_err());
    assert!(!missing.exists(), "nothing was created");

    // (T) the purge API takes no path type at all.
    let source = include_str!("../archive_reclaim.rs");
    let sig_start = source.find("pub fn purge_quarantined_item").unwrap();
    let sig = &source[sig_start..sig_start + 260];
    assert!(sig.contains("ExclusiveOwnership"), "exclusive ownership is required by type");
    assert!(sig.contains("&ReclaimRoot") && sig.contains("&QuarantineTarget"));
    for forbidden in ["PathBuf", "&Path", "&str", "String"] {
        assert!(!sig.contains(forbidden), "purge must not accept {forbidden}");
    }
    /* CORRECTION A: the PRODUCTION constructor accepts no filesystem root at
       all, and derives the canonical archive root itself. */
    let ctor_start = source.find("pub fn open_reclaim_root(").unwrap();
    let ctor = &source[ctor_start..source[ctor_start..].find(") -> ").unwrap() + ctor_start];
    assert!(ctor.contains("app: &tauri::AppHandle"), "the app handle is the root authority");
    assert!(ctor.contains("ExclusiveOwnership"), "exclusive ownership is still required");
    for forbidden in ["Path", "PathBuf", "String", "root:", "dir:"] {
        assert!(!ctor.contains(forbidden), "production constructor must not accept {forbidden}");
    }
    /* It derives the root through the EXISTING authority, not a second one. */
    let body_start = source.find("pub fn open_reclaim_root(").unwrap();
    let body = &source[body_start..body_start + 700];
    assert!(
        body.contains("archive_durable_write::archive_root(app)"),
        "must derive the canonical archive root through the existing authority"
    );
    /* Counted in CODE only: the doc comment above legitimately names the
       authority it delegates to, and banning that would pressure someone into
       deleting an accurate comment. */
    let code_only: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        code_only.matches("archive_durable_write::archive_root").count(),
        1,
        "no second archive-root implementation"
    );

    /* The disposable-root seam is compiled out of production entirely. */
    let seam = source.find("pub(crate) fn open_reclaim_root_for_test").unwrap();
    assert!(
        source[..seam].trim_end().ends_with("#[cfg(test)]"),
        "the disposable-root seam must be cfg(test)-gated"
    );
    /* The private mechanics helper is not reachable from outside the module. */
    assert!(source.contains("fn open_reclaim_root_within("));
    assert!(!source.contains("pub fn open_reclaim_root_within("));

    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(!code.contains("PathBuf"), "no owned path may enter the destructive module");

    /* EVERY function in this module that touches a filesystem path must be one
       of the two known confinement seams. A new path-taking API — however it is
       named — fails here, which is what stops a `purge_path` escape hatch from
       being added later. */
    let mut path_fns: Vec<String> = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("//") {
            continue;
        }
        if trimmed.starts_with("fn ") || trimmed.starts_with("pub fn ") || trimmed.starts_with("pub(crate) fn ") {
            let name = trimmed
                .split("fn ")
                .nth(1)
                .and_then(|rest| rest.split(['(', '<']).next())
                .unwrap_or_default()
                .to_string();
            path_fns.push(name);
        }
    }
    /* Re-scan by declaration block so a path argument is attributed to its fn. */
    let mut owners: Vec<String> = Vec::new();
    for (idx, _) in source.match_indices("std::path::Path") {
        let before = &source[..idx];
        let decl = before.rfind("fn ").expect("a path argument belongs to a function");
        let name = source[decl + 3..]
            .split(['(', '<'])
            .next()
            .unwrap_or_default()
            .trim()
            .to_string();
        if !owners.contains(&name) {
            owners.push(name);
        }
    }
    owners.sort();
    /* The permitted set. T3.2 added two more seams, both crate-internal and
       both deriving a descriptor from a trusted archive root:
       `open_reclaim_root_for_run` and `open_packages_dir`. The latter is a
       RENAME SOURCE only — no operation consuming it can unlink. A new
       path-taking API of any other name still fails here. */
    assert_eq!(
        owners,
        vec![
            "open_packages_dir".to_string(),
            "open_reclaim_root_for_run".to_string(),
            "open_reclaim_root_for_test".to_string(),
            "open_reclaim_root_within".to_string(),
        ],
        "only the known confinement seams may touch a filesystem path"
    );
    /* None of them is publicly reachable, and the DESTRUCTIVE primitives take
       no path at all. */
    for seam in ["open_reclaim_root_within", "open_reclaim_root_for_run", "open_packages_dir"] {
        assert!(
            !source.contains(&format!("pub fn {seam}")),
            "{seam} must not be publicly reachable"
        );
    }
    for destructive in ["pub fn purge_quarantined_item", "pub fn quarantine_generation"] {
        let at = source.find(destructive).expect(destructive);
        let sig = &source[at..at + source[at..].find(" -> ").unwrap()];
        assert!(!sig.contains("Path"), "{destructive} must not accept a path");
    }
    assert!(path_fns.contains(&"open_reclaim_root".to_string()));

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// The durability primitive synchronizes BOTH directories of the namespace
/// transition.
///
/// Whether an fsync truly reached the platter is not observable from userspace
/// without a real crash, so this proves the property that IS observable: both
/// descriptors are synchronized, and dropping either is caught.
#[test]
fn the_quarantine_transition_synchronizes_both_directories() {
    let source = include_str!("../archive_reclaim.rs");
    let at = source
        .find("pub fn durable_quarantine_transition")
        .expect("durability primitive");
    let body = &source[at..at + source[at..].find("\n}").unwrap()];
    assert!(body.contains("run.dir\n        .sync()"), "the destination is synchronized");
    assert!(body.contains("packages\n        .sync()"), "the source is synchronized");
    assert_eq!(body.matches(".sync()").count(), 2, "exactly two directory syncs");
    /* Both failures are reported as the same fail-closed code. */
    assert_eq!(body.matches("QUARANTINE_NOT_DURABLE").count(), 2);

    // And it really runs against a disposable archive.
    let root = scratch("nsdur");
    std::fs::create_dir_all(root.join("packages")).unwrap();
    let owner = ArchiveInstanceState::default();
    owner.ensure_presence(&root).expect("shared");
    let ex = owner.try_acquire_exclusive().expect("exclusive");
    let reclaim = open_reclaim_root_for_run(&ex, &root).expect("reclaim");
    let run = reclaim
        .create_run(&ex, &QuarantineRunId::parse("dur").unwrap())
        .expect("run");
    let packages = open_packages_dir(&ex, &root).expect("packages");
    assert!(
        durable_quarantine_transition(&ex, &packages, &run).is_ok(),
        "the transition synchronizes cleanly on a healthy archive"
    );

    let _ = ex.release();
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (Q)(R)(S) the destructive core is DORMANT: no command, no capability change,
/// no UI route.
#[test]
fn the_destructive_core_is_dormant_and_unregistered() {
    let source = include_str!("../archive_reclaim.rs");
    assert!(!source.contains("#[tauri::command]"), "no destructive command may exist");

    let lib = include_str!("../lib.rs");
    assert!(lib.contains("pub mod archive_reclaim;"), "the module is compiled");
    // Nothing from this module is in either invoke-handler arm.
    assert!(!lib.contains("archive_reclaim::"), "no reclaim function is registered");
    for forbidden in [
        "h2o_archive_reclaim", "h2o_archive_purge", "h2o_archive_quarantine",
        "h2o_archive_execute", "h2o_archive_delete", "h2o_archive_collect",
    ] {
        assert!(!lib.contains(forbidden), "{forbidden} must not be registered");
    }

    // (R) the archive capability grants no mutation, unchanged by T3.1.
    let capability = include_str!("../../capabilities/archive-cas.json");
    let parsed: serde_json::Value = serde_json::from_str(capability).unwrap();
    let granted: Vec<String> = parsed["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["identifier"].as_str().unwrap_or_default().to_string())
        .collect();
    for forbidden in ["fs:allow-remove", "fs:allow-rename", "fs:allow-write-file", "fs:allow-mkdir"] {
        assert!(!granted.contains(&forbidden.to_string()), "{forbidden} must not be granted");
    }
}
