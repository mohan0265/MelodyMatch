import { GameResult, GameSet, Song } from '../types';

const DB_NAME = 'MelodyMatchDB';
const DB_VERSION = 1;

const STORES = {
  SONGS: 'songs',
  SETS: 'sets',
  HISTORY: 'history',
} as const;

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.SONGS)) db.createObjectStore(STORES.SONGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.SETS)) db.createObjectStore(STORES.SETS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.HISTORY)) db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const persistence = {
  async saveSong(song: Song): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SONGS, 'readwrite');
      tx.objectStore(STORES.SONGS).put(song);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getSongs(): Promise<Song[]> {
    const db = await openDB();
    return new Promise((resolve) => {
      const request = db.transaction(STORES.SONGS).objectStore(STORES.SONGS).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  },

  async deleteSong(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SONGS, 'readwrite');
      tx.objectStore(STORES.SONGS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveSets(sets: GameSet[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SETS, 'readwrite');
      const store = tx.objectStore(STORES.SETS);
      sets.forEach((s) => store.put(s));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getSets(): Promise<GameSet[]> {
    const db = await openDB();
    return new Promise((resolve) => {
      const request = db.transaction(STORES.SETS).objectStore(STORES.SETS).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  },

  async saveHistory(result: GameResult): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.HISTORY, 'readwrite');
      tx.objectStore(STORES.HISTORY).put(result);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getHistory(): Promise<GameResult[]> {
    const db = await openDB();
    return new Promise((resolve) => {
      const request = db.transaction(STORES.HISTORY).objectStore(STORES.HISTORY).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  },

  /** Clears songs, sets, and history (for import/restore flows). */
  async clearAll() {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORES.SONGS, STORES.SETS, STORES.HISTORY], 'readwrite');
      tx.objectStore(STORES.SONGS).clear();
      tx.objectStore(STORES.SETS).clear();
      tx.objectStore(STORES.HISTORY).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  /** Seeds songs/sets/history after a clearAll(). */
  async seedAll(data: { songs: Song[]; sets: GameSet[]; history: GameResult[] }) {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORES.SONGS, STORES.SETS, STORES.HISTORY], 'readwrite');
      const songStore = tx.objectStore(STORES.SONGS);
      const setStore = tx.objectStore(STORES.SETS);
      const histStore = tx.objectStore(STORES.HISTORY);

      data.songs.forEach((s) => songStore.put(s));
      data.sets.forEach((s) => setStore.put(s));
      data.history.forEach((h) => histStore.put(h));

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
