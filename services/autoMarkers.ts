
import { GameSetSong } from '../types';
import { platformBridge } from './platform';

/**
 * Heuristic Configuration
 */
const CONFIG = {
  INTRO_LEN: 8,
  INTERLUDE_LEN: 10,
  VOCAL_LEN: 8,
  WINDOW_SIZE: 0.5, // Analysis window in seconds
  RMS_THRESHOLD: 0.05, // Silence threshold
};

/**
 * Analyzes audio buffer to find structural landmarks.
 * 
 * Logic:
 * 1. Intro: From 0s to end of first quiet period or fixed duration.
 * 2. Vocal (Bonus): First sustained high-energy block after intro (approx).
 * 3. Interlude 1 (Main): High energy block distinct from vocal.
 * 4. Interlude 2 (Hint): Later high energy block.
 */
const analyzeStructure = (buffer: AudioBuffer): { 
  intro: { start: number, end: number },
  interlude1: { start: number, end: number },
  interlude2: { start: number, end: number },
  vocal: { start: number, end: number }
} => {
  const data = buffer.getChannelData(0); // Use mono for analysis
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  
  const windowSamples = Math.floor(sampleRate * CONFIG.WINDOW_SIZE);
  const windowsCount = Math.floor(data.length / windowSamples);
  
  const energyProfile: number[] = [];

  // 1. Compute Energy Profile (RMS)
  for (let i = 0; i < windowsCount; i++) {
    let sum = 0;
    const start = i * windowSamples;
    // Optimization: Skip every 4th sample to speed up loop
    for (let j = 0; j < windowSamples; j += 4) {
      sum += data[start + j] * data[start + j];
    }
    const rms = Math.sqrt(sum / (windowSamples / 4));
    energyProfile.push(rms);
  }

  // Helper to find regions
  const findRegion = (
    searchStartSec: number, 
    minDuration: number, 
    isLoud: boolean = true
  ): { start: number, end: number } => {
    const startIdx = Math.floor(searchStartSec / CONFIG.WINDOW_SIZE);
    if (startIdx >= energyProfile.length) return { start: duration - minDuration, end: duration };

    let bestStartIdx = startIdx;
    let maxEnergySum = 0;
    const windowSpan = Math.ceil(minDuration / CONFIG.WINDOW_SIZE);

    // Simple sliding window to find highest/lowest energy block
    for (let i = startIdx; i < energyProfile.length - windowSpan; i++) {
      let currentSum = 0;
      for (let j = 0; j < windowSpan; j++) {
        currentSum += energyProfile[i + j];
      }
      
      if (isLoud) {
        if (currentSum > maxEnergySum) {
          maxEnergySum = currentSum;
          bestStartIdx = i;
        }
      } else {
        // For quiet search (rarely used in this simplified version)
        if (maxEnergySum === 0 || currentSum < maxEnergySum) {
          maxEnergySum = currentSum;
          bestStartIdx = i;
        }
      }
    }

    const s = bestStartIdx * CONFIG.WINDOW_SIZE;
    return { start: s, end: Math.min(duration, s + minDuration) };
  };

  // --- HEURISTICS ---

  // Intro: Always start at 0. End is fixed for safety in offline mode without advanced vocal detection.
  const intro = { start: 0, end: Math.min(duration, CONFIG.INTRO_LEN) };

  // Bonus Vocal: Usually starts shortly after Intro. Look for loud block in 10s - 40s range.
  const vocal = findRegion(10, CONFIG.VOCAL_LEN, true);

  // Interlude 1 (Main): Look for instrumental break. Usually after 1st Chorus. 
  // Heuristic: Search after 45s.
  const interlude1 = findRegion(Math.max(45, vocal.end + 5), CONFIG.INTERLUDE_LEN, true);

  // Interlude 2 (Hint): Look for another break later.
  // Heuristic: Search after Interlude 1 + 20s.
  const interlude2 = findRegion(Math.max(interlude1.end + 20, 90), CONFIG.INTERLUDE_LEN, true);

  return { intro, interlude1, interlude2, vocal };
};

export const autoMarkersService = {
  /**
   * Process a single song and return suggested markers.
   */
  async processSong(songId: string): Promise<Partial<GameSetSong> | null> {
    try {
      const url = await platformBridge.getAudioUrl(songId);
      if (!url) return null;

      // Fetch blob/arraybuffer
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();

      // Decode Audio (Offline)
      // Note: decodeAudioData must run on main thread, but it's relatively fast for single files.
      // We will handle batch yielding in the UI layer.
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const structure = analyzeStructure(audioBuffer);

      // Map to GameSetSong format
      // MAPPING:
      // Intro -> Intro
      // Interlude 1 -> Main Clip (clipStart/End)
      // Interlude 2 -> Hint (hintStart/End)
      // Vocal -> Bonus (bonusStart/End)
      
      return {
        songId,
        introStart: structure.intro.start,
        introEnd: structure.intro.end,
        clipStart: structure.interlude1.start,
        clipEnd: structure.interlude1.end,
        hintStart: structure.interlude2.start,
        hintEnd: structure.interlude2.end,
        bonusStart: structure.vocal.start,
        bonusEnd: structure.vocal.end,
        isAutoMarked: true,
        isManuallyEdited: false,
        isConfigured: true
      };

    } catch (e) {
      console.error("Auto-marker failed for song:", songId, e);
      return null;
    }
  }
};
