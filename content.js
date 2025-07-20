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
function showTooltip(event, original, definition) {
    tooltip.innerHTML = `
    <strong>Original:</strong> ${original}<br>
    <strong>Definition:</strong> ${definition}
  `;
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

// Function to replace words based on map
function replaceVocab(replacementMap) {
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

                // Add text before the match
                fragment.appendChild(
                    document.createTextNode(originalText.slice(lastIndex, offset))
                );

                // Create the replacement span
                const lowerMatch = captured.toLowerCase();
                const { vocabWord, definition } = replacementMap[lowerMatch];
                const span = document.createElement("span");
                span.className = "vocab-replace"; // For potential styling
                span.style.backgroundColor = "yellow";
                span.textContent = vocabWord;
                span.dataset.original = fullMatch; // Store for hover
                span.dataset.definition = definition;

                // Add hover listeners
                span.addEventListener("mouseenter", (event) => {
                    showTooltip(event, span.dataset.original, span.dataset.definition);
                });
                span.addEventListener("mouseleave", hideTooltip);

                fragment.appendChild(span);

                lastIndex = offset + fullMatch.length;
            });

            // Add remaining text
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

    walk(document.body);
}

// On page load: Get words, send to background, get map, replace
(async () => {
    const pageWords = getPageWords();
    const response = await chrome.runtime.sendMessage({ type: "PAGE_WORDS", payload: pageWords });
    if (response && response.replacementMap) {
        replaceVocab(response.replacementMap);
    }
})();