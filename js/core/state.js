// core/state.js
import { getAnonId, LS_KEYS, saveSessionState, loadSessionState, clearSessionState } from './storage.js';
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

// 검사 진행 상태 저장
export function saveTestProgress() {
  // 검사 중일 때만 저장
  if (!state.currentTest || state.phase === "intro" || state.phase === "home") {
    return;
  }
  
  const sessionState = {
    sessionId: state.sessionId,
    seed: state.seed,
    currentTest: state.currentTest,
    phase: state.phase,
    difficulty: state.difficulty,
    trialIndex: state.trialIndex,
    trials: state.trials,
    practiceCorrect: state.practiceCorrect,
    practiceTotal: state.practiceTotal,
    practiceTarget: state.practiceTarget,
    digitSpan: state.digitSpan,
    spatialTrials: state.spatialTrials,
    patternResult: state.patternResult,
    gonogoResult: state.gonogoResult,
    digitspanResult: state.digitspanResult,
    spatialResult: state.spatialResult,
  };
  
  saveSessionState(sessionState);
}

// 검사 진행 상태 복원
export function restoreTestProgress() {
  const saved = loadSessionState();
  if (!saved) return null;
  
  state.sessionId = saved.sessionId;
  state.seed = saved.seed;
  state.rng = mulberry32(saved.seed);
  state.currentTest = saved.currentTest;
  state.phase = saved.phase;
  state.difficulty = saved.difficulty;
  state.trialIndex = saved.trialIndex;
  state.trials = saved.trials || [];
  state.practiceCorrect = saved.practiceCorrect || 0;
  state.practiceTotal = saved.practiceTotal || 0;
  state.practiceTarget = saved.practiceTarget || 6;
  state.digitSpan = saved.digitSpan || { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] };
  state.spatialTrials = saved.spatialTrials || [];
  state.patternResult = saved.patternResult;
  state.gonogoResult = saved.gonogoResult;
  state.digitspanResult = saved.digitspanResult;
  state.spatialResult = saved.spatialResult;
  
  return saved;
}

// 검사 완료 시 진행 상태 삭제
export function clearTestProgress() {
  clearSessionState();
}
