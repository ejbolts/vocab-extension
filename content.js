// Create a single tooltip element (shared for all hovers)
// Shared hover state and timeout for tooltip hiding
let tooltipHover = false;
let spanHover = false;
let hideTimeout = null;
const tooltip = document.createElement("div");
tooltip.id = "vocab-tooltip"; // For mutation ignoring
tooltip.style.position = "absolute";
tooltip.style.backgroundColor = "#333";
tooltip.style.color = "#fff";
tooltip.style.padding = "8px";
tooltip.style.borderRadius = "4px";
tooltip.style.zIndex = "9999";
tooltip.style.maxWidth = "300px";
tooltip.style.fontSize = "14px";
tooltip.style.display = "none";
tooltip.style.pointerEvents = "auto"; // Allow interactions (buttons clickable)
document.body.appendChild(tooltip);

// Function to show tooltip (now stays open until closed)
function showTooltip(event, span) {
    // Remove any pending hide
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    spanHover = true;
    // Set up tooltip hover listeners (only once)
    if (!tooltip._hoverListenersSet) {
        tooltip.addEventListener("mouseenter", () => {
            tooltipHover = true;
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
        });
        tooltip.addEventListener("mouseleave", () => {
            tooltipHover = false;
            maybeHideTooltip();
        });
        tooltip._hoverListenersSet = true;
    }
    const original = span.dataset.original;
    const definition = span.dataset.definition;
    const currentVocab = span.dataset.replacedWith || span.dataset.vocabMatch; // Current mapping
    const currentMode = span.dataset.mode || "replace"; // Assume from creation

    // Build interactive content
    tooltip.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <p><strong>Original:</strong> ${original}</p>
      <button id="closeTooltip" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 16px;">×</button>
    </div>
    <p><strong>Definition:</strong> ${definition}</p>
    <button id="toggleOriginal" style="display: block; margin: 5px 0; padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Show Original</button>
    <button id="ignoreInstance" style="display: block; margin: 5px 0; padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Ignore This Instance</button>
    <div style="margin-top: 5px;">
      <button id="switchToHighlight" style="padding: 4px; background: #555; border: none; color: #fff; cursor: pointer; margin-right: 5px;">Switch to Highlight</button>
      <button id="switchToReplace" style="padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Switch to Replace</button>
    </div>
  `;

    // Position near mouse
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.display = "block";

    // Close button (only way to hide)
    document.getElementById("closeTooltip").addEventListener("click", hideTooltip);

    // Toggle Original/Replace button
    const toggleBtn = document.getElementById("toggleOriginal");
    let showingOriginal = false;
    toggleBtn.addEventListener("click", () => {
        if (!showingOriginal) {
            span.textContent = original; // Show original
            toggleBtn.textContent = "Show Replace";
            showingOriginal = true;
        } else {
            span.textContent = currentVocab; // Show replaced
            toggleBtn.textContent = "Show Original";
            showingOriginal = false;
        }
    });

    // Ignore This Instance button
    document.getElementById("ignoreInstance").addEventListener("click", () => {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(original), span); // Revert to plain text
        hideTooltip();
    });

    // Mode switch buttons
    document.getElementById("switchToHighlight").addEventListener("click", () => switchMode("highlight"));
    document.getElementById("switchToReplace").addEventListener("click", () => switchMode("replace"));
}

// Function to hide tooltip
function hideTooltip() {
    tooltip.style.display = "none";
    tooltip.innerHTML = ""; // Clear content
}

// Function to switch mode real-time
async function switchMode(newMode) {
    await chrome.storage.sync.set({ vocabMode: newMode });
    revertAllModifications(); // Undo current changes
    // Re-fetch page words and re-process with new mode
    const pageWords = getPageWords();
    const response = await chrome.runtime.sendMessage({ type: "PAGE_WORDS", payload: pageWords });
    if (response && response.replacementMap) {
        processPage(response.replacementMap, newMode);
    }
    hideTooltip(true); // Close tooltip after switch
}

const STOP_WORDS = new Set([
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this",
    "to", "was", "what", "when", "where", "who", "will", "with", "he", "she",
    "they", "him", "her", "them",
]);

// Utility debounce function
function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
}

// Hide tooltip only if mouse is not over span or tooltip, after 300ms
function maybeHideTooltip() {
    if (!spanHover && !tooltipHover) {
        if (hideTimeout) clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            if (!spanHover && !tooltipHover) {
                hideTooltip();
            }
        }, 300);
    }
}

// Extract and filter unique words from page
function getPageWords() {
    const text = document.body.innerText.toLowerCase();
    const allWords = text.match(/\b\w+\b/g) || [];
    const filtered = allWords.filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    return [...new Set(filtered)]; // Unique words
}

// Function to replace/highlight words based on map and mode
function replaceVocab(replacementMap, mode, rootNode = document.body) {
    if (Object.keys(replacementMap).length === 0) return;

    // Temporarily disconnect MutationObserver to avoid infinite loops from mutations
    if (window.vocabMutationObserver) {
        window.vocabMutationObserver.disconnect();
    }

    const regex = new RegExp(`\\b(${Object.keys(replacementMap).join("|")})\\b`, "gi");
    function walk(node) {
        // Skip if node is inside the tooltip
        if (node.nodeType === 1 && node.closest && node.closest("#vocab-tooltip")) {
            return; // Don't process tooltip content
        }
        if (node.nodeType === 3) {
            const originalText = node.nodeValue;
            let hasReplacements = false;
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            originalText.replace(regex, (fullMatch, captured, offset) => {
                hasReplacements = true;

                fragment.appendChild(
                    document.createTextNode(originalText.slice(lastIndex, offset))
                );

                // Create the replacement span
                const lowerMatch = captured.toLowerCase();
                const { vocabWord, definition } = replacementMap[lowerMatch];
                const span = document.createElement("span");
                span.className = "vocab-replace";
                span.style.backgroundColor = "yellow";
                span.dataset.original = fullMatch;
                span.dataset.definition = definition || "No definition available";

                matchedWords.add(lowerMatch); // Add the matched synonym 

                if (mode === "replace") {
                    span.textContent = vocabWord;
                    span.dataset.replacedWith = vocabWord; // Flag for replace mode
                } else {
                    span.textContent = fullMatch;
                    span.dataset.vocabMatch = vocabWord; // Flag for highlight mode
                }


                // Hover listeners (shared state)
                span.addEventListener("mouseenter", (event) => {
                    spanHover = true;
                    if (hideTimeout) {
                        clearTimeout(hideTimeout);
                        hideTimeout = null;
                    }
                    showTooltip(event, span);
                });
                span.addEventListener("mouseleave", () => {
                    spanHover = false;
                    maybeHideTooltip();
                });


                fragment.appendChild(span);

                lastIndex = offset + fullMatch.length;
            });

            fragment.appendChild(
                document.createTextNode(originalText.slice(lastIndex))
            );

            if (hasReplacements) {
                node.parentNode.replaceChild(fragment, node);
            }
        } else if (node.nodeType === 1 && node.nodeName !== "SCRIPT" && node.nodeName !== "STYLE") {
            Array.from(node.childNodes).forEach(walk);
        }
    }

    const matchedWords = new Set(); // To collect unique matches in this run

    walk(rootNode);

    if (matchedWords.size > 0) {
        chrome.runtime.sendMessage({
            type: "REPORT_MATCHES",
            payload: Array.from(matchedWords)
        });
    }

    // Reconnect MutationObserver after processing
    if (window.vocabMutationObserver) {
        window.vocabMutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}
// Function to revert all modifications (undo spans, restore original text)
function revertAllModifications() {
    const spans = document.querySelectorAll(".vocab-replace");
    spans.forEach((span) => {
        const parent = span.parentNode;
        parent.replaceChild(document.createTextNode(span.dataset.original), span);
    });
}


// On page load: Get words, send to background, get map and mode, then process
(async () => {
    // Check if current domain is blacklisted
    const { blacklistDomains = [] } = await chrome.storage.sync.get("blacklistDomains");
    const currentHost = window.location.hostname.toLowerCase();
    console.log(`Current host: ${currentHost}`);
    if (blacklistDomains.some((domain) => currentHost.includes(domain))) {
        console.log(`Domain blacklisted: ${currentHost}. Skipping processing.`);
        return; // Exit early
    }
    const pageWords = getPageWords();
    const response = await chrome.runtime.sendMessage({ type: "PAGE_WORDS", payload: pageWords });
    if (response && response.replacementMap) {
        processPage(response.replacementMap, response.mode || "replace");
    }
})();

// Main processing function (called on load and mutations)
function processPage(replacementMap, mode) {
    // Initially process the full page (what's visible on load)
    replaceVocab(replacementMap, mode);

    // Clean up any previous observers
    if (window.vocabMutationObserver) {
        window.vocabMutationObserver.disconnect();
    }
    if (window.vocabIntersectionObserver) {
        window.vocabIntersectionObserver.disconnect();
    }

    // Set up IntersectionObserver for viewport visibility
    window.vocabIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting && !entry.target.dataset.vocabProcessed) {
                // Process this subtree when it enters the viewport
                replaceVocab(replacementMap, mode, entry.target);
                entry.target.dataset.vocabProcessed = "true"; // Mark as done
                window.vocabIntersectionObserver.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.1
    });

    // Set up MutationObserver to detect new content and start observing it for intersection
    window.vocabMutationObserver = new MutationObserver((mutations) => {
        let hasRelevantMutations = false;
        mutations.forEach((mutation) => {

            // Ignore mutations caused by the tooltip itself
            if (
                mutation.target.id === "vocab-tooltip" ||
                (mutation.addedNodes && Array.from(mutation.addedNodes).some(
                    node => node.id === "vocab-tooltip" ||
                        (node.nodeType === 1 && node.closest && node.closest("#vocab-tooltip"))
                ))
            ) {
                return; // Skip this mutation
            }

            if (mutation.type === "childList" && mutation.addedNodes.length) {
                // Skip if the added nodes look like own spans (extra safety)
                const isOwnMutation = Array.from(mutation.addedNodes).some(
                    (node) => node.nodeType === 1 && node.classList?.contains("vocab-replace")
                );
                if (!isOwnMutation) {
                    hasRelevantMutations = true;
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.textContent) {
                            window.vocabIntersectionObserver.observe(node);
                        }
                    });
                }
            }
        });
        if (hasRelevantMutations) {
            console.log("Mutation detected, queuing new nodes for viewport observation...");
        }
    });

    // Observe the body for mutations
    window.vocabMutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Observe major sections already on the page
    document.querySelectorAll("section, article, div").forEach((el) => {
        if (!el.dataset.vocabProcessed) {
            window.vocabIntersectionObserver.observe(el);
        }
    });
}
// Listen for messages from popup (e.g., enable/disable)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "TOGGLE_ENABLE") {
        if (message.enable) {
            // Re-enable: Re-fetch map and process with current mode
            chrome.storage.sync.get("vocabMode", async (data) => {
                const mode = data.vocabMode || "replace";
                const pageWords = getPageWords();
                const response = await chrome.runtime.sendMessage({ type: "PAGE_WORDS", payload: pageWords });
                if (response && response.replacementMap) {
                    processPage(response.replacementMap, mode); // Your existing process function
                }
            });
        } else {
            // Disable: Revert DOM and stop observers
            revertAllModifications();
            if (window.vocabMutationObserver) window.vocabMutationObserver.disconnect();
            if (window.vocabIntersectionObserver) window.vocabIntersectionObserver.disconnect();
        }
        sendResponse({ success: true });
    } else if (message.type === "SWITCH_MODE") {
        revertAllModifications(); // Undo current changes
        // Re-fetch page words and re-process with new mode
        const pageWords = getPageWords();
        chrome.runtime.sendMessage({ type: "PAGE_WORDS", payload: pageWords }, (response) => {
            if (response && response.replacementMap) {
                processPage(response.replacementMap, message.mode);
            }
        });
        sendResponse({ success: true });
    }
    return true; // For async
});