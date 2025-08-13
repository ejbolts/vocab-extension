// DOM and rendering functions for popup script

// Show synonyms in the shared section
export function showSynonyms(
  word: string,
  _li: HTMLLIElement,
  selectedWordElem: HTMLElement,
  wordDefinition: HTMLElement,
  synonymsList: HTMLUListElement,
  synonymsSection: HTMLElement
): void {
  chrome.storage.local.get(word, (data) => {
    const cachedData = data[word];
    selectedWordElem.textContent = word;

    if (cachedData) {
      wordDefinition.textContent =
        cachedData.definition || "No definition available.";
      synonymsList.innerHTML = "";
      if (cachedData.synonyms && cachedData.synonyms.length > 0) {
        cachedData.synonyms.forEach((syn: { word: string }) => {
          const synLi = document.createElement("li");
          synLi.textContent = syn.word;
          synLi.style.cursor = "default";
          synLi.style.userSelect = "text";
          synonymsList.appendChild(synLi);
        });
      } else {
        synonymsList.innerHTML = "<li>No synonyms found.</li>";
      }
    } else {
      wordDefinition.textContent =
        "No data found. Try re-adding the word to refresh cache.";
      synonymsList.innerHTML = "";
    }

    synonymsSection.style.display = "block";
  });
}

// Hide synonyms section
export function hideSynonyms(
  selectedLi: HTMLLIElement | null,
  synonymsSection: HTMLElement,
  synonymsList: HTMLUListElement
): HTMLLIElement | null {
  if (selectedLi) {
    selectedLi.classList.remove("selected");
    selectedLi = null;
  }
  synonymsSection.style.display = "none";
  synonymsList.innerHTML = "";
  return selectedLi;
}

// Render vocab list
export function renderVocabList(
  filteredWords: string[],
  vocabList: HTMLUListElement,
  showSynonymsHandler: (
    word: string,
    li: HTMLLIElement,
    event: MouseEvent
  ) => void,
  removeWordHandler: (word: string) => void
): void {
  vocabList.innerHTML = "";
  filteredWords.forEach((word) => {
    const li = document.createElement("li");
    li.className = "vocab-word";

    // Delete icon (before the word)
    const deleteIcon = document.createElement("span");
    deleteIcon.className = "delete-icon";
    deleteIcon.textContent = "X";
    deleteIcon.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent triggering li click
      removeWordHandler(word);
    });
    li.appendChild(deleteIcon);

    // Word text
    const wordSpan = document.createElement("span");
    wordSpan.textContent = word;
    wordSpan.style.flex = "1";
    li.appendChild(wordSpan);

    // Click to show synonyms in shared section
    li.addEventListener("click", (event) => {
      showSynonymsHandler(word, li, event);
    });

    vocabList.appendChild(li);
  });
}

// Update stats
export function updateStats(
  allWords: string[],
  stats: { totalEncounters: number; pagesProcessed: number },
  statWordsElem: HTMLElement,
  statEncountersElem: HTMLElement,
  statPagesElem: HTMLElement
): void {
  statWordsElem.textContent = allWords.length.toString();
  statEncountersElem.textContent = stats.totalEncounters.toString();
  statPagesElem.textContent = stats.pagesProcessed.toString();
}

// Render ignore list
export function renderIgnoreList(
  ignoredEntries: Array<{ synonym: string; vocabWord: string }>,
  ignoreList: HTMLUListElement,
  removeIgnoredHandler: (word: string) => void
): void {
  ignoreList.innerHTML = "";
  ignoredEntries
    .slice()
    .sort((a, b) =>
      a.synonym.localeCompare(b.synonym, undefined, { sensitivity: "base" })
    )
    .forEach(({ synonym, vocabWord }) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.margin = "5px 0";

      const deleteIcon = document.createElement("span");
      deleteIcon.className = "delete-icon";
      deleteIcon.textContent = "X";
      deleteIcon.addEventListener("click", () => removeIgnoredHandler(synonym));
      deleteIcon.style.marginRight = "5px";
      li.appendChild(deleteIcon);

      const textSpan = document.createElement("span");
      textSpan.style.flex = "1";
      textSpan.textContent = `${synonym}  (from: ${vocabWord || "?"})`;
      li.appendChild(textSpan);

      ignoreList.appendChild(li);
    });
}
