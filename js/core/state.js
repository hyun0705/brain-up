// core/state.js
import { getAnonId, LS_KEYS } from './storage.js';
import { genSeed, mulberry32 } from './utils.js';

export const state = {
  anonId: getAnonId(),
  sessionId: `s_${Date.now()}`,
  seed: genSeed(),
  rng: null,
  currentTest: null,
  phase: "intro",
  difficulty: 2,
  trialIndex: 0,
  current: null,
  trialStartMs: 0,
  practiceCorrect: 0,
  practiceTotal: 0,
  practiceTarget: 6,
  trials: [],
  testStartMs: 0,
  testEndMs: 0,
  timerHandle: null,
  keyHandler: null,
  gonogoTimeout: null,
  digitSpan: { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] },
  spatialTrials: [],
  patternResult: null,
  gonogoResult: null,
  digitspanResult: null,
  spatialResult: null,
};

state.rng = mulberry32(state.seed);

export function resetState() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  if (state.gonogoTimeout) clearTimeout(state.gonogoTimeout);
  
  state.sessionId = `s_${Date.now()}`;
  state.seed = genSeed();
  state.rng = mulberry32(state.seed);
  state.currentTest = null;
  state.phase = "intro";
  state.difficulty = 2;
  state.trialIndex = 0;
  state.trials = [];
  state.patternResult = null;
  state.gonogoResult = null;
  state.digitspanResult = null;
  state.spatialResult = null;
}

export function detachKeyHandler() {
  if (state.keyHandler) {
    window.removeEventListener("keydown", state.keyHandler);
    state.keyHandler = null;
  }
}
