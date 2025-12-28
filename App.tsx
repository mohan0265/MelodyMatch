
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
  Grid
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
    
    // Safety timeout - if browser can't decode, return 0
    const timeout = setTimeout(() => {
      audio.src = '';
      URL.revokeObjectURL(url);
      resolve(0);
    }, 2000); 

    audio.src = url;
    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const dur = audio.duration;
      audio.src = '';
      URL.revokeObjectURL(url);
      resolve(isFinite(dur) ? dur : 0);
    };
    audio.onerror = () => {
      clearTimeout(timeout);
      audio.src = '';
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });

// Decorative Background Component
const BackgroundDecoration = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
    {/* Floating Notes */}
    <Music className="music-note top-[10%] left-[5%] text-indigo-500 animate-float-slow" size={64} />
    <Music2 className="music-note top-[20%] right-[10%] text-fuchsia-500 animate-float-medium" size={48} />
    <Mic2 className="music-note bottom-[15%] left-[15%] text-violet-500 animate-float-fast" size={56} />
    <Star className="music-note top-[15%] left-[40%] text-yellow-500 animate-pulse-slow" size={32} />
    
    {/* Large Watermark Instruments */}
    <Guitar className="absolute -right-20 top-40 text-slate-900/5 dark:text-white/5 rotate-12" size={400} />
    <Piano className="absolute -left-20 bottom-0 text-slate-900/5 dark:text-white/5 -rotate-12" size={350} />
    <Drum className="absolute right-[20%] bottom-[-50px] text-slate-900/5 dark:text-white/5 rotate-6" size={200} />
  </div>
);

const DashboardCard: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  colorClass: string;
  bgGradient: string;
  compact?: boolean;
}> = ({ title, subtitle, icon, onClick, colorClass, bgGradient, compact }) => (
  <button
    onClick={onClick}
    className={`group w-full glass-card text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative overflow-hidden ${bgGradient} ${compact ? 'p-3 rounded-[1.25rem] flex items-center gap-3' : 'p-6 rounded-[2rem]'}`}
  >
    <div className={`absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity transform ${compact ? 'scale-125 translate-x-2 -translate-y-2' : 'scale-150 p-6 translate-x-4 -translate-y-4'}`}>
       {React.cloneElement(icon as React.ReactElement<any>, { size: compact ? 56 : 100 })}
    </div>
    
    <div className={`rounded-xl shadow-sm bg-white/90 dark:bg-black/40 backdrop-blur-md group-hover:scale-110 transition-transform duration-300 shrink-0 flex items-center justify-center ${compact ? 'w-10 h-10' : 'w-fit p-3 mb-4'}`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: compact ? 20 : 32, className: colorClass })}
    </div>
    
    <div>
      <h3 className={`${compact ? 'text-lg' : 'text-xl md:text-2xl'} font-brand text-slate-800 dark:text-white tracking-tight leading-none mb-1`}>{title}</h3>
      <p className="text-slate-600 dark:text-slate-300 text-[10px] md:text-xs font-semibold leading-tight opacity-80">{subtitle}</p>
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

  // Modal State for Collection Name
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{name: string, blob: Blob, size: number}[]>([]);
  const [collectionNameInput, setCollectionNameInput] = useState('General');

  const [activeSet, setActiveSet] = useState<GameSet | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [stealMode, setStealMode] = useState(false);
  const [scoredThisSong, setScoredThisSong] = useState(false);

  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const [showSetup, setShowSetup] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('mm_theme', theme);
  }, [theme]);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallError(null);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setInstallError("The install prompt is hidden. If you are in a preview/editor, try opening the app in a full browser tab, or look for the Install icon in the address bar.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstall(false);
    }
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
    if (setDraft) {
      localStorage.setItem('mm_active_draft', JSON.stringify(setDraft));
    } else {
      localStorage.removeItem('mm_active_draft');
    }
  }, [setDraft]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => { setIsPlaying(false); setPlayingSongId(null); };
    a.addEventListener('play', handlePlay);
    a.addEventListener('pause', handlePause);
    a.addEventListener('ended', handleEnded);
    return () => {
      a.removeEventListener('play', handlePlay);
      a.removeEventListener('pause', handlePause);
      a.removeEventListener('ended', handleEnded);
    };
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

  const playRange = async (songId: string, start: number, end: number) => {
    const a = audioRef.current;
    if (!a) return;
    stopAudio();
    const url = await platformBridge.getAudioUrl(songId);
    if (!url) { alert('Audio file missing.'); return; }
    setPlayingSongId(songId);
    a.src = url;
    try {
      a.currentTime = Math.max(0, start);
      await a.play();
      const ms = Math.round((end - start) * 1000);
      stopTimerRef.current = window.setTimeout(() => { a.pause(); stopTimerRef.current = null; }, ms);
    } catch (e) { console.error('Playback error', e); }
  };

  const togglePlay = async (songId: string) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingSongId === songId) {
      if (a.paused) a.play().catch(console.error); else a.pause();
      return;
    }
    stopAudio();
    const url = await platformBridge.getAudioUrl(songId);
    if (!url) return;
    setPlayingSongId(songId);
    a.src = url;
    a.currentTime = 0;
    a.play().catch(console.error);
  };

  const handleDeleteSong = async (id: string) => {
    if (!confirm('Remove track?')) return;
    try {
      if (playingSongId === id) { stopAudio(); setPlayingSongId(null); }
      await platformBridge.deleteAudio(id);
      await persistence.deleteSong(id);
      setSongs(prev => prev.filter(s => s.id !== id));
    } catch (e) { console.error('Delete failed', e); }
  };

  const handleImportClick = async () => {
    try {
      const selectedFiles = await platformBridge.selectFiles();
      if (!selectedFiles || selectedFiles.length === 0) return;
      setPendingFiles(selectedFiles);
      setCollectionNameInput('General');
      setShowCollectionModal(true);
    } catch (e) { console.error(e); alert('Could not access files.'); }
  };

  const confirmImport = async () => {
    setShowCollectionModal(false);
    const collectionName = collectionNameInput.trim() || 'General';
    const filesToImport = [...pendingFiles];
    setPendingFiles([]); 

    setIsImporting(true);
    setImportProgress(0);
    setImportingFileName('Warming up the Vault...');

    const total = filesToImport.length;
    const BATCH_SIZE = 10; 

    try {
      for (let i = 0; i < filesToImport.length; i += BATCH_SIZE) {
        const batch = filesToImport.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (f) => {
          try {
            const id = crypto.randomUUID();
            const duration = await getAudioDuration(f.blob);
            const nameHash = simpleHash(normalizeName(f.name));
            const song: Song = {
              id, title: stripExt(f.name), duration, filename: f.name, fileSize: f.size, fingerprint: `${f.size}_${Math.round(duration)}_${nameHash}`, addedAt: Date.now(), hasLocalAudio: true, category: collectionName
            };
            await platformBridge.saveAudio(id, f.blob);
            await persistence.saveSong(song);
            return song;
          } catch (err) { console.error(`Import Error (${f.name})`, err); return null; }
        }));
        const successful = batchResults.filter((s): s is Song => s !== null);
        setSongs(prev => [...successful, ...prev]);
        setImportProgress(Math.min(100, Math.round(((i + batch.length) / total) * 100)));
        if (batch.length > 0) setImportingFileName(batch[batch.length - 1].name);
        await new Promise(r => setTimeout(r, 20));
      }
      setImportingFileName('Finalizing...');
      await new Promise(r => setTimeout(r, 500)); 
    } catch (e) { console.error('Critical Import Error', e); alert('An error occurred during import.'); } 
    finally { setIsImporting(false); setImportingFileName(''); }
  };

  const exportSet = (set: GameSet) => {
    const relatedSongs = songs.filter(s => set.songs.some(gs => gs.songId === s.id));
    const data = {
      version: '2.0',
      type: 'game-set',
      set,
      songMetadata: relatedSongs.map(s => ({
        id: s.id, title: s.title, filename: s.filename, fileSize: s.fileSize, fingerprint: s.fingerprint, category: s.category
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${normalizeName(set.name || 'Game')}.mmset`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSetFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmset,application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        if (data.type !== 'game-set') throw new Error('Format Error');
        const updatedSongs = [...songs];
        for (const meta of data.songMetadata) {
          if (!songs.some(s => s.id === meta.id)) {
            const newSong: Song = { ...meta, duration: 0, addedAt: Date.now(), hasLocalAudio: false };
            await persistence.saveSong(newSong);
            updatedSongs.push(newSong);
          }
        }
        setSongs(updatedSongs);
        const newSet: GameSet = data.set;
        const nextSets = [newSet, ...sets.filter(s => s.id !== newSet.id)];
        await persistence.saveSets(nextSets);
        setSets(nextSets);
        alert(`Imported "${newSet.name}".`);
      } catch (err) { alert('Import Failed.'); }
    };
    input.click();
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredSongs.filter(s => !setDraft?.songs.some(gs => gs.songId === s.id)).map(s => s.id);
    if (selectedPickerIds.size === visibleIds.length && visibleIds.length > 0) {
      setSelectedPickerIds(new Set());
    } else {
      setSelectedPickerIds(new Set(visibleIds));
    }
  };

  const toggleSongSelection = (id: string) => {
    const next = new Set(selectedPickerIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPickerIds(next);
  };

  const addSelectedToSet = () => {
    if (!setDraft) return;
    const currentSongIds = new Set(setDraft.songs.map(s => s.songId));
    const newSongs: GameSetSong[] = [];
    selectedPickerIds.forEach(id => {
      if (!currentSongIds.has(id)) {
        newSongs.push({ 
          songId: id, 
          introStart: 0, introEnd: 5,
          clipStart: 0, clipEnd: 5, 
          hintStart: 5, hintEnd: 10,
          bonusStart: 10, bonusEnd: 15,
          isConfigured: false,
          orderIndex: setDraft.songs.length + newSongs.length 
        });
      }
    });
    setSetDraft({ ...setDraft, songs: [...setDraft.songs, ...newSongs] });
    setSelectedPickerIds(new Set());
  };

  const relinkLibrary = async () => {
    const files = await platformBridge.selectFiles();
    if (!files.length) return;
    setIsImporting(true);
    setImportProgress(0);
    let matched = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setImportingFileName(f.name);
      const cand = songs.find(s => !s.hasLocalAudio && (s.fileSize === f.size || normalizeName(s.filename) === normalizeName(f.name)));
      if (cand) {
        await platformBridge.saveAudio(cand.id, f.blob);
        const up: Song = { ...cand, hasLocalAudio: true };
        await persistence.saveSong(up);
        setSongs(prev => prev.map(x => x.id === up.id ? up : x));
        matched++;
      }
      setImportProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise(r => setTimeout(r, 10));
    }
    setIsImporting(false);
    setImportingFileName('');
    alert(`Linked ${matched} tracks.`);
  };

  const saveSet = async () => {
    if (!setDraft || !setDraft.name.trim()) return;
    const norm = { ...setDraft, songs: setDraft.songs.map((s, i) => ({ ...s, orderIndex: i })), isDraft: false };
    const next = [norm, ...sets.filter(s => s.id !== norm.id)];
    await persistence.saveSets(next);
    setSets(next);
    setSetDraft(null); 
    setView('home');
  };

  const startGame = (set: GameSet, teamsCount: number) => {
    const teams: Team[] = Array.from({ length: teamsCount }).map((_, i) => ({ id: crypto.randomUUID(), name: `Team ${i + 1}`, score: 0 }));
    const indices = Array.from({ length: set.songs.length }).map((_, i) => i).sort(() => Math.random() - 0.5);
    setActiveSet(set);
    setGameState({ id: crypto.randomUUID(), setId: set.id, teams, currentSongIndex: 0, currentTurnTeamIndex: 0, isRevealed: false, stealAttempted: false, isFinished: false, shuffledIndices: indices });
    setStealMode(false);
    setScoredThisSong(false);
    setView('game');
  };

  const award = (teamId: string, pts: number) => {
    if (!gameState) return;
    setGameState({ ...gameState, teams: gameState.teams.map(t => t.id === teamId ? { ...t, score: t.score + pts } : t), isRevealed: true, stealAttempted: true });
    setScoredThisSong(true);
    setStealMode(false);
  };

  const nextSong = () => {
    if (!gameState || !activeSet) return;
    const isLast = gameState.currentSongIndex >= activeSet.songs.length - 1;
    if (isLast) {
      const result: GameResult = { id: crypto.randomUUID(), dateTime: Date.now(), setName: activeSet.name, teams: gameState.teams };
      persistence.saveHistory(result);
      setHistory(prev => [result, ...prev]);
      setView('history');
      setGameState(null);
    } else {
      setGameState({ ...gameState, currentSongIndex: gameState.currentSongIndex + 1, currentTurnTeamIndex: (gameState.currentTurnTeamIndex + 1) % gameState.teams.length, isRevealed: false, stealAttempted: false });
      setStealMode(false);
      setScoredThisSong(false);
    }
  };

  const collections = useMemo(() => Array.from(new Set(songs.map(s => s.category || 'General'))).sort(), [songs]);

  const editingSongConfig = useMemo(() => {
    if (!editingSongId || !setDraft) return null;
    return setDraft.songs.find(s => s.songId === editingSongId);
  }, [editingSongId, setDraft]);

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 bg-mesh-light text-slate-900 dark:bg-mesh-dark dark:text-slate-100 selection:bg-fuchsia-500/30 font-sans overflow-hidden`}>
      <BackgroundDecoration />
      <audio ref={audioRef} className="hidden" />

      {/* Compact Header */}
      <header className="px-6 py-4 flex justify-between items-center z-50 sticky top-0 backdrop-blur-sm bg-white/30 dark:bg-black/20 border-b border-white/20 dark:border-white/5 h-16 shrink-0">
        <button onClick={() => setView('home')} className="flex items-center gap-3 group">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-fuchsia-600 rounded-xl shadow-lg group-hover:scale-105 transition-transform"><Music size={18} className="text-white"/></div>
          <span className="font-display text-2xl tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-fuchsia-600 dark:from-indigo-400 dark:to-fuchsia-400 drop-shadow-sm">MELODYMATCH</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-lg glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10 transition-colors">
            {theme === 'light' ? <Moon size={18} strokeWidth={2.5} /> : <Sun size={18} strokeWidth={2.5} />}
          </button>
          {setDraft && view !== 'setBuilder' && (
            <button onClick={() => setView('setBuilder')} className="px-3 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 font-bold text-[10px] shadow-lg shadow-indigo-500/30 animate-pulse hover:bg-indigo-500 transition-colors uppercase tracking-widest">
              <Clock size={14} /> Resume
            </button>
          )}
          <button onClick={() => setView('library')} className={`p-2 rounded-lg transition-all ${view === 'library' ? 'bg-indigo-600 text-white shadow-lg' : 'glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'}`}>
            <Library size={18} strokeWidth={2.5} />
          </button>
          <button onClick={() => setView('history')} className={`p-2 rounded-lg transition-all ${view === 'history' ? 'bg-fuchsia-600 text-white shadow-lg' : 'glass-panel text-slate-600 dark:text-slate-300 hover:bg-white/50 dark:hover:bg-white/10'}`}>
            <HistoryIcon size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Main Content Area - constrained to viewport height for home view */}
      <main className={`flex-grow p-4 md:p-6 z-10 ${view === 'home' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        
        {/* HOME VIEW - DASHBOARD LAYOUT */}
        {view === 'home' && (
          <div className="w-full h-full max-w-[1600px] mx-auto animate-in fade-in duration-700 flex flex-col lg:flex-row gap-4">
            
            {/* Left Column: Hero & Actions (45% Width on Large) */}
            <div className="flex-col gap-4 flex lg:w-5/12 shrink-0 h-full overflow-y-auto lg:overflow-hidden custom-scrollbar pb-6 lg:pb-0">
               
               {/* Hero Section */}
               <div className="space-y-4 py-4 md:py-6 pl-2">
                 <h1 className="text-5xl md:text-7xl font-display dark:glow-text-neon tracking-normal text-slate-900 dark:text-white leading-[0.9] drop-shadow-xl uppercase">
                    MELODY<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500">MATCH</span>
                 </h1>
                 <p className="text-slate-600 dark:text-slate-400 font-bold text-sm md:text-base tracking-[0.3em] uppercase opacity-90 max-w-md border-l-4 border-indigo-500 pl-4 py-1">
                    The Ultimate Music Quiz Engine
                 </p>
               </div>

               {/* Action Buttons - Stacked or Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                  <DashboardCard 
                    title="Library" 
                    subtitle={`${songs.length} Tracks`} 
                    icon={<LibraryBig />} 
                    onClick={() => setView('library')} 
                    colorClass="text-indigo-600 dark:text-indigo-400" 
                    bgGradient="bg-gradient-to-br from-indigo-500/10 to-blue-500/10 hover:from-indigo-500/20 hover:to-blue-500/20 border-indigo-200/50 dark:border-indigo-500/30"
                    compact
                  />
                  <DashboardCard 
                    title={setDraft ? "Resume" : "Builder"} 
                    subtitle={setDraft ? "Draft Active" : "Create New"} 
                    icon={setDraft ? <Clock /> : <ListPlus />} 
                    onClick={() => { if (!setDraft) setSetDraft({ id: crypto.randomUUID(), name: '', description: '', songs: [], createdAt: Date.now() }); setView('setBuilder'); }} 
                    colorClass="text-fuchsia-600 dark:text-fuchsia-400" 
                    bgGradient="bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10 hover:from-fuchsia-500/20 hover:to-pink-500/20 border-fuchsia-200/50 dark:border-fuchsia-500/30"
                    compact
                  />
                  <DashboardCard 
                    title="Hall of Fame" 
                    subtitle="High Scores" 
                    icon={<Trophy />} 
                    onClick={() => setView('history')} 
                    colorClass="text-amber-500" 
                    bgGradient="bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border-amber-200/50 dark:border-amber-500/30"
                    compact
                  />
                  <button onClick={importSetFile} className="p-3 rounded-[1.25rem] glass-card flex items-center gap-3 group hover:shadow-xl hover:-translate-y-1 transition-all bg-slate-100/50 dark:bg-white/5 border-dashed border-2 border-slate-300 dark:border-white/10 hover:border-indigo-400">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <FileUp size={20} className="text-slate-500 dark:text-slate-400 group-hover:text-white"/>
                    </div>
                    <div className="text-left">
                       <h3 className="text-lg font-brand text-slate-700 dark:text-slate-300">Import File</h3>
                       <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">.mmset</p>
                    </div>
                  </button>
               </div>
               
               <div className="mt-auto hidden lg:block">
                  <button onClick={() => setShowInstall(true)} className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors px-2 py-4">
                     <Download size={16} /> Install App for Offline Use
                  </button>
               </div>
            </div>

            {/* Right Column: Quick Play Console (Fill Remaining) */}
            <div className="flex-grow lg:w-7/12 glass-panel rounded-[2.5rem] p-6 md:p-8 shadow-2xl flex flex-col h-full overflow-hidden relative border border-white/40 dark:border-white/5">
               <div className="absolute top-0 right-0 p-8 opacity-5 dark:opacity-[0.02] pointer-events-none">
                  <Grid size={300} />
               </div>

               <div className="flex justify-between items-center mb-6 shrink-0 relative z-10">
                  <h2 className="text-slate-700 dark:text-slate-200 font-brand text-lg uppercase tracking-wide flex items-center gap-3">
                    <Zap size={20} className="text-yellow-500 fill-yellow-500"/> Quick Play
                  </h2>
                  <div className="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-lg text-[10px] font-bold uppercase text-slate-500 tracking-widest">
                    {sets.length} Games Available
                  </div>
               </div>

               {sets.length === 0 ? (
                  <div className="flex-grow flex flex-col items-center justify-center gap-6 text-slate-400 bg-slate-50/50 dark:bg-black/20 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-white/5 mx-2 mb-2">
                    <Music size={48} className="opacity-30" />
                    <div className="text-center">
                      <p className="font-brand text-lg uppercase tracking-widest opacity-60 mb-2">No Games Found</p>
                      <button onClick={() => { setSetDraft({ id: crypto.randomUUID(), name: '', description: '', songs: [], createdAt: Date.now() }); setView('setBuilder'); }} className="text-indigo-500 hover:underline text-xs font-bold uppercase tracking-widest">Create your first game</button>
                    </div>
                  </div>
               ) : (
                  <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {sets.map(s => (
                      <div key={s.id} className="p-4 bg-white/60 dark:bg-slate-900/40 rounded-[1.5rem] border border-white/40 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-indigo-400/50 hover:bg-white/80 dark:hover:bg-slate-800/60 transition-all group">
                        <div className="truncate w-full sm:w-auto">
                            <h4 className="text-lg font-brand text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{s.name || 'Untitled Game'}</h4>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">{s.songs.length} Tracks</span>
                               <span className="text-[10px] text-slate-400 font-mono">{new Date(s.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                          <button onClick={() => startGame(s, 2)} className="flex-grow sm:flex-grow-0 px-6 py-3 bg-indigo-600 rounded-xl font-bold text-sm text-white shadow-lg hover:shadow-indigo-500/30 hover:bg-indigo-500 transition-all active:scale-95 uppercase tracking-wide">Play</button>
                          <button onClick={() => { setSetDraft(s); setView('setBuilder'); }} className="p-3 bg-slate-200 dark:bg-white/5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-white hover:text-indigo-600 transition-colors" title="Edit"><Edit3 size={16}/></button>
                          <button onClick={() => exportSet(s)} className="p-3 bg-slate-200 dark:bg-white/5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-white hover:text-fuchsia-600 transition-colors" title="Export"><Share2 size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
               )}
            </div>
            
            <div className="lg:hidden mt-4 text-center pb-8">
               <button onClick={() => setShowInstall(true)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors bg-white/50 dark:bg-white/5 px-4 py-2 rounded-full">
                  <Download size={14} /> Install App
               </button>
            </div>
          </div>
        )}

        {/* ... (Rest of the views) ... */}

        {view === 'library' && (
          <div className="max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-8 duration-500">
             <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-gradient-to-r from-indigo-900/80 to-purple-900/80 p-8 rounded-[3rem] text-white shadow-2xl backdrop-blur-xl border border-white/10">
                <div>
                    <h2 className="text-6xl font-brand mb-2 uppercase text-transparent bg-clip-text bg-gradient-to-b from-white to-indigo-200">Music Vault</h2>
                    <p className="font-mono text-sm tracking-widest uppercase opacity-70 border-l-4 border-fuchsia-500 pl-4">{songs.length} Tracks • {collections.length} Collections</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setView('home')} className="px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-bold uppercase text-xs tracking-widest border border-white/10 transition-all backdrop-blur-md">Back</button>
                  <button onClick={handleImportClick} className="px-8 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl text-white uppercase text-xs tracking-widest"><FolderPlus size={18}/> Import</button>
                  <button onClick={relinkLibrary} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl text-white uppercase text-xs tracking-widest"><Link2 size={18}/> Link</button>
                </div>
             </div>
             
             <div className="relative z-10">
                 <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                 <input className="w-full glass-panel rounded-[2.5rem] py-6 pl-16 pr-8 text-xl focus:border-indigo-500 outline-none shadow-lg transition-all text-slate-900 dark:text-white placeholder:text-slate-400" placeholder="Search your tracks..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
             </div>

             <div className="glass-panel rounded-[3rem] overflow-hidden shadow-2xl">
               <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50/90 dark:bg-black/40 sticky top-0 backdrop-blur-xl border-b border-slate-200 dark:border-white/10 z-10">
                      <tr><th className="p-8 font-black text-xs text-slate-400 tracking-[0.3em] uppercase">Track Title</th><th className="p-8 font-black text-xs text-slate-400 tracking-[0.3em] uppercase">Collection</th><th className="p-8 font-black text-xs text-slate-400 tracking-[0.3em] uppercase text-right">Status</th><th className="p-8 w-24"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {filteredSongs.map(s => (
                        <tr key={s.id} className="hover:bg-indigo-500/10 transition-colors group">
                          <td className="p-8"><p className="font-bold text-xl mb-1 text-slate-800 dark:text-white">{s.title}</p><p className="text-xs font-mono text-slate-500 dark:text-slate-400 opacity-70">{s.filename}</p></td>
                          <td className="p-8"><span className="px-4 py-1.5 bg-white/50 dark:bg-white/5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border border-slate-200 dark:border-white/10">{s.category || 'General'}</span></td>
                          <td className="p-8 text-right"><span className={`text-[10px] font-black tracking-[0.2em] uppercase px-4 py-2 rounded-full border ${s.hasLocalAudio ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-600 bg-rose-500/10 border-rose-200 animate-pulse'}`}>{s.hasLocalAudio ? 'Ready' : 'Missing'}</span></td>
                          <td className="p-8 text-right"><div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all"><button onClick={() => togglePlay(s.id)} className={`p-3 rounded-2xl transition-all shadow-lg ${playingSongId === s.id && isPlaying ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white dark:bg-white/10 text-slate-600 dark:text-white'}`}>{playingSongId === s.id && isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><button onClick={() => handleDeleteSong(s.id)} className="p-3 bg-white dark:bg-white/10 rounded-2xl hover:bg-rose-600 hover:text-white transition-all text-rose-500"><Trash2 size={20}/></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>
             </div>
          </div>
        )}

        {view === 'setBuilder' && setDraft && (
           <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-glass p-6 rounded-[2rem]">
                <div>
                    <h2 className="text-5xl font-brand mb-2 text-slate-900 dark:text-white uppercase drop-shadow-sm">Set Builder</h2>
                    <p className="font-mono text-xs tracking-[0.2em] uppercase opacity-60 bg-white/50 dark:bg-black/30 w-fit px-4 py-2 rounded-lg">Draft: {setDraft.name || 'Untitled'} • {setDraft.songs.length} Selected</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setView('home')} className="px-6 py-4 glass-panel rounded-2xl font-bold uppercase text-xs tracking-widest flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/20 transition-colors"><ArrowLeft size={18} /> Back</button>
                  <button onClick={saveSet} className="px-8 py-4 bg-emerald-600 rounded-2xl font-brand text-lg flex items-center gap-3 hover:bg-emerald-500 transition-all shadow-xl text-white uppercase active:scale-95"><Save size={22}/> Save Game</button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
                 {/* Left Column: Game Details and Song List */}
                 <div className="space-y-6">
                    <div className="p-8 glass-panel rounded-[2.5rem] space-y-6 shadow-xl"><h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400 border-b border-slate-200 dark:border-white/10 pb-4">Game Config</h3><input className="w-full bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-5 text-xl font-bold focus:border-indigo-500 outline-none text-slate-800 dark:text-white placeholder:text-slate-400" placeholder="Game Name..." value={setDraft.name} onChange={e => setSetDraft({...setDraft, name: e.target.value})} /><textarea className="w-full bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl p-5 text-sm focus:border-indigo-500 outline-none h-24 resize-none text-slate-800 dark:text-white placeholder:text-slate-400" placeholder="Host Notes..." value={setDraft.description} onChange={e => setSetDraft({...setDraft, description: e.target.value})} /></div>
                    
                    <div className="space-y-4">
                       <div className="flex justify-between items-center ml-4"><h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400 bg-white/80 dark:bg-black/40 px-3 py-1 rounded-md backdrop-blur-sm">Set Order</h3></div>
                       <div className="space-y-3 max-h-[600px] overflow-y-auto pr-3 custom-scrollbar">
                       {setDraft.songs.map((ss, idx) => {
                         const s = songs.find(x => x.id === ss.songId);
                         if (!s) return null;
                         const isEditing = editingSongId === ss.songId;

                         return (
                           <React.Fragment key={ss.songId}>
                             <div className={`p-6 rounded-[2rem] border transition-all duration-300 flex items-center justify-between shadow-sm backdrop-blur-md ${isEditing ? 'bg-indigo-600 border-indigo-500 shadow-xl ring-4 ring-indigo-500/20 scale-[1.02] z-10' : 'bg-white/80 dark:bg-slate-900/60 border-white/40 dark:border-white/5 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-white dark:hover:bg-slate-800'}`}>
                               <div className="flex items-center gap-5 truncate mr-4">
                                 <span className={`font-mono text-sm font-black shrink-0 ${isEditing ? 'text-indigo-200' : 'text-slate-300'}`}>{idx + 1}</span>
                                 <div className="truncate"><p className={`font-bold text-lg truncate ${isEditing ? 'text-white' : 'text-slate-800 dark:text-white'}`}>{s.title}</p></div>
                               </div>
                               <div className="flex gap-2 shrink-0">
                                 <button onClick={() => setEditingSongId(isEditing ? null : ss.songId)} className={`p-3 rounded-xl transition-all ${ss.isConfigured ? 'bg-emerald-500 text-white shadow-lg' : isEditing ? 'bg-white text-indigo-600 shadow-lg' : 'bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-indigo-600'}`} title={ss.isConfigured ? "Regions Saved" : "Configure"}>
                                   {ss.isConfigured ? <CheckCircle size={18} strokeWidth={3} /> : <Settings size={18} strokeWidth={2.5}/>}
                                 </button>
                                 <button onClick={() => { if(isEditing) setEditingSongId(null); setSetDraft({...setDraft, songs: setDraft.songs.filter(x => x.songId !== ss.songId)})}} className={`p-3 rounded-xl transition-colors ${isEditing ? 'text-indigo-200 hover:text-white' : 'text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}><XCircle size={18}/></button>
                               </div>
                             </div>
                           </React.Fragment>
                         );
                       })}
                    </div></div>
                 </div>

                 {/* Right Column: Library Picker OR Waveform Editor (Sticky) */}
                 <div className="space-y-8 h-full">
                    {editingSongId && editingSongConfig ? (
                       <div className="sticky top-24 animate-in slide-in-from-right-8 fade-in duration-300 z-20">
                           <div className="p-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[2.5rem] border-2 border-indigo-500 shadow-2xl space-y-6 relative overflow-hidden">
                              {/* Glowing Accent */}
                              <div className="absolute top-0 right-0 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-[60px] -mr-10 -mt-10 pointer-events-none animate-pulse-slow" />
                              
                              <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/10 pb-4 relative z-10">
                                  <div>
                                      <div className="flex items-center gap-2 text-indigo-500 mb-1">
                                         <Edit3 size={14} />
                                         <h3 className="text-xs font-black uppercase tracking-[0.2em]">Region Editor</h3>
                                      </div>
                                      <p className="text-lg font-bold text-slate-800 dark:text-white truncate max-w-[250px] leading-tight">{songs.find(s => s.id === editingSongId)?.title}</p>
                                  </div>
                                  <button onClick={() => setEditingSongId(null)} className="px-4 py-2 bg-slate-100 dark:bg-white/10 rounded-xl text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 hover:bg-rose-100 hover:text-rose-600 transition-colors">Close</button>
                              </div>
                              
                              <WaveformEditorLoader 
                                  songId={editingSongId} 
                                  clipStart={editingSongConfig.clipStart || 0} 
                                  clipEnd={editingSongConfig.clipEnd || 5} 
                                  hintStart={editingSongConfig.hintStart || 5} 
                                  hintEnd={editingSongConfig.hintEnd || 10}
                                  introStart={editingSongConfig.introStart || 0}
                                  introEnd={editingSongConfig.introEnd || 5}
                                  bonusStart={editingSongConfig.bonusStart || 10}
                                  bonusEnd={editingSongConfig.bonusEnd || 15}

                                  onSave={(c, h, i, b) => { 
                                    setSetDraft({...setDraft, songs: setDraft.songs.map(x => x.songId === editingSongId ? {
                                      ...x, 
                                      clipStart: c.start, clipEnd: c.end, 
                                      hintStart: h.start, hintEnd: h.end,
                                      introStart: i.start, introEnd: i.end,
                                      bonusStart: b.start, bonusEnd: b.end,
                                      isConfigured: true
                                    } : x)}); 
                                    setEditingSongId(null); 
                                  }} 
                                  maxDuration={30} 
                              />
                           </div>
                       </div>
                    ) : (
                       <div className="p-8 glass-panel rounded-[2.5rem] space-y-6 shadow-lg relative overflow-hidden transition-colors sticky top-24">
                           <div className="flex justify-between items-center relative z-10 border-b border-slate-200 dark:border-white/10 pb-4">
                               <h3 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">Library</h3>
                               <button onClick={toggleSelectAll} className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-600 border border-indigo-500/20 px-4 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">{selectedPickerIds.size === filteredSongs.length && filteredSongs.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />} Select All</button>
                           </div>
                           <div className="relative">
                               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                               <input className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm outline-none text-slate-800 dark:text-white focus:border-indigo-500 transition-all placeholder:text-slate-400" placeholder="Filter by name..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
                           </div>
                           <div className="space-y-2 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
                               {filteredSongs.map(s => {
                                 const alreadyInSet = setDraft.songs.some(x => x.songId === s.id);
                                 const isSelected = selectedPickerIds.has(s.id);
                                 return (<div key={s.id} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${alreadyInSet ? 'opacity-40 pointer-events-none' : isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500' : 'bg-white/50 dark:bg-black/10 border-transparent hover:border-slate-300 dark:hover:border-slate-600'}`} onClick={() => !alreadyInSet && toggleSongSelection(s.id)}><div className="flex items-center gap-4 flex-grow truncate"><div className="text-indigo-600">{isSelected ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-300 dark:text-slate-600" />}</div><div className="truncate text-left"><p className="font-bold text-sm text-slate-800 dark:text-white truncate">{s.title}</p></div></div></div>);
                               })}
                           </div>
                           {selectedPickerIds.size > 0 && (<button onClick={addSelectedToSet} className="w-full py-5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 rounded-2xl font-brand text-lg text-white shadow-xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform"><Plus size={24} /> Add {selectedPickerIds.size} Tracks</button>)}
                       </div>
                    )}
                 </div>
              </div>
           </div>
        )}

        {view === 'game' && gameState && (
           <div className="max-w-7xl mx-auto w-full space-y-12 animate-in fade-in">
             <Scoreboard teams={gameState.teams} currentTurnIndex={gameState.currentTurnTeamIndex} />
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <div className="flex flex-col items-center gap-12">
                  <div className={`w-full aspect-video rounded-[4rem] border-[10px] flex flex-col items-center justify-center transition-all duration-700 relative overflow-hidden shadow-2xl ${gameState.isRevealed ? 'bg-gradient-to-br from-indigo-600 to-fuchsia-600 border-indigo-400' : 'glass-panel border-white/20'}`}>
                   {/* Background spin effect for game card */}
                   {!gameState.isRevealed && <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent animate-pulse-slow"></div>}
                   
                   {gameState.isRevealed ? (
                     <div className="text-center animate-in zoom-in-50 duration-500 space-y-8 z-10 p-8">
                       <Music size={120} className="mx-auto text-white/30 animate-bounce" />
                       <h2 className="text-5xl md:text-7xl font-brand text-white px-4 leading-tight drop-shadow-md">{songs.find(s => s.id === (activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]].songId))?.title}</h2>
                     </div>
                   ) : (
                     <div className="flex flex-col items-center z-10">
                       <span className="text-[14rem] font-display text-indigo-900/20 dark:text-white/20 select-none animate-float-slow">?</span>
                       <p className="text-indigo-900/40 dark:text-white/40 font-brand tracking-[0.6em] text-lg uppercase -mt-10">Track {gameState.currentSongIndex + 1}</p>
                     </div>
                   )}
                  </div>
                
                  {/* 2x2 Button Grid for Game Controls */}
                  <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
                     {/* Intro - Green */}
                     <button onClick={() => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.introStart || 0, cur.introEnd || 5); }} className="py-8 bg-emerald-500 hover:bg-emerald-400 text-white rounded-[2.5rem] font-brand text-2xl shadow-xl flex flex-col items-center gap-2 border-b-[6px] border-emerald-700 active:scale-95 active:border-b-0 active:translate-y-2 transition-all">
                        <Play size={32} fill="currentColor"/> <span className="text-sm opacity-80">INTRO</span>
                     </button>

                     {/* Main - Indigo */}
                     <button onClick={() => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.clipStart, cur.clipEnd); }} className="py-8 bg-indigo-500 hover:bg-indigo-400 text-white rounded-[2.5rem] font-brand text-2xl shadow-xl flex flex-col items-center gap-2 border-b-[6px] border-indigo-700 active:scale-95 active:border-b-0 active:translate-y-2 transition-all">
                        <Zap size={32} fill="currentColor"/> <span className="text-sm opacity-80">MAIN</span>
                     </button>
                     
                     {/* Hint - Amber */}
                     <button onClick={() => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.hintStart, cur.hintEnd); }} className="py-8 bg-amber-500 hover:bg-amber-400 text-white rounded-[2.5rem] font-brand text-2xl shadow-xl flex flex-col items-center gap-2 border-b-[6px] border-amber-700 active:scale-95 active:border-b-0 active:translate-y-2 transition-all">
                        <Sparkles size={32} fill="currentColor"/> <span className="text-sm opacity-80">HINT</span>
                     </button>

                     {/* Bonus - Rose */}
                     <button onClick={() => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.bonusStart || 10, cur.bonusEnd || 15); }} className="py-8 bg-fuchsia-500 hover:bg-fuchsia-400 text-white rounded-[2.5rem] font-brand text-2xl shadow-xl flex flex-col items-center gap-2 border-b-[6px] border-fuchsia-700 active:scale-95 active:border-b-0 active:translate-y-2 transition-all">
                        <Star size={32} fill="currentColor"/> <span className="text-sm opacity-80">BONUS</span>
                     </button>
                  </div>
                </div>

                <div className="glass-panel p-16 rounded-[4rem] space-y-12 shadow-2xl backdrop-blur-xl relative">
                   <h3 className="text-center font-brand text-slate-400 dark:text-slate-500 tracking-[0.5em] uppercase text-sm">Host Terminal</h3>
                   <div className="space-y-8">
                      <button onClick={() => award(gameState.teams[gameState.currentTurnTeamIndex].id, 2)} className="w-full py-10 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white rounded-[3rem] font-brand text-6xl shadow-[0_15px_40px_rgba(16,185,129,0.4)] transition-all active:scale-95 hover:brightness-110">Correct</button>
                      <div className="grid grid-cols-2 gap-6">
                        <button onClick={() => setStealMode(true)} className="py-8 bg-rose-500 hover:bg-rose-400 text-white rounded-[2.5rem] font-brand text-3xl shadow-lg active:scale-95 uppercase transition-all">Wrong</button>
                        <button onClick={() => setGameState({...gameState, isRevealed: true})} className="py-8 bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 rounded-[2.5rem] font-brand text-3xl uppercase hover:bg-slate-300 dark:hover:bg-white/20 transition-all">Skip</button>
                      </div>
                      {stealMode && !scoredThisSong && (<div className="p-8 bg-indigo-100/50 dark:bg-indigo-900/30 rounded-[3rem] border-2 border-indigo-500/30 space-y-6 animate-in slide-in-from-bottom-4"><p className="text-center text-xs font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase">Steal Chance (+1)</p><div className="flex gap-4">{gameState.teams.map((t, i) => i !== gameState.currentTurnTeamIndex ? (<button key={t.id} onClick={() => award(t.id, 1)} className="flex-grow py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-brand text-xl shadow-lg transition-colors">{t.name}</button>) : null)}</div></div>)}
                   </div>
                   {gameState.isRevealed && (<button onClick={nextSong} className="w-full py-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[3rem] font-brand text-4xl flex items-center justify-center gap-6 uppercase shadow-2xl hover:scale-[1.02] transition-transform">Next Track <SkipForward size={40} strokeWidth={3}/></button>)}
                </div>
             </div>
          </div>
        )}

        {/* ... (Rest of the views remain the same) ... */}
        {view === 'history' && (
          <div className="max-w-4xl mx-auto w-full space-y-12 animate-in fade-in">
             <div className="text-center">
                <h2 className="text-7xl font-brand text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-600 uppercase mb-4 drop-shadow-sm">Hall of Fame</h2>
                <div className="h-1 w-24 bg-gradient-to-r from-amber-400 to-orange-600 mx-auto rounded-full"></div>
             </div>
             
             <div className="space-y-8">
              {history.map(h => (
                <div key={h.id} className="p-10 glass-panel rounded-[3rem] flex flex-col md:flex-row justify-between items-center gap-10 shadow-lg hover:scale-[1.02] transition-transform duration-300">
                   <div className="text-center md:text-left">
                     <h4 className="text-3xl font-brand text-slate-800 dark:text-white truncate max-w-[300px] mb-2">{h.setName}</h4>
                     <p className="text-slate-500 font-mono text-sm uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-4 py-1 rounded-full w-fit">{new Date(h.dateTime).toLocaleDateString()}</p>
                   </div>
                   <div className="flex gap-4 shrink-0 overflow-x-auto pb-2">
                     {h.teams.map((t, idx) => (
                       <div key={t.id} className={`px-8 py-6 rounded-[2rem] border flex flex-col items-center shadow-md min-w-[140px] ${idx === 0 ? 'bg-amber-100/50 dark:bg-amber-900/20 border-amber-500/30' : 'bg-white/50 dark:bg-white/5 border-white/10'}`}>
                         <span className="text-[10px] opacity-60 uppercase tracking-widest mb-2 truncate max-w-[80px] font-black">{t.name}</span>
                         <span className={`text-5xl font-brand ${idx === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>{t.score}</span>
                       </div>
                     ))}
                   </div>
                </div>
              ))}
             </div>
             <div className="flex justify-center"><button onClick={() => setView('home')} className="px-12 py-5 glass-panel rounded-full font-brand text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:bg-white transition-colors shadow-lg">Return Home</button></div>
          </div>
        )}
      </main>

      {/* NEW: Collection Name Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-6 animate-in fade-in">
           <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-3xl text-center space-y-8 max-w-lg w-full relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 to-fuchsia-500"></div>
             <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-full w-fit mx-auto"><FolderPlus size={40} className="text-indigo-600 dark:text-indigo-400" /></div>
             <div>
                <h3 className="text-3xl font-brand text-slate-900 dark:text-white uppercase mb-2">Organize Tracks</h3>
                <p className="text-slate-500 dark:text-slate-400">Importing {pendingFiles.length} files. Group them into a collection:</p>
             </div>
             <input autoFocus className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-center text-lg font-bold focus:border-indigo-600 outline-none text-slate-900 dark:text-white placeholder:text-slate-400" placeholder="e.g. 80s Hits, TV Themes..." value={collectionNameInput} onChange={e => setCollectionNameInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmImport()} />
             <div className="grid grid-cols-2 gap-4">
               <button onClick={() => { setShowCollectionModal(false); setPendingFiles([]); }} className="py-4 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 rounded-2xl font-bold uppercase hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">Cancel</button>
               <button onClick={confirmImport} className="py-4 bg-indigo-600 text-white rounded-2xl font-bold uppercase hover:bg-indigo-500 transition-colors shadow-lg">Import Tracks</button>
             </div>
           </div>
        </div>
      )}

      {isImporting && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 p-12 rounded-[4rem] border border-slate-200 dark:border-white/10 shadow-3xl text-center space-y-10 max-w-md w-full relative">
            <div className="relative w-40 h-40 mx-auto">
              <svg className="w-full h-full -rotate-90"><circle cx="80" cy="80" r="75" fill="transparent" stroke="currentColor" strokeWidth="10" className="text-slate-100 dark:text-slate-800" /><circle cx="80" cy="80" r="75" fill="transparent" stroke="currentColor" strokeWidth="10" strokeDasharray="471" strokeDashoffset={471 - (4.71 * importProgress)} strokeLinecap="round" className="text-indigo-600 transition-all duration-300" /></svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col"><Music size={48} className="text-indigo-600 animate-pulse mb-1" /><span className="text-xl font-brand text-indigo-600">{importProgress}%</span></div>
            </div>
            <div className="space-y-4">
              <h3 className="text-2xl font-brand text-slate-900 dark:text-white uppercase tracking-tight">Updating Vault</h3>
              <p className="text-slate-400 font-mono text-[10px] uppercase tracking-[0.2em] truncate px-4">{importingFileName || 'Processing...'}</p>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-300" style={{width: `${importProgress}%`}} /></div>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 leading-relaxed italic uppercase tracking-widest">Standalone performance enabled...</p>
          </div>
        </div>
      )}

      {showInstall && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6 backdrop-blur-md animate-in fade-in">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-200 dark:border-white/10 p-16 shadow-3xl space-y-10 text-center relative overflow-hidden">
            {/* Background Accent */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500"></div>

            <div className="p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-full w-fit mx-auto animate-pulse">
              <Download size={64} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            
            <div className="space-y-4">
              <h2 className="text-4xl font-brand text-slate-900 dark:text-white uppercase">Install App</h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg max-w-md mx-auto leading-relaxed">
                MelodyMatch is a <strong>Progressive Web App (PWA)</strong>. It installs directly from your browser—no app store required.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Windows / Android Option */}
              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/10 flex flex-col items-center gap-4">
                <div className="flex gap-3 text-slate-400">
                  <Monitor size={24} /> <Smartphone size={24} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white uppercase tracking-widest text-sm">Windows & Android</h3>
                {installError ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-bold leading-relaxed text-left flex items-start gap-3">
                     <AlertCircle size={32} className="shrink-0" />
                     {installError}
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={handleInstallClick} 
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase transition-colors shadow-lg text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                      <Download size={16} /> Install Now
                    </button>
                    {!deferredPrompt && (
                      <p className="text-[10px] text-slate-400 text-center">
                        If nothing happens, install directly from your browser's address bar.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* iOS Option */}
              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/10 flex flex-col items-center gap-4">
                <div className="flex gap-3 text-slate-400">
                   <Tablet size={24} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-white uppercase tracking-widest text-sm">iPad & iPhone</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed space-y-2 text-left w-full">
                   <div className="flex items-center gap-2">1. Open in <strong>Safari</strong>.</div>
                   <div className="flex items-center gap-2">2. Tap <Share size={14} className="text-indigo-500"/> <strong>Share</strong>.</div>
                   <div className="flex items-center gap-2">3. Tap <PlusSquare size={14} className="text-indigo-500"/> <strong>Add to Home Screen</strong>.</div>
                </div>
              </div>
            </div>

            <button onClick={() => { setShowInstall(false); setInstallError(null); }} className="text-slate-400 font-black uppercase text-xs tracking-widest pt-4 hover:text-slate-600 dark:hover:text-slate-200">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
};

const WaveformEditorLoader: React.FC<{ songId: string; clipStart: number; clipEnd: number; hintStart: number; hintEnd: number; introStart: number; introEnd: number; bonusStart: number; bonusEnd: number; onSave: (clip: { start: number; end: number }, hint: { start: number; end: number }, intro: { start: number; end: number }, bonus: { start: number; end: number }) => void; maxDuration: number; }> = ({ songId, clipStart, clipEnd, hintStart, hintEnd, introStart, introEnd, bonusStart, bonusEnd, onSave, maxDuration }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => { platformBridge.getAudioUrl(songId).then(u => setUrl(u || '')); }, [songId]);
  if (!url) return <div className="p-24 text-center bg-white dark:bg-slate-950 rounded-[3rem] border border-slate-200 text-slate-300 font-brand text-xl animate-pulse uppercase">Syncing...</div>;
  return <WaveformEditor key={songId} url={url} clipStart={clipStart} clipEnd={clipEnd} hintStart={hintStart} hintEnd={hintEnd} introStart={introStart} introEnd={introEnd} bonusStart={bonusStart} bonusEnd={bonusEnd} onSave={onSave} maxDuration={maxDuration} />;
};

export default App;
