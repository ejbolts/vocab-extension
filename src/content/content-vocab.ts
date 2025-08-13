// Vocab processing logic for content script

// Function to replace/highlight words based on map and mode
export function replaceVocab(
  replacementMap: Record<
    string,
    {
      vocabWord: string;
      definition: string;
      partOfSpeech?: string;
      audioUrl?: string;
    }
  >,
  mode: string,
  ignoredWords: Set<string> = new Set(),
  rootNode: Node = document.body,
  showTooltip?: (event: MouseEvent, span: HTMLSpanElement) => void,
  maybeHideTooltip?: () => void,
  matchedWordsGlobal?: Set<string>
): void {
  if (Object.keys(replacementMap).length === 0) return;

  // Temporarily disconnect MutationObserver to avoid infinite loops from mutations
  if ((window as any).vocabMutationObserver) {
    (window as any).vocabMutationObserver.disconnect();
  }

  const regex = new RegExp(
    `\\b(${Object.keys(replacementMap).join("|")})\\b`,
    "gi"
  );
  function walk(node: Node) {
    // Skip if node is inside the tooltip
    if (
      node.nodeType === 1 &&
      (node as Element).closest &&
      (node as Element).closest("#vocab-tooltip")
    ) {
      return; // Don't process tooltip content
    }
    if (node.nodeType === 3) {
      const originalText = node.nodeValue;
      let hasReplacements = false;
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      (originalText as string).replace(
        regex,
        (fullMatch, captured, offset): string => {
          // Skip if ignored
          if (ignoredWords.has(fullMatch.toLowerCase())) {
            fragment.appendChild(
              document.createTextNode(
                (originalText as string).slice(
                  lastIndex,
                  offset + fullMatch.length
                )
              )
            );
            lastIndex = offset + fullMatch.length;
            return "";
          }
          hasReplacements = true;

          fragment.appendChild(
            document.createTextNode(
              (originalText as string).slice(lastIndex, offset)
            )
          );

          // Create the replacement span
          const lowerMatch = captured.toLowerCase();
          const { vocabWord, definition, partOfSpeech, audioUrl } =
            replacementMap[lowerMatch];
          const span = document.createElement("span");
          span.className = "vocab-replace";
          span.dataset.original = fullMatch;
          span.dataset.definition = definition || "No definition available";
          span.dataset.mode = mode;
          if (partOfSpeech) span.dataset.partOfSpeech = partOfSpeech;
          if (audioUrl) span.dataset.audioUrl = audioUrl;

          if (matchedWordsGlobal) matchedWordsGlobal.add(lowerMatch);

          if (mode === "replace") {
            span.textContent = vocabWord;
            span.dataset.replacedWith = vocabWord;
            // Visual indicator for replace mode as well (underline for readability)
            span.style.textDecoration = "underline";
            span.style.textDecorationThickness = "2px";
            span.style.textDecorationColor = "#f5c542";
          } else {
            span.textContent = fullMatch;
            span.dataset.vocabMatch = vocabWord;
            // Highlight mode uses underline instead of background for readability
            span.style.textDecoration = "underline";
            span.style.textDecorationThickness = "2px";
            span.style.textDecorationColor = "#f5c542";
          }

          // Hover listeners (shared state)
          span.addEventListener("mouseenter", (event) => {
            if (showTooltip) showTooltip(event, span);
          });
          span.addEventListener("mouseleave", () => {
            if (maybeHideTooltip) maybeHideTooltip();
          });

          fragment.appendChild(span);

          lastIndex = offset + fullMatch.length;
          return "";
        }
      );

      fragment.appendChild(
        document.createTextNode((originalText as string).slice(lastIndex))
      );

      if (hasReplacements) {
        (node.parentNode as Node).replaceChild(fragment, node);
      }
    } else if (
      node.nodeType === 1 &&
      node.nodeName !== "SCRIPT" &&
      node.nodeName !== "STYLE"
    ) {
      Array.from(node.childNodes).forEach(walk);
    }
  }

  const matchedWords = matchedWordsGlobal || new Set();

  walk(rootNode);

  if (matchedWords.size > 0) {
    chrome.runtime.sendMessage({
      type: "REPORT_MATCHES",
      payload: Array.from(matchedWords),
    });
  }

  // Reconnect MutationObserver after processing
  if ((window as any).vocabMutationObserver) {
    (window as any).vocabMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

// Main processing function (called on load and mutations)
export function processPage(
  replacementMap: Record<string, { vocabWord: string; definition: string }>,
  mode: string,
  ignoredSet: Set<string> = new Set(),
  showTooltip?: (event: MouseEvent, span: HTMLSpanElement) => void,
  maybeHideTooltip?: () => void | null
): void {
  // Initially process the full page (what's visible on load)
  replaceVocab(
    replacementMap,
    mode,
    ignoredSet,
    document.body,
    showTooltip,
    maybeHideTooltip
  );

  // Clean up any previous observers
  if ((window as any).vocabMutationObserver) {
    (window as any).vocabMutationObserver.disconnect();
  }
  if ((window as any).vocabIntersectionObserver) {
    (window as any).vocabIntersectionObserver.disconnect();
  }

  // Set up IntersectionObserver for viewport visibility
  (window as any).vocabIntersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (
          entry.isIntersecting &&
          !(entry.target as HTMLElement).dataset.vocabProcessed
        ) {
          // Process this subtree when it enters the viewport
          replaceVocab(
            replacementMap,
            mode,
            ignoredSet,
            entry.target,
            showTooltip,
            maybeHideTooltip
          );
          (entry.target as HTMLElement).dataset.vocabProcessed = "true"; // Mark as done
          (window as any).vocabIntersectionObserver.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.1,
    }
  );

  // Set up MutationObserver to detect new content and start observing it for intersection
  (window as any).vocabMutationObserver = new MutationObserver((mutations) => {
    let hasRelevantMutations = false;
    mutations.forEach((mutation) => {
      // Ignore mutations caused by the tooltip itself
      if (
        (mutation.target as HTMLElement).id === "vocab-tooltip" ||
        (mutation.addedNodes &&
          Array.from(mutation.addedNodes).some(
            (node) =>
              (node as HTMLElement).id === "vocab-tooltip" ||
              (node.nodeType === 1 &&
                (node as HTMLElement).closest &&
                (node as Element).closest("#vocab-tooltip"))
          ))
      ) {
        return; // Skip this mutation
      }

      if (mutation.type === "childList" && mutation.addedNodes.length) {
        // Skip if the added nodes look like own spans (extra safety)
        const isOwnMutation = Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === 1 &&
            (node as HTMLElement).classList?.contains("vocab-replace")
        );
        if (!isOwnMutation) {
          hasRelevantMutations = true;
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.textContent) {
              (window as any).vocabIntersectionObserver.observe(node);
            }
          });
        }
      }
    });
    if (hasRelevantMutations) {
      console.log(
        "Mutation detected, queuing new nodes for viewport observation..."
      );
    }
  });

  // Observe the body for mutations
  (window as any).vocabMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Observe major sections already on the page
  document.querySelectorAll("section, article, div").forEach((el) => {
    if (!(el as HTMLElement).dataset.vocabProcessed) {
      (window as any).vocabIntersectionObserver.observe(el);
    }
  });
}
