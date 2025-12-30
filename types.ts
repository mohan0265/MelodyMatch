
export interface Song {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  filename: string;
  fileSize: number;
  fingerprint: string;
  addedAt: number;
  hasLocalAudio: boolean;
  storageUri?: string;
  category?: string; // For grouping songs into collections
}

export interface GameSetSong {
  songId: string;
  
  // Clue 2 (Main/Clip)
  clipStart: number;
  clipEnd: number;
  clipPoints?: number;

  // Clue 3 (Hint)
  hintStart: number;
  hintEnd: number;
  hintPoints?: number;

  // Clue 1 (Intro)
  introStart?: number;
  introEnd?: number;
  introPoints?: number;

  // Clue 4 (Bonus/Vocal)
  bonusStart?: number;
  bonusEnd?: number;
  bonusPoints?: number;
  
  orderIndex: number;
  isConfigured?: boolean; // Tracks if the user has saved custom regions
  
  // Automation Metadata
  isAutoMarked?: boolean;
  isManuallyEdited?: boolean;
}

export interface GameSet {
  id: string;
  name: string;
  description: string;
  songs: GameSetSong[];
  createdAt: number;
  isDraft?: boolean;
}

export interface Team {
  id: string;
  name: string;
  score: number;
}

export interface GameState {
  id: string;
  setId: string;
  teams: Team[];
  currentSongIndex: number;
  currentTurnTeamIndex: number;
  isRevealed: boolean;
  stealAttempted: boolean;
  isFinished: boolean;
  shuffledIndices: number[];
}

export interface GameResult {
  id: string;
  dateTime: number;
  setId?: string; // Optional for backward compatibility, but used for Replay
  setName: string;
  teams: Team[];
}

export enum Platform {
  Web = 'web',
  Electron = 'electron',
  Android = 'android'
}
