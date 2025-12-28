
import React from 'react';
import { Team } from '../types';
import { Trophy, Mic2 } from 'lucide-react';

interface ScoreboardProps {
  teams: Team[];
  currentTurnIndex: number;
}

const Scoreboard: React.FC<ScoreboardProps> = ({ teams, currentTurnIndex }) => {
  return (
    <div className="flex justify-center items-center gap-4 w-full px-4 overflow-x-auto custom-scrollbar pb-2">
      {teams.map((team, idx) => {
        const isTurn = idx === currentTurnIndex;
        return (
          <div 
            key={team.id}
            className={`
              relative flex items-center gap-4 px-6 py-3 rounded-2xl border transition-all duration-500 min-w-[180px]
              ${isTurn 
                ? 'bg-indigo-900/80 border-indigo-400/50 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-105 z-10' 
                : 'bg-white/10 border-white/5 opacity-70 scale-95'
              }
            `}
          >
            {/* Active Indicator Dot */}
            {isTurn && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
              </span>
            )}

            <div className={`p-2 rounded-xl ${isTurn ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400'}`}>
              {isTurn ? <Mic2 size={18} className="animate-pulse" /> : <Trophy size={18} />}
            </div>
            
            <div className="flex flex-col">
              <span className={`text-[10px] font-black uppercase tracking-wider ${isTurn ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                {team.name}
              </span>
              <span className={`text-2xl font-brand leading-none ${isTurn ? 'text-white' : 'text-slate-300'}`}>
                {team.score}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Scoreboard;
