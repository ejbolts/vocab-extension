chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ADD_WORD") {
        fetchDataAndCache(message.word);
        return true;
    } else if (message.type === "PAGE_WORDS") {
        buildReplacementMap(message.payload).then((map) => {
            sendResponse({ replacementMap: map });
        });
        return true; // Async response
    }
});

// Fetch synonyms (Datamuse) and definition (Dictionary API), then cache
async function fetchDataAndCache(word) {
    try {
        const [synResponse, defResponse] = await Promise.all([
            fetch(`https://api.datamuse.com/words?rel_syn=${word}`),
            fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
        ]);

        const synonyms = await synResponse.json();
        const definitions = await defResponse.json();

        const definition = definitions[0]?.meanings[0]?.definitions[0]?.definition || "No definition found";


        await chrome.storage.local.set({ [word]: { synonyms, definition } });
        console.log(`Cached data for ${word}`);
    } catch (error) {
        console.error(`Error fetching data for ${word}:`, error);
    }
}

// Build replacement map from cached data (now includes definition)
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
                    replacementMap[syn.word] = {
                        vocabWord,
                        definition: cachedData.definition || "No definition available"
                    };
                }
            });
        }
    });

    return replacementMap;
}