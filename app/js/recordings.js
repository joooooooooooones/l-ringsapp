'use strict';

// Forælderens optagelser af ugens ord, gemt på enheden i IndexedDB (lyd fylder for meget til localStorage).
// Hver post: { word, type, data (ArrayBuffer) }. Uden IndexedDB (f.eks. privat vindue i ældre browsere)
// holdes optagelserne kun i hukommelsen, og persistent er false.
window.RECORDINGS = (() => {
  const DB_NAME = 'stav-og-regn';
  const STORE = 'recordings';
  const memory = new Map();
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null);
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'word' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
    }
    return dbPromise;
  }

  // Kører én handling på lageret og giver resultatet (eller fallback ved fejl).
  async function run(mode, action, fallback) {
    const db = await open();
    if (!db) return fallback();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => resolve(fallback());
        tx.onabort = () => resolve(fallback());
      } catch (e) {
        resolve(fallback());
      }
    });
  }

  return {
    persistent: () => open().then((db) => !!db),
    words: () => run('readonly', (s) => s.getAllKeys(), () => Array.from(memory.keys())),
    get: (word) => run('readonly', (s) => s.get(word), () => memory.get(word)),
    all: () => run('readonly', (s) => s.getAll(), () => Array.from(memory.values())),
    put: (rec) => run('readwrite', (s) => s.put(rec), () => { memory.set(rec.word, rec); }),
    remove: (word) => run('readwrite', (s) => s.delete(word), () => { memory.delete(word); }),
  };
})();
