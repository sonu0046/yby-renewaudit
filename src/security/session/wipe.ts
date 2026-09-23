export async function wipeSession(): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    window.sessionStorage.clear();
    if ("indexedDB" in window && window.indexedDB.databases) {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
    }
  }
}
