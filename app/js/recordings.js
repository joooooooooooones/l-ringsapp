'use strict';

// Forælderens optagelser af ugens ord, gemt på enheden i IndexedDB (lyd fylder for meget til localStorage).
// Hver post: { word, type, data (ArrayBuffer) }. Findes IndexedDB slet ikke (f.eks. privat vindue i ældre
// browsere), holdes optagelserne kun i hukommelsen, og persistent() giver false.
// put/remove/replaceAll giver true, når ændringen er gemt, og false ved fejl – så appen aldrig viser
// en optagelse som gemt, når den ikke er det.
window.RECORDINGS = (() => {
  const DB_NAME = 'stav-og-regn';
  const STORE = 'recordings';
  const memory = new Map();
  let dbPromise = null;
  let noDb = false; // sand, når IndexedDB ikke kan bruges i denne browser

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        if (!window.indexedDB) {
          noDb = true;
          return resolve(null);
        }
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { noDb = true; return resolve(null); }
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'word' });
        req.onsuccess = () => {
          const db = req.result;
          // Lukkes forbindelsen (f.eks. iOS efter baggrund), åbnes en ny næste gang.
          db.onclose = () => { dbPromise = null; };
          resolve(db);
        };
        req.onerror = () => { noDb = true; resolve(null); };
        req.onblocked = () => { dbPromise = null; resolve(null); };
      });
    }
    return dbPromise;
  }

  // Én transaktion. Giver { ok, result }; uden database bruges memoryAction.
  async function tx(mode, action, memoryAction, retry = true) {
    const db = await open();
    if (!db) return noDb ? { ok: true, result: memoryAction() } : { ok: false };
    return new Promise((resolve) => {
      let req;
      try {
        const t = db.transaction(STORE, mode);
        req = action(t.objectStore(STORE));
        t.oncomplete = () => resolve({ ok: true, result: req ? req.result : undefined });
        t.onerror = () => resolve({ ok: false });
        t.onabort = () => resolve({ ok: false });
      } catch (e) {
        // Typisk en lukket forbindelse: prøv én gang mere med en ny.
        dbPromise = null;
        resolve(retry ? tx(mode, action, memoryAction, false) : { ok: false });
      }
    });
  }

  const read = (action, memoryAction, empty) => tx('readonly', action, memoryAction).then((r) => (r.ok ? r.result : empty));
  const write = (action, memoryAction) => tx('readwrite', action, memoryAction).then((r) => r.ok);

  return {
    persistent: () => open().then(() => !noDb),
    words: () => read((s) => s.getAllKeys(), () => Array.from(memory.keys()), []),
    get: (word) => read((s) => s.get(word), () => memory.get(word), undefined),
    all: () => read((s) => s.getAll(), () => Array.from(memory.values()), []),
    put: (rec) => write((s) => s.put(rec), () => { memory.set(rec.word, rec); }),
    remove: (word) => write((s) => s.delete(word), () => { memory.delete(word); }),
    // Erstatter alle optagelser i én transaktion (gendannelse af sikkerhedskopi): alt eller intet.
    replaceAll: (recs) => write((s) => {
      s.clear();
      recs.forEach((r) => s.put(r));
    }, () => {
      memory.clear();
      recs.forEach((r) => memory.set(r.word, r));
    }),
  };
})();
