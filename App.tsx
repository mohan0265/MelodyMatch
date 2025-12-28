
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Library,
  Plus,
  History as HistoryIcon,
  Music,
  Play,
  Pause,
  Trash2,
  Download,
  Upload,
  Link2,
  Search,
  ArrowLeft,
  Edit3,
  Save,
  SkipForward,
  Undo,
  Trophy,
  Info,
  Sparkles,
  ChevronRight,
  Settings,
  CheckCircle,
  Square,
  CheckSquare,
  FolderPlus,
  XCircle,
  Clock,
  Sun,
  Moon,
  LibraryBig,
  ListPlus,
  Share2,
  FileDown,
  FileUp,
  Loader2,
  Star,
  Zap,
  Mic2,
  Guitar,
  Piano,
  Drum,
  Music2,
  Speaker,
  Monitor,
  Tablet,
  Smartphone,
  Share,
  PlusSquare,
  AlertCircle,
  Grid,
  Disc,
  Volume2,
  Gamepad2,
  X,
  FastForward,
  PlayCircle,
  Eye,
  ListMusic,
  RotateCcw
} from 'lucide-react';

import { GameResult, GameSet, GameSetSong, GameState, Song, Team, Platform } from './types';
import { persistence } from './services/persistence';
import { getPlatform, platformBridge } from './services/platform';
import WaveformEditor from './components/WaveformEditor';
import Scoreboard from './components/Scoreboard';

type View = 'home' | 'library' | 'setBuilder' | 'game' | 'history';
type Theme = 'light' | 'dark';

const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '');

const normalizeName = (name: string) =>
  stripExt(name)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

const simpleHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

const getAudioDuration = (blob: Blob): Promise<number> =>
  new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const url = URL.createObjectURL(blob);
    const timeout = setTimeout(() => { audio.src = ''; URL.revokeObjectURL(url); resolve(0); }, 2000); 
    audio.src = url;
    audio.onloadedmetadata = () => { clearTimeout(timeout); const dur = audio.duration; audio.src = ''; URL.revokeObjectURL(url); resolve(isFinite(dur) ? dur : 0); };
    audio.onerror = () => { clearTimeout(timeout); audio.src = ''; URL.revokeObjectURL(url); resolve(0); };
  });

const BackgroundDecoration = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl animate-blob"></div>
    <div className="absolute top-0 right-1/4 w-96 h-96 bg-fuchsia-500/10 dark:bg-fuchsia-500/5 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
    <div className="absolute -bottom-32 left-1/2 w-96 h-96 bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-3xl animate-blob animation-delay-4000"></div>
    <Music className="music-note top-[10%] left-[5%] text-indigo-500 animate-float-slow" size={64} />
    <Music2 className="music-note top-[20%] right-[10%] text-fuchsia-500 animate-float-medium" size={48} />
    <Mic2 className="music-note bottom-[15%] left-[15%] text-violet-500 animate-float-fast" size={56} />
  </div>
);

// Improved Home Button with better contrast and layout
const HomeActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  description: string;
  color: string;
}> = ({ label, icon, onClick, description, color }) => (
  <button 
    onClick={onClick}
    className="group relative flex flex-col items-start justify-between p-6 rounded-[2rem] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-white/70 dark:bg-slate-900/40 border border-white/60 dark:border-white/5 backdrop-blur-md overflow-hidden h-full min-h-[140px]"
  >
    <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all ${color}`}>
       {React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
    </div>
    <div className={`p-3 rounded-2xl mb-3 ${color.replace('text-', 'bg-').replace('500', '100')} dark:bg-white/5`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 28, className: `${color} dark:text-white` })}
    </div>
    <div className="z-10 text-left">
      <h3 className="font-brand text-xl text-slate-800 dark:text-white leading-none mb-1">{label}</h3>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 opacity-80">{description}</p>
    </div>
  </button>
);

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [songs, setSongs] = useState<Song[]>([]);
  const [sets, setSets] = useState<GameSet[]>([]);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('mm_theme') as Theme) || 'dark');

  const [librarySearch, setLibrarySearch] = useState('');
  const [setDraft, setSetDraft] = useState<GameSet | null>(null);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [selectedPickerIds, setSelectedPickerIds] = useState<Set<string>>(new Set());
  
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importingFileName, setImportingFileName] = useState('');

  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{name: string, blob: Blob, size: number}[]>([]);
  const [collectionNameInput, setCollectionNameInput] = useState('General');

  const [activeSet, setActiveSet] = useState<GameSet | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [stealMode, setStealMode] = useState(false);
  const [scoredThisSong, setScoredThisSong] = useState(false);
  
  // Game Logic History (Undo Stack)
  const [gameHistoryStack, setGameHistoryStack] = useState<{state: GameState, stealMode: boolean, scored: boolean}[]>([]);

  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('mm_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); setInstallError(null); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setInstallError("Install prompt unavailable. Check browser address bar.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') { setDeferredPrompt(null); setShowInstall(false); }
  };

  useEffect(() => {
    (async () => {
      const [s, gs, h] = await Promise.all([persistence.getSongs(), persistence.getSets(), persistence.getHistory()]);
      setSongs(s.sort((a, b) => b.addedAt - a.addedAt));
      setSets(gs.sort((a, b) => b.createdAt - a.createdAt));
      setHistory(h.sort((a, b) => b.dateTime - a.dateTime));
      const savedDraft = localStorage.getItem('mm_active_draft');
      if (savedDraft) setSetDraft(JSON.parse(savedDraft));
    })();
  }, []);

  useEffect(() => {
    if (setDraft) localStorage.setItem('mm_active_draft', JSON.stringify(setDraft));
    else localStorage.removeItem('mm_active_draft');
  }, [setDraft]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => { 
      setIsPlaying(false); 
      setPlayingSongId(null); 
      setCurrentSegment(null);
    };
    a.addEventListener('play', handlePlay);
    a.addEventListener('pause', handlePause);
    a.addEventListener('ended', handleEnded);
    return () => { a.removeEventListener('play', handlePlay); a.removeEventListener('pause', handlePause); a.removeEventListener('ended', handleEnded); };
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const filteredSongs = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) => (s.title + ' ' + s.filename + ' ' + (s.category || '')).toLowerCase().includes(q));
  }, [songs, librarySearch]);

  const stopAudio = () => {
    if (stopTimerRef.current) { window.clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (audioRef.current) audioRef.current.pause();
  };

  const toggleSegment = async (songId: string, segmentLabel: string, start: number, end: number) => {
    const a = audioRef.current;
    if (!a) return;

    // Case 1: Same song, same segment
    if (playingSongId === songId && currentSegment === segmentLabel) {
      if (!a.paused) {
        // Pause logic
        if (stopTimerRef.current) { window.clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
        a.pause();
      } else {
        // Resume logic
        const remaining = Math.max(0, (end - a.currentTime) * 1000);
        if (remaining > 0) {
          try {
            await a.play();
            stopTimerRef.current = window.setTimeout(() => { a.pause(); }, remaining);
          } catch (e) { console.error('Resume error', e); }
        } else {
          // If finished, restart segment
           playRange(songId, segmentLabel, start, end);
        }
      }
      return;
    }

    // Case 2: New song or New segment -> Start fresh
    playRange(songId, segmentLabel, start, end);
  };

  const playRange = async (songId: string, segmentLabel: string, start: number, end: number) => {
    const a = audioRef.current;
    if (!a) return;
    stopAudio(); // Clears any existing timers/pauses
    
    // Check if we need to load a new URL or if the current one is valid
    if (playingSongId !== songId) {
       const url = await platformBridge.getAudioUrl(songId);
       if (!url) { alert('Audio file missing.'); return; }
       a.src = url;
    }

    setPlayingSongId(songId);
    setCurrentSegment(segmentLabel);
    
    try {
      a.currentTime = Math.max(0, start);
      await a.play();
      const ms = Math.round((end - start) * 1000);
      stopTimerRef.current = window.setTimeout(() => { a.pause(); }, ms);
    } catch (e) { console.error('Playback error', e); }
  };

  const togglePlay = async (songId: string) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingSongId === songId) { if (a.paused) a.play().catch(console.error); else a.pause(); return; }
    stopAudio();
    const url = await platformBridge.getAudioUrl(songId);
    if (!url) return;
    setPlayingSongId(songId);
    a.src = url; a.currentTime = 0; a.play().catch(console.error);
  };

  const handleDeleteSong = async (id: string) => {
    if (!confirm('Remove track?')) return;
    try { if (playingSongId === id) { stopAudio(); setPlayingSongId(null); } await platformBridge.deleteAudio(id); await persistence.deleteSong(id); setSongs(prev => prev.filter(s => s.id !== id)); } catch (e) { console.error('Delete failed', e); }
  };

  const handleImportClick = async () => {
    try { const selectedFiles = await platformBridge.selectFiles(); if (!selectedFiles || selectedFiles.length === 0) return; setPendingFiles(selectedFiles); setCollectionNameInput('General'); setShowCollectionModal(true); } catch (e) { console.error(e); alert('Could not access files.'); }
  };

  const confirmImport = async () => {
    setShowCollectionModal(false); const collectionName = collectionNameInput.trim() || 'General'; const filesToImport = [...pendingFiles]; setPendingFiles([]); 
    setIsImporting(true); setImportProgress(0); setImportingFileName('Warming up the Vault...');
    const total = filesToImport.length; const BATCH_SIZE = 10; 
    try {
      for (let i = 0; i < filesToImport.length; i += BATCH_SIZE) {
        const batch = filesToImport.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (f) => {
          try { const id = crypto.randomUUID(); const duration = await getAudioDuration(f.blob); const nameHash = simpleHash(normalizeName(f.name)); const song: Song = { id, title: stripExt(f.name), duration, filename: f.name, fileSize: f.size, fingerprint: `${f.size}_${Math.round(duration)}_${nameHash}`, addedAt: Date.now(), hasLocalAudio: true, category: collectionName }; await platformBridge.saveAudio(id, f.blob); await persistence.saveSong(song); return song; } catch (err) { console.error(`Import Error (${f.name})`, err); return null; }
        }));
        const successful = batchResults.filter((s): s is Song => s !== null); setSongs(prev => [...successful, ...prev]); setImportProgress(Math.min(100, Math.round(((i + batch.length) / total) * 100))); if (batch.length > 0) setImportingFileName(batch[batch.length - 1].name); await new Promise(r => setTimeout(r, 20));
      }
      setImportingFileName('Finalizing...'); await new Promise(r => setTimeout(r, 500)); 
    } catch (e) { console.error('Critical Import Error', e); alert('An error occurred during import.'); } finally { setIsImporting(false); setImportingFileName(''); }
  };

  const exportSet = (set: GameSet) => {
    const relatedSongs = songs.filter(s => set.songs.some(gs => gs.songId === s.id));
    const data = { version: '2.0', type: 'game-set', set, songMetadata: relatedSongs.map(s => ({ id: s.id, title: s.title, filename: s.filename, fileSize: s.fileSize, fingerprint: s.fingerprint, category: s.category })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${normalizeName(set.name || 'Game')}.mmset`; a.click(); URL.revokeObjectURL(url);
  };

  const importSetFile = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.mmset,application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0]; if (!file) return; const text = await file.text();
      try {
        const data = JSON.parse(text); if (data.type !== 'game-set') throw new Error('Format Error');
        const updatedSongs = [...songs];
        for (const meta of data.songMetadata) { if (!songs.some(s => s.id === meta.id)) { const newSong: Song = { ...meta, duration: 0, addedAt: Date.now(), hasLocalAudio: false }; await persistence.saveSong(newSong); updatedSongs.push(newSong); } }
        setSongs(updatedSongs); const newSet: GameSet = data.set; const nextSets = [newSet, ...sets.filter(s => s.id !== newSet.id)]; await persistence.saveSets(nextSets); setSets(nextSets); alert(`Imported "${newSet.name}".`);
      } catch (err) { alert('Import Failed.'); }
    };
    input.click();
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredSongs.filter(s => !setDraft?.songs.some(gs => gs.songId === s.id)).map(s => s.id);
    if (selectedPickerIds.size === visibleIds.length && visibleIds.length > 0) { setSelectedPickerIds(new Set()); } else { setSelectedPickerIds(new Set(visibleIds)); }
  };

  const toggleSongSelection = (id: string) => { const next = new Set(selectedPickerIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedPickerIds(next); };

  const addSelectedToSet = () => {
    if (!setDraft) return;
    const currentSongIds = new Set(setDraft.songs.map(s => s.songId)); const newSongs: GameSetSong[] = [];
    selectedPickerIds.forEach(id => { if (!currentSongIds.has(id)) { newSongs.push({ songId: id, introStart: 0, introEnd: 5, clipStart: 0, clipEnd: 5, hintStart: 5, hintEnd: 10, bonusStart: 10, bonusEnd: 15, isConfigured: false, orderIndex: setDraft.songs.length + newSongs.length }); } });
    setSetDraft({ ...setDraft, songs: [...setDraft.songs, ...newSongs] }); setSelectedPickerIds(new Set());
  };

  const relinkLibrary = async () => {
    const files = await platformBridge.selectFiles(); if (!files.length) return; setIsImporting(true); setImportProgress(0); let matched = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; setImportingFileName(f.name);
      const cand = songs.find(s => !s.hasLocalAudio && (s.fileSize === f.size || normalizeName(s.filename) === normalizeName(f.name)));
      if (cand) { await platformBridge.saveAudio(cand.id, f.blob); const up: Song = { ...cand, hasLocalAudio: true }; await persistence.saveSong(up); setSongs(prev => prev.map(x => x.id === up.id ? up : x)); matched++; }
      setImportProgress(Math.round(((i + 1) / files.length) * 100)); await new Promise(r => setTimeout(r, 10));
    }
    setIsImporting(false); setImportingFileName(''); alert(`Linked ${matched} tracks.`);
  };

  const saveSet = async () => {
    if (!setDraft || !setDraft.name.trim()) return; const norm = { ...setDraft, songs: setDraft.songs.map((s, i) => ({ ...s, orderIndex: i })), isDraft: false };
    const next = [norm, ...sets.filter(s => s.id !== norm.id)]; await persistence.saveSets(next); setSets(next); setSetDraft(null); setView('home');
  };

  const startGame = (set: GameSet, teamsCount: number) => {
    const teams: Team[] = Array.from({ length: teamsCount }).map((_, i) => ({ id: crypto.randomUUID(), name: `Team ${i + 1}`, score: 0 }));
    const indices = Array.from({ length: set.songs.length }).map((_, i) => i).sort(() => Math.random() - 0.5);
    setActiveSet(set); 
    setGameState({ id: crypto.randomUUID(), setId: set.id, teams, currentSongIndex: 0, currentTurnTeamIndex: 0, isRevealed: false, stealAttempted: false, isFinished: false, shuffledIndices: indices }); 
    setStealMode(false); 
    setScoredThisSong(false); 
    setGameHistoryStack([]); // Clear undo history on new game
    setView('game');
  };

  // Undo System Helper
  const pushToHistory = () => {
    if (!gameState) return;
    setGameHistoryStack(prev => [...prev, {
      state: JSON.parse(JSON.stringify(gameState)), // Deep copy state
      stealMode,
      scored: scoredThisSong
    }]);
  };

  const performUndo = () => {
    if (gameHistoryStack.length === 0) return;
    const last = gameHistoryStack[gameHistoryStack.length - 1];
    setGameState(last.state);
    setStealMode(last.stealMode);
    setScoredThisSong(last.scored);
    setGameHistoryStack(prev => prev.slice(0, -1));
    
    // Stop audio if rewinding track
    stopAudio();
    setPlayingSongId(null);
  };

  const award = (teamId: string, pts: number) => { 
    if (!gameState) return; 
    pushToHistory(); // Save state before change
    setGameState({ ...gameState, teams: gameState.teams.map(t => t.id === teamId ? { ...t, score: t.score + pts } : t), isRevealed: false, stealAttempted: true }); 
    setScoredThisSong(true); 
    setStealMode(false); 
  };

  const nextSong = () => {
    if (!gameState || !activeSet) return; 
    pushToHistory(); // Save state before change
    const isLast = gameState.currentSongIndex >= activeSet.songs.length - 1;
    stopAudio(); // Ensure audio stops between tracks
    if (isLast) { const result: GameResult = { id: crypto.randomUUID(), dateTime: Date.now(), setName: activeSet.name, teams: gameState.teams }; persistence.saveHistory(result); setHistory(prev => [result, ...prev]); setView('history'); setGameState(null); } 
    else { setGameState({ ...gameState, currentSongIndex: gameState.currentSongIndex + 1, currentTurnTeamIndex: (gameState.currentTurnTeamIndex + 1) % gameState.teams.length, isRevealed: false, stealAttempted: false }); setStealMode(false); setScoredThisSong(false); }
  };

  const triggerStealMode = () => {
      pushToHistory();
      setStealMode(true);
  };

  const triggerReveal = () => {
      pushToHistory();
      if(gameState) setGameState({...gameState, isRevealed: true});
  };

  const collections = useMemo(() => Array.from(new Set(songs.map(s => s.category || 'General'))).sort(), [songs]);
  const editingSongConfig = useMemo(() => { if (!editingSongId || !setDraft) return null; return setDraft.songs.find(s => s.songId === editingSongId); }, [editingSongId, setDraft]);

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-700 ${theme === 'light' ? 'bg-mesh-light text-slate-900' : 'bg-mesh-dark text-slate-100'} selection:bg-fuchsia-500/30 font-sans overflow-hidden`}>
      <BackgroundDecoration />
      <audio ref={audioRef} className="hidden" />

      {/* Header - Visible everywhere except Game View */}
      {view !== 'game' && (
        <header className="px-6 py-4 flex justify-between items-center z-50 sticky top-0 backdrop-blur-md bg-white/20 dark:bg-black/10 border-b border-white/20 dark:border-white/5 h-20 shrink-0">
          <button onClick={() => setView('home')} className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-fuchsia-600 rounded-xl shadow-lg group-hover:scale-105 transition-transform"><Music size={20} className="text-white"/></div>
            <span className="font-display text-3xl tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-fuchsia-600 dark:from-indigo-400 dark:to-fuchsia-400 drop-shadow-sm">MELODYMATCH</span>
          </button>
          <div className="flex items-center gap-3">
            {setDraft && view !== 'setBuilder' && (
              <button onClick={() => setView('setBuilder')} className="px-4 py-2 bg-indigo-600/90 text-white rounded-xl flex items-center gap-2 font-bold text-[10px] shadow-lg shadow-indigo-500/20 animate-pulse hover:bg-indigo-500 transition-colors uppercase tracking-widest backdrop-blur-sm">
                <Clock size={14} /> Resume Draft
              </button>
            )}
            <button onClick={toggleTheme} className="p-2.5 rounded-xl glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10 transition-colors shadow-sm"><Sun size={20} className="hidden dark:block" /><Moon size={20} className="block dark:hidden" /></button>
            <button onClick={() => setView('library')} className={`p-2.5 rounded-xl transition-all ${view === 'library' ? 'bg-indigo-600 text-white shadow-lg' : 'glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'}`}><Library size={20} /></button>
            <button onClick={() => setView('history')} className={`p-2.5 rounded-xl transition-all ${view === 'history' ? 'bg-fuchsia-600 text-white shadow-lg' : 'glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'}`}><HistoryIcon size={20} /></button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-grow z-10 ${view === 'home' || view === 'game' ? 'overflow-hidden flex flex-col p-0' : 'overflow-y-auto p-6 md:p-8'}`}>
        
        {/* HOME VIEW - RESPONSIVE 12-COL GRID */}
        {view === 'home' && (
          <div className="h-full w-full flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-700">
            <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 h-full lg:h-auto items-center">
              
              {/* Left Col: Branding & Actions */}
              <div className="lg:col-span-7 flex flex-col justify-center space-y-8 lg:space-y-12 text-center lg:text-left">
                 <div>
                   <h1 className="text-6xl sm:text-7xl lg:text-9xl font-display leading-[0.85] tracking-tight mb-4 dark:text-white text-slate-900 drop-shadow-2xl">
                      MELODY<br/>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500 font-outline-2 lg:font-outline-4">MATCH</span>
                   </h1>
                   <div className="flex items-center justify-center lg:justify-start gap-4">
                      <div className="h-1.5 w-24 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full"></div>
                      <p className="text-sm font-bold uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">The Ultimate Music Quiz</p>
                   </div>
                 </div>

                 {/* Action Grid - 2x2 Layout */}
                 <div className="grid grid-cols-2 gap-4 w-full max-w-2xl mx-auto lg:mx-0">
                    <HomeActionButton 
                       label="Game Builder" 
                       description="Create New Set" 
                       icon={<ListPlus />} 
                       color="text-fuchsia-500"
                       onClick={() => { if (!setDraft) setSetDraft({ id: crypto.randomUUID(), name: '', description: '', songs: [], createdAt: Date.now() }); setView('setBuilder'); }}
                    />
                    <HomeActionButton 
                       label="Music Vault" 
                       description={`${songs.length} Tracks Ready`} 
                       icon={<LibraryBig />} 
                       color="text-indigo-500"
                       onClick={() => setView('library')}
                    />
                    <HomeActionButton 
                       label="Hall of Fame" 
                       description="High Scores" 
                       icon={<Trophy />} 
                       color="text-amber-500"
                       onClick={() => setView('history')}
                    />
                    <HomeActionButton 
                       label="Import Set" 
                       description=".MMSET File" 
                       icon={<FileUp />} 
                       color="text-emerald-500"
                       onClick={importSetFile}
                    />
                 </div>
                 
                 <div className="lg:hidden">
                    <button onClick={() => setShowInstall(true)} className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-indigo-500 flex items-center justify-center gap-2 p-4 bg-white/50 dark:bg-white/5 rounded-xl"><Download size={14}/> Install App Offline</button>
                 </div>
              </div>

              {/* Right Col: Quick Play Stage */}
              <div className="lg:col-span-5 h-[500px] lg:h-[650px] relative w-full">
                 <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[3rem] shadow-2xl border border-white/40 dark:border-white/10 flex flex-col overflow-hidden">
                    <div className="p-8 border-b border-slate-200/50 dark:border-white/5 flex justify-between items-center bg-white/40 dark:bg-white/5">
                        <h2 className="text-xl font-brand text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-3">
                          <Zap size={24} className="text-yellow-500 fill-yellow-500"/> Quick Play
                        </h2>
                        <span className="px-3 py-1 rounded-full bg-slate-200 dark:bg-white/10 text-[10px] font-black uppercase text-slate-500 dark:text-slate-300">{sets.length} Games</span>
                    </div>

                    <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
                       {sets.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 opacity-60">
                             <Gamepad2 size={64} strokeWidth={1} />
                             <p className="font-brand text-lg uppercase tracking-widest">No Games Found</p>
                          </div>
                       ) : (
                          sets.map(s => (
                            <div key={s.id} className="group p-5 bg-white/50 dark:bg-slate-800/50 hover:bg-white/80 dark:hover:bg-slate-800/80 border border-transparent hover:border-indigo-500/30 rounded-[2rem] transition-all duration-300 flex flex-col gap-4">
                               <div className="flex justify-between items-start">
                                  <div>
                                     <h4 className="font-bold text-lg text-slate-800 dark:text-white leading-tight mb-1">{s.name || 'Untitled Game'}</h4>
                                     <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{s.songs.length} Tracks • {new Date(s.createdAt).toLocaleDateString()}</p>
                                  </div>
                                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button onClick={() => exportSet(s)} className="p-2 bg-slate-200 dark:bg-white/10 rounded-full hover:text-fuchsia-500"><Share2 size={14}/></button>
                                     <button onClick={() => { setSetDraft(s); setView('setBuilder'); }} className="p-2 bg-slate-200 dark:bg-white/10 rounded-full hover:text-indigo-500"><Edit3 size={14}/></button>
                                  </div>
                               </div>
                               <button onClick={() => startGame(s, 2)} className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl font-brand uppercase text-sm tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2">
                                  <PlayCircle size={18} /> Start Game
                               </button>
                            </div>
                          ))
                       )}
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* GAME VIEW - NO CONTAINERS (PURE OVERLAY) */}
        {view === 'game' && gameState && activeSet && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden">
            
            {/* Top Right Quit */}
            <button onClick={() => { if(confirm("End game?")) { setGameState(null); setView('home'); }}} className="absolute top-6 left-6 z-50 p-4 bg-black/20 hover:bg-rose-600/80 backdrop-blur-md rounded-full text-white/50 hover:text-white transition-all group">
               <X size={24} />
               <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">QUIT</span>
            </button>

            {/* Top Scoreboard (Floating) */}
            <div className="absolute top-12 z-[40] scale-110">
               <Scoreboard teams={gameState.teams} currentTurnIndex={gameState.currentTurnTeamIndex} />
            </div>

            {/* Right Side Game Playlist Panel */}
            <div className="absolute top-24 bottom-32 right-6 w-64 z-[35] flex flex-col gap-2">
               <div className="bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex items-center gap-2">
                  <ListMusic size={16} className="text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-widest text-white/80">Playlist</span>
                  <span className="ml-auto text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white/60">{gameState.currentSongIndex + 1}/{activeSet.songs.length}</span>
               </div>
               <div className="flex-grow overflow-y-auto no-scrollbar space-y-2 pb-4">
                  {activeSet.songs.map((_, idx) => {
                     const isCurrent = idx === gameState.currentSongIndex;
                     const isPast = idx < gameState.currentSongIndex;
                     const isFuture = idx > gameState.currentSongIndex;
                     
                     // Get song details if past/revealed
                     const songData = songs.find(s => s.id === activeSet.songs[gameState.shuffledIndices[idx]].songId);
                     
                     return (
                        <div key={idx} className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${isCurrent ? 'bg-indigo-600/80 border-indigo-400/50 shadow-lg scale-105 ml-[-10px]' : isPast ? 'bg-black/20 border-white/5 text-slate-400' : 'bg-transparent border-transparent opacity-50'}`}>
                           <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isCurrent ? 'bg-white text-indigo-600' : 'bg-white/10 text-white'}`}>
                              {idx + 1}
                           </div>
                           <div className="truncate">
                              {isCurrent ? (
                                 <div className="text-xs font-bold text-white uppercase tracking-wider animate-pulse">Playing Now...</div>
                              ) : isPast ? (
                                 <div className="text-xs font-bold text-white/90 truncate">{songData?.title || 'Unknown Track'}</div>
                              ) : (
                                 <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Locked</div>
                              )}
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>

            {/* Center Vinyl (Massive) */}
            <div className="relative z-10 flex items-center justify-center scale-125 md:scale-150 transition-transform duration-1000">
               {/* Ambient Glow */}
               <div className={`absolute inset-0 bg-indigo-500/20 blur-[100px] rounded-full transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}></div>
               
               {/* Record */}
               <div className={`w-[350px] h-[350px] rounded-full bg-[#0a0a0a] border-4 border-[#1a1a1a] shadow-2xl flex items-center justify-center vinyl-grooves relative ${isPlaying ? 'animate-spin-slow' : ''}`}>
                  <div className="absolute inset-0 rounded-full border border-white/5 pointer-events-none"></div>
                  {/* Label */}
                  <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-600 to-fuchsia-600 flex items-center justify-center shadow-inner relative overflow-hidden">
                     <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
                     <Music size={40} className="text-white/80 drop-shadow-md" />
                     <div className="absolute w-3 h-3 bg-black rounded-full"></div>
                  </div>
               </div>

               {/* Reveal Card (Pop over) */}
               <div className={`absolute z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl p-10 rounded-[3rem] shadow-2xl text-center border border-white/20 transition-all duration-500 ease-out transform ${gameState.isRevealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-50 opacity-0 translate-y-20 pointer-events-none'}`}>
                  <h2 className="text-4xl md:text-5xl font-brand text-slate-900 dark:text-white mb-2 leading-none">{songs.find(s => s.id === (activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]].songId))?.title}</h2>
                  <p className="text-sm font-mono uppercase tracking-[0.4em] text-indigo-500">Correct Answer</p>
               </div>
            </div>

            {/* Bottom Controls (Floating Island) - Highest Z-Index to stay clickable */}
            <div className="absolute bottom-10 z-[70]">
               <div className="flex items-center gap-2 p-2 rounded-full bg-black/60 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  
                  {/* UNDO BUTTON (History) - Visible only if there's history */}
                  {gameHistoryStack.length > 0 && (
                    <div className="border-r border-white/10 pr-2 mr-1">
                      <button onClick={performUndo} className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-700/50 hover:bg-slate-600 text-slate-300 hover:text-white transition-all active:scale-95 group relative">
                         <RotateCcw size={18} />
                         <span className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Undo Action</span>
                      </button>
                    </div>
                  )}

                  {/* Audio Regions */}
                  <div className="flex gap-1 pr-4 border-r border-white/10">
                     {[
                       { l: 'INT', i: Play, c: 'bg-emerald-500 text-white', fn: () => { const s = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(s) toggleSegment(s.songId, 'intro', s.introStart||0, s.introEnd||5); } },
                       { l: 'MAIN', i: Zap, c: 'bg-indigo-500 text-white', fn: () => { const s = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(s) toggleSegment(s.songId, 'main', s.clipStart, s.clipEnd); } },
                       { l: 'HINT', i: Sparkles, c: 'bg-amber-500 text-white', fn: () => { const s = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(s) toggleSegment(s.songId, 'hint', s.hintStart, s.hintEnd); } },
                       { l: 'BONUS', i: Star, c: 'bg-fuchsia-500 text-white', fn: () => { const s = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(s) toggleSegment(s.songId, 'bonus', s.bonusStart||10, s.bonusEnd||15); } },
                     ].map((b, idx) => {
                       const isActive = currentSegment === ['intro','main','hint','bonus'][idx]; // Simplified match for demo
                       return (
                         <button key={b.l} onClick={b.fn} className={`w-12 h-12 rounded-full flex items-center justify-center hover:scale-110 transition-all ${b.c} ${isActive && isPlaying ? 'ring-4 ring-white/30 animate-pulse' : ''}`} title={b.l}>
                            {isActive && isPlaying ? <Pause size={18} fill="currentColor"/> : <b.i size={18} fill="currentColor"/>}
                         </button>
                       )
                     })}
                  </div>

                  {/* Host Actions */}
                  <div className="flex gap-2 pl-2">
                     <button onClick={() => award(gameState.teams[gameState.currentTurnTeamIndex].id, 2)} className="px-6 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-brand text-sm tracking-widest uppercase shadow-lg flex items-center gap-2 hover:-translate-y-0.5 transition-all">
                        <CheckCircle size={18} /> Correct
                     </button>
                     
                     {!gameState.isRevealed ? (
                       <>
                         <button onClick={triggerStealMode} className="px-6 h-12 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-brand text-sm tracking-widest uppercase shadow-lg hover:-translate-y-0.5 transition-all">Wrong</button>
                         <button onClick={triggerReveal} className="px-6 h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-brand text-sm tracking-widest uppercase shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2">
                            <Eye size={18} /> Reveal Identity
                         </button>
                       </>
                     ) : (
                       <button onClick={nextSong} className="px-6 h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-brand text-sm tracking-widest uppercase shadow-lg flex items-center gap-2 hover:-translate-y-0.5 transition-all">Next <SkipForward size={18} /></button>
                     )}
                  </div>
               </div>
            </div>

            {/* Overlay Modals (Steal) - Z-Index 60 to sit BEHIND controls (Z-70) but above Vinyl (Z-10) */}
            {stealMode && !scoredThisSong && (
                <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                   <div className="text-center space-y-8 pointer-events-auto pb-32">
                      <h3 className="text-6xl font-brand text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-orange-500 animate-pulse drop-shadow-2xl">STEAL CHANCE</h3>
                      <p className="text-slate-400 uppercase tracking-widest text-xs">Controls are still active for replay</p>
                      <div className="flex gap-6 justify-center">
                         {gameState.teams.map((t, i) => i !== gameState.currentTurnTeamIndex ? (
                           <button key={t.id} onClick={() => award(t.id, 1)} className="px-12 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2.5rem] font-brand text-3xl shadow-2xl hover:scale-105 transition-transform border-4 border-indigo-400/20">{t.name} +1</button>
                         ) : null)}
                      </div>
                      <button onClick={() => { pushToHistory(); setStealMode(false); }} className="text-slate-500 hover:text-white font-bold uppercase tracking-[0.2em] text-sm mt-8">Cancel Steal</button>
                   </div>
                </div>
            )}
          </div>
        )}

        {/* Other Views Container (Standard Padding) */}
        {(view !== 'home' && view !== 'game') && (
           <div className="max-w-7xl mx-auto w-full animate-in fade-in duration-500">
              {view === 'library' && (
                /* Compact Library View */
                <div className="space-y-6">
                   {/* ... Keep library code logic, just styling tweaks handled by global layout ... */}
                   <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-indigo-900/80 to-purple-900/80 p-8 rounded-[3rem] text-white shadow-2xl backdrop-blur-xl border border-white/10">
                      <div><h2 className="text-6xl font-brand mb-2 text-white">Library</h2><p className="font-mono text-sm tracking-widest uppercase opacity-70 border-l-4 border-fuchsia-500 pl-4">{songs.length} Tracks</p></div>
                      <div className="flex gap-3">
                        <button onClick={handleImportClick} className="px-6 py-3 bg-fuchsia-600 rounded-xl font-bold flex items-center gap-2 text-white text-xs uppercase tracking-widest"><FolderPlus size={16}/> Import</button>
                        <button onClick={relinkLibrary} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold flex items-center gap-2 text-white text-xs uppercase tracking-widest"><Link2 size={16}/> Link</button>
                      </div>
                   </div>
                   <div className="relative"><Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} /><input className="w-full glass-panel rounded-full py-4 pl-14 pr-6 text-lg outline-none text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 ring-indigo-500/50 transition-all" placeholder="Search..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} /></div>
                   <div className="glass-panel rounded-[2rem] overflow-hidden">
                     <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                       <table className="w-full text-left">
                          <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                            {filteredSongs.map(s => (
                              <tr key={s.id} className="hover:bg-indigo-500/5 transition-colors group">
                                <td className="p-6"><p className="font-bold text-slate-800 dark:text-white">{s.title}</p><p className="text-xs font-mono text-slate-500">{s.filename}</p></td>
                                <td className="p-6 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => togglePlay(s.id)} className="p-2 bg-slate-200 dark:bg-white/10 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors"><Play size={16}/></button><button onClick={() => handleDeleteSong(s.id)} className="p-2 bg-rose-100 dark:bg-rose-900/20 text-rose-500 rounded-lg hover:bg-rose-600 hover:text-white transition-colors"><Trash2 size={16}/></button></div></td>
                              </tr>
                            ))}
                          </tbody>
                       </table>
                     </div>
                   </div>
                </div>
              )}
              {view === 'setBuilder' && setDraft && (
                 /* ... Set Builder Logic (Keep functionality, ensure wrapper styles match) ... */
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-140px)]">
                    <div className="flex flex-col gap-6 h-full overflow-hidden">
                       <div className="glass-panel p-6 rounded-[2rem] space-y-4 shrink-0">
                          <input className="w-full bg-transparent text-3xl font-brand text-slate-900 dark:text-white placeholder:text-slate-400 outline-none border-b border-slate-200 dark:border-white/10 pb-2" placeholder="Game Name" value={setDraft.name} onChange={e => setSetDraft({...setDraft, name: e.target.value})} />
                          <div className="flex justify-between items-center"><span className="text-xs font-bold uppercase text-slate-500">{setDraft.songs.length} Tracks</span><button onClick={saveSet} className="px-6 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-emerald-600 transition-colors">Save Game</button></div>
                       </div>
                       <div className="flex-grow overflow-y-auto glass-panel rounded-[2rem] p-2 space-y-2 custom-scrollbar">
                          {setDraft.songs.map((ss, idx) => {
                             const s = songs.find(x => x.id === ss.songId);
                             if(!s) return null;
                             const isActive = editingSongId === ss.songId;
                             return (
                               <div key={ss.songId} className={`p-4 rounded-xl flex items-center gap-4 transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10'}`}>
                                  <span className="font-mono font-bold opacity-50">{idx+1}</span>
                                  <div className="flex-grow truncate font-bold">{s.title}</div>
                                  <div className="flex gap-2">
                                     <button onClick={() => setEditingSongId(isActive ? null : ss.songId)} className={`p-2 rounded-lg ${isActive ? 'bg-white text-indigo-600' : 'bg-slate-200 dark:bg-white/10'}`}><Settings size={14}/></button>
                                     <button onClick={() => setSetDraft({...setDraft, songs: setDraft.songs.filter(x => x.songId !== ss.songId)})} className={`p-2 rounded-lg ${isActive ? 'text-indigo-200' : 'text-rose-400 hover:bg-rose-100'}`}><X size={14}/></button>
                                  </div>
                               </div>
                             );
                          })}
                       </div>
                    </div>
                    <div className="h-full overflow-hidden flex flex-col gap-6">
                       {editingSongId && editingSongConfig ? (
                          <div className="glass-panel p-6 rounded-[2rem] shadow-2xl relative h-full flex flex-col">
                             <div className="flex justify-between items-center mb-6"><h3 className="font-brand text-xl dark:text-white">Region Editor</h3><button onClick={() => setEditingSongId(null)} className="text-xs font-bold uppercase bg-slate-200 dark:bg-white/10 px-3 py-1 rounded-lg">Close</button></div>
                             <WaveformEditorLoader songId={editingSongId} clipStart={editingSongConfig.clipStart||0} clipEnd={editingSongConfig.clipEnd||5} hintStart={editingSongConfig.hintStart||5} hintEnd={editingSongConfig.hintEnd||10} introStart={editingSongConfig.introStart||0} introEnd={editingSongConfig.introEnd||5} bonusStart={editingSongConfig.bonusStart||10} bonusEnd={editingSongConfig.bonusEnd||15} onSave={(c, h, i, b) => { setSetDraft({...setDraft, songs: setDraft.songs.map(x => x.songId === editingSongId ? { ...x, clipStart: c.start, clipEnd: c.end, hintStart: h.start, hintEnd: h.end, introStart: i.start, introEnd: i.end, bonusStart: b.start, bonusEnd: b.end, isConfigured: true } : x)}); setEditingSongId(null); }} maxDuration={30} />
                          </div>
                       ) : (
                          <div className="glass-panel p-6 rounded-[2rem] h-full flex flex-col">
                             <div className="flex justify-between items-center mb-4"><h3 className="font-brand text-lg dark:text-white">Add Tracks</h3><button onClick={toggleSelectAll} className="text-[10px] font-bold uppercase bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-1 rounded-lg">Select All</button></div>
                             <input className="w-full bg-slate-100 dark:bg-black/20 rounded-xl py-3 px-4 mb-4 text-sm outline-none" placeholder="Search library..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
                             <div className="flex-grow overflow-y-auto space-y-2 custom-scrollbar pr-2">
                                {filteredSongs.map(s => {
                                   const inSet = setDraft.songs.some(x => x.songId === s.id);
                                   const sel = selectedPickerIds.has(s.id);
                                   return (
                                      <div key={s.id} onClick={() => !inSet && toggleSongSelection(s.id)} className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${inSet ? 'opacity-40' : sel ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500' : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                                         {sel ? <CheckSquare size={18} className="text-indigo-500"/> : <Square size={18} className="text-slate-400"/>}
                                         <div className="truncate text-sm font-bold dark:text-white">{s.title}</div>
                                      </div>
                                   )
                                })}
                             </div>
                             {selectedPickerIds.size > 0 && <button onClick={addSelectedToSet} className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-500 transition-colors">Add {selectedPickerIds.size}</button>}
                          </div>
                       )}
                    </div>
                 </div>
              )}
              {view === 'history' && (
                 /* History List (Simplified) */
                 <div className="space-y-6">
                    <h2 className="text-5xl font-brand text-center mb-12 dark:text-white">Hall of Fame</h2>
                    {history.map(h => (
                       <div key={h.id} className="glass-panel p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-8">
                          <div className="text-center md:text-left"><h4 className="text-2xl font-bold dark:text-white">{h.setName}</h4><p className="text-sm font-mono text-slate-500">{new Date(h.dateTime).toLocaleDateString()}</p></div>
                          <div className="flex gap-4">{h.teams.map((t, i) => (<div key={t.id} className={`px-6 py-4 rounded-2xl border flex flex-col items-center min-w-[100px] ${i===0?'bg-amber-100/50 border-amber-200':'bg-white/50 border-slate-100'}`}><span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{t.name}</span><span className="text-3xl font-brand text-slate-800">{t.score}</span></div>))}</div>
                       </div>
                    ))}
                 </div>
              )}
           </div>
        )}
      </main>

      {/* Modals (Import / Install) - Kept mostly same but ensured z-index higher */}
      {showCollectionModal && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] w-full max-w-md text-center space-y-6">
              <FolderPlus size={48} className="mx-auto text-indigo-500" />
              <h3 className="text-2xl font-brand dark:text-white">Group Tracks</h3>
              <input autoFocus className="w-full bg-slate-100 dark:bg-black/40 p-4 rounded-xl text-center text-lg font-bold outline-none border-2 border-transparent focus:border-indigo-500" placeholder="Collection Name" value={collectionNameInput} onChange={e => setCollectionNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmImport()} />
              <div className="grid grid-cols-2 gap-4"><button onClick={() => setShowCollectionModal(false)} className="py-3 bg-slate-200 dark:bg-white/10 rounded-xl font-bold text-slate-600 dark:text-slate-300">Cancel</button><button onClick={confirmImport} className="py-3 bg-indigo-600 text-white rounded-xl font-bold">Import</button></div>
           </div>
        </div>
      )}
      
      {isImporting && (
         <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center flex-col gap-6">
            <Loader2 size={64} className="text-indigo-500 animate-spin" />
            <h3 className="text-2xl font-brand text-white tracking-widest animate-pulse">IMPORTING...</h3>
            <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-300" style={{width: `${importProgress}%`}}></div></div>
            <p className="text-slate-500 font-mono text-xs">{importingFileName}</p>
         </div>
      )}

      {showInstall && (
         <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] w-full max-w-2xl text-center relative">
               <button onClick={() => setShowInstall(false)} className="absolute top-6 right-6 p-2 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-rose-100 text-slate-400 hover:text-rose-500"><X size={20}/></button>
               <Download size={64} className="mx-auto text-indigo-500 mb-6" />
               <h2 className="text-4xl font-brand mb-4 dark:text-white">Install App</h2>
               <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">Get the best performance by installing MelodyMatch as a native app.</p>
               <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl"><h4 className="font-bold mb-2 dark:text-white">Windows / Android</h4><button onClick={handleInstallClick} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs tracking-widest shadow-lg hover:bg-indigo-500">Install Now</button></div>
                  <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-3xl"><h4 className="font-bold mb-2 dark:text-white">iOS</h4><p className="text-xs text-slate-500 dark:text-slate-400">Share &gt; Add to Home Screen</p></div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

const WaveformEditorLoader: React.FC<{ songId: string; clipStart: number; clipEnd: number; hintStart: number; hintEnd: number; introStart: number; introEnd: number; bonusStart: number; bonusEnd: number; onSave: (clip: { start: number; end: number }, hint: { start: number; end: number }, intro: { start: number; end: number }, bonus: { start: number; end: number }) => void; maxDuration: number; }> = ({ songId, clipStart, clipEnd, hintStart, hintEnd, introStart, introEnd, bonusStart, bonusEnd, onSave, maxDuration }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => { platformBridge.getAudioUrl(songId).then(u => setUrl(u || '')); }, [songId]);
  if (!url) return <div className="p-12 text-center text-slate-400 animate-pulse font-mono uppercase tracking-widest">Loading Audio...</div>;
  return <WaveformEditor key={songId} url={url} clipStart={clipStart} clipEnd={clipEnd} hintStart={hintStart} hintEnd={hintEnd} introStart={introStart} introEnd={introEnd} bonusStart={bonusStart} bonusEnd={bonusEnd} onSave={onSave} maxDuration={maxDuration} />;
};

export default App;
