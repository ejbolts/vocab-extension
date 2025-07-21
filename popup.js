document.addEventListener("DOMContentLoaded", () => {
    const wordInput = document.getElementById("wordInput");
    const addButton = document.getElementById("addButton");
    const vocabList = document.getElementById("vocabList");
    const searchInput = document.getElementById("searchInput");
    const modeSelect = document.getElementById("modeSelect");
    const exportButton = document.getElementById("exportButton");
    const importButton = document.getElementById("importButton");
    const importFile = document.getElementById("importFile");

    let allWords = []; // Cache of all vocab words for filtering

    // Load and display data
    function loadData(filter = "") {
        chrome.storage.sync.get(["vocabWords", "vocabMode", "blacklistDomains"], (syncData) => {
            chrome.storage.local.get(["vocabStats"], (localData) => {
                allWords = syncData.vocabWords || [];
                const mode = syncData.vocabMode || "replace";
                const blacklist = syncData.blacklistDomains || [];
                const stats = localData.vocabStats || { totalEncounters: 0, pagesProcessed: 0 };

                // Filter words based on search
                const filteredWords = allWords.filter((word) =>
                    word.toLowerCase().includes(filter.toLowerCase())
                );

                vocabList.innerHTML = "";
                filteredWords.forEach((word) => {
                    const li = document.createElement("li");
                    li.textContent = word;

                    // Delete button
                    const deleteBtn = document.createElement("button");
                    deleteBtn.textContent = "Delete";
                    deleteBtn.style.marginLeft = "10px";
                    deleteBtn.addEventListener("click", () => removeWord(word));

                    li.appendChild(deleteBtn);

                    // Expandable synonyms section
                    const synonymsDiv = document.createElement("div");
                    synonymsDiv.className = "synonyms";
                    synonymsDiv.innerHTML = `<p>Loading synonyms...</p>`;
                    li.appendChild(synonymsDiv);

                    // Click to toggle synonyms
                    li.addEventListener("click", (event) => {
                        if (event.target !== deleteBtn) { // Avoid triggering on delete click
                            toggleSynonyms(word, synonymsDiv);
                        }
                    });

                    vocabList.appendChild(li);
                });

                modeSelect.value = mode;
                document.getElementById("blacklistInput").value = blacklist.join(", ");

                // Display stats
                document.getElementById("statWords").textContent = allWords.length;
                document.getElementById("statEncounters").textContent = stats.totalEncounters;
                document.getElementById("statPages").textContent = stats.pagesProcessed;

                // Get current tab URL
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const url = tabs[0]?.url || "No active tab";
                    document.getElementById("currentUrl").textContent = new URL(url).hostname;
                });
            });
        });
    }

    // Toggle synonyms display
    function toggleSynonyms(word, synonymsDiv) {
        if (synonymsDiv.style.display === "block") {
            synonymsDiv.style.display = "none";
            return;
        }

        chrome.storage.local.get(word, (data) => {
            const cachedData = data[word];
            if (cachedData && cachedData.synonyms && cachedData.synonyms.length > 0) {
                const synonymList = cachedData.synonyms.map((syn) => `<li>${syn.word}</li>`).join("");
                synonymsDiv.innerHTML = `<ul>${synonymList}</ul>`;
            } else {
                synonymsDiv.innerHTML = `<p>No synonyms found. Try re-adding the word to refresh cache.</p>`;
            }
            synonymsDiv.style.display = "block";
        });
    }

    // Add a new word and notify background
    addButton.addEventListener("click", () => {
        const newWord = wordInput.value.trim().toLowerCase();
        if (newWord) {
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
    });

    // Remove a word
    function removeWord(wordToRemove) {
        chrome.storage.sync.get("vocabWords", (data) => {
            let words = data.vocabWords || [];
            words = words.filter((w) => w !== wordToRemove);
            chrome.storage.sync.set({ vocabWords: words }, () => {
                chrome.storage.local.remove(wordToRemove);
                loadData(searchInput.value); // Refresh with current filter
            });
        });
    }

    // Save mode setting
    modeSelect.addEventListener("change", (event) => {
        const newMode = event.target.value;
        chrome.storage.sync.set({ vocabMode: newMode });
    });

    // Save blacklist
    document.getElementById("saveBlacklist").addEventListener("click", () => {
        const input = document.getElementById("blacklistInput").value.trim();
        const domains = input ? input.split(",").map((d) => d.trim().toLowerCase()) : [];
        chrome.storage.sync.set({ blacklistDomains: domains }, () => {
            alert("Blacklist updated!");
        });
    });



    // Export vocab and cache as JSON
    exportButton.addEventListener("click", async () => {
        const syncData = await chrome.storage.sync.get(["vocabWords", "vocabMode", "blacklistDomains"]);
        const vocabWords = syncData.vocabWords || [];
        const localData = await chrome.storage.local.get(vocabWords);

        // Combine into one object
        const exportData = {
            vocabWords: vocabWords,
            cache: localData,
            settings: {
                vocabMode: syncData.vocabMode || "replace",
                blacklistDomains: syncData.blacklistDomains || []
            }
        };

        // Create downloadable JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vocab-booster-export.json";
        a.click();
        URL.revokeObjectURL(url);
        console.log("Vocab exported!");
    });

    // Trigger file input for import
    importButton.addEventListener("click", () => {
        importFile.click();
    });

    // Handle file import
    importFile.addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);

                    // Merge vocabWords (avoid duplicates)
                    const currentSync = await chrome.storage.sync.get(["vocabWords", "vocabMode", "blacklistDomains"]);
                    const mergedWords = [...new Set([...(currentSync.vocabWords || []), ...(importedData.vocabWords || [])])];

                    // Merge settings (overwrite with imported if present)
                    const mergedMode = importedData.settings?.vocabMode || currentSync.vocabMode || "replace";
                    const mergedBlacklist = importedData.settings?.blacklistDomains || currentSync.blacklistDomains || [];

                    // Set sync data
                    await chrome.storage.sync.set({
                        vocabWords: mergedWords,
                        vocabMode: mergedMode,
                        blacklistDomains: mergedBlacklist
                    });

                    // Merge cache (overwrite or add)
                    const importedCache = importedData.cache || {};
                    await chrome.storage.local.set(importedCache);

                    // For any new words without cache, fetch data
                    const newWordsWithoutCache = mergedWords.filter((word) => !importedCache[word]);
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
    });
    // Search filtering
    searchInput.addEventListener("input", (event) => {
        loadData(event.target.value); // Re-render with filter
    });

    loadData(); // Initial load
});