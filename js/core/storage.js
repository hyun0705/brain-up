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
  guestTrainingDone: "bc_guest_training_done_v1",
  guestTestDone: "bc_guest_test_done_v1",
  serverStatus: "bc_server_status_v1",
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

// ========== 서버 동기화 상태 (로그인 사용자) ==========

// SERVER_STATUS_KEY는 LS_KEYS.serverStatus 사용

// 서버 동기화 상태 저장
export function saveServerStatus(status) {
  const today = getDateKey();
  localStorage.setItem(LS_KEYS.serverStatus, JSON.stringify({
    ...status,
    dateKey: today,
    savedAt: Date.now()
  }));
}

// 서버 동기화 상태 가져오기
export function getServerStatus() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEYS.serverStatus) || "null");
    if (!saved) return null;
    
    // 오늘 날짜가 아니면 무효 (매일 새로 확인 필요)
    const today = getDateKey();
    if (saved.dateKey !== today) {
      return null;
    }
    
    return saved;
  } catch {
    return null;
  }
}

// 서버 상태 삭제 (로그아웃 시)
export function clearServerStatus() {
  localStorage.removeItem(LS_KEYS.serverStatus);
}

// 오늘 관리 완료로 마킹 (관리 완료 시 호출)
export function markTrainedTodayLocal() {
  const current = getServerStatus() || {};
  saveServerStatus({
    ...current,
    trainedToday: true
  });
}

// 이번 주 검사 완료로 마킹 (검사 완료 시 호출)
export function markTestedThisWeekLocal() {
  const current = getServerStatus() || {};
  saveServerStatus({
    ...current,
    testedThisWeek: true
  });
}

// 오늘 관리 완료 여부 (로컬 + 서버 상태 확인)
export function hasTrainedToday() {
  // 1. 로컬 히스토리 확인
  const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
  const today = getDateKey();
  const localDone = history.some(entry => entry.date_key === today);
  if (localDone) return true;
  
  // 2. 서버 동기화 상태 확인 (로그인 사용자)
  const serverStatus = getServerStatus();
  if (serverStatus && serverStatus.trainedToday) return true;
  
  return false;
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
  
  // 일요일 시작 (일~토)
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return { sunday, saturday };
}

// 이번 주에 검사했는지 여부 (로컬 + 서버 상태 확인)
export function hasTestedThisWeek() {
  // 1. 로컬 히스토리 확인
  const history = loadHistory(LS_KEYS.patternHistory);
  if (history.length > 0) {
    const { sunday, saturday } = getCurrentWeekRange();
    const localDone = history.some(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= sunday && entryDate <= saturday;
    });
    if (localDone) return true;
  }
  
  // 2. 서버 동기화 상태 확인 (로그인 사용자)
  const serverStatus = getServerStatus();
  if (serverStatus && serverStatus.testedThisWeek) return true;
  
  return false;
}

// 이번 주 검사 기록 가져오기
export function getThisWeekTestResults() {
  const { sunday, saturday } = getCurrentWeekRange();
  
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  const filterThisWeek = (history) => {
    return history.filter(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= sunday && entryDate <= saturday;
    });
  };
  
  return {
    pattern: filterThisWeek(patternHist),
    gonogo: filterThisWeek(gonogoHist),
    digitspan: filterThisWeek(digitspanHist),
    spatial: filterThisWeek(spatialHist)
  };
}

// ========== 무료체험 및 구독 관련 ==========

const TRIAL_DAYS = 14;
const SUBSCRIPTION_KEY = "bc_subscription_v1";

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

// 구독 상태 로컬 저장 (캐시)
export function saveSubscriptionCache(subscription) {
  localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify({
    ...subscription,
    cachedAt: Date.now()
  }));
}

// 구독 상태 캐시 가져오기
export function getSubscriptionCache() {
  try {
    return JSON.parse(localStorage.getItem(SUBSCRIPTION_KEY) || "null");
  } catch {
    return null;
  }
}

// 구독 상태 삭제 (로그아웃 시)
export function clearSubscription() {
  localStorage.removeItem(SUBSCRIPTION_KEY);
}

// 구독 여부 (캐시 확인 - 동기)
export function isSubscribedSync() {
  const sub = getSubscriptionCache();
  if (!sub || !sub.expiresAt) return false;
  return new Date(sub.expiresAt) > new Date();
}

// 프리미엄 기능 접근 가능 여부 (동기 - 캐시 기반)
export function canAccessPremium() {
  return !isTrialExpired() || isSubscribedSync();
}

// 서버에서 구독 상태 확인 및 캐시 업데이트 (비동기)
export async function refreshSubscription() {
  try {
    const token = localStorage.getItem('brainup_token');
    if (!token) {
      clearSubscription();
      return null;
    }
    
    const response = await fetch('https://brainup-api.stardog0705.workers.dev/api/subscription', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.subscribed && data.subscription) {
      saveSubscriptionCache(data.subscription);
      return data.subscription;
    } else {
      clearSubscription();
      return null;
    }
  } catch (e) {
    console.error('구독 상태 확인 실패:', e);
    return null;
  }
}

// ========== 검사 진행 상태 저장/복원 ==========

const SESSION_STATE_KEY = "bc_session_state_v1";

// 진행 중인 검사 상태 저장
export function saveSessionState(sessionState) {
  localStorage.setItem(SESSION_STATE_KEY, JSON.stringify({
    ...sessionState,
    savedAt: Date.now()
  }));
}

// 진행 중인 검사 상태 복원
export function loadSessionState() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STATE_KEY) || "null");
    if (!saved) return null;
    return saved;
  } catch {
    return null;
  }
}

// 진행 상태 삭제
export function clearSessionState() {
  localStorage.removeItem(SESSION_STATE_KEY);
}

// ========== 비로그인 1회 체험 ==========

// 비로그인 검사 1회 완료 여부
export function hasGuestTestedOnce() {
  return localStorage.getItem(LS_KEYS.guestTestDone) === "true";
}

// 비로그인 검사 완료 기록
export function markGuestTestDone() {
  localStorage.setItem(LS_KEYS.guestTestDone, "true");
}

// 비로그인 관리 1회 완료 여부
export function hasGuestTrainedOnce() {
  return localStorage.getItem(LS_KEYS.guestTrainingDone) === "true";
}

// 비로그인 관리 완료 기록
export function markGuestTrainingDone() {
  localStorage.setItem(LS_KEYS.guestTrainingDone, "true");
}
