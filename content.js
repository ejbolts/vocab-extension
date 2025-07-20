
// Function to walk through text nodes and highlight matches
function highlightVocab() {
    chrome.storage.sync.get("vocabWords", (data) => {
        const vocabWords = new Set((data.vocabWords || []).map((w) => w.toLowerCase()));

        if (vocabWords.size === 0) return;

        // Recursive function to traverse DOM text nodes
        function walk(node) {
            if (node.nodeType === 3) { // Text node
                const text = node.nodeValue;
                const words = text.split(/\b/); // Split on word boundaries
                const newNodes = [];

                words.forEach((word) => {
                    if (vocabWords.has(word.toLowerCase())) {
                        const span = document.createElement("span");
                        span.style.backgroundColor = "yellow"; // Simple highlight
                        span.textContent = word;
                        newNodes.push(span);
                    } else {
                        newNodes.push(document.createTextNode(word));
                    }
                });

                // Replace the original text node with new nodes
                newNodes.forEach((newNode) => node.parentNode.insertBefore(newNode, node));
                node.parentNode.removeChild(node);
            } else if (node.nodeType === 1 && node.nodeName !== "SCRIPT" && node.nodeName !== "STYLE") {
                // Element node, recurse through children
                Array.from(node.childNodes).forEach(walk); // Use Array.from to avoid live collection issues
            }
        }

        walk(document.body);
    });
}

// Run on page load
highlightVocab();