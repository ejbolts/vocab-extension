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


    loadData(); // Initial load
});