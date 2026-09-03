use super::*;
use crate::archive_generation_publish::{
    begin as publish_begin, commit_with_policy, write_member, Member, Publisher,
};
use crate::saved_chat_generation_policy::LiveGenerationFamily;
use crate::saved_chat_package_verify::tests::{
    gzip_zero_asset_v3, permanent_v3_fixture, zero_asset_v3, OwnedPackage,
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
    let result = commit_with_policy(&publisher, begun.token, None, LiveGenerationFamily::V1V2);
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

fn canonical_cas_path(root: &Path, identity: &str) -> PathBuf {
    let hex = identity.strip_prefix("sha256-").unwrap();
    root.join("assets")
        .join(&hex[0..2])
        .join(format!("sha256-{hex}"))
}

fn package_content_hash(package: &OwnedPackage) -> String {
    serde_json::from_slice::<serde_json::Value>(&package.manifest)
        .expect("package manifest")
        .get("contentHash")
        .and_then(serde_json::Value::as_str)
        .expect("contentHash")
        .to_string()
}

fn mutate_package_manifest(
    package: &mut OwnedPackage,
    update: impl FnOnce(&mut serde_json::Value),
) {
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&package.manifest).expect("package manifest");
    update(&mut manifest);
    package.manifest = serde_json::to_vec(&manifest).expect("serialize package manifest");
}

fn rebind_snapshot_physical_descriptor(package: &mut OwnedPackage) {
    let snapshot = package.snapshot.as_ref().expect("snapshot");
    let physical_sha = sha(snapshot);
    let physical_len = snapshot.len() as u64;
    mutate_package_manifest(package, |manifest| {
        manifest["files"]["snapshot"]["sha256"] = physical_sha.into();
        manifest["files"]["snapshot"]["byteLength"] = physical_len.into();
    });
}

fn publish_v3(root: &Path, package: &OwnedPackage) -> PathBuf {
    package.install_cas(root);
    let publisher = Publisher::new(root.to_path_buf());
    let begun = publish_begin(&publisher, &package.chat_id);
    assert!(begun.ok, "v3 publish BEGIN: {:?}", begun.blockers);
    assert!(
        write_member(
            &publisher,
            begun.token,
            Member::Snapshot,
            package.snapshot.as_deref().expect("v3 snapshot"),
        )
        .ok
    );
    assert!(write_member(&publisher, begun.token, Member::Manifest, &package.manifest,).ok);
    let result = commit_with_policy(&publisher, begun.token, None, LiveGenerationFamily::V3);
    assert!(result.ok, "v3 publish COMMIT: {:?}", result.blockers);
    let hex = result
        .content_hash
        .strip_prefix("sha256-")
        .expect("trusted v3 hash");
    root.join("packages")
        .join(generation_basename(&package.chat_id, hex))
}

fn install_direct_v3(root: &Path, package: &OwnedPackage, selector_content_hash: &str) -> PathBuf {
    package.install_cas(root);
    let hex = selector_content_hash
        .strip_prefix("sha256-")
        .expect("selector hash");
    let path = root
        .join("packages")
        .join(generation_basename(&package.chat_id, hex));
    std::fs::create_dir_all(&path).expect("direct package");
    std::fs::write(path.join("manifest.json"), &package.manifest).expect("manifest");
    if let Some(snapshot) = &package.snapshot {
        std::fs::write(path.join("snapshot.json"), snapshot).expect("snapshot");
    }
    if let Some(markdown) = &package.markdown {
        std::fs::write(path.join("chat.md"), markdown).expect("markdown");
    }
    if let Some(html) = &package.html {
        std::fs::write(path.join("chat.html"), html).expect("html");
    }
    for asset in &package.assets {
        let (_, bytes) = package
            .asset_bodies
            .iter()
            .find(|(sha, _)| sha == &asset.sha256)
            .expect("asset body");
        let target = path.join(&asset.path);
        std::fs::create_dir_all(target.parent().expect("asset parent")).expect("asset directory");
        std::fs::write(target, bytes).expect("package asset");
    }
    path
}

fn v3_selector(package: &OwnedPackage, content_hash: &str) -> HandoffSelector {
    HandoffSelector::Generation {
        chat_id: package.chat_id.clone(),
        content_hash: content_hash.to_string(),
    }
}

fn assert_direct_v3_refused(
    tag: &str,
    package: &OwnedPackage,
    selector_content_hash: &str,
    mutate_fs: impl FnOnce(&Path),
) {
    let root = scratch(tag);
    let package_path = install_direct_v3(&root, package, selector_content_hash);
    mutate_fs(&package_path);
    let handoff = Handoff::new(&root);
    let result = begin(&handoff, &v3_selector(package, selector_content_hash));
    assert!(!result.ok, "invalid v3 BEGIN unexpectedly succeeded");
    assert_eq!(blocker(&result), codes::PACKAGE_UNVERIFIED);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
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
        assert_eq!(blocker(&refused), codes::PACKAGE_ABSENT);
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
fn failed_late_asset_admission_publishes_nothing_and_releases_capacity() {
    let root = scratch("atomic-admission");
    let fx = v2_fixture(
        &root,
        "chat_atomic",
        &[("png", b"first-body"), ("jpg", b"second-body")],
    );
    publish(&root, &fx);
    let handoff = Handoff::new(&root);

    let mut assets = fx.assets.clone();
    assets.sort_by(|a, b| a.0.cmp(&b.0));
    let (missing_sha, original) = assets.last().unwrap();
    let missing_path = canonical_cas_path(&root, missing_sha);
    std::fs::remove_file(&missing_path).expect("remove last canonical CAS object");

    let refused = begin(&handoff, &generation_selector(&fx));
    assert!(!refused.ok);
    assert_eq!(blocker(&refused), codes::ASSET_UNAVAILABLE);
    assert_eq!(refused.token, 0);
    assert!(refused.descriptor.is_none());
    {
        let registry = handoff.registry.inner.lock().unwrap();
        assert!(registry.sessions.is_empty());
        assert_eq!(registry.building, 0);
    }

    std::fs::write(&missing_path, original).expect("restore canonical CAS object");
    let retry = begin(&handoff, &generation_selector(&fx));
    assert!(retry.ok, "released admission must be reusable");
    assert!(end(&handoff, retry.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn in_progress_begin_reservations_share_the_four_session_capacity() {
    let root = scratch("building-capacity");
    let handoff = Handoff::new(&root);
    for _ in 0..crate::archive_generation_publish::MAX_ADMITTED_SESSIONS {
        assert_eq!(handoff.reserve_begin(), Ok(()));
    }
    assert_eq!(
        handoff.reserve_begin(),
        Err(codes::SESSIONS_EXHAUSTED),
        "in-progress admissions must consume the same bound as live sessions"
    );
    for _ in 0..crate::archive_generation_publish::MAX_ADMITTED_SESSIONS {
        handoff.cancel_begin();
    }
    let registry = handoff.registry.inner.lock().unwrap();
    assert_eq!(registry.building, 0);
    assert!(registry.sessions.is_empty());
    drop(registry);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn handoff_tokens_are_lossless_opaque_decimal_text() {
    let max_text = u64::MAX.to_string();
    let serialized = serde_json::to_value(BeginResult {
        schema: HANDOFF_SCHEMA,
        ok: true,
        token: u64::MAX,
        descriptor: None,
        blockers: Vec::new(),
    })
    .unwrap();
    assert_eq!(serialized["token"].as_str(), Some(max_text.as_str()));

    let read_text = format!(
        r#"{{"token":"{}","objectId":"manifest","offset":0,"maxBytes":1}}"#,
        u64::MAX
    );
    let read_options: ReadOptions = serde_json::from_str(&read_text).unwrap();
    assert_eq!(read_options.token, u64::MAX);
    let end_text = format!(r#"{{"token":"{}"}}"#, u64::MAX);
    let end_options: EndOptions = serde_json::from_str(&end_text).unwrap();
    assert_eq!(end_options.token, u64::MAX);

    let numeric = format!(
        r#"{{"token":{},"objectId":"manifest","offset":0,"maxBytes":1}}"#,
        u64::MAX
    );
    assert!(serde_json::from_str::<ReadOptions>(&numeric).is_err());
}

#[test]
fn repeated_snapshot_asset_refs_create_one_physical_asset_object() {
    let root = scratch("repeated-asset-refs");
    let mut fx = v2_fixture(&root, "chat_repeated_refs", &[("png", b"one-body")]);
    let asset_sha = fx.assets[0].0.clone();
    fx.snapshot = format!(
        r#"{{"schemaVersion":2,"chatId":"{}","snapshotId":"s1","savedAt":"2026-08-31T00:00:00Z","messages":[{{"id":"m0","turnIndex":0,"assetRefs":["{1}","{1}","{1}"]}}]}}"#,
        fx.chat_id, asset_sha
    )
    .into_bytes();
    fx.content_hash = crate::archive_generation_publish::derive_content_hash_for_test(
        true,
        &fx.snapshot,
        std::slice::from_ref(&asset_sha),
    );
    fx.manifest = format!(
        r#"{{"schema":"h2o.savedChatPackage","schemaVersion":2,"payloadVersion":2,"chatId":"{}","snapshotId":"s1","contentHash":"{}","files":{{"snapshot":{{"path":"snapshot.json","sha256":"{}","byteLength":{}}},"markdown":{{"path":"chat.md","sha256":"{}","byteLength":{}}},"html":{{"path":"chat.html","sha256":"{}","byteLength":{}}}}},"assets":[{{"path":"assets/{}.png","sha256":"{}","ext":"png","mimeType":"image/png","byteLength":{}}}]}}"#,
        fx.chat_id,
        fx.content_hash,
        sha(&fx.snapshot),
        fx.snapshot.len(),
        sha(&fx.markdown),
        fx.markdown.len(),
        sha(&fx.html),
        fx.html.len(),
        asset_sha,
        asset_sha,
        fx.assets[0].1.len(),
    )
    .into_bytes();
    publish(&root, &fx);

    let handoff = Handoff::new(&root);
    let first = begin(&handoff, &generation_selector(&fx));
    assert!(first.ok, "{:?}", first.blockers);
    let descriptor = first.descriptor.as_ref().unwrap();
    assert_eq!(
        descriptor
            .objects
            .iter()
            .filter(|object| object.role == ObjectRole::Asset)
            .count(),
        1
    );
    assert_eq!(descriptor.object_count, 5);
    assert_eq!(
        descriptor.total_physical_bytes,
        descriptor
            .objects
            .iter()
            .map(|object| object.byte_length)
            .sum::<u64>()
    );
    assert!(end(&handoff, first.token).ok);
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
    assert_eq!(blocker(&new_begin), codes::PACKAGE_ABSENT);
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
fn v3_identity_and_gzip_handoff_preserve_logical_identity_and_physical_distinction() {
    let identity_root = scratch("v3-identity");
    let gzip_root = scratch("v3-gzip");
    let identity = zero_asset_v3();
    let gzip = gzip_zero_asset_v3();
    let content_hash = package_content_hash(&identity);
    assert_eq!(package_content_hash(&gzip), content_hash);
    publish_v3(&identity_root, &identity);
    publish_v3(&gzip_root, &gzip);

    let identity_handoff = Handoff::new(&identity_root);
    let gzip_handoff = Handoff::new(&gzip_root);
    let identity_begin = begin(&identity_handoff, &v3_selector(&identity, &content_hash));
    let gzip_begin = begin(&gzip_handoff, &v3_selector(&gzip, &content_hash));
    assert!(identity_begin.ok, "{:?}", identity_begin.blockers);
    assert!(gzip_begin.ok, "{:?}", gzip_begin.blockers);
    let identity_descriptor = identity_begin.descriptor.as_ref().unwrap();
    let gzip_descriptor = gzip_begin.descriptor.as_ref().unwrap();

    for descriptor in [identity_descriptor, gzip_descriptor] {
        assert_eq!(descriptor.construction_family, ConstructionFamily::V3);
        assert_eq!(descriptor.schema_version, 3);
        assert_eq!(descriptor.payload_version, Some(3));
        assert_eq!(descriptor.logical_identity.content_hash, content_hash);
        assert_eq!(descriptor.object_count, 2);
        assert_eq!(
            descriptor
                .objects
                .iter()
                .map(|object| object.object_id.as_str())
                .collect::<Vec<_>>(),
            vec!["manifest", "snapshot"]
        );
    }

    let identity_snapshot = identity_descriptor
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap();
    let gzip_snapshot = gzip_descriptor
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap();
    assert_eq!(identity_snapshot.encoding.as_deref(), Some("identity"));
    assert_eq!(gzip_snapshot.encoding.as_deref(), Some("gzip"));
    assert_eq!(
        identity_snapshot.logical_sha256,
        gzip_snapshot.logical_sha256
    );
    assert_eq!(
        identity_snapshot.logical_byte_length,
        gzip_snapshot.logical_byte_length
    );
    assert_ne!(identity_snapshot.stored_sha256, gzip_snapshot.stored_sha256);
    assert_ne!(identity_snapshot.byte_length, gzip_snapshot.byte_length);
    assert_ne!(
        identity_descriptor.representation_hash,
        gzip_descriptor.representation_hash
    );
    assert_eq!(
        read_all(
            &identity_handoff,
            identity_begin.token,
            "snapshot",
            identity_snapshot.byte_length,
        ),
        identity.snapshot.as_ref().unwrap().as_slice()
    );
    assert_eq!(
        read_all(
            &gzip_handoff,
            gzip_begin.token,
            "snapshot",
            gzip_snapshot.byte_length,
        ),
        gzip.snapshot.as_ref().unwrap().as_slice()
    );
    assert!(end(&identity_handoff, identity_begin.token).ok);
    assert!(end(&gzip_handoff, gzip_begin.token).ok);
    let _ = std::fs::remove_dir_all(identity_root.parent().unwrap());
    let _ = std::fs::remove_dir_all(gzip_root.parent().unwrap());
}

#[test]
fn v3_asset_handoff_is_exact_and_excludes_derived_renderers() {
    let root = scratch("v3-assets");
    let package = permanent_v3_fixture(false);
    let content_hash = package_content_hash(&package);
    publish_v3(&root, &package);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &v3_selector(&package, &content_hash));
    assert!(begun.ok, "{:?}", begun.blockers);
    let descriptor = begun.descriptor.as_ref().unwrap();
    assert_eq!(descriptor.object_count, 2 + package.assets.len() as u64);
    assert!(descriptor
        .objects
        .iter()
        .all(|object| !matches!(object.role, ObjectRole::Markdown | ObjectRole::Html)));
    let handoff_assets: Vec<_> = descriptor
        .objects
        .iter()
        .filter(|object| object.role == ObjectRole::Asset)
        .collect();
    assert_eq!(handoff_assets.len(), package.assets.len());
    for object in handoff_assets {
        let (_, expected) = package
            .asset_bodies
            .iter()
            .find(|(sha, _)| sha == &object.stored_sha256)
            .expect("asset body");
        assert_eq!(
            read_all(&handoff, begun.token, &object.object_id, object.byte_length),
            *expected
        );
    }
    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn v3_retained_handles_survive_package_rename_and_unlink() {
    let root = scratch("v3-stable-fd");
    let package = gzip_zero_asset_v3();
    let content_hash = package_content_hash(&package);
    let package_path = publish_v3(&root, &package);
    let handoff = Handoff::new(&root);
    let begun = begin(&handoff, &v3_selector(&package, &content_hash));
    assert!(begun.ok, "{:?}", begun.blockers);
    let snapshot_len = begun
        .descriptor
        .as_ref()
        .unwrap()
        .objects
        .iter()
        .find(|object| object.object_id == "snapshot")
        .unwrap()
        .byte_length;
    let moved = root.join("packages").join("moved-v3-out-of-canonical-name");
    std::fs::rename(&package_path, &moved).expect("rename v3 package");
    std::fs::remove_dir_all(&moved).expect("unlink v3 package tree");
    assert_eq!(
        read_all(&handoff, begun.token, "snapshot", snapshot_len),
        *package.snapshot.as_ref().unwrap()
    );
    let replacement = begin(&handoff, &v3_selector(&package, &content_hash));
    assert!(!replacement.ok);
    assert_eq!(blocker(&replacement), codes::PACKAGE_ABSENT);
    assert!(end(&handoff, begun.token).ok);
    let _ = std::fs::remove_dir_all(root.parent().unwrap());
}

#[test]
fn handoff_read_admission_is_independent_from_new_write_family() {
    let v1_root = scratch("cross-policy-v1");
    let v1 = v1_fixture("cross_policy_v1", "rollback-readable");
    publish(&v1_root, &v1);
    assert!(!ConstructionFamily::V1.is_live_writer_family_for(LiveGenerationFamily::V3));
    assert_eq!(
        crate::saved_chat_generation_policy::production_live_generation_family(),
        LiveGenerationFamily::V3
    );
    assert!(!ConstructionFamily::V1.is_live_writer_family());
    let v1_handoff = Handoff::new(&v1_root);
    let v1_begin = begin(&v1_handoff, &generation_selector(&v1));
    assert!(v1_begin.ok, "{:?}", v1_begin.blockers);
    assert!(end(&v1_handoff, v1_begin.token).ok);

    let v3_root = scratch("cross-policy-v3");
    let v3 = zero_asset_v3();
    let content_hash = package_content_hash(&v3);
    publish_v3(&v3_root, &v3);
    assert!(ConstructionFamily::V3.is_live_writer_family());
    let v3_handoff = Handoff::new(&v3_root);
    let v3_begin = begin(&v3_handoff, &v3_selector(&v3, &content_hash));
    assert!(v3_begin.ok, "{:?}", v3_begin.blockers);
    assert!(end(&v3_handoff, v3_begin.token).ok);

    let _ = std::fs::remove_dir_all(v1_root.parent().unwrap());
    let _ = std::fs::remove_dir_all(v3_root.parent().unwrap());
}

#[test]
fn v3_begin_refuses_semantic_descriptor_inventory_type_and_asset_failures() {
    let good_identity = zero_asset_v3();
    let good_identity_hash = package_content_hash(&good_identity);
    let good_gzip = gzip_zero_asset_v3();
    let good_gzip_hash = package_content_hash(&good_gzip);
    let good_assets = permanent_v3_fixture(false);
    let good_assets_hash = package_content_hash(&good_assets);

    let mut malformed = good_identity.clone();
    malformed.manifest = b"{".to_vec();
    assert_direct_v3_refused("v3-malformed", &malformed, &good_identity_hash, |_| {});

    let mut false_content_hash = good_identity.clone();
    mutate_package_manifest(&mut false_content_hash, |manifest| {
        manifest["contentHash"] = format!("sha256-{}", "f".repeat(64)).into();
    });
    assert_direct_v3_refused(
        "v3-false-content-hash",
        &false_content_hash,
        &good_identity_hash,
        |_| {},
    );

    let mut bad_physical_sha = good_identity.clone();
    mutate_package_manifest(&mut bad_physical_sha, |manifest| {
        manifest["files"]["snapshot"]["sha256"] = format!("sha256-{}", "e".repeat(64)).into();
    });
    assert_direct_v3_refused(
        "v3-bad-physical-sha",
        &bad_physical_sha,
        &good_identity_hash,
        |_| {},
    );

    let mut bad_logical_sha = good_gzip.clone();
    mutate_package_manifest(&mut bad_logical_sha, |manifest| {
        manifest["files"]["snapshot"]["contentSha256"] =
            format!("sha256-{}", "d".repeat(64)).into();
    });
    assert_direct_v3_refused(
        "v3-bad-logical-sha",
        &bad_logical_sha,
        &good_gzip_hash,
        |_| {},
    );

    let mut malformed_gzip = good_gzip.clone();
    malformed_gzip.snapshot = Some(b"not-gzip".to_vec());
    rebind_snapshot_physical_descriptor(&mut malformed_gzip);
    assert_direct_v3_refused(
        "v3-malformed-gzip",
        &malformed_gzip,
        &good_gzip_hash,
        |_| {},
    );

    let mut persistent_markdown = good_identity.clone();
    persistent_markdown.markdown = Some(b"# forbidden durable renderer\n".to_vec());
    assert_direct_v3_refused(
        "v3-persistent-markdown",
        &persistent_markdown,
        &good_identity_hash,
        |_| {},
    );

    assert_direct_v3_refused(
        "v3-symlink-snapshot",
        &good_identity,
        &good_identity_hash,
        |package_path| {
            std::fs::remove_file(package_path.join("snapshot.json")).unwrap();
            std::os::unix::fs::symlink("manifest.json", package_path.join("snapshot.json"))
                .unwrap();
        },
    );
    assert_direct_v3_refused(
        "v3-directory-snapshot",
        &good_identity,
        &good_identity_hash,
        |package_path| {
            std::fs::remove_file(package_path.join("snapshot.json")).unwrap();
            std::fs::create_dir(package_path.join("snapshot.json")).unwrap();
        },
    );
    assert_direct_v3_refused(
        "v3-missing-snapshot",
        &good_identity,
        &good_identity_hash,
        |package_path| {
            std::fs::remove_file(package_path.join("snapshot.json")).unwrap();
        },
    );

    assert_direct_v3_refused(
        "v3-missing-package-asset",
        &good_assets,
        &good_assets_hash,
        |package_path| {
            std::fs::remove_file(package_path.join(&good_assets.assets[0].path)).unwrap();
        },
    );
    assert_direct_v3_refused(
        "v3-corrupt-package-asset",
        &good_assets,
        &good_assets_hash,
        |package_path| {
            std::fs::write(package_path.join(&good_assets.assets[0].path), b"corrupt").unwrap();
        },
    );
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
