use super::*;
use crate::archive_generation_publish::{
    begin as publish_begin, commit, write_member, Member, Publisher,
};
use std::path::{Path, PathBuf};

fn scratch(tag: &str) -> PathBuf {
    let base = std::env::temp_dir().join(format!(
        "h2o-m07-handoff-{tag}-{}-{}-{:?}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
        std::thread::current().id()
    ));
    std::fs::create_dir_all(base.join("archive")).expect("scratch archive");
    base.join("archive")
}

fn sha(bytes: &[u8]) -> String {
    format!("sha256-{}", sha256_hex(bytes))
}

#[derive(Clone)]
struct Fixture {
    chat_id: String,
    snapshot: Vec<u8>,
    markdown: Vec<u8>,
    html: Vec<u8>,
    manifest: Vec<u8>,
    content_hash: String,
    assets: Vec<(String, Vec<u8>)>,
}

fn v1_manifest(fx: &Fixture) -> Vec<u8> {
    format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":1,"chatId":"{}","snapshotId":"s1","contentHash":"{}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[]}}"#,
        fx.chat_id,
        fx.content_hash,
        sha(&fx.snapshot),
        fx.snapshot.len(),
        sha(&fx.markdown),
        fx.markdown.len(),
        sha(&fx.html),
        fx.html.len(),
    )
    .into_bytes()
}

fn v1_fixture(chat_id: &str, body: &str) -> Fixture {
    let snapshot = format!(
        r#"{{"schemaVersion":1,"chatId":"{chat_id}","snapshotId":"s1","savedAt":"2026-08-31T00:00:00Z","messages":[{{"id":"m0","turnIndex":0,"contentText":"{body}"}}]}}"#
    )
    .into_bytes();
    let markdown = format!("# {chat_id}\n\n{body}\n").into_bytes();
    let html = format!("<!doctype html><p>{body}</p>").into_bytes();
    let content_hash = sha(&snapshot);
    let mut fx = Fixture {
        chat_id: chat_id.to_string(),
        snapshot,
        markdown,
        html,
        manifest: Vec::new(),
        content_hash,
        assets: Vec::new(),
    };
    fx.manifest = v1_manifest(&fx);
    fx
}

fn v2_fixture(root: &Path, chat_id: &str, bodies: &[(&str, &[u8])]) -> Fixture {
    let mut descriptors = Vec::new();
    let mut refs = Vec::new();
    let mut shas = Vec::new();
    let mut assets = Vec::new();
    for (ext, bytes) in bodies {
        let identity = sha(bytes);
        let hex = identity.strip_prefix("sha256-").unwrap();
        let shard = root.join("assets").join(&hex[0..2]);
        std::fs::create_dir_all(&shard).expect("CAS shard");
        std::fs::write(shard.join(format!("sha256-{hex}")), bytes).expect("CAS object");
        descriptors.push(format!(
            r#"{{"path":"assets/{identity}.{ext}","sha256":"{identity}","ext":"{ext}","mimeType":"image/{ext}","byteLength":{}}}"#,
            bytes.len()
        ));
        refs.push(format!("\"{identity}\""));
        shas.push(identity.clone());
        assets.push((identity, bytes.to_vec()));
    }
    let snapshot = format!(
        r#"{{"schemaVersion":2,"chatId":"{chat_id}","snapshotId":"s1","savedAt":"2026-08-31T00:00:00Z","messages":[{{"id":"m0","turnIndex":0,"assetRefs":[{}]}}]}}"#,
        refs.join(",")
    )
    .into_bytes();
    let markdown = b"# v2\n".to_vec();
    let html = b"<!doctype html><p>v2</p>".to_vec();
    shas.sort();
    let content_hash =
        crate::archive_generation_publish::derive_content_hash_for_test(true, &snapshot, &shas);
    let manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"{chat_id}","snapshotId":"s1","contentHash":"{content_hash}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[{}]}}"#,
        sha(&snapshot),
        snapshot.len(),
        sha(&markdown),
        markdown.len(),
        sha(&html),
        html.len(),
        descriptors.join(",")
    )
    .into_bytes();
    Fixture {
        chat_id: chat_id.to_string(),
        snapshot,
        markdown,
        html,
        manifest,
        content_hash,
        assets,
    }
}

fn publish(root: &Path, fx: &Fixture) -> PathBuf {
    let publisher = Publisher::new(root.to_path_buf());
    let begun = publish_begin(&publisher, &fx.chat_id);
    assert!(begun.ok, "publish BEGIN: {:?}", begun.blockers);
    assert!(write_member(&publisher, begun.token, Member::Snapshot, &fx.snapshot).ok);
    assert!(write_member(&publisher, begun.token, Member::Markdown, &fx.markdown).ok);
    assert!(write_member(&publisher, begun.token, Member::Html, &fx.html).ok);
    assert!(write_member(&publisher, begun.token, Member::Manifest, &fx.manifest).ok);
    let result = commit(&publisher, begun.token, None);
    assert!(result.ok, "publish COMMIT: {:?}", result.blockers);
    let hex = fx.content_hash.strip_prefix("sha256-").unwrap();
    root.join("packages")
        .join(generation_basename(&fx.chat_id, hex))
}

fn generation_selector(fx: &Fixture) -> HandoffSelector {
    HandoffSelector::Generation {
        chat_id: fx.chat_id.clone(),
        content_hash: fx.content_hash.clone(),
    }
}

fn blocker<T>(result: &T) -> String
where
    T: HasBlockers,
{
    result.blockers()[0].code.clone()
}

trait HasBlockers {
    fn blockers(&self) -> &[Blocker];
}

impl HasBlockers for BeginResult {
    fn blockers(&self) -> &[Blocker] {
        &self.blockers
    }
}
impl HasBlockers for ReadResult {
    fn blockers(&self) -> &[Blocker] {
        &self.blockers
    }
}
impl HasBlockers for EndResult {
    fn blockers(&self) -> &[Blocker] {
        &self.blockers
    }
}

fn read_all(handoff: &Handoff, token: u64, object_id: &str, length: u64) -> Vec<u8> {
    let mut out = Vec::new();
    let mut offset = 0u64;
    while offset < length {
        let result = read(handoff, token, object_id, offset, 7);
        assert!(result.ok, "READ refused: {:?}", result.blockers);
        assert!(result.bytes.len() <= 7);
        assert_eq!(result.offset, offset);
        offset = result.next_offset;
        out.extend_from_slice(&result.bytes);
    }
    assert_eq!(offset, length);
    out
}

#[test]
fn verified_generation_begin_read_end_is_exact_bounded_and_deterministic() {
    let root = scratch("happy");
    let fx = v1_fixture("chat_happy", "hello immutable handoff");
    publish(&root, &fx);
    let handoff = Handoff::new(&root);

    let first = begin(&handoff, &generation_selector(&fx));
    assert!(first.ok, "{:?}", first.blockers);
    let descriptor = first.descriptor.clone().expect("descriptor");
    assert_eq!(descriptor.schema, HANDOFF_SCHEMA);
    assert_eq!(descriptor.version, 1);
    assert_eq!(descriptor.logical_identity.content_hash, fx.content_hash);
    assert_eq!(descriptor.construction_family, ConstructionFamily::V1);
    assert_eq!(descriptor.object_count, 4);
    assert_eq!(
        descriptor
            .objects
            .iter()
            .map(|object| object.object_id.as_str())
            .collect::<Vec<_>>(),
        vec!["manifest", "snapshot", "markdown", "html"]
    );
    assert!(descriptor.objects.iter().all(|object| {
        object.stored_sha256.starts_with("sha256-")
            && object.stored_sha256.len() == 71
            && object.encoding.is_none()
            && object.logical_sha256.is_none()
    }));

    let snapshot_len = descriptor
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap()
        .byte_length;
    assert_eq!(
        read_all(&handoff, first.token, "snapshot", snapshot_len),
        fx.snapshot
    );

    let second = begin(&handoff, &generation_selector(&fx));
    assert!(second.ok);
    assert_eq!(
        second.descriptor.as_ref().unwrap().representation_hash,
        descriptor.representation_hash,
        "same verified object set must have one representation identity"
    );
    assert!(end(&handoff, first.token).ok);
    assert_eq!(
        blocker(&read(&handoff, first.token, "snapshot", 0, 1)),
        codes::SESSION_UNKNOWN
    );
    assert_eq!(blocker(&end(&handoff, first.token)), codes::SESSION_UNKNOWN);
    assert!(end(&handoff, second.token).ok);

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn representation_hash_canonicalizes_object_order() {
    let root = scratch("order");
    let fx = v1_fixture("chat_order", "order");
    publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &generation_selector(&fx));
    let descriptor = begun.descriptor.clone().unwrap();
    let mut reversed = descriptor.objects.clone();
    reversed.reverse();
    let (hash, canonical, total) = representation_hash(
        &descriptor.logical_identity,
        descriptor.construction_family,
        descriptor.schema_version,
        descriptor.payload_version,
        &reversed,
    )
    .expect("representation");
    assert_eq!(hash, descriptor.representation_hash);
    assert_eq!(canonical, descriptor.objects);
    assert_eq!(total, descriptor.total_physical_bytes);
    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn public_descriptor_is_metadata_only_and_maps_to_transport_hash_reference() {
    let root = scratch("public-metadata");
    let fx = v2_fixture(&root, "chat_public", &[("png", b"asset-body")]);
    publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &generation_selector(&fx));
    assert!(begun.ok, "{:?}", begun.blockers);
    let descriptor = begun.descriptor.as_ref().unwrap();
    let json = serde_json::to_value(descriptor).expect("serialize descriptor");
    let object = json.as_object().unwrap();
    for forbidden in [
        "path",
        "archivePath",
        "packagePath",
        "memberPath",
        "casKey",
        "remotePath",
        "endpoint",
        "credential",
        "token",
        "payloadBody",
    ] {
        assert!(
            !object.contains_key(forbidden),
            "public descriptor must not expose {forbidden}"
        );
    }
    for item in json["objects"].as_array().unwrap() {
        let item = item.as_object().unwrap();
        assert!(!item.contains_key("path"));
        assert!(!item.contains_key("casKey"));
        assert!(!item.contains_key("memberPath"));
    }

    let hex = descriptor
        .representation_hash
        .strip_prefix("sha256-")
        .expect("archive hash prefix");
    assert_eq!(hex.len(), 64);
    assert!(hex
        .bytes()
        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()));
    let transport_reference = format!("sha256:{hex}");
    assert_eq!(transport_reference.len(), 71);
    assert!(transport_reference.starts_with("sha256:"));

    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn v2_assets_are_complete_cas_verified_and_never_silently_dropped() {
    let root = scratch("assets");
    let fx = v2_fixture(
        &root,
        "chat_assets",
        &[("png", b"z-asset"), ("jpg", b"a-asset")],
    );
    publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &generation_selector(&fx));
    assert!(begun.ok, "{:?}", begun.blockers);
    let descriptor = begun.descriptor.clone().unwrap();
    assert_eq!(descriptor.construction_family, ConstructionFamily::V2);
    let assets: Vec<_> = descriptor
        .objects
        .iter()
        .filter(|object| object.role == ObjectRole::Asset)
        .collect();
    assert_eq!(assets.len(), fx.assets.len());
    let mut hashes: Vec<_> = assets
        .iter()
        .map(|object| object.stored_sha256.clone())
        .collect();
    let mut expected: Vec<_> = fx.assets.iter().map(|(sha, _)| sha.clone()).collect();
    expected.sort();
    assert_eq!(
        hashes, expected,
        "asset objects are deterministically ordered"
    );
    hashes.sort();
    for object in assets {
        let expected_bytes = &fx
            .assets
            .iter()
            .find(|(identity, _)| identity == &object.stored_sha256)
            .unwrap()
            .1;
        assert_eq!(
            read_all(&handoff, begun.token, &object.object_id, object.byte_length),
            *expected_bytes
        );
    }
    assert!(end(&handoff, begun.token).ok);

    let (asset_sha, original) = &fx.assets[0];
    let hex = asset_sha.strip_prefix("sha256-").unwrap();
    let cas_path = root
        .join("assets")
        .join(&hex[0..2])
        .join(format!("sha256-{hex}"));
    std::fs::remove_file(&cas_path).expect("remove fixture CAS");
    let missing = begin(&handoff, &generation_selector(&fx));
    assert!(!missing.ok);
    assert_eq!(blocker(&missing), codes::ASSET_UNAVAILABLE);
    std::fs::write(&cas_path, b"corrupt").expect("corrupt fixture CAS");
    let corrupt = begin(&handoff, &generation_selector(&fx));
    assert!(!corrupt.ok);
    assert_eq!(blocker(&corrupt), codes::ASSET_IDENTITY_MISMATCH);
    std::fs::write(&cas_path, original).expect("restore fixture CAS");

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn semantic_selectors_fail_closed_for_missing_wrong_corrupt_partial_and_symlinked_occupants() {
    // Missing / wrong semantic identity.
    let root = scratch("selector-refusals");
    let fx = v1_fixture("chat_refuse", "refuse");
    let package = publish(&root, &fx);
    let handoff = Handoff::new(&root);
    for selector in [
        HandoffSelector::Generation {
            chat_id: "chat_missing".into(),
            content_hash: fx.content_hash.clone(),
        },
        HandoffSelector::Generation {
            chat_id: fx.chat_id.clone(),
            content_hash: format!("sha256-{}", "0".repeat(64)),
        },
    ] {
        let refused = begin(&handoff, &selector);
        assert!(!refused.ok);
        assert_eq!(blocker(&refused), codes::PACKAGE_UNVERIFIED);
    }

    // Valid bytes under an identity-mismatched name are not laundered.
    let lying_hex = "1".repeat(64);
    let lying = root
        .join("packages")
        .join(generation_basename(&fx.chat_id, &lying_hex));
    std::fs::rename(&package, &lying).expect("rename occupant");
    let mismatch = begin(
        &handoff,
        &HandoffSelector::Generation {
            chat_id: fx.chat_id.clone(),
            content_hash: format!("sha256-{lying_hex}"),
        },
    );
    assert!(!mismatch.ok);
    assert_eq!(blocker(&mismatch), codes::PACKAGE_IDENTITY_MISMATCH);

    // A symlink at the canonical name is never followed.
    std::os::unix::fs::symlink(&lying, &package).expect("package symlink");
    let symlink = begin(&handoff, &generation_selector(&fx));
    assert!(!symlink.ok);
    assert_eq!(blocker(&symlink), codes::PACKAGE_UNVERIFIED);
    std::fs::remove_file(&package).expect("remove symlink");
    std::fs::rename(&lying, &package).expect("restore name");

    // Corrupt and partial occupants are both rejected by the shared verifier.
    std::fs::write(package.join("snapshot.json"), b"corrupt").expect("corrupt snapshot");
    let corrupt = begin(&handoff, &generation_selector(&fx));
    assert!(!corrupt.ok);
    assert_eq!(blocker(&corrupt), codes::PACKAGE_UNVERIFIED);
    std::fs::write(package.join("snapshot.json"), &fx.snapshot).expect("restore snapshot");
    std::fs::remove_file(package.join("manifest.json")).expect("remove manifest");
    let partial = begin(&handoff, &generation_selector(&fx));
    assert!(!partial.ok);
    assert_eq!(blocker(&partial), codes::PACKAGE_UNVERIFIED);

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn caller_paths_are_not_part_of_the_deserializable_contract() {
    let hash = format!("sha256-{}", "a".repeat(64));
    let raw_path = format!(
        r#"{{"selector":{{"kind":"generation","chatId":"chat","contentHash":"{hash}","archivePath":"/tmp/escape"}}}}"#
    );
    assert!(serde_json::from_str::<BeginOptions>(&raw_path).is_err());
    let outer_path = format!(
        r#"{{"selector":{{"kind":"generation","chatId":"chat","contentHash":"{hash}"}},"packagePath":"../../escape"}}"#
    );
    assert!(serde_json::from_str::<BeginOptions>(&outer_path).is_err());

    let root = scratch("path-selector");
    let handoff = Handoff::new(&root);
    let invalid = begin(
        &handoff,
        &HandoffSelector::Generation {
            chat_id: "../escape".into(),
            content_hash: hash,
        },
    );
    assert!(!invalid.ok);
    assert_eq!(blocker(&invalid), codes::SELECTOR_INVALID);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn retained_handles_survive_package_rename_and_unlink_while_new_begin_refuses() {
    let root = scratch("stable-fd");
    let fx = v1_fixture("chat_stable", "stable bytes after unlink");
    let package = publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &generation_selector(&fx));
    assert!(begun.ok, "{:?}", begun.blockers);
    let descriptor = begun.descriptor.as_ref().unwrap();
    let snapshot_len = descriptor
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap()
        .byte_length;

    let moved = root.join("packages").join("moved-out-of-canonical-name");
    std::fs::rename(&package, &moved).expect("rename package pathname");
    std::fs::remove_dir_all(&moved).expect("unlink opened package tree");

    assert_eq!(
        read_all(&handoff, begun.token, "snapshot", snapshot_len),
        fx.snapshot,
        "the retained inode must remain byte-stable after pathname removal"
    );
    let new_begin = begin(&handoff, &generation_selector(&fx));
    assert!(!new_begin.ok);
    assert_eq!(blocker(&new_begin), codes::PACKAGE_UNVERIFIED);
    assert!(end(&handoff, begun.token).ok);

    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn read_refuses_unknown_authority_and_all_unbounded_or_overflowing_windows() {
    let root = scratch("read-refusals");
    let fx = v1_fixture("chat_read", "read");
    publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &generation_selector(&fx));
    let length = begun
        .descriptor
        .as_ref()
        .unwrap()
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap()
        .byte_length;

    assert_eq!(
        blocker(&read(&handoff, u64::MAX, "snapshot", 0, 1)),
        codes::SESSION_UNKNOWN
    );
    assert_eq!(
        blocker(&read(&handoff, begun.token, "no-such-object", 0, 1)),
        codes::OBJECT_UNKNOWN
    );
    assert_eq!(
        blocker(&read(&handoff, begun.token, "snapshot", u64::MAX, 2)),
        codes::READ_OFFSET_OVERFLOW
    );
    assert_eq!(
        blocker(&read(&handoff, begun.token, "snapshot", 0, 0)),
        codes::READ_BOUND_INVALID
    );
    assert_eq!(
        blocker(&read(
            &handoff,
            begun.token,
            "snapshot",
            0,
            READ_CAP_BYTES + 1
        )),
        codes::READ_BOUND_INVALID
    );
    assert_eq!(
        blocker(&read(&handoff, begun.token, "snapshot", length + 1, 1)),
        codes::READ_OFFSET_OUT_OF_RANGE
    );
    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn admission_is_bounded_and_expiry_closes_handles_without_a_durable_lease() {
    let root = scratch("lifecycle");
    let fx = v1_fixture("chat_lifecycle", "lifecycle");
    publish(&root, &fx);
    let before: Vec<_> = std::fs::read_dir(root.join("packages"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    let handoff = Handoff::new(&root);
    let mut tokens = Vec::new();
    for _ in 0..crate::archive_generation_publish::MAX_ADMITTED_SESSIONS {
        let begun = begin(&handoff, &generation_selector(&fx));
        assert!(begun.ok);
        tokens.push(begun.token);
    }
    let full = begin(&handoff, &generation_selector(&fx));
    assert!(!full.ok);
    assert_eq!(blocker(&full), codes::SESSIONS_EXHAUSTED);

    let expired_session = {
        let registry = handoff.registry.inner.lock().unwrap();
        Arc::clone(registry.sessions.get(&tokens[0]).unwrap())
    };
    expired_session.inner.lock().unwrap().last_activity = Instant::now()
        .checked_sub(
            crate::archive_generation_publish::SESSION_IDLE_TIMEOUT
                + std::time::Duration::from_secs(1),
        )
        .unwrap();
    let replacement = begin(&handoff, &generation_selector(&fx));
    assert!(replacement.ok, "expired session must free one slot");
    assert_eq!(
        blocker(&read(&handoff, tokens[0], "snapshot", 0, 1)),
        codes::SESSION_UNKNOWN
    );

    for token in tokens
        .into_iter()
        .skip(1)
        .chain(std::iter::once(replacement.token))
    {
        assert!(end(&handoff, token).ok);
    }
    let after: Vec<_> = std::fs::read_dir(root.join("packages"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(
        after, before,
        "BEGIN/expiry/END must create no lease artifact"
    );
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn physical_representation_can_change_without_redefining_logical_content_hash() {
    let root = scratch("two-layer-identity");
    let mut fx = v1_fixture("chat_identity", "identity");
    let package = publish(&root, &fx);
    let handoff = Handoff::new(&root);
    let first = begin(&handoff, &generation_selector(&fx));
    let first_descriptor = first.descriptor.clone().unwrap();
    assert!(end(&handoff, first.token).ok);

    // Presentation bytes do not participate in frozen v1 contentHash. Change
    // only that physical representation and its manifest descriptor.
    fx.markdown = b"# physically different renderer\n".to_vec();
    fx.manifest = v1_manifest(&fx);
    std::fs::write(package.join("chat.md"), &fx.markdown).expect("replace fixture markdown");
    std::fs::write(package.join("manifest.json"), &fx.manifest).expect("replace fixture manifest");

    let second = begin(&handoff, &generation_selector(&fx));
    assert!(second.ok, "{:?}", second.blockers);
    let second_descriptor = second.descriptor.as_ref().unwrap();
    assert_eq!(
        second_descriptor.logical_identity.content_hash,
        first_descriptor.logical_identity.content_hash,
        "M07 must preserve the existing logical authority"
    );
    assert_ne!(
        second_descriptor.representation_hash, first_descriptor.representation_hash,
        "exact physical bytes/object-set must have a distinct identity"
    );
    assert!(end(&handoff, second.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn explicit_semantic_legacy_selector_works_without_a_path() {
    let root = scratch("legacy");
    let fx = v1_fixture("chat_legacy", "legacy");
    let generation = publish(&root, &fx);
    let legacy = root.join("packages").join(legacy_basename(&fx.chat_id));
    std::fs::rename(generation, legacy).expect("grandfather fixture");
    let handoff = Handoff::new(&root);
    let begun = begin(
        &handoff,
        &HandoffSelector::Legacy {
            chat_id: fx.chat_id.clone(),
        },
    );
    assert!(begun.ok, "{:?}", begun.blockers);
    assert_eq!(
        begun
            .descriptor
            .as_ref()
            .unwrap()
            .logical_identity
            .content_hash,
        fx.content_hash
    );
    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}
