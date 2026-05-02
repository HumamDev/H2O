import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH = "provider/identity-provider-supabase.js";
export const IDENTITY_PROVIDER_BUNDLE_ENTRY = path.join(SCRIPT_DIR, "identity-provider-supabase.entry.mjs");
const LEGACY_PROVIDER_BUNDLE_BASENAME = ["identity", "provider", "dummy.js"].join("-");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export async function buildIdentityProviderBundle(outDir) {
  const outRoot = path.resolve(outDir || path.join(SCRIPT_DIR, "..", "..", "..", "build", "chrome-ext-dev-controls"));
  const outFile = path.join(outRoot, IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH);
  ensureDir(path.dirname(outFile));
  const staleOutFile = path.join(path.dirname(outFile), LEGACY_PROVIDER_BUNDLE_BASENAME);
  if (staleOutFile !== outFile && fs.existsSync(staleOutFile)) {
    fs.rmSync(staleOutFile, { force: true });
  }

  await esbuild.build({
    entryPoints: [IDENTITY_PROVIDER_BUNDLE_ENTRY],
    outfile: outFile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    sourcemap: false,
    minify: true,
    legalComments: "none",
    logLevel: "silent",
  });

  return {
    entryFile: IDENTITY_PROVIDER_BUNDLE_ENTRY,
    outFile,
    relativePath: IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildIdentityProviderBundle(process.env.H2O_EXT_OUT_DIR)
    .then((result) => {
      console.log("[H2O] identity provider bundle generated:", result.outFile);
    })
    .catch((error) => {
      console.error("[H2O] identity provider bundle build failed.");
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
