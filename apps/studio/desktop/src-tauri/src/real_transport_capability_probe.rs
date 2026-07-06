use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;

pub const SCHEMA: &str = "h2o.studio.transport.real-capability-probe-result.v1";
pub const REQUEST_SCHEMA: &str = "h2o.studio.transport.real-capability-probe-request.v1";
pub const READONLY_PROBE_GATE: &str =
    "real-webdav-cloud-relay-transport-readonly-capability-probe-evaluate";
const DESCRIPTOR_REGISTRY_FILE_ENV: &str = "H2O_RT_DESCRIPTOR_REGISTRY_FILE";

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RtCapabilityProbeRequest {
    #[serde(default)]
    pub schema: Option<String>,
    #[serde(default)]
    pub gate: Option<String>,
    #[serde(default)]
    pub diagnostic_only: Option<bool>,
    #[serde(default)]
    pub read_only: Option<bool>,
    #[serde(default)]
    pub dry_run: Option<bool>,
    #[serde(default)]
    pub endpoint_ref_hash: Option<String>,
    #[serde(default)]
    pub remote_root_ref_hash: Option<String>,
    #[serde(default)]
    pub credential_ref_hash: Option<String>,
    #[serde(default)]
    pub capability_probe_receipt_hash: Option<String>,
    #[serde(default)]
    pub resolver_check: Option<bool>,
    #[serde(default)]
    pub descriptor_registry_ref_hash: Option<String>,
    #[serde(default)]
    pub requested_operations: Option<Vec<String>>,
    #[serde(default)]
    pub product_sync_ready: Option<bool>,
    #[serde(default)]
    pub transport_ready: Option<bool>,
    #[serde(default)]
    pub real_webdav_transport_available: Option<bool>,
    #[serde(default)]
    pub writes_webdav: Option<bool>,
    #[serde(default)]
    pub writes_cloud: Option<bool>,
    #[serde(default)]
    pub writes_relay: Option<bool>,
    #[serde(default)]
    pub writes_cas: Option<bool>,
    #[serde(default)]
    pub writes_files: Option<bool>,
    #[serde(default)]
    pub enqueues_relay: Option<bool>,
    #[serde(default)]
    pub full_bundle_v3_started: Option<bool>,
    #[serde(default)]
    pub mints_export_id: Option<bool>,
    #[serde(default)]
    pub burns_sequence: Option<bool>,
    #[serde(default)]
    pub forbidden_evidence_tokens: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, JsonValue>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtCapabilityProbeResult {
    pub schema: &'static str,
    pub request_schema: &'static str,
    pub ok: bool,
    pub status: &'static str,
    pub reason: &'static str,
    pub command: &'static str,
    pub gate_satisfied: bool,
    pub diagnostic_only: bool,
    pub read_only: bool,
    pub dry_run: bool,
    pub network_attempted: bool,
    pub endpoint_ref_hash: Option<String>,
    pub remote_root_ref_hash: Option<String>,
    pub credential_ref_hash: Option<String>,
    pub capability_probe_receipt_hash: Option<String>,
    pub resolver_available: bool,
    pub endpoint_descriptor_resolved: bool,
    pub remote_root_descriptor_resolved: bool,
    pub credential_descriptor_resolved: bool,
    pub descriptor_registry_ref_hash: Option<String>,
    pub receipt_core_placeholder: Option<&'static str>,
    pub root_exists: Option<bool>,
    pub root_empty: Option<bool>,
    pub create_only_behavior: &'static str,
    pub etag_behavior: &'static str,
    pub if_none_match_behavior: &'static str,
    pub real_webdav_transport_available: bool,
    pub product_sync_ready: bool,
    pub transport_ready: bool,
    pub writes_webdav: bool,
    pub writes_cloud: bool,
    pub writes_relay: bool,
    pub writes_cas: bool,
    pub writes_files: bool,
    pub enqueues_relay: bool,
    pub full_bundle_v3_started: bool,
    pub mints_export_id: bool,
    pub burns_sequence: bool,
    pub raw_private_fields_logged: bool,
    pub raw_input_rejected: bool,
    pub blockers: Vec<&'static str>,
    pub warnings: Vec<&'static str>,
}

impl RtCapabilityProbeResult {
    fn blocked(
        reason: &'static str,
        blockers: Vec<&'static str>,
        raw_input_rejected: bool,
    ) -> Self {
        Self {
            schema: SCHEMA,
            request_schema: REQUEST_SCHEMA,
            ok: false,
            status: "real-transport-readonly-capability-probe-blocked",
            reason,
            command: "h2o_rt_capability_probe",
            gate_satisfied: false,
            diagnostic_only: true,
            read_only: true,
            dry_run: true,
            network_attempted: false,
            endpoint_ref_hash: None,
            remote_root_ref_hash: None,
            credential_ref_hash: None,
            capability_probe_receipt_hash: None,
            resolver_available: false,
            endpoint_descriptor_resolved: false,
            remote_root_descriptor_resolved: false,
            credential_descriptor_resolved: false,
            descriptor_registry_ref_hash: None,
            receipt_core_placeholder: None,
            root_exists: None,
            root_empty: None,
            create_only_behavior: "unknown",
            etag_behavior: "unknown",
            if_none_match_behavior: "unknown",
            real_webdav_transport_available: false,
            product_sync_ready: false,
            transport_ready: false,
            writes_webdav: false,
            writes_cloud: false,
            writes_relay: false,
            writes_cas: false,
            writes_files: false,
            enqueues_relay: false,
            full_bundle_v3_started: false,
            mints_export_id: false,
            burns_sequence: false,
            raw_private_fields_logged: false,
            raw_input_rejected,
            blockers,
            warnings: vec![],
        }
    }

    fn ready(request: &RtCapabilityProbeRequest, resolver_ready: bool) -> Self {
        Self {
            schema: SCHEMA,
            request_schema: REQUEST_SCHEMA,
            ok: true,
            status: "real-transport-readonly-capability-probe-ready",
            reason: "read-only-capability-probe-substrate-ready",
            command: "h2o_rt_capability_probe",
            gate_satisfied: true,
            diagnostic_only: true,
            read_only: true,
            dry_run: true,
            network_attempted: false,
            endpoint_ref_hash: request.endpoint_ref_hash.clone(),
            remote_root_ref_hash: request.remote_root_ref_hash.clone(),
            credential_ref_hash: request.credential_ref_hash.clone(),
            capability_probe_receipt_hash: request.capability_probe_receipt_hash.clone(),
            resolver_available: resolver_ready,
            endpoint_descriptor_resolved: resolver_ready,
            remote_root_descriptor_resolved: resolver_ready,
            credential_descriptor_resolved: resolver_ready,
            descriptor_registry_ref_hash: request.descriptor_registry_ref_hash.clone(),
            receipt_core_placeholder: Some("not-generated-in-w3-1-implementation-slice"),
            root_exists: None,
            root_empty: None,
            create_only_behavior: "unknown",
            etag_behavior: "unknown",
            if_none_match_behavior: "unknown",
            real_webdav_transport_available: false,
            product_sync_ready: false,
            transport_ready: false,
            writes_webdav: false,
            writes_cloud: false,
            writes_relay: false,
            writes_cas: false,
            writes_files: false,
            enqueues_relay: false,
            full_bundle_v3_started: false,
            mints_export_id: false,
            burns_sequence: false,
            raw_private_fields_logged: false,
            raw_input_rejected: false,
            blockers: vec![],
            warnings: vec!["real-remote-probe-not-performed-in-this-slice"],
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DescriptorRegistry {
    schema: String,
    endpoint_ref_hash: String,
    remote_root_ref_hash: String,
    credential_ref_hash: String,
    #[serde(default)]
    descriptor_mode: Option<String>,
    #[serde(flatten)]
    extra: BTreeMap<String, JsonValue>,
}

#[derive(Debug, Eq, PartialEq)]
enum ResolverFailure {
    MissingConfig,
    ConfigInvalid,
    RegistryHashMismatch,
    DescriptorHashMismatch,
    RawConfigRejected,
}

impl ResolverFailure {
    fn blocker(&self) -> &'static str {
        match self {
            Self::MissingConfig => "real-transport-w3-resolver-config-missing",
            Self::ConfigInvalid => "real-transport-w3-resolver-config-invalid",
            Self::RegistryHashMismatch => "real-transport-w3-resolver-registry-hash-mismatch",
            Self::DescriptorHashMismatch => "real-transport-w3-descriptor-hash-mismatch",
            Self::RawConfigRejected => "real-transport-w3-resolver-raw-config-rejected",
        }
    }
}

fn is_hash_ref(value: &Option<String>) -> bool {
    let Some(value) = value.as_deref() else {
        return false;
    };
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64
        && hex
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn sha256_ref(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("sha256:{:x}", digest)
}

fn registry_contains_raw_or_private(registry: &DescriptorRegistry) -> bool {
    registry.extra.iter().any(|(key, value)| {
        key_looks_raw_or_private(key) || value_looks_raw_or_private(&value.to_string())
    })
}

fn resolve_descriptors(request: &RtCapabilityProbeRequest) -> Result<bool, ResolverFailure> {
    if request.resolver_check != Some(true) {
        return Ok(false);
    }

    let Some(registry_file) = std::env::var_os(DESCRIPTOR_REGISTRY_FILE_ENV) else {
        return Err(ResolverFailure::MissingConfig);
    };
    let bytes = fs::read(registry_file).map_err(|_| ResolverFailure::MissingConfig)?;
    if let Some(expected_hash) = &request.descriptor_registry_ref_hash {
        if !is_hash_ref(&Some(expected_hash.clone())) {
            return Err(ResolverFailure::RegistryHashMismatch);
        }
        if sha256_ref(&bytes) != *expected_hash {
            return Err(ResolverFailure::RegistryHashMismatch);
        }
    }
    let registry: DescriptorRegistry =
        serde_json::from_slice(&bytes).map_err(|_| ResolverFailure::ConfigInvalid)?;
    if registry.schema != "h2o.studio.transport.real-descriptor-registry.v1" {
        return Err(ResolverFailure::ConfigInvalid);
    }
    if registry.descriptor_mode.as_deref() != Some("hash-only-redacted") {
        return Err(ResolverFailure::ConfigInvalid);
    }
    if registry_contains_raw_or_private(&registry) {
        return Err(ResolverFailure::RawConfigRejected);
    }
    if Some(registry.endpoint_ref_hash) != request.endpoint_ref_hash
        || Some(registry.remote_root_ref_hash) != request.remote_root_ref_hash
        || Some(registry.credential_ref_hash) != request.credential_ref_hash
    {
        return Err(ResolverFailure::DescriptorHashMismatch);
    }

    Ok(true)
}

fn is_allowed_operation(value: &str) -> bool {
    matches!(
        value,
        "options"
            | "propfind-depth-0"
            | "propfind-depth-1"
            | "head-root"
            | "get-root"
            | "head-deterministic-nonexistent-child"
    )
}

fn key_looks_raw_or_private(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    normalized.contains("url")
        || normalized.contains("endpoint")
        || normalized.contains("credential")
        || normalized.contains("password")
        || normalized.contains("secret")
        || normalized.contains("path")
        || normalized.contains("listing")
        || normalized.contains("payload")
        || normalized.contains("caskey")
        || normalized.contains("cas_key")
}

fn value_looks_raw_or_private(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("://")
        || normalized.contains("password")
        || normalized.contains("secret")
        || normalized.contains("credentialvalue")
        || normalized.contains("payloadbody")
        || normalized.contains("caskey")
        || normalized.contains("rawlisting")
}

fn has_forbidden_extra(request: &RtCapabilityProbeRequest) -> bool {
    request.extra.iter().any(|(key, value)| {
        key_looks_raw_or_private(key) || value_looks_raw_or_private(&value.to_string())
    }) || request
        .forbidden_evidence_tokens
        .as_ref()
        .map(|tokens| tokens.iter().any(|token| value_looks_raw_or_private(token)))
        .unwrap_or(false)
}

pub fn evaluate_capability_probe(request: RtCapabilityProbeRequest) -> RtCapabilityProbeResult {
    let mut blockers = Vec::new();

    if request.schema.as_deref() != Some(REQUEST_SCHEMA) {
        blockers.push("real-transport-w3-readonly-request-schema-required");
    }
    if request.gate.as_deref() != Some(READONLY_PROBE_GATE) {
        blockers.push("real-transport-w3-readonly-gate-required");
    }
    if request.diagnostic_only != Some(true)
        || request.read_only != Some(true)
        || request.dry_run != Some(true)
    {
        blockers.push("real-transport-w3-readonly-mode-required");
    }
    if !is_hash_ref(&request.endpoint_ref_hash)
        || !is_hash_ref(&request.remote_root_ref_hash)
        || !is_hash_ref(&request.credential_ref_hash)
    {
        blockers.push("real-transport-w3-readonly-target-refs-required");
    }
    if let Some(receipt_hash) = &request.capability_probe_receipt_hash {
        if !is_hash_ref(&Some(receipt_hash.clone())) {
            blockers.push("real-transport-w3-readonly-receipt-hash-invalid");
        }
    }
    if let Some(registry_hash) = &request.descriptor_registry_ref_hash {
        if !is_hash_ref(&Some(registry_hash.clone())) {
            blockers.push("real-transport-w3-resolver-registry-hash-mismatch");
        }
    }
    let operations = request.requested_operations.as_deref().unwrap_or(&[]);
    if operations.is_empty() || operations.iter().any(|op| !is_allowed_operation(op)) {
        blockers.push("real-transport-w3-readonly-operation-invalid");
    }
    if request.product_sync_ready == Some(true)
        || request.transport_ready == Some(true)
        || request.real_webdav_transport_available == Some(true)
    {
        blockers.push("real-transport-w3-readiness-claim-rejected");
    }
    if request.writes_webdav == Some(true)
        || request.writes_cloud == Some(true)
        || request.writes_relay == Some(true)
        || request.writes_cas == Some(true)
        || request.writes_files == Some(true)
        || request.enqueues_relay == Some(true)
        || request.full_bundle_v3_started == Some(true)
        || request.mints_export_id == Some(true)
        || request.burns_sequence == Some(true)
    {
        blockers.push("real-transport-w3-write-claim-rejected");
    }
    let raw_input_rejected = has_forbidden_extra(&request);
    if raw_input_rejected {
        blockers.push("real-transport-w3-raw-input-rejected");
    } else if !request.extra.is_empty() {
        blockers.push("real-transport-w3-unknown-field-rejected");
    }
    let resolver = if blockers.is_empty() {
        match resolve_descriptors(&request) {
            Ok(resolver_ready) => resolver_ready,
            Err(err) => {
                blockers.push(err.blocker());
                false
            }
        }
    } else {
        false
    };

    if !blockers.is_empty() {
        return RtCapabilityProbeResult::blocked(
            "read-only-capability-probe-blocked",
            blockers,
            raw_input_rejected,
        );
    }

    RtCapabilityProbeResult::ready(&request, resolver)
}

#[tauri::command]
pub fn h2o_rt_capability_probe(
    request: RtCapabilityProbeRequest,
) -> Result<RtCapabilityProbeResult, String> {
    Ok(evaluate_capability_probe(request))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Mutex;

    fn h(d: char) -> String {
        format!("sha256:{}", d.to_string().repeat(64))
    }

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static ENV_MUTEX: Mutex<()> = Mutex::new(());
        ENV_MUTEX.lock().expect("resolver env lock")
    }

    fn valid_request() -> RtCapabilityProbeRequest {
        RtCapabilityProbeRequest {
            schema: Some(REQUEST_SCHEMA.to_string()),
            gate: Some(READONLY_PROBE_GATE.to_string()),
            diagnostic_only: Some(true),
            read_only: Some(true),
            dry_run: Some(true),
            endpoint_ref_hash: Some(h('a')),
            remote_root_ref_hash: Some(h('b')),
            credential_ref_hash: Some(h('c')),
            capability_probe_receipt_hash: Some(h('d')),
            requested_operations: Some(vec![
                "options".to_string(),
                "propfind-depth-0".to_string(),
                "head-root".to_string(),
            ]),
            ..Default::default()
        }
    }

    fn registry_file(
        name: &str,
        endpoint: &str,
        remote_root: &str,
        credential: &str,
    ) -> (PathBuf, String) {
        let path = std::env::temp_dir().join(format!(
            "h2o-rt-resolver-{name}-{}.json",
            std::process::id()
        ));
        let bytes = serde_json::to_vec(&json!({
            "schema": "h2o.studio.transport.real-descriptor-registry.v1",
            "descriptorMode": "hash-only-redacted",
            "endpointRefHash": endpoint,
            "remoteRootRefHash": remote_root,
            "credentialRefHash": credential
        }))
        .expect("serialize test registry");
        fs::write(&path, &bytes).expect("write test registry");
        let registry_hash = sha256_ref(&bytes);
        (path, registry_hash)
    }

    #[test]
    fn valid_probe_is_redacted_and_zero_write() {
        let result = evaluate_capability_probe(valid_request());
        assert!(result.ok);
        assert_eq!(
            result.status,
            "real-transport-readonly-capability-probe-ready"
        );
        assert!(!result.network_attempted);
        assert!(!result.real_webdav_transport_available);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert_eq!(result.create_only_behavior, "unknown");
        assert_eq!(result.etag_behavior, "unknown");
        assert_eq!(result.if_none_match_behavior, "unknown");
    }

    #[test]
    fn invalid_operation_blocks_without_write_flags() {
        let mut request = valid_request();
        request.requested_operations = Some(vec!["write-like-operation".to_string()]);
        let result = evaluate_capability_probe(request);
        assert!(!result.ok);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-readonly-operation-invalid"));
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn raw_extra_input_blocks_without_echoing() {
        let mut request = valid_request();
        request.extra.insert(
            "endpointUrl".to_string(),
            JsonValue::String("redacted-marker://not-echoed".to_string()),
        );
        let result = evaluate_capability_probe(request);
        assert!(!result.ok);
        assert!(result.raw_input_rejected);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-raw-input-rejected"));
        let serialized = serde_json::to_string(&result).expect("serialize result");
        assert!(!serialized.contains("redacted-marker"));
    }

    #[test]
    fn resolver_missing_registry_fails_closed() {
        let _guard = env_lock();
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        let mut request = valid_request();
        request.resolver_check = Some(true);
        let result = evaluate_capability_probe(request);
        assert!(!result.ok);
        assert!(!result.network_attempted);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-resolver-config-missing"));
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn resolver_descriptor_hash_mismatch_fails_closed() {
        let _guard = env_lock();
        let (registry_path, registry_hash) = registry_file("mismatch", &h('e'), &h('b'), &h('c'));
        std::env::set_var(DESCRIPTOR_REGISTRY_FILE_ENV, &registry_path);
        let mut request = valid_request();
        request.resolver_check = Some(true);
        request.descriptor_registry_ref_hash = Some(registry_hash);
        let result = evaluate_capability_probe(request);
        let _ = fs::remove_file(registry_path);
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        assert!(!result.ok);
        assert!(!result.network_attempted);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-descriptor-hash-mismatch"));
        assert!(!result.writes_webdav);
    }

    #[test]
    fn resolver_ready_response_is_hash_only_and_no_network() {
        let _guard = env_lock();
        let request = valid_request();
        let endpoint = request.endpoint_ref_hash.clone().expect("endpoint hash");
        let remote_root = request
            .remote_root_ref_hash
            .clone()
            .expect("remote root hash");
        let credential = request
            .credential_ref_hash
            .clone()
            .expect("credential hash");
        let (registry_path, registry_hash) =
            registry_file("ready", &endpoint, &remote_root, &credential);
        std::env::set_var(DESCRIPTOR_REGISTRY_FILE_ENV, &registry_path);
        let mut request = request;
        request.resolver_check = Some(true);
        request.descriptor_registry_ref_hash = Some(registry_hash);
        let result = evaluate_capability_probe(request);
        let _ = fs::remove_file(registry_path);
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        assert!(result.ok);
        assert!(result.resolver_available);
        assert!(result.endpoint_descriptor_resolved);
        assert!(result.remote_root_descriptor_resolved);
        assert!(result.credential_descriptor_resolved);
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
        let serialized = serde_json::to_string(&result).expect("serialize result");
        assert!(!serialized.contains("://"));
        assert!(!serialized.contains("credentialValue"));
    }
}
