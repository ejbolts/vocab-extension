// Vocab list and word management logic for popup script

// Remove a word from vocab list
export function removeWord(
  wordToRemove: string,
  searchInput: HTMLInputElement,
  hideSynonyms: () => void,
  loadData: (filter?: string) => void
): void {
  chrome.storage.sync.get("vocabWords", (data) => {
    let words = data.vocabWords || [];
    words = words.filter((w: string) => w !== wordToRemove);
    chrome.storage.sync.set({ vocabWords: words }, () => {
      chrome.storage.local.remove(wordToRemove);
      hideSynonyms(); // Hide if the deleted word was selected
      loadData(searchInput.value); // Refresh with current filter
    });
  });
}

// Add a new word to vocab list
export function addWord(
  newWord: string,
  wordInput: HTMLInputElement,
  searchInput: HTMLInputElement,
  loadData: (filter?: string) => void
): void {
  chrome.storage.sync.get("vocabWords", (data) => {
    const words = data.vocabWords || [];
    if (!words.includes(newWord)) {
      words.push(newWord);
      chrome.storage.sync.set({ vocabWords: words }, () => {
        chrome.runtime.sendMessage({ type: "ADD_WORD", word: newWord });
        wordInput.value = "";
        loadData(searchInput.value); // Refresh with current filter
      });
    }
  });
}

// Import vocab from file
export function importVocab(file: File, loadData: () => void): void {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedData = JSON.parse(e.target?.result as string);
      // Merge vocabWords (avoid duplicates)
      const currentSync = await chrome.storage.sync.get([
        "vocabWords",
        "vocabMode",
        "blacklistDomains",
      ]);
      const mergedWords = [
        ...new Set([
          ...(currentSync.vocabWords || []),
          ...(importedData.vocabWords || []),
        ]),
      ];
      // Merge settings (overwrite with imported if present)
      const mergedMode =
        importedData.settings?.vocabMode || currentSync.vocabMode || "replace";
      const mergedBlacklist =
        importedData.settings?.blacklistDomains ||
        currentSync.blacklistDomains ||
        [];
      // Set sync data
      await chrome.storage.sync.set({
        vocabWords: mergedWords,
        vocabMode: mergedMode,
        blacklistDomains: mergedBlacklist,
      });
      // Merge cache (overwrite or add)
      const importedCache = importedData.cache || {};
      await chrome.storage.local.set(importedCache);
      // For any new words without cache, fetch data
      const newWordsWithoutCache = mergedWords.filter(
        (word) => !importedCache[word]
      );
      for (const word of newWordsWithoutCache) {
        chrome.runtime.sendMessage({ type: "ADD_WORD", word });
      }
      loadData(); // Refresh UI
      alert("Vocab imported successfully!");
    } catch (error) {
      console.error("Import error:", error);
      alert("Error importing file. Please check the format.");
    }
  };
  reader.readAsText(file);
}

// Export vocab and cache as JSON
export async function exportVocab(): Promise<void> {
  const syncData = await chrome.storage.sync.get([
    "vocabWords",
    "vocabMode",
    "blacklistDomains",
  ]);
  const vocabWords = syncData.vocabWords || [];
  const localData = await chrome.storage.local.get(vocabWords);
  // Combine into one object
  const exportData = {
    vocabWords: vocabWords,
    cache: localData,
    settings: {
      vocabMode: syncData.vocabMode || "replace",
      blacklistDomains: syncData.blacklistDomains || [],
    },
  };
  // Create downloadable JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vocab-booster-export.json";
  a.click();
  URL.revokeObjectURL(url);
  console.log("Vocab exported!");
}

// Remove a word from the ignored list
export function removeIgnoredWord(
  wordToAllow: string,
  reload: () => void
): void {
  chrome.storage.sync.get("ignoredWords", (data) => {
    let ignored: string[] = data.ignoredWords || [];
    ignored = ignored.filter((w) => w !== wordToAllow);
    chrome.storage.sync.set({ ignoredWords: ignored }, () => reload());
  });
}
