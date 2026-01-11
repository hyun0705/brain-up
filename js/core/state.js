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
  // 관리(training) 관련 상태
  trainingQueue: null,
  trainingQueueIndex: undefined,
  gonogoTraining: null,
  patternTraining: null,
  spatialTraining: null,
};

state.rng = mulberry32(state.seed);

export function resetState() {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  if (state.gonogoTimeout) clearTimeout(state.gonogoTimeout);
  state.gonogoTimeout = null;
  if (state.gonogoFixationTimeout) clearTimeout(state.gonogoFixationTimeout);
  state.gonogoFixationTimeout = null;
  
  // 키 핸들러 제거
  if (state.keyHandler) {
    window.removeEventListener("keydown", state.keyHandler);
    state.keyHandler = null;
  }
  
  // 모든 키 핸들러 강제 제거 (훈련 모듈에서 별도로 등록한 것들)
  // 새 핸들러를 추가하기 전 이전 것을 제거하도록 함
  
  state.sessionId = `s_${Date.now()}`;
  state.seed = genSeed();
  state.rng = mulberry32(state.seed);
  state.currentTest = null;
  state.phase = "home";
  state.difficulty = 2;
  state.trialIndex = 0;
  state.trials = [];
  state.current = null;
  state.trialStartMs = 0;
  state.practiceCorrect = 0;
  state.practiceTotal = 0;
  state.testStartMs = 0;
  state.testEndMs = 0;
  state.patternResult = null;
  state.gonogoResult = null;
  state.digitspanResult = null;
  state.spatialResult = null;
  state.digitSpan = { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] };
  state.spatialTrials = [];
  
  // 관리 관련 상태 초기화
  state.trainingQueue = null;
  state.trainingQueueIndex = undefined;
  state.trainingSpan = null;
  state.trainingTrials = [];
  state.trainingIndex = 0;
  state.trainingTotal = 0;
  state.trainingForwardCount = 0;
  state.trainingCorrect = 0;
  state.trainingOnComplete = null;
  state.spatialTraining = null;
  state.patternTraining = null;
  state.gonogoTraining = null;
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
