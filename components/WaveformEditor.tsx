
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Save, Info, Check, CheckCircle2, MousePointerClick, Trophy } from 'lucide-react';

interface RegionData {
  start: number;
  end: number;
  points: number;
}

interface WaveformEditorProps {
  url: string;
  
  // Clue 2
  clipStart: number;
  clipEnd: number;
  clipPoints?: number;
  
  // Clue 3
  hintStart: number;
  hintEnd: number;
  hintPoints?: number;
  
  // Clue 1
  introStart?: number;
  introEnd?: number;
  introPoints?: number;
  
  // Clue 4
  bonusStart?: number;
  bonusEnd?: number;
  bonusPoints?: number;

  onSave: (
    clip: RegionData, 
    hint: RegionData,
    intro: RegionData,
    bonus: RegionData
  ) => void;
  maxDuration?: number;
}

type RegionType = 'intro' | 'main' | 'hint' | 'bonus';

const REGION_CONFIG = {
  intro: { label: 'Clue 1', color: 'rgba(16, 185, 129, 0.5)', colorDim: 'rgba(16, 185, 129, 0.1)' }, // Green
  main:  { label: 'Clue 2', color: 'rgba(79, 70, 229, 0.6)', colorDim: 'rgba(79, 70, 229, 0.1)' }, // Indigo
  hint:  { label: 'Clue 3', color: 'rgba(245, 158, 11, 0.6)', colorDim: 'rgba(245, 158, 11, 0.1)' }, // Amber
  bonus: { label: 'Clue 4', color: 'rgba(244, 63, 94, 0.5)', colorDim: 'rgba(244, 63, 94, 0.1)' }  // Rose
};

const WaveformEditor: React.FC<WaveformEditorProps> = ({ 
  url, 
  clipStart, clipEnd, clipPoints = 3,
  hintStart, hintEnd, hintPoints = 2,
  introStart = 0, introEnd = 5, introPoints = 4,
  bonusStart = 10, bonusEnd = 15, bonusPoints = 1,
  onSave, 
  maxDuration = 30 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const regionsPluginRef = useRef<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeRegion, setActiveRegion] = useState<RegionType>('intro');

  // Keep track of regions values and points in state
  const [regionsState, setRegionsState] = useState({
    intro: { start: introStart, end: introEnd || 5, points: introPoints },
    main:  { start: clipStart, end: clipEnd, points: clipPoints },
    hint:  { start: hintStart, end: hintEnd, points: hintPoints },
    bonus: { start: bonusStart, end: bonusEnd, points: bonusPoints },
  });

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const win = window as any;
    if (!win.WaveSurfer) return;

    const isDark = document.documentElement.classList.contains('dark');

    const wavesurfer = win.WaveSurfer.create({
      container: containerRef.current,
      waveColor: isDark ? '#334155' : '#cbd5e1',
      progressColor: '#64748b',
      cursorColor: isDark ? '#f8fafc' : '#020617',
      barWidth: 2,
      height: 180,
      plugins: []
    });

    const RegionsPlugin = win.WaveSurfer.Regions;
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    
    // Store refs
    wavesurferRef.current = wavesurfer;
    regionsPluginRef.current = regions;

    wavesurfer.load(url);

    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      
      const createReg = (id: RegionType, start: number, end: number) => {
        const s = Math.max(0, start);
        let e = end === 0 ? s + 5 : end;
        if (e > duration) e = duration;
        
        regions.addRegion({
          id,
          start: s,
          end: e,
          color: REGION_CONFIG[id].color,
          drag: true,
          resize: true,
          content: REGION_CONFIG[id].label,
        });
      };

      createReg('intro', introStart, introEnd || 5);
      createReg('main', clipStart, clipEnd);
      createReg('hint', hintStart, hintEnd);
      createReg('bonus', bonusStart, bonusEnd);

      // Sync state on region update
      regions.on('region-updated', (region: any) => {
        let s = region.start;
        let e = region.end;
        
        // Enforce max duration constraint
        if (e - s > maxDuration) {
          e = s + maxDuration;
          region.setOptions({ end: e });
        }

        setRegionsState(prev => ({
          ...prev,
          [region.id]: { ...prev[region.id as RegionType], start: s, end: e }
        }));
      });
      
      // Apply initial focus immediately after creation
      applyFocus('intro');
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));

    return () => wavesurfer.destroy();
  }, [url]);

  // Handle Focus Switching
  useEffect(() => {
    applyFocus(activeRegion);
  }, [activeRegion]);

  const applyFocus = (focusId: RegionType) => {
    const plugin = regionsPluginRef.current;
    if (!plugin) return;

    const allRegions = plugin.getRegions();
    
    allRegions.forEach((region: any) => {
      const isActive = region.id === focusId;
      const config = REGION_CONFIG[region.id as RegionType];

      if (config) {
        region.setOptions({
          drag: isActive,
          resize: isActive,
          color: isActive ? config.color : config.colorDim
        });

        // Use standard DOM manipulation to adjust Z-Index for "Bring to Front" behavior
        if (region.element) {
            region.element.style.zIndex = isActive ? '50' : '10';
            
            // Adjust label opacity
            const label = region.element.querySelector('[part="region-content"]');
            if (label) {
                label.style.opacity = isActive ? '1' : '0.5';
                label.style.fontWeight = isActive ? 'bold' : 'normal';
            }
        }
      }
    });
  };

  const preview = () => {
    if (!wavesurferRef.current) return;
    const reg = regionsState[activeRegion];
    wavesurferRef.current.play(reg.start, reg.end);
  };

  const setPoints = (pts: number) => {
    setRegionsState(prev => ({
      ...prev,
      [activeRegion]: { ...prev[activeRegion], points: pts }
    }));
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-xl transition-colors">
      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
           <MousePointerClick className="text-indigo-600 dark:text-indigo-400" size={20} />
           <span className="font-brand text-slate-600 dark:text-slate-300 uppercase text-xs tracking-widest">Select clue to edit</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest">
          <Info size={14} /> Drag to move • Max {maxDuration}s
        </div>
      </div>

      <div className="p-6 relative">
        <div ref={containerRef} className="rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-black/20" />
      </div>
      
      <div className="p-6 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-6 border-t border-slate-100 dark:border-slate-800">
        
        {/* Editor Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['intro', 'main', 'hint', 'bonus'] as RegionType[]).map((type) => (
             <RegionToggle 
               key={type}
               type={type} 
               isActive={activeRegion === type} 
               onClick={() => setActiveRegion(type)} 
               range={regionsState[type]}
             />
          ))}
        </div>

        {/* Score Selector for Active Region */}
        <div className="flex items-center justify-center gap-4 bg-white/50 dark:bg-white/5 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
             <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Score Value for {REGION_CONFIG[activeRegion].label}:</span>
             <div className="flex gap-2">
                {[4, 3, 2, 1].map(pts => (
                   <button 
                     key={pts}
                     onClick={() => setPoints(pts)}
                     className={`w-10 h-10 rounded-full font-brand text-lg flex items-center justify-center transition-all ${regionsState[activeRegion].points === pts ? 'bg-fuchsia-600 text-white scale-110 shadow-lg' : 'bg-slate-200 dark:bg-white/10 text-slate-400 hover:bg-slate-300 dark:hover:bg-white/20'}`}
                   >
                     {pts}
                   </button>
                ))}
             </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-700/50">
           <div className="flex items-center gap-2">
             <button onClick={() => wavesurferRef.current?.playPause()} className="p-4 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-2xl transition-colors text-slate-700 dark:text-white shadow-sm" title="Play Full Song">
               {isPlaying ? <Pause size={24} /> : <Play size={24} />}
             </button>
             <button onClick={preview} className="px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 uppercase text-xs tracking-widest">
                <RotateCcw size={16} /> Preview {REGION_CONFIG[activeRegion].label}
             </button>
           </div>
           
           <button 
             onClick={() => onSave(regionsState.main, regionsState.hint, regionsState.intro, regionsState.bonus)} 
             className="w-full md:w-auto px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-md font-brand tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-xl uppercase"
           >
             <Save size={20} /> Save Changes
           </button>
        </div>
      </div>
    </div>
  );
};

const RegionToggle = ({ type, isActive, onClick, range }: { type: RegionType, isActive: boolean, onClick: () => void, range: RegionData }) => {
  const conf = REGION_CONFIG[type];
  
  // Dynamic classes for colors
  const activeClasses = {
    intro: 'bg-emerald-600 border-emerald-400 ring-4 ring-emerald-500/20 text-white',
    main: 'bg-indigo-600 border-indigo-400 ring-4 ring-indigo-500/20 text-white',
    hint: 'bg-amber-600 border-amber-400 ring-4 ring-amber-500/20 text-white',
    bonus: 'bg-rose-600 border-rose-400 ring-4 ring-rose-500/20 text-white'
  };

  const inactiveClasses = 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700';

  return (
    <button 
      onClick={onClick}
      className={`relative px-4 py-4 rounded-2xl border transition-all duration-200 flex flex-col items-center gap-1 shadow-sm ${isActive ? activeClasses[type] : inactiveClasses} ${isActive ? 'scale-105 z-10' : 'hover:-translate-y-1'}`}
    >
      {isActive && <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm text-slate-900 dark:text-white tracking-widest border border-slate-100 dark:border-slate-700">Editing</div>}
      <div className="flex items-center gap-2">
         <span className="font-brand text-lg uppercase leading-none">{conf.label}</span>
         <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>{range.points} pts</span>
      </div>
      <span className={`font-mono text-[10px] ${isActive ? 'opacity-80' : 'opacity-40'}`}>
        {range.start.toFixed(1)}s - {range.end.toFixed(1)}s
      </span>
    </button>
  );
};

export default WaveformEditor;
