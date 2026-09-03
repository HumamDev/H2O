use super::*;
use std::path::PathBuf;

#[derive(Clone)]
struct OwnedPackage {
    manifest: Vec<u8>,
    snapshot: Option<Vec<u8>>,
    markdown: Option<Vec<u8>>,
    html: Option<Vec<u8>>,
    assets: Vec<VerifiedAssetMember>,
    unexpected: Vec<String>,
    chat_id: String,
}

impl OwnedPackage {
    fn verify(
        &self,
        admission: VerificationAdmission,
    ) -> Result<VerifiedPackageSemantics, &'static str> {
        verify_package(
            PackageMembers {
                manifest: &self.manifest,
                snapshot: self.snapshot.as_deref(),
                markdown: self.markdown.as_deref(),
                html: self.html.as_deref(),
                assets: &self.assets,
                unexpected_members: &self.unexpected,
            },
            &self.chat_id,
            admission,
        )
    }

    fn manifest_value(&self) -> serde_json::Value {
        serde_json::from_slice(&self.manifest).expect("fixture manifest")
    }

    fn replace_manifest(&mut self, value: serde_json::Value) {
        self.manifest = serde_json::to_vec(&value).expect("serialize manifest");
    }

    fn mutate_manifest(&mut self, update: impl FnOnce(&mut serde_json::Value)) {
        let mut value = self.manifest_value();
        update(&mut value);
        self.replace_manifest(value);
    }

    fn rebind_snapshot_physical_descriptor(&mut self) {
        let snapshot = self.snapshot.as_ref().expect("snapshot");
        let sha = sha_of(snapshot);
        let len = snapshot.len() as u64;
        self.mutate_manifest(|value| {
            value["files"]["snapshot"]["sha256"] = serde_json::Value::String(sha);
            value["files"]["snapshot"]["byteLength"] = serde_json::Value::Number(len.into());
        });
    }
}

fn sha_of(bytes: &[u8]) -> String {
    format!("sha256-{}", sha256_hex(bytes))
}

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tools/validation/fixtures/saved-chat-archive/v3")
}

fn permanent_v3_fixture(gzip: bool) -> OwnedPackage {
    let root = if gzip {
        fixture_root().join("gzip/t06-canonical-assets.h2ochat")
    } else {
        fixture_root().join("t06-canonical-assets.h2ochat")
    };
    let manifest = std::fs::read(root.join("manifest.json")).expect("manifest fixture");
    let snapshot = std::fs::read(root.join("snapshot.json")).expect("snapshot fixture");
    let value: serde_json::Value = serde_json::from_slice(&manifest).expect("manifest json");
    let asset = &value["assets"][0];
    let asset_path = asset["path"].as_str().expect("asset path").to_string();
    let asset_bytes = std::fs::read(root.join(&asset_path)).expect("asset fixture");
    OwnedPackage {
        manifest,
        snapshot: Some(snapshot),
        markdown: None,
        html: None,
        assets: vec![VerifiedAssetMember {
            path: asset_path,
            sha256: sha_of(&asset_bytes),
            byte_length: asset_bytes.len() as u64,
        }],
        unexpected: Vec::new(),
        chat_id: "t06-canonical-assets".to_string(),
    }
}

fn zero_asset_v3() -> OwnedPackage {
    let snapshot = br#"{"schema":"h2o.savedChatSnapshot","schemaVersion":3,"chatId":"zero","snapshotId":"s0","savedAt":"2026-08-24T00:00:00.000Z","messages":[{"id":"m0","content":[{"type":"text","text":"hello"}],"assetRefs":[]}]}"#.to_vec();
    let logical_sha = sha_of(&snapshot);
    let content_hash = derive_content_hash_v3(&logical_sha, &[]).expect("v3 hash");
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schema": "h2o.savedChatPackage",
        "schemaVersion": 3,
        "payloadVersion": 3,
        "chatId": "zero",
        "snapshotId": "s0",
        "contentHash": content_hash,
        "files": {
            "snapshot": {
                "path": "snapshot.json",
                "sha256": logical_sha,
                "byteLength": snapshot.len(),
                "encoding": "identity"
            }
        },
        "assets": []
    }))
    .expect("manifest");
    OwnedPackage {
        manifest,
        snapshot: Some(snapshot),
        markdown: None,
        html: None,
        assets: Vec::new(),
        unexpected: Vec::new(),
        chat_id: "zero".to_string(),
    }
}

fn legacy_v1() -> OwnedPackage {
    let snapshot = br#"{"schemaVersion":1,"chatId":"v1","snapshotId":"s1","savedAt":"2026-08-24T00:00:00Z","messages":[]}"#.to_vec();
    let markdown = b"# v1\n".to_vec();
    let html = b"<p>v1</p>".to_vec();
    let content_hash = derive_content_hash_v1_v2(false, &snapshot, &[]);
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schema": "h2o.savedChatPackage",
        "schemaVersion": 1,
        "chatId": "v1",
        "snapshotId": "s1",
        "contentHash": content_hash,
        "files": {
            "snapshot": {"path":"snapshot.json","sha256":sha_of(&snapshot),"byteLength":snapshot.len()},
            "markdown": {"path":"chat.md","sha256":sha_of(&markdown),"byteLength":markdown.len()},
            "html": {"path":"chat.html","sha256":sha_of(&html),"byteLength":html.len()}
        },
        "assets": []
    }))
    .expect("manifest");
    OwnedPackage {
        manifest,
        snapshot: Some(snapshot),
        markdown: Some(markdown),
        html: Some(html),
        assets: Vec::new(),
        unexpected: Vec::new(),
        chat_id: "v1".to_string(),
    }
}

fn legacy_v2() -> OwnedPackage {
    let asset_bytes = b"v2-asset";
    let asset_sha = sha_of(asset_bytes);
    let asset_path = format!("assets/{asset_sha}.png");
    let snapshot = format!(
        r#"{{"schemaVersion":2,"chatId":"v2","snapshotId":"s2","savedAt":"2026-08-24T00:00:00Z","messages":[{{"assetRefs":["{asset_sha}"]}}]}}"#
    )
    .into_bytes();
    let markdown = b"# v2\n".to_vec();
    let html = b"<p>v2</p>".to_vec();
    let content_hash = derive_content_hash_v1_v2(true, &snapshot, &[asset_sha.clone()]);
    let manifest = serde_json::to_vec(&serde_json::json!({
        "schema": "h2o.savedChatPackage",
        "schemaVersion": 2,
        "payloadVersion": 2,
        "chatId": "v2",
        "snapshotId": "s2",
        "contentHash": content_hash,
        "files": {
            "snapshot": {"path":"snapshot.json","sha256":sha_of(&snapshot),"byteLength":snapshot.len()},
            "markdown": {"path":"chat.md","sha256":sha_of(&markdown),"byteLength":markdown.len()},
            "html": {"path":"chat.html","sha256":sha_of(&html),"byteLength":html.len()}
        },
        "assets": [{
            "path": asset_path,
            "sha256": asset_sha,
            "ext": "png",
            "mimeType": "image/png",
            "byteLength": asset_bytes.len()
        }]
    }))
    .expect("manifest");
    OwnedPackage {
        manifest,
        snapshot: Some(snapshot),
        markdown: Some(markdown),
        html: Some(html),
        assets: vec![VerifiedAssetMember {
            path: asset_path,
            sha256: asset_sha,
            byte_length: asset_bytes.len() as u64,
        }],
        unexpected: Vec::new(),
        chat_id: "v2".to_string(),
    }
}

fn assert_refused(package: &OwnedPackage, expected: &str) {
    assert_eq!(
        package
            .verify(VerificationAdmission::V1V2AndV3)
            .expect_err("fixture must refuse"),
        expected
    );
}

#[test]
fn permanent_identity_and_gzip_fixtures_verify_to_one_js_identity() {
    let identity = permanent_v3_fixture(false)
        .verify(VerificationAdmission::V1V2AndV3)
        .expect("identity verifies");
    let gzip = permanent_v3_fixture(true)
        .verify(VerificationAdmission::V1V2AndV3)
        .expect("gzip verifies");

    assert_eq!(identity.family, PackageFamily::V3);
    assert_eq!(gzip.family, PackageFamily::V3);
    assert_eq!(identity.snapshot_encoding, SnapshotEncoding::Identity);
    assert_eq!(gzip.snapshot_encoding, SnapshotEncoding::Gzip);
    assert_eq!(
        identity.content_hash,
        "sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433",
        "trusted hash must match the permanent JS v3 fixture"
    );
    assert_eq!(identity.content_hash, gzip.content_hash);
    assert_eq!(
        identity.logical_snapshot_sha256,
        gzip.logical_snapshot_sha256
    );
    assert_eq!(
        identity.logical_snapshot_byte_length,
        gzip.logical_snapshot_byte_length
    );
    assert_eq!(identity.logical_snapshot_bytes, gzip.logical_snapshot_bytes);
    assert_ne!(
        identity.snapshot_physical_sha256,
        gzip.snapshot_physical_sha256
    );
    assert_ne!(
        identity.snapshot_physical_byte_length,
        gzip.snapshot_physical_byte_length
    );
    assert_eq!(identity.asset_shas.len(), 1);
    assert_eq!(
        identity.saved_at.as_deref(),
        Some("2026-08-24T00:00:00.000Z")
    );

    let parsed: serde_json::Value =
        serde_json::from_slice(&identity.logical_snapshot_bytes).expect("logical snapshot");
    for message in parsed["messages"].as_array().expect("messages") {
        assert!(
            message["content"].is_array(),
            "typed content[] is canonical"
        );
        assert!(message.get("contentText").is_none());
        assert!(message.get("contentHtml").is_none());
    }
}

#[test]
fn v3_plaintext_manifest_and_zero_asset_package_verify() {
    let package = zero_asset_v3();
    assert_eq!(package.manifest.first().copied(), Some(b'{'));
    let verified = package
        .verify(VerificationAdmission::V1V2AndV3)
        .expect("zero-asset v3 verifies");
    assert_eq!(verified.family, PackageFamily::V3);
    assert!(verified.asset_shas.is_empty());
    assert_eq!(verified.manifest.schema_version, 3);
    assert_eq!(verified.manifest.payload_version, Some(3));
}

#[test]
fn current_v1_v2_semantics_and_content_hashes_remain_accepted() {
    for package in [legacy_v1(), legacy_v2()] {
        let verified = package
            .verify(VerificationAdmission::V1V2Only)
            .expect("legacy package verifies");
        assert_eq!(verified.content_hash, verified.manifest.content_hash);
        assert_eq!(verified.snapshot_encoding, SnapshotEncoding::Identity);
    }
    assert_eq!(
        legacy_v1()
            .verify(VerificationAdmission::V1V2Only)
            .unwrap()
            .family,
        PackageFamily::V1
    );
    assert_eq!(
        legacy_v2()
            .verify(VerificationAdmission::V1V2Only)
            .unwrap()
            .family,
        PackageFamily::V2
    );
}

#[test]
fn production_admission_mode_still_refuses_v3() {
    assert_eq!(
        permanent_v3_fixture(false)
            .verify(VerificationAdmission::V1V2Only)
            .unwrap_err(),
        "generation-manifest-version-triple-incoherent"
    );
}

#[test]
fn v3_rejects_encoding_and_physical_descriptor_failures() {
    let mut unsupported = permanent_v3_fixture(false);
    unsupported.mutate_manifest(|v| v["files"]["snapshot"]["encoding"] = "br".into());
    assert_refused(&unsupported, "generation-v3-snapshot-encoding-invalid");

    let mut sha = permanent_v3_fixture(true);
    sha.mutate_manifest(|v| {
        v["files"]["snapshot"]["sha256"] = format!("sha256-{}", "0".repeat(64)).into()
    });
    assert_refused(&sha, "generation-member-sha-mismatch");

    let mut len = permanent_v3_fixture(true);
    len.mutate_manifest(|v| v["files"]["snapshot"]["byteLength"] = 498.into());
    assert_refused(&len, "generation-member-byte-length-mismatch");
}

#[test]
fn v3_rejects_gzip_logical_descriptor_and_bounded_decode_failures() {
    let mut sha = permanent_v3_fixture(true);
    sha.mutate_manifest(|v| {
        v["files"]["snapshot"]["contentSha256"] = format!("sha256-{}", "0".repeat(64)).into()
    });
    assert_refused(&sha, "generation-v3-gzip-decoded-sha-mismatch");

    let mut length = permanent_v3_fixture(true);
    length.mutate_manifest(|v| v["files"]["snapshot"]["contentByteLength"] = 1200.into());
    assert_refused(&length, "generation-v3-gzip-decoded-length-mismatch");

    let mut declared_too_small = permanent_v3_fixture(true);
    declared_too_small
        .mutate_manifest(|v| v["files"]["snapshot"]["contentByteLength"] = 1000.into());
    assert_refused(
        &declared_too_small,
        "generation-v3-gzip-decoded-bound-exceeded",
    );

    let mut over_cap = permanent_v3_fixture(true);
    over_cap.mutate_manifest(|v| {
        v["files"]["snapshot"]["contentByteLength"] =
            serde_json::Value::Number((LOGICAL_SNAPSHOT_CAP_BYTES + 1).into())
    });
    assert_refused(&over_cap, "generation-v3-gzip-physical-bound-invalid");

    let mut no_savings = permanent_v3_fixture(true);
    no_savings.mutate_manifest(|v| v["files"]["snapshot"]["contentByteLength"] = 497.into());
    assert_refused(&no_savings, "generation-v3-gzip-physical-bound-invalid");

    let mut truncated = permanent_v3_fixture(true);
    truncated.snapshot.as_mut().unwrap().truncate(487);
    truncated.rebind_snapshot_physical_descriptor();
    assert_refused(&truncated, "generation-v3-gzip-decode-failed");

    // The decoder is stopped after cap + 1 output bytes. Its gzip trailer
    // claims a larger output, but trailer metadata is never allocation or
    // admission authority.
    let oversized_logical = vec![b'x'; LOGICAL_SNAPSHOT_CAP_BYTES as usize + 1];
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    use std::io::Write;
    encoder.write_all(&oversized_logical).unwrap();
    let compressed = encoder.finish().unwrap();
    assert!(compressed.len() < LOGICAL_SNAPSHOT_CAP_BYTES as usize);
    let physical_sha = sha_of(&compressed);
    let logical_sha = sha_of(&oversized_logical);
    let content_hash = derive_content_hash_v3(&logical_sha, &[]).unwrap();
    let bomb_manifest = serde_json::to_vec(&serde_json::json!({
        "schema":"h2o.savedChatPackage",
        "schemaVersion":3,
        "payloadVersion":3,
        "chatId":"bounded",
        "snapshotId":"s",
        "contentHash":content_hash,
        "files":{"snapshot":{
            "path":"snapshot.json",
            "sha256":physical_sha,
            "byteLength":compressed.len(),
            "encoding":"gzip",
            "contentSha256":logical_sha,
            "contentByteLength":LOGICAL_SNAPSHOT_CAP_BYTES
        }},
        "assets":[]
    }))
    .unwrap();
    assert_refused(
        &OwnedPackage {
            manifest: bomb_manifest,
            snapshot: Some(compressed),
            markdown: None,
            html: None,
            assets: Vec::new(),
            unexpected: Vec::new(),
            chat_id: "bounded".to_string(),
        },
        "generation-v3-gzip-decoded-bound-exceeded",
    );
}

#[test]
fn v3_rejects_false_identity_version_inventory_and_cross_binding() {
    let mut false_hash = permanent_v3_fixture(false);
    false_hash.mutate_manifest(|v| v["contentHash"] = format!("sha256-{}", "0".repeat(64)).into());
    assert_refused(&false_hash, "generation-content-hash-mismatch");

    let mut wrong_version = permanent_v3_fixture(false);
    wrong_version.mutate_manifest(|v| v["payloadVersion"] = 2.into());
    assert_refused(
        &wrong_version,
        "generation-manifest-version-triple-incoherent",
    );

    let mut missing = permanent_v3_fixture(false);
    missing.snapshot = None;
    assert_refused(&missing, "generation-snapshot-missing");

    let mut renderer = permanent_v3_fixture(false);
    renderer.markdown = Some(b"foreign persistent renderer".to_vec());
    assert_refused(&renderer, "generation-v3-persistent-renderer-forbidden");

    let mut descriptor = permanent_v3_fixture(false);
    descriptor.mutate_manifest(|v| {
        v["files"]["markdown"] = serde_json::json!({
            "path":"chat.md",
            "sha256":format!("sha256-{}", "0".repeat(64)),
            "byteLength":0,
            "encoding":"identity"
        })
    });
    assert_refused(&descriptor, "generation-v3-manifest-file-inventory-invalid");

    let mut cross = permanent_v3_fixture(false);
    cross.mutate_manifest(|v| v["chatId"] = "different-chat".into());
    assert_refused(&cross, "generation-chat-id-mismatch");
}

#[test]
fn v3_rejects_asset_member_and_name_ambiguity() {
    let mut mismatch = permanent_v3_fixture(false);
    mismatch.assets[0].sha256 = format!("sha256-{}", "0".repeat(64));
    assert_refused(&mismatch, "generation-asset-sha-mismatch");

    let mut duplicate = permanent_v3_fixture(false);
    duplicate.assets.push(duplicate.assets[0].clone());
    assert_refused(&duplicate, "generation-package-member-duplicate");

    let mut unsafe_name = permanent_v3_fixture(false);
    unsafe_name.unexpected.push("../snapshot.json".to_string());
    assert_refused(&unsafe_name, "generation-package-unexpected-member");
}

#[test]
fn v3_rejects_identity_logical_disagreement_and_non_typed_messages() {
    let mut logical_sha = permanent_v3_fixture(false);
    logical_sha.mutate_manifest(|v| {
        v["files"]["snapshot"]["contentSha256"] = format!("sha256-{}", "0".repeat(64)).into()
    });
    assert_refused(&logical_sha, "generation-v3-identity-logical-sha-mismatch");

    let mut logical_len = permanent_v3_fixture(false);
    logical_len.mutate_manifest(|v| v["files"]["snapshot"]["contentByteLength"] = 1.into());
    assert_refused(
        &logical_len,
        "generation-v3-identity-logical-length-mismatch",
    );

    let mut scalar_only = zero_asset_v3();
    let mut snapshot: serde_json::Value =
        serde_json::from_slice(scalar_only.snapshot.as_ref().unwrap()).unwrap();
    snapshot["messages"][0]
        .as_object_mut()
        .unwrap()
        .remove("content");
    snapshot["messages"][0]["contentText"] = "legacy-only".into();
    scalar_only.snapshot = Some(serde_json::to_vec(&snapshot).unwrap());
    scalar_only.rebind_snapshot_physical_descriptor();
    let physical_sha = sha_of(scalar_only.snapshot.as_ref().unwrap());
    let content_hash = derive_content_hash_v3(&physical_sha, &[]).unwrap();
    scalar_only.mutate_manifest(|v| v["contentHash"] = content_hash.into());
    assert_refused(&scalar_only, "generation-v3-snapshot-content-invalid");

    let mut wrong_schema = zero_asset_v3();
    rewrite_identity_snapshot(&mut wrong_schema, |snapshot| {
        snapshot["schema"] = "not.h2o.savedChatSnapshot".into();
    });
    assert_refused(&wrong_schema, "generation-v3-snapshot-schema-invalid");

    let mut legacy_duplicate = zero_asset_v3();
    rewrite_identity_snapshot(&mut legacy_duplicate, |snapshot| {
        snapshot["messages"][0]["contentText"] = "duplicate".into();
    });
    assert_refused(
        &legacy_duplicate,
        "generation-v3-snapshot-legacy-content-forbidden",
    );

    let mut invalid_refs = zero_asset_v3();
    rewrite_identity_snapshot(&mut invalid_refs, |snapshot| {
        snapshot["messages"][0]["assetRefs"] = serde_json::Value::Null;
    });
    assert_refused(&invalid_refs, "generation-v3-snapshot-asset-refs-invalid");
}

fn rewrite_identity_snapshot(
    package: &mut OwnedPackage,
    update: impl FnOnce(&mut serde_json::Value),
) {
    let mut snapshot: serde_json::Value =
        serde_json::from_slice(package.snapshot.as_ref().expect("snapshot"))
            .expect("snapshot json");
    update(&mut snapshot);
    package.snapshot = Some(serde_json::to_vec(&snapshot).expect("serialize snapshot"));
    package.rebind_snapshot_physical_descriptor();
    let logical_sha = sha_of(package.snapshot.as_ref().expect("snapshot"));
    let content_hash = derive_content_hash_v3(&logical_sha, &[]).expect("content hash");
    package.mutate_manifest(|manifest| manifest["contentHash"] = content_hash.into());
}
