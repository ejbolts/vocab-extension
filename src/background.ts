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
// Fetch synonyms (Datamuse) + definitions, examples, audio, and POS (Free Dictionary API), then cache
async function fetchDataAndCache(word: string) {
  try {
    const [synResponse, defResponse] = await Promise.all([
      fetch(
        `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}`
      ),
      fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
          word
        )}`
      ),
    ]);

    const datamuseSyns: Array<{ word: string }> = await synResponse.json();
    const dictData = await defResponse.json();

    if (!Array.isArray(dictData) || !dictData[0]?.meanings) {
      console.warn(`No dictionary data found for "${word}"`);
      await chrome.storage.local.set({
        [word]: {
          synonyms: datamuseSyns,
          definition: "No definition found",
          partOfSpeech: "",
          audioUrl: "",
          senses: {},
        },
      });
      return;
    }

    const entry = dictData[0];
    const audioUrl =
      (entry.phonetics || []).find((p: any) => p && p.audio)?.audio || "";

    // Build senses grouped by part of speech
    const senses: Record<
      string,
      { definitions: string[]; examples: string[]; synonyms: string[] }
    > = {};

    entry.meanings.forEach((meaning: any) => {
      const pos = meaning.partOfSpeech || "unknown";
      if (!senses[pos]) {
        senses[pos] = { definitions: [], examples: [], synonyms: [] };
      }
      meaning.definitions.forEach((defObj: any) => {
        if (defObj.definition) senses[pos].definitions.push(defObj.definition);
        if (defObj.example) senses[pos].examples.push(defObj.example);
        if (Array.isArray(defObj.synonyms)) {
          defObj.synonyms.forEach((syn: string) => {
            if (!senses[pos].synonyms.includes(syn)) {
              senses[pos].synonyms.push(syn);
            }
          });
        }
      });
    });

    // Merge Datamuse synonyms into each POS group (loose match)
    // For now, just dump them into a "general" bucket or into all POS groups
    Object.keys(senses).forEach((pos) => {
      datamuseSyns.forEach((dm) => {
        if (!senses[pos].synonyms.includes(dm.word)) {
          senses[pos].synonyms.push(dm.word);
        }
      });
    });

    // Pick a default definition (first POS, first definition)
    const firstPos = Object.keys(senses)[0];
    const defaultDefinition =
      senses[firstPos]?.definitions[0] || "No definition found";

    await chrome.storage.local.set({
      [word]: {
        synonyms: datamuseSyns, // raw Datamuse list
        definition: defaultDefinition,
        partOfSpeech: firstPos,
        audioUrl,
        senses, // grouped by POS with definitions, examples, synonyms
      },
    });

    console.log(`Cached merged data for ${word}`, { senses });
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
