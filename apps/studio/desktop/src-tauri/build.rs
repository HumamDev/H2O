use std::env;
use std::path::Path;
use std::process::Command;

fn git_output(repo: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_success(repo: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let repo = Path::new(&manifest_dir);
    let git_sha = git_output(repo, &["rev-parse", "HEAD"]).unwrap_or_else(|| "unknown".into());
    let git_dirty = git_output(repo, &["status", "--porcelain", "--untracked-files=all"])
        .map(|status| !status.is_empty())
        .unwrap_or(true);
    let profile = env::var("PROFILE").unwrap_or_else(|_| "unknown".into());
    let parent_propfind_fix_present = git_success(
        repo,
        &[
            "merge-base",
            "--is-ancestor",
            "305ff023ad12f14b6a9b505dab4123cf44c7cfba",
            "HEAD",
        ],
    );
    let r5a_binding_fix_present = git_success(
        repo,
        &[
            "merge-base",
            "--is-ancestor",
            "a0695eac1b3f11d7617a4a080c54d0b82663d478",
            "HEAD",
        ],
    );

    println!("cargo:rustc-env=H2O_BUILD_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=H2O_BUILD_PROFILE={profile}");
    println!("cargo:rustc-env=H2O_BUILD_DIRTY={git_dirty}");
    println!("cargo:rustc-env=H2O_PARENT_PROPFIND_FIX_PRESENT={parent_propfind_fix_present}");
    println!("cargo:rustc-env=H2O_R5A_BINDING_FIX_PRESENT={r5a_binding_fix_present}");

    tauri_build::build()
}
