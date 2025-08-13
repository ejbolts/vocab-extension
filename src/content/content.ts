// Import utility and logic modules
import {
  getPageWords,
  revertAllModifications,
  maybeHideTooltip as maybeHideTooltipUtil,
} from "./content-utils.js";
import {
  showTooltip as showTooltipDom,
  hideTooltip,
  setTooltipElement,
} from "./content-dom.js";
import { processPage } from "./content-vocab.js";

// Shared tooltip element and state
let suppressTooltipUntilLeave = false;
const tooltip = document.createElement("div");
tooltip.id = "vocab-tooltip";
tooltip.style.position = "absolute";
tooltip.style.backgroundColor = "#333";
tooltip.style.color = "#fff";
tooltip.style.padding = "8px";
tooltip.style.borderRadius = "4px";
tooltip.style.zIndex = "9999";
tooltip.style.maxWidth = "300px";
tooltip.style.fontSize = "14px";
tooltip.style.display = "none";
tooltip.style.pointerEvents = "auto";
document.body.appendChild(tooltip);
setTooltipElement(tooltip);

const tooltipState: {
  spanHover: boolean;
  tooltipHover: boolean;
  hideTimeout: number | null;
  hideTooltip: () => void;
  currentMode: string;
  original: string;
  definition: string;
  currentVocab: string;
} = {
  spanHover: false,
  tooltipHover: false,
  hideTimeout: null,
  hideTooltip,
  currentMode: "",
  original: "",
  definition: "",
  currentVocab: "",
};

function showTooltipAdapter(event: MouseEvent, span: HTMLSpanElement) {
  if (suppressTooltipUntilLeave) return;
  tooltipState.spanHover = true;
  tooltipState.currentMode = span.dataset.mode || "";
  tooltipState.original = span.dataset.original || "";
  tooltipState.definition = span.dataset.definition || "";
  tooltipState.currentVocab =
    span.dataset.replacedWith || span.dataset.vocabMatch || "";
  // Enrich tooltip state with POS and audio if present
  if (span.dataset.partOfSpeech) {
    (tooltipState as any).partOfSpeech = span.dataset.partOfSpeech;
  }
  if (span.dataset.audioUrl) {
    (tooltipState as any).audioUrl = span.dataset.audioUrl;
  }
  showTooltipDom(event, tooltipState);
  bindTooltipControls(span);
}

function maybeHideTooltipAdapter() {
  // leaving the span
  tooltipState.spanHover = false;
  tooltipState.hideTimeout = maybeHideTooltipUtil(
    tooltipState.spanHover,
    tooltipState.tooltipHover,
    tooltipState.hideTimeout,
    hideTooltip
  );
  // Reset suppression after leaving the span
  suppressTooltipUntilLeave = false;
}

function bindTooltipControls(span: HTMLSpanElement) {
  const tooltipEl = document.getElementById("vocab-tooltip");
  if (!tooltipEl) return;

  const closeBtn = tooltipEl.querySelector(
    "#closeTooltip"
  ) as HTMLButtonElement | null;
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTooltip();
      tooltipState.spanHover = false;
      tooltipState.tooltipHover = false;

      // Re-open on next slight movement while still over this span
      const reopenOnMove = (ev: MouseEvent) => {
        span.removeEventListener("mousemove", reopenOnMove);
        showTooltipAdapter(ev, span);
      };
      span.addEventListener("mousemove", reopenOnMove, { once: true });
    };
  }

  const toggleOriginalBtn = tooltipEl.querySelector(
    "#toggleOriginal"
  ) as HTMLButtonElement | null;
  if (toggleOriginalBtn) {
    toggleOriginalBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mode = span.dataset.mode || "";
      const original = span.dataset.original || "";
      const replacedWith = span.dataset.replacedWith || "";
      if (mode === "replace") {
        if (span.textContent === replacedWith) {
          span.textContent = original;
          toggleOriginalBtn.textContent = "Show Replacement";
        } else {
          span.textContent = replacedWith || original;
          toggleOriginalBtn.textContent = "Show Original";
        }
      }
    };
  }

  const ignoreBtn = tooltipEl.querySelector(
    "#ignoreInstance"
  ) as HTMLButtonElement | null;
  if (ignoreBtn) {
    ignoreBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const synonym = (span.textContent || "").toLowerCase();
      const relatedVocab = (
        span.dataset.replacedWith ||
        span.dataset.vocabMatch ||
        ""
      ).toLowerCase();
      // Persist to ignoredWords and ignoredEntries, then reprocess the page
      chrome.storage.sync.get(["ignoredWords", "ignoredEntries"], (data) => {
        const ignored: string[] = data.ignoredWords || [];
        const entries: Array<{ synonym: string; vocabWord: string }> =
          data.ignoredEntries || [];
        if (!ignored.includes(synonym)) ignored.push(synonym);
        if (!entries.some((e) => e.synonym === synonym))
          entries.push({ synonym, vocabWord: relatedVocab });
        chrome.storage.sync.set(
          { ignoredWords: ignored, ignoredEntries: entries },
          () => {
            // Remove the span immediately for feedback
            const original = span.dataset.original || span.textContent || "";
            const parent = span.parentNode;
            if (parent)
              parent.replaceChild(document.createTextNode(original), span);
            // Reprocess page with updated ignore list
            revertAllModifications();
            const pageWords = getPageWords();
            chrome.runtime.sendMessage(
              { type: "PAGE_WORDS", payload: pageWords },
              async (response) => {
                const { ignoredWords = [] } = await chrome.storage.sync.get(
                  "ignoredWords"
                );
                const ignoredSet = new Set(
                  ignoredWords.map((w: string) => w.toLowerCase())
                );
                if (response && response.replacementMap) {
                  processPage(
                    response.replacementMap,
                    span.dataset.mode || "replace",
                    ignoredSet as Set<string>,
                    showTooltipAdapter,
                    maybeHideTooltipAdapter
                  );
                }
              }
            );
            hideTooltip();
          }
        );
      });
    };
  }

  const toggleModeBtn = tooltipEl.querySelector(
    "#toggleMode"
  ) as HTMLButtonElement | null;
  if (toggleModeBtn) {
    toggleModeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const current = span.dataset.mode || "replace";
      const nextMode = current === "replace" ? "highlight" : "replace";
      toggleModeBtn.textContent = `Switch to ${
        nextMode === "replace" ? "Highlight" : "Replace"
      } Mode`;
      // Reflect toggleOriginal visibility immediately
      const toggleOriginalBtn = document.querySelector(
        "#vocab-tooltip #toggleOriginal"
      ) as HTMLButtonElement | null;
      if (toggleOriginalBtn) {
        toggleOriginalBtn.style.display =
          nextMode === "replace" ? "block" : "none";
      }
      // Update current span mode to keep tooltip state in sync until reprocess completes
      span.dataset.mode = nextMode;
      reprocessWithMode(nextMode, /* keepTooltip */ true);
    };
  }

  const playBtn = tooltipEl.querySelector(
    "#playAudio"
  ) as HTMLButtonElement | null;
  if (playBtn) {
    playBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = (tooltipState as any).audioUrl || span.dataset.audioUrl;
      if (url) {
        try {
          const audio = new Audio(url);
          audio.play().catch(() => {});
        } catch {}
      }
    };
  }
}

async function reprocessWithMode(nextMode: string, keepTooltip = true) {
  await chrome.storage.sync.set({ vocabMode: nextMode });
  // Re-run processing immediately without page refresh
  revertAllModifications();
  const pageWords = getPageWords();
  chrome.runtime.sendMessage(
    { type: "PAGE_WORDS", payload: pageWords },
    async (response) => {
      const { ignoredWords = [] } = await chrome.storage.sync.get(
        "ignoredWords"
      );
      const ignoredSet = new Set(
        ignoredWords.map((w: string) => w.toLowerCase())
      );
      if (response && response.replacementMap) {
        processPage(
          response.replacementMap,
          nextMode,
          ignoredSet as Set<string>,
          showTooltipAdapter,
          undefined
        );
        if (keepTooltip) {
          // Re-open tooltip over the same position/span if possible
          requestAnimationFrame(() => {
            const el = document.elementFromPoint(
              (window as any).lastMouseClientX || 0,
              (window as any).lastMouseClientY || 0
            ) as Element | null;
            const targetSpan = el?.closest?.(
              ".vocab-replace"
            ) as HTMLSpanElement | null;
            if (targetSpan) {
              const rect = targetSpan.getBoundingClientRect();
              const fakeEvent = new MouseEvent("mousemove", {
                clientX: rect.left + 4,
                clientY: rect.top + 4,
                bubbles: true,
              });
              showTooltipAdapter(fakeEvent as MouseEvent, targetSpan);
            }
          });
        }
      }
    }
  );
}

// On page load: Get words, send to background, get map and mode, then process
(async () => {
  // Check if current domain is blacklisted
  const { blacklistDomains = [] } = await chrome.storage.sync.get(
    "blacklistDomains"
  );
  const currentHost = window.location.hostname.toLowerCase();
  console.log(`Current host: ${currentHost}`);
  if (blacklistDomains.some((domain: string) => currentHost.includes(domain))) {
    console.log(`Domain blacklisted: ${currentHost}. Skipping processing.`);
    return; // Exit early
  }
  const pageWords = getPageWords();
  const response = await chrome.runtime.sendMessage({
    type: "PAGE_WORDS",
    payload: pageWords,
  });
  const { ignoredWords = [] } = await chrome.storage.sync.get("ignoredWords");
  const ignoredSet = new Set(ignoredWords.map((w: string) => w.toLowerCase()));
  if (response && response.replacementMap) {
    processPage(
      response.replacementMap,
      response.mode || "replace",
      ignoredSet as Set<string>,
      showTooltipAdapter,
      maybeHideTooltipAdapter
    );
  }
})();

// Listen for messages from popup (e.g., enable/disable)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_ENABLE") {
    if (message.enable) {
      // Re-enable: Re-fetch map and process with current mode
      chrome.storage.sync.get("vocabMode", async (data) => {
        const mode = data.vocabMode || "replace";
        const pageWords = getPageWords();
        const response = await chrome.runtime.sendMessage({
          type: "PAGE_WORDS",
          payload: pageWords,
        });
        const { ignoredWords = [] } = await chrome.storage.sync.get(
          "ignoredWords"
        );
        const ignoredSet = new Set(
          ignoredWords.map((w: string) => w.toLowerCase())
        );
        if (response && response.replacementMap) {
          processPage(
            response.replacementMap,
            mode,
            ignoredSet as Set<string>,
            showTooltipAdapter,
            maybeHideTooltipAdapter
          );
        }
      });
    } else {
      // Disable: Revert DOM and stop observers
      revertAllModifications();
      if ((window as any).vocabMutationObserver)
        (window as any).vocabMutationObserver.disconnect();
      if ((window as any).vocabIntersectionObserver)
        (window as any).vocabIntersectionObserver.disconnect();
    }
    sendResponse({ success: true });
  } else if (message.type === "SWITCH_MODE") {
    revertAllModifications(); // Undo current changes
    // Re-fetch page words and re-process with new mode
    const pageWords = getPageWords();
    chrome.runtime.sendMessage(
      { type: "PAGE_WORDS", payload: pageWords },
      async (response) => {
        const { ignoredWords = [] } = await chrome.storage.sync.get(
          "ignoredWords"
        );
        const ignoredSet = new Set(
          ignoredWords.map((w: string) => w.toLowerCase())
        );
        if (response && response.replacementMap) {
          processPage(
            response.replacementMap,
            message.mode,
            ignoredSet as Set<string>,
            showTooltipAdapter,
            maybeHideTooltipAdapter
          );
        }
      }
    );
    sendResponse({ success: true });
  } else if (message.type === "UNIGNORE_WORD") {
    // Re-process the page to re-highlight the unignored word
    revertAllModifications();
    const pageWords = getPageWords();
    chrome.runtime.sendMessage(
      { type: "PAGE_WORDS", payload: pageWords },
      async (response) => {
        const { ignoredWords = [] } = await chrome.storage.sync.get(
          "ignoredWords"
        );
        const ignoredSet = new Set(
          ignoredWords.map((w: string) => w.toLowerCase())
        );

        if (response && response.replacementMap) {
          processPage(
            response.replacementMap,
            response.mode || "replace",
            ignoredSet as Set<string>,
            showTooltipAdapter,
            maybeHideTooltipAdapter
          );
        }
      }
    );
    sendResponse({ success: true });
  }
  return true; // For async
});
