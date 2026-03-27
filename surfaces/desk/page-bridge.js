// @version 1.0.0

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSelectedText() {
  return normalizeText(window.getSelection?.()?.toString() || "");
}

function getPageFallbackText() {
  const main = document.querySelector("main");
  return normalizeText(main?.textContent || "") || normalizeText(document.body?.textContent || "");
}

function getComposer() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('textarea[id="prompt-textarea"]') ||
    document.querySelector('[contenteditable="true"][data-testid*="textbox"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('[contenteditable="true"]')
  );
}

function getSendButton() {
  return (
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label*="Send"]') ||
    document.querySelector('button[aria-label*="send"]')
  );
}

function getStopButton() {
  return (
    document.querySelector('button[data-testid="stop-button"]') ||
    document.querySelector('button[aria-label*="Stop"]') ||
    document.querySelector('button[aria-label*="stop"]')
  );
}

function isReplyStreaming() {
  return Boolean(getStopButton());
}

function getAssistantMessages() {
  return Array.from(
    document.querySelectorAll('[data-message-author-role="assistant"]')
  );
}

function extractMessageText(node) {
  return normalizeText(node?.textContent || "");
}

function captureAssistantState() {
  const messages = getAssistantMessages();
  const lastMessage = messages[messages.length - 1] || null;
  return {
    count: messages.length,
    lastMessage,
    lastText: extractMessageText(lastMessage)
  };
}

function getReplyCandidate(beforeState) {
  const messages = getAssistantMessages();
  const lastMessage = messages[messages.length - 1] || null;
  if (!lastMessage) {
    return null;
  }

  if (messages.length > beforeState.count) {
    return lastMessage;
  }

  if (!beforeState.lastMessage) {
    return lastMessage;
  }

  const lastText = extractMessageText(lastMessage);
  if (lastMessage !== beforeState.lastMessage) {
    return lastMessage;
  }

  if (lastText && lastText !== beforeState.lastText) {
    return lastMessage;
  }

  return null;
}

async function waitForComposer(timeoutMs = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const composer = getComposer();
    if (composer) return composer;
    await sleep(250);
  }

  throw new Error("Composer not found.");
}

function setNativeValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = descriptor?.set;

  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
}

function getComposerText(composer) {
  if (!composer) return "";
  if ("value" in composer) return String(composer.value || "");
  return String(composer.innerText || composer.textContent || "");
}

async function fillComposer(text) {
  const composer = await waitForComposer();
  composer.focus();

  if ("value" in composer) {
    setNativeValue(composer, text);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  composer.textContent = text;
  composer.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: text,
      inputType: "insertText"
    })
  );
}

function joinComposerText(existingText, incomingText, mode = "replace") {
  const nextText = String(incomingText || "").trim();
  if (mode !== "append") {
    return nextText;
  }

  const currentText = String(existingText || "").trim();
  if (!currentText) return nextText;
  if (!nextText) return currentText;
  return `${currentText}\n\n${nextText}`;
}

async function insertIntoMainComposer(text, mode = "replace") {
  const composer = await waitForComposer();
  const nextText = joinComposerText(getComposerText(composer), text, mode);
  await fillComposer(nextText);
  return nextText;
}

async function submitComposer() {
  await sleep(300);

  const sendButton = getSendButton();
  if (sendButton && !sendButton.disabled) {
    sendButton.click();
    return;
  }

  const composer = getComposer();
  if (!composer) {
    throw new Error("Composer disappeared before submit.");
  }

  composer.focus();

  composer.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      which: 13,
      keyCode: 13,
      bubbles: true
    })
  );

  composer.dispatchEvent(
    new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      which: 13,
      keyCode: 13,
      bubbles: true
    })
  );
}

function waitForAssistantReply(beforeState, options = {}) {
  const {
    timeoutMs = 90000,
    stableMs = 700,
    fallbackStableMs = 2200,
    pollMs = 2000
  } = options;

  return new Promise((resolve, reject) => {
    const observedRoot = document.querySelector("main") || document.body || document.documentElement;
    if (!observedRoot) {
      reject(new Error("Reply observer root not found."));
      return;
    }

    let observer = null;
    let timeoutTimer = 0;
    let settleTimer = 0;
    let pollTimer = 0;
    let settled = false;

    let candidateNode = null;
    let candidateText = "";
    let lastChangeAt = 0;
    let sawStreaming = false;
    let sawMutation = false;

    function cleanup() {
      if (observer) observer.disconnect();
      clearTimeout(timeoutTimer);
      clearTimeout(settleTimer);
      clearInterval(pollTimer);
      settled = true;
    }

    function finishSuccess(text) {
      if (settled) return;
      cleanup();
      resolve(text);
    }

    function finishError(error) {
      if (settled) return;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }

    function scheduleSettledCheck(delayMs) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => inspect("settle"), delayMs);
    }

    function inspect(trigger = "observe") {
      if (settled) return;

      const streaming = isReplyStreaming();
      if (streaming) {
        sawStreaming = true;
      }

      const nextCandidate = getReplyCandidate(beforeState);
      const nextText = nextCandidate ? extractMessageText(nextCandidate) : "";

      if (nextCandidate !== candidateNode || nextText !== candidateText) {
        candidateNode = nextCandidate;
        candidateText = nextText;
        lastChangeAt = Date.now();
      }

      if (!candidateText) {
        return;
      }

      const requiredStableMs = sawStreaming ? stableMs : fallbackStableMs;
      const stableForMs = Date.now() - lastChangeAt;

      if (!streaming && stableForMs >= requiredStableMs) {
        finishSuccess(candidateText);
        return;
      }

      if (trigger !== "settle" && (trigger === "mutation" || sawMutation || trigger === "poll")) {
        scheduleSettledCheck(requiredStableMs);
      }
    }

    observer = new MutationObserver(() => {
      sawMutation = true;
      inspect("mutation");
    });

    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      characterData: true
    });

    timeoutTimer = setTimeout(() => {
      finishError(new Error("Timed out waiting for assistant reply."));
    }, timeoutMs);

    pollTimer = setInterval(() => {
      inspect("poll");
    }, pollMs);

    inspect("bootstrap");
  });
}

async function runGrammar(text) {
  const beforeState = captureAssistantState();
  await fillComposer(text);
  await submitComposer();
  const reply = await waitForAssistantReply(beforeState);
  return reply;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "DESK_PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "DESK_GET_PAGE_SELECTION") {
    sendResponse({ ok: true, text: getSelectedText() });
    return true;
  }

  if (message.type === "DESK_GET_PAGE_FALLBACK_TEXT") {
    sendResponse({ ok: true, text: getPageFallbackText() });
    return true;
  }

  if (message.type === "DESK_INSERT_MAIN_COMPOSER_TEXT") {
    (async () => {
      try {
        const text = String(message.text || "");
        if (!text.trim()) {
          sendResponse({ ok: false, error: "No text provided." });
          return;
        }

        const finalText = await insertIntoMainComposer(text, message.mode || "replace");
        sendResponse({ ok: true, text: finalText });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();

    return true;
  }

  if (message.type === "DESK_GRAMMAR_RUN") {
    (async () => {
      try {
        const text = String(message.text || "").trim();
        if (!text) {
          sendResponse({ ok: false, error: "No text provided." });
          return;
        }

        const result = await runGrammar(text);
        sendResponse({ ok: true, text: result });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();

    return true;
  }
});
