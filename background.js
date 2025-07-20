chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ADD_WORD") {
        fetchSynonymsAndCache(message.word);
        return true; // Keep the channel open if needed
    } else if (message.type === "PAGE_WORDS") {
        buildReplacementMap(message.payload).then((map) => {
            sendResponse({ replacementMap: map });
        });
        return true; // Async response
    }
});

// Fetch synonyms from Datamuse and cache them
async function fetchSynonymsAndCache(word) {
    try {
        const response = await fetch(`https://api.datamuse.com/words?rel_syn=${word}`);
        const synonyms = await response.json();

        await chrome.storage.local.set({ [word]: { synonyms } });
        console.log(`Cached synonyms for ${word} with synonyms:`, synonyms);
    } catch (error) {
        console.error(`Error fetching synonyms for ${word}:`, error);
    }
}

// Build replacement map from cached data
async function buildReplacementMap(pageWords) {
    const replacementMap = {};
    const { vocabWords = [] } = await chrome.storage.sync.get("vocabWords");
    const cache = await chrome.storage.local.get(vocabWords);

    const pageWordSet = new Set(pageWords);

    vocabWords.forEach((vocabWord) => {
        const cachedData = cache[vocabWord];
        if (cachedData && cachedData.synonyms) {
            cachedData.synonyms.forEach((syn) => {
                if (pageWordSet.has(syn.word)) {
                    replacementMap[syn.word] = vocabWord;
                }
            });
        }
    });

    return replacementMap;
}