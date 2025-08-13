// DOM and tooltip utility functions for content script

// Shared tooltip element (should be created in main script)
let tooltip: HTMLDivElement | null = null;
export function setTooltipElement(el: HTMLDivElement): void {
  tooltip = el;
}

// Function to show tooltip (now stays open until closed)
export function showTooltip(
  event: MouseEvent,
  options: {
    spanHover: boolean;
    tooltipHover: boolean;
    hideTimeout: number | null;
    hideTooltip: () => void;
    currentMode: string;
    original: string;
    definition: string;
    currentVocab: string;
  }
): void {
  // Remove any pending hide
  if (options.hideTimeout) {
    clearTimeout(options.hideTimeout);
    options.hideTimeout = null;
  }
  options.spanHover = true;
  // Set up tooltip hover listeners (only once)
  if (tooltip && !(tooltip as any)._hoverListenersSet) {
    tooltip.addEventListener("mouseenter", () => {
      options.tooltipHover = true;
      if (options.hideTimeout) {
        clearTimeout(options.hideTimeout);
        options.hideTimeout = null;
      }
    });
    tooltip.addEventListener("mouseleave", () => {
      options.tooltipHover = false;
      if (typeof options.hideTooltip === "function") options.hideTooltip();
    });
    (tooltip as any)._hoverListenersSet = true;
  }
  // Build interactive content (moved from main script)
  if (tooltip)
    tooltip.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <p><strong>Original:</strong> ${options.original}</p>
      <button id="closeTooltip" style="background: none; border: none; color: #fff; cursor: pointer; font-size: 16px;">×</button>
    </div>
    <p><strong>Definition:</strong> ${options.definition}</p>
    <button id="toggleOriginal" style="display: ${
      options.currentMode === "replace" ? "block" : "none"
    }; margin: 5px 0; padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Show Original</button>
    <button id="ignoreInstance" style="display: block; margin: 5px 0; padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Ignore This Word</button>
    <div style="margin-top: 5px;">
      <button id="toggleMode" style="padding: 4px; background: #555; border: none; color: #fff; cursor: pointer;">Switch to ${
        options.currentMode === "replace" ? "Highlight" : "Replace"
      } Mode</button>
    </div>
  `;
  // Position near mouse
  if (tooltip) {
    tooltip.style.left = `${event.pageX + 10}px`;
    tooltip.style.top = `${event.pageY + 10}px`;
    tooltip.style.display = "block";
  }
}

// Function to hide tooltip
export function hideTooltip(): void {
  if (tooltip) {
    tooltip.style.display = "none";
    tooltip.innerHTML = ""; // Clear content
  }
}
