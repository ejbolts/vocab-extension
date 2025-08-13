// Utility functions for content script

// Utility debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Extract and filter unique words from page
export function getPageWords(): string[] {
  const text = document.body.innerText.toLowerCase();
  const allWords = text.match(/\b\w+\b/g) || [];
  const STOP_WORDS = new Set([
    "a",
    "about",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "what",
    "when",
    "where",
    "who",
    "will",
    "with",
    "he",
    "she",
    "they",
    "him",
    "her",
    "them",
  ]);
  const filtered = allWords.filter(
    (word) => word.length > 2 && !STOP_WORDS.has(word)
  );
  return [...new Set(filtered)]; // Unique words
}

// Function to revert all modifications (undo spans, restore original text)
export function revertAllModifications(): void {
  const spans = document.querySelectorAll(".vocab-replace");
  spans.forEach((span) => {
    const parent = span.parentNode;
    parent?.replaceChild(
      document.createTextNode((span as HTMLElement).dataset.original!),
      span
    );
  });
}

// Hide tooltip only if mouse is not over span or tooltip, after 300ms
export function maybeHideTooltip(
  spanHover: boolean,
  tooltipHover: boolean,
  hideTimeout: number | null,
  hideTooltip: () => void
): number | null {
  if (!spanHover && !tooltipHover) {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!spanHover && !tooltipHover) {
        hideTooltip();
      }
    }, 300);
  }
  return hideTimeout;
}
