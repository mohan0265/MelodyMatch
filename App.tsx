
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
  FastForward
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

const MainMenuButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  description?: string;
}> = ({ label, icon, active, onClick, description }) => (
  <button 
    onClick={onClick}
    className={`group w-full flex items-center justify-between p-4 rounded-xl transition-all duration-300 border-2 text-left ${active ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg scale-105' : 'bg-white/50 dark:bg-white/5 border-transparent hover:bg-white/80 dark:hover:bg-white/10 hover:border-indigo-400/30 text-slate-600 dark:text-slate-300'}`}
  >
    <div className="flex items-center gap-4">
      <div className={`p-2 rounded-lg ${active ? 'bg-white/20' : 'bg-slate-200 dark:bg-black/20 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30'} transition-colors`}>
        {React.cloneElement(icon as React.ReactElement<any>, { size: 20, className: active ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-indigo-500' })}
      </div>
      <div>
        <h3 className="font-brand text-lg uppercase leading-none tracking-wide">{label}</h3>
        {description && <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${active ? 'text-indigo-200' : 'text-slate-400'}`}>{description}</p>}
      </div>
    </div>
    {active && <ChevronRight className="animate-pulse" />}
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
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${theme === 'light' ? 'bg-mesh-light text-slate-900' : 'bg-mesh-dark text-slate-100'} selection:bg-fuchsia-500/30 font-sans overflow-hidden`}>
      <BackgroundDecoration />
      <audio ref={audioRef} className="hidden" />

      {/* Compact Header */}
      {view !== 'game' && (
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
      )}

      {/* Main Content Area - constrained to viewport height for home view */}
      <main className={`flex-grow p-4 md:p-6 z-10 ${view === 'home' || view === 'game' ? 'overflow-hidden flex flex-col p-0 md:p-0' : 'overflow-y-auto'}`}>
        
        {/* HOME VIEW - TITLE SCREEN LAYOUT */}
        {view === 'home' && (
          <div className="w-full h-full max-w-5xl mx-auto animate-in fade-in duration-700 flex flex-col md:flex-row gap-8 items-center justify-center">
            {/* ... Same as before ... */}
            <div className="w-full md:w-5/12 space-y-4">
               <div className="mb-8 pl-2">
                 <h1 className="text-5xl md:text-6xl font-display dark:glow-text-neon tracking-normal text-slate-900 dark:text-white leading-[0.9] uppercase">
                    MELODY<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-fuchsia-500">MATCH</span>
                 </h1>
                 <div className="h-1 w-24 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full mt-4 mb-2"></div>
                 <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Quiz Engine v2.0</p>
               </div>

               <div className="space-y-3">
                  <MainMenuButton 
                     label="Quick Play" 
                     icon={<Gamepad2 />} 
                     description={`${sets.length} Games Ready`}
                     active={true}
                     onClick={() => {}}
                  />
                  <MainMenuButton 
                     label="Game Builder" 
                     icon={<ListPlus />} 
                     description="Create & Edit"
                     onClick={() => { if (!setDraft) setSetDraft({ id: crypto.randomUUID(), name: '', description: '', songs: [], createdAt: Date.now() }); setView('setBuilder'); }}
                  />
                  <MainMenuButton 
                     label="Music Vault" 
                     icon={<LibraryBig />} 
                     description={`${songs.length} Tracks`}
                     onClick={() => setView('library')}
                  />
                  <MainMenuButton 
                     label="Hall of Fame" 
                     icon={<Trophy />} 
                     onClick={() => setView('history')}
                  />
               </div>
               
               <div className="pt-4 flex gap-3">
                 <button onClick={importSetFile} className="flex-1 py-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-500 hover:text-indigo-500 hover:border-indigo-400 transition-colors flex items-center justify-center gap-2"><FileUp size={14}/> Import Set</button>
                 <button onClick={() => setShowInstall(true)} className="flex-1 py-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-500 hover:text-indigo-500 hover:border-indigo-400 transition-colors flex items-center justify-center gap-2"><Download size={14}/> Install App</button>
               </div>
            </div>

            <div className="w-full md:w-7/12 h-[500px] glass-panel rounded-[2.5rem] p-6 shadow-2xl flex flex-col relative overflow-hidden border border-white/40 dark:border-white/5">
               <div className="flex justify-between items-center mb-6 shrink-0 relative z-10 border-b border-slate-200 dark:border-white/5 pb-4">
                  <h2 className="text-slate-700 dark:text-white font-brand text-lg uppercase tracking-wider flex items-center gap-2">
                    <Zap size={18} className="text-yellow-500 fill-yellow-500"/> Available Games
                  </h2>
               </div>

               {sets.length === 0 ? (
                  <div className="flex-grow flex flex-col items-center justify-center gap-4 text-slate-400">
                    <Music size={40} className="opacity-20" />
                    <p className="font-mono text-xs uppercase tracking-widest opacity-60">No Games Found</p>
                  </div>
               ) : (
                  <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {sets.map(s => (
                      <div key={s.id} className="p-3 bg-white/40 dark:bg-slate-900/40 rounded-xl border border-white/40 dark:border-white/5 flex items-center justify-between hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all group">
                        <div className="truncate px-2">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-indigo-500 transition-colors">{s.name || 'Untitled Game'}</h4>
                            <div className="flex items-center gap-2">
                               <span className="text-[9px] font-mono text-slate-400 uppercase">{s.songs.length} Tracks</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => exportSet(s)} className="p-2 text-slate-400 hover:text-fuchsia-500 transition-colors"><Share2 size={14}/></button>
                          <button onClick={() => { setSetDraft(s); setView('setBuilder'); }} className="p-2 text-slate-400 hover:text-indigo-500 transition-colors"><Edit3 size={14}/></button>
                          <button onClick={() => startGame(s, 2)} className="px-4 py-2 bg-indigo-600 rounded-lg font-bold text-[10px] text-white shadow-md hover:bg-indigo-500 transition-all uppercase tracking-wide">Play</button>
                        </div>
                      </div>
                    ))}
                  </div>
               )}
            </div>
          </div>
        )}

        {/* GAME VIEW - STUDIO TV OVERLAY LAYOUT */}
        {view === 'game' && gameState && (
          <div className="flex flex-col h-full animate-in fade-in w-full relative bg-black/40">
            {/* Absolute Quit Button */}
            <button onClick={() => { if(confirm("End game?")) { setGameState(null); setView('home'); }}} className="absolute top-4 left-4 z-50 p-3 bg-black/40 rounded-full text-slate-400 hover:text-white hover:bg-rose-500 transition-all">
               <X size={20} />
            </button>

            {/* Top Overlay: Scores */}
            <div className="absolute top-0 inset-x-0 p-4 z-40 flex flex-col items-center pointer-events-none">
              <div className="pointer-events-auto mb-2">
                 <Scoreboard teams={gameState.teams} currentTurnIndex={gameState.currentTurnTeamIndex} />
              </div>
              <div className="bg-black/40 backdrop-blur-md px-4 py-1 rounded-full border border-white/5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                    On Air • Track {gameState.currentSongIndex + 1}/{activeSet?.songs.length}
                  </span>
              </div>
            </div>

            {/* Center Stage: The Vinyl Player */}
            <div className="flex-grow flex items-center justify-center relative z-10 scale-110 md:scale-125 pb-20">
              {/* Fake Audio Visualizers jumping in background */}
              {isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-30 pointer-events-none scale-y-[2]">
                   {[...Array(24)].map((_, i) => (
                      <div key={i} className="w-1.5 md:w-3 bg-gradient-to-t from-indigo-500 to-fuchsia-500 rounded-full audio-bar" style={{ animationDuration: `${Math.random() * 500 + 300}ms` }}></div>
                   ))}
                </div>
              )}

              <div className="relative group perspective-1000">
                {/* The Vinyl Disc */}
                <div className={`
                  w-[300px] h-[300px] md:w-[450px] md:h-[450px] rounded-full border-[8px] border-[#1a1a1a] bg-[#111] shadow-2xl flex items-center justify-center relative z-20 transition-all duration-700
                  ${isPlaying ? 'animate-spin-slow shadow-[0_0_80px_rgba(99,102,241,0.4)]' : 'shadow-2xl'}
                  vinyl-grooves
                `}>
                   {/* Reflection */}
                   <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent pointer-events-none"></div>
                   
                   {/* Center Label */}
                   <div className="w-1/3 h-1/3 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-full flex items-center justify-center border-4 border-[#222] shadow-inner relative">
                      <div className="w-3 h-3 bg-black rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 border border-slate-700"></div>
                      <Music size={40} className="text-white/40" />
                   </div>
                </div>

                {/* The Sleeve / Reveal Card - Expands from center */}
                <div className={`
                  absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] md:w-[480px] h-[320px] md:h-[480px] 
                  bg-white dark:bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center p-8 text-center border border-white/20 transition-all duration-500 ease-out
                  ${gameState.isRevealed 
                    ? 'scale-100 opacity-100 z-30' 
                    : 'scale-50 opacity-0 z-0 pointer-events-none'}
                `}>
                   {gameState.isRevealed && (
                     <>
                      <div className="p-4 bg-indigo-500/10 rounded-full mb-4 animate-bounce-small">
                        <Music2 size={64} className="text-indigo-500" />
                      </div>
                      <h2 className="text-2xl md:text-4xl font-brand text-slate-800 dark:text-white leading-tight mb-2">
                        {songs.find(s => s.id === (activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]].songId))?.title}
                      </h2>
                      <div className="h-1 w-20 bg-indigo-500 rounded-full mx-auto my-4"></div>
                      <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-400">Correct Answer</p>
                     </>
                   )}
                </div>
              </div>
            </div>

            {/* Bottom Floating Control Dock */}
            <div className="absolute bottom-8 left-0 right-0 z-40 flex justify-center">
              <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-full px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center gap-4 transition-all hover:scale-105 duration-300">
                  
                  {/* Playback Controls */}
                  <div className="flex gap-2 border-r border-white/10 pr-4">
                     {[
                         { label: 'Intro', color: 'text-emerald-400 bg-emerald-500/10', icon: Play, action: () => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.introStart || 0, cur.introEnd || 5); } },
                         { label: 'Main', color: 'text-indigo-400 bg-indigo-500/10', icon: Zap, action: () => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.clipStart, cur.clipEnd); } },
                         { label: 'Hint', color: 'text-amber-400 bg-amber-500/10', icon: Sparkles, action: () => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.hintStart, cur.hintEnd); } },
                         { label: 'Bonus', color: 'text-fuchsia-400 bg-fuchsia-500/10', icon: Star, action: () => { const cur = activeSet?.songs[gameState.shuffledIndices[gameState.currentSongIndex]]; if(cur) playRange(cur.songId, cur.bonusStart || 10, cur.bonusEnd || 15); } },
                     ].map((btn) => (
                       <button key={btn.label} onClick={btn.action} className={`p-3 rounded-full hover:bg-white/10 transition-colors relative group ${btn.color}`} title={btn.label}>
                          <btn.icon size={20} fill="currentColor" className="opacity-80 group-hover:opacity-100" />
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase bg-black text-white px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">{btn.label}</span>
                       </button>
                     ))}
                  </div>

                  {/* Game Flow Controls */}
                  <div className="flex gap-3 pl-1">
                      <button onClick={() => award(gameState.teams[gameState.currentTurnTeamIndex].id, 2)} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-brand text-sm shadow-lg flex items-center gap-2 transition-transform active:scale-95 uppercase tracking-wide">
                        <CheckCircle size={18} /> Correct
                      </button>
                      
                      {!gameState.isRevealed ? (
                        <>
                          <button onClick={() => setStealMode(true)} className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-brand text-sm shadow-lg transition-transform active:scale-95 uppercase tracking-wide">
                            Wrong
                          </button>
                          <button onClick={() => setGameState({...gameState, isRevealed: true})} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Reveal">
                             <FastForward size={24} />
                          </button>
                        </>
                      ) : (
                        <button onClick={nextSong} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-brand text-sm shadow-lg flex items-center gap-2 transition-transform active:scale-95 uppercase tracking-wide">
                           Next Track <SkipForward size={18} />
                        </button>
                      )}
                  </div>
              </div>
            </div>

            {/* Steal Mode Modal (Clean Overlay) */}
            {stealMode && !scoredThisSong && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center animate-in fade-in">
                    <div className="text-center">
                      <h4 className="text-5xl font-brand text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-orange-500 uppercase mb-8 drop-shadow-lg animate-pulse">Steal Chance!</h4>
                      <div className="flex gap-6 justify-center items-center">
                          {gameState.teams.map((t, i) => i !== gameState.currentTurnTeamIndex ? (
                            <button key={t.id} onClick={() => award(t.id, 1)} className="px-10 py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-brand text-2xl shadow-2xl hover:scale-110 transition-all border-4 border-indigo-400/30">
                              {t.name} +1
                            </button>
                          ) : null)}
                          <button onClick={() => setStealMode(false)} className="px-8 py-4 text-slate-400 font-bold uppercase text-xs tracking-[0.2em] hover:text-white transition-colors">Cancel</button>
                      </div>
                    </div>
                </div>
            )}
          </div>
        )}

        {/* ... (Rest of the views) ... */}

        {view === 'library' && (
          <div className="max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-8 duration-500">
             {/* ... Library content ... */}
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
              {/* ... Set Builder Content ... */}
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

                 <div className="space-y-8 h-full">
                    {editingSongId && editingSongConfig ? (
                       <div className="sticky top-24 animate-in slide-in-from-right-8 fade-in duration-300 z-20">
                           <div className="p-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[2.5rem] border-2 border-indigo-500 shadow-2xl space-y-6 relative overflow-hidden">
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
           {/* ... Modal Content ... */}
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
           {/* ... Import Progress ... */}
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
           {/* ... Install Modal ... */}
           <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-[4rem] border border-slate-200 dark:border-white/10 p-16 shadow-3xl space-y-10 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-indigo-500"></div>
            <div className="p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-full w-fit mx-auto animate-pulse">
              <Download size={64} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-brand text-slate-900 dark:text-white uppercase">Install App</h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg max-w-md mx-auto leading-relaxed">MelodyMatch is a <strong>Progressive Web App (PWA)</strong>. It installs directly from your browser—no app store required.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/10 flex flex-col items-center gap-4">
                <div className="flex gap-3 text-slate-400"><Monitor size={24} /> <Smartphone size={24} /></div>
                <h3 className="font-bold text-slate-800 dark:text-white uppercase tracking-widest text-sm">Windows & Android</h3>
                {installError ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded-xl text-amber-600 dark:text-amber-400 text-xs font-bold leading-relaxed text-left flex items-start gap-3"><AlertCircle size={32} className="shrink-0" />{installError}</div>
                ) : (
                  <>
                    <button onClick={handleInstallClick} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase transition-colors shadow-lg text-xs tracking-widest flex items-center justify-center gap-2"><Download size={16} /> Install Now</button>
                    {!deferredPrompt && <p className="text-[10px] text-slate-400 text-center">If nothing happens, install directly from your browser's address bar.</p>}
                  </>
                )}
              </div>
              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[2rem] border border-slate-200 dark:border-white/10 flex flex-col items-center gap-4">
                <div className="flex gap-3 text-slate-400"><Tablet size={24} /></div>
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
