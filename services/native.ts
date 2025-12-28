import { Platform } from '../types';

// This service mocks or interfaces with actual native bridges
export const getPlatform = (): Platform => {
  if ((window as any).electron) return Platform.Electron;
  // Fix: Property 'Capacitor' does not exist on type 'typeof Platform'. Changed to Platform.Android to align with types.ts
  if ((window as any).Capacitor) return Platform.Android;
  return Platform.Web;
};

export const pickFiles = async (): Promise<{ name: string; blob: Blob }[]> => {
  const platform = getPlatform();
  
  if (platform === Platform.Web || platform === Platform.Electron) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/mpeg,audio/wav,audio/mp3';
      input.onchange = async (e: any) => {
        const files = Array.from(e.target.files) as File[];
        const results = files.map(file => ({
          name: file.name,
          blob: file as Blob
        }));
        resolve(results);
      };
      input.click();
    });
  }
  
  // For Capacitor, we would use FilePicker or SAF. 
  // In this demo, we use the standard file input as fallback.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*';
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files) as File[];
      const results = files.map(file => ({
        name: file.name,
        blob: file as Blob
      }));
      resolve(results);
    };
    input.click();
  });
};

export const saveToLibrary = async (id: string, blob: Blob): Promise<string> => {
  // In a real app, this would write to FS. For the demo, we use URL.createObjectURL
  // and store the blob in IndexedDB or similar if persistent storage was fully implemented.
  return URL.createObjectURL(blob);
};

export const readMetadata = (blob: Blob): Promise<{ title?: string; artist?: string }> => {
  return new Promise((resolve) => {
    if (!(window as any).jsmediatags) {
      console.warn('jsmediatags not loaded');
      resolve({});
      return;
    }

    (window as any).jsmediatags.read(blob, {
      onSuccess: (tag: any) => {
        resolve({
          title: tag.tags.title?.trim(),
          artist: tag.tags.artist?.trim()
        });
      },
      onError: (error: any) => {
        console.warn('Could not read ID3 tags:', error);
        resolve({});
      }
    });
  });
};
