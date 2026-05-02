// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  removeArchiveWorkbenchFromOut,
  syncArchiveWorkbenchToOut,
} from "../studio/pack-studio.mjs";
import {
  syncIdentitySurfaceToOut,
  IDENTITY_WEB_ACCESSIBLE_ENTRY,
} from "../identity/pack-identity.mjs";
import {
  applyExtensionIconsToManifest,
  writeExtensionIcons,
} from "./write-extension-icons.mjs";
import { createChromeLiveBuildContext } from "./chrome-live-build-context.mjs";
import { createChromeLiveSourceSnapshots } from "./chrome-live-source-snapshots.mjs";
import { makeChromeLiveManifest } from "./chrome-live-manifest.mjs";
import { makeChromeLiveFolderBridgePageJs } from "./chrome-live-folder-bridge.mjs";
import { makeChromeLiveBackgroundJs } from "./chrome-live-background.mjs";
import {
  buildIdentityProviderBundle,
  IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH,
} from "../identity/build-identity-provider-bundle.mjs";
import { makeChromeLiveLoaderJs } from "./chrome-live-loader.mjs";
import { makeChromeLivePopupHtml } from "../../dev-controls/popup/chrome-live-popup-html.mjs";
import { makeChromeLivePopupCss } from "../../dev-controls/popup/chrome-live-popup-css.mjs";
import { makeChromeLivePopupJs } from "../../dev-controls/popup/chrome-live-popup-js.mjs";
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
  MANIFEST_PROFILE,
  DEV_VERSION,
  DEV_TITLE,
  DEV_NAME,
  DEV_DESCRIPTION,
  DEV_TAG,
  DEV_ORDER_FILE,
  PAGE_FOLDER_BRIDGE_FILE,
} = createChromeLiveBuildContext();
const DEV_CONTROLS_ICONS_DIR = path.join(SRC, "assets", "chrome-dev-controls-icons");
const DEV_LEAN_ICONS_DIR = path.join(SRC, "assets", "chrome-dev-lean-icons");

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

  const manifest = applyExtensionIconsToManifest(
    makeChromeLiveManifest({
      PROXY_PACK_URL,
      CHAT_MATCH,
      PAGE_FOLDER_BRIDGE_FILE,
      DEV_HAS_CONTROLS,
      DEV_TITLE,
      DEV_NAME,
      DEV_VERSION,
      DEV_DESCRIPTION,
      MANIFEST_PROFILE,
      IDENTITY_PROVIDER_OPTIONAL_HOST_PERMISSIONS: identityProviderOptionalHostPermissions,
      IDENTITY_PROVIDER_REQUEST_OTP_ARMED: identityProviderRequestOtpArmed,
      IDENTITY_PROVIDER_OAUTH_PROVIDER: identityProviderOAuthProvider,
    }),
    iconOutputs,
  );

  // Identity surface: allow window.open('chrome-extension://…/surfaces/identity/identity.html')
  // from the chatgpt.com content-script context.
  manifest.web_accessible_resources.push(IDENTITY_WEB_ACCESSIBLE_ENTRY);

  writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  // Copy identity surface + Identity Core script (both lean and controls builds).
  syncIdentitySurfaceToOut(SRC, OUT_DIR);

  const identityProviderPrivateConfig = syncIdentityProviderPrivateConfigToOut(
    OUT_DIR,
    identityProviderBuildConfig.privateConfig,
  );
  const identityProviderBundle = await buildIdentityProviderBundle(OUT_DIR);
  const identityProviderConfigStatus = identityProviderBuildConfig.status;

  writeFile(path.join(OUT_DIR, "bg.js"), makeChromeLiveBackgroundJs({
    DEV_TAG,
    CHAT_MATCH,
    DEV_HAS_CONTROLS,
    IDENTITY_PROVIDER_BUNDLE_PATH: IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH,
    IDENTITY_PROVIDER_PRIVATE_CONFIG_PATH: IDENTITY_PROVIDER_PRIVATE_CONFIG_RELATIVE_PATH,
    IDENTITY_PROVIDER_OPTIONAL_HOST_PATTERN: identityProviderBuildConfig.optionalHostPattern,
    IDENTITY_PROVIDER_CONFIG_STATUS: identityProviderConfigStatus,
    IDENTITY_PROVIDER_PHASE_NETWORK: identityProviderPhaseNetwork,
    IDENTITY_PROVIDER_OAUTH_PROVIDER: identityProviderOAuthProvider,
  }));
  writeFile(path.join(OUT_DIR, "loader.js"), makeChromeLiveLoaderJs({
    DEV_TAG,
    DEV_TITLE,
    DEV_HAS_CONTROLS,
    PROXY_PACK_URL,
    DEV_SCRIPT_CATALOG,
    DEV_ORDER_SECTIONS_SNAPSHOT,
    STORAGE_KEY,
    STORAGE_ORDER_OVERRIDES_KEY,
    PAGE_FOLDER_BRIDGE_FILE,
  }));
  writeFile(path.join(OUT_DIR, PAGE_FOLDER_BRIDGE_FILE), makeChromeLiveFolderBridgePageJs());

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
    syncArchiveWorkbenchToOut(SRC, OUT_DIR);
  } else {
    for (const n of ["popup.html", "popup.css", "popup.js"]) {
      try {
        fs.unlinkSync(path.join(OUT_DIR, n));
      } catch {}
    }
    removeArchiveWorkbenchFromOut(OUT_DIR);
  }

  writeFile(path.join(OUT_DIR, "README.txt"), makeChromeLiveReadme({
    OUT_DIR,
    PROXY_PACK_URL,
    DEV_HAS_CONTROLS,
  }));

  console.log("[H2O] " + (MANIFEST_PROFILE === "production" ? "production-safe" : (DEV_HAS_CONTROLS ? "dev controls" : "dev lean loader")) + " extension generated:");
  console.log("[H2O] out:", OUT_DIR);
  console.log("[H2O] variant:", DEV_VARIANT);
  console.log("[H2O] manifest profile:", MANIFEST_PROFILE);
  console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
  console.log("[H2O] proxy pack:", PROXY_PACK_URL);
  console.log("[H2O] identity provider bundle:", identityProviderBundle.relativePath);
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
