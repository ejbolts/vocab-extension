// Create a single tooltip element (shared for all hovers)
const tooltip = document.createElement("div");
tooltip.style.position = "absolute";
tooltip.style.backgroundColor = "#333";
tooltip.style.color = "#fff";
tooltip.style.padding = "8px";
tooltip.style.borderRadius = "4px";
tooltip.style.zIndex = "9999";
tooltip.style.pointerEvents = "none"; // So it doesn't block clicks
tooltip.style.display = "none";
tooltip.style.maxWidth = "300px";
tooltip.style.fontSize = "14px";
document.body.appendChild(tooltip);

// Function to show tooltip
function showTooltip(event, span) {
    let content = '';

    if (span.dataset.replacedWith) {
        // Replace mode: Show original and definition
        content = `
      <strong>Original word:</strong> ${span.dataset.original}<br>
      <strong>Definition (${span.dataset.original}):</strong> ${span.dataset.definition}
    `;
    } else if (span.dataset.vocabMatch) {
        // Highlight mode: Show vocab match and definition
        content = `
      <strong>Vocab Match:</strong> ${span.dataset.vocabMatch}<br>
      <strong>Definition:</strong> ${span.dataset.definition}
    `;
    } else {
        // Fallback (shouldn't happen)
        content = 'No data available';
    }

    tooltip.innerHTML = content;
    tooltip.style.display = "block";
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
}

// Function to hide tooltip
function hideTooltip() {
    tooltip.style.display = "none";
}

const STOP_WORDS = new Set([
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this",
    "to", "was", "what", "when", "where", "who", "will", "with", "he", "she",
    "they", "him", "her", "them",
]);

// Extract and filter unique words from page
function getPageWords() {
    const text = document.body.innerText.toLowerCase();
    const allWords = text.match(/\b\w+\b/g) || [];
    const filtered = allWords.filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    return [...new Set(filtered)]; // Unique words
}

// Function to replace/highlight words based on map and mode (optional rootNode for mutations)
function replaceVocab(replacementMap, mode, rootNode = document.body) {
    if (Object.keys(replacementMap).length === 0) return;

    const regex = new RegExp(`\\b(${Object.keys(replacementMap).join("|")})\\b`, "gi");

    function walk(node) {
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

                if (mode === "replace") {
                    span.textContent = vocabWord;
                    span.dataset.replacedWith = vocabWord; // Flag for replace mode
                } else {
                    span.textContent = fullMatch; // Highlight mode: keep original
                    span.dataset.vocabMatch = vocabWord; // Flag for highlight mode
                }

                // Hover listeners (pass the span to showTooltip)
                span.addEventListener("mouseenter", (event) => {
                    showTooltip(event, span);  // Updated to pass span
                });
                span.addEventListener("mouseleave", hideTooltip);

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

    walk(rootNode);
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
    replaceVocab(replacementMap, mode); // Run the DOM walk

    // Clean up any previous observer
    if (window.vocabObserver) {
        window.vocabObserver.disconnect();
    }

    // Set up MutationObserver for dynamic content
    window.vocabObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList" && mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        replaceVocab(replacementMap, mode, node); // Process only the new subtree
                    }
                });
            }
        });
    });

    window.vocabObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}