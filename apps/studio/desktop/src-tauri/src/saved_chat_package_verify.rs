//! Saved-Chat package semantic verification shared by trusted native consumers.
//!
//! This module is intentionally package-specific. It owns the frozen v1/v2/v3
//! manifest rules, bounded v3 snapshot decoding, logical cross-binding and
//! contentHash recomputation. Filesystem adapters remain responsible for
//! obtaining bytes/facts through confined no-follow handles; renderer claims
//! are never `VerifiedAssetMember` facts.

// P2.1 deliberately lands the complete v3 result/adapters before P2.2 wires
// production COMMIT and scanning to them. Keep that dormant foundation private
// without turning its temporary non-use into crate-wide warning noise.
#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};
use std::io::Read;

use crate::archive_durable_write::sha256_hex;

pub(crate) const LOGICAL_SNAPSHOT_CAP_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum VerificationAdmission {
    /// Current production NEW-write gate. Live COMMIT must still refuse v3.
    V1V2Only,
    /// Exact future-write gate: a V3 build must not accept a new v1/v2 write.
    V3Only,
    /// Durable read gate. Rollback changes new writes, never read compatibility.
    AllSupported,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PackageFamily {
    V1,
    V2,
    V3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SnapshotEncoding {
    Identity,
    Gzip,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct FileDescriptor {
    pub(crate) path: String,
    pub(crate) sha256: String,
    pub(crate) byte_length: u64,
    pub(crate) encoding: Option<SnapshotEncoding>,
    pub(crate) content_sha256: Option<String>,
    pub(crate) content_byte_length: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct AssetDescriptor {
    pub(crate) path: String,
    pub(crate) sha256: String,
    pub(crate) ext: String,
    pub(crate) mime_type: String,
    pub(crate) byte_length: u64,
}

#[derive(Clone, Debug)]
pub(crate) struct ValidatedManifest {
    pub(crate) schema_version: u64,
    pub(crate) payload_version: Option<u64>,
    pub(crate) chat_id: String,
    pub(crate) snapshot_id: String,
    pub(crate) content_hash: String,
    pub(crate) payload_v2: bool,
    pub(crate) family: PackageFamily,
    pub(crate) assets: Vec<AssetDescriptor>,
    /// Compatibility view consumed by the existing v1/v2 publisher/handoff.
    /// key -> (physical sha256, physical byteLength)
    pub(crate) files: BTreeMap<String, (String, u64)>,
    /// Normalized descriptors for version-aware trusted consumers.
    pub(crate) file_descriptors: BTreeMap<String, FileDescriptor>,
}

/// Facts established by a trusted adapter from the actual asset member.
/// A future filesystem adapter must populate these by no-follow open + hash;
/// they are never deserialized from renderer IPC.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct VerifiedAssetMember {
    pub(crate) path: String,
    pub(crate) sha256: String,
    pub(crate) byte_length: u64,
}

#[derive(Debug)]
pub(crate) struct PackageMembers<'a> {
    pub(crate) manifest: &'a [u8],
    pub(crate) snapshot: Option<&'a [u8]>,
    pub(crate) markdown: Option<&'a [u8]>,
    pub(crate) html: Option<&'a [u8]>,
    pub(crate) assets: &'a [VerifiedAssetMember],
    /// Exact extra persistent members found by the trusted inventory adapter.
    pub(crate) unexpected_members: &'a [String],
}

#[derive(Clone, Debug)]
pub(crate) struct VerifiedPackageSemantics {
    pub(crate) manifest: ValidatedManifest,
    pub(crate) family: PackageFamily,
    pub(crate) content_hash: String,
    pub(crate) snapshot_encoding: SnapshotEncoding,
    pub(crate) snapshot_physical_sha256: String,
    pub(crate) snapshot_physical_byte_length: u64,
    pub(crate) logical_snapshot_sha256: String,
    pub(crate) logical_snapshot_byte_length: u64,
    pub(crate) logical_snapshot_bytes: Vec<u8>,
    pub(crate) asset_shas: Vec<String>,
    pub(crate) saved_at: Option<String>,
}

fn json_str(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn validated_sha_string(value: &str) -> Option<&str> {
    let hex = value.strip_prefix("sha256-")?;
    if hex.len() == 64
        && hex
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        Some(value)
    } else {
        None
    }
}

fn parse_file_descriptor(
    key: &str,
    value: &serde_json::Value,
    family: PackageFamily,
) -> Result<FileDescriptor, &'static str> {
    let path = json_str(value, "path");
    let sha256 = json_str(value, "sha256");
    if validated_sha_string(&sha256).is_none() {
        return Err("generation-manifest-file-sha-invalid");
    }
    let byte_length = value
        .get("byteLength")
        .and_then(|v| v.as_u64())
        .ok_or("generation-manifest-file-byte-length-invalid")?;

    let encoding_text = value.get("encoding").and_then(|v| v.as_str());
    let encoding = match encoding_text {
        None if family != PackageFamily::V3 => None,
        Some("identity") => Some(SnapshotEncoding::Identity),
        Some("gzip") => Some(SnapshotEncoding::Gzip),
        _ if family == PackageFamily::V3 => return Err("generation-v3-snapshot-encoding-invalid"),
        _ => None,
    };
    let content_sha256 = value
        .get("contentSha256")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let content_byte_length = value.get("contentByteLength").and_then(|v| v.as_u64());

    if family == PackageFamily::V3 {
        if key != "snapshot" || path != "snapshot.json" {
            return Err("generation-v3-snapshot-path-invalid");
        }
        if let Some(sha) = content_sha256.as_deref() {
            if validated_sha_string(sha).is_none() {
                return Err("generation-v3-snapshot-logical-sha-invalid");
            }
        }
    }

    Ok(FileDescriptor {
        path,
        sha256,
        byte_length,
        encoding,
        content_sha256,
        content_byte_length,
    })
}

/// Parse and normalize the governed manifest. Admission is explicit so the
/// current production callers can remain v1/v2-only while tests prove the v3
/// foundation before P2.2 wires it live.
pub(crate) fn validate_manifest(
    bytes: &[u8],
    admission: VerificationAdmission,
) -> Result<ValidatedManifest, &'static str> {
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "generation-manifest-json-invalid")?;
    if !value.is_object() {
        return Err("generation-manifest-json-invalid");
    }
    if json_str(&value, "schema") != "h2o.savedChatPackage" {
        return Err("generation-manifest-schema-invalid");
    }

    let schema_version = value.get("schemaVersion").and_then(|v| v.as_u64());
    let payload_version = value.get("payloadVersion").and_then(|v| v.as_u64());
    let has_payload_key = value.get("payloadVersion").is_some();
    let assets_value = value.get("assets");
    let assets_array = match assets_value {
        None => Vec::new(),
        Some(serde_json::Value::Array(items)) => items.clone(),
        Some(_) => return Err("generation-manifest-assets-invalid"),
    };

    let family = match (schema_version, has_payload_key, payload_version) {
        (Some(1), false, _)
            if assets_array.is_empty()
                && matches!(
                    admission,
                    VerificationAdmission::V1V2Only | VerificationAdmission::AllSupported
                ) =>
        {
            PackageFamily::V1
        }
        (Some(2), true, Some(2))
            if !assets_array.is_empty()
                && matches!(
                    admission,
                    VerificationAdmission::V1V2Only | VerificationAdmission::AllSupported
                ) =>
        {
            PackageFamily::V2
        }
        (Some(3), true, Some(3))
            if matches!(
                admission,
                VerificationAdmission::V3Only | VerificationAdmission::AllSupported
            ) =>
        {
            PackageFamily::V3
        }
        _ => return Err("generation-manifest-version-triple-incoherent"),
    };

    let chat_id = json_str(&value, "chatId");
    if chat_id.is_empty() {
        return Err("generation-manifest-chat-id-missing");
    }
    let snapshot_id = json_str(&value, "snapshotId");
    if snapshot_id.is_empty() || snapshot_id.trim() != snapshot_id {
        return Err("generation-manifest-snapshot-id-missing");
    }
    let content_hash = json_str(&value, "contentHash");
    if validated_sha_string(&content_hash).is_none() {
        return Err("generation-manifest-content-hash-invalid");
    }

    let files_value = value
        .get("files")
        .and_then(|v| v.as_object())
        .ok_or("generation-manifest-files-invalid")?;
    if family == PackageFamily::V3
        && (files_value.len() != 1 || !files_value.contains_key("snapshot"))
    {
        return Err("generation-v3-manifest-file-inventory-invalid");
    }
    let mut files = BTreeMap::new();
    let mut file_descriptors = BTreeMap::new();
    for (key, value) in files_value {
        let descriptor = parse_file_descriptor(key, value, family)?;
        files.insert(
            key.clone(),
            (descriptor.sha256.clone(), descriptor.byte_length),
        );
        file_descriptors.insert(key.clone(), descriptor);
    }

    let mut assets = Vec::new();
    for item in &assets_array {
        let sha = json_str(item, "sha256");
        let sha = validated_sha_string(&sha).ok_or("generation-manifest-asset-sha-invalid")?;
        let path = json_str(item, "path");
        let ext = json_str(item, "ext");
        if ext.is_empty() {
            return Err("generation-manifest-asset-ext-missing");
        }
        let mime_type = json_str(item, "mimeType");
        if mime_type.trim().is_empty() {
            return Err("generation-manifest-asset-mime-missing");
        }
        let byte_length = item
            .get("byteLength")
            .and_then(|v| v.as_u64())
            .ok_or("generation-manifest-asset-byte-length-invalid")?;
        if !ext
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        {
            return Err("generation-manifest-asset-ext-invalid");
        }
        let expected_path = format!("assets/{sha}.{ext}");
        if path != expected_path {
            return Err("generation-manifest-asset-path-invalid");
        }
        assets.push(AssetDescriptor {
            path,
            sha256: sha.to_string(),
            ext,
            mime_type,
            byte_length,
        });
    }

    let mut seen_sha = BTreeSet::new();
    let mut seen_path = BTreeSet::new();
    for asset in &assets {
        if !seen_sha.insert(asset.sha256.clone()) {
            return Err("generation-manifest-asset-duplicate-sha");
        }
        if !seen_path.insert(asset.path.clone()) {
            return Err("generation-manifest-asset-duplicate-path");
        }
    }

    Ok(ValidatedManifest {
        schema_version: schema_version.expect("version triple checked"),
        payload_version,
        chat_id,
        snapshot_id,
        content_hash,
        payload_v2: family == PackageFamily::V2,
        family,
        assets,
        files,
        file_descriptors,
    })
}

pub(crate) fn v2_content_pre_image(snapshot_sha: &str, sorted_asset_shas: &[String]) -> String {
    let mut out = String::from("{\"assets\":[");
    push_hash_array(&mut out, sorted_asset_shas);
    out.push_str("],\"snapshot\":\"");
    out.push_str(snapshot_sha);
    out.push_str("\"}");
    out
}

fn v3_content_pre_image(logical_snapshot_sha: &str, sorted_asset_shas: &[String]) -> String {
    // Exact JS canonicalJson order: assets, payloadVersion, snapshot.
    let mut out = String::from("{\"assets\":[");
    push_hash_array(&mut out, sorted_asset_shas);
    out.push_str("],\"payloadVersion\":3,\"snapshot\":\"");
    out.push_str(logical_snapshot_sha);
    out.push_str("\"}");
    out
}

fn push_hash_array(out: &mut String, shas: &[String]) {
    for (index, sha) in shas.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push('"');
        out.push_str(sha);
        out.push('"');
    }
}

pub(crate) fn derive_content_hash_v1_v2(
    payload_v2: bool,
    snapshot_bytes: &[u8],
    sorted_asset_shas: &[String],
) -> String {
    let snapshot_sha = format!("sha256-{}", sha256_hex(snapshot_bytes));
    if !payload_v2 {
        return snapshot_sha;
    }
    format!(
        "sha256-{}",
        sha256_hex(v2_content_pre_image(&snapshot_sha, sorted_asset_shas).as_bytes())
    )
}

pub(crate) fn derive_content_hash_v3(
    logical_snapshot_sha: &str,
    sorted_asset_shas: &[String],
) -> Result<String, &'static str> {
    if validated_sha_string(logical_snapshot_sha).is_none()
        || sorted_asset_shas
            .iter()
            .any(|sha| validated_sha_string(sha).is_none())
    {
        return Err("generation-v3-content-hash-input-invalid");
    }
    Ok(format!(
        "sha256-{}",
        sha256_hex(v3_content_pre_image(logical_snapshot_sha, sorted_asset_shas).as_bytes())
    ))
}

pub(crate) fn validate_snapshot_cross_binding(
    logical_snapshot_bytes: &[u8],
    manifest: &ValidatedManifest,
    begin_chat_id: &str,
) -> Result<serde_json::Value, &'static str> {
    let value: serde_json::Value = serde_json::from_slice(logical_snapshot_bytes)
        .map_err(|_| "generation-snapshot-json-invalid")?;
    let chat_id = json_str(&value, "chatId");
    if chat_id != manifest.chat_id || chat_id != begin_chat_id {
        return Err("generation-chat-id-mismatch");
    }
    let snapshot_id = json_str(&value, "snapshotId");
    if snapshot_id != manifest.snapshot_id || snapshot_id.trim() != snapshot_id {
        return Err("generation-snapshot-id-mismatch");
    }
    if manifest.family == PackageFamily::V3 {
        if json_str(&value, "schema") != "h2o.savedChatSnapshot" {
            return Err("generation-v3-snapshot-schema-invalid");
        }
        if value.get("schemaVersion").and_then(|v| v.as_u64()) != Some(3) {
            return Err("generation-v3-snapshot-version-invalid");
        }
        let messages = value
            .get("messages")
            .and_then(|v| v.as_array())
            .ok_or("generation-v3-snapshot-messages-invalid")?;
        for message in messages {
            if !matches!(message.get("content"), Some(v) if v.is_array()) {
                return Err("generation-v3-snapshot-content-invalid");
            }
            if message.get("contentText").is_some() || message.get("contentHtml").is_some() {
                return Err("generation-v3-snapshot-legacy-content-forbidden");
            }
            if !matches!(message.get("assetRefs"), Some(v) if v.is_array()) {
                return Err("generation-v3-snapshot-asset-refs-invalid");
            }
        }
    }

    let declared: BTreeSet<&str> = manifest.assets.iter().map(|a| a.sha256.as_str()).collect();
    if let Some(messages) = value.get("messages").and_then(|v| v.as_array()) {
        for message in messages {
            let Some(refs) = message.get("assetRefs").and_then(|v| v.as_array()) else {
                continue;
            };
            for entry in refs {
                let sha = entry.as_str().unwrap_or_default();
                if validated_sha_string(sha).is_none() {
                    return Err("generation-snapshot-asset-ref-invalid");
                }
                if !declared.contains(sha) {
                    return Err("generation-snapshot-asset-ref-missing-manifest");
                }
            }
        }
    }
    Ok(value)
}

fn decode_v3_snapshot(
    snapshot_bytes: &[u8],
    descriptor: &FileDescriptor,
) -> Result<(SnapshotEncoding, Vec<u8>, String, u64), &'static str> {
    let actual_len = snapshot_bytes.len() as u64;
    let actual_sha = format!("sha256-{}", sha256_hex(snapshot_bytes));
    if descriptor.byte_length != actual_len {
        return Err("generation-member-byte-length-mismatch");
    }
    if descriptor.sha256 != actual_sha {
        return Err("generation-member-sha-mismatch");
    }
    let encoding = descriptor
        .encoding
        .ok_or("generation-v3-snapshot-encoding-invalid")?;
    match encoding {
        SnapshotEncoding::Identity => {
            if actual_len == 0 || actual_len > LOGICAL_SNAPSHOT_CAP_BYTES {
                return Err("generation-v3-snapshot-logical-bound-invalid");
            }
            if let Some(content_sha) = descriptor.content_sha256.as_deref() {
                if content_sha != actual_sha {
                    return Err("generation-v3-identity-logical-sha-mismatch");
                }
            }
            if let Some(content_len) = descriptor.content_byte_length {
                if content_len != actual_len {
                    return Err("generation-v3-identity-logical-length-mismatch");
                }
            }
            Ok((encoding, snapshot_bytes.to_vec(), actual_sha, actual_len))
        }
        SnapshotEncoding::Gzip => {
            let logical_len = descriptor
                .content_byte_length
                .ok_or("generation-v3-gzip-logical-length-missing")?;
            let logical_sha = descriptor
                .content_sha256
                .as_deref()
                .and_then(validated_sha_string)
                .ok_or("generation-v3-gzip-logical-sha-missing")?
                .to_string();
            if actual_len == 0
                || actual_len >= logical_len
                || logical_len == 0
                || logical_len > LOGICAL_SNAPSHOT_CAP_BYTES
            {
                return Err("generation-v3-gzip-physical-bound-invalid");
            }

            let decoder = flate2::read::GzDecoder::new(snapshot_bytes);
            let mut bounded = decoder.take(logical_len.saturating_add(1));
            let mut logical =
                Vec::with_capacity(logical_len.min(LOGICAL_SNAPSHOT_CAP_BYTES) as usize);
            bounded
                .read_to_end(&mut logical)
                .map_err(|_| "generation-v3-gzip-decode-failed")?;
            if logical.len() as u64 > logical_len {
                return Err("generation-v3-gzip-decoded-bound-exceeded");
            }
            if logical.len() as u64 != logical_len {
                return Err("generation-v3-gzip-decoded-length-mismatch");
            }
            if format!("sha256-{}", sha256_hex(&logical)) != logical_sha {
                return Err("generation-v3-gzip-decoded-sha-mismatch");
            }
            Ok((encoding, logical, logical_sha, logical_len))
        }
    }
}

fn verify_descriptor_bytes(
    bytes: &[u8],
    descriptor: Option<&FileDescriptor>,
) -> Result<(), &'static str> {
    let descriptor = descriptor.ok_or("generation-manifest-file-descriptor-missing")?;
    if descriptor.byte_length != bytes.len() as u64 {
        return Err("generation-member-byte-length-mismatch");
    }
    if descriptor.sha256 != format!("sha256-{}", sha256_hex(bytes)) {
        return Err("generation-member-sha-mismatch");
    }
    Ok(())
}

fn verify_assets(
    manifest: &ValidatedManifest,
    actual: &[VerifiedAssetMember],
) -> Result<Vec<String>, &'static str> {
    let mut actual_by_path = BTreeMap::new();
    for member in actual {
        if actual_by_path
            .insert(member.path.as_str(), member)
            .is_some()
        {
            return Err("generation-package-member-duplicate");
        }
    }
    if actual_by_path.len() != manifest.assets.len() {
        return Err("generation-package-asset-inventory-mismatch");
    }
    for descriptor in &manifest.assets {
        let member = actual_by_path
            .get(descriptor.path.as_str())
            .ok_or("generation-package-asset-missing")?;
        if member.sha256 != descriptor.sha256 {
            return Err("generation-asset-sha-mismatch");
        }
        if member.byte_length != descriptor.byte_length {
            return Err("generation-asset-byte-length-mismatch");
        }
    }
    let mut shas: Vec<String> = manifest.assets.iter().map(|a| a.sha256.clone()).collect();
    shas.sort();
    Ok(shas)
}

/// Verify normalized package semantics from bytes and trusted physical facts.
/// No path here is opened and no mutation occurs; confined filesystem adapters
/// supply the facts and exact inventory.
pub(crate) fn verify_package(
    members: PackageMembers<'_>,
    begin_chat_id: &str,
    admission: VerificationAdmission,
) -> Result<VerifiedPackageSemantics, &'static str> {
    if !members.unexpected_members.is_empty() {
        return Err("generation-package-unexpected-member");
    }
    let manifest = validate_manifest(members.manifest, admission)?;
    let snapshot_bytes = members.snapshot.ok_or("generation-snapshot-missing")?;
    let is_v3 = manifest.family == PackageFamily::V3;
    if is_v3 {
        if members.markdown.is_some() || members.html.is_some() {
            return Err("generation-v3-persistent-renderer-forbidden");
        }
    } else if members.markdown.is_none() || members.html.is_none() {
        return Err("generation-package-required-renderer-missing");
    }

    let snapshot_descriptor = manifest.file_descriptors.get("snapshot");
    let (encoding, logical_snapshot_bytes, logical_snapshot_sha256, logical_snapshot_byte_length) =
        if is_v3 {
            decode_v3_snapshot(
                snapshot_bytes,
                snapshot_descriptor.ok_or("generation-manifest-file-descriptor-missing")?,
            )?
        } else {
            verify_descriptor_bytes(snapshot_bytes, snapshot_descriptor)?;
            let sha = format!("sha256-{}", sha256_hex(snapshot_bytes));
            (
                SnapshotEncoding::Identity,
                snapshot_bytes.to_vec(),
                sha,
                snapshot_bytes.len() as u64,
            )
        };

    if !is_v3 {
        verify_descriptor_bytes(
            members.markdown.expect("checked above"),
            manifest.file_descriptors.get("markdown"),
        )?;
        verify_descriptor_bytes(
            members.html.expect("checked above"),
            manifest.file_descriptors.get("html"),
        )?;
    }

    let snapshot =
        validate_snapshot_cross_binding(&logical_snapshot_bytes, &manifest, begin_chat_id)?;
    let asset_shas = verify_assets(&manifest, members.assets)?;
    let content_hash = if is_v3 {
        derive_content_hash_v3(&logical_snapshot_sha256, &asset_shas)?
    } else {
        derive_content_hash_v1_v2(manifest.payload_v2, snapshot_bytes, &asset_shas)
    };
    if content_hash != manifest.content_hash {
        return Err("generation-content-hash-mismatch");
    }
    let saved_at = snapshot
        .get("savedAt")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    Ok(VerifiedPackageSemantics {
        family: manifest.family,
        content_hash,
        snapshot_encoding: encoding,
        snapshot_physical_sha256: format!("sha256-{}", sha256_hex(snapshot_bytes)),
        snapshot_physical_byte_length: snapshot_bytes.len() as u64,
        logical_snapshot_sha256,
        logical_snapshot_byte_length,
        logical_snapshot_bytes,
        asset_shas,
        saved_at,
        manifest,
    })
}

#[cfg(test)]
pub(crate) mod tests;
