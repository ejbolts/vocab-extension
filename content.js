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

            // Use replace as an iterator, but build DOM nodes manually
            originalText.replace(regex, (fullMatch, captured, offset) => {
                hasReplacements = true;

                // Add text before the match
                fragment.appendChild(
                    document.createTextNode(originalText.slice(lastIndex, offset))
                );

                // Create the replacement span
                const lowerMatch = captured.toLowerCase();
                const replacementWord = replacementMap[lowerMatch];
                const span = document.createElement("span");
                span.style.backgroundColor = "yellow";
                span.textContent = replacementWord;
                span.title = `Original: ${fullMatch}`; // Preserve original casing in title
                fragment.appendChild(span);

                // Update lastIndex to after the match
                lastIndex = offset + fullMatch.length;
            });

            // Add any remaining text after the last match
            fragment.appendChild(
                document.createTextNode(originalText.slice(lastIndex))
            );

            // Only replace if we actually made changes (avoids unnecessary DOM mutations)
            if (hasReplacements) {
                node.parentNode.replaceChild(fragment, node);
            }
        } else if (node.nodeType === 1 && node.nodeName !== "SCRIPT" && node.nodeName !== "STYLE") {
            // Recurse through children (use Array.from to avoid mutating live collections)
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