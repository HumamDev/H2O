/* Saved-Chat active generation-family routing (M09 P2.3).
 *
 * One read-only native policy chooses the package construction family for a
 * whole operation. The renderer cannot supply a family string: a policy token
 * is minted only from the exact native command response and is accepted by the
 * pure builder/writer helpers only while it belongs to this module instance.
 * Native COMMIT independently enforces the same immutable build policy.
 *
 * This module adds no archive filesystem authority and no mutable activation
 * state. Production remains v1/v2 until Rust's sole build policy changes.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};

  var MODULE_VERSION = '1.0.0-m09-p23';
  var POLICY_COMMAND = 'h2o_saved_chat_generation_policy';
  var POLICY_SCHEMA = 'h2o.studio.saved-chat-generation-policy.v1';
  var FAMILY_V1V2 = 'v1v2';
  var FAMILY_V3 = 'v3';
  var issuedPolicyTokens = new WeakSet();
  var state = { lastPolicyReadAt: null, lastWriteAt: null, lastError: null };

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanString(value) { return typeof value === 'string' ? value.trim() : ''; }

  function policyError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  function getTauriInvoke() {
    var internals = global.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    var legacy = global.__TAURI__;
    if (legacy && legacy.core && typeof legacy.core.invoke === 'function') return legacy.core.invoke.bind(legacy.core);
    if (legacy && typeof legacy.invoke === 'function') return legacy.invoke.bind(legacy);
    return null;
  }

  function validatePolicyWire(value) {
    var wire = safeObject(value);
    if (cleanString(wire.schema) !== POLICY_SCHEMA) {
      throw policyError('saved-chat-generation-policy-invalid-schema', 'saved-chat generation policy schema is invalid');
    }
    var family = cleanString(wire.liveGenerationFamily);
    if (family !== FAMILY_V1V2 && family !== FAMILY_V3) {
      throw policyError('saved-chat-generation-policy-invalid-family', 'saved-chat generation policy family is missing or unknown');
    }
    var token = Object.freeze({ schema: POLICY_SCHEMA, liveGenerationFamily: family });
    issuedPolicyTokens.add(token);
    return token;
  }

  function requirePolicyToken(value) {
    if (!value || !issuedPolicyTokens.has(value)) {
      throw policyError('saved-chat-generation-policy-token-required', 'a policy token from the trusted read-only policy command is required');
    }
    return value;
  }

  async function readSavedChatGenerationPolicy() {
    var invoke = getTauriInvoke();
    if (!invoke) {
      throw policyError('saved-chat-generation-policy-unavailable', 'tauri invoke unavailable for saved-chat generation policy');
    }
    var wire;
    try {
      wire = await invoke(POLICY_COMMAND, {});
    } catch (error) {
      var message = String((error && error.message) || error || 'invoke failed');
      throw policyError('saved-chat-generation-policy-unavailable', 'saved-chat generation policy query failed: ' + message);
    }
    var token = validatePolicyWire(wire);
    state.lastPolicyReadAt = new Date().toISOString();
    return token;
  }

  function builderForPolicy(policy) {
    var ingestion = H2O.Studio.ingestion || {};
    var builder = policy.liveGenerationFamily === FAMILY_V3
      ? ingestion.buildSavedChatPackageV3
      : ingestion.buildSavedChatPackageV1;
    if (typeof builder !== 'function') {
      throw policyError('saved-chat-generation-builder-unavailable', 'saved-chat package builder unavailable for ' + policy.liveGenerationFamily);
    }
    return builder;
  }

  async function buildWithPolicy(options, policyToken) {
    var policy = requirePolicyToken(policyToken);
    var built = await builderForPolicy(policy)(safeObject(options));
    if (!built || built.ok !== true) throw new Error('active-family saved-chat package build failed');
    return Object.assign({}, built, { liveGenerationFamily: policy.liveGenerationFamily });
  }

  async function buildSavedChatPackageForLiveGenerationFamily(options, policyToken) {
    var policy = policyToken || await readSavedChatGenerationPolicy();
    return buildWithPolicy(options, policy);
  }

  function publicationResult(built, result) {
    var trusted = safeObject(result);
    var writtenAt = new Date().toISOString();
    state.lastWriteAt = writtenAt;
    return Object.assign({}, built, {
      written: true,
      writtenAt: writtenAt,
      outcome: trusted.outcome,
      committed: trusted.committed === true,
      deduped: trusted.deduped === true,
      durabilityComplete: trusted.durabilityComplete === true,
      advisories: Array.isArray(trusted.advisories) ? trusted.advisories.slice() : [],
      packagePath: cleanString(trusted.generationPath),
      paths: { root: cleanString(trusted.generationPath) },
      contentHash: cleanString(trusted.contentHash) || cleanString(built.contentHash),
    });
  }

  async function writeWithPolicy(options, policyToken) {
    var opts = safeObject(options);
    if (cleanString(opts.targetDir) || cleanString(opts.targetFolder)) {
      throw new Error('targetDir/targetFolder is not supported; saved chat generations are published by trusted code');
    }
    if (opts.overwrite === true) {
      throw new Error('saved chat generation publication is create-only; overwrite is forbidden');
    }
    var policy = requirePolicyToken(policyToken);
    var built = await buildWithPolicy(opts, policy);
    var publish = H2O.Studio.ingestion && H2O.Studio.ingestion.publishBuiltSavedChatGeneration;
    if (typeof publish !== 'function') {
      throw new Error('H2O.Studio.ingestion.publishBuiltSavedChatGeneration unavailable');
    }
    return publicationResult(built, await publish(built));
  }

  async function writeSavedChatPackageForLiveGenerationFamily(options, policyToken) {
    var policy = policyToken || await readSavedChatGenerationPolicy();
    return writeWithPolicy(options, policy);
  }

  function diagnoseSavedChatGenerationPolicyRouting() {
    return {
      installed: true,
      version: MODULE_VERSION,
      policyCommand: POLICY_COMMAND,
      policySchema: POLICY_SCHEMA,
      supportedFamilies: [FAMILY_V1V2, FAMILY_V3],
      mutablePolicy: false,
      rendererFamilyArgument: false,
      lastPolicyReadAt: state.lastPolicyReadAt,
      lastWriteAt: state.lastWriteAt,
      lastError: state.lastError,
    };
  }

  H2O.Studio.ingestion.readSavedChatGenerationPolicy = readSavedChatGenerationPolicy;
  H2O.Studio.ingestion.buildSavedChatPackageForLiveGenerationFamily = function (options, policyToken) {
    return buildSavedChatPackageForLiveGenerationFamily(options, policyToken).catch(function (error) {
      state.lastError = String((error && error.message) || error);
      throw error;
    });
  };
  H2O.Studio.ingestion.writeSavedChatPackageForLiveGenerationFamily = function (options, policyToken) {
    return writeSavedChatPackageForLiveGenerationFamily(options, policyToken).catch(function (error) {
      state.lastError = String((error && error.message) || error);
      throw error;
    });
  };
  H2O.Studio.ingestion.diagnoseSavedChatGenerationPolicyRouting = diagnoseSavedChatGenerationPolicyRouting;
})(typeof window !== 'undefined' ? window : globalThis);
