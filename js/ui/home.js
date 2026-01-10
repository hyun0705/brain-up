// ui/home.js
import { $ } from '../core/utils.js';
import { state, resetState, restoreTestProgress, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, getUserProfile, getTrialDaysLeft, canAccessPremium, hasTestedThisWeek, loadSessionState, hasGuestTestedOnce, hasGuestTrainedOnce, refreshSubscription, isSubscribedSync } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { startDigitSpanTraining, hasTrainedToday, getStreak } from '../training/digitspan-training.js';
import { renderTrainingSelect } from './training-select.js';
// renderHistory는 순환참조 방지를 위해 동적 import 사용
let renderHistory = null;
async function getHistoryRenderer() {
  if (!renderHistory) {
    const module = await import('./history.js');
    renderHistory = module.renderHistory;
  }
  return renderHistory;
}
import { renderCalendar, renderUpgradePrompt } from './calendar.js';
import { renderSettings } from './settings.js';
import { renderWeeklyReport } from './report.js';
import { renderLogin, checkLoginForFeature } from './auth.js';
import { isLoggedIn, getUserName, getNotices, getResults } from '../core/api.js';

const app = $("#app");

// 순환참조 방지를 위해 동적 import
let startPatternTest = null;
let startGoNoGoTest = null;
let startDigitSpanTest = null;
let startSpatialTest = null;

async function loadTestModules() {
  if (!startPatternTest) {
    const pattern = await import('../tests/pattern.js');
    startPatternTest = pattern.startPatternTest;
  }
  if (!startGoNoGoTest) {
    const gonogo = await import('../tests/gonogo.js');
    startGoNoGoTest = gonogo.startGoNoGoTest;
  }
  if (!startDigitSpanTest) {
    const digitspan = await import('../tests/digitspan.js');
    startDigitSpanTest = digitspan.startDigitSpanTest;
  }
  if (!startSpatialTest) {
    const spatial = await import('../tests/spatial.js');
    startSpatialTest = spatial.startSpatialTest;
  }
}

// 처음 사용자 안내 문구
function getFirstTimeGuide() {
  const loggedIn = isLoggedIn();
  const guideKey = loggedIn ? 'brainup_guide_shown_logged' : 'brainup_guide_shown_guest';
  const guideShown = localStorage.getItem(guideKey) === 'true';
  
  // 이미 본 사용자는 안 보여줌
  if (guideShown) {
    return '';
  }
  
  // 가이드 본 것으로 표시
  localStorage.setItem(guideKey, 'true');
  
  return `
    <div class="firstTimeGuide">
      <div class="guideIcon"><i class="fa-solid fa-lightbulb"></i></div>
      <div class="guideContent">
        <div class="guideTitle">처음이시네요! 환영합니다 👋</div>
        <div class="guideText">
          매주 1회 <b>검사</b>로 내 두뇌 상태를 확인하고<br/>
          매일 <b>3분 관리</b>로 두뇌를 단련해보세요!
        </div>
      </div>
    </div>
  `;
}

// 가장 약한 영역 찾기
function getWeakestArea() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  if (digitspanHist.length === 0) return { area: 'digitspan', name: '작업기억', index: 50 };
  
  const getLatestScore = (hist) => {
    if (hist.length === 0) return 50;
    const last = hist[hist.length - 1];
    // raw가 정확도 % (0-100)
    return last.summary.raw;
  };
  
  const areas = [
    { area: 'pattern', name: '처리속도', index: getLatestScore(patternHist) },
    { area: 'gonogo', name: '주의·억제', index: getLatestScore(gonogoHist) },
    { area: 'digitspan', name: '작업기억', index: getLatestScore(digitspanHist) },
    { area: 'spatial', name: '위치기억', index: getLatestScore(spatialHist) },
  ];
  
  return areas.reduce((min, curr) => curr.index < min.index ? curr : min);
}

// 마지막 검사 날짜
function getLastTestDate() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  if (patternHist.length === 0) return null;
  return new Date(patternHist[patternHist.length - 1].ended_at);
}

// UTC를 한국 시간으로 변환 (서버 데이터용)
function toKoreaTime(dateStr) {
  if (!dateStr) return new Date();
  const utcDate = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// 이번 주 범위 (일~토)
function getCurrentWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return { sunday, saturday };
}

// 서버 데이터 기반 오늘 관리 완료 여부 확인 (캐시된 결과 사용)
function checkTrainedTodayFromCache(results) {
  // 오늘 날짜 (로컬 시간 기준)
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // 서버 기록 확인
  if (results && results.length > 0) {
    const serverDone = results
      .filter(r => r.test_type === 'training')
      .some(r => {
        const entryDate = toKoreaTime(r.date || r.created_at);
        const entryKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;
        return entryKey === todayKey;
      });
    if (serverDone) return true;
  }
  
  // 로컬 확인
  return hasTrainedToday();
}

// 서버 데이터 기반 이번 주 검사 완료 여부 (캐시된 결과 사용)
function checkWeeklyTestFromCache(results) {
  const { sunday, saturday } = getCurrentWeekRange();
  
  // 서버 기록 확인
  if (results && results.length > 0) {
    const serverDone = results
      .filter(r => r.test_type !== 'training')
      .some(r => {
        const entryDate = toKoreaTime(r.date || r.created_at);
        return entryDate >= sunday && entryDate <= saturday;
      });
    if (serverDone) return true;
  }
  
  // 로컬 확인
  return hasTestedThisWeek();
}

// 서버 데이터 기반 연속 기록(streak) 계산 (캐시된 결과 사용)
function getStreakFromCache(results) {
  // 날짜별로 유니크하게 추출 (한국 시간 기준)
  const uniqueDates = new Set();
  
  // 서버 기록
  if (results && results.length > 0) {
    results
      .filter(r => r.test_type === 'training')
      .forEach(r => {
        const entryDate = toKoreaTime(r.date || r.created_at);
        const dateKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}`;
        uniqueDates.add(dateKey);
      });
  }
  
  // 로컬 기록도 합산
  const localHistory = loadHistory(LS_KEYS.digitspanTrainingHistory);
  localHistory.forEach(entry => {
    if (entry.date_key) uniqueDates.add(entry.date_key);
  });
  
  if (uniqueDates.size === 0) return 0;
  
  // 오늘부터 거꾸로 연속 일수 계산 (로컬 시간 기준)
  const now = new Date();
  
  let streak = 0;
  for (let i = 0; i < 100; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() - i);
    const checkKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    
    if (uniqueDates.has(checkKey)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  
  return streak;
}

// 시간대별 인사말
function getGreeting() {
  const hour = new Date().getHours();
  const userName = getUserName();
  const namePrefix = userName ? `${userName}님, ` : '';
  
  if (hour >= 5 && hour < 12) return { text: `${namePrefix}좋은 아침이에요`, sub: '오늘도 두뇌 건강을 챙겨볼까요?' };
  if (hour >= 12 && hour < 17) return { text: `${namePrefix}좋은 오후예요`, sub: '잠깐 쉬면서 두뇌 관리 어떠세요?' };
  if (hour >= 17 && hour < 21) return { text: `${namePrefix}좋은 저녁이에요`, sub: '오늘 하루도 수고 많으셨어요' };
  return { text: `${namePrefix}편안한 밤 되세요`, sub: '내일 또 만나요' };
}

// 오늘 날짜 문자열
function getTodayDateStr() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[now.getDay()];
  return `${month}월 ${date}일 (${dayName})`;
}

// 연속 기록 멘트
function getStreakMessage(streak) {
  if (streak >= 30) return '대단해요! 한 달 넘게 꾸준히 하고 계시네요';
  if (streak >= 14) return '2주 연속! 정말 잘 하고 계세요';
  if (streak >= 7) return '일주일 연속 달성! 습관이 되어가고 있어요';
  if (streak >= 3) return '3일 연속! 좋은 습관이 만들어지고 있어요';
  if (streak >= 1) return '꾸준함이 가장 중요해요';
  return '';
}

// 관리 권유 멘트
function getTrainingEncouragement() {
  const messages = [
    '오늘 3분, 내 두뇌를 위한 시간이에요',
    '짧지만 꾸준한 관리가 차이를 만들어요',
    '가벼운 마음으로 시작해보세요',
    '매일 조금씩, 그게 비결이에요',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// 검사명 한글로 변환
function getTestName(testId) {
  const names = {
    pattern: '패턴 비교',
    gonogo: 'Go/No-Go',
    digitspan: '숫자 기억',
    spatial: '위치 기억'
  };
  return names[testId] || testId;
}

// 검사 이어하기
async function resumeTest(savedState) {
  await loadTestModules();
  restoreTestProgress();
  
  // 완료된 검사 다음 검사로 이동
  if (savedState.patternResult && !savedState.gonogoResult) {
    startGoNoGoTest();
  } else if (savedState.gonogoResult && !savedState.digitspanResult) {
    startDigitSpanTest();
  } else if (savedState.digitspanResult && !savedState.spatialResult) {
    startSpatialTest();
  } else if (!savedState.patternResult) {
    startPatternTest();
  } else {
    // 모든 검사 완료됨 - 홈으로
    clearTestProgress();
    renderHome();
  }
}

export async function renderHome() {
  state.currentTest = null;
  state.phase = "home";
  document.querySelector(".progress").textContent = "홈";
  
  const loggedIn = isLoggedIn();
  
  // 로컬 데이터로 먼저 빠르게 렌더링
  const streak = getStreak();
  const todayDone = hasTrainedToday();
  const weeklyTestDone = hasTestedThisWeek();
  const weakest = getWeakestArea();
  const lastTestDate = getLastTestDate();
  const greeting = getGreeting();
  const trialDaysLeft = getTrialDaysLeft();
  const hasPremium = canAccessPremium();
  let savedSession = loadSessionState();
  const guestTestedOnce = hasGuestTestedOnce();
  const guestTrainedOnce = hasGuestTrainedOnce();
  
  // 모든 검사가 완료된 세션이면 삭제
  if (savedSession && savedSession.patternResult && savedSession.gonogoResult && savedSession.digitspanResult && savedSession.spatialResult) {
    clearTestProgress();
    savedSession = null;
  }
  
  // 0/4인 경우도 삭제 (아직 시작 안 한 것)
  if (savedSession) {
    const completedCount = [savedSession.patternResult, savedSession.gonogoResult, savedSession.digitspanResult, savedSession.spatialResult].filter(Boolean).length;
    if (completedCount === 0) {
      clearTestProgress();
      savedSession = null;
    }
  }
  

  
  // 권한 체크: 기능 사용 가능 여부
  // 비로그인: 1회만 / 로그인+무료체험중: 무제한 / 로그인+체험끝: 차단
  const canTest = loggedIn ? hasPremium : !guestTestedOnce;
  const canTrain = loggedIn ? hasPremium : !guestTrainedOnce;
  
  // 오늘의 관리 섹션
  let todaySection = '';
  if (!canTrain && !loggedIn) {
    // 비로그인 + 1회 체험 완료
    todaySection = `
      <div class="todayStatus locked">
        <div class="todayStatusIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="todayStatusText">
          <div class="todayStatusTitle">1회 체험 완료</div>
          <div class="todayStatusDesc">로그인하면 계속 이용할 수 있어요</div>
        </div>
      </div>
      <button class="primaryBtn" id="goLoginForTraining">
        <i class="fa-solid fa-right-to-bracket"></i>
        로그인하고 계속하기
      </button>
    `;
  } else if (!canTrain && loggedIn) {
    // 로그인 + 무료체험 끝
    todaySection = `
      <div class="todayStatus locked">
        <div class="todayStatusIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="todayStatusText">
          <div class="todayStatusTitle">무료체험 종료 <span class="premiumBadge">PRO</span></div>
          <div class="todayStatusDesc">구독하면 계속 이용할 수 있어요</div>
        </div>
      </div>
      <button class="primaryBtn" id="goSubscribeForTraining">
        <i class="fa-solid fa-crown"></i>
        구독하고 계속하기
      </button>
    `;
  } else if (todayDone) {
    todaySection = `
      <div class="todayStatus done">
        <div class="todayStatusIcon"><i class="fa-solid fa-circle-check"></i></div>
        <div class="todayStatusText">
          <div class="todayStatusTitle">오늘 관리 완료 ✅</div>
          <div class="todayStatusDesc">잘 하셨어요! 내일 또 만나요</div>
        </div>
      </div>
    `;
  } else {
    todaySection = `
      <div class="todayStatus pending">
        <div class="todayStatusIcon"><i class="fa-solid fa-brain"></i></div>
        <div class="todayStatusText">
          <div class="todayStatusTitle">오늘 관리: 아직 안 함</div>
          <div class="todayStatusDesc">${getTrainingEncouragement()}</div>
        </div>
      </div>
      <button class="primaryBtn" id="startTraining">
        <i class="fa-solid fa-play"></i>
        3분 관리 시작${!loggedIn ? ' (1회 체험)' : ''}
      </button>
    `;
  }
  
  // 검사 섹션 (이번 주 기준)
  let testSection = '';
  
  if (!canTest && !loggedIn) {
    // 비로그인 + 1회 체험 완료
    testSection = `
      <div class="weeklyStatus locked">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">1회 체험 완료</div>
          <div class="weeklyStatusDesc">로그인하면 계속 이용할 수 있어요</div>
        </div>
      </div>
      <button class="primaryBtn" id="goLoginForTest">
        <i class="fa-solid fa-right-to-bracket"></i>
        로그인하고 계속하기
      </button>
    `;
  } else if (!canTest && loggedIn) {
    // 로그인 + 무료체험 끝
    testSection = `
      <div class="weeklyStatus locked">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">무료체험 종료 <span class="premiumBadge">PRO</span></div>
          <div class="weeklyStatusDesc">구독하면 계속 이용할 수 있어요</div>
        </div>
      </div>
      <button class="primaryBtn" id="goSubscribeForTest">
        <i class="fa-solid fa-crown"></i>
        구독하고 계속하기
      </button>
    `;
  } else if (savedSession && savedSession.currentTest) {
    // 진행 중인 검사가 있는 경우
    const completedCount = [savedSession.patternResult, savedSession.gonogoResult, savedSession.digitspanResult, savedSession.spatialResult].filter(Boolean).length;
    
    testSection = `
      <div class="weeklyStatus inprogress">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-pause-circle"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">검사 진행 중 (${completedCount}/4 완료)</div>
          <div class="weeklyStatusDesc">중단한 검사를 이어서 진행하세요</div>
        </div>
      </div>
      <button class="primaryBtn danger" id="resumeTest">
        <i class="fa-solid fa-play"></i>
        이어하기
      </button>
    `;
  } else if (weeklyTestDone) {
    // 비로그인이면 로그인 필요, 로그인이면 프리미엄 체크
    if (!loggedIn) {
      testSection = `
        <div class="weeklyStatus done">
          <div class="weeklyStatusIcon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="weeklyStatusText">
            <div class="weeklyStatusTitle">이번 주 검사 완료 ✅</div>
            <div class="weeklyStatusDesc">로그인하면 주간 리포트를 확인할 수 있어요</div>
          </div>
        </div>
        <div class="homeCard locked" id="viewReportLogin">
          <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
          <div class="homeCardContent">
            <div class="homeCardTitle">주간 리포트</div>
            <div class="homeCardDesc">로그인 후 이용 가능</div>
          </div>
          <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
      `;
    } else if (hasPremium) {
      testSection = `
        <div class="weeklyStatus done">
          <div class="weeklyStatusIcon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="weeklyStatusText">
            <div class="weeklyStatusTitle">이번 주 검사 완료 ✅</div>
            <div class="weeklyStatusDesc">주간 리포트를 확인해보세요</div>
          </div>
        </div>
        <div class="homeCard" id="viewReport">
          <div class="homeCardIcon"><i class="fa-solid fa-chart-pie"></i></div>
          <div class="homeCardContent">
            <div class="homeCardTitle">주간 리포트</div>
            <div class="homeCardDesc">이번 주 검사 결과 보기</div>
          </div>
          <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
      `;
    } else {
      testSection = `
        <div class="weeklyStatus done">
          <div class="weeklyStatusIcon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="weeklyStatusText">
            <div class="weeklyStatusTitle">이번 주 검사 완료 ✅</div>
            <div class="weeklyStatusDesc">구독하면 주간 리포트를 확인할 수 있어요</div>
          </div>
        </div>
        <div class="homeCard locked" id="viewReportLocked">
          <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
          <div class="homeCardContent">
            <div class="homeCardTitle">주간 리포트 <span class="premiumBadge">PRO</span></div>
            <div class="homeCardDesc">구독 후 이용 가능</div>
          </div>
          <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
      `;
    }
  } else {
    testSection = `
      <div class="weeklyStatus pending">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-clipboard-list"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">이번 주 검사: 아직 안 함</div>
          <div class="weeklyStatusDesc">주 1회 검사로 변화를 확인하세요</div>
        </div>
      </div>
      <button class="primaryBtn" id="startTest">
        <i class="fa-solid fa-play"></i>
        검사 시작하기${!loggedIn ? ' (1회 체험)' : ''}
      </button>
    `;
  }
  
  // 연속 기록 뱃지 (인사말 옆에 표시)
  let streakBadge = '';
  if (streak > 0) {
    streakBadge = `
      <div class="streakBadge">
        <i class="fa-solid fa-fire-flame-curved"></i>
        <span>${streak}일째</span>
      </div>
    `;
  }
  
  // 무료체험 배너 (구독 중이면 숨김)
  let trialBanner = '';
  const isSubscribed = isSubscribedSync();
  
  if (!loggedIn) {
    // 비로그인: 회원가입 유도
    trialBanner = `
      <div class="trialBanner signup" id="signupBanner">
        <div class="trialBannerIcon"><i class="fa-solid fa-user-plus"></i></div>
        <div class="trialBannerText">
          <span class="trialBannerTitle">회원가입하고 14일 무료체험</span>
          <span class="trialBannerDesc">로그인하면 모든 기능을 이용할 수 있어요 →</span>
        </div>
      </div>
    `;
  } else if (isSubscribed) {
    // 구독 중: 배너 없음
    trialBanner = '';
  } else if (trialDaysLeft > 0) {
    // 무료체험 중
    trialBanner = `
      <div class="trialBanner">
        <div class="trialBannerIcon"><i class="fa-solid fa-gift"></i></div>
        <div class="trialBannerText">
          <span class="trialBannerTitle">무료체험 ${trialDaysLeft}일 남음</span>
          <span class="trialBannerDesc">모든 기능을 무료로 이용하세요</span>
        </div>
      </div>
    `;
  } else {
    // 체험 종료
    trialBanner = `
      <div class="trialBanner expired" id="upgradeBanner">
        <div class="trialBannerIcon"><i class="fa-solid fa-crown"></i></div>
        <div class="trialBannerText">
          <span class="trialBannerTitle">무료체험이 종료되었어요</span>
          <span class="trialBannerDesc">구독하고 계속 이용하기 →</span>
        </div>
      </div>
    `;
  }
  
  // 달력 카드 (비로그인이면 로그인 필요, 로그인이면 프리미엄 체크)
  let calendarCard = '';
  if (!loggedIn) {
    // 비로그인: 로그인 필요
    calendarCard = `
      <div class="homeCard locked" id="viewCalendarLogin">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">달력</div>
          <div class="homeCardDesc">로그인 후 이용 가능</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else if (hasPremium) {
    calendarCard = `
      <div class="homeCard" id="viewCalendar">
        <div class="homeCardIcon"><i class="fa-solid fa-calendar-days"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">달력</div>
          <div class="homeCardDesc">완료 스탬프와 주간 통계</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else {
    calendarCard = `
      <div class="homeCard locked" id="viewCalendarLocked">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">달력 <span class="premiumBadge">PRO</span></div>
          <div class="homeCardDesc">구독 후 이용 가능</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  }
  
  // 공지사항 배너 (백그라운드에서 로드 후 추가됨)
  const noticeBanner = '';
  
  // 검사 결과 카드 (비로그인이면 로그인 필요, 로그인이면 프리미엄 체크)
  let historyCard = '';
  if (!loggedIn) {
    // 비로그인: 로그인 필요
    historyCard = `
      <div class="homeCard locked" id="viewHistoryLogin">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">검사 기록</div>
          <div class="homeCardDesc">로그인 후 이용 가능</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else if (hasPremium) {
    historyCard = `
      <div class="homeCard" id="viewHistory">
        <div class="homeCardIcon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">검사 기록</div>
          <div class="homeCardDesc">전체 검사 히스토리</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else {
    historyCard = `
      <div class="homeCard locked" id="viewHistoryLocked">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">검사 기록 <span class="premiumBadge">PRO</span></div>
          <div class="homeCardDesc">구독 후 이용 가능</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  }
  
  // 처음 사용자 가이드
  const firstTimeGuide = getFirstTimeGuide();
  
  app.innerHTML = `
    <section class="card">
      ${noticeBanner}
      ${trialBanner}
      ${firstTimeGuide}
      
      <div class="greetingCard">
        <div class="greetingCardDate">${getTodayDateStr()}</div>
        <div class="greetingCardBody">
          <div class="greetingContent">
            <div class="greetingText">${greeting.text}</div>
            <div class="greetingSub">${greeting.sub}</div>
          </div>
          ${streakBadge}
        </div>
      </div>
      
      <div class="homeSectionTitle">이번 주 검사</div>
      ${testSection}
      
      <div class="homeSectionTitle" style="margin-top:24px;">오늘 할 일</div>
      ${todaySection}
      
      <div class="homeSectionTitle" style="margin-top:24px;">기록</div>
      ${historyCard}
      ${calendarCard}
      
      <div class="homeCard" id="openSettings" style="margin-top:24px;">
        <div class="homeCardIcon"><i class="fa-solid fa-gear"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">설정</div>
          <div class="homeCardDesc">프로필, 알림, 구독 관리</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  
  // 관리 시작 버튼
  if ($("#startTraining")) {
    $("#startTraining").onclick = async () => { 
      playClick(); 
      await renderTrainingSelect(); 
    };
  }
  
  // 비로그인 1회 체험 완료 → 로그인 유도
  if ($("#goLoginForTraining")) {
    $("#goLoginForTraining").onclick = () => { playClick(); renderLogin(); };
  }
  if ($("#goLoginForTest")) {
    $("#goLoginForTest").onclick = () => { playClick(); renderLogin(); };
  }
  
  // 무료체험 끝 → 구독 유도
  if ($("#goSubscribeForTraining")) {
    $("#goSubscribeForTraining").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  if ($("#goSubscribeForTest")) {
    $("#goSubscribeForTest").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  
  // 검사 관련
  if (canTest) {
    if (savedSession && savedSession.currentTest) {
      $("#resumeTest").onclick = () => { 
        playClick(); 
        resumeTest(savedSession);
      };
    } else if (!weeklyTestDone) {
      if ($("#startTest")) {
        $("#startTest").onclick = async () => { 
          playClick(); 
          resetState();
          await loadTestModules();
          startPatternTest(); 
        };
      }
    }
  }
  
  // 프리미엄 기능 (로그인 여부에 따라 분기)
  if (!loggedIn) {
    // 비로그인: 로그인 페이지로
    if ($("#viewHistoryLogin")) {
      $("#viewHistoryLogin").onclick = () => { playClick(); renderLogin(); };
    }
    if ($("#viewCalendarLogin")) {
      $("#viewCalendarLogin").onclick = () => { playClick(); renderLogin(); };
    }
    if ($("#viewReportLogin")) {
      $("#viewReportLogin").onclick = () => { playClick(); renderLogin(); };
    }
  } else if (hasPremium) {
    if ($("#viewHistory")) {
      $("#viewHistory").onclick = async () => { 
        playClick(); 
        const historyRenderer = await getHistoryRenderer();
        historyRenderer();
      };
    }
    if ($("#viewCalendar")) $("#viewCalendar").onclick = () => { playClick(); renderCalendar(); };
    if ($("#viewReport")) $("#viewReport").onclick = () => { playClick(); renderWeeklyReport(); };
  } else {
    if ($("#viewHistoryLocked")) $("#viewHistoryLocked").onclick = () => { playClick(); renderUpgradePrompt(); };
    if ($("#viewCalendarLocked")) $("#viewCalendarLocked").onclick = () => { playClick(); renderUpgradePrompt(); };
    if ($("#viewReportLocked")) $("#viewReportLocked").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  
  // 체험 만료 배너 클릭
  if ($("#upgradeBanner")) {
    $("#upgradeBanner").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  
  // 비로그인 회원가입 배너
  if ($("#signupBanner")) {
    $("#signupBanner").onclick = () => { playClick(); renderLogin(); };
  }
  
  // 공지사항 배너 클릭
  if ($("#noticeBanner")) {
    $("#noticeBanner").onclick = () => {
      playClick();
      renderNotices();
    };
  }
  
  // 설정
  $("#openSettings").onclick = () => { playClick(); renderSettings(); };
  
  // 백그라운드에서 서버 데이터 로드 후 필요시 화면 업데이트
  if (loggedIn) {
    refreshSubscription();
  }
  
  // 공지사항 백그라운드 로드
  getNotices().then(notices => {
    if (state.phase !== 'home' || !notices || notices.length === 0) return;
    
    const banner = $("#noticeBanner");
    if (banner) return; // 이미 표시됨
    
    // 공지 배너 추가
    const card = document.querySelector('.card');
    if (card && notices.length > 0) {
      const notice = notices[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hasRecent = notices.some(n => new Date(n.created_at) > sevenDaysAgo);
      
      const bannerHtml = `
        <div class="noticeBanner" id="noticeBanner">
          <div class="noticeBannerIcon"><i class="fa-solid fa-bullhorn"></i></div>
          <div class="noticeBannerText">
            <span class="noticeBannerTitle">공지사항</span>
            <span class="noticeBannerDesc">${notice.title}</span>
          </div>
          ${hasRecent ? '<span class="newBadge">NEW</span>' : ''}
          <div class="noticeBannerArrow"><i class="fa-solid fa-chevron-right"></i></div>
        </div>
      `;
      card.insertAdjacentHTML('afterbegin', bannerHtml);
      
      $("#noticeBanner").onclick = () => {
        playClick();
        renderNotices();
      };
    }
  }).catch(() => {});
}

// 공지사항 목록 페이지
export async function renderNotices() {
  state.phase = "notices";
  document.querySelector(".progress").textContent = "공지사항";
  
  app.innerHTML = `
    <section class="card">
      <div class="pageHeader">
        <button class="backBtn" id="backToHome"><i class="fa-solid fa-arrow-left"></i></button>
        <h2 class="pageTitle">공지사항</h2>
      </div>
      <div id="noticeList" class="noticeList">
        <div class="loadingText">로딩 중...</div>
      </div>
    </section>
  `;
  
  $("#backToHome").onclick = () => { playClick(); renderHome(); };
  
  // 공지사항 로드
  const notices = await getNotices();
  const listEl = $("#noticeList");
  
  if (notices.length === 0) {
    listEl.innerHTML = `<div class="emptyText">등록된 공지사항이 없습니다.</div>`;
    return;
  }
  
  listEl.innerHTML = notices.map(n => {
    // 7일 이내면 NEW 표시
    const createdAt = new Date(n.created_at);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const isRecent = createdAt > sevenDaysAgo;
    
    return `
      <div class="noticeItem" data-id="${n.id}">
        <div class="noticeItemHeader">
          ${isRecent ? '<span class="newBadge">NEW</span>' : ''}
          <span class="noticeItemTitle">${n.title}</span>
        </div>
        <div class="noticeItemDate">${new Date(n.created_at).toLocaleDateString('ko-KR')}</div>
      </div>
    `;
  }).join('');
  
  // 공지 클릭 이벤트
  listEl.querySelectorAll('.noticeItem').forEach(item => {
    item.onclick = () => {
      playClick();
      const id = parseInt(item.dataset.id);
      const notice = notices.find(n => n.id === id);
      if (notice) showNoticeDetail(notice);
    };
  });
}

// 공지사항 상세 페이지
function showNoticeDetail(notice) {
  // 읽음 표시 저장
  const readIds = JSON.parse(localStorage.getItem('brainup_read_notices') || '[]');
  if (!readIds.includes(notice.id)) {
    readIds.push(notice.id);
    localStorage.setItem('brainup_read_notices', JSON.stringify(readIds));
  }
  
  state.phase = "noticeDetail";
  document.querySelector(".progress").textContent = "공지사항";
  
  app.innerHTML = `
    <section class="card">
      <div class="pageHeader">
        <button class="backBtn" id="backToNotices"><i class="fa-solid fa-arrow-left"></i></button>
        <h2 class="pageTitle">공지사항</h2>
      </div>
      <div class="noticeDetail">
        <div class="noticeDetailTitle">${notice.title}</div>
        <div class="noticeDetailDate">${new Date(notice.created_at).toLocaleDateString('ko-KR')}</div>
        <div class="noticeDetailBody">${notice.content.replace(/\n/g, '<br>')}</div>
      </div>
    </section>
  `;
  
  $("#backToNotices").onclick = () => { playClick(); renderNotices(); };
}
