// Utility and storage functions for popup script

// Get vocab words from storage
export function getVocabWords(callback: (words: string[]) => void) {
  chrome.storage.sync.get(["vocabWords"], (data) => {
    callback(data.vocabWords || []);
  });
}

// Set vocab words in storage
export function setVocabWords(words: string[], callback: () => void) {
  chrome.storage.sync.set({ vocabWords: words }, callback);
}

// Get vocab mode from storage
export function getVocabMode(callback: (mode: string) => void) {
  chrome.storage.sync.get(["vocabMode"], (data) => {
    callback(data.vocabMode || "replace");
  });
}

// Set vocab mode in storage
export function setVocabMode(mode: string, callback: () => void) {
  chrome.storage.sync.set({ vocabMode: mode }, callback);
}

// Get blacklist domains from storage
export function getBlacklistDomains(callback: (domains: string[]) => void) {
  chrome.storage.sync.get(["blacklistDomains"], (data) => {
    callback(data.blacklistDomains || []);
  });
}

// Set blacklist domains in storage
export function setBlacklistDomains(domains: string[], callback: () => void) {
  chrome.storage.sync.set({ blacklistDomains: domains }, callback);
}

// Filter and sort vocab words
export function filterAndSortWords(words: string[], filter: string) {
  let filtered = words.filter((word) =>
    word.toLowerCase().includes(filter.toLowerCase())
  );
  filtered.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
  return filtered;
}
