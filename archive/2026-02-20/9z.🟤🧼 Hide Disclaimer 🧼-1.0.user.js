// ==UserScript==
// @name         9z.🟤🧼 Hide Disclaimer 🧼
// @namespace    H2O.ChatGPT.HideDisclaimer
// @version      1.0
// @description  Hide the "ChatGPT can make mistakes..." text using CSS only (keep layout intact)
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    /* Hide only the text/link inside the disclaimer block, keep the container height */
    main div.text-token-text-secondary[class*="vt-disclaimer"] .pointer-events-auto {
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
})();
