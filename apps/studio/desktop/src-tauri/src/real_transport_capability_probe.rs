use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const SCHEMA: &str = "h2o.studio.transport.real-capability-probe-result.v1";
pub const REQUEST_SCHEMA: &str = "h2o.studio.transport.real-capability-probe-request.v1";
pub const READONLY_PROBE_GATE: &str =
    "real-webdav-cloud-relay-transport-readonly-capability-probe-evaluate";
pub const LIVE_READONLY_PROBE_GATE: &str = "real-transport-w3-readonly-remote-root-probe";
const DESCRIPTOR_REGISTRY_FILE_ENV: &str = "H2O_RT_DESCRIPTOR_REGISTRY_FILE";
const DEFAULT_DESCRIPTOR_REGISTRY_FILE: &str =
    "/private/tmp/h2o-real-transport-w3-live-descriptor-registry.json";
const APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME: &str =
    "h2o-real-transport-w3-live-descriptor-registry.json";
const WRITE_GRADE_REGISTRY_REF_SCHEMA: &str =
    "h2o.studio.transport.write-grade-registry-public-ref.v1";
const WRITE_GRADE_REGISTRY_HASH_BOUNDARY: &str = "descriptor-refs-only-excludes-private-material";
const FIRST_WRITE_REQUEST_SCHEMA: &str = "h2o.studio.transport.first-write-request.v1";
const WRITE_GRADE_RECEIPT_SCHEMA: &str = "h2o.sync.real-transport.write-grade-receipt.v1";
const FIRST_WRITE_OPERATION_KIND: &str = "first-sacrificial-probe-write";
const FIRST_WRITE_PAYLOAD_KIND: &str = "capability-probe-object";
const FIRST_WRITE_GATE: &str = "real-transport-w3-4a-refused-first-write-loopback";
const W31_CLOSEOUT_COMMIT: &str = "7862270237955b86d48d943263fd53947cc71f72";
const W31_ALIGNMENT_COMMIT: &str = "70e7fcc9669b939b505de96a7bb0ec61509c3370";
const W32_MOCK_PROOF_COMMIT: &str = "649849e7e48c7e5bc5924bc811d857f2435866ae";
const W33A_DESIGN_COMMIT: &str = "671fdc1c855b345185e5ea257b206c0a07cdab36";
const W33B_STORAGE_COMMIT: &str = "388a952745ab7a21ba9556531eccf5c7e0ffe1ce";
const W33C_HASH_BOUNDARY_COMMIT: &str = "aba4c70068d95ee373d157fddea06bfb31b505b0";
const WRITE_GRADE_MAX_RECEIPT_AGE_SECONDS: i64 = 7 * 24 * 60 * 60;
const FIRST_WRITE_RECOMMENDED_AGE_SECONDS: i64 = 72 * 60 * 60;
const MAX_READONLY_RESPONSE_BYTES: usize = 64 * 1024;
const READONLY_TIMEOUT_SECONDS: u64 = 8;
const WEBDAV_PROPFIND_BODY: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propfind xmlns:D=\"DAV:\"><D:prop><D:resourcetype/></D:prop></D:propfind>";
const WEBDAV_XML_ACCEPT: &str = "application/xml,text/xml,*/*";
const WEBDAV_XML_CONTENT_TYPE: &str = "application/xml; charset=utf-8";

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
    pub live_read_only_probe: Option<bool>,
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

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadOnlyRequestShape {
    pub target_shape: &'static str,
    pub trailing_slash: bool,
    pub double_slash: bool,
    pub auth_header_present: bool,
    pub propfind_depth_header_present: bool,
    pub propfind_body_present: bool,
    pub propfind_content_type_class: &'static str,
    pub accept_header_class: &'static str,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadOnlyMethodStatusFamily {
    pub operation: &'static str,
    pub status_code: u16,
    pub status_family: &'static str,
    pub request_shape: ReadOnlyRequestShape,
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
    pub listing_hash: Option<String>,
    pub child_404_ok: Option<bool>,
    pub method_status_families: Vec<ReadOnlyMethodStatusFamily>,
    pub dav_class_summary_hash: Option<String>,
    pub allowed_methods_summary_hash: Option<String>,
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
            listing_hash: None,
            child_404_ok: None,
            method_status_families: vec![],
            dav_class_summary_hash: None,
            allowed_methods_summary_hash: None,
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

    fn ready(
        request: &RtCapabilityProbeRequest,
        resolver_ready: bool,
        live_probe: Option<LiveReadOnlyProbeOutcome>,
    ) -> Self {
        let live_probe = live_probe.unwrap_or_default();
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
            network_attempted: live_probe.network_attempted,
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
            root_exists: live_probe.root_exists,
            root_empty: live_probe.root_empty,
            listing_hash: live_probe.listing_hash,
            child_404_ok: live_probe.child_404_ok,
            method_status_families: live_probe.method_status_families,
            dav_class_summary_hash: live_probe.dav_class_summary_hash,
            allowed_methods_summary_hash: live_probe.allowed_methods_summary_hash,
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
            warnings: if live_probe.network_attempted {
                vec!["real-remote-probe-readonly-only"]
            } else {
                vec!["real-remote-probe-not-performed-in-this-slice"]
            },
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DescriptorRegistry {
    schema: String,
    endpoint_ref_hash: String,
    remote_root_ref_hash: String,
    credential_ref_hash: String,
    #[serde(default)]
    endpoint_url_private: Option<String>,
    #[serde(default)]
    remote_root_path_private: Option<String>,
    #[serde(default)]
    auth_header_private: Option<String>,
    #[serde(default)]
    descriptor_mode: Option<String>,
    #[serde(flatten)]
    extra: BTreeMap<String, JsonValue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WritableDescriptorRegistry<'a> {
    schema: &'static str,
    descriptor_mode: &'static str,
    endpoint_ref_hash: &'a str,
    remote_root_ref_hash: &'a str,
    credential_ref_hash: &'a str,
    endpoint_url_private: &'a str,
    remote_root_path_private: &'a str,
    auth_header_private: &'a str,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RtWebDavSetupRequest {
    #[serde(default)]
    pub server_url: Option<String>,
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub credential_identifier: Option<String>,
    #[serde(default)]
    pub credential_secret: Option<String>,
    #[serde(default)]
    pub endpoint_descriptor_label: Option<String>,
    #[serde(default)]
    pub remote_root_descriptor_label: Option<String>,
    #[serde(default)]
    pub credential_descriptor_label: Option<String>,
    #[serde(default)]
    pub confirm_non_production: Option<bool>,
    #[serde(default)]
    pub confirm_read_only_safe: Option<bool>,
    #[serde(default)]
    pub confirm_sacrificial_write_not_approved: Option<bool>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtWebDavSetupStatusResult {
    pub schema: &'static str,
    pub ok: bool,
    pub status: &'static str,
    pub reason: &'static str,
    pub command: &'static str,
    pub registry_path_class: &'static str,
    pub registry_path_source: &'static str,
    pub write_grade_registry_eligible: bool,
    pub registry_file_owner_current_user: bool,
    pub registry_file_private_permissions: bool,
    pub registry_parent_owner_current_user: bool,
    pub registry_parent_private_permissions: bool,
    pub registry_owner_ok: bool,
    pub registry_permission_ok: bool,
    pub write_grade_registry_ref_hash: Option<String>,
    pub write_grade_registry_hash_boundary: &'static str,
    pub private_content_hash_available: bool,
    pub descriptor_registry_ref_hash: Option<String>,
    pub endpoint_ref_hash: Option<String>,
    pub remote_root_ref_hash: Option<String>,
    pub credential_ref_hash: Option<String>,
    pub saved_server_url: Option<String>,
    pub saved_root_path: Option<String>,
    pub saved_credential_identifier: Option<String>,
    pub json_parses: bool,
    pub required_private_fields_present: bool,
    pub credential_material_present: bool,
    pub credential_input_received_this_save: bool,
    pub credential_material_updated_this_save: bool,
    pub endpoint_no_longer_reserved_invalid_domain: bool,
    pub reachable_candidate: bool,
    pub network_attempted: bool,
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
    pub blockers: Vec<&'static str>,
    pub warnings: Vec<&'static str>,
}

impl RtWebDavSetupStatusResult {
    fn base(
        ok: bool,
        status: &'static str,
        reason: &'static str,
        command: &'static str,
        blockers: Vec<&'static str>,
    ) -> Self {
        Self {
            schema: "h2o.studio.transport.real-webdav-setup-status.v1",
            ok,
            status,
            reason,
            command,
            registry_path_class: "private-out-of-repo-descriptor-registry",
            registry_path_source: descriptor_registry_path_source_for_setup(),
            write_grade_registry_eligible: false,
            registry_file_owner_current_user: false,
            registry_file_private_permissions: false,
            registry_parent_owner_current_user: false,
            registry_parent_private_permissions: false,
            registry_owner_ok: false,
            registry_permission_ok: false,
            write_grade_registry_ref_hash: None,
            write_grade_registry_hash_boundary: WRITE_GRADE_REGISTRY_HASH_BOUNDARY,
            private_content_hash_available: false,
            descriptor_registry_ref_hash: None,
            endpoint_ref_hash: None,
            remote_root_ref_hash: None,
            credential_ref_hash: None,
            saved_server_url: None,
            saved_root_path: None,
            saved_credential_identifier: None,
            json_parses: false,
            required_private_fields_present: false,
            credential_material_present: false,
            credential_input_received_this_save: false,
            credential_material_updated_this_save: false,
            endpoint_no_longer_reserved_invalid_domain: false,
            reachable_candidate: false,
            network_attempted: false,
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
            blockers,
            warnings: vec!["real-transport-webdav-setup-storage-only-no-probe"],
        }
    }
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RtFirstWriteRequest {
    #[serde(default)]
    pub schema: Option<String>,
    #[serde(default)]
    pub gate: Option<String>,
    #[serde(default)]
    pub mock_only: Option<bool>,
    #[serde(default)]
    pub loopback_mock: Option<bool>,
    #[serde(default)]
    pub invocation_utc: Option<String>,
    #[serde(default)]
    pub write_grade_receipt: Option<WriteGradeReceipt>,
    #[serde(default)]
    pub approval_artifact_hash: Option<String>,
    #[serde(default)]
    pub one_shot_token: Option<String>,
    #[serde(default)]
    pub one_shot_token_hash: Option<String>,
    #[serde(default)]
    pub kill_switch_token: Option<String>,
    #[serde(default)]
    pub kill_switch_token_hash: Option<String>,
    #[serde(default)]
    pub kill_switch_enabled: Option<bool>,
    #[serde(default)]
    pub kill_switch_fresh: Option<bool>,
    #[serde(default)]
    pub write_grade_registry_ref_hash: Option<String>,
    #[serde(default)]
    pub registry_path_source: Option<String>,
    #[serde(default)]
    pub write_grade_registry_eligible: Option<bool>,
    #[serde(default)]
    pub registry_owner_ok: Option<bool>,
    #[serde(default)]
    pub registry_permission_ok: Option<bool>,
    #[serde(default)]
    pub payload: Option<String>,
    #[serde(default)]
    pub payload_hash: Option<String>,
    #[serde(default)]
    pub payload_byte_max: Option<usize>,
    #[serde(default)]
    pub product_sync_ready: Option<bool>,
    #[serde(default)]
    pub transport_ready: Option<bool>,
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
    #[serde(flatten)]
    pub extra: BTreeMap<String, JsonValue>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteGradeReceipt {
    #[serde(default)]
    pub schema: Option<String>,
    #[serde(default)]
    pub receipt_grade: Option<String>,
    #[serde(default)]
    pub mint_utc: Option<String>,
    #[serde(default)]
    pub expiry_utc: Option<String>,
    #[serde(default)]
    pub operation_kind: Option<String>,
    #[serde(default)]
    pub payload_kind: Option<String>,
    #[serde(default)]
    pub payload_count: Option<u32>,
    #[serde(default)]
    pub max_invocations: Option<u32>,
    #[serde(default)]
    pub request_budget: Option<WriteGradeRequestBudget>,
    #[serde(default)]
    pub sacrificial_object: Option<WriteGradeSacrificialObject>,
    #[serde(default)]
    pub bindings: Option<WriteGradeReceiptBindings>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteGradeRequestBudget {
    #[serde(default)]
    pub create_only_put_max: Option<u32>,
    #[serde(default)]
    pub readback_get_max: Option<u32>,
    #[serde(default)]
    pub other_methods: Option<u32>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteGradeSacrificialObject {
    #[serde(default)]
    pub path_class_ref_hash: Option<String>,
    #[serde(default)]
    pub payload_hash: Option<String>,
    #[serde(default)]
    pub payload_byte_max: Option<usize>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteGradeReceiptBindings {
    #[serde(default)]
    pub endpoint_ref_hash: Option<String>,
    #[serde(default)]
    pub remote_root_ref_hash: Option<String>,
    #[serde(default)]
    pub credential_ref_hash: Option<String>,
    #[serde(default)]
    pub write_grade_registry_ref_hash: Option<String>,
    #[serde(default)]
    pub w31_closeout_commit: Option<String>,
    #[serde(default)]
    pub w31_alignment_commit: Option<String>,
    #[serde(default)]
    pub w32_mock_proof_commit: Option<String>,
    #[serde(default)]
    pub w33a_design_commit: Option<String>,
    #[serde(default)]
    pub w33b_registry_hardening_commit: Option<String>,
    #[serde(default)]
    pub w33c_hash_boundary_commit: Option<String>,
    #[serde(default)]
    pub operator_approval_artifact_hash: Option<String>,
    #[serde(default)]
    pub one_shot_token_hash: Option<String>,
    #[serde(default)]
    pub kill_switch_token_hash: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtFirstWriteMethodStatus {
    pub operation: &'static str,
    pub status_code: u16,
    pub status_family: &'static str,
    pub loopback_only: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RtFirstWriteResult {
    pub schema: &'static str,
    pub ok: bool,
    pub status: &'static str,
    pub reason: &'static str,
    pub command: &'static str,
    pub mock_only: bool,
    pub gate_satisfied: bool,
    pub network_attempted: bool,
    pub loopback_attempted: bool,
    pub write_grade_registry_ref_hash: Option<String>,
    pub create_only_behavior: &'static str,
    pub method_statuses: Vec<RtFirstWriteMethodStatus>,
    pub writes_webdav: bool,
    pub writes_cloud: bool,
    pub writes_relay: bool,
    pub writes_cas: bool,
    pub writes_files: bool,
    pub enqueues_relay: bool,
    pub full_bundle_v3_started: bool,
    pub mints_export_id: bool,
    pub burns_sequence: bool,
    pub product_sync_ready: bool,
    pub transport_ready: bool,
    pub raw_private_fields_logged: bool,
    pub blockers: Vec<&'static str>,
    pub warnings: Vec<&'static str>,
}

impl RtFirstWriteResult {
    fn blocked(reason: &'static str, blockers: Vec<&'static str>) -> Self {
        Self {
            schema: "h2o.studio.transport.first-write-result.v1",
            ok: false,
            status: "real-transport-w3-first-write-blocked",
            reason,
            command: "h2o_rt_first_write",
            mock_only: true,
            gate_satisfied: false,
            network_attempted: false,
            loopback_attempted: false,
            write_grade_registry_ref_hash: None,
            create_only_behavior: "not-attempted",
            method_statuses: vec![],
            writes_webdav: false,
            writes_cloud: false,
            writes_relay: false,
            writes_cas: false,
            writes_files: false,
            enqueues_relay: false,
            full_bundle_v3_started: false,
            mints_export_id: false,
            burns_sequence: false,
            product_sync_ready: false,
            transport_ready: false,
            raw_private_fields_logged: false,
            blockers,
            warnings: vec!["w3-4a-refused-by-default-no-live-write"],
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
enum ResolverFailure {
    MissingConfig,
    ConfigInvalid,
    RegistryHashMismatch,
    DescriptorHashMismatch,
    RawConfigRejected,
    LiveDescriptorPrivateFieldsMissing,
    LiveUrlInvalid,
    LiveNetworkFailed,
    LiveResponseTooLarge,
}

impl ResolverFailure {
    fn blocker(&self) -> &'static str {
        match self {
            Self::MissingConfig => "real-transport-w3-resolver-config-missing",
            Self::ConfigInvalid => "real-transport-w3-resolver-config-invalid",
            Self::RegistryHashMismatch => "real-transport-w3-resolver-registry-hash-mismatch",
            Self::DescriptorHashMismatch => "real-transport-w3-descriptor-hash-mismatch",
            Self::RawConfigRejected => "real-transport-w3-resolver-raw-config-rejected",
            Self::LiveDescriptorPrivateFieldsMissing => {
                "real-transport-w3-live-descriptor-private-fields-missing"
            }
            Self::LiveUrlInvalid => "real-transport-w3-live-url-invalid",
            Self::LiveNetworkFailed => "real-transport-w3-live-network-failed",
            Self::LiveResponseTooLarge => "real-transport-w3-live-response-too-large",
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

#[derive(Clone, Debug)]
struct DescriptorRegistryPathInfo {
    path: PathBuf,
    source: &'static str,
}

fn app_local_descriptor_registry_file() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").filter(|value| !value.is_empty())?;
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("H2O Studio")
                .join("real-transport")
                .join(APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME),
        );
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA").filter(|value| !value.is_empty())?;
        return Some(
            PathBuf::from(appdata)
                .join("H2O Studio")
                .join("real-transport")
                .join(APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME),
        );
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(data_home) = std::env::var_os("XDG_DATA_HOME").filter(|value| !value.is_empty())
        {
            return Some(
                PathBuf::from(data_home)
                    .join("h2o-studio")
                    .join("real-transport")
                    .join(APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME),
            );
        }
        let home = std::env::var_os("HOME").filter(|value| !value.is_empty())?;
        Some(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("h2o-studio")
                .join("real-transport")
                .join(APP_LOCAL_DESCRIPTOR_REGISTRY_FILE_NAME),
        )
    }
    #[cfg(not(any(unix, target_os = "windows")))]
    {
        None
    }
}

fn legacy_default_descriptor_registry_file() -> PathBuf {
    PathBuf::from(DEFAULT_DESCRIPTOR_REGISTRY_FILE)
}

fn env_descriptor_registry_path_info() -> Option<DescriptorRegistryPathInfo> {
    let path = std::env::var_os(DESCRIPTOR_REGISTRY_FILE_ENV)?;
    if path.is_empty() {
        return Some(DescriptorRegistryPathInfo {
            path: PathBuf::new(),
            source: "invalid",
        });
    }
    Some(DescriptorRegistryPathInfo {
        path: PathBuf::from(path),
        source: "env",
    })
}

fn descriptor_registry_path_for_probe(
    request: &RtCapabilityProbeRequest,
) -> Option<DescriptorRegistryPathInfo> {
    if let Some(info) = env_descriptor_registry_path_info() {
        return Some(info);
    }
    if let Some(app_local) = app_local_descriptor_registry_file() {
        if request.descriptor_registry_ref_hash.is_some() && app_local.exists() {
            return Some(DescriptorRegistryPathInfo {
                path: app_local,
                source: "app-local",
            });
        }
    }
    let legacy = legacy_default_descriptor_registry_file();
    if request.descriptor_registry_ref_hash.is_some() && legacy.exists() {
        return Some(DescriptorRegistryPathInfo {
            path: legacy,
            source: "default-private-legacy",
        });
    }
    None
}

fn descriptor_registry_path_for_setup_write() -> DescriptorRegistryPathInfo {
    if let Some(info) = env_descriptor_registry_path_info() {
        return info;
    }
    if let Some(path) = app_local_descriptor_registry_file() {
        return DescriptorRegistryPathInfo {
            path,
            source: "app-local",
        };
    }
    DescriptorRegistryPathInfo {
        path: legacy_default_descriptor_registry_file(),
        source: "default-private-legacy",
    }
}

fn descriptor_registry_path_for_setup_status() -> DescriptorRegistryPathInfo {
    if let Some(info) = env_descriptor_registry_path_info() {
        return info;
    }
    if let Some(path) = app_local_descriptor_registry_file() {
        if path.exists() {
            return DescriptorRegistryPathInfo {
                path,
                source: "app-local",
            };
        }
        let legacy = legacy_default_descriptor_registry_file();
        if legacy.exists() {
            return DescriptorRegistryPathInfo {
                path: legacy,
                source: "default-private-legacy",
            };
        }
        return DescriptorRegistryPathInfo {
            path,
            source: "app-local",
        };
    }
    DescriptorRegistryPathInfo {
        path: legacy_default_descriptor_registry_file(),
        source: "default-private-legacy",
    }
}

fn descriptor_registry_path_source_for_setup() -> &'static str {
    descriptor_registry_path_for_setup_status().source
}

fn registry_contains_raw_or_private(registry: &DescriptorRegistry) -> bool {
    registry.extra.iter().any(|(key, value)| {
        key_looks_raw_or_private(key) || value_looks_raw_or_private(&value.to_string())
    })
}

fn resolve_descriptor_registry(
    request: &RtCapabilityProbeRequest,
) -> Result<Option<DescriptorRegistry>, ResolverFailure> {
    if request.resolver_check != Some(true) {
        return Ok(None);
    }

    let Some(registry_file) = descriptor_registry_path_for_probe(request) else {
        return Err(ResolverFailure::MissingConfig);
    };
    let bytes = fs::read(&registry_file.path).map_err(|_| ResolverFailure::MissingConfig)?;
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
    if Some(registry.endpoint_ref_hash.clone()) != request.endpoint_ref_hash
        || Some(registry.remote_root_ref_hash.clone()) != request.remote_root_ref_hash
        || Some(registry.credential_ref_hash.clone()) != request.credential_ref_hash
    {
        return Err(ResolverFailure::DescriptorHashMismatch);
    }

    Ok(Some(registry))
}

fn descriptor_ref_hash(kind: &str, label: &str) -> String {
    let mut descriptor = BTreeMap::new();
    descriptor.insert("kind", kind.to_string());
    descriptor.insert("label", label.trim().to_string());
    descriptor.insert(
        "schema",
        "h2o.studio.transport.real-descriptor-ref.v1".to_string(),
    );
    let bytes = serde_json::to_vec(&descriptor).expect("descriptor ref serialization");
    sha256_ref(&bytes)
}

fn trim_required(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn endpoint_is_reserved_invalid_domain(server_url: &str) -> bool {
    let normalized = server_url.to_ascii_lowercase();
    if normalized.contains("reserved-invalid-domain") || normalized.contains("private.invalid") {
        return true;
    }
    match reqwest::Url::parse(server_url) {
        Ok(url) => url
            .host_str()
            .map(|host| host.eq_ignore_ascii_case("invalid") || host.ends_with(".invalid"))
            .unwrap_or(true),
        Err(_) => true,
    }
}

fn endpoint_is_reachable_candidate(server_url: &str) -> bool {
    match reqwest::Url::parse(server_url) {
        Ok(url) => {
            matches!(url.scheme(), "http" | "https")
                && !endpoint_is_reserved_invalid_domain(server_url)
        }
        Err(_) => false,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(((bytes.len() + 2) / 3) * 4);
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i];
        let b1 = if i + 1 < bytes.len() { bytes[i + 1] } else { 0 };
        let b2 = if i + 2 < bytes.len() { bytes[i + 2] } else { 0 };
        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < bytes.len() {
            out.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < bytes.len() {
            out.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn base64_value(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let bytes = input.trim().as_bytes();
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity((bytes.len() / 4) * 3);
    for (index, chunk) in bytes.chunks(4).enumerate() {
        let final_chunk = index == (bytes.len() / 4).saturating_sub(1);
        let pad2 = chunk[2] == b'=';
        let pad3 = chunk[3] == b'=';
        if (pad2 || pad3) && !final_chunk {
            return None;
        }
        let a = base64_value(chunk[0])?;
        let b = base64_value(chunk[1])?;
        let c = if pad2 { 0 } else { base64_value(chunk[2])? };
        let d = if pad3 { 0 } else { base64_value(chunk[3])? };
        out.push((a << 2) | (b >> 4));
        if !pad2 {
            out.push(((b & 0x0f) << 4) | (c >> 2));
        }
        if !pad3 {
            out.push(((c & 0x03) << 6) | d);
        }
    }
    Some(out)
}

fn build_auth_header_private(identifier: &str, credential_secret: &str) -> String {
    let material = credential_secret.trim();
    let lower = material.to_ascii_lowercase();
    if lower.starts_with("basic ") || lower.starts_with("bearer ") {
        return material.to_string();
    }
    let pair = format!("{}:{}", identifier.trim(), material);
    format!("Basic {}", base64_encode(pair.as_bytes()))
}

fn credential_identifier_from_auth_header_private(auth_header_private: &str) -> Option<String> {
    let value = auth_header_private.trim();
    if value.len() < 6 || !value[..6].eq_ignore_ascii_case("basic ") {
        return None;
    }
    let decoded = base64_decode(&value[6..])?;
    let decoded = String::from_utf8(decoded).ok()?;
    let (identifier, _) = decoded.split_once(':')?;
    let identifier = identifier.trim();
    if identifier.is_empty() {
        None
    } else {
        Some(identifier.to_string())
    }
}

fn write_private_registry_file(path: &Path, bytes: &[u8]) -> Result<(), ()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| ())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
        }
    }
    fs::write(path, bytes).map_err(|_| ())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[cfg(unix)]
fn current_effective_user_id() -> u32 {
    unsafe extern "C" {
        fn geteuid() -> u32;
    }
    unsafe { geteuid() }
}

#[cfg(unix)]
fn owner_is_current_user(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.uid() == current_effective_user_id()
}

#[cfg(not(unix))]
fn owner_is_current_user(_metadata: &fs::Metadata) -> bool {
    false
}

#[cfg(unix)]
fn file_has_private_permissions(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o077 == 0
}

#[cfg(not(unix))]
fn file_has_private_permissions(_metadata: &fs::Metadata) -> bool {
    false
}

#[cfg(unix)]
fn parent_has_private_permissions(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o022 == 0
}

#[cfg(not(unix))]
fn parent_has_private_permissions(_metadata: &fs::Metadata) -> bool {
    false
}

fn write_grade_registry_source_candidate(source: &str) -> bool {
    matches!(source, "app-local" | "env")
}

fn write_grade_registry_ref_hash(registry: &DescriptorRegistry) -> Option<String> {
    if registry.descriptor_mode.as_deref() != Some("hash-only-redacted")
        || !is_hash_ref(&Some(registry.endpoint_ref_hash.clone()))
        || !is_hash_ref(&Some(registry.remote_root_ref_hash.clone()))
        || !is_hash_ref(&Some(registry.credential_ref_hash.clone()))
    {
        return None;
    }
    let mut canonical = BTreeMap::new();
    canonical.insert(
        "credentialRefHash".to_string(),
        registry.credential_ref_hash.clone(),
    );
    canonical.insert(
        "descriptorMode".to_string(),
        "hash-only-redacted".to_string(),
    );
    canonical.insert(
        "endpointRefHash".to_string(),
        registry.endpoint_ref_hash.clone(),
    );
    canonical.insert(
        "hashBoundary".to_string(),
        WRITE_GRADE_REGISTRY_HASH_BOUNDARY.to_string(),
    );
    canonical.insert(
        "remoteRootRefHash".to_string(),
        registry.remote_root_ref_hash.clone(),
    );
    canonical.insert(
        "schema".to_string(),
        WRITE_GRADE_REGISTRY_REF_SCHEMA.to_string(),
    );
    serde_json::to_vec(&canonical)
        .ok()
        .map(|bytes| sha256_ref(&bytes))
}

fn apply_registry_storage_status(
    result: &mut RtWebDavSetupStatusResult,
    path_info: &DescriptorRegistryPathInfo,
) {
    result.registry_path_source = path_info.source;
    if let Ok(metadata) = fs::metadata(&path_info.path) {
        result.registry_file_owner_current_user = owner_is_current_user(&metadata);
        result.registry_file_private_permissions = file_has_private_permissions(&metadata);
    }
    if let Some(parent) = path_info.path.parent() {
        if let Ok(metadata) = fs::metadata(parent) {
            result.registry_parent_owner_current_user = owner_is_current_user(&metadata);
            result.registry_parent_private_permissions = parent_has_private_permissions(&metadata);
        }
    }
    result.registry_owner_ok =
        result.registry_file_owner_current_user && result.registry_parent_owner_current_user;
    result.registry_permission_ok =
        result.registry_file_private_permissions && result.registry_parent_private_permissions;
    result.write_grade_registry_eligible = write_grade_registry_source_candidate(path_info.source)
        && result.registry_owner_ok
        && result.registry_permission_ok;
    if path_info.source == "default-private-legacy" {
        result
            .warnings
            .push("real-transport-webdav-registry-legacy-not-write-grade");
    }
}

fn status_from_registry_bytes(
    command: &'static str,
    bytes: &[u8],
    path_info: &DescriptorRegistryPathInfo,
) -> RtWebDavSetupStatusResult {
    let registry_hash = sha256_ref(bytes);
    let mut result = RtWebDavSetupStatusResult::base(
        false,
        "real-transport-webdav-setup-blocked",
        "real-transport-webdav-setup-registry-invalid",
        command,
        vec!["real-transport-webdav-setup-registry-invalid"],
    );
    apply_registry_storage_status(&mut result, path_info);
    result.descriptor_registry_ref_hash = Some(registry_hash);
    result.private_content_hash_available = true;
    let Ok(registry) = serde_json::from_slice::<DescriptorRegistry>(bytes) else {
        return result;
    };
    result.json_parses = true;
    result.write_grade_registry_ref_hash = write_grade_registry_ref_hash(&registry);
    result.endpoint_ref_hash = Some(registry.endpoint_ref_hash.clone());
    result.remote_root_ref_hash = Some(registry.remote_root_ref_hash.clone());
    result.credential_ref_hash = Some(registry.credential_ref_hash.clone());
    result.saved_server_url = registry
        .endpoint_url_private
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    result.saved_root_path = registry
        .remote_root_path_private
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    result.saved_credential_identifier = registry
        .auth_header_private
        .as_deref()
        .and_then(credential_identifier_from_auth_header_private);
    result.credential_material_present = registry
        .auth_header_private
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    let required_private_fields_present = is_hash_ref(&Some(registry.endpoint_ref_hash.clone()))
        && is_hash_ref(&Some(registry.remote_root_ref_hash.clone()))
        && is_hash_ref(&Some(registry.credential_ref_hash.clone()))
        && registry
            .endpoint_url_private
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        && registry
            .remote_root_path_private
            .as_deref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
        && result.credential_material_present;
    result.required_private_fields_present = required_private_fields_present;
    result.endpoint_no_longer_reserved_invalid_domain = registry
        .endpoint_url_private
        .as_deref()
        .map(|value| !endpoint_is_reserved_invalid_domain(value))
        .unwrap_or(false);
    result.reachable_candidate = required_private_fields_present
        && registry
            .endpoint_url_private
            .as_deref()
            .map(endpoint_is_reachable_candidate)
            .unwrap_or(false);

    let mut blockers = Vec::new();
    if registry.schema != "h2o.studio.transport.real-descriptor-registry.v1" {
        blockers.push("real-transport-webdav-setup-registry-schema-invalid");
    }
    if registry.descriptor_mode.as_deref() != Some("hash-only-redacted") {
        blockers.push("real-transport-webdav-setup-descriptor-mode-invalid");
    }
    if registry_contains_raw_or_private(&registry) {
        blockers.push("real-transport-webdav-setup-extra-raw-config-rejected");
    }
    if !required_private_fields_present {
        blockers.push("real-transport-webdav-setup-required-private-fields-missing");
    }
    if !result.endpoint_no_longer_reserved_invalid_domain {
        blockers.push("real-transport-webdav-setup-reserved-invalid-domain");
    }
    if !result.reachable_candidate {
        blockers.push("real-transport-webdav-setup-not-reachable-candidate");
    }
    result.blockers = blockers;
    result.ok = result.blockers.is_empty();
    result.status = if result.ok {
        "real-transport-webdav-setup-ready"
    } else {
        "real-transport-webdav-setup-blocked"
    };
    result.reason = if result.ok {
        "real-transport-webdav-setup-ready"
    } else {
        result.blockers[0]
    };
    result
}

fn previous_auth_header_private(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let registry = serde_json::from_slice::<DescriptorRegistry>(&bytes).ok()?;
    registry
        .auth_header_private
        .filter(|value| !value.trim().is_empty())
}

fn previous_auth_header_private_for_setup(
    path_info: &DescriptorRegistryPathInfo,
) -> Option<String> {
    previous_auth_header_private(&path_info.path).or_else(|| {
        if path_info.source == "app-local" {
            previous_auth_header_private(&legacy_default_descriptor_registry_file())
        } else {
            None
        }
    })
}

pub fn prepare_webdav_setup(request: RtWebDavSetupRequest) -> RtWebDavSetupStatusResult {
    let command = "h2o_rt_prepare_webdav_setup";
    let mut blockers = Vec::new();
    let registry_path_info = descriptor_registry_path_for_setup_write();
    let server_url = trim_required(&request.server_url);
    let root_path = trim_required(&request.root_path);
    let credential_identifier = trim_required(&request.credential_identifier);
    let credential_secret = trim_required(&request.credential_secret);
    let endpoint_descriptor_label = trim_required(&request.endpoint_descriptor_label);
    let remote_root_descriptor_label = trim_required(&request.remote_root_descriptor_label);
    let credential_descriptor_label = trim_required(&request.credential_descriptor_label);

    if server_url.is_none() {
        blockers.push("real-transport-webdav-setup-server-url-required");
    }
    if root_path.is_none() {
        blockers.push("real-transport-webdav-setup-root-path-required");
    }
    let previous_auth_header = previous_auth_header_private_for_setup(&registry_path_info);
    if credential_identifier.is_none()
        || (credential_secret.is_none() && previous_auth_header.is_none())
    {
        blockers.push("real-transport-webdav-setup-credential-required");
    }
    if endpoint_descriptor_label.is_none()
        || remote_root_descriptor_label.is_none()
        || credential_descriptor_label.is_none()
    {
        blockers.push("real-transport-webdav-setup-descriptor-labels-required");
    }
    if request.confirm_non_production != Some(true) {
        blockers.push("real-transport-webdav-setup-non-production-confirmation-required");
    }
    if request.confirm_read_only_safe != Some(true) {
        blockers.push("real-transport-webdav-setup-readonly-confirmation-required");
    }
    if request.confirm_sacrificial_write_not_approved != Some(true) {
        blockers.push("real-transport-webdav-setup-no-sacrificial-write-confirmation-required");
    }
    if server_url
        .as_deref()
        .map(endpoint_is_reachable_candidate)
        .unwrap_or(false)
        == false
    {
        blockers.push("real-transport-webdav-setup-reachable-candidate-required");
    }
    for label in [
        endpoint_descriptor_label.as_deref(),
        remote_root_descriptor_label.as_deref(),
        credential_descriptor_label.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if value_looks_raw_or_private(label) {
            blockers.push("real-transport-webdav-setup-descriptor-label-raw-rejected");
            break;
        }
    }
    if !blockers.is_empty() {
        let mut result = RtWebDavSetupStatusResult::base(
            false,
            "real-transport-webdav-setup-blocked",
            blockers[0],
            command,
            blockers,
        );
        apply_registry_storage_status(&mut result, &registry_path_info);
        return result;
    }

    let server_url = server_url.expect("validated serverUrl");
    let root_path = root_path.expect("validated rootPath");
    let credential_identifier = credential_identifier.expect("validated credentialIdentifier");
    let endpoint_descriptor_label =
        endpoint_descriptor_label.expect("validated endpoint descriptor label");
    let remote_root_descriptor_label =
        remote_root_descriptor_label.expect("validated remote root descriptor label");
    let credential_descriptor_label =
        credential_descriptor_label.expect("validated credential descriptor label");
    let endpoint_ref_hash = descriptor_ref_hash("endpoint", &endpoint_descriptor_label);
    let remote_root_ref_hash = descriptor_ref_hash("remote-root", &remote_root_descriptor_label);
    let credential_ref_hash = descriptor_ref_hash("credential", &credential_descriptor_label);
    let credential_input_received_this_save = credential_secret.is_some();
    let auth_header_private = credential_secret
        .as_deref()
        .map(|secret| build_auth_header_private(&credential_identifier, secret))
        .or_else(|| previous_auth_header.clone())
        .expect("validated credential material");
    let credential_material_updated_this_save = credential_input_received_this_save
        && previous_auth_header.as_deref() != Some(auth_header_private.as_str());
    let registry = WritableDescriptorRegistry {
        schema: "h2o.studio.transport.real-descriptor-registry.v1",
        descriptor_mode: "hash-only-redacted",
        endpoint_ref_hash: &endpoint_ref_hash,
        remote_root_ref_hash: &remote_root_ref_hash,
        credential_ref_hash: &credential_ref_hash,
        endpoint_url_private: &server_url,
        remote_root_path_private: &root_path,
        auth_header_private: &auth_header_private,
    };
    let bytes = match serde_json::to_vec_pretty(&registry) {
        Ok(bytes) => bytes,
        Err(_) => {
            return RtWebDavSetupStatusResult::base(
                false,
                "real-transport-webdav-setup-blocked",
                "real-transport-webdav-setup-registry-serialize-failed",
                command,
                vec!["real-transport-webdav-setup-registry-serialize-failed"],
            )
        }
    };
    if write_private_registry_file(&registry_path_info.path, &bytes).is_err() {
        let mut result = RtWebDavSetupStatusResult::base(
            false,
            "real-transport-webdav-setup-blocked",
            "real-transport-webdav-setup-registry-write-failed",
            command,
            vec!["real-transport-webdav-setup-registry-write-failed"],
        );
        apply_registry_storage_status(&mut result, &registry_path_info);
        return result;
    }
    let mut result = status_from_registry_bytes(command, &bytes, &registry_path_info);
    result.credential_input_received_this_save = credential_input_received_this_save;
    result.credential_material_updated_this_save = credential_material_updated_this_save;
    result
}

pub fn webdav_setup_status() -> RtWebDavSetupStatusResult {
    let command = "h2o_rt_webdav_setup_status";
    let registry_path_info = descriptor_registry_path_for_setup_status();
    match fs::read(&registry_path_info.path) {
        Ok(bytes) => status_from_registry_bytes(command, &bytes, &registry_path_info),
        Err(_) => {
            let mut result = RtWebDavSetupStatusResult::base(
                false,
                "real-transport-webdav-setup-blocked",
                "real-transport-webdav-setup-registry-missing",
                command,
                vec!["real-transport-webdav-setup-registry-missing"],
            );
            apply_registry_storage_status(&mut result, &registry_path_info);
            result
        }
    }
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ReadOnlyProbeOperation {
    Options,
    PropfindDepth0,
    PropfindDepth1,
    HeadRoot,
    GetRoot,
    HeadDeterministicNonexistentChild,
}

impl ReadOnlyProbeOperation {
    fn from_request(value: &str) -> Option<Self> {
        match value {
            "options" => Some(Self::Options),
            "propfind-depth-0" => Some(Self::PropfindDepth0),
            "propfind-depth-1" => Some(Self::PropfindDepth1),
            "head-root" => Some(Self::HeadRoot),
            "get-root" => Some(Self::GetRoot),
            "head-deterministic-nonexistent-child" => Some(Self::HeadDeterministicNonexistentChild),
            _ => None,
        }
    }

    fn method(self) -> &'static str {
        match self {
            Self::Options => "OPTIONS",
            Self::PropfindDepth0 | Self::PropfindDepth1 => "PROPFIND",
            Self::HeadRoot | Self::HeadDeterministicNonexistentChild => "HEAD",
            Self::GetRoot => "GET",
        }
    }

    fn redacted_label(self) -> &'static str {
        match self {
            Self::Options => "OPTIONS",
            Self::PropfindDepth0 => "PROPFIND Depth 0",
            Self::PropfindDepth1 => "PROPFIND Depth 1",
            Self::HeadRoot => "HEAD root",
            Self::GetRoot => "GET root",
            Self::HeadDeterministicNonexistentChild => "HEAD deterministic nonexistent child",
        }
    }

    fn depth(self) -> Option<&'static str> {
        match self {
            Self::PropfindDepth0 => Some("0"),
            Self::PropfindDepth1 => Some("1"),
            _ => None,
        }
    }

    fn sends_propfind_body(self) -> bool {
        matches!(self, Self::PropfindDepth0 | Self::PropfindDepth1)
    }

    fn propfind_content_type_class(self) -> &'static str {
        if self.sends_propfind_body() {
            "xml"
        } else {
            "none"
        }
    }

    fn accept_header_class(self) -> &'static str {
        if self.sends_propfind_body() {
            "xml"
        } else {
            "none"
        }
    }

    fn targets_nonexistent_child(self) -> bool {
        self == Self::HeadDeterministicNonexistentChild
    }
}

#[derive(Clone, Debug)]
struct ReadOnlyProbeHttpRequest {
    operation: ReadOnlyProbeOperation,
    endpoint_url_private: String,
    remote_root_path_private: String,
    auth_header_private: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct ReadOnlyProbeHttpResponse {
    status: u16,
    dav_header: Option<String>,
    allow_header: Option<String>,
    body: Vec<u8>,
}

#[derive(Clone, Debug, Default)]
struct LiveReadOnlyProbeOutcome {
    network_attempted: bool,
    root_exists: Option<bool>,
    root_empty: Option<bool>,
    listing_hash: Option<String>,
    child_404_ok: Option<bool>,
    method_status_families: Vec<ReadOnlyMethodStatusFamily>,
    dav_class_summary_hash: Option<String>,
    allowed_methods_summary_hash: Option<String>,
}

trait ReadOnlyProbeClient {
    fn send(
        &self,
        request: ReadOnlyProbeHttpRequest,
    ) -> Result<ReadOnlyProbeHttpResponse, ResolverFailure>;
}

struct ReqwestReadOnlyProbeClient;

impl ReqwestReadOnlyProbeClient {
    fn build_target_url(
        endpoint_url_private: &str,
        remote_root_path_private: &str,
        child: bool,
    ) -> Result<reqwest::Url, ResolverFailure> {
        let mut url = reqwest::Url::parse(endpoint_url_private)
            .map_err(|_| ResolverFailure::LiveUrlInvalid)?;
        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(ResolverFailure::LiveUrlInvalid);
        }
        url.set_query(None);
        url.set_fragment(None);

        let endpoint_segments = url
            .path_segments()
            .map(|segments| {
                segments
                    .filter(|segment| !segment.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let remote_root_segments = remote_root_path_private
            .split('/')
            .map(str::trim)
            .filter(|segment| !segment.is_empty())
            .collect::<Vec<_>>();

        {
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| ResolverFailure::LiveUrlInvalid)?;
            segments.clear();
            for segment in endpoint_segments {
                segments.push(&segment);
            }
            for segment in remote_root_segments {
                segments.push(segment);
            }
            if child {
                segments.push(".h2o-readonly-probe-nonexistent");
            } else {
                segments.push("");
            }
        }
        Ok(url)
    }
}

impl ReadOnlyProbeClient for ReqwestReadOnlyProbeClient {
    fn send(
        &self,
        request: ReadOnlyProbeHttpRequest,
    ) -> Result<ReadOnlyProbeHttpResponse, ResolverFailure> {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(READONLY_TIMEOUT_SECONDS))
            .build()
            .map_err(|_| ResolverFailure::LiveNetworkFailed)?;
        let url = Self::build_target_url(
            &request.endpoint_url_private,
            &request.remote_root_path_private,
            request.operation.targets_nonexistent_child(),
        )?;
        let method = reqwest::Method::from_bytes(request.operation.method().as_bytes())
            .map_err(|_| ResolverFailure::LiveNetworkFailed)?;
        let mut builder = client.request(method, url);
        if let Some(depth) = request.operation.depth() {
            builder = builder.header("Depth", depth);
        }
        if request.operation.sends_propfind_body() {
            builder = builder
                .header(reqwest::header::ACCEPT, WEBDAV_XML_ACCEPT)
                .header(reqwest::header::CONTENT_TYPE, WEBDAV_XML_CONTENT_TYPE)
                .header(reqwest::header::CACHE_CONTROL, "no-cache")
                .body(WEBDAV_PROPFIND_BODY.to_string());
        }
        if let Some(auth_header) = request.auth_header_private {
            builder = builder.header("Authorization", auth_header);
        }
        let mut response = builder
            .send()
            .map_err(|_| ResolverFailure::LiveNetworkFailed)?;
        let status = response.status().as_u16();
        let dav_header = response
            .headers()
            .get("DAV")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let allow_header = response
            .headers()
            .get("Allow")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let mut body = Vec::new();
        response
            .by_ref()
            .take((MAX_READONLY_RESPONSE_BYTES + 1) as u64)
            .read_to_end(&mut body)
            .map_err(|_| ResolverFailure::LiveNetworkFailed)?;
        if body.len() > MAX_READONLY_RESPONSE_BYTES {
            return Err(ResolverFailure::LiveResponseTooLarge);
        }
        Ok(ReadOnlyProbeHttpResponse {
            status,
            dav_header,
            allow_header,
            body,
        })
    }
}

fn redacted_summary_hash(value: Option<&str>) -> Option<String> {
    value.map(|value| sha256_ref(value.as_bytes()))
}

fn status_family(status: u16) -> &'static str {
    match status {
        100..=199 => "1xx",
        200..=299 => "2xx",
        300..=399 => "3xx",
        400..=499 => "4xx",
        500..=599 => "5xx",
        _ => "other",
    }
}

fn redacted_request_shape(
    endpoint_url_private: &str,
    remote_root_path_private: &str,
    operation: ReadOnlyProbeOperation,
    auth_header_private: Option<&String>,
) -> Result<ReadOnlyRequestShape, ResolverFailure> {
    let target_url = ReqwestReadOnlyProbeClient::build_target_url(
        endpoint_url_private,
        remote_root_path_private,
        operation.targets_nonexistent_child(),
    )?;
    Ok(ReadOnlyRequestShape {
        target_shape: if remote_root_path_private.trim().trim_matches('/').is_empty() {
            "endpoint-only"
        } else {
            "endpoint-plus-folder"
        },
        trailing_slash: target_url.path().ends_with('/'),
        double_slash: target_url.path().contains("//"),
        auth_header_present: auth_header_private
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
        propfind_depth_header_present: operation.depth().is_some(),
        propfind_body_present: operation.sends_propfind_body(),
        propfind_content_type_class: operation.propfind_content_type_class(),
        accept_header_class: operation.accept_header_class(),
    })
}

fn run_live_readonly_probe<C: ReadOnlyProbeClient>(
    request: &RtCapabilityProbeRequest,
    registry: &DescriptorRegistry,
    client: &C,
) -> Result<LiveReadOnlyProbeOutcome, ResolverFailure> {
    let endpoint_url_private = registry
        .endpoint_url_private
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or(ResolverFailure::LiveDescriptorPrivateFieldsMissing)?;
    let remote_root_path_private = registry
        .remote_root_path_private
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or(ResolverFailure::LiveDescriptorPrivateFieldsMissing)?;
    let operations = request.requested_operations.as_deref().unwrap_or(&[]);
    let mut outcome = LiveReadOnlyProbeOutcome {
        network_attempted: true,
        ..Default::default()
    };

    for operation in operations
        .iter()
        .filter_map(|operation| ReadOnlyProbeOperation::from_request(operation))
    {
        let request_shape = redacted_request_shape(
            &endpoint_url_private,
            &remote_root_path_private,
            operation,
            registry.auth_header_private.as_ref(),
        )?;
        let response = client.send(ReadOnlyProbeHttpRequest {
            operation,
            endpoint_url_private: endpoint_url_private.clone(),
            remote_root_path_private: remote_root_path_private.clone(),
            auth_header_private: registry.auth_header_private.clone(),
        })?;
        let status_success = (200..300).contains(&response.status);
        outcome
            .method_status_families
            .push(ReadOnlyMethodStatusFamily {
                operation: operation.redacted_label(),
                status_code: response.status,
                status_family: status_family(response.status),
                request_shape,
            });
        if operation.targets_nonexistent_child() {
            outcome.child_404_ok = Some(response.status == 404);
        } else if matches!(
            operation,
            ReadOnlyProbeOperation::HeadRoot
                | ReadOnlyProbeOperation::GetRoot
                | ReadOnlyProbeOperation::PropfindDepth0
                | ReadOnlyProbeOperation::PropfindDepth1
        ) {
            if status_success {
                outcome.root_exists = Some(true);
            } else if outcome.root_exists != Some(true) {
                outcome.root_exists = Some(false);
            }
        }
        if matches!(
            operation,
            ReadOnlyProbeOperation::GetRoot
                | ReadOnlyProbeOperation::PropfindDepth0
                | ReadOnlyProbeOperation::PropfindDepth1
        ) && !response.body.is_empty()
        {
            outcome.listing_hash = Some(sha256_ref(&response.body));
            outcome.root_empty = Some(false);
        }
        outcome.dav_class_summary_hash = outcome
            .dav_class_summary_hash
            .or_else(|| redacted_summary_hash(response.dav_header.as_deref()));
        outcome.allowed_methods_summary_hash = outcome
            .allowed_methods_summary_hash
            .or_else(|| redacted_summary_hash(response.allow_header.as_deref()));
    }

    Ok(outcome)
}

fn evaluate_capability_probe_with_client<C: ReadOnlyProbeClient>(
    request: RtCapabilityProbeRequest,
    client: &C,
) -> RtCapabilityProbeResult {
    let mut blockers = Vec::new();
    let live_probe_requested = request.live_read_only_probe == Some(true);
    let expected_gate = if live_probe_requested {
        LIVE_READONLY_PROBE_GATE
    } else {
        READONLY_PROBE_GATE
    };

    if request.schema.as_deref() != Some(REQUEST_SCHEMA) {
        blockers.push("real-transport-w3-readonly-request-schema-required");
    }
    if request.gate.as_deref() != Some(expected_gate) {
        blockers.push("real-transport-w3-readonly-gate-required");
    }
    if live_probe_requested && request.resolver_check != Some(true) {
        blockers.push("real-transport-w3-live-resolver-required");
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
    let registry = if blockers.is_empty() {
        match resolve_descriptor_registry(&request) {
            Ok(registry) => registry,
            Err(err) => {
                blockers.push(err.blocker());
                None
            }
        }
    } else {
        None
    };
    let resolver = registry.is_some();
    let live_probe = if blockers.is_empty() && live_probe_requested {
        match registry
            .as_ref()
            .ok_or(ResolverFailure::LiveDescriptorPrivateFieldsMissing)
            .and_then(|registry| run_live_readonly_probe(&request, registry, client))
        {
            Ok(outcome) => Some(outcome),
            Err(err) => {
                blockers.push(err.blocker());
                None
            }
        }
    } else {
        None
    };

    if !blockers.is_empty() {
        return RtCapabilityProbeResult::blocked(
            "read-only-capability-probe-blocked",
            blockers,
            raw_input_rejected,
        );
    }

    RtCapabilityProbeResult::ready(&request, resolver, live_probe)
}

pub fn evaluate_capability_probe(request: RtCapabilityProbeRequest) -> RtCapabilityProbeResult {
    evaluate_capability_probe_with_client(request, &ReqwestReadOnlyProbeClient)
}

fn token_hash_matches(raw: &Option<String>, expected: &Option<String>) -> bool {
    let Some(raw) = raw.as_deref() else {
        return false;
    };
    let Some(expected) = expected.as_deref() else {
        return false;
    };
    sha256_ref(raw.as_bytes()) == expected
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let year = year - if month <= 2 { 1 } else { 0 };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let yoe = year - era * 400;
    let month = month as i32;
    let day = day as i32;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some((era * 146097 + doe - 719468) as i64)
}

fn parse_utc_seconds(value: &str) -> Option<i64> {
    let bytes = value.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return None;
    }
    let year = value[0..4].parse::<i32>().ok()?;
    let month = value[5..7].parse::<u32>().ok()?;
    let day = value[8..10].parse::<u32>().ok()?;
    let hour = value[11..13].parse::<i64>().ok()?;
    let minute = value[14..16].parse::<i64>().ok()?;
    let second = value[17..19].parse::<i64>().ok()?;
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some(days_from_civil(year, month, day)? * 86_400 + hour * 3_600 + minute * 60 + second)
}

#[derive(Clone, Debug, Default)]
struct FirstWriteLoopbackResponse {
    status: u16,
    body: Vec<u8>,
    redirected: bool,
    timeout_after_send: bool,
}

trait FirstWriteLoopbackClient {
    fn propfind_absence(&self) -> FirstWriteLoopbackResponse;
    fn put_create_first(&self, payload: &[u8]) -> FirstWriteLoopbackResponse;
    fn put_create_second(&self, payload: &[u8]) -> FirstWriteLoopbackResponse;
    fn get_readback(&self) -> FirstWriteLoopbackResponse;
}

#[derive(Default)]
struct DefaultFirstWriteLoopbackClient;

impl FirstWriteLoopbackClient for DefaultFirstWriteLoopbackClient {
    fn propfind_absence(&self) -> FirstWriteLoopbackResponse {
        FirstWriteLoopbackResponse {
            status: 404,
            ..Default::default()
        }
    }

    fn put_create_first(&self, _payload: &[u8]) -> FirstWriteLoopbackResponse {
        FirstWriteLoopbackResponse {
            status: 201,
            ..Default::default()
        }
    }

    fn put_create_second(&self, _payload: &[u8]) -> FirstWriteLoopbackResponse {
        FirstWriteLoopbackResponse {
            status: 412,
            ..Default::default()
        }
    }

    fn get_readback(&self) -> FirstWriteLoopbackResponse {
        FirstWriteLoopbackResponse {
            status: 200,
            body: b"h2o-w3-first-write-loopback-sentinel".to_vec(),
            ..Default::default()
        }
    }
}

fn push_status(
    statuses: &mut Vec<RtFirstWriteMethodStatus>,
    operation: &'static str,
    response: &FirstWriteLoopbackResponse,
) {
    statuses.push(RtFirstWriteMethodStatus {
        operation,
        status_code: response.status,
        status_family: status_family(response.status),
        loopback_only: true,
    });
}

fn first_write_response_blocker(response: &FirstWriteLoopbackResponse) -> Option<&'static str> {
    if response.timeout_after_send {
        return Some("real-transport-w3-first-write-remote-write-uncertain");
    }
    if response.redirected || (300..400).contains(&response.status) {
        return Some("real-transport-w3-first-write-redirect-refused");
    }
    if response.status == 401 || response.status == 403 {
        return Some("real-transport-w3-first-write-auth-refused");
    }
    None
}

fn validate_write_grade_receipt(request: &RtFirstWriteRequest, blockers: &mut Vec<&'static str>) {
    if request.schema.as_deref() != Some(FIRST_WRITE_REQUEST_SCHEMA) {
        blockers.push("real-transport-w3-first-write-request-schema-required");
    }
    if request.gate.as_deref() != Some(FIRST_WRITE_GATE) {
        blockers.push("real-transport-w3-first-write-gate-required");
    }
    if request.mock_only != Some(true) || request.loopback_mock != Some(true) {
        blockers.push("real-transport-w3-first-write-loopback-mock-required");
    }
    if request.product_sync_ready == Some(true)
        || request.transport_ready == Some(true)
        || request.writes_webdav == Some(true)
        || request.writes_cloud == Some(true)
        || request.writes_relay == Some(true)
        || request.writes_cas == Some(true)
        || request.writes_files == Some(true)
        || request.enqueues_relay == Some(true)
        || request.full_bundle_v3_started == Some(true)
        || request.mints_export_id == Some(true)
        || request.burns_sequence == Some(true)
    {
        blockers.push("real-transport-w3-first-write-readiness-or-write-claim-rejected");
    }
    if !request.extra.is_empty() {
        blockers.push("real-transport-w3-first-write-unknown-field-rejected");
    }

    let approval_hash = request.approval_artifact_hash.as_ref();
    if !is_hash_ref(&request.approval_artifact_hash) {
        blockers.push("real-transport-w3-write-grade-approval-missing");
    }

    let Some(receipt) = request.write_grade_receipt.as_ref() else {
        blockers.push("real-transport-w3-write-grade-receipt-missing");
        return;
    };
    if receipt.schema.as_deref() != Some(WRITE_GRADE_RECEIPT_SCHEMA) {
        blockers.push("real-transport-w3-write-grade-receipt-schema-invalid");
    }
    match receipt.receipt_grade.as_deref() {
        Some("write-grade") => {}
        Some("fixture") | Some("mock-grade") | Some("fixture/mock-grade") => {
            blockers.push("real-transport-w3-fixture-mock-grade-receipt-rejected");
        }
        _ => blockers.push("real-transport-w3-write-grade-receipt-grade-invalid"),
    }
    if receipt.operation_kind.as_deref() != Some(FIRST_WRITE_OPERATION_KIND) {
        blockers.push("real-transport-w3-first-write-operation-kind-invalid");
    }
    if receipt.payload_kind.as_deref() != Some(FIRST_WRITE_PAYLOAD_KIND) {
        blockers.push("real-transport-w3-first-write-payload-kind-invalid");
    }
    if receipt.payload_count != Some(1) || receipt.max_invocations != Some(1) {
        blockers.push("real-transport-w3-first-write-single-invocation-required");
    }
    let budget = receipt.request_budget.as_ref();
    if budget.and_then(|value| value.create_only_put_max) != Some(2)
        || budget.and_then(|value| value.readback_get_max) != Some(1)
        || budget.and_then(|value| value.other_methods) != Some(0)
    {
        blockers.push("real-transport-w3-first-write-request-budget-invalid");
    }
    let object = receipt.sacrificial_object.as_ref();
    if !is_hash_ref(&object.and_then(|value| value.path_class_ref_hash.clone())) {
        blockers.push("real-transport-w3-first-write-path-class-hash-required");
    }
    if object
        .and_then(|value| value.payload_byte_max)
        .unwrap_or(usize::MAX)
        > 256
        || request.payload_byte_max.unwrap_or(usize::MAX) > 256
    {
        blockers.push("real-transport-w3-first-write-payload-too-large");
    }

    let payload = request.payload.as_deref().unwrap_or("");
    if payload.is_empty() || payload.as_bytes().len() > 256 {
        blockers.push("real-transport-w3-first-write-payload-too-large");
    }
    let payload_hash = Some(sha256_ref(payload.as_bytes()));
    if request.payload_hash != payload_hash
        || object.and_then(|value| value.payload_hash.clone()) != payload_hash
    {
        blockers.push("real-transport-w3-first-write-payload-hash-mismatch");
    }

    let bindings = receipt.bindings.as_ref();
    if !is_hash_ref(&bindings.and_then(|value| value.endpoint_ref_hash.clone()))
        || !is_hash_ref(&bindings.and_then(|value| value.remote_root_ref_hash.clone()))
        || !is_hash_ref(&bindings.and_then(|value| value.credential_ref_hash.clone()))
    {
        blockers.push("real-transport-w3-first-write-descriptor-bindings-required");
    }
    if request.write_grade_registry_ref_hash
        != bindings.and_then(|value| value.write_grade_registry_ref_hash.clone())
        || !is_hash_ref(&request.write_grade_registry_ref_hash)
    {
        blockers.push("real-transport-w3-write-grade-registry-ref-hash-mismatch");
    }
    if request.registry_path_source.as_deref() == Some("default-private-legacy")
        || request.registry_path_source.as_deref() == Some("invalid")
        || !matches!(
            request.registry_path_source.as_deref(),
            Some("app-local") | Some("env")
        )
    {
        blockers.push("real-transport-w3-write-grade-registry-source-refused");
    }
    if request.write_grade_registry_eligible != Some(true)
        || request.registry_owner_ok != Some(true)
        || request.registry_permission_ok != Some(true)
    {
        blockers.push("real-transport-w3-write-grade-registry-owner-permission-refused");
    }
    if bindings.and_then(|value| value.w31_closeout_commit.as_deref()) != Some(W31_CLOSEOUT_COMMIT)
        || bindings.and_then(|value| value.w31_alignment_commit.as_deref())
            != Some(W31_ALIGNMENT_COMMIT)
        || bindings.and_then(|value| value.w32_mock_proof_commit.as_deref())
            != Some(W32_MOCK_PROOF_COMMIT)
        || bindings.and_then(|value| value.w33a_design_commit.as_deref())
            != Some(W33A_DESIGN_COMMIT)
        || bindings.and_then(|value| value.w33b_registry_hardening_commit.as_deref())
            != Some(W33B_STORAGE_COMMIT)
        || bindings.and_then(|value| value.w33c_hash_boundary_commit.as_deref())
            != Some(W33C_HASH_BOUNDARY_COMMIT)
    {
        blockers.push("real-transport-w3-first-write-commit-binding-mismatch");
    }
    if bindings.and_then(|value| value.operator_approval_artifact_hash.clone())
        != approval_hash.cloned()
    {
        blockers.push("real-transport-w3-write-grade-approval-hash-mismatch");
    }
    if !token_hash_matches(&request.one_shot_token, &request.one_shot_token_hash)
        || bindings.and_then(|value| value.one_shot_token_hash.clone())
            != request.one_shot_token_hash
    {
        blockers.push("real-transport-w3-one-shot-token-missing-or-mismatch");
    }
    if !token_hash_matches(&request.kill_switch_token, &request.kill_switch_token_hash)
        || bindings.and_then(|value| value.kill_switch_token_hash.clone())
            != request.kill_switch_token_hash
    {
        blockers.push("real-transport-w3-kill-switch-token-missing-or-mismatch");
    }
    if request.kill_switch_enabled != Some(true) || request.kill_switch_fresh != Some(true) {
        blockers.push("real-transport-w3-kill-switch-disabled-or-stale");
    }

    let Some(invocation_utc) = request
        .invocation_utc
        .as_deref()
        .and_then(parse_utc_seconds)
    else {
        blockers.push("real-transport-w3-first-write-invocation-time-invalid");
        return;
    };
    let Some(mint_utc) = receipt.mint_utc.as_deref().and_then(parse_utc_seconds) else {
        blockers.push("real-transport-w3-write-grade-receipt-time-invalid");
        return;
    };
    let Some(expiry_utc) = receipt.expiry_utc.as_deref().and_then(parse_utc_seconds) else {
        blockers.push("real-transport-w3-write-grade-receipt-time-invalid");
        return;
    };
    if mint_utc > invocation_utc {
        blockers.push("real-transport-w3-write-grade-receipt-future-mint-refused");
    }
    if invocation_utc > expiry_utc {
        blockers.push("real-transport-w3-write-grade-receipt-expired");
    }
    if expiry_utc - mint_utc > WRITE_GRADE_MAX_RECEIPT_AGE_SECONDS {
        blockers.push("real-transport-w3-write-grade-receipt-expiry-window-too-large");
    }
    if invocation_utc - mint_utc > FIRST_WRITE_RECOMMENDED_AGE_SECONDS {
        blockers.push("real-transport-w3-first-write-receipt-age-exceeds-72h");
    }
}

fn evaluate_first_write_with_client<C: FirstWriteLoopbackClient>(
    request: Option<RtFirstWriteRequest>,
    client: &C,
) -> RtFirstWriteResult {
    let Some(request) = request else {
        return RtFirstWriteResult::blocked(
            "real-transport-w3-write-grade-approval-missing",
            vec!["real-transport-w3-write-grade-approval-missing"],
        );
    };

    let mut blockers = Vec::new();
    validate_write_grade_receipt(&request, &mut blockers);
    if !blockers.is_empty() {
        return RtFirstWriteResult::blocked(blockers[0], blockers);
    }

    let payload = request.payload.as_deref().unwrap_or("").as_bytes().to_vec();
    let mut method_statuses = Vec::new();

    let propfind = client.propfind_absence();
    push_status(
        &mut method_statuses,
        "PROPFIND pre-write absence check",
        &propfind,
    );
    if let Some(blocker) = first_write_response_blocker(&propfind) {
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }
    if propfind.status != 404 {
        let blocker = "real-transport-w3-first-write-target-exists";
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }

    let first_put = client.put_create_first(&payload);
    push_status(&mut method_statuses, "PUT create-only #1", &first_put);
    if let Some(blocker) = first_write_response_blocker(&first_put) {
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }
    if first_put.status != 201 {
        let blocker = "real-transport-w3-first-write-put1-unexpected-status";
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }

    let second_put = client.put_create_second(&payload);
    push_status(&mut method_statuses, "PUT create-only #2", &second_put);
    if let Some(blocker) = first_write_response_blocker(&second_put) {
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }
    if (200..300).contains(&second_put.status) {
        let blocker = "real-transport-w3-first-write-create-only-not-enforced";
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }
    if second_put.status != 412 {
        let blocker = "real-transport-w3-first-write-put2-unexpected-status";
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }

    let readback = client.get_readback();
    push_status(&mut method_statuses, "GET read-back", &readback);
    if let Some(blocker) = first_write_response_blocker(&readback) {
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }
    if readback.status != 200
        || sha256_ref(&readback.body) != request.payload_hash.clone().unwrap_or_default()
    {
        let blocker = "real-transport-w3-first-write-readback-hash-mismatch";
        return RtFirstWriteResult {
            reason: blocker,
            blockers: vec![blocker],
            method_statuses,
            loopback_attempted: true,
            ..RtFirstWriteResult::blocked(blocker, vec![blocker])
        };
    }

    RtFirstWriteResult {
        schema: "h2o.studio.transport.first-write-result.v1",
        ok: true,
        status: "real-transport-w3-first-write-loopback-passed",
        reason: "real-transport-w3-first-write-loopback-only-proof",
        command: "h2o_rt_first_write",
        mock_only: true,
        gate_satisfied: true,
        network_attempted: false,
        loopback_attempted: true,
        write_grade_registry_ref_hash: request.write_grade_registry_ref_hash,
        create_only_behavior: "loopback-201-then-412",
        method_statuses,
        writes_webdav: false,
        writes_cloud: false,
        writes_relay: false,
        writes_cas: false,
        writes_files: false,
        enqueues_relay: false,
        full_bundle_v3_started: false,
        mints_export_id: false,
        burns_sequence: false,
        product_sync_ready: false,
        transport_ready: false,
        raw_private_fields_logged: false,
        blockers: vec![],
        warnings: vec!["loopback-mock-only-no-real-webdav-write"],
    }
}

pub fn evaluate_first_write(request: Option<RtFirstWriteRequest>) -> RtFirstWriteResult {
    evaluate_first_write_with_client(request, &DefaultFirstWriteLoopbackClient)
}

#[tauri::command]
pub fn h2o_rt_capability_probe(
    request: RtCapabilityProbeRequest,
) -> Result<RtCapabilityProbeResult, String> {
    Ok(evaluate_capability_probe(request))
}

#[tauri::command]
pub fn h2o_rt_prepare_webdav_setup(
    request: RtWebDavSetupRequest,
) -> Result<RtWebDavSetupStatusResult, String> {
    Ok(prepare_webdav_setup(request))
}

#[tauri::command]
pub fn h2o_rt_webdav_setup_status() -> Result<RtWebDavSetupStatusResult, String> {
    Ok(webdav_setup_status())
}

#[tauri::command]
pub fn h2o_rt_first_write(
    request: Option<RtFirstWriteRequest>,
) -> Result<RtFirstWriteResult, String> {
    Ok(evaluate_first_write(request))
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

    fn registry_file_with_private(
        name: &str,
        endpoint: &str,
        remote_root: &str,
        credential: &str,
    ) -> (PathBuf, String) {
        let path = std::env::temp_dir().join(format!(
            "h2o-rt-live-probe-{name}-{}.json",
            std::process::id()
        ));
        let bytes = serde_json::to_vec(&json!({
            "schema": "h2o.studio.transport.real-descriptor-registry.v1",
            "descriptorMode": "hash-only-redacted",
            "endpointRefHash": endpoint,
            "remoteRootRefHash": remote_root,
            "credentialRefHash": credential,
            "endpointUrlPrivate": format!("{}://{}", "https", "private.invalid"),
            "remoteRootPathPrivate": "/redacted-root/",
            "authHeaderPrivate": "Bearer redacted"
        }))
        .expect("serialize private test registry");
        fs::write(&path, &bytes).expect("write private test registry");
        let registry_hash = sha256_ref(&bytes);
        (path, registry_hash)
    }

    #[derive(Default)]
    struct MockReadOnlyProbeClient;

    impl ReadOnlyProbeClient for MockReadOnlyProbeClient {
        fn send(
            &self,
            request: ReadOnlyProbeHttpRequest,
        ) -> Result<ReadOnlyProbeHttpResponse, ResolverFailure> {
            assert!(request.endpoint_url_private.contains("private.invalid"));
            assert_eq!(request.remote_root_path_private, "/redacted-root/");
            assert_eq!(
                request.auth_header_private.as_deref(),
                Some("Bearer redacted")
            );
            Ok(match request.operation {
                ReadOnlyProbeOperation::Options => ReadOnlyProbeHttpResponse {
                    status: 204,
                    allow_header: Some("OPTIONS, PROPFIND, HEAD, GET".to_string()),
                    ..Default::default()
                },
                ReadOnlyProbeOperation::PropfindDepth0 | ReadOnlyProbeOperation::PropfindDepth1 => {
                    ReadOnlyProbeHttpResponse {
                        status: 207,
                        dav_header: Some("1, 2".to_string()),
                        body: b"redacted-listing-summary".to_vec(),
                        ..Default::default()
                    }
                }
                ReadOnlyProbeOperation::HeadRoot | ReadOnlyProbeOperation::GetRoot => {
                    ReadOnlyProbeHttpResponse {
                        status: 200,
                        ..Default::default()
                    }
                }
                ReadOnlyProbeOperation::HeadDeterministicNonexistentChild => {
                    ReadOnlyProbeHttpResponse {
                        status: 404,
                        ..Default::default()
                    }
                }
            })
        }
    }

    #[derive(Clone)]
    struct MockFirstWriteLoopbackClient {
        propfind: FirstWriteLoopbackResponse,
        first_put: FirstWriteLoopbackResponse,
        second_put: FirstWriteLoopbackResponse,
        readback: FirstWriteLoopbackResponse,
    }

    impl Default for MockFirstWriteLoopbackClient {
        fn default() -> Self {
            Self {
                propfind: FirstWriteLoopbackResponse {
                    status: 404,
                    ..Default::default()
                },
                first_put: FirstWriteLoopbackResponse {
                    status: 201,
                    ..Default::default()
                },
                second_put: FirstWriteLoopbackResponse {
                    status: 412,
                    ..Default::default()
                },
                readback: FirstWriteLoopbackResponse {
                    status: 200,
                    body: b"h2o-w3-first-write-loopback-sentinel".to_vec(),
                    ..Default::default()
                },
            }
        }
    }

    impl FirstWriteLoopbackClient for MockFirstWriteLoopbackClient {
        fn propfind_absence(&self) -> FirstWriteLoopbackResponse {
            self.propfind.clone()
        }

        fn put_create_first(&self, _payload: &[u8]) -> FirstWriteLoopbackResponse {
            self.first_put.clone()
        }

        fn put_create_second(&self, _payload: &[u8]) -> FirstWriteLoopbackResponse {
            self.second_put.clone()
        }

        fn get_readback(&self) -> FirstWriteLoopbackResponse {
            self.readback.clone()
        }
    }

    fn live_request() -> RtCapabilityProbeRequest {
        let mut request = valid_request();
        request.gate = Some(LIVE_READONLY_PROBE_GATE.to_string());
        request.resolver_check = Some(true);
        request.live_read_only_probe = Some(true);
        request.requested_operations = Some(vec![
            "options".to_string(),
            "propfind-depth-0".to_string(),
            "head-root".to_string(),
            "head-deterministic-nonexistent-child".to_string(),
        ]);
        request
    }

    fn setup_request() -> RtWebDavSetupRequest {
        RtWebDavSetupRequest {
            server_url: Some(format!("{}://{}", "https", "nonproduction-webdav.local")),
            root_path: Some(format!("/{}/", "w3-readonly-root")),
            credential_identifier: Some("operator-test-identity".to_string()),
            credential_secret: Some("non-production-credential-material".to_string()),
            endpoint_descriptor_label: Some("non-production-webdav-endpoint".to_string()),
            remote_root_descriptor_label: Some("non-production-webdav-root".to_string()),
            credential_descriptor_label: Some("non-production-webdav-credential".to_string()),
            confirm_non_production: Some(true),
            confirm_read_only_safe: Some(true),
            confirm_sacrificial_write_not_approved: Some(true),
        }
    }

    fn first_write_request() -> RtFirstWriteRequest {
        let payload = "h2o-w3-first-write-loopback-sentinel".to_string();
        let payload_hash = sha256_ref(payload.as_bytes());
        let approval_hash = h('d');
        let one_shot_token = "loopback-one-shot-token".to_string();
        let kill_switch_token = "loopback-kill-switch-token".to_string();
        let one_shot_token_hash = sha256_ref(one_shot_token.as_bytes());
        let kill_switch_token_hash = sha256_ref(kill_switch_token.as_bytes());
        let write_grade_registry_ref_hash = h('e');
        RtFirstWriteRequest {
            schema: Some(FIRST_WRITE_REQUEST_SCHEMA.to_string()),
            gate: Some(FIRST_WRITE_GATE.to_string()),
            mock_only: Some(true),
            loopback_mock: Some(true),
            invocation_utc: Some("2026-07-07T01:00:00Z".to_string()),
            approval_artifact_hash: Some(approval_hash.clone()),
            one_shot_token: Some(one_shot_token),
            one_shot_token_hash: Some(one_shot_token_hash.clone()),
            kill_switch_token: Some(kill_switch_token),
            kill_switch_token_hash: Some(kill_switch_token_hash.clone()),
            kill_switch_enabled: Some(true),
            kill_switch_fresh: Some(true),
            write_grade_registry_ref_hash: Some(write_grade_registry_ref_hash.clone()),
            registry_path_source: Some("app-local".to_string()),
            write_grade_registry_eligible: Some(true),
            registry_owner_ok: Some(true),
            registry_permission_ok: Some(true),
            payload: Some(payload),
            payload_hash: Some(payload_hash.clone()),
            payload_byte_max: Some(256),
            write_grade_receipt: Some(WriteGradeReceipt {
                schema: Some(WRITE_GRADE_RECEIPT_SCHEMA.to_string()),
                receipt_grade: Some("write-grade".to_string()),
                mint_utc: Some("2026-07-07T00:00:00Z".to_string()),
                expiry_utc: Some("2026-07-09T00:00:00Z".to_string()),
                operation_kind: Some(FIRST_WRITE_OPERATION_KIND.to_string()),
                payload_kind: Some(FIRST_WRITE_PAYLOAD_KIND.to_string()),
                payload_count: Some(1),
                max_invocations: Some(1),
                request_budget: Some(WriteGradeRequestBudget {
                    create_only_put_max: Some(2),
                    readback_get_max: Some(1),
                    other_methods: Some(0),
                }),
                sacrificial_object: Some(WriteGradeSacrificialObject {
                    path_class_ref_hash: Some(h('f')),
                    payload_hash: Some(payload_hash),
                    payload_byte_max: Some(256),
                }),
                bindings: Some(WriteGradeReceiptBindings {
                    endpoint_ref_hash: Some(h('a')),
                    remote_root_ref_hash: Some(h('b')),
                    credential_ref_hash: Some(h('c')),
                    write_grade_registry_ref_hash: Some(write_grade_registry_ref_hash),
                    w31_closeout_commit: Some(W31_CLOSEOUT_COMMIT.to_string()),
                    w31_alignment_commit: Some(W31_ALIGNMENT_COMMIT.to_string()),
                    w32_mock_proof_commit: Some(W32_MOCK_PROOF_COMMIT.to_string()),
                    w33a_design_commit: Some(W33A_DESIGN_COMMIT.to_string()),
                    w33b_registry_hardening_commit: Some(W33B_STORAGE_COMMIT.to_string()),
                    w33c_hash_boundary_commit: Some(W33C_HASH_BOUNDARY_COMMIT.to_string()),
                    operator_approval_artifact_hash: Some(approval_hash),
                    one_shot_token_hash: Some(one_shot_token_hash),
                    kill_switch_token_hash: Some(kill_switch_token_hash),
                }),
            }),
            ..Default::default()
        }
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
    fn forbidden_method_names_are_not_accepted() {
        for method in [
            "PUT",
            "DELETE",
            "MKCOL",
            "PROPPATCH",
            "MOVE",
            "COPY",
            "LOCK",
            "UNLOCK",
            "POST",
        ] {
            let mut request = valid_request();
            request.requested_operations = Some(vec![method.to_string()]);
            let result = evaluate_capability_probe(request);
            assert!(!result.ok, "{method} must be rejected");
            assert!(!result.network_attempted);
            assert!(result
                .blockers
                .contains(&"real-transport-w3-readonly-operation-invalid"));
            assert!(!result.writes_webdav);
            assert!(!result.product_sync_ready);
            assert!(!result.transport_ready);
        }
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

    #[test]
    fn live_probe_requires_live_gate_before_network() {
        let _guard = env_lock();
        let mut request = valid_request();
        request.live_read_only_probe = Some(true);
        request.resolver_check = Some(true);
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        let result = evaluate_capability_probe_with_client(request, &MockReadOnlyProbeClient);
        assert!(!result.ok);
        assert!(!result.network_attempted);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-readonly-gate-required"));
        assert!(!result.writes_webdav);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn live_probe_missing_registry_fails_closed_before_network() {
        let _guard = env_lock();
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        let result =
            evaluate_capability_probe_with_client(live_request(), &MockReadOnlyProbeClient);
        assert!(!result.ok);
        assert!(!result.network_attempted);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-resolver-config-missing"));
        assert!(!result.writes_webdav);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn live_probe_descriptor_mismatch_fails_closed_before_network() {
        let _guard = env_lock();
        let (registry_path, registry_hash) =
            registry_file_with_private("live-mismatch", &h('e'), &h('b'), &h('c'));
        std::env::set_var(DESCRIPTOR_REGISTRY_FILE_ENV, &registry_path);
        let mut request = live_request();
        request.descriptor_registry_ref_hash = Some(registry_hash);
        let result = evaluate_capability_probe_with_client(request, &MockReadOnlyProbeClient);
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
    fn live_probe_mock_response_is_redacted_hash_only_and_zero_write() {
        let _guard = env_lock();
        let request = live_request();
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
            registry_file_with_private("live-ready", &endpoint, &remote_root, &credential);
        std::env::set_var(DESCRIPTOR_REGISTRY_FILE_ENV, &registry_path);
        let mut request = request;
        request.descriptor_registry_ref_hash = Some(registry_hash);
        let result = evaluate_capability_probe_with_client(request, &MockReadOnlyProbeClient);
        let _ = fs::remove_file(registry_path);
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        assert!(result.ok);
        assert!(result.resolver_available);
        assert!(result.network_attempted);
        assert_eq!(result.root_exists, Some(true));
        assert_eq!(result.root_empty, Some(false));
        assert_eq!(result.child_404_ok, Some(true));
        assert_eq!(
            result.method_status_families,
            vec![
                ReadOnlyMethodStatusFamily {
                    operation: "OPTIONS",
                    status_code: 204,
                    status_family: "2xx",
                    request_shape: ReadOnlyRequestShape {
                        target_shape: "endpoint-plus-folder",
                        trailing_slash: true,
                        double_slash: false,
                        auth_header_present: true,
                        propfind_depth_header_present: false,
                        propfind_body_present: false,
                        propfind_content_type_class: "none",
                        accept_header_class: "none",
                    },
                },
                ReadOnlyMethodStatusFamily {
                    operation: "PROPFIND Depth 0",
                    status_code: 207,
                    status_family: "2xx",
                    request_shape: ReadOnlyRequestShape {
                        target_shape: "endpoint-plus-folder",
                        trailing_slash: true,
                        double_slash: false,
                        auth_header_present: true,
                        propfind_depth_header_present: true,
                        propfind_body_present: true,
                        propfind_content_type_class: "xml",
                        accept_header_class: "xml",
                    },
                },
                ReadOnlyMethodStatusFamily {
                    operation: "HEAD root",
                    status_code: 200,
                    status_family: "2xx",
                    request_shape: ReadOnlyRequestShape {
                        target_shape: "endpoint-plus-folder",
                        trailing_slash: true,
                        double_slash: false,
                        auth_header_present: true,
                        propfind_depth_header_present: false,
                        propfind_body_present: false,
                        propfind_content_type_class: "none",
                        accept_header_class: "none",
                    },
                },
                ReadOnlyMethodStatusFamily {
                    operation: "HEAD deterministic nonexistent child",
                    status_code: 404,
                    status_family: "4xx",
                    request_shape: ReadOnlyRequestShape {
                        target_shape: "endpoint-plus-folder",
                        trailing_slash: false,
                        double_slash: false,
                        auth_header_present: true,
                        propfind_depth_header_present: false,
                        propfind_body_present: false,
                        propfind_content_type_class: "none",
                        accept_header_class: "none",
                    },
                },
            ]
        );
        assert!(is_hash_ref(&result.listing_hash));
        assert!(is_hash_ref(&result.dav_class_summary_hash));
        assert!(is_hash_ref(&result.allowed_methods_summary_hash));
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
        let serialized = serde_json::to_string(&result).expect("serialize result");
        assert!(!serialized.contains("private.invalid"));
        assert!(!serialized.contains("redacted-root"));
        assert!(!serialized.contains("Bearer redacted"));
        assert!(!serialized.contains("redacted-listing-summary"));
    }

    #[test]
    fn webdav_setup_requires_confirmations_and_never_attempts_network() {
        let result = prepare_webdav_setup(RtWebDavSetupRequest::default());
        assert!(!result.ok);
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
        assert!(result
            .blockers
            .contains(&"real-transport-webdav-setup-non-production-confirmation-required"));
        assert!(result
            .blockers
            .contains(&"real-transport-webdav-setup-readonly-confirmation-required"));
        assert!(result
            .blockers
            .contains(&"real-transport-webdav-setup-no-sacrificial-write-confirmation-required"));
    }

    #[test]
    fn webdav_setup_prepares_private_registry_and_returns_redacted_status() {
        let _guard = env_lock();
        let registry_path =
            std::env::temp_dir().join(format!("h2o-rt-webdav-setup-{}.json", std::process::id()));
        std::env::set_var(DESCRIPTOR_REGISTRY_FILE_ENV, &registry_path);
        let result = prepare_webdav_setup(setup_request());
        assert!(result.ok);
        assert_eq!(result.registry_path_source, "env");
        assert!(is_hash_ref(&result.descriptor_registry_ref_hash));
        assert!(is_hash_ref(&result.write_grade_registry_ref_hash));
        assert_eq!(
            result.write_grade_registry_hash_boundary,
            WRITE_GRADE_REGISTRY_HASH_BOUNDARY
        );
        assert!(result.private_content_hash_available);
        assert!(is_hash_ref(&result.endpoint_ref_hash));
        assert!(is_hash_ref(&result.remote_root_ref_hash));
        assert!(is_hash_ref(&result.credential_ref_hash));
        assert_eq!(
            result.saved_server_url.as_deref(),
            Some("https://nonproduction-webdav.local")
        );
        assert_eq!(
            result.saved_root_path.as_deref(),
            Some("/w3-readonly-root/")
        );
        assert_eq!(
            result.saved_credential_identifier.as_deref(),
            Some("operator-test-identity")
        );
        assert!(result.json_parses);
        assert!(result.required_private_fields_present);
        assert!(result.credential_material_present);
        assert!(result.credential_input_received_this_save);
        assert!(result.credential_material_updated_this_save);
        assert!(result.endpoint_no_longer_reserved_invalid_domain);
        assert!(result.reachable_candidate);
        assert!(!result.network_attempted);
        assert!(!result.real_webdav_transport_available);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
        assert!(!result.writes_webdav);
        let serialized = serde_json::to_string(&result).expect("serialize setup result");
        assert!(!serialized.contains("credential-material"));

        let repeated = prepare_webdav_setup(setup_request());
        assert!(repeated.ok);
        assert_eq!(repeated.registry_path_source, "env");
        assert!(repeated.credential_material_present);
        assert!(repeated.credential_input_received_this_save);
        assert!(!repeated.credential_material_updated_this_save);
        assert_eq!(
            repeated.descriptor_registry_ref_hash,
            result.descriptor_registry_ref_hash
        );
        assert_eq!(
            repeated.write_grade_registry_ref_hash,
            result.write_grade_registry_ref_hash
        );
        assert_eq!(repeated.credential_ref_hash, result.credential_ref_hash);

        let mut changed = setup_request();
        changed.credential_secret = Some("changed-non-production-credential-material".to_string());
        let changed_result = prepare_webdav_setup(changed);
        assert!(changed_result.ok);
        assert!(changed_result.credential_material_present);
        assert!(changed_result.credential_input_received_this_save);
        assert!(changed_result.credential_material_updated_this_save);
        assert_ne!(
            changed_result.descriptor_registry_ref_hash,
            result.descriptor_registry_ref_hash
        );
        assert_eq!(
            changed_result.write_grade_registry_ref_hash,
            result.write_grade_registry_ref_hash
        );
        assert_eq!(
            changed_result.credential_ref_hash,
            result.credential_ref_hash
        );

        let mut preserved = setup_request();
        preserved.credential_secret = None;
        let preserved_result = prepare_webdav_setup(preserved);
        assert!(preserved_result.ok);
        assert!(preserved_result.credential_material_present);
        assert!(!preserved_result.credential_input_received_this_save);
        assert!(!preserved_result.credential_material_updated_this_save);
        assert_eq!(
            preserved_result.descriptor_registry_ref_hash,
            changed_result.descriptor_registry_ref_hash
        );
        assert_eq!(
            preserved_result.write_grade_registry_ref_hash,
            changed_result.write_grade_registry_ref_hash
        );
        assert_eq!(
            preserved_result.credential_ref_hash,
            result.credential_ref_hash
        );

        let status = webdav_setup_status();
        let _ = fs::remove_file(registry_path);
        std::env::remove_var(DESCRIPTOR_REGISTRY_FILE_ENV);
        assert!(status.ok);
        assert_eq!(status.registry_path_source, "env");
        assert_eq!(
            status.saved_server_url.as_deref(),
            Some("https://nonproduction-webdav.local")
        );
        assert_eq!(
            status.saved_root_path.as_deref(),
            Some("/w3-readonly-root/")
        );
        assert_eq!(
            status.saved_credential_identifier.as_deref(),
            Some("operator-test-identity")
        );
        assert!(status.credential_material_present);
        assert!(!status.credential_input_received_this_save);
        assert!(!status.credential_material_updated_this_save);
        assert_eq!(
            status.descriptor_registry_ref_hash,
            changed_result.descriptor_registry_ref_hash
        );
        assert_eq!(
            status.write_grade_registry_ref_hash,
            changed_result.write_grade_registry_ref_hash
        );
        assert!(status.private_content_hash_available);
        assert!(!status.network_attempted);
        assert!(!status.writes_webdav);
        assert!(!status.product_sync_ready);
        assert!(!status.transport_ready);
    }

    #[test]
    fn first_write_default_refuses_without_network_or_write_flags() {
        let result = evaluate_first_write(None);
        assert!(!result.ok);
        assert_eq!(result.command, "h2o_rt_first_write");
        assert_eq!(
            result.reason,
            "real-transport-w3-write-grade-approval-missing"
        );
        assert!(!result.network_attempted);
        assert!(!result.loopback_attempted);
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn first_write_rejects_fixture_grade_receipt() {
        let mut request = first_write_request();
        request
            .write_grade_receipt
            .as_mut()
            .expect("receipt")
            .receipt_grade = Some("fixture".to_string());
        let result = evaluate_first_write_with_client(
            Some(request),
            &MockFirstWriteLoopbackClient::default(),
        );
        assert!(!result.ok);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-fixture-mock-grade-receipt-rejected"));
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
    }

    #[test]
    fn first_write_rejects_legacy_registry_source() {
        let mut request = first_write_request();
        request.registry_path_source = Some("default-private-legacy".to_string());
        request.write_grade_registry_eligible = Some(false);
        let result = evaluate_first_write_with_client(
            Some(request),
            &MockFirstWriteLoopbackClient::default(),
        );
        assert!(!result.ok);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-write-grade-registry-source-refused"));
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
    }

    #[test]
    fn first_write_rejects_token_hash_mismatch() {
        let mut request = first_write_request();
        request.one_shot_token = Some("wrong-token".to_string());
        let result = evaluate_first_write_with_client(
            Some(request),
            &MockFirstWriteLoopbackClient::default(),
        );
        assert!(!result.ok);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-one-shot-token-missing-or-mismatch"));
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
    }

    #[test]
    fn first_write_rejects_payload_too_large() {
        let mut request = first_write_request();
        request.payload = Some("x".repeat(257));
        let result = evaluate_first_write_with_client(
            Some(request),
            &MockFirstWriteLoopbackClient::default(),
        );
        assert!(!result.ok);
        assert!(result
            .blockers
            .contains(&"real-transport-w3-first-write-payload-too-large"));
        assert!(!result.network_attempted);
        assert!(!result.writes_webdav);
    }

    #[test]
    fn first_write_loopback_proves_create_only_sequence_without_network() {
        let request = first_write_request();
        let result = evaluate_first_write_with_client(
            Some(request.clone()),
            &MockFirstWriteLoopbackClient::default(),
        );
        assert!(result.ok);
        assert!(result.mock_only);
        assert!(result.gate_satisfied);
        assert!(!result.network_attempted);
        assert!(result.loopback_attempted);
        assert_eq!(result.create_only_behavior, "loopback-201-then-412");
        assert_eq!(
            result.method_statuses,
            vec![
                RtFirstWriteMethodStatus {
                    operation: "PROPFIND pre-write absence check",
                    status_code: 404,
                    status_family: "4xx",
                    loopback_only: true,
                },
                RtFirstWriteMethodStatus {
                    operation: "PUT create-only #1",
                    status_code: 201,
                    status_family: "2xx",
                    loopback_only: true,
                },
                RtFirstWriteMethodStatus {
                    operation: "PUT create-only #2",
                    status_code: 412,
                    status_family: "4xx",
                    loopback_only: true,
                },
                RtFirstWriteMethodStatus {
                    operation: "GET read-back",
                    status_code: 200,
                    status_family: "2xx",
                    loopback_only: true,
                },
            ]
        );
        assert_eq!(
            result.write_grade_registry_ref_hash,
            request.write_grade_registry_ref_hash
        );
        assert!(!result.writes_webdav);
        assert!(!result.enqueues_relay);
        assert!(!result.mints_export_id);
        assert!(!result.burns_sequence);
        assert!(!result.product_sync_ready);
        assert!(!result.transport_ready);
    }

    #[test]
    fn first_write_loopback_rejects_existing_target_redirect_auth_timeout_and_readback_mismatch() {
        let cases = [
            (
                MockFirstWriteLoopbackClient {
                    propfind: FirstWriteLoopbackResponse {
                        status: 207,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-target-exists",
            ),
            (
                MockFirstWriteLoopbackClient {
                    first_put: FirstWriteLoopbackResponse {
                        status: 302,
                        redirected: true,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-redirect-refused",
            ),
            (
                MockFirstWriteLoopbackClient {
                    first_put: FirstWriteLoopbackResponse {
                        status: 401,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-auth-refused",
            ),
            (
                MockFirstWriteLoopbackClient {
                    first_put: FirstWriteLoopbackResponse {
                        status: 0,
                        timeout_after_send: true,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-remote-write-uncertain",
            ),
            (
                MockFirstWriteLoopbackClient {
                    second_put: FirstWriteLoopbackResponse {
                        status: 201,
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-create-only-not-enforced",
            ),
            (
                MockFirstWriteLoopbackClient {
                    readback: FirstWriteLoopbackResponse {
                        status: 200,
                        body: b"wrong-redacted-loopback-body".to_vec(),
                        ..Default::default()
                    },
                    ..Default::default()
                },
                "real-transport-w3-first-write-readback-hash-mismatch",
            ),
        ];
        for (client, blocker) in cases {
            let result = evaluate_first_write_with_client(Some(first_write_request()), &client);
            assert!(!result.ok, "{blocker}");
            assert!(result.blockers.contains(&blocker), "{blocker}");
            assert!(!result.network_attempted);
            assert!(result.loopback_attempted);
            assert!(!result.writes_webdav);
            assert!(!result.product_sync_ready);
            assert!(!result.transport_ready);
        }
    }
}
