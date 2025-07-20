document.addEventListener("DOMContentLoaded", () => {
    const wordInput = document.getElementById("wordInput");
    const addButton = document.getElementById("addButton");
    const vocabList = document.getElementById("vocabList");

    // Load and display the current vocab list
    function loadVocab() {
        chrome.storage.sync.get("vocabWords", (data) => {
            const words = data.vocabWords || [];
            vocabList.innerHTML = "";
            words.forEach((word) => {
                const li = document.createElement("li");
                li.textContent = word;

                const deleteBtn = document.createElement("button");
                deleteBtn.textContent = "Delete";
                deleteBtn.style.marginLeft = "10px";
                deleteBtn.addEventListener("click", () => {
                    removeWord(word);
                });

                li.appendChild(deleteBtn);
                vocabList.appendChild(li);
            });
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
                        loadVocab();
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
                loadVocab();
            });
        });
    }

    loadVocab(); // Initial load
});