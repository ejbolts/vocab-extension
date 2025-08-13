// Create context menu for adding selected text to vocab
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "addToVocab",
    title: "Add to Vocab Booster",
    contexts: ["selection"], // Only show when text is selected
  });
});

// Add context menu for un-ignoring a word
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "unignoreVocab",
    title: "Unignore Word",
    contexts: ["selection"],
  });
});

// // Listen for context menu shown event to update unignore menu visibility
// function updateUnignoreMenu(selectionText: string) {
//   chrome.storage.sync.get("ignoredWords", (data) => {
//     const ignoredWords = data.ignoredWords || [];
//     const word = selectionText.trim().toLowerCase();
//     chrome.contextMenus.update("unignoreVocab", {
//       visible: ignoredWords.includes(word),
//     });
//   });
// }

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "addToVocab" && info.selectionText) {
    const newWord = info.selectionText.trim().toLowerCase();
    if (newWord) {
      chrome.storage.sync.get("vocabWords", (data) => {
        const words = data.vocabWords || [];
        if (!words.includes(newWord)) {
          words.push(newWord);
          chrome.storage.sync.set({ vocabWords: words }, () => {
            fetchDataAndCache(newWord); // Your existing fetch function
            console.log(`Added "${newWord}" via context menu`);
          });
        }
      });
    }
  } else if (info.menuItemId === "unignoreVocab" && info.selectionText) {
    const word = info.selectionText.trim().toLowerCase();
    chrome.storage.sync.get("ignoredWords", (data) => {
      let ignoredWords = data.ignoredWords || [];
      if (ignoredWords.includes(word)) {
        ignoredWords = ignoredWords.filter((w: string) => w !== word);
        chrome.storage.sync.set({ ignoredWords }, () => {
          // Also update mapping list used by popup
          chrome.storage.sync.get("ignoredEntries", (d2) => {
            const e2 = (d2.ignoredEntries || []) as Array<{
              synonym: string;
              vocabWord: string;
            }>;
            const updated = e2.filter((e) => e.synonym !== word);
            chrome.storage.sync.set({ ignoredEntries: updated });
          });
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Vocab Booster",
            message: `Unignored '${word}'.`,
          });
          // removeIgnoredWord(word, () => {
          //   // Also update entries store
          //   chrome.storage.sync.get("ignoredEntries", (d2) => {
          //     const e2 = (d2.ignoredEntries || []) as Array<{
          //       synonym: string;
          //       vocabWord: string;
          //     }>;
          //     const updated = e2.filter((e) => e.synonym !== word);
          //     chrome.storage.sync.set({ ignoredEntries: updated }, () => {
          //       console.log("Ignored entries updated");
          //     });
          //   });
          // });
          console.log(`Unignored '${word}' via context menu`);
          // Send message to active tab to re-process page
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "UNIGNORE_WORD",
                word,
              });
            }
          });
        });
      } else {
        chrome.notifications?.create({
          type: "basic",
          iconUrl: "icon.png",
          title: "Vocab Booster",
          message: `'${word}' is not ignored.`,
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ADD_WORD") {
    fetchDataAndCache(message.word);
    return true;
  } else if (message.type === "PAGE_WORDS") {
    buildReplacementMap(message.payload).then((result) => {
      sendResponse({ replacementMap: result.map, mode: result.mode });
    });
    return true;
  } else if (message.type === "REPORT_MATCHES") {
    updateStats(message.payload);
    return true;
  }
});

// Fetch synonyms (Datamuse) and definition (Dictionary API), then cache
async function fetchDataAndCache(word: string) {
  try {
    const [synResponse, defResponse] = await Promise.all([
      fetch(`https://api.datamuse.com/words?rel_syn=${word}`),
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`),
    ]);

    const synonyms = await synResponse.json();
    const definitions = await defResponse.json();

    const entry = Array.isArray(definitions) ? definitions[0] : undefined;
    const definition =
      entry?.meanings?.[0]?.definitions?.[0]?.definition ||
      "No definition found";
    const partOfSpeech = entry?.meanings?.[0]?.partOfSpeech || "";
    const audioUrl =
      (entry?.phonetics || []).find((p: any) => p && p.audio)?.audio || "";

    await chrome.storage.local.set({
      [word]: { synonyms, definition, partOfSpeech, audioUrl },
    });
    console.log(`Cached data for ${word}`);
  } catch (error) {
    console.error(`Error fetching data for ${word}:`, error);
  }
}

// Build replacement map from cached data (now includes definition)
async function buildReplacementMap(pageWords: string[]) {
  const replacementMap = {} as Record<
    string,
    {
      vocabWord: string;
      definition: string;
      partOfSpeech?: string;
      audioUrl?: string;
    }
  >;
  const { vocabWords = [] } = await chrome.storage.sync.get("vocabWords");
  const { vocabMode = "replace" } = await chrome.storage.sync.get("vocabMode");
  const cache = await chrome.storage.local.get(vocabWords);

  const pageWordSet = new Set(pageWords);

  vocabWords.forEach((vocabWord: string) => {
    const cachedData = cache[vocabWord];
    if (cachedData && cachedData.synonyms) {
      cachedData.synonyms.forEach((syn: { word: string }) => {
        if (pageWordSet.has(syn.word)) {
          replacementMap[syn.word] = {
            vocabWord,
            definition: cachedData.definition || "No definition available",
            partOfSpeech: cachedData.partOfSpeech || "",
            audioUrl: cachedData.audioUrl || "",
          };
        }
      });
    }
  });

  return { map: replacementMap, mode: vocabMode };
}

async function updateStats(matchedWords: string[]): Promise<void> {
  if (!matchedWords || matchedWords.length === 0) return;

  const { vocabStats = { totalEncounters: 0, pagesProcessed: 0 } } =
    await chrome.storage.local.get("vocabStats");

  // Update encounters
  vocabStats.totalEncounters += matchedWords.length;

  // Increment pages only once per report (per page load/process)
  vocabStats.pagesProcessed += 1;

  await chrome.storage.local.set({ vocabStats });
  console.log("Stats updated:", vocabStats);
}
