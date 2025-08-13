// Import utility and logic modules
import {
  getBlacklistDomains,
  setBlacklistDomains,
  filterAndSortWords,
  setVocabMode,
} from "./popup-utils.js";
import {
  showSynonyms as showSynonymsDom,
  hideSynonyms as hideSynonymsDom,
  renderVocabList,
  updateStats,
  renderIgnoreList,
} from "./popup-dom.js";
import {
  removeWord as removeWordVocab,
  addWord as addWordVocab,
  importVocab,
  exportVocab,
  removeIgnoredWord,
} from "./popup-vocab.js";

document.addEventListener("DOMContentLoaded", () => {
  const wordInput = document.getElementById("wordInput") as HTMLInputElement;
  const addButton = document.getElementById("addButton") as HTMLButtonElement;
  const vocabList = document.getElementById("vocabList") as HTMLUListElement;
  const searchInput = document.getElementById(
    "searchInput"
  ) as HTMLInputElement;
  const modeButton = document.getElementById(
    "modeButton"
  )! as HTMLButtonElement;
  const enableButton = document.getElementById(
    "enableButton"
  ) as HTMLButtonElement;
  const saveBlacklist = document.getElementById(
    "saveBlacklist"
  ) as HTMLButtonElement;
  const blacklistInput = document.getElementById(
    "blacklistInput"
  ) as HTMLInputElement;
  const exportButton = document.getElementById(
    "exportButton"
  ) as HTMLButtonElement;
  const importButton = document.getElementById(
    "importButton"
  ) as HTMLButtonElement;
  const importFile = document.getElementById("importFile") as HTMLInputElement;
  const synonymsSection = document.getElementById(
    "synonymsSection"
  ) as HTMLDivElement;
  const selectedWordElem = document.getElementById(
    "selectedWord"
  ) as HTMLSpanElement;
  const wordDefinition = document.getElementById(
    "wordDefinition"
  ) as HTMLParagraphElement;
  const wordPos = document.getElementById("wordPos") as HTMLSpanElement;
  const playAudioBtn = document.getElementById(
    "playWordAudio"
  ) as HTMLButtonElement;
  const synonymsList = document.getElementById(
    "synonymsList"
  ) as HTMLUListElement;
  const closeSynonyms = document.getElementById(
    "closeSynonyms"
  ) as HTMLButtonElement;
  const ignoreList = document.getElementById("ignoreList") as HTMLUListElement;
  const modeHelp = document.getElementById("modeHelp") as HTMLSpanElement;
  const currentUrl = document.getElementById("currentUrl") as HTMLSpanElement;
  const statWords = document.getElementById("statWords") as HTMLSpanElement;
  const statEncounters = document.getElementById(
    "statEncounters"
  ) as HTMLSpanElement;
  const statPages = document.getElementById("statPages") as HTMLSpanElement;

  let selectedLi: HTMLLIElement | null = null;

  // Load data function
  const loadData = (filter = "") => {
    chrome.storage.sync.get(
      ["vocabWords", "vocabMode", "enableExtension"],
      (syncData) => {
        const allWords = syncData.vocabWords || [];
        const mode = syncData.vocabMode || "replace";
        const enableState = syncData.enableExtension !== false;

        // Use utility to get blacklist
        getBlacklistDomains((blacklist) => {
          const statsPromise = new Promise((resolve) => {
            chrome.storage.local.get("vocabStats", (localData) => {
              resolve(
                localData.vocabStats || {
                  totalEncounters: 0,
                  pagesProcessed: 0,
                }
              );
            });
          });

          statsPromise.then((stats) => {
            // Update UI
            modeButton.textContent =
              mode === "replace" ? "Replace" : "Highlight";
            if (modeHelp) {
              modeHelp.title =
                mode === "replace"
                  ? "Currently replacing all synonyms with the words you are currently learning."
                  : "Highlighting words that are synonyms of words you are currently learning.";
            }

            enableButton.textContent = enableState ? "On" : "Off";
            blacklistInput.value = blacklist.join(", ");
            updateStats(
              allWords,
              stats as { totalEncounters: number; pagesProcessed: number },
              statWords!,
              statEncounters!,
              statPages!
            );

            // Load and render ignored synonyms with mapping
            chrome.storage.sync.get(
              ["ignoredWords", "ignoredEntries"],
              (syncIgnored) => {
                const entries = (syncIgnored.ignoredEntries || []) as Array<{
                  synonym: string;
                  vocabWord: string;
                }>;
                // Backfill entries from plain list if needed
                const fallback = (syncIgnored.ignoredWords || []) as string[];
                const finalEntries = entries.length
                  ? entries
                  : fallback.map((s) => ({ synonym: s, vocabWord: "" }));
                renderIgnoreList(finalEntries, ignoreList, (word: string) => {
                  removeIgnoredWord(word, () => {
                    // Also update entries store
                    chrome.storage.sync.get("ignoredEntries", (d2) => {
                      const e2 = (d2.ignoredEntries || []) as Array<{
                        synonym: string;
                        vocabWord: string;
                      }>;
                      const updated = e2.filter((e) => e.synonym !== word);
                      chrome.storage.sync.set({ ignoredEntries: updated }, () =>
                        loadData(filter)
                      );
                    });
                  });
                });
              }
            );

            // Get current tab URL
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const url = tabs[0]?.url || "No active tab";
              currentUrl!.textContent = new URL(url).hostname;
            });

            // Filter and sort words
            const filteredWords = filterAndSortWords(allWords, filter);

            // Render list
            renderVocabList(
              filteredWords,
              vocabList,
              (word, li) => {
                if (selectedLi === li) {
                  selectedLi = hideSynonymsDom(
                    selectedLi,
                    synonymsSection,
                    synonymsList
                  );
                } else {
                  showSynonymsDom(
                    word,
                    li,
                    selectedWordElem,
                    wordDefinition,
                    wordPos,
                    playAudioBtn,
                    synonymsList,
                    synonymsSection
                  );
                  selectedLi = li;
                }
              },
              (word: string) =>
                removeWordVocab(
                  word,
                  searchInput,
                  () =>
                    hideSynonymsDom(selectedLi, synonymsSection, synonymsList),
                  loadData
                )
            );
          });
        });
      }
    );
  };

  // Initial load
  loadData();

  // Event listeners
  addButton.addEventListener("click", () => {
    const newWord = wordInput.value.trim().toLowerCase();
    if (newWord) addWordVocab(newWord, wordInput, searchInput, loadData);
  });

  searchInput.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    loadData(target.value);
  });

  modeButton.addEventListener("click", () => {
    const newMode =
      modeButton.textContent?.toLowerCase() === "replace"
        ? "highlight"
        : "replace";
    setVocabMode(newMode, () => {
      const label = newMode.charAt(0).toUpperCase() + newMode.slice(1);
      modeButton.textContent = label;
      if (modeHelp) {
        modeHelp.title =
          newMode === "replace"
            ? "Currently replacing all synonyms with the words you are currently learning."
            : "Highlighting words that are synonyms of words you are currently learning.";
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id)
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "SWITCH_MODE",
            mode: newMode,
          });
      });
    });
  });

  enableButton.addEventListener("click", () => {
    const newState = enableButton.textContent !== "On";
    chrome.storage.sync.set({ enableExtension: newState }, () => {
      const label = newState ? "On" : "Off";
      enableButton.textContent = label;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0])
          chrome.tabs.sendMessage(tabs[0].id!, {
            type: "TOGGLE_ENABLE",
            enable: newState,
          });
      });
    });
  });

  saveBlacklist.addEventListener("click", () => {
    const input = blacklistInput.value.trim();
    const domains = input
      ? input.split(",").map((d) => d.trim().toLowerCase())
      : [];
    setBlacklistDomains(domains, () => alert("Blacklist updated!"));
  });

  closeSynonyms.addEventListener("click", () => {
    selectedLi = hideSynonymsDom(selectedLi, synonymsSection, synonymsList);
  });

  exportButton.addEventListener("click", exportVocab);

  importButton.addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) importVocab(file, loadData);
  });
});
