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
    let source = include_str!("../archive_residue_probe.rs");
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
