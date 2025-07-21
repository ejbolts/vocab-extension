document.addEventListener("DOMContentLoaded", () => {
    const wordInput = document.getElementById("wordInput");
    const addButton = document.getElementById("addButton");
    const vocabList = document.getElementById("vocabList");
    const modeSelect = document.getElementById("modeSelect");


    // Load and display the current vocab list and settings
    function loadData() {
        chrome.storage.sync.get(["vocabWords", "vocabMode", "blacklistDomains"], (data) => {
            const words = data.vocabWords || [];
            const mode = data.vocabMode || "replace";
            const blacklist = data.blacklistDomains || [];

            vocabList.innerHTML = "";
            words.forEach((word) => {
                const li = document.createElement("li");
                li.textContent = word;

                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Delete";
                deleteBtn.style.marginLeft = "10px";
                deleteBtn.addEventListener("click", () => removeWord(word));

                li.appendChild(deleteBtn);
                vocabList.appendChild(li);
            });

            modeSelect.value = mode;
            document.getElementById("blacklistInput").value = blacklist.join(", ");
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
                        // Notify background to fetch data
                        chrome.runtime.sendMessage({ type: "ADD_WORD", word: newWord });
                        wordInput.value = "";
                        loadData();
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
                // Also remove from cache
                chrome.storage.local.remove(wordToRemove);
                loadData();
            });
        });
    }

    // Save mode setting on change
    modeSelect.addEventListener("change", (event) => {
        const newMode = event.target.value;
        chrome.storage.sync.set({ vocabMode: newMode }, () => {
            console.log(`Mode set to: ${newMode}`);
        });
    });

    // Save blacklist
    document.getElementById("saveBlacklist").addEventListener("click", () => {
        const input = document.getElementById("blacklistInput").value.trim();
        const domains = input ? input.split(",").map((d) => d.trim().toLowerCase()) : [];
        chrome.storage.sync.set({ blacklistDomains: domains }, () => {
            console.log(`Blacklist saved: ${domains}`);
            alert("Blacklist updated!"); // Simple feedback
        });
    });



    const exportButton = document.getElementById("exportButton");
    const importButton = document.getElementById("importButton");
    const importFile = document.getElementById("importFile");

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


    loadData(); // Initial load
});