// @version 1.1.0  (Phase 0G-2 migration: ASSETS_DIR imported from tools/paths.mjs)
//
// Phase 0G-2 note: DEV_CONTROLS_ICONS_DIR and DEV_LEAN_ICONS_DIR now derive
// from paths.ASSETS_DIR instead of `path.join(SRC, "assets", ...)`. Under the
// standard invocation (no env override), the resolved paths are byte-identical
// to pre-Phase-0G-2. SCRIPT_DIR (used as a fallback icon-search root in
// resolvePanelIconSourceDir) is intentionally kept script-relative — it is a
// heuristic that benefits from anchoring to this file's location, not to a
// centralized constant. IDENTITY_PROVIDER_LOCAL_CONFIG_REL is also left as a
// relative-path string because it is intentionally joined with SRC at call
// time, not a global path constant.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ASSETS_DIR } from "../../../../paths.mjs";

import {
  syncArchiveWorkbenchToOut,
  removeArchiveWorkbenchFromOut,
} from "../../../studio/pack-studio.mjs";
import {
  syncIdentitySurfaceToOut,
  IDENTITY_WEB_ACCESSIBLE_ENTRY,
} from "../../../identity/pack-identity.mjs";
import {
  applyExtensionIconsToManifest,
  writeExtensionIcons,
} from "./write-extension-icons.mjs";
import { createChromeLiveBuildContext } from "./chrome-live-build-context.mjs";
import { createChromeLiveSourceSnapshots } from "./chrome-live-source-snapshots.mjs";
import { makeChromeLiveManifest } from "./chrome-live-manifest.mjs";
import {
  getExtensionKey,
  deriveVariantFromOutDir,
} from "./chrome-extension-keys.mjs";
import { makeChromeLiveFolderBridgePageJs } from "./chrome-live-folder-bridge.mjs";
import { makeChromeLivePilotObserverJs } from "./chrome-live-pilot-observer.mjs";
import { makeChromeLiveBackgroundJs } from "./chrome-live-background.mjs";
import {
  buildIdentityProviderBundle,
  IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH,
} from "../../../identity/build-identity-provider-bundle.mjs";
import { makeChromeLiveLoaderJs } from "./chrome-live-loader.mjs";
import { makeChromeLivePopupHtml } from "./popup/chrome-live-popup-html.mjs";
import { makeChromeLivePopupCss } from "./popup/chrome-live-popup-css.mjs";
import { makeChromeLivePopupJs } from "./popup/chrome-live-popup-js.mjs";
import { makeChromeLiveReadme } from "./chrome-live-readme.mjs";
// @version 1.3.0

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PANEL_ICON_DIR_CANDIDATES = [
  ["assets", "internal-dev-controls-icons"],
  ["internal-dev-controls-icons"],
];
const PANEL_ICON_SOURCE_FILE = "icon128.png";
const PANEL_ICON_OUTPUT_DIR = "panel-icons";
const PANEL_ICON_OUTPUT_FILE = "icon128.png";
const IDENTITY_PROVIDER_LOCAL_CONFIG_REL = path.join("config", "local", "identity-provider.local.json");
const IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH = "provider/identity-provider-private-config.js";
const IDENTITY_PROVIDER_PRIVATE_CONFIG_GLOBAL = "H2O_IDENTITY_PROVIDER_PRIVATE_CONFIG";
const IDENTITY_PROVIDER_CONFIG_SCHEMA_VERSION = "3.0N";
const IDENTITY_PROVIDER_MISSING_CODE = "identity/config-missing-required";
const IDENTITY_PROVIDER_ELEVATED_CODE = "identity/config-elevated-access-forbidden";
const IDENTITY_PROVIDER_EXACT_SUPABASE_HOST_RE = /^[a-z0-9-]+\.supabase\.co$/;
const IDENTITY_PROVIDER_PHASE_NETWORK_REQUEST_OTP = "request_otp";
const IDENTITY_PROVIDER_OAUTH_GOOGLE = "google";

const {
  SRC,
  OUT_DIR,
  PROXY_PACK_URL,
  CHAT_MATCH,
  STORAGE_KEY,
  STORAGE_ORDER_OVERRIDES_KEY,
  DEV_VARIANT,
  DEV_HAS_CONTROLS,
  STUDIO_ONLY,
  MANIFEST_PROFILE,
  DEV_VERSION,
  DEV_TITLE,
  DEV_ACTION_TITLE,
  DEV_NAME,
  DEV_DESCRIPTION,
  DEV_TAG,
  DEV_ORDER_FILE,
  PAGE_FOLDER_BRIDGE_FILE,
  PAGE_PILOT_OBSERVER_FILE,
} = createChromeLiveBuildContext();
// Phase 0G-2: ASSETS_DIR comes from paths.mjs (= <REPO_ROOT>/assets). Both
// constants resolve byte-identical to the pre-Phase-0G-2 `path.join(SRC,
// "assets", ...)` form under the standard invocation.
const DEV_CONTROLS_ICONS_DIR = path.join(ASSETS_DIR, "chrome-dev-controls-icons");
const DEV_LEAN_ICONS_DIR = path.join(ASSETS_DIR, "chrome-dev-lean-icons");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeTextFileAtomic(fp, txt) {
  const target = path.resolve(fp);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(temp, String(txt), "utf8");
  fs.renameSync(temp, target);
}

function copyFileAtomic(sourceFile, outFile) {
  const target = path.resolve(outFile);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.copyFileSync(sourceFile, temp);
  fs.renameSync(temp, target);
}

const {
  DEV_ORDER_SECTIONS_SNAPSHOT,
  DEV_ALIAS_FILENAME_MAP,
  DEV_SCRIPT_CATALOG,
  LOADER_DEPS_SNAPSHOT,
} = createChromeLiveSourceSnapshots({
  srcRoot: SRC,
  orderFile: DEV_ORDER_FILE,
});

function writeFile(fp, txt) {
  writeTextFileAtomic(fp, txt);
}

function fileExists(fp) {
  try {
    fs.accessSync(fp, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map((value) => path.resolve(value)))];
}

function resolvePanelIconSourceDir() {
  const roots = uniquePaths([SRC, path.resolve(SRC, ".."), SCRIPT_DIR, process.cwd()]);
  for (const root of roots) {
    for (const parts of PANEL_ICON_DIR_CANDIDATES) {
      const candidate = path.join(root, ...parts);
      if (fileExists(path.join(candidate, PANEL_ICON_SOURCE_FILE))) {
        return candidate;
      }
    }
  }
  return null;
}

function copyPanelIconAsset(outDir) {
  const sourceDir = resolvePanelIconSourceDir();
  if (!sourceDir) {
    throw new Error(
      `[H2O] Missing panel icon pack. Expected ${PANEL_ICON_SOURCE_FILE} in assets/internal-dev-controls-icons.`,
    );
  }

  const outSubdir = path.join(outDir, PANEL_ICON_OUTPUT_DIR);
  const sourceFile = path.join(sourceDir, PANEL_ICON_SOURCE_FILE);
  const outFile = path.join(outSubdir, PANEL_ICON_OUTPUT_FILE);
  ensureDir(outSubdir);
  copyFileAtomic(sourceFile, outFile);
  return `${PANEL_ICON_OUTPUT_DIR}/${PANEL_ICON_OUTPUT_FILE}`;
}

function cleanIdentityProviderStatusList(items) {
  return Array.isArray(items)
    ? items.map((item) => String(item || "").replace(/[^a-z0-9_/-]/gi, "").slice(0, 96)).filter(Boolean)
    : [];
}

function hasIdentityProviderValue(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function cleanIdentityProviderValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUsableIdentityProviderProjectUrl(value) {
  const text = cleanIdentityProviderValue(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveIdentityProviderExactOptionalHostPattern(projectUrl) {
  const text = cleanIdentityProviderValue(projectUrl);
  if (!text || text.includes("*")) return null;
  try {
    const parsed = new URL(text);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    if (!IDENTITY_PROVIDER_EXACT_SUPABASE_HOST_RE.test(host)) return null;
    return `https://${host}/*`;
  } catch {
    return null;
  }
}

function resolveIdentityProviderOAuthProvider() {
  const value = String(process.env.H2O_IDENTITY_OAUTH_PROVIDER || "").trim().toLowerCase();
  if (!value) return null;
  if (value !== IDENTITY_PROVIDER_OAUTH_GOOGLE) {
    throw new Error(`[H2O] Unsupported H2O_IDENTITY_OAUTH_PROVIDER value: ${value}`);
  }
  return value;
}

function makeRedactedIdentityProviderStatus({ configSource, hasProviderProject, hasPublicClient, elevated, readFailed, oauthProvider = null }) {
  const missingFields = [];
  if (!hasProviderProject) missingFields.push("provider_project");
  if (!hasPublicClient) missingFields.push("public_client");
  const errorCodes = [];
  if (missingFields.length) errorCodes.push(IDENTITY_PROVIDER_MISSING_CODE);
  if (elevated) errorCodes.push(IDENTITY_PROVIDER_ELEVATED_CODE);
  if (readFailed) errorCodes.push("identity/config-read-failed");
  const valid = errorCodes.length === 0 && missingFields.length === 0;
  return {
    schemaVersion: IDENTITY_PROVIDER_CONFIG_SCHEMA_VERSION,
    providerKind: "supabase",
    providerMode: "provider_backed",
    providerConfigured: valid,
    configSource,
    valid,
    validationState: valid ? "valid" : (elevated || readFailed ? "rejected" : "missing_config"),
    missingFields: cleanIdentityProviderStatusList(missingFields),
    errorCodes: cleanIdentityProviderStatusList(errorCodes),
    capabilities: {
      emailOtp: true,
      magicLink: false,
      oauth: valid && oauthProvider === IDENTITY_PROVIDER_OAUTH_GOOGLE,
      oauthProviders: valid && oauthProvider === IDENTITY_PROVIDER_OAUTH_GOOGLE ? ["google"] : [],
    },
  };
}

function makeIdentityProviderBuildConfig({ configSource, providerProject, publicClient, elevated, readFailed, oauthProvider = null }) {
  const projectUrl = cleanIdentityProviderValue(providerProject);
  const publicClientValue = cleanIdentityProviderValue(publicClient);
  const hasProviderProject = isUsableIdentityProviderProjectUrl(projectUrl);
  const hasPublicClient = hasIdentityProviderValue(publicClientValue);
  const status = makeRedactedIdentityProviderStatus({
    configSource,
    hasProviderProject,
    hasPublicClient,
    elevated,
    readFailed,
    oauthProvider,
  });
  return {
    status,
    optionalHostPattern: status.valid === true
      ? resolveIdentityProviderExactOptionalHostPattern(projectUrl)
      : null,
    privateConfig: status.valid === true
      ? {
          phase: "3.0Y",
          kind: "identity-provider-private-config",
          providerKind: "supabase",
          configSource,
          projectUrl,
          publicClient: publicClientValue,
        }
      : null,
  };
}

function resolveIdentityProviderEnvConfig() {
  const oauthProvider = resolveIdentityProviderOAuthProvider();
  const providerKind = String(process.env.H2O_IDENTITY_PROVIDER_KIND || "").trim().toLowerCase();
  const providerProject = cleanIdentityProviderValue(process.env.H2O_IDENTITY_PROVIDER_PROJECT_URL);
  const publicClient = cleanIdentityProviderValue(process.env.H2O_IDENTITY_PROVIDER_PUBLIC_CLIENT);
  if (providerKind !== "supabase" && !hasIdentityProviderValue(providerProject) && !hasIdentityProviderValue(publicClient)) return null;
  return makeIdentityProviderBuildConfig({
    configSource: "dev_env",
    providerProject,
    publicClient,
    elevated: false,
    readFailed: false,
    oauthProvider,
  });
}

function resolveIdentityProviderEnvStatus() {
  return resolveIdentityProviderEnvConfig()?.status || null;
}

function readIdentityProviderLocalJsonConfig() {
  const oauthProvider = resolveIdentityProviderOAuthProvider();
  const localFile = path.join(SRC, IDENTITY_PROVIDER_LOCAL_CONFIG_REL);
  if (!fileExists(localFile)) return null;
  try {
    const raw = fs.readFileSync(localFile, "utf8");
    const parsed = JSON.parse(raw);
    const cfg = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const keys = Object.keys(cfg);
    const elevated = keys.some((key) => /service|secret|token|credential|password|private|admin|elevated/i.test(key))
      || ["server_side", "admin_client", "privileged_access"].includes(String(cfg.accessClass || "").trim().toLowerCase());
    return makeIdentityProviderBuildConfig({
      configSource: "dev_local_file",
      providerProject: cfg.providerProject || cfg.provider_project || cfg.projectUrl || cfg.project_url,
      publicClient: cfg.publicClient || cfg.public_client,
      elevated,
      readFailed: false,
      oauthProvider,
    });
  } catch {
    return {
      status: makeRedactedIdentityProviderStatus({
        configSource: "dev_local_file",
        hasProviderProject: false,
        hasPublicClient: false,
        elevated: false,
        readFailed: true,
        oauthProvider,
      }),
      privateConfig: null,
    };
  }
}

function readIdentityProviderLocalJsonStatus() {
  return readIdentityProviderLocalJsonConfig()?.status || null;
}

function resolveIdentityProviderBuildConfigRaw() {
  return resolveIdentityProviderEnvConfig() || readIdentityProviderLocalJsonConfig();
}

function resolveIdentityProviderBuildConfig() {
  if (MANIFEST_PROFILE === "production") {
    return { status: null, privateConfig: null };
  }
  return resolveIdentityProviderBuildConfigRaw() || { status: null, privateConfig: null };
}

function resolveIdentityProviderBuildStatus() {
  return resolveIdentityProviderBuildConfig().status;
}

function resolveIdentityProviderPhaseNetwork(identityProviderBuildConfig) {
  const phaseNetwork = String(process.env.H2O_IDENTITY_PHASE_NETWORK || "").trim().toLowerCase();
  if (!phaseNetwork) return null;
  if (phaseNetwork !== IDENTITY_PROVIDER_PHASE_NETWORK_REQUEST_OTP) {
    throw new Error(`[H2O] Unsupported H2O_IDENTITY_PHASE_NETWORK value: ${phaseNetwork}`);
  }
  if (MANIFEST_PROFILE === "production") {
    throw new Error("[H2O] H2O_IDENTITY_PHASE_NETWORK=request_otp is not approved for production builds");
  }
  const cfg = identityProviderBuildConfig && typeof identityProviderBuildConfig === "object"
    ? identityProviderBuildConfig
    : {};
  if (!cfg.status || cfg.status.valid !== true || cfg.status.providerConfigured !== true || !cfg.privateConfig) {
    throw new Error("[H2O] H2O_IDENTITY_PHASE_NETWORK=request_otp requires complete dev provider config");
  }
  if (!cfg.optionalHostPattern) {
    throw new Error("[H2O] H2O_IDENTITY_PHASE_NETWORK=request_otp requires an exact Supabase optional host permission");
  }
  return IDENTITY_PROVIDER_PHASE_NETWORK_REQUEST_OTP;
}

function makeIdentityProviderPrivateConfigJs(privateConfig) {
  const src = privateConfig && typeof privateConfig === "object" ? privateConfig : null;
  if (!src) return "";
  return "globalThis." + IDENTITY_PROVIDER_PRIVATE_CONFIG_GLOBAL + " = Object.freeze(" + JSON.stringify({
    phase: "3.0Y",
    kind: "identity-provider-private-config",
    providerKind: "supabase",
    configSource: src.configSource,
    projectUrl: src.projectUrl,
    publicClient: src.publicClient,
  }) + ");\n";
}

function syncIdentityProviderPrivateConfigToOut(outDir, privateConfig) {
  const outFile = path.join(outDir, IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH);
  if (!privateConfig) {
    try {
      fs.rmSync(outFile, { force: true });
    } catch {}
    return { emitted: false, relativePath: IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH };
  }
  ensureDir(path.dirname(outFile));
  writeTextFileAtomic(outFile, makeIdentityProviderPrivateConfigJs(privateConfig));
  return { emitted: true, relativePath: IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH };
}

async function main() {
  ensureDir(OUT_DIR);
  const identityProviderOAuthProvider = resolveIdentityProviderOAuthProvider();
  const identityProviderBuildConfig = resolveIdentityProviderBuildConfig();
  const identityProviderPhaseNetwork = resolveIdentityProviderPhaseNetwork(identityProviderBuildConfig);
  const identityProviderRequestOtpArmed = identityProviderPhaseNetwork === IDENTITY_PROVIDER_PHASE_NETWORK_REQUEST_OTP;
  const identityProviderOptionalHostPermissions = identityProviderBuildConfig.optionalHostPattern
    ? [identityProviderBuildConfig.optionalHostPattern]
    : [];

  const iconOutputs = await writeExtensionIcons(OUT_DIR, {
    mode: DEV_HAS_CONTROLS ? "dev" : "dev-lean",
    scriptDir: SCRIPT_DIR,
    srcRoot: SRC,
    readyIconDir: DEV_HAS_CONTROLS ? DEV_CONTROLS_ICONS_DIR : DEV_LEAN_ICONS_DIR,
  });

  // Phase 8A-1: per-variant stable manifest "key" so Chrome derives the
  // extension ID from the public key rather than the load-path string.
  // Variant name is derived from OUT_DIR basename so the same logic works
  // whether OUT_DIR comes from H2O_EXT_OUT_DIR (per-task override in
  // .vscode/tasks.json) or from the build-context default. Returns null
  // when the variant isn't registered (preserving pre-8A-1 behavior).
  const EXTENSION_KEY = getExtensionKey(deriveVariantFromOutDir(OUT_DIR));

  const manifest = applyExtensionIconsToManifest(
    makeChromeLiveManifest({
      PROXY_PACK_URL,
      CHAT_MATCH,
      PAGE_FOLDER_BRIDGE_FILE,
      PAGE_PILOT_OBSERVER_FILE,
      DEV_HAS_CONTROLS,
      DEV_TITLE,
      DEV_ACTION_TITLE,
      DEV_NAME,
      DEV_VERSION,
      DEV_DESCRIPTION,
      MANIFEST_PROFILE,
      IDENTITY_PROVIDER_OPTIONAL_HOST_PERMISSIONS: identityProviderOptionalHostPermissions,
      IDENTITY_PROVIDER_REQUEST_OTP_ARMED: identityProviderRequestOtpArmed,
      IDENTITY_PROVIDER_OAUTH_PROVIDER: identityProviderOAuthProvider,
      STUDIO_ONLY,
      EXTENSION_KEY,
    }),
    iconOutputs,
  );

  // Identity surface: allow window.open('chrome-extension://…/surfaces/identity/identity.html')
  // from the chatgpt.com content-script context. Skip for studio-launcher
  // since it has no content_scripts and no chatgpt.com host_permission — the
  // identity surface is only reached via the page-context script which doesn't
  // run here.
  if (!STUDIO_ONLY) {
    manifest.web_accessible_resources.push(IDENTITY_WEB_ACCESSIBLE_ENTRY);
  }

  writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Copy identity surface + Identity Core script. Skipped for studio-launcher:
  // none of the packaged Studio scripts reference H2O.Identity or the identity
  // surface URL, and identity is only reached from the chatgpt.com content
  // script path which doesn't exist in this build.
  let identityProviderBundle = null;
  let identityProviderConfigStatus = null;
  let identityProviderPrivateConfig = { emitted: false, relativePath: null };
  if (!STUDIO_ONLY) {
    syncIdentitySurfaceToOut(SRC, OUT_DIR);

    identityProviderPrivateConfig = syncIdentityProviderPrivateConfigToOut(
      OUT_DIR,
      identityProviderBuildConfig.privateConfig,
    );
    identityProviderBundle = await buildIdentityProviderBundle(OUT_DIR);
    identityProviderConfigStatus = identityProviderBuildConfig.status;
  }

  writeFile(path.join(OUT_DIR, "bg.js"), makeChromeLiveBackgroundJs({
    DEV_TAG,
    CHAT_MATCH,
    DEV_HAS_CONTROLS,
    MANIFEST_PROFILE,
    IDENTITY_PROVIDER_BUNDLE_PATH: IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH,
    IDENTITY_PROVIDER_PRIVATE_CONFIG_PATH: IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH,
    IDENTITY_PROVIDER_OPTIONAL_HOST_PATTERN: identityProviderBuildConfig.optionalHostPattern,
    IDENTITY_PROVIDER_CONFIG_STATUS: identityProviderConfigStatus,
    IDENTITY_PROVIDER_PHASE_NETWORK: identityProviderPhaseNetwork,
    IDENTITY_PROVIDER_OAUTH_PROVIDER: identityProviderOAuthProvider,
    // Studio Launcher: disable auto-restore. With only a toolbar button as
    // entry point, presence-restore-on-reload is unnecessary and was the
    // primary source of duplicate-tab bugs (sw-boot vs onInstalled race).
    STUDIO_AUTO_RESTORE_ENABLED: !STUDIO_ONLY,
  }));

  // Studio-launcher omits the chatgpt.com loader pipeline entirely: no
  // loader.js content-script, no folder-bridge page helper, no pilot-observer
  // page helper. With no content_scripts in the manifest these files would
  // never load anyway — omitting them keeps the bundle minimal and removes
  // any chance of accidental future references.
  if (!STUDIO_ONLY) {
    writeFile(path.join(OUT_DIR, "loader.js"), makeChromeLiveLoaderJs({
      DEV_TAG,
      DEV_TITLE,
      DEV_HAS_CONTROLS,
      PROXY_PACK_URL,
      DEV_SCRIPT_CATALOG,
      DEV_ORDER_SECTIONS_SNAPSHOT,
      LOADER_DEPS_SNAPSHOT,
      STORAGE_KEY,
      STORAGE_ORDER_OVERRIDES_KEY,
      PAGE_FOLDER_BRIDGE_FILE,
      PAGE_PILOT_OBSERVER_FILE,
    }));
    writeFile(path.join(OUT_DIR, PAGE_FOLDER_BRIDGE_FILE), makeChromeLiveFolderBridgePageJs());
    writeFile(path.join(OUT_DIR, PAGE_PILOT_OBSERVER_FILE), makeChromeLivePilotObserverJs());
  } else {
    // Defensive: remove stale loader / bridge / observer files from prior
    // non-studio-launcher builds at the same OUT_DIR.
    for (const n of ["loader.js", PAGE_FOLDER_BRIDGE_FILE, PAGE_PILOT_OBSERVER_FILE]) {
      try { fs.unlinkSync(path.join(OUT_DIR, n)); } catch {}
    }
  }

  if (DEV_HAS_CONTROLS) {
    const panelLogoPath = copyPanelIconAsset(OUT_DIR);
    writeFile(path.join(OUT_DIR, "popup.html"), makeChromeLivePopupHtml({ panelLogoPath }));
    writeFile(path.join(OUT_DIR, "popup.css"), makeChromeLivePopupCss());
    writeFile(path.join(OUT_DIR, "popup.js"), makeChromeLivePopupJs({
      PROXY_PACK_URL,
      STORAGE_KEY,
      STORAGE_ORDER_OVERRIDES_KEY,
      DEV_ORDER_SECTIONS_SNAPSHOT,
      DEV_ALIAS_FILENAME_MAP,
    }));
  } else {
    for (const n of ["popup.html", "popup.css", "popup.js"]) {
      try {
        fs.unlinkSync(path.join(OUT_DIR, n));
      } catch {}
    }
  }

  // Studio is the canonical Studio app and storage owner, hosted ONLY in
  // chrome-ext-prod. Dev-controls / dev-lean ship without the Studio surface
  // so the dev-controls extension is purely a debug/toggle tool and cannot
  // accidentally create a second Studio storage namespace under a different
  // extension ID. The bg.js for non-prod profiles also disables the action
  // listener, openWorkbench, and presence-restore (see ARCHIVE_WORKBENCH_ENABLED
  // in chrome-live-background.mjs — gated on MANIFEST_PROFILE === "production").
  if (MANIFEST_PROFILE === "production") {
    syncArchiveWorkbenchToOut(SRC, OUT_DIR);
  } else {
    // removeArchiveWorkbenchFromOut only deletes files it knows about
    // (ARCHIVE_WORKBENCH_OUT_FILES). That leaves stale files from previous
    // builds (renamed scripts, .DS_Store, etc.) which keep the directory
    // alive and let chrome.runtime.getURL("surfaces/studio/studio.html")
    // still resolve to a partial / broken page. Recursively removing the
    // whole surfaces/studio directory guarantees a clean non-prod build.
    removeArchiveWorkbenchFromOut(OUT_DIR);
    try {
      fs.rmSync(path.join(OUT_DIR, "surfaces", "studio"), { recursive: true, force: true });
    } catch {}
  }

  writeFile(path.join(OUT_DIR, "README.txt"), makeChromeLiveReadme({
    OUT_DIR,
    PROXY_PACK_URL,
    DEV_HAS_CONTROLS,
  }));

  console.log("[H2O] " + (STUDIO_ONLY ? "studio launcher" : (MANIFEST_PROFILE === "production" ? "production-safe" : (DEV_HAS_CONTROLS ? "dev controls" : "dev lean loader"))) + " extension generated:");
  console.log("[H2O] out:", OUT_DIR);
  console.log("[H2O] variant:", DEV_VARIANT);
  console.log("[H2O] manifest profile:", MANIFEST_PROFILE);
  console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
  if (!STUDIO_ONLY) console.log("[H2O] proxy pack:", PROXY_PACK_URL);
  console.log("[H2O] identity provider bundle:", identityProviderBundle ? identityProviderBundle.relativePath : "absent (studio-launcher)");
  console.log("[H2O] identity oauth provider:", identityProviderOAuthProvider || "disabled");
  console.log(
    "[H2O] identity provider private config:",
    identityProviderPrivateConfig.emitted ? identityProviderPrivateConfig.relativePath : "absent",
  );
  console.log(
    "[H2O] icons:",
    iconOutputs.source === "ready-pack"
      ? `ready pack ${iconOutputs.readyIconDir}`
      : `generated from ${iconOutputs.sourcePath}`,
  );
  console.log("[H2O] icon sizes:", iconOutputs.copiedSizes.join(", "));
}

main().catch((error) => {
  console.error("[H2O] Chrome live extension build failed.");
  console.error(error?.stack || error);
  process.exitCode = 1;
});
