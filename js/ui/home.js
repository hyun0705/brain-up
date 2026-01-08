// ui/home.js
import { $ } from '../core/utils.js';
import { state, resetState, restoreTestProgress, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, loadBaseline, getUserProfile, getTrialDaysLeft, canAccessPremium, hasTestedThisWeek, loadSessionState, hasGuestTestedOnce, hasGuestTrainedOnce, refreshSubscription, isSubscribedSync } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { playClick } from '../core/sound.js';
import { startDigitSpanTraining, hasTrainedToday, getStreak } from '../training/digitspan-training.js';
import { renderPastResults } from './intro.js';
import { renderCalendar, renderUpgradePrompt } from './calendar.js';
import { renderSettings } from './settings.js';
import { renderWeeklyReport } from './report.js';
import { isLoggedIn, renderLogin, checkLoginForFeature } from './auth.js';
import { getUserName, getNotices } from '../core/api.js';

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

// 가장 약한 영역 찾기
function getWeakestArea() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  if (digitspanHist.length === 0) return { area: 'digitspan', name: '작업기억', index: 50 };
  
  const getLatestIndex = (hist, baselineKey, scoreKey = 'raw') => {
    if (hist.length === 0) return 50;
    const last = hist[hist.length - 1];
    const baseline = loadBaseline(baselineKey);
    const result = computeIndexFromBaseline(last.summary[scoreKey], baseline);
    return result.index;
  };
  
  const areas = [
    { area: 'pattern', name: '처리속도', index: getLatestIndex(patternHist, LS_KEYS.patternBaseline) },
    { area: 'gonogo', name: '주의·억제', index: getLatestIndex(gonogoHist, LS_KEYS.gonogoBaseline) },
    { area: 'digitspan', name: '작업기억', index: getLatestIndex(digitspanHist, LS_KEYS.digitspanBaseline, 'totalSpan') },
    { area: 'spatial', name: '공간기억', index: getLatestIndex(spatialHist, LS_KEYS.spatialBaseline) },
  ];
  
  return areas.reduce((min, curr) => curr.index < min.index ? curr : min);
}

// 마지막 검사 날짜
function getLastTestDate() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  if (patternHist.length === 0) return null;
  return new Date(patternHist[patternHist.length - 1].ended_at);
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
  
  // 로그인 상태면 서버에서 구독 상태 확인 (비동기, 기다리지 않음)
  const loggedIn = isLoggedIn();
  if (loggedIn) {
    refreshSubscription(); // 백그라운드에서 업데이트
  }
  
  const profile = getUserProfile();
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
  
  // 공지사항 로드
  const notices = await getNotices();
  const latestNotice = notices.length > 0 ? notices[0] : null;
  
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
    
    // 남은 시간 계산
    const tenMinutes = 10 * 60 * 1000;
    const elapsed = Date.now() - savedSession.savedAt;
    const remaining = tenMinutes - elapsed;
    const remainingMins = Math.ceil(remaining / 60000);
    
    testSection = `
      <div class="weeklyStatus inprogress">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-pause-circle"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">검사 진행 중 (${completedCount}/4 완료)</div>
          <div class="weeklyStatusDesc"><i class="fa-solid fa-clock"></i> ${remainingMins}분 남음 · 정확한 검사를 위해 이어서 해주세요</div>
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
  
  // 공지사항 배너
  let noticeBanner = '';
  if (latestNotice) {
    // 7일 이내 공지가 있는지 확인
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const hasRecent = notices.some(n => new Date(n.created_at) > sevenDaysAgo);
    
    noticeBanner = `
      <div class="noticeBanner" id="noticeBanner">
        <div class="noticeBannerIcon"><i class="fa-solid fa-bullhorn"></i></div>
        <div class="noticeBannerText">
          <span class="noticeBannerTitle">공지사항</span>
          <span class="noticeBannerDesc">${latestNotice.title}</span>
        </div>
        ${hasRecent ? '<span class="newBadge">NEW</span>' : ''}
        <div class="noticeBannerArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  }
  
  // 검사 결과 카드 (비로그인이면 로그인 필요, 로그인이면 프리미엄 체크)
  let historyCard = '';
  if (!loggedIn) {
    // 비로그인: 로그인 필요
    historyCard = `
      <div class="homeCard locked" id="viewHistoryLogin">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">검사 결과</div>
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
          <div class="homeCardTitle">검사 결과</div>
          <div class="homeCardDesc">점수와 변화 추이 그래프</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else {
    historyCard = `
      <div class="homeCard locked" id="viewHistoryLocked">
        <div class="homeCardIcon"><i class="fa-solid fa-lock"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">검사 결과 <span class="premiumBadge">PRO</span></div>
          <div class="homeCardDesc">구독 후 이용 가능</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  }
  
  app.innerHTML = `
    <section class="card">
      ${noticeBanner}
      ${trialBanner}
      
      <div class="homeGreetingRow">
        <div class="homeGreeting">
          <div class="greetingText">${greeting.text}</div>
          <div class="greetingSub">${greeting.sub}</div>
        </div>
        ${streakBadge}
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
    $("#startTraining").onclick = () => { 
      playClick(); 
      startDigitSpanTraining(); 
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
    if ($("#viewHistory")) $("#viewHistory").onclick = () => { playClick(); renderPastResults(); };
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
