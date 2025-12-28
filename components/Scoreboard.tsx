
import React from 'react';
import { Team } from '../types';
import { Trophy, Mic2 } from 'lucide-react';

interface ScoreboardProps {
  teams: Team[];
  currentTurnIndex: number;
}

const Scoreboard: React.FC<ScoreboardProps> = ({ teams, currentTurnIndex }) => {
  return (
    <div className="flex justify-center items-center gap-3 w-full overflow-x-auto no-scrollbar py-2">
      {teams.map((team, idx) => {
        const isTurn = idx === currentTurnIndex;
        return (
          <div 
            key={team.id}
            className={`
              relative flex items-center gap-3 px-4 py-2 rounded-full border transition-all duration-500
              ${isTurn 
                ? 'bg-indigo-600/90 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)] z-10 scale-105' 
                : 'bg-black/40 border-white/10 text-slate-400 scale-95'
              }
            `}
          >
            {/* Turn Indicator Dot */}
            {isTurn && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-400"></span>
              </span>
            )}

            <div className={`flex items-center justify-center w-6 h-6 rounded-full ${isTurn ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-500'}`}>
              {isTurn ? <Mic2 size={12} className="animate-pulse" /> : <Trophy size={12} />}
            </div>
            
            <div className="flex flex-col leading-none pr-1">
              <span className={`text-[9px] font-black uppercase tracking-wider mb-0.5 ${isTurn ? 'text-indigo-100' : 'text-slate-500'}`}>
                {team.name}
              </span>
              <span className={`text-xl font-brand ${isTurn ? 'text-white' : 'text-slate-400'}`}>
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
