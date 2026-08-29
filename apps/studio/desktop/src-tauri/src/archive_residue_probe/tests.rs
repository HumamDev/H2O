use super::*;
use std::fs;

fn temp_root(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t13-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::create_dir_all(&dir).expect("temp root");
    dir
}

fn shard(root: &std::path::Path, name: &str) -> std::path::PathBuf {
    let dir = root.join(CAS_DIR).join(name);
    fs::create_dir_all(&dir).expect("shard");
    dir
}

/// (A)(B)(C)(D)(G)(H) residue across several shards, with unrelated content.
#[test]
fn durable_temp_residue_is_found_across_shards_with_exact_paths() {
    let root = temp_root("found");
    let ab = shard(&root, "ab");
    let cd = shard(&root, "cd");
    let ef = shard(&root, "ef");

    fs::write(ab.join(".h2o-durable-9-1.tmp"), b"x").unwrap();
    fs::write(ab.join(".h2o-durable-9-0.tmp"), b"x").unwrap();
    fs::write(cd.join(".h2o-durable-7-0.tmp"), b"x").unwrap();

    // (G) ordinary CAS blobs are not residue.
    fs::write(ab.join(format!("sha256-{}", "ab".repeat(32))), b"blob").unwrap();
    fs::write(cd.join(format!("sha256-{}", "cd".repeat(32))), b"blob").unwrap();
    // (H)(I)(J) unrelated dotfiles and the reserved identities are not residue.
    fs::write(ef.join(".DS_Store"), b"x").unwrap();
    fs::write(ef.join(".h2o-archive.lock"), b"x").unwrap();
    fs::create_dir_all(ef.join(".h2o-reclaim")).unwrap();
    // Near-miss names that must NOT match the family.
    fs::write(ef.join(".h2o-durable-9-2"), b"x").unwrap();
    fs::write(ef.join("h2o-durable-9-3.tmp"), b"x").unwrap();

    let result = probe_durable_temp_within(&root);

    assert!(result.complete, "a clean walk is complete: {:?}", result.blockers);
    assert_eq!(result.count, 3);
    assert_eq!(result.count, result.entries.len(), "count is derived from the list");
    let paths: Vec<&str> = result.entries.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(
        paths,
        vec![
            "archive/assets/ab/.h2o-durable-9-0.tmp",
            "archive/assets/ab/.h2o-durable-9-1.tmp",
            "archive/assets/cd/.h2o-durable-7-0.tmp",
        ],
        "exact archive-relative paths, deterministically ordered"
    );
    let mut sorted = paths.clone();
    sorted.sort();
    assert_eq!(paths, sorted, "ordering must not depend on readdir order");
    assert!(result.entries.iter().all(|e| e.kind == DURABLE_TEMP_KIND));
    assert_eq!(result.root, "archive/assets");

    let _ = fs::remove_dir_all(&root);
}

/// (E) a complete walk that finds nothing reports an AUTHORITATIVE zero.
#[test]
fn a_complete_walk_with_no_residue_is_an_authoritative_zero() {
    let root = temp_root("zero");
    let ab = shard(&root, "ab");
    fs::write(ab.join(format!("sha256-{}", "ab".repeat(32))), b"blob").unwrap();

    let result = probe_durable_temp_within(&root);
    assert!(result.complete);
    assert_eq!(result.count, 0);
    assert!(result.entries.is_empty());
    assert!(result.blockers.is_empty());

    // An absent CAS root is also a proven absence, not a failure.
    let empty = temp_root("empty");
    let missing = probe_durable_temp_within(&empty);
    assert!(missing.complete, "a missing assets dir is proven absence");
    assert_eq!(missing.count, 0);

    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&empty);
}

/// (F) an unwalkable shard can never yield an authoritative zero.
#[test]
fn an_unreadable_shard_cannot_produce_an_authoritative_zero() {
    let root = temp_root("blocked");
    let ab = shard(&root, "ab");
    fs::write(ab.join(".h2o-durable-1-0.tmp"), b"x").unwrap();

    // A symlink standing where a shard directory should be. O_NOFOLLOW must
    // refuse to traverse it, and the walk must then declare itself incomplete
    // rather than reporting only what it happened to see.
    let target = temp_root("elsewhere");
    std::os::unix::fs::symlink(&target, root.join(CAS_DIR).join("cd")).unwrap();

    let result = probe_durable_temp_within(&root);
    assert!(!result.complete, "a shard that was not traversed breaks completeness");
    assert!(result.blockers.contains(&codes::SHARD_NOT_A_DIRECTORY.to_string()));
    // Observed items are still reported.
    assert_eq!(result.count, 1);

    // And with NO observable residue the result is still not an authoritative zero.
    let root2 = temp_root("blocked-empty");
    fs::create_dir_all(root2.join(CAS_DIR)).unwrap();
    std::os::unix::fs::symlink(&target, root2.join(CAS_DIR).join("ab")).unwrap();
    let empty = probe_durable_temp_within(&root2);
    assert_eq!(empty.count, 0);
    assert!(!empty.complete, "count 0 from an incomplete walk is not authority");

    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&root2);
    let _ = fs::remove_dir_all(&target);
}

/// Non-shard names are unrelated content, not garbage and not an error.
#[test]
fn non_shard_names_are_unrelated_not_residue_and_not_a_failure() {
    let root = temp_root("nonshard");
    let assets = root.join(CAS_DIR);
    fs::create_dir_all(&assets).unwrap();
    fs::create_dir_all(assets.join("AB")).unwrap(); // uppercase: not canonical
    fs::create_dir_all(assets.join("abc")).unwrap(); // wrong length
    fs::create_dir_all(assets.join("zz")).unwrap(); // not hex
    fs::write(assets.join("notes.txt"), b"x").unwrap();
    // A durable-temp inside a NON-shard directory is out of the canonical
    // layout, so it is not claimed by this probe.
    fs::write(assets.join("abc").join(".h2o-durable-1-0.tmp"), b"x").unwrap();

    let result = probe_durable_temp_within(&root);
    assert!(result.complete, "unrelated names do not break the walk");
    assert_eq!(result.count, 0);
    assert!(result.blockers.is_empty());

    let _ = fs::remove_dir_all(&root);
}

/// (D) Ordering and count are established by `seal`, not by luck: readdir may
/// happen to return names already sorted, which would let an unsorted
/// implementation pass a filesystem-driven test. This drives `seal` directly
/// with deliberately out-of-order entries so the guarantee is proven.
#[test]
fn seal_sorts_deterministically_and_derives_the_count() {
    let entry = |shard: &str, name: &str| ResidueEntry {
        path: format!("archive/assets/{shard}/{name}"),
        name: name.to_string(),
        shard: shard.to_string(),
        kind: DURABLE_TEMP_KIND,
    };
    let mut residue = DurableTempResidue::new();
    residue.entries = vec![
        entry("cd", ".h2o-durable-7-0.tmp"),
        entry("ab", ".h2o-durable-9-1.tmp"),
        entry("ab", ".h2o-durable-9-0.tmp"),
    ];
    residue.count = 999; // whatever was there before must not survive
    let sealed = residue.seal();

    assert_eq!(
        sealed.entries.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
        vec![
            "archive/assets/ab/.h2o-durable-9-0.tmp",
            "archive/assets/ab/.h2o-durable-9-1.tmp",
            "archive/assets/cd/.h2o-durable-7-0.tmp",
        ],
        "seal must impose a total order regardless of input order"
    );
    assert_eq!(sealed.count, 3, "count is derived from the list, not carried");
}

/// (P) the probe module exposes no destructive vocabulary at all.
#[test]
fn the_probe_carries_no_destructive_capability() {
    /* Scanned in CODE. T3.3's scan documents WHY a genuine staging entry is a
       directory — the publisher creates it with `mkdir_child_exclusive` — and
       banning that sentence would ban an accurate explanation rather than a
       capability. The ban on the call itself is unchanged, and the positive
       allowlist below is strictly stronger than the token ban was. */
    let source: String = include_str!("../archive_residue_probe.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    let source = source.as_str();

    /* Every confined primitive this module invokes, in code. The set is
       READ-ONLY: open, list, stat. Anything that creates, writes, renames or
       removes is absent — and a new one appearing here fails the assertion
       rather than slipping past a token blacklist. */
    let mut used: Vec<&str> = [
        "open_root(", "open_existing_nofollow(", "open_child_nofollow(",
        "open_child_read_nofollow(", "read_entry_names(", "stat_child_nofollow(",
        "mkdir_child(", "mkdir_child_exclusive(", "create_new_child(",
        "unlink_child(", "unlink_child_dir(", "rename_within(",
        "promote_exclusive(", "promote_dir_exclusive(", "sync(",
    ]
    .into_iter()
    .filter(|call| source.contains(call))
    .collect();
    used.sort();
    assert_eq!(
        used,
        vec![
            "open_child_nofollow(",
            "open_existing_nofollow(",
            "read_entry_names(",
            "stat_child_nofollow(",
        ],
        "the residue module may only OPEN, LIST and STAT"
    );

    for forbidden in [
        "unlinkat",
        "remove_file",
        "remove_dir",
        "renameat",
        "std::fs::rename",
        "O_CREAT",
        "O_TRUNC",
        "O_WRONLY",
        "O_RDWR",
        "mkdirat",
        "mkdir_child",
        "open_root(",
    ] {
        assert!(
            !source.contains(forbidden),
            "read-only probe must not reference {forbidden}"
        );
    }
}

/// (O) the command takes no caller-supplied path — structurally, not by check.
#[test]
fn the_command_accepts_no_caller_supplied_path() {
    let source = include_str!("../archive_residue_probe.rs");
    let start = source
        .find("pub async fn h2o_archive_durable_temp_residue")
        .expect("command present");
    let signature = &source[start..start + 160];
    assert!(
        signature.contains("app: tauri::AppHandle"),
        "the app handle is the only input"
    );
    for path_shaped in ["path:", "relative:", "root:", "options:", "request:"] {
        assert!(
            !signature.contains(path_shaped),
            "command must not accept {path_shaped} — it derives its own root"
        );
    }
}

// ── M06 T3.3 — the trusted two-family destructive-side scan ────────────────

fn packages(root: &std::path::Path) -> std::path::PathBuf {
    let dir = root.join("packages");
    fs::create_dir_all(&dir).expect("packages");
    dir
}

fn ids(scan: &TrustedResidueScan) -> Vec<String> {
    scan.items
        .iter()
        .map(|i| format!("{}|{}", i.family().kind(), i.archive_relative_path()))
        .collect()
}

/// (A)(AE) both families are enumerated completely and trusted-side, and a
/// canonical CAS body sharing the shard is never one of them.
#[test]
fn the_trusted_scan_enumerates_both_established_families() {
    let root = temp_root("t33-both");
    let pkgs = packages(&root);
    fs::create_dir_all(pkgs.join(".h2o-genstage-00ff01")).unwrap();
    fs::write(pkgs.join(".h2o-genstage-00ff01").join("snapshot.json"), b"{}").unwrap();
    fs::create_dir_all(pkgs.join(".h2o-genstage-00ff02")).unwrap();
    // A canonical generation, a legacy package and an occupant: not residue.
    fs::create_dir_all(pkgs.join(format!("chat_a.g{}.h2ochat", "ab".repeat(32)))).unwrap();
    fs::create_dir_all(pkgs.join("chat_a.h2ochat")).unwrap();
    fs::write(pkgs.join("corrupt.h2ochat"), b"junk").unwrap();

    let ab = shard(&root, "ab");
    fs::write(ab.join(".h2o-durable-9-0.tmp"), b"t").unwrap();
    fs::write(ab.join(format!("sha256-{}", "ab".repeat(32))), b"body").unwrap();
    let cd = shard(&root, "cd");
    fs::write(cd.join(".h2o-durable-9-0.tmp"), b"t").unwrap();

    let scan = scan_trusted_residue_within(&root);
    assert!(scan.complete, "{:?}", scan.blockers);
    assert!(scan.indeterminate.is_empty(), "{:?}", scan.indeterminate);
    assert_eq!(
        ids(&scan),
        vec![
            "generation-staging|archive/packages/.h2o-genstage-00ff01",
            "generation-staging|archive/packages/.h2o-genstage-00ff02",
            "durable-temp|archive/assets/ab/.h2o-durable-9-0.tmp",
            "durable-temp|archive/assets/cd/.h2o-durable-9-0.tmp",
        ]
    );
    assert_eq!(scan.count_of(ResidueFamily::GenerationStaging), 2);
    assert_eq!(scan.count_of(ResidueFamily::DurableTemp), 2);
    /* The same basename under two shards is TWO distinct items: this is the
       collision the quarantine identity has to survive. */
    assert_eq!(
        scan.items[2].name(),
        scan.items[3].name(),
        "the durable writer really can mint one basename per shard"
    );
    assert_ne!(scan.items[2].shard(), scan.items[3].shard());

    let _ = fs::remove_dir_all(&root);
}

/// (B) the durable-temp half CALLS the existing trusted probe rather than
/// re-implementing its grammar, and that probe's external contract is unchanged.
#[test]
fn the_durable_temp_half_reuses_the_existing_probe() {
    let source = include_str!("../archive_residue_probe.rs");
    let at = source.find("fn scan_durable_temp_within").expect("present");
    let body = &source[at..at + source[at..].find("\n}").unwrap()];
    assert!(
        body.contains("probe_durable_temp_within(archive_root)"),
        "the destructive side must consume the existing probe"
    );
    /* Exactly ONE grammar authority for each family name, in code, past the
       import that names them. Every constant comes from T1.2's shared list. */
    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    let body = &code[code.find("pub const DURABLE_TEMP_KIND").expect("past the imports")..];
    for grammar in ["TEMP_PREFIX", "TEMP_SUFFIX", "GENERATION_STAGING_PREFIX"] {
        assert_eq!(
            body.matches(grammar).count(),
            1,
            "exactly one authority decides the {grammar} family"
        );
    }

    // The T1.3 external contract is preserved, value for value.
    let root = temp_root("t33-contract");
    let ab = shard(&root, "ab");
    fs::write(ab.join(".h2o-durable-3-0.tmp"), b"t").unwrap();
    let probe = probe_durable_temp_within(&root);
    assert!(probe.complete);
    assert_eq!(probe.count, 1);
    assert_eq!(probe.kind, DURABLE_TEMP_KIND);
    assert_eq!(probe.root, "archive/assets");
    assert_eq!(probe.entries[0].path, "archive/assets/ab/.h2o-durable-3-0.tmp");
    assert_eq!(probe.entries[0].shard, "ab");
    let _ = fs::remove_dir_all(&root);
}

/// (D) an unwalkable location is INCOMPLETE, never an empty result. Both roots.
#[test]
fn an_incomplete_walk_can_never_present_as_zero_residue() {
    // A shard standing behind a symlink: O_NOFOLLOW refused to look inside.
    let root = temp_root("t33-blindshard");
    let real = root.join("elsewhere");
    fs::create_dir_all(&real).unwrap();
    fs::write(real.join(".h2o-durable-1-0.tmp"), b"hidden").unwrap();
    fs::create_dir_all(root.join(CAS_DIR)).unwrap();
    std::os::unix::fs::symlink(&real, root.join(CAS_DIR).join("ab")).unwrap();
    let scan = scan_trusted_residue_within(&root);
    assert!(!scan.complete, "an unwalked shard is not an empty shard");
    assert!(scan.items.is_empty(), "and nothing hidden behind it is a target");
    assert!(scan.blockers.contains(&codes::SHARD_NOT_A_DIRECTORY.to_string()));
    let _ = fs::remove_dir_all(&root);

    // The packages directory itself replaced by a file.
    let root = temp_root("t33-blindpkgs");
    fs::write(root.join("packages"), b"not a directory").unwrap();
    let scan = scan_trusted_residue_within(&root);
    assert!(!scan.complete);
    assert!(scan.items.is_empty());
    assert!(scan.blockers.contains(&codes::PACKAGES_UNREADABLE.to_string()));
    let _ = fs::remove_dir_all(&root);

    // A genuinely absent packages directory IS a proven zero.
    let root = temp_root("t33-nopkgs");
    let scan = scan_trusted_residue_within(&root);
    assert!(scan.complete, "proven absence is authoritative");
    assert!(scan.items.is_empty());
    let _ = fs::remove_dir_all(&root);
}

/// (E)(H) a `.h2o-genstage-*` NAME is not enough: the entry must be a real,
/// non-symlink directory, and a symlink is never followed or promoted.
#[test]
fn generation_staging_requires_the_exact_publisher_entry_type() {
    let root = temp_root("t33-stagetype");
    let pkgs = packages(&root);
    let decoy = root.join("decoy");
    fs::create_dir_all(&decoy).unwrap();
    fs::write(decoy.join("secret"), b"must survive").unwrap();

    fs::create_dir_all(pkgs.join(".h2o-genstage-real00")).unwrap();
    std::os::unix::fs::symlink(&decoy, pkgs.join(".h2o-genstage-link00")).unwrap();
    fs::write(pkgs.join(".h2o-genstage-file00"), b"not a directory").unwrap();
    // A name that shares the prefix but is unbounded.
    fs::create_dir_all(pkgs.join(format!(".h2o-genstage-{}", "z".repeat(200)))).unwrap();

    let scan = scan_trusted_residue_within(&root);
    assert!(scan.complete, "each entry's type was determined, so the walk is complete");
    assert_eq!(
        ids(&scan),
        vec!["generation-staging|archive/packages/.h2o-genstage-real00"],
        "only the real directory is actionable"
    );
    let reasons: Vec<&str> = scan.indeterminate.iter().map(|i| i.reason).collect();
    assert!(reasons.contains(&reasons::SYMLINK));
    assert!(reasons.contains(&reasons::NOT_A_DIRECTORY));
    assert!(reasons.contains(&reasons::NAME_SHAPE));
    assert_eq!(scan.indeterminate.len(), 3);
    assert!(decoy.join("secret").exists(), "the symlink target was never traversed");
    let _ = fs::remove_dir_all(&root);
}

/// (F)(H) a `.h2o-durable-*.tmp` NAME is not enough either: it must be a real,
/// non-symlink regular file inside a real shard.
#[test]
fn durable_temp_requires_the_exact_writer_entry_type() {
    let root = temp_root("t33-temptype");
    let ab = shard(&root, "ab");
    let decoy = root.join("decoy");
    fs::create_dir_all(&decoy).unwrap();
    fs::write(decoy.join("secret"), b"must survive").unwrap();

    fs::write(ab.join(".h2o-durable-1-0.tmp"), b"real").unwrap();
    std::os::unix::fs::symlink(&decoy, ab.join(".h2o-durable-2-0.tmp")).unwrap();
    fs::create_dir_all(ab.join(".h2o-durable-3-0.tmp")).unwrap();

    let scan = scan_trusted_residue_within(&root);
    assert!(scan.complete);
    assert_eq!(
        ids(&scan),
        vec!["durable-temp|archive/assets/ab/.h2o-durable-1-0.tmp"],
        "only the real regular file is actionable"
    );
    let reasons: Vec<&str> = scan.indeterminate.iter().map(|i| i.reason).collect();
    assert!(reasons.contains(&reasons::SYMLINK));
    assert!(reasons.contains(&reasons::NOT_A_REGULAR_FILE));
    assert!(decoy.join("secret").exists(), "the symlink target was never traversed");
    let _ = fs::remove_dir_all(&root);
}

/// (G) foreign entries that merely resemble a residue name are not residue.
#[test]
fn foreign_lookalikes_are_never_classified_as_residue() {
    let root = temp_root("t33-foreign");
    let pkgs = packages(&root);
    for name in [
        ".h2o-genstag-00ff01",
        "h2o-genstage-00ff01",
        ".h2o-genstage",
        ".h2o-durable-1-0.tmp",
        ".DS_Store",
    ] {
        fs::create_dir_all(pkgs.join(name)).unwrap();
    }
    let ab = shard(&root, "ab");
    for name in [
        ".h2o-durabl-1-0.tmp",
        "h2o-durable-1-0.tmp",
        ".h2o-durable-1-0.tmp.bak",
        ".h2o-genstage-00ff01",
        format!("sha256-{}", "ab".repeat(32)).as_str(),
    ] {
        fs::write(ab.join(name), b"x").unwrap();
    }
    // Not a shard at all: never walked, never residue.
    let deep = root.join(CAS_DIR).join("zzz");
    fs::create_dir_all(&deep).unwrap();
    fs::write(deep.join(".h2o-durable-1-0.tmp"), b"x").unwrap();

    let scan = scan_trusted_residue_within(&root);
    assert!(scan.complete);
    /* Not one of these is residue. The reserved prefix carries its trailing
       separator — `.h2o-genstage-` — so even `.h2o-genstage` misses it; a
       durable-temp name is only residue inside a CAS shard and a staging name
       only inside packages; a suffixed `.bak` fails the exact `.tmp` ending;
       and `zzz` is not a shard, so it is never walked. */
    assert!(ids(&scan).is_empty(), "{:?}", ids(&scan));
    assert!(scan.indeterminate.is_empty(), "{:?}", scan.indeterminate);
    assert!(deep.join(".h2o-durable-1-0.tmp").exists(), "a non-shard is never walked");
    let _ = fs::remove_dir_all(&root);
}

/// (AA) enumeration order is a stable trusted identity sort, never filesystem
/// order: the same set built in the opposite order plans identically.
#[test]
fn the_trusted_scan_order_is_deterministic_not_filesystem_order() {
    let names = ["00ff01", "00ff02", "00ff03", "00ff04", "00ff05"];
    let shards = ["ab", "cd", "ef", "01", "fe"];

    let forward = temp_root("t33-order-f");
    let fp = packages(&forward);
    for n in names {
        fs::create_dir_all(fp.join(format!(".h2o-genstage-{n}"))).unwrap();
    }
    for sh in shards {
        fs::write(shard(&forward, sh).join(".h2o-durable-5-0.tmp"), b"t").unwrap();
    }

    let reverse = temp_root("t33-order-r");
    let rp = packages(&reverse);
    for n in names.iter().rev() {
        fs::create_dir_all(rp.join(format!(".h2o-genstage-{n}"))).unwrap();
    }
    for sh in shards.iter().rev() {
        fs::write(shard(&reverse, sh).join(".h2o-durable-5-0.tmp"), b"t").unwrap();
    }

    let a = scan_trusted_residue_within(&forward);
    let b = scan_trusted_residue_within(&reverse);
    assert_eq!(ids(&a), ids(&b), "insertion order must not reach action order");
    assert_eq!(
        ids(&a),
        vec![
            "generation-staging|archive/packages/.h2o-genstage-00ff01",
            "generation-staging|archive/packages/.h2o-genstage-00ff02",
            "generation-staging|archive/packages/.h2o-genstage-00ff03",
            "generation-staging|archive/packages/.h2o-genstage-00ff04",
            "generation-staging|archive/packages/.h2o-genstage-00ff05",
            "durable-temp|archive/assets/01/.h2o-durable-5-0.tmp",
            "durable-temp|archive/assets/ab/.h2o-durable-5-0.tmp",
            "durable-temp|archive/assets/cd/.h2o-durable-5-0.tmp",
            "durable-temp|archive/assets/ef/.h2o-durable-5-0.tmp",
            "durable-temp|archive/assets/fe/.h2o-durable-5-0.tmp",
        ],
        "family rank, then trusted archive identity"
    );
    // And re-running against one root is stable.
    assert_eq!(ids(&scan_trusted_residue_within(&forward)), ids(&a));

    let _ = fs::remove_dir_all(&forward);
    let _ = fs::remove_dir_all(&reverse);
}

/// (AL) the residue authority contains no timestamp, age or wall-clock notion.
#[test]
fn residue_identity_uses_no_time_authority() {
    let code: String = include_str!("../archive_residue_probe.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    /* Exact identifier tokens, not substrings: `age` lives inside `package`
       and `age_` inside `package_scan`, both of which this module says
       legitimately. A substring ban would pressure someone into renaming
       accurate code rather than removing a real capability. */
    let tokens: std::collections::BTreeSet<&str> = code
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .filter(|t| !t.is_empty())
        .collect();
    for forbidden in [
        "st_mtime", "st_ctime", "st_birthtime", "st_atime", "SystemTime",
        "Instant", "UNIX_EPOCH", "elapsed", "modified", "created", "age",
        "max_age", "older_than", "stale_after", "now", "timestamp",
    ] {
        assert!(!tokens.contains(forbidden), "no time authority: {forbidden}");
    }
    /* The only stat fields consulted are the TYPE bits. */
    assert!(code.contains("st_mode & libc::S_IFMT"));
    assert_eq!(code.matches("st_mode").count(), 1);
}

/// (C) the destructive scan is not a command and takes no renderer input.
#[test]
fn the_trusted_scan_is_not_a_registered_command() {
    let source = include_str!("../archive_residue_probe.rs");
    let at = source.find("pub fn scan_trusted_residue_within").expect("present");
    let before = &source[..at];
    assert!(
        !before.trim_end().ends_with("#[tauri::command]"),
        "the destructive-side scan must not be a command"
    );
    let code: String = source
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        code.matches("#[tauri::command]").count(),
        1,
        "only the T1.3 read-only diagnostics command exists here"
    );
    let sig = &source[at..at + 120];
    for forbidden in ["request", "options", "ProjectionInput", "String", "Vec<"] {
        assert!(!sig.contains(forbidden), "scan must not accept {forbidden}");
    }
    let lib = include_str!("../lib.rs");
    assert!(!lib.contains("scan_trusted_residue_within"), "not registered");
}
