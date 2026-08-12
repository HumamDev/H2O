#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { REPO_ROOT } from "../paths.mjs";

const loaderPath = `${REPO_ROOT}/tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs`;
const loaderSource = fs.readFileSync(loaderPath, "utf8");
const match = loaderSource.match(
  /  function yieldToBrowser\(\) \{([\s\S]*?)\n  \}\n\n  function waitDomContentLoaded\(\)/,
);
assert.ok(match, "yieldToBrowser must remain extractable from the production loader");
const yieldFunctionSource = `(function yieldToBrowser() {${match[1]}\n})`;

function createHarness({ hasRaf = true } = {}) {
  let nextTimerId = 1;
  const timers = new Map();
  const clearedTimerIds = [];
  const rafCallbacks = [];
  const context = {
    Promise,
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      clearedTimerIds.push(id);
      timers.delete(id);
    },
    window: hasRaf ? {
      requestAnimationFrame(callback) {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      },
    } : {},
  };
  const yieldToBrowser = vm.runInNewContext(yieldFunctionSource, context);
  return {
    yieldToBrowser,
    timers,
    clearedTimerIds,
    rafCallbacks,
    fireTimer(id = [...timers.keys()][0]) {
      const timer = timers.get(id);
      assert.ok(timer, `timer ${id} must exist`);
      timer.callback();
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

{
  const harness = createHarness();
  let continuations = 0;
  const pending = harness.yieldToBrowser().then(() => { continuations += 1; });
  assert.equal(harness.rafCallbacks.length, 1, "visible yield must request one animation frame");
  assert.equal(harness.timers.size, 1, "visible yield must arm one bounded fallback");
  assert.equal([...harness.timers.values()][0].delay, 48, "fallback must remain narrowly bounded");
  harness.rafCallbacks[0]();
  await pending;
  assert.equal(continuations, 1, "rAF must continue exactly once");
  assert.equal(harness.timers.size, 0, "rAF winner must cancel the fallback timer");
  assert.deepEqual(harness.clearedTimerIds, [1], "rAF winner must clear the armed timer");
}

{
  const harness = createHarness();
  let continuations = 0;
  const pending = harness.yieldToBrowser().then(() => { continuations += 1; });
  harness.fireTimer();
  await pending;
  assert.equal(continuations, 1, "suspended rAF must fall back exactly once");
  assert.equal(harness.rafCallbacks.length, 1, "hidden-page case must preserve preferred rAF scheduling");
}

{
  const harness = createHarness();
  let continuations = 0;
  const pending = harness.yieldToBrowser().then(() => { continuations += 1; });
  harness.fireTimer();
  await pending;
  harness.rafCallbacks[0]();
  await flushMicrotasks();
  assert.equal(continuations, 1, "late rAF after timer fallback must be harmless");
}

{
  const harness = createHarness();
  const phases = [];
  const progression = (async () => {
    phases.push("document-start");
    await harness.yieldToBrowser();
    phases.push("document-end");
    await harness.yieldToBrowser();
    phases.push("document-idle");
  })();
  harness.fireTimer();
  await flushMicrotasks();
  assert.deepEqual(phases, ["document-start", "document-end"]);
  harness.fireTimer();
  await progression;
  assert.deepEqual(phases, ["document-start", "document-end", "document-idle"],
    "fallback yields must preserve loader phase ordering");
}

console.log("validate-loader-hidden-page-yield: PASS (4/4 cases)");
