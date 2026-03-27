// ==UserScript==
// @h2o-id             9z1a.hide.disclaimer
// @name               9Z1a.🟤🧼 Hide Disclaimer 🧼
// @namespace          H2O.Premium.CGX.hide.disclaimer
// @author             HumamDev
// @version            1.1.0
// @revision           001
// @build              260304-102754
// @description        Hide the "ChatGPT can make mistakes..." text using CSS only (keep layout intact)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(function () {
  'use strict';
  // release test touch (no behavior change)

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
