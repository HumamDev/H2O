use super::*;
use crate::archive_durable_write::sha256_hex;
use std::path::{Path, PathBuf};

fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-cas-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(dir.join("archive")).expect("scratch");
    dir.join("archive")
}

/// Plants a canonical CAS body and returns its bare hex.
fn plant(root: &Path, bytes: &[u8]) -> String {
    let hex = sha256_hex(bytes);
    let shard = root.join("assets").join(&hex[0..2]);
    std::fs::create_dir_all(&shard).expect("shard");
    std::fs::write(shard.join(format!("sha256-{hex}")), bytes).expect("object");
    hex
}

/// (1)(4) canonical bodies across MULTIPLE shards are all observed.
#[test]
fn canonical_bodies_across_shards_are_observed_deterministically() {
    let root = scratch("observe");
    let mut expected: Vec<String> = (0..6)
        .map(|i| plant(&root, format!("body-{i}").as_bytes()))
        .collect();
    expected.sort();
    expected.dedup();

    let inv = scan_cas_within(&root);
    assert!(inv.complete, "{:?}", inv.blockers);
    assert_eq!(inv.observed, expected);
    assert!(inv.foreign.is_empty());
    // More than one shard really was walked.
    let shards: std::collections::BTreeSet<&str> =
        expected.iter().map(|h| &h[0..2]).collect();
    assert!(shards.len() > 1, "fixture must span multiple shards");

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (3) an absent CAS root is a COMPLETE empty inventory, and nothing is created.
#[test]
fn an_absent_assets_root_is_a_complete_empty_inventory() {
    let root = scratch("absent");
    let assets = root.join("assets");
    assert!(!assets.exists(), "precondition");

    let inv = scan_cas_within(&root);
    assert!(inv.complete, "a proven absence is complete");
    assert!(inv.observed.is_empty());
    assert!(inv.blockers.is_empty());
    assert!(!assets.exists(), "scanning must not create the CAS root");

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (5)(6) symlinks are never followed as objects, and foreign entries are
/// surfaced rather than silently becoming collectible bodies.
#[test]
fn symlinks_and_foreign_entries_never_become_canonical_objects() {
    let root = scratch("foreign");
    let real = plant(&root, b"real-body");
    let shard = root.join("assets").join(&real[0..2]);

    // A symlink NAMED like a canonical object, pointing at the real body.
    let fake_hex = "cd".repeat(32);
    let link_shard = root.join("assets").join(&fake_hex[0..2]);
    std::fs::create_dir_all(&link_shard).unwrap();
    std::os::unix::fs::symlink(
        shard.join(format!("sha256-{real}")),
        link_shard.join(format!("sha256-{fake_hex}")),
    )
    .expect("symlink");

    // Foreign shapes.
    std::fs::write(shard.join("notes.txt"), b"x").unwrap();
    std::fs::write(shard.join("sha256-nothex"), b"x").unwrap();
    // A body filed under the WRONG shard is not canonically addressable.
    let misfiled = "ff".repeat(32);
    std::fs::write(shard.join(format!("sha256-{misfiled}")), b"x").unwrap();
    // A non-shard directory beside the shards.
    std::fs::create_dir_all(root.join("assets").join("not-a-shard")).unwrap();

    let inv = scan_cas_within(&root);
    assert!(inv.complete, "{:?}", inv.blockers);
    assert_eq!(inv.observed, vec![real.clone()], "only the real body is an object");
    assert!(!inv.observed.contains(&fake_hex), "a symlink is not a body");
    assert!(!inv.observed.contains(&misfiled), "a misfiled body is not addressable");

    let reasons: Vec<&str> = inv.foreign.iter().map(|f| f.reason).collect();
    assert!(reasons.contains(&"not-a-canonical-object-name"));
    assert!(reasons.contains(&"shard-does-not-match-hash"));
    assert!(reasons.contains(&"not-a-regular-file"));
    assert!(reasons.contains(&"not-a-canonical-shard"));

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (9) an unwalkable shard makes the inventory incomplete rather than silently
/// shrinking the observed set.
#[test]
fn an_unwalkable_shard_makes_the_inventory_incomplete() {
    let root = scratch("blocked");
    let real = plant(&root, b"real-body");
    // A symlink standing where a SHARD should be: O_NOFOLLOW refuses it.
    let elsewhere = scratch("elsewhere");
    std::os::unix::fs::symlink(&elsewhere, root.join("assets").join("ab")).expect("symlink");

    let inv = scan_cas_within(&root);
    assert!(!inv.complete, "an untraversed shard breaks completeness");
    assert!(inv.blockers.contains(&codes::SHARD_NOT_A_DIRECTORY.to_string()));
    // Observed evidence is still reported.
    assert!(inv.observed.contains(&real));

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
    let _ = std::fs::remove_dir_all(elsewhere.parent().unwrap());
}

/// (10) enumeration order cannot leak: two archives with the same bodies
/// created in opposite order produce identical inventories.
#[test]
fn the_inventory_is_deterministic_regardless_of_creation_order() {
    let build = |tag: &str, reverse: bool| {
        let root = scratch(tag);
        let mut bodies: Vec<Vec<u8>> = (0..8).map(|i| format!("body-{i}").into_bytes()).collect();
        if reverse {
            bodies.reverse();
        }
        for body in &bodies {
            plant(&root, body);
        }
        root
    };
    let a = build("det-a", false);
    let b = build("det-b", true);
    assert_eq!(
        serde_json::to_string(&scan_cas_within(&a)).unwrap(),
        serde_json::to_string(&scan_cas_within(&b)).unwrap()
    );
    let _ = std::fs::remove_dir_all(a.parent().unwrap());
    let _ = std::fs::remove_dir_all(b.parent().unwrap());
}

/// (11) read-only durability: no byte, name or entry changes, and nothing is
/// created by scanning.
#[test]
fn scanning_the_cas_changes_nothing() {
    let root = scratch("readonly");
    for i in 0..5 {
        plant(&root, format!("body-{i}").as_bytes());
    }
    let assets = root.join("assets");

    fn census(base: &Path, prefix: &str, out: &mut Vec<(String, u64, String)>) {
        let mut entries: Vec<_> = std::fs::read_dir(base).unwrap().map(|e| e.unwrap()).collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
            let meta = std::fs::symlink_metadata(entry.path()).unwrap();
            if meta.is_dir() {
                out.push((name.clone(), 0, "dir".into()));
                census(&entry.path(), &name, out);
            } else {
                let bytes = std::fs::read(entry.path()).unwrap_or_default();
                out.push((name, meta.len(), sha256_hex(&bytes)));
            }
        }
    }
    let mut before = Vec::new();
    census(&assets, "", &mut before);
    assert!(!before.is_empty(), "precondition");

    let inv = scan_cas_within(&root);
    assert!(inv.complete);
    assert_eq!(inv.observed.len(), 5);

    let mut after = Vec::new();
    census(&assets, "", &mut after);
    assert_eq!(before, after, "no name, size or byte may change");

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (12) the CAS scanner carries no mutation authority at all.
#[test]
fn the_cas_scanner_has_no_mutation_authority() {
    let code: String = include_str!("../archive_cas_scan.rs")
        .lines()
        .map(str::trim_start)
        .filter(|l| !l.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(code.contains("pub fn scan_cas_within"), "scanned the real module");
    for forbidden in [
        "unlinkat", "remove_file", "remove_dir", "renameat", "std::fs::rename",
        "O_CREAT", "O_TRUNC", "O_WRONLY", "O_RDWR", "mkdirat", "mkdir_child",
        "open_root(", "create_dir", "File::create", "quarantine", "purge",
        "collectible", "delete",
    ] {
        assert!(!code.contains(forbidden), "mutation authority leaked: {forbidden}");
    }
    // No time authority, no command, no caller path.
    for forbidden in ["mtime", "ctime", "birthtime", "SystemTime", "#[tauri::command]", "Sha256", "Digest::"] {
        assert!(!code.contains(forbidden), "forbidden authority leaked: {forbidden}");
    }
}
