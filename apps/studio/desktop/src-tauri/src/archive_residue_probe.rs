//! M06 T1.3 — trusted READ-ONLY durable-temp residue probe.
//!
//! The renderer can enumerate `archive/packages` (that is where the generation
//! publisher's `.h2o-genstage-*` staging lives), but it holds no `read-dir`
//! grant under `archive/assets`, where the durable CAS writer creates its
//! `.h2o-durable-*.tmp` artifacts inside the shard directory. Widening the
//! renderer to reach them would hand it directory authority over the CAS, so
//! the trusted side answers the question instead.
//!
//! Scope: this module is PURPOSE-shaped, not path-shaped. It takes no caller
//! path, derives its own root from the Tauri app-local-data authority, walks
//! exactly `archive/assets/<aa>/`, and returns names plus archive-relative
//! paths. It has NO remove, rename, truncate, write, mkdir, quarantine or
//! purge authority, and it creates nothing — not even the archive directory,
//! which is why it uses `open_existing_nofollow` rather than `open_root`.

use std::path::Path;

use crate::archive_durable_write::{confined, ARCHIVE_ROOT, CAS_DIR, TEMP_PREFIX, TEMP_SUFFIX};

/// The residue family this probe owns. The generation-staging family stays
/// with the JS inventory that can already see it.
pub const DURABLE_TEMP_KIND: &str = "durable-temp";

pub mod codes {
    /// The CAS root could not be opened, and it was not simply absent.
    pub const ASSETS_UNREADABLE: &str = "residue-probe-assets-unreadable";
    /// The CAS root listed, but one shard could not be walked.
    pub const SHARD_UNREADABLE: &str = "residue-probe-shard-unreadable";
    /// A shard-shaped name was not a real directory (symlink swap, or a file).
    pub const SHARD_NOT_A_DIRECTORY: &str = "residue-probe-shard-not-a-directory";
    /// A name could not be represented as text, so it cannot be reported.
    pub const NAME_UNREPRESENTABLE: &str = "residue-probe-name-unrepresentable";
    /// The app-local-data root is unavailable.
    pub const ROOT_UNAVAILABLE: &str = "residue-probe-root-unavailable";
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ResidueEntry {
    /// Archive-relative, e.g. `archive/assets/ab/.h2o-durable-1-0.tmp`.
    pub path: String,
    pub name: String,
    pub shard: String,
    pub kind: &'static str,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DurableTempResidue {
    /// True ONLY when every shard that had to be walked was walked. A consumer
    /// must not read `count: 0` as "no residue" unless this is true.
    pub complete: bool,
    /// Archive-relative root this probe covers.
    pub root: String,
    pub kind: &'static str,
    /// Always equal to `entries.len()` — derived, never tracked separately.
    pub count: usize,
    pub entries: Vec<ResidueEntry>,
    pub blockers: Vec<String>,
}

impl DurableTempResidue {
    fn new() -> Self {
        DurableTempResidue {
            complete: true,
            root: format!("{ARCHIVE_ROOT}/{CAS_DIR}"),
            kind: DURABLE_TEMP_KIND,
            count: 0,
            entries: vec![],
            blockers: vec![],
        }
    }

    fn fail(&mut self, code: &str) {
        self.complete = false;
        let code = code.to_string();
        if !self.blockers.contains(&code) {
            self.blockers.push(code);
        }
    }

    /// Deterministic order and a derived count. Called on EVERY return path.
    fn seal(mut self) -> Self {
        self.entries.sort_by(|a, b| a.path.cmp(&b.path));
        self.count = self.entries.len();
        self
    }
}

/// A canonical CAS shard is exactly two lowercase hex digits. Anything else is
/// not a shard, so it cannot hold CAS residue and is not walked.
fn is_shard_name(name: &[u8]) -> bool {
    name.len() == 2
        && name
            .iter()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// The established durable-temp family: `.h2o-durable-<...>.tmp`. A CAS blob is
/// `sha256-<hex>` and cannot match, so ordinary content is never residue.
fn is_durable_temp(name: &[u8]) -> bool {
    name.starts_with(TEMP_PREFIX.as_bytes()) && name.ends_with(TEMP_SUFFIX.as_bytes())
}

/// Walks `<archive_root>/assets/<aa>/` read-only and reports durable-temp
/// residue. Separated from the command so it is directly testable against a
/// disposable root.
pub fn probe_durable_temp_within(archive_root: &Path) -> DurableTempResidue {
    let mut out = DurableTempResidue::new();

    let assets_path = archive_root.join(CAS_DIR);
    let assets = match confined::Dir::open_existing_nofollow(&assets_path) {
        Ok(dir) => dir,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            // No CAS directory at all: an absence this probe genuinely proved,
            // so zero here IS authoritative.
            return out.seal();
        }
        Err(_) => {
            out.fail(codes::ASSETS_UNREADABLE);
            return out.seal();
        }
    };

    let shards = match assets.read_entry_names() {
        Ok(names) => names,
        Err(_) => {
            out.fail(codes::ASSETS_UNREADABLE);
            return out.seal();
        }
    };

    for shard in shards {
        // Not shard-shaped: cannot be a CAS shard, so it holds no CAS residue.
        // Classified as unrelated, NOT as garbage and NOT as an error.
        if !is_shard_name(&shard) {
            continue;
        }
        let Ok(shard_text) = std::str::from_utf8(&shard).map(str::to_string) else {
            out.fail(codes::NAME_UNREPRESENTABLE);
            continue;
        };

        let dir = match assets.open_child_nofollow(&shard) {
            Ok(dir) => dir,
            Err(err) => {
                match err.raw_os_error() {
                    // Raced away between listing and opening: nothing there to
                    // report, and nothing was skipped.
                    _ if err.kind() == std::io::ErrorKind::NotFound => {}
                    // A symlink or non-directory standing where a shard should
                    // be. O_NOFOLLOW refused to traverse it, so this probe did
                    // NOT look inside — that is an incomplete walk, not a zero.
                    Some(libc::ELOOP) | Some(libc::ENOTDIR) => {
                        out.fail(codes::SHARD_NOT_A_DIRECTORY)
                    }
                    _ => out.fail(codes::SHARD_UNREADABLE),
                }
                continue;
            }
        };

        let names = match dir.read_entry_names() {
            Ok(names) => names,
            Err(_) => {
                out.fail(codes::SHARD_UNREADABLE);
                continue;
            }
        };
        for name in names {
            if !is_durable_temp(&name) {
                continue;
            }
            let Ok(name_text) = std::str::from_utf8(&name).map(str::to_string) else {
                out.fail(codes::NAME_UNREPRESENTABLE);
                continue;
            };
            out.entries.push(ResidueEntry {
                path: format!("{ARCHIVE_ROOT}/{CAS_DIR}/{shard_text}/{name_text}"),
                name: name_text,
                shard: shard_text.clone(),
                kind: DURABLE_TEMP_KIND,
            });
        }
    }

    out.seal()
}

/// Read-only diagnostics command. Takes NO caller-supplied path: the only
/// input is the app handle, so there is structurally no way to point it at an
/// arbitrary location. Registering it is safe before G02 because it is
/// non-destructive — it cannot remove, rename or write anything.
#[tauri::command]
pub async fn h2o_archive_durable_temp_residue(
    app: tauri::AppHandle,
) -> Result<DurableTempResidue, String> {
    let root = crate::archive_durable_write::archive_root(&app)
        .map_err(|_| codes::ROOT_UNAVAILABLE.to_string())?;
    Ok(probe_durable_temp_within(&root))
}

#[cfg(test)]
mod tests;
