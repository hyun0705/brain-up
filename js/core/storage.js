// core/storage.js
export const LS_KEYS = {
  anonId: "bc_anon_id_v1",
  userProfile: "bc_user_profile_v1",
  trialStartDate: "bc_trial_start_v1",
  patternHistory: "bc_pattern_history_v1",
  patternBaseline: "bc_pattern_baseline_v1",
  gonogoHistory: "bc_gonogo_history_v1",
  gonogoBaseline: "bc_gonogo_baseline_v1",
  digitspanHistory: "bc_digitspan_history_v1",
  digitspanBaseline: "bc_digitspan_baseline_v1",
  digitspanTrainingHistory: "bc_digitspan_training_history_v1",
  spatialHistory: "bc_spatial_history_v1",
  spatialBaseline: "bc_spatial_baseline_v1",
};

export function getAnonId() {
  let id = localStorage.getItem(LS_KEYS.anonId);
  if (!id) {
    id = `anon_${crypto?.randomUUID?.() ?? `${Date.now()}_${Math.floor(Math.random() * 1e6)}`}`;
    localStorage.setItem(LS_KEYS.anonId, id);
  }
  return id;
}

export function getUserProfile() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.userProfile) || "null");
  } catch {
    return null;
  }
}

export function saveUserProfile(profile) {
  localStorage.setItem(LS_KEYS.userProfile, JSON.stringify(profile));
}

export function loadHistory(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function saveHistory(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

export function loadBaseline(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function saveBaseline(key, b) {
  localStorage.setItem(key, JSON.stringify(b));
}

export function tryUpdateBaseline(history, baselineKey) {
  const baseline = loadBaseline(baselineKey);
  if (baseline) return baseline;
  if (history.length >= 3) {
    const first3 = history.slice(0, 3).map(x => x.summary.raw);
    const mean = first3.reduce((a, b) => a + b, 0) / first3.length;
    const sd = Math.sqrt(first3.reduce((a, b) => a + (b - mean) * (b - mean), 0) / first3.length);
    const b = { mean: Number(mean.toFixed(3)), sd: Number(sd.toFixed(3)), n: 3 };
    saveBaseline(baselineKey, b);
    return b;
  }
  return null;
}

// ========== 날짜 관련 공통 함수 ==========

// 날짜를 YYYY-MM-DD 형식의 키로 변환
export function getDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 오늘 관리 완료 여부
export function hasTrainedToday() {
  const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
  const today = getDateKey();
  return history.some(entry => entry.date_key === today);
}

// 연속 관리 일수
export function getStreak() {
  const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
  if (history.length === 0) return 0;
  
  const uniqueDates = [...new Set(history.map(e => e.date_key))].sort().reverse();
  
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < uniqueDates.length; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const checkKey = getDateKey(checkDate);
    
    if (uniqueDates.includes(checkKey)) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

// 이번 주 범위 가져오기 (월요일 ~ 일요일)
export function getCurrentWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=일, 1=월, ..., 6=토
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
}

// 이번 주에 검사했는지 여부
export function hasTestedThisWeek() {
  const history = loadHistory(LS_KEYS.patternHistory);
  if (history.length === 0) return false;
  
  const { monday, sunday } = getCurrentWeekRange();
  
  return history.some(entry => {
    const entryDate = new Date(entry.ended_at);
    return entryDate >= monday && entryDate <= sunday;
  });
}

// 이번 주 검사 기록 가져오기
export function getThisWeekTestResults() {
  const { monday, sunday } = getCurrentWeekRange();
  
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  const filterThisWeek = (history) => {
    return history.filter(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= monday && entryDate <= sunday;
    });
  };
  
  return {
    pattern: filterThisWeek(patternHist),
    gonogo: filterThisWeek(gonogoHist),
    digitspan: filterThisWeek(digitspanHist),
    spatial: filterThisWeek(spatialHist)
  };
}

// ========== 무료체험 관련 ==========

const TRIAL_DAYS = 14;

// 체험 시작일 가져오기 (없으면 오늘로 설정)
export function getTrialStartDate() {
  let startDate = localStorage.getItem(LS_KEYS.trialStartDate);
  if (!startDate) {
    startDate = getDateKey();
    localStorage.setItem(LS_KEYS.trialStartDate, startDate);
  }
  return startDate;
}

// 체험 남은 일수
export function getTrialDaysLeft() {
  const startDate = getTrialStartDate();
  const start = new Date(startDate);
  const today = new Date(getDateKey());
  const daysPassed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysPassed);
}

// 체험 만료 여부
export function isTrialExpired() {
  return getTrialDaysLeft() <= 0;
}

// 구독 상태 (나중에 실제 결제 연동 시 수정)
export function isSubscribed() {
  // TODO: 실제 결제 연동 시 구현
  return false;
}

// 프리미엄 기능 접근 가능 여부
export function canAccessPremium() {
  return !isTrialExpired() || isSubscribed();
}
