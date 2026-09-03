//! Immutable Saved-Chat export-root policy.
//!
//! Ordinary builds retain the historical `$HOME/H2O Studio Exports` root.
//! The non-default, debug-only M09 P3 acceptance artifact instead uses its
//! identifier-scoped AppLocalData directory. The renderer can query this
//! policy, but no command or request can select or mutate it.

use std::path::{Path, PathBuf};

pub const SAVED_CHAT_EXPORT_ROOT_POLICY_SCHEMA: &str =
    "h2o.studio.saved-chat-export-root-policy.v1";
pub const EXPORT_ROOT_COMPONENT: &str = "H2O Studio Exports";
pub const ZIP_STAGING_ROOT_COMPONENT: &str = ".H2O Studio Saved Chat ZIP Staging";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SavedChatExportRoot {
    Home,
    AppLocalDataAcceptance,
}

impl SavedChatExportRoot {
    pub const fn base_directory(self) -> &'static str {
        match self {
            Self::Home => "home",
            Self::AppLocalDataAcceptance => "appLocalData",
        }
    }
}

#[cfg(not(feature = "saved-chat-v3-acceptance"))]
pub const PRODUCTION_SAVED_CHAT_EXPORT_ROOT: SavedChatExportRoot = SavedChatExportRoot::Home;

#[cfg(feature = "saved-chat-v3-acceptance")]
pub const PRODUCTION_SAVED_CHAT_EXPORT_ROOT: SavedChatExportRoot =
    SavedChatExportRoot::AppLocalDataAcceptance;

pub const fn production_saved_chat_export_root() -> SavedChatExportRoot {
    PRODUCTION_SAVED_CHAT_EXPORT_ROOT
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SavedChatExportRoots {
    pub final_root: PathBuf,
    pub zip_staging_root: PathBuf,
}

fn roots_from_base(base: &Path) -> SavedChatExportRoots {
    SavedChatExportRoots {
        final_root: base.join(EXPORT_ROOT_COMPONENT),
        zip_staging_root: base.join(ZIP_STAGING_ROOT_COMPONENT),
    }
}

#[cfg(test)]
fn roots_for(
    mode: SavedChatExportRoot,
    home: &Path,
    app_local_data: &Path,
) -> SavedChatExportRoots {
    roots_from_base(match mode {
        SavedChatExportRoot::Home => home,
        SavedChatExportRoot::AppLocalDataAcceptance => app_local_data,
    })
}

pub fn production_roots(app: &tauri::AppHandle) -> Result<SavedChatExportRoots, &'static str> {
    use tauri::Manager;

    let base = match production_saved_chat_export_root() {
        SavedChatExportRoot::Home => app.path().home_dir(),
        SavedChatExportRoot::AppLocalDataAcceptance => app.path().app_local_data_dir(),
    }
    .map_err(|_| "export-root-unavailable")?;
    Ok(roots_from_base(&base))
}

#[derive(Clone, Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedChatExportRootPolicyResult {
    schema: &'static str,
    base_directory: &'static str,
}

pub const fn production_policy() -> SavedChatExportRootPolicyResult {
    SavedChatExportRootPolicyResult {
        schema: SAVED_CHAT_EXPORT_ROOT_POLICY_SCHEMA,
        base_directory: PRODUCTION_SAVED_CHAT_EXPORT_ROOT.base_directory(),
    }
}

#[tauri::command]
pub async fn h2o_saved_chat_export_root_policy() -> SavedChatExportRootPolicyResult {
    production_policy()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(feature = "saved-chat-v3-acceptance"))]
    #[test]
    fn default_build_retains_home_export_root() {
        assert_eq!(
            production_saved_chat_export_root(),
            SavedChatExportRoot::Home
        );
        assert_eq!(production_policy().base_directory, "home");
    }

    #[cfg(feature = "saved-chat-v3-acceptance")]
    #[test]
    fn debug_acceptance_build_uses_app_local_data_export_root() {
        assert!(cfg!(debug_assertions));
        assert_eq!(
            production_saved_chat_export_root(),
            SavedChatExportRoot::AppLocalDataAcceptance
        );
        assert_eq!(production_policy().base_directory, "appLocalData");
    }

    #[test]
    fn root_mapping_is_bounded_and_shared_by_folder_and_zip_publication() {
        let home = Path::new("/governed/home");
        let app_local = Path::new("/governed/app-local/org.h2o.acceptance");

        let normal = roots_for(SavedChatExportRoot::Home, home, app_local);
        assert_eq!(normal.final_root, home.join(EXPORT_ROOT_COMPONENT));
        assert_eq!(
            normal.zip_staging_root,
            home.join(ZIP_STAGING_ROOT_COMPONENT)
        );

        let acceptance = roots_for(SavedChatExportRoot::AppLocalDataAcceptance, home, app_local);
        assert_eq!(acceptance.final_root, app_local.join(EXPORT_ROOT_COMPONENT));
        assert_eq!(
            acceptance.zip_staging_root,
            app_local.join(ZIP_STAGING_ROOT_COMPONENT)
        );
    }

    #[test]
    fn wire_contract_exposes_only_schema_and_governed_base_directory() {
        let value = serde_json::to_value(production_policy()).unwrap();
        assert_eq!(value.as_object().unwrap().len(), 2);
        assert_eq!(value["schema"], SAVED_CHAT_EXPORT_ROOT_POLICY_SCHEMA);
        assert_eq!(
            value["baseDirectory"],
            PRODUCTION_SAVED_CHAT_EXPORT_ROOT.base_directory()
        );
    }

    #[test]
    fn read_only_command_has_debug_release_registration_parity_and_no_setter() {
        let lib = include_str!("lib.rs");
        assert_eq!(
            lib.matches("saved_chat_export_root_policy::h2o_saved_chat_export_root_policy")
                .count(),
            2,
            "one registration is required in each debug/release handler"
        );
        let source = include_str!("saved_chat_export_root_policy.rs");
        let setter = ["set", "saved", "chat", "export", "root"].join("_");
        let environment = ["std", "env"].join("::");
        let mutex = ["Mu", "tex"].concat();
        assert!(!source.contains(&setter));
        assert!(!source.contains(&environment));
        assert!(!source.contains(&mutex));
    }
}
