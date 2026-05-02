// Identity release-gate runner.
// Orchestrates existing build, validation, and syntax-check commands only.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NODE = process.execPath;

const GROUPS = [
  {
    title: "Builds",
    commands: [
      {
        label: "default controls build",
        args: ["tools/product/extension/build-chrome-live-extension.mjs"],
      },
      {
        label: "lean build",
        args: ["tools/product/extension/build-chrome-live-extension.mjs"],
        env: {
          H2O_EXT_DEV_VARIANT: "lean",
          H2O_EXT_OUT_DIR: "build/chrome-ext-dev-lean",
        },
      },
      {
        label: "production build",
        args: ["tools/product/extension/build-chrome-live-extension.mjs"],
        env: {
          H2O_EXT_DEV_VARIANT: "production",
          H2O_EXT_OUT_DIR: "build/chrome-ext-prod",
        },
      },
      {
        label: "armed request_otp controls build",
        args: ["tools/product/extension/build-chrome-live-extension.mjs"],
        env: {
          H2O_IDENTITY_PHASE_NETWORK: "request_otp",
          H2O_EXT_OUT_DIR: "build/chrome-ext-dev-controls-armed",
        },
      },
      {
        label: "Google OAuth armed request_otp controls build",
        args: ["tools/product/extension/build-chrome-live-extension.mjs"],
        env: {
          H2O_IDENTITY_PHASE_NETWORK: "request_otp",
          H2O_IDENTITY_OAUTH_PROVIDER: "google",
          H2O_EXT_OUT_DIR: "build/chrome-ext-dev-controls-oauth-google",
        },
      },
      {
        label: "ops panel build",
        args: ["tools/dev-controls/ops-panel/make-chrome-ops-panel-extension.mjs"],
      },
    ],
  },
  {
    title: "Validators",
    commands: [
      { label: "background bundle validator", args: ["tools/validation/identity/validate-identity-background-bundle.mjs"] },
      { label: "Phase 3.0Q validator", args: ["tools/validation/identity/validate-identity-phase3_0q.mjs"] },
      { label: "Phase 3.2B schema validator", args: ["tools/validation/identity/validate-identity-phase3_2b-schema.mjs"] },
      { label: "Phase 3.2C live RLS validator", args: ["tools/validation/identity/validate-identity-phase3_2c-rls-live.mjs"] },
      { label: "Phase 3.3A UI validator", args: ["tools/validation/identity/validate-identity-phase3_3a-ui.mjs"] },
      { label: "Phase 3.3B UI validator", args: ["tools/validation/identity/validate-identity-phase3_3b-ui.mjs"] },
      { label: "Phase 3.3C UI edge-case validator", args: ["tools/validation/identity/validate-identity-phase3_3c-ui-edge-cases.mjs"] },
      { label: "Phase 3.4C session UX validator", args: ["tools/validation/identity/validate-identity-phase3_4c-session-ux.mjs"] },
      { label: "Phase 3.4D baseline validator", args: ["tools/validation/identity/validate-identity-phase3_4d-baseline.mjs"] },
      { label: "Phase 3.5A persistence review validator", args: ["tools/validation/identity/validate-identity-phase3_5a-persistence-review.mjs"] },
      { label: "Phase 3.5B release-gate validator", args: ["tools/validation/identity/validate-identity-phase3_5b-release-gate.mjs"] },
      { label: "Phase 3.7A persistent sign-in validator", args: ["tools/validation/identity/validate-identity-phase3_7a-persistent-signin.mjs"] },
      { label: "Phase 3.7B production polish validator", args: ["tools/validation/identity/validate-identity-phase3_7b-production-polish.mjs"] },
      { label: "Phase 3.8A password auth validator", args: ["tools/validation/identity/validate-identity-phase3_8a-password-auth.mjs"] },
      { label: "Phase 3.8B auth UX separation validator", args: ["tools/validation/identity/validate-identity-phase3_8b-auth-ux-separation.mjs"] },
      { label: "Phase 3.8C account verification validator", args: ["tools/validation/identity/validate-identity-phase3_8c-account-verification.mjs"] },
      { label: "Phase 3.8D email-code recovery validator", args: ["tools/validation/identity/validate-identity-phase3_8d-email-code-recovery.mjs"] },
      { label: "Phase 3.8E password integrity validator", args: ["tools/validation/identity/validate-identity-phase3_8e-password-integrity.mjs"] },
      { label: "Phase 3.8F password auth release-gate validator", args: ["tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs"] },
      { label: "Phase 3.9B Google OAuth validator", args: ["tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs"] },
      { label: "Phase 3.9C Google OAuth release-gate validator", args: ["tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs"] },
      { label: "Phase 4.0B account/security MVP validator", args: ["tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs"] },
      { label: "onboarding-open validator", args: ["tools/validation/onboarding/validate-onboarding-open.mjs"] },
      { label: "Phase 2.9 validator", args: ["tools/validation/identity/validate-identity-phase2_9.mjs"] },
      { label: "Phase 2.9 sync validator", args: ["tools/validation/identity/validate-identity-phase2_9-sync.mjs"] },
    ],
  },
  {
    title: "Syntax Checks",
    commands: [
      { label: "release runner syntax", args: ["--check", "tools/validation/identity/run-identity-release-gate.mjs"] },
      { label: "3.5B validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_5b-release-gate.mjs"] },
      { label: "3.7A validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_7a-persistent-signin.mjs"] },
      { label: "3.7B validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_7b-production-polish.mjs"] },
      { label: "3.8A validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8a-password-auth.mjs"] },
      { label: "3.8B validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8b-auth-ux-separation.mjs"] },
      { label: "3.8C validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8c-account-verification.mjs"] },
      { label: "3.8D validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8d-email-code-recovery.mjs"] },
      { label: "3.8E validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8e-password-integrity.mjs"] },
      { label: "3.8F validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_8f-password-auth-release-gate.mjs"] },
      { label: "3.9B validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_9b-google-oauth.mjs"] },
      { label: "3.9C validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase3_9c-google-oauth-release-gate.mjs"] },
      { label: "4.0B validator syntax", args: ["--check", "tools/validation/identity/validate-identity-phase4_0b-account-security-mvp.mjs"] },
      { label: "Control Hub Account plugin syntax", args: ["--check", "scripts/0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐.js"] },
      { label: "controls bg syntax", args: ["--check", "build/chrome-ext-dev-controls/bg.js"] },
      { label: "controls loader syntax", args: ["--check", "build/chrome-ext-dev-controls/loader.js"] },
      { label: "controls popup syntax", args: ["--check", "build/chrome-ext-dev-controls/popup.js"] },
      { label: "controls provider syntax", args: ["--check", "build/chrome-ext-dev-controls/provider/identity-provider-supabase.js"] },
      { label: "lean bg syntax", args: ["--check", "build/chrome-ext-dev-lean/bg.js"] },
      { label: "lean loader syntax", args: ["--check", "build/chrome-ext-dev-lean/loader.js"] },
      { label: "lean provider syntax", args: ["--check", "build/chrome-ext-dev-lean/provider/identity-provider-supabase.js"] },
      { label: "production bg syntax", args: ["--check", "build/chrome-ext-prod/bg.js"] },
      { label: "production loader syntax", args: ["--check", "build/chrome-ext-prod/loader.js"] },
      { label: "production provider syntax", args: ["--check", "build/chrome-ext-prod/provider/identity-provider-supabase.js"] },
      { label: "armed bg syntax", args: ["--check", "build/chrome-ext-dev-controls-armed/bg.js"] },
      { label: "armed loader syntax", args: ["--check", "build/chrome-ext-dev-controls-armed/loader.js"] },
      { label: "armed popup syntax", args: ["--check", "build/chrome-ext-dev-controls-armed/popup.js"] },
      { label: "armed provider syntax", args: ["--check", "build/chrome-ext-dev-controls-armed/provider/identity-provider-supabase.js"] },
      { label: "Google OAuth armed bg syntax", args: ["--check", "build/chrome-ext-dev-controls-oauth-google/bg.js"] },
      { label: "Google OAuth armed loader syntax", args: ["--check", "build/chrome-ext-dev-controls-oauth-google/loader.js"] },
      { label: "Google OAuth armed popup syntax", args: ["--check", "build/chrome-ext-dev-controls-oauth-google/popup.js"] },
      { label: "Google OAuth armed provider syntax", args: ["--check", "build/chrome-ext-dev-controls-oauth-google/provider/identity-provider-supabase.js"] },
      { label: "ops panel syntax", args: ["--check", "build/chrome-ext-ops-panel/panel.js"] },
    ],
  },
];

function commandText(command) {
  const envText = command.env
    ? Object.entries(command.env).map(([key, value]) => `${key}=${value}`).join(" ") + " "
    : "";
  return `${envText}node ${command.args.join(" ")}`;
}

function runCommand(command) {
  console.log(`\n[H2O Identity] ${command.label}`);
  console.log(`[H2O Identity] $ ${commandText(command)}`);
  const result = spawnSync(NODE, command.args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...(command.env || {}),
    },
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`[H2O Identity] ${command.label} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[H2O Identity] ${command.label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log("\n== H2O Identity release gate =====================================");
console.log("[H2O Identity] Running existing build, validator, and syntax checks.");
console.log("[H2O Identity] Live RLS keeps its own skip-by-default behavior.\n");

for (const group of GROUPS) {
  console.log(`\n-- ${group.title} ------------------------------------------------`);
  for (const command of group.commands) runCommand(command);
}

console.log("\nH2O Identity release gate PASSED");
