import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '../types';

export const getPlatform = (): Platform => {
  if ((window as any).electron) return Platform.Electron;
  if ((window as any).Capacitor?.getPlatform?.() === 'android') return Platform.Android;
  return Platform.Web;
};

const AUDIO_DB = 'MelodyMatchAudioDB';
const AUDIO_STORE = 'audio';
const AUDIO_DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB, AUDIO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
};

const putAudioBlob = async (id: string, blob: Blob) => {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAudioBlob = async (id: string): Promise<Blob | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readonly');
    const req = tx.objectStore(AUDIO_STORE).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
};

const deleteAudioBlob = async (id: string) => {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readwrite');
    tx.objectStore(AUDIO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const objectUrlCache = new Map<string, string>();
const cacheObjectUrl = (id: string, blob: Blob) => {
  const existing = objectUrlCache.get(id);
  if (existing) URL.revokeObjectURL(existing);
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(id, url);
  return url;
};

export const platformBridge = {
  async selectFiles(): Promise<{ name: string; blob: Blob; size: number }[]> {
    // 1. Try Modern File System Access API (Chrome/Edge/Desktop)
    // This provides a better native experience, but is blocked in cross-origin iframes.
    if (typeof (window as any).showOpenFilePicker === 'function') {
      try {
        const handles = await (window as any).showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Audio Files',
            accept: {
              'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
            }
          }]
        });
        
        const files = await Promise.all(handles.map(async (h: any) => {
          const file = await h.getFile();
          return { name: file.name, blob: file, size: file.size };
        }));
        
        return files;
      } catch (err: any) {
        // If user cancels, it throws AbortError. Return empty.
        if (err.name === 'AbortError') return [];
        // If it's a security error (iframe block), fall through to input fallback silently.
        if (err.name !== 'SecurityError') {
          console.warn('File System Access API failed, falling back to input', err);
        }
      }
    }

    // 2. Fallback to Input Element (Firefox/Safari/Mobile/Sandboxed Iframes)
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*,.mp3,.wav,.m4a,.ogg';
      
      // Use visibility:hidden instead of display:none to avoid some browser quirks
      input.style.visibility = 'hidden';
      input.style.position = 'absolute';
      input.style.top = '-9999px';
      
      document.body.appendChild(input);

      // Add a small delay for cleanup to ensure event processing
      const cleanup = () => {
        setTimeout(() => {
          if (document.body.contains(input)) {
            document.body.removeChild(input);
          }
        }, 1000);
      };

      input.onchange = () => {
        const files = Array.from(input.files || []);
        const mapped = files.map(f => ({ name: f.name, blob: f, size: f.size }));
        resolve(mapped);
        cleanup();
      };

      input.oncancel = () => {
        resolve([]);
        cleanup();
      };

      input.click();
    });
  },

  async saveAudio(id: string, blob: Blob): Promise<string> {
    const platform = getPlatform();
    const fileName = `${id}.mp3`;

    if (platform === Platform.Android) {
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          await Filesystem.writeFile({
            path: `library/${fileName}`,
            data: base64data,
            directory: Directory.Data,
            recursive: true,
          });
          resolve(fileName);
        };
        reader.readAsDataURL(blob);
      });
    }

    if (platform === Platform.Electron) {
      await (window as any).electron.saveAudio(id, blob);
      return fileName;
    }

    await putAudioBlob(id, blob);
    cacheObjectUrl(id, blob);
    return fileName;
  },

  async getAudioUrl(id: string): Promise<string> {
    const platform = getPlatform();
    const fileName = `${id}.mp3`;

    if (platform === Platform.Android) {
      const { uri } = await Filesystem.getUri({
        path: `library/${fileName}`,
        directory: Directory.Data,
      });
      return (window as any).Capacitor.convertFileSrc(uri);
    }

    if (platform === Platform.Electron) {
      const url = await (window as any).electron.getAudioUrl(id);
      return url || '';
    }

    const cached = objectUrlCache.get(id);
    if (cached) return cached;

    const blob = await getAudioBlob(id);
    if (!blob) return '';
    return cacheObjectUrl(id, blob);
  },

  async deleteAudio(id: string) {
    const platform = getPlatform();
    if (platform === Platform.Android) {
      try { await Filesystem.deleteFile({ path: `library/${id}.mp3`, directory: Directory.Data }); } catch (_) {}
      return;
    }
    if (platform === Platform.Electron) {
      await (window as any).electron.deleteAudio(id);
      return;
    }
    const cached = objectUrlCache.get(id);
    if (cached) {
      URL.revokeObjectURL(cached);
      objectUrlCache.delete(id);
    }
    await deleteAudioBlob(id);
  },
};