import React from 'react';
import { Team } from '../types';
import { Trophy } from 'lucide-react';

interface ScoreboardProps {
  teams: Team[];
  currentTurnIndex: number;
}

const Scoreboard: React.FC<ScoreboardProps> = ({ teams, currentTurnIndex }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {teams.map((team, idx) => {
        const isTurn = idx === currentTurnIndex;
        return (
          <div 
            key={team.id}
            className={`relative p-8 rounded-[2.5rem] border-2 transition-all duration-300 shadow-md ${
              isTurn 
              ? 'bg-white dark:bg-indigo-900/40 border-indigo-500 dark:border-indigo-500 shadow-[0_10px_30px_rgba(99,102,241,0.2)] dark:shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-105 z-10' 
              : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-60'
            }`}
          >
            {isTurn && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-[10px] text-white font-black uppercase px-4 py-1.5 rounded-full tracking-widest animate-bounce shadow-lg">
                Current Turn
              </div>
            )}
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-xl font-brand tracking-wider text-slate-500 dark:text-slate-300 truncate w-full text-center uppercase">
                {team.name}
              </h3>
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${isTurn ? 'bg-indigo-50 dark:bg-indigo-500/20' : 'bg-slate-50 dark:bg-slate-950'}`}>
                  <Trophy size={28} className={isTurn ? "text-amber-500" : "text-slate-300 dark:text-slate-700"} />
                </div>
                <span className="text-6xl font-brand text-slate-900 dark:text-white leading-none">{team.score}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Scoreboard;