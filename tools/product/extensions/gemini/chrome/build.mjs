#!/usr/bin/env node
// @version 2.0.0  (Phase 8G-10: thin wrapper over shared helper)
import { buildExtensionStub } from "../../_shared/build-extension-stub.mjs";
buildExtensionStub({ host: "gemini", browser: "chrome" });
