
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
                vocabList.appendChild(li);
            });
        });
    }

    // Add a new word
    addButton.addEventListener("click", () => {
        const newWord = wordInput.value.trim().toLowerCase();
        if (newWord) {
            chrome.storage.sync.get("vocabWords", (data) => {
                const words = data.vocabWords || [];
                if (!words.includes(newWord)) {
                    words.push(newWord);
                    chrome.storage.sync.set({ vocabWords: words }, () => {
                        wordInput.value = "";
                        loadVocab(); // Refresh the list
                    });
                }
            });
        }
    });

    loadVocab(); // Initial load
});