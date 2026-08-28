use super::*;
use crate::archive_durable_write::sha256_hex;
use crate::archive_generation_publish::{begin, commit, write_member, Member, Publisher};
use std::path::{Path, PathBuf};

fn scratch(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t21-{tag}-{}-{}",
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

/// Publishes a REAL v1 package through the actual publisher, so the fixture is
/// exactly what the product writes rather than hand-assembled bytes.
fn publish_v1(root: &Path, chat_id: &str, saved_at: &str) -> String {
    let publisher = Publisher::new(root.to_path_buf());
    let snapshot = format!(
        r#"{{"schemaVersion":1,"chatId":"{chat_id}","snapshotId":"s1","savedAt":"{saved_at}","messages":[{{"id":"m0","turnIndex":0,"contentText":"body"}}]}}"#
    )
    .into_bytes();
    let markdown = format!("# {chat_id}\n").into_bytes();
    let html = format!("<!doctype html><p>{chat_id}</p>").into_bytes();
    let content_hash = sha_of(&snapshot);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":1,"chatId":"{chat_id}","snapshotId":"s1","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[]}}"#,
        sha_of(&snapshot), snapshot.len(),
        sha_of(&markdown), markdown.len(),
        sha_of(&html), html.len(),
    )
    .into_bytes();

    let begun = begin(&publisher, chat_id);
    assert!(begun.ok, "begin refused: {:?}", begun.blockers);
    let token = begun.token;
    assert!(write_member(&publisher, token, Member::Snapshot, &snapshot).ok);
    assert!(write_member(&publisher, token, Member::Markdown, &markdown).ok);
    assert!(write_member(&publisher, token, Member::Html, &html).ok);
    assert!(write_member(&publisher, token, Member::Manifest, &manifest).ok);
    let published = commit(&publisher, token, None);
    assert!(published.ok, "commit refused: {:?}", published.blockers);
    content_hash.strip_prefix("sha256-").unwrap().to_string()
}

/// Publishes a REAL v2 package that references CAS objects.
fn publish_v2(root: &Path, chat_id: &str, saved_at: &str, assets: &[(&str, &[u8])]) -> (String, Vec<String>) {
    let publisher = Publisher::new(root.to_path_buf());
    let mut descriptors = Vec::new();
    let mut shas = Vec::new();
    let mut refs = Vec::new();
    for (ext, bytes) in assets {
        let sha = sha_of(bytes);
        let hex = sha.strip_prefix("sha256-").unwrap().to_string();
        let shard = root.join("assets").join(&hex[0..2]);
        std::fs::create_dir_all(&shard).expect("cas shard");
        std::fs::write(shard.join(format!("sha256-{hex}")), bytes).expect("cas object");
        descriptors.push(format!(
            r#"{{"path":"assets/{sha}.{ext}","sha256":"{sha}","ext":"{ext}","mimeType":"image/{ext}","byteLength":{}}}"#,
            bytes.len()
        ));
        refs.push(format!("\"{sha}\""));
        shas.push(hex);
    }
    let snapshot = format!(
        r#"{{"schemaVersion":2,"chatId":"{chat_id}","snapshotId":"s1","savedAt":"{saved_at}","messages":[{{"id":"m0","turnIndex":0,"assetRefs":[{}]}}]}}"#,
        refs.join(",")
    )
    .into_bytes();
    let markdown = b"# v2\n".to_vec();
    let html = b"<!doctype html><p>v2</p>".to_vec();
    let mut sorted: Vec<String> = descriptors
        .iter()
        .zip(shas.iter())
        .map(|(_, hex)| format!("sha256-{hex}"))
        .collect();
    sorted.sort();
    let content_hash = crate::archive_generation_publish::derive_content_hash_for_test(true, &snapshot, &sorted);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"{chat_id}","snapshotId":"s1","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[{}]}}"#,
        sha_of(&snapshot), snapshot.len(),
        sha_of(&markdown), markdown.len(),
        sha_of(&html), html.len(),
        descriptors.join(",")
    )
    .into_bytes();

    let begun = begin(&publisher, chat_id);
    assert!(begun.ok, "begin refused: {:?}", begun.blockers);
    let token = begun.token;
    assert!(write_member(&publisher, token, Member::Snapshot, &snapshot).ok);
    assert!(write_member(&publisher, token, Member::Markdown, &markdown).ok);
    assert!(write_member(&publisher, token, Member::Html, &html).ok);
    assert!(write_member(&publisher, token, Member::Manifest, &manifest).ok);
    let published = commit(&publisher, token, None);
    assert!(published.ok, "commit refused: {:?}", published.blockers);
    shas.sort();
    (
        content_hash.strip_prefix("sha256-").unwrap().to_string(),
        shas,
    )
}

fn packages_dir(root: &Path) -> PathBuf {
    root.join("packages")
}

fn find<'a>(scan: &'a PackageScan, name: &str) -> &'a ClassifiedOccupant {
    scan.occupants
        .iter()
        .find(|o| o.name == name)
        .unwrap_or_else(|| panic!("{name} missing from inventory: {:?}",
            scan.occupants.iter().map(|o| &o.name).collect::<Vec<_>>()))
}

/// (A)(C)(M) real published packages are enumerated, verified and reported with
/// their trusted facts, including verified manifest CAS references.
#[test]
fn real_published_packages_verify_with_trusted_facts_and_asset_references() {
    let root = scratch("verified");
    let hash_v1 = publish_v1(&root, "chat_one", "2026-03-01T00:00:00.000Z");
    let (hash_v2, shas) = publish_v2(
        &root,
        "chat_two",
        "2026-04-02T00:00:00.000Z",
        &[("png", b"image-bytes-a"), ("jpg", b"image-bytes-b")],
    );

    let scan = scan_packages_within(&root);
    assert!(scan.complete, "{:?}", scan.blockers);
    assert!(scan.blockers.is_empty());

    let v1 = find(&scan, &format!("chat_one.g{hash_v1}.h2ochat"));
    match &v1.class {
        OccupantClass::VerifiedGeneration(p) => {
            assert_eq!(p.chat_id, "chat_one");
            assert_eq!(p.content_hash, hash_v1);
            assert!(!p.payload_v2, "v1 family");
            assert_eq!(
                p.order,
                OrderFact::Orderable { saved_at: "2026-03-01T00:00:00.000Z".into() }
            );
            assert!(p.asset_shas.is_empty(), "a v1 package references no CAS objects");
        }
        other => panic!("expected verified generation, got {other:?}"),
    }
    assert_eq!(v1.path, format!("archive/packages/chat_one.g{hash_v1}.h2ochat"));

    let v2 = find(&scan, &format!("chat_two.g{hash_v2}.h2ochat"));
    match &v2.class {
        OccupantClass::VerifiedGeneration(p) => {
            assert!(p.payload_v2, "v2 family");
            // (M) verified manifest asset references, sorted and deduplicated.
            assert_eq!(p.asset_shas, shas);
            assert_eq!(p.asset_shas.len(), 2);
            let mut sorted = p.asset_shas.clone();
            sorted.sort();
            assert_eq!(p.asset_shas, sorted, "deterministic reference order");
        }
        other => panic!("expected verified generation, got {other:?}"),
    }

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (B) enumeration is complete well past the renderer's historical 500-entry
/// UI inventory limit.
#[test]
fn enumeration_is_complete_beyond_the_renderer_inventory_limit() {
    let root = scratch("bulk");
    let hash = publish_v1(&root, "chat_real", "2026-05-05T00:00:00.000Z");
    let dir = packages_dir(&root);
    // Lightweight foreign occupants: cheap to create, still must all be seen.
    const EXTRA: usize = 620;
    for i in 0..EXTRA {
        std::fs::write(dir.join(format!("filler-{i:04}.txt")), b"x").expect("filler");
    }

    let scan = scan_packages_within(&root);
    assert!(scan.complete, "{:?}", scan.blockers);
    assert_eq!(
        scan.occupants.len(),
        EXTRA + 1,
        "every occupant must be enumerated; a 500 limit would truncate this"
    );
    assert!(scan.occupants.len() > 500);
    // The real package is still classified correctly among them.
    match &find(&scan, &format!("chat_real.g{hash}.h2ochat")).class {
        OccupantClass::VerifiedGeneration(_) => {}
        other => panic!("expected verified generation, got {other:?}"),
    }
    // And every filler stayed visible as evidence rather than being dropped.
    let fillers = scan
        .occupants
        .iter()
        .filter(|o| o.name.starts_with("filler-"))
        .count();
    assert_eq!(fillers, EXTRA);

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (D) the filename is a CLAIM. A generation whose stored bytes prove a
/// different identity cannot become a verified generation.
#[test]
fn a_name_that_disagrees_with_the_proven_identity_is_never_verified() {
    let root = scratch("mismatch");
    let hash = publish_v1(&root, "chat_x", "2026-06-06T00:00:00.000Z");
    let dir = packages_dir(&root);
    let real = dir.join(format!("chat_x.g{hash}.h2ochat"));

    // Same verified bytes, renamed under a DIFFERENT contentHash claim.
    let lying_hash = "0".repeat(64);
    let lying = dir.join(format!("chat_x.g{lying_hash}.h2ochat"));
    std::fs::rename(&real, &lying).expect("rename fixture");

    let scan = scan_packages_within(&root);
    assert!(scan.complete);
    match &find(&scan, &format!("chat_x.g{lying_hash}.h2ochat")).class {
        OccupantClass::Indeterminate { reason } => {
            assert_eq!(*reason, IndeterminateReason::IdentityMismatch)
        }
        other => panic!("a lying filename must not verify, got {other:?}"),
    }

    // A different chatId in the name is equally refused.
    let wrong_chat = dir.join(format!("chat_other.g{hash}.h2ochat"));
    std::fs::rename(&lying, &wrong_chat).expect("rename fixture");
    let scan = scan_packages_within(&root);
    match &find(&scan, &format!("chat_other.g{hash}.h2ochat")).class {
        OccupantClass::Indeterminate { reason } => {
            assert_eq!(*reason, IndeterminateReason::IdentityMismatch)
        }
        other => panic!("a lying chatId must not verify, got {other:?}"),
    }

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (E) legacy `<chatId>.h2ochat` is a DISTINCT variant, unreachable through the
/// generation path.
#[test]
fn a_legacy_package_is_distinct_from_an_ordinary_generation() {
    let root = scratch("legacy");
    let hash = publish_v1(&root, "chat_leg", "2026-07-07T00:00:00.000Z");
    let dir = packages_dir(&root);
    std::fs::rename(
        dir.join(format!("chat_leg.g{hash}.h2ochat")),
        dir.join("chat_leg.h2ochat"),
    )
    .expect("legacy rename");

    let scan = scan_packages_within(&root);
    assert!(scan.complete);
    match &find(&scan, "chat_leg.h2ochat").class {
        OccupantClass::LegacyPackage(p) => {
            assert_eq!(p.chat_id, "chat_leg");
            assert_eq!(p.content_hash, hash);
        }
        other => panic!("expected legacy package, got {other:?}"),
    }
    // Nothing in the scan reports it as a generation.
    assert!(
        !scan.occupants.iter().any(|o| matches!(o.class, OccupantClass::VerifiedGeneration(_))),
        "a legacy package must never appear as a generation"
    );

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (F) validity and orderability are different. A package that verifies but has
/// no usable savedAt stays VERIFIED and becomes UNORDERABLE — never corrupt,
/// never given a default timestamp.
#[test]
fn a_verified_package_without_savedat_is_unorderable_not_corrupt() {
    for (tag, saved_at, expected) in [
        ("empty", "", UnorderableReason::SavedAtMissing),
        ("garbage", "not-a-timestamp", UnorderableReason::SavedAtMalformed),
    ] {
        let root = scratch(tag);
        let hash = publish_v1(&root, "chat_u", saved_at);
        let scan = scan_packages_within(&root);
        assert!(scan.complete);
        match &find(&scan, &format!("chat_u.g{hash}.h2ochat")).class {
            OccupantClass::VerifiedGeneration(p) => {
                assert_eq!(p.order, OrderFact::Unorderable { reason: expected });
                // Serialization carries no substitute time.
                let json = serde_json::to_string(&p.order).unwrap();
                assert!(!json.contains("1970"), "no epoch fallback");
                assert!(!json.contains("saved_at"), "no timestamp field at all");
            }
            other => panic!("{tag}: must stay VERIFIED but unorderable, got {other:?}"),
        }
        let _ = std::fs::remove_dir_all(root.parent().unwrap());
    }
}

/// (G)(H)(I) damaged, foreign, unreadable and symlinked occupants all stay
/// visible as protective evidence and none silently disappears.
#[test]
fn damaged_foreign_and_symlinked_occupants_remain_visible_evidence() {
    let root = scratch("damaged");
    let good = publish_v1(&root, "chat_ok", "2026-08-08T00:00:00.000Z");
    let dir = packages_dir(&root);

    // Partial: a required member removed.
    let partial_hash = publish_v1(&root, "chat_part", "2026-08-09T00:00:00.000Z");
    let partial = dir.join(format!("chat_part.g{partial_hash}.h2ochat"));
    std::fs::remove_file(partial.join("chat.md")).expect("make partial");

    // Corrupt: snapshot bytes altered after publication.
    let corrupt_hash = publish_v1(&root, "chat_corr", "2026-08-10T00:00:00.000Z");
    let corrupt = dir.join(format!("chat_corr.g{corrupt_hash}.h2ochat"));
    std::fs::write(corrupt.join("snapshot.json"), b"{\"tampered\":true}").expect("corrupt");

    // Foreign: a package-named directory holding nothing.
    let foreign = dir.join(format!("chat_foreign.g{}.h2ochat", "a".repeat(64)));
    std::fs::create_dir_all(&foreign).expect("foreign dir");

    // A stray non-package entry.
    std::fs::write(dir.join("notes.txt"), b"stray").expect("stray");

    // Symlink standing where a package should be, pointing at a REAL package.
    let target = dir.join(format!("chat_ok.g{good}.h2ochat"));
    let link = dir.join(format!("chat_link.g{}.h2ochat", "b".repeat(64)));
    std::os::unix::fs::symlink(&target, &link).expect("symlink");

    let scan = scan_packages_within(&root);
    assert!(scan.complete, "{:?}", scan.blockers);

    let reason_of = |name: &str| match &find(&scan, name).class {
        OccupantClass::Indeterminate { reason } => reason.clone(),
        other => panic!("{name}: expected indeterminate, got {other:?}"),
    };
    assert_eq!(
        reason_of(&format!("chat_part.g{partial_hash}.h2ochat")),
        IndeterminateReason::Partial
    );
    assert_eq!(
        reason_of(&format!("chat_corr.g{corrupt_hash}.h2ochat")),
        IndeterminateReason::Corrupt
    );
    assert_eq!(
        reason_of(&format!("chat_foreign.g{}.h2ochat", "a".repeat(64))),
        IndeterminateReason::Partial
    );
    assert_eq!(reason_of("notes.txt"), IndeterminateReason::NotAPackageName);
    // (I) the symlink is NOT followed; it cannot inherit its target's validity.
    assert_eq!(
        reason_of(&format!("chat_link.g{}.h2ochat", "b".repeat(64))),
        IndeterminateReason::Unreadable
    );

    // Exactly one verified generation among all of them, and nothing vanished.
    let verified = scan
        .occupants
        .iter()
        .filter(|o| matches!(o.class, OccupantClass::VerifiedGeneration(_)))
        .count();
    assert_eq!(verified, 1);
    assert_eq!(scan.occupants.len(), 6);

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (J) reserved trusted infrastructure never becomes a package.
#[test]
fn reserved_infrastructure_never_becomes_a_package() {
    let root = scratch("reserved");
    let dir = packages_dir(&root);
    std::fs::create_dir_all(&dir).expect("packages");
    std::fs::write(dir.join(".h2o-archive.lock"), b"").expect("lock");
    std::fs::create_dir_all(dir.join(".h2o-reclaim")).expect("reclaim");
    std::fs::create_dir_all(dir.join(".h2o-genstage-00ff01")).expect("staging");
    std::fs::create_dir_all(dir.join(".h2o-durable-1-0.tmp")).expect("temp");

    let scan = scan_packages_within(&root);
    assert!(scan.complete);
    for name in [
        ".h2o-archive.lock",
        ".h2o-reclaim",
        ".h2o-genstage-00ff01",
        ".h2o-durable-1-0.tmp",
    ] {
        assert_eq!(
            find(&scan, name).class,
            OccupantClass::ReservedInfrastructure,
            "{name}"
        );
    }
    assert!(!scan
        .occupants
        .iter()
        .any(|o| matches!(o.class, OccupantClass::VerifiedGeneration(_) | OccupantClass::LegacyPackage(_))));

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (K)(L) identical contents produce identical classification, and filesystem
/// timestamps have no effect at all.
#[test]
fn output_is_deterministic_and_filesystem_time_changes_nothing() {
    let build = |tag: &str, reverse: bool| {
        let root = scratch(tag);
        // savedAt is bound to the CHAT, not to publication position: the two
        // builds must contain byte-identical packages and differ only in the
        // ORDER they were created in.
        let mut chats = vec![
            ("chat_a", "2026-01-01T00:00:00.000Z"),
            ("chat_b", "2026-02-01T00:00:00.000Z"),
            ("chat_c", "2026-03-01T00:00:00.000Z"),
        ];
        if reverse {
            chats.reverse();
        }
        for (chat, saved_at) in &chats {
            publish_v1(&root, chat, saved_at);
        }
        let dir = packages_dir(&root);
        std::fs::write(dir.join("zz-stray.txt"), b"x").expect("stray");
        root
    };

    let a = build("det-a", false);
    let b = build("det-b", true);
    let scan_a = scan_packages_within(&a);
    let scan_b = scan_packages_within(&b);
    let names_a: Vec<&str> = scan_a.occupants.iter().map(|o| o.name.as_str()).collect();
    let names_b: Vec<&str> = scan_b.occupants.iter().map(|o| o.name.as_str()).collect();
    assert_eq!(names_a, names_b, "creation order must not leak into the result");
    let mut sorted = names_a.clone();
    sorted.sort();
    assert_eq!(names_a, sorted, "sorted by canonical occupant name");

    // (L) Behavioural: backdate every occupant's mtime by decades; the result
    // must be byte-identical.
    let before = serde_json::to_string(&scan_a).unwrap();
    for entry in std::fs::read_dir(packages_dir(&a)).unwrap() {
        let path = entry.unwrap().path();
        let ancient = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1);
        let _ = filetime_set(&path, ancient);
    }
    let after = serde_json::to_string(&scan_packages_within(&a)).unwrap();
    assert_eq!(before, after, "filesystem time must not influence classification");

    let _ = std::fs::remove_dir_all(a.parent().unwrap());
    let _ = std::fs::remove_dir_all(b.parent().unwrap());
}

/// Best-effort mtime backdating via libc; the assertion above does not depend
/// on it succeeding, and the structural pin below is the primary proof.
fn filetime_set(path: &Path, when: std::time::SystemTime) -> std::io::Result<()> {
    use std::os::unix::ffi::OsStrExt;
    let secs = when
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let times = [
        libc::timeval { tv_sec: secs, tv_usec: 0 },
        libc::timeval { tv_sec: secs, tv_usec: 0 },
    ];
    let c = std::ffi::CString::new(path.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    let rc = unsafe { libc::utimes(c.as_ptr(), times.as_ptr()) };
    if rc < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

/// (L)(O)(P) structural contract pins, scanning CODE lines only so accurate
/// documentation is never the thing that fails.
#[test]
fn the_scanner_has_no_time_renderer_or_retention_authority() {
    let code: String = include_str!("../archive_package_scan.rs")
        .lines()
        .map(str::trim_start)
        .filter(|line| !line.starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(code.contains("pub fn scan_packages_within"), "scanned the real module");

    // (L) no filesystem or wall-clock time anywhere.
    for forbidden in [
        "mtime", "modified", "ctime", "birthtime", "SystemTime", "Instant::now",
        "now_utc", "OffsetDateTime", "elapsed",
        // "age" is deliberately absent: it is a substring of "package" and
        // would match meaninglessly. File age cannot be computed without one
        // of the specific sources above, which are all banned.
    ] {
        assert!(!code.contains(forbidden), "time authority leaked: {forbidden}");
    }
    // (P) no retention, floor, candidate or reclamation computation.
    for forbidden in [
        "candidate", "reclaimable", "retention", "floor", "const K", "K = 3",
        "quarantine", "purge", "prune", "plan",
    ] {
        assert!(!code.contains(forbidden), "retention logic leaked: {forbidden}");
    }
    // No destructive filesystem authority.
    for forbidden in [
        "remove_file", "remove_dir", "std::fs::rename", "unlinkat", "renameat",
        "create_dir", "File::create", "write(",
    ] {
        assert!(!code.contains(forbidden), "mutation authority leaked: {forbidden}");
    }
    // (O) no renderer input, no command, no caller-chosen directory.
    for forbidden in [
        "#[tauri::command]", "tauri::State", "projection", "verdict", "chat_scope",
        "Request<", "options:",
    ] {
        assert!(!code.contains(forbidden), "renderer authority leaked: {forbidden}");
    }
    // No second verifier: verification comes from the publisher.
    assert!(code.contains("verify_occupant"), "must reuse the publisher verifier");
    for forbidden in ["fn validate_manifest", "Sha256", "Digest::", "sha256_hex", "canonical_json"] {
        assert!(!code.contains(forbidden), "second authority leaked: {forbidden}");
    }
}

/// The name parser is the exact inverse of the publisher's constructor, so the
/// two cannot drift apart.
#[test]
fn the_name_parser_is_the_inverse_of_the_publisher_constructor() {
    let hex = "ab".repeat(32);
    for chat_id in ["chat_1", "c.g.weird", "a-b_c.d", "chat.gnot"] {
        let built = format!("{chat_id}.g{hex}.h2ochat");
        assert_eq!(
            name_shape(&built),
            NameShape::Generation {
                chat_id: chat_id.to_string(),
                content_hash: hex.clone(),
            },
            "round trip for {chat_id}"
        );
    }
    assert_eq!(
        name_shape("chat_1.h2ochat"),
        NameShape::Legacy { chat_id: "chat_1".into() }
    );
    // Not a generation: wrong hex length, uppercase, or missing marker.
    for near in [
        &format!("chat.g{}.h2ochat", "ab".repeat(31)),
        &format!("chat.g{}.h2ochat", "AB".repeat(32)),
    ] {
        assert!(matches!(name_shape(near), NameShape::Legacy { .. }), "{near}");
    }
    assert_eq!(name_shape("notes.txt"), NameShape::NotAPackage);
    assert_eq!(name_shape(".h2ochat"), NameShape::NotAPackage);
    assert_eq!(name_shape(".h2o-reclaim"), NameShape::Reserved);
}

/// (N) an occupant whose manifest cannot be trusted must not present a
/// complete-looking empty CAS reference set. Structurally impossible here: the
/// field exists only on a verified package.
#[test]
fn an_untrusted_manifest_cannot_yield_an_empty_reference_set() {
    let root = scratch("cas-seam");
    let hash = publish_v2(
        &root,
        "chat_cas",
        "2026-09-09T00:00:00.000Z",
        &[("png", b"asset-bytes")],
    )
    .0;
    let dir = packages_dir(&root);
    let package = dir.join(format!("chat_cas.g{hash}.h2ochat"));
    std::fs::write(package.join("manifest.json"), b"{ not json").expect("break manifest");

    let scan = scan_packages_within(&root);
    let occupant = find(&scan, &format!("chat_cas.g{hash}.h2ochat"));
    match &occupant.class {
        OccupantClass::Indeterminate { reason } => {
            assert_eq!(*reason, IndeterminateReason::Corrupt)
        }
        other => panic!("an unreadable manifest must not verify, got {other:?}"),
    }
    // The serialized occupant carries NO asset field at all, so no consumer can
    // read "references none" from it.
    let json = serde_json::to_value(occupant).unwrap();
    assert!(json.get("asset_shas").is_none());
    assert!(!serde_json::to_string(&json).unwrap().contains("asset_shas"));

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

/// (Q) read-only durability: the scan changes no bytes, no names, and creates
/// nothing — including when the packages directory does not exist.
#[test]
fn scanning_changes_nothing_and_creates_nothing() {
    let root = scratch("readonly");
    publish_v1(&root, "chat_ro", "2026-10-10T00:00:00.000Z");
    let dir = packages_dir(&root);

    let census = || -> Vec<(String, u64, String)> {
        let mut out = Vec::new();
        fn walk(base: &Path, prefix: &str, out: &mut Vec<(String, u64, String)>) {
            let mut entries: Vec<_> = std::fs::read_dir(base).unwrap().map(|e| e.unwrap()).collect();
            entries.sort_by_key(|e| e.file_name());
            for entry in entries {
                let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
                let meta = std::fs::symlink_metadata(entry.path()).unwrap();
                if meta.is_dir() {
                    out.push((name.clone(), 0, "dir".into()));
                    walk(&entry.path(), &name, out);
                } else {
                    let bytes = std::fs::read(entry.path()).unwrap_or_default();
                    out.push((name, meta.len(), sha256_hex(&bytes)));
                }
            }
        }
        walk(&dir, "", &mut out);
        out
    };

    let before = census();
    assert!(!before.is_empty(), "precondition: fixture has content");
    let scan = scan_packages_within(&root);
    assert!(scan.complete);
    let after = census();
    assert_eq!(before, after, "no name, size or byte may change");

    // Scanning an archive with NO packages directory must not create one.
    let empty = scratch("nocreate");
    let missing = packages_dir(&empty);
    assert!(!missing.exists(), "precondition");
    let scan = scan_packages_within(&empty);
    assert!(scan.complete, "a proven absence is complete");
    assert!(scan.occupants.is_empty());
    assert!(!missing.exists(), "probing must not create the packages directory");

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
    let _ = std::fs::remove_dir_all(empty.parent().unwrap());
}
