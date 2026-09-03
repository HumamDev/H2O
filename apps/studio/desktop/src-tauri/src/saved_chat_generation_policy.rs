//! One immutable-per-build authority for the Saved-Chat generation family.
//!
//! M09 P2.1 deliberately exposes only a read-only query. The policy has no
//! database representation, environment override, mutation command, or
//! per-chat value. Later publisher, scanner, retention, and renderer-routing
//! work must consume this authority instead of introducing parallel booleans.

#[cfg(all(feature = "saved-chat-v3-acceptance", not(debug_assertions)))]
compile_error!(
    "saved-chat-v3-acceptance is a debug-only validation seam and cannot produce a release artifact"
);

pub const SAVED_CHAT_GENERATION_POLICY_SCHEMA: &str = "h2o.studio.saved-chat-generation-policy.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LiveGenerationFamily {
    #[serde(rename = "v1v2")]
    V1V2,
    V3,
}

impl LiveGenerationFamily {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::V1V2 => "v1v2",
            Self::V3 => "v3",
        }
    }
}

/// The sole production build selection point. HDA-authorized ordinary/default
/// builds publish v3. The guarded P3 acceptance feature selects the same
/// generation family while separately selecting its disposable export root;
/// the compile-time guard above keeps that harness out of release builds.
#[cfg(not(feature = "saved-chat-v3-acceptance"))]
pub const PRODUCTION_LIVE_GENERATION_FAMILY: LiveGenerationFamily = LiveGenerationFamily::V3;

#[cfg(feature = "saved-chat-v3-acceptance")]
pub const PRODUCTION_LIVE_GENERATION_FAMILY: LiveGenerationFamily = LiveGenerationFamily::V3;

pub const fn production_live_generation_family() -> LiveGenerationFamily {
    PRODUCTION_LIVE_GENERATION_FAMILY
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationPolicyResult {
    pub schema: &'static str,
    pub live_generation_family: LiveGenerationFamily,
}

pub const fn policy_for(family: LiveGenerationFamily) -> GenerationPolicyResult {
    GenerationPolicyResult {
        schema: SAVED_CHAT_GENERATION_POLICY_SCHEMA,
        live_generation_family: family,
    }
}

pub const fn production_policy() -> GenerationPolicyResult {
    policy_for(production_live_generation_family())
}

/// Read-only policy exposure for later renderer routing. There is intentionally
/// no paired setter and no managed mutable state.
#[tauri::command]
pub async fn h2o_saved_chat_generation_policy() -> GenerationPolicyResult {
    production_policy()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "saved-chat-v3-acceptance"))]
    #[test]
    fn hda_activated_production_policy_is_v3() {
        assert_eq!(
            production_live_generation_family(),
            LiveGenerationFamily::V3
        );
        assert_eq!(production_policy().live_generation_family.as_str(), "v3");
    }

    #[cfg(feature = "saved-chat-v3-acceptance")]
    #[test]
    fn guarded_debug_acceptance_policy_is_v3() {
        assert!(cfg!(debug_assertions));
        assert_eq!(
            production_live_generation_family(),
            LiveGenerationFamily::V3
        );
        assert_eq!(production_policy().live_generation_family.as_str(), "v3");
    }

    #[test]
    fn pure_policy_parameter_preserves_v1v2_rollback_without_mutable_state() {
        let injected = policy_for(LiveGenerationFamily::V1V2);
        assert_eq!(injected.schema, SAVED_CHAT_GENERATION_POLICY_SCHEMA);
        assert_eq!(injected.live_generation_family, LiveGenerationFamily::V1V2);
        assert_eq!(injected.live_generation_family.as_str(), "v1v2");
        assert_eq!(
            production_policy().live_generation_family,
            PRODUCTION_LIVE_GENERATION_FAMILY
        );

        use crate::archive_package_scan::ConstructionFamily;
        assert!(ConstructionFamily::V3.is_live_writer_family_for(LiveGenerationFamily::V3));
        assert!(!ConstructionFamily::V1.is_live_writer_family_for(LiveGenerationFamily::V3));
        assert!(ConstructionFamily::V1.is_live_writer_family_for(LiveGenerationFamily::V1V2));
        assert!(ConstructionFamily::V2.is_live_writer_family_for(LiveGenerationFamily::V1V2));
        assert_eq!(
            ConstructionFamily::V3.is_live_writer_family(),
            PRODUCTION_LIVE_GENERATION_FAMILY == LiveGenerationFamily::V3
        );
    }

    #[test]
    fn serialized_policy_is_stable_and_read_only_shaped() {
        let value = serde_json::to_value(production_policy()).expect("serialize policy");
        assert_eq!(
            value,
            serde_json::json!({
                "schema": "h2o.studio.saved-chat-generation-policy.v1",
                "liveGenerationFamily": PRODUCTION_LIVE_GENERATION_FAMILY.as_str()
            })
        );
    }

    #[test]
    fn read_only_command_has_debug_release_registration_parity_and_no_setter() {
        let lib = include_str!("lib.rs");
        assert_eq!(
            lib.matches("saved_chat_generation_policy::h2o_saved_chat_generation_policy")
                .count(),
            2,
            "one registration is required in each debug/release handler"
        );
        let source = include_str!("saved_chat_generation_policy.rs");
        let setter = ["set", "saved", "chat", "generation"].join("_");
        let environment = ["std", "env"].join("::");
        let mutex = ["Mu", "tex"].concat();
        assert!(!source.contains(&setter));
        assert!(!source.contains(&environment));
        assert!(!source.contains(&mutex));
    }
}
