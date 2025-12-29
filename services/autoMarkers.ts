
import { GameSetSong } from '../types';
import { platformBridge } from './platform';

/**
 * Advanced Heuristic Configuration for Indian/Tamil Cinema Structure
 * Uses DSP to differentiate Vocals (Mid-range) from Instrumentals (Full-range/Percussive).
 */
const CONFIG = {
  WINDOW_SIZE: 0.1, // 100ms resolution
  
  // Weights for scoring
  VOCAL_WEIGHT: 2.0,       // How much to favor vocals when looking for Charanam
  INSTRUMENTAL_WEIGHT: 1.5, // How much to penalize vocals when looking for Interludes
  
  // Normalized Search Windows (Time / Duration)
  // Based on standard 4-5m song structure
  WINDOWS: {
    // Interlude 1: Usually after Pallavi/Anupallavi (approx 1:10 - 1:45)
    INTERLUDE_1: { min: 60, max: 110, normStart: 0.22, normEnd: 0.38 },
    
    // Charanam: Vocal verse after Interlude 1 (approx 1:50 - 2:30)
    CHARANAM: { min: 110, max: 160, normStart: 0.38, normEnd: 0.55 },
    
    // Interlude 2: Instrumental break after Charanam (approx 2:40 - 3:30)
    INTERLUDE_2: { min: 160, max: 220, normStart: 0.55, normEnd: 0.75 }
  }
};

interface AnalysisProfile {
  totalEnergy: number[];
  vocalEnergy: number[];
  vocalness: number[]; // 0.0 to 1.0 (ratio of vocal band to total)
  onsets: boolean[];
  duration: number;
}

/**
 * Perform Offline DSP Analysis
 * 1. Renders audio through a Bandpass filter to isolate Vocal frequencies (300-3000Hz).
 * 2. Compares RMS of Bandpass vs Original to determine "Vocalness".
 */
const analyzeAudioDSP = async (sourceBuffer: AudioBuffer): Promise<AnalysisProfile> => {
  const duration = sourceBuffer.duration;
  // Downsample context for speed (11kHz is sufficient for envelope analysis)
  const analysisSampleRate = 12000; 
  const length = Math.ceil(duration * analysisSampleRate);
  
  const offlineCtx = new OfflineAudioContext(1, length, analysisSampleRate);
  
  // Source Node
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  // Vocal Band Filter (300Hz - 3400Hz)
  const vocalFilter = offlineCtx.createBiquadFilter();
  vocalFilter.type = 'bandpass';
  vocalFilter.frequency.value = 1000;
  vocalFilter.Q.value = 0.7; // Wide bandwidth to capture range

  // We want to analyze two signals: Original and VocalFiltered.
  // Since OfflineCtx only has one destination, we render the FILTERED signal here.
  // We can calculate the Original signal energy purely mathematically from the source buffer later.
  
  source.connect(vocalFilter);
  vocalFilter.connect(offlineCtx.destination);
  
  source.start(0);
  
  // Render (Async, highly optimized by browser)
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Now process the data
  const originalData = sourceBuffer.getChannelData(0); // Assuming mono/left
  const filteredData = renderedBuffer.getChannelData(0);
  
  // We need to map the Original Data (44k/48k) to the Analysis Rate (12k)
  const ratio = sourceBuffer.sampleRate / analysisSampleRate;
  
  const samplesPerWindow = Math.floor(analysisSampleRate * CONFIG.WINDOW_SIZE);
  const totalWindows = Math.floor(filteredData.length / samplesPerWindow);
  
  const profile: AnalysisProfile = {
    totalEnergy: [],
    vocalEnergy: [],
    vocalness: [],
    onsets: [],
    duration
  };

  let prevEnergy = 0;

  for (let i = 0; i < totalWindows; i++) {
    const startIdx = i * samplesPerWindow;
    
    // 1. Calculate Energy of Filtered Signal (Vocal Band)
    let sumVocal = 0;
    for (let j = 0; j < samplesPerWindow; j += 2) { // stride 2 for speed
      const s = filteredData[startIdx + j] || 0;
      sumVocal += s * s;
    }
    const rmsVocal = Math.sqrt(sumVocal / (samplesPerWindow / 2));
    
    // 2. Calculate Energy of Original Signal (Full Band)
    // We map indices back to the high-res buffer
    const origStartIdx = Math.floor(startIdx * ratio);
    const origEndIdx = Math.floor((startIdx + samplesPerWindow) * ratio);
    const origStep = Math.max(1, Math.floor((origEndIdx - origStartIdx) / (samplesPerWindow/2))); // Match sample count roughly
    
    let sumTotal = 0;
    let count = 0;
    for (let k = origStartIdx; k < origEndIdx; k += origStep) {
      const s = originalData[k] || 0;
      sumTotal += s * s;
      count++;
    }
    const rmsTotal = Math.sqrt(sumTotal / Math.max(1, count));
    
    // 3. Compute Vocalness Ratio
    // Vocals usually have concentrated energy in the mid-band.
    // If rmsVocal is close to rmsTotal, it's likely vocal-heavy or mid-range heavy.
    // If rmsTotal is much higher than rmsVocal, there is lots of bass/treble (Instrumental).
    const vocalRatio = rmsTotal > 0.001 ? (rmsVocal / rmsTotal) : 0;
    
    profile.totalEnergy.push(rmsTotal);
    profile.vocalEnergy.push(rmsVocal);
    profile.vocalness.push(vocalRatio);
    
    // 4. Onset Detection (on Total Energy)
    const diff = rmsTotal - prevEnergy;
    profile.onsets.push(diff > 0.03); // Threshold
    prevEnergy = rmsTotal;
  }
  
  return profile;
};


/**
 * Finds the best region based on Energy and Vocalness criteria.
 */
const findSmartRegion = (
  profile: AnalysisProfile, 
  searchStartSec: number, 
  searchEndSec: number, 
  durationSec: number,
  mode: 'instrumental' | 'vocal'
): { start: number, end: number } => {
  
  const startIdx = Math.floor(searchStartSec / CONFIG.WINDOW_SIZE);
  const endIdx = Math.floor(searchEndSec / CONFIG.WINDOW_SIZE);
  const blockLen = Math.floor(durationSec / CONFIG.WINDOW_SIZE);
  
  if (startIdx >= profile.totalEnergy.length) {
    return { start: searchStartSec, end: searchStartSec + durationSec };
  }
  
  let bestIdx = startIdx;
  let bestScore = -Infinity;

  const limit = Math.min(endIdx, profile.totalEnergy.length - blockLen);
  
  for (let i = startIdx; i < limit; i++) {
    let scoreSum = 0;
    let energySum = 0;
    
    for (let j = 0; j < blockLen; j++) {
      const e = profile.totalEnergy[i + j];
      const v = profile.vocalness[i + j];
      
      // Heuristic Scoring
      let sampleScore = 0;
      if (mode === 'vocal') {
        // We want High Energy AND High Vocalness
        sampleScore = e * (1 + (v * CONFIG.VOCAL_WEIGHT)); 
      } else {
        // Instrumental: We want High Energy BUT Low Vocalness
        // Penalize if vocalness is high (> 0.5)
        const penalty = v > 0.5 ? (1 - v) : 1.0; 
        sampleScore = e * penalty * CONFIG.INSTRUMENTAL_WEIGHT; 
      }
      
      scoreSum += sampleScore;
      energySum += e;
    }
    
    // Normalize by length
    const avgScore = scoreSum / blockLen;
    
    // Only consider blocks with minimum silence threshold
    if (energySum > 0.01 && avgScore > bestScore) {
      bestScore = avgScore;
      bestIdx = i;
    }
  }

  // Refine Start: Snap to Onset (Look back 2s)
  // We want to start clips on a "Hit"
  const lookBack = Math.floor(2.0 / CONFIG.WINDOW_SIZE);
  let snapIdx = bestIdx;
  for (let k = 0; k < lookBack; k++) {
    const idx = bestIdx - k;
    if (idx < 0) break;
    // If it's an onset and energy is decent
    if (profile.onsets[idx] && profile.totalEnergy[idx] > 0.02) {
      snapIdx = idx;
      break; 
    }
  }
  
  const finalStart = snapIdx * CONFIG.WINDOW_SIZE;
  return { start: finalStart, end: finalStart + durationSec };
};


export const autoMarkersService = {
  async processSong(songId: string): Promise<Partial<GameSetSong> | null> {
    try {
      const url = await platformBridge.getAudioUrl(songId);
      if (!url) return null;

      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Run advanced DSP analysis
      const profile = await analyzeAudioDSP(audioBuffer);
      const D = profile.duration;

      // 1. Intro (Fixed window, just snap to start)
      const intro = { start: 0, end: Math.min(D, 8) };

      // Helper to calculate dynamic windows based on song length
      // If song is short (< 4m), compress windows. If long, expand.
      const scale = Math.min(1.2, Math.max(0.8, D / 300)); // normalized to 5 mins

      // 2. Interlude 1 (Instrumental)
      const i1_search_s = Math.max(60 * scale, D * CONFIG.WINDOWS.INTERLUDE_1.normStart);
      const i1_search_e = Math.min(120 * scale, D * CONFIG.WINDOWS.INTERLUDE_1.normEnd);
      
      const interlude1 = findSmartRegion(profile, i1_search_s, i1_search_e, 10, 'instrumental');

      // 3. Bonus Vocal (Charanam) - Look specifically for VOCALS
      // Start searching a bit after interlude 1
      const v_search_s = Math.max(interlude1.end + 5, D * CONFIG.WINDOWS.CHARANAM.normStart);
      const v_search_e = Math.min(D - 30, D * CONFIG.WINDOWS.CHARANAM.normEnd);
      
      const bonus = findSmartRegion(profile, v_search_s, v_search_e, 8, 'vocal');

      // 4. Interlude 2 (Instrumental) - Look after Charanam
      const i2_search_s = Math.max(bonus.end + 10, D * CONFIG.WINDOWS.INTERLUDE_2.normStart);
      const i2_search_e = Math.min(D - 10, D * CONFIG.WINDOWS.INTERLUDE_2.normEnd);
      
      const interlude2 = findSmartRegion(profile, i2_search_s, i2_search_e, 10, 'instrumental');

      return {
        songId,
        introStart: intro.start,
        introEnd: intro.end,
        clipStart: interlude1.start,
        clipEnd: interlude1.end,
        hintStart: interlude2.start,
        hintEnd: interlude2.end,
        bonusStart: bonus.start,
        bonusEnd: bonus.end,
        isAutoMarked: true,
        isManuallyEdited: false,
        isConfigured: true
      };

    } catch (e) {
      console.error("Auto-marker failed:", songId, e);
      return null;
    }
  }
};
