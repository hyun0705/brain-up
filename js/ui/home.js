// ui/home.js
import { $ } from '../core/utils.js';
import { state, resetState } from '../core/state.js';
import { LS_KEYS, loadHistory, loadBaseline, getUserProfile, getTrialDaysLeft, canAccessPremium, hasTestedThisWeek } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { playClick } from '../core/sound.js';
import { startPatternTest } from '../tests/pattern.js';
import { startDigitSpanTraining, hasTrainedToday, getStreak } from '../training/digitspan-training.js';
import { renderPastResults } from './intro.js';
import { renderCalendar, renderUpgradePrompt } from './calendar.js';
import { renderSettings } from './settings.js';
import { renderWeeklyReport } from './report.js';

const app = $("#app");

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
  if (hour >= 5 && hour < 12) return { text: '좋은 아침이에요', sub: '오늘도 두뇌 건강을 챙겨볼까요?' };
  if (hour >= 12 && hour < 17) return { text: '좋은 오후예요', sub: '잠깐 쉬면서 두뇌 관리 어떠세요?' };
  if (hour >= 17 && hour < 21) return { text: '좋은 저녁이에요', sub: '오늘 하루도 수고 많으셨어요' };
  return { text: '편안한 밤 되세요', sub: '내일 또 만나요' };
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

export function renderHome() {
  state.currentTest = null;
  state.phase = "home";
  document.querySelector(".progress").textContent = "홈";
  
  const profile = getUserProfile();
  const streak = getStreak();
  const todayDone = hasTrainedToday();
  const weeklyTestDone = hasTestedThisWeek();
  const weakest = getWeakestArea();
  const lastTestDate = getLastTestDate();
  const greeting = getGreeting();
  const trialDaysLeft = getTrialDaysLeft();
  const hasPremium = canAccessPremium();
  
  // 오늘의 관리 섹션
  let todaySection = '';
  if (todayDone) {
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
        3분 관리 시작
      </button>
    `;
  }
  
  // 검사 섹션 (이번 주 기준)
  let testSection = '';
  if (weeklyTestDone) {
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
      <div class="weeklyStatus pending">
        <div class="weeklyStatusIcon"><i class="fa-solid fa-clipboard-list"></i></div>
        <div class="weeklyStatusText">
          <div class="weeklyStatusTitle">이번 주 검사: 아직 안 함</div>
          <div class="weeklyStatusDesc">주 1회 검사로 변화를 확인하세요</div>
        </div>
      </div>
      <button class="primaryBtn" id="startTest">
        <i class="fa-solid fa-play"></i>
        검사 시작하기 (6~8분)
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
  
  // 무료체험 배너
  let trialBanner = '';
  if (trialDaysLeft > 0) {
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
  
  // 달력 카드 (잠금 여부)
  let calendarCard = '';
  if (hasPremium) {
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
  
  // 검사 결과 카드 (잠금 여부)
  let historyCard = '';
  if (hasPremium) {
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
      ${trialBanner}
      
      <div class="homeGreetingRow">
        <div class="homeGreeting">
          <div class="greetingText">${greeting.text}</div>
          <div class="greetingSub">${greeting.sub}</div>
        </div>
        ${streakBadge}
      </div>
      
      <div class="homeSectionTitle">오늘 할 일</div>
      ${todaySection}
      
      <div class="homeSectionTitle" style="margin-top:24px;">이번 주 검사</div>
      ${testSection}
      
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
  if (!todayDone) {
    $("#startTraining").onclick = () => { playClick(); startDigitSpanTraining(); };
  }
  
  // 검사 관련
  if (weeklyTestDone) {
    $("#viewReport").onclick = () => { playClick(); renderWeeklyReport(); };
  } else {
    $("#startTest").onclick = () => { 
      playClick(); 
      resetState();
      startPatternTest(); 
    };
  }
  
  // 프리미엄 기능
  if (hasPremium) {
    $("#viewHistory").onclick = () => { playClick(); renderPastResults(); };
    $("#viewCalendar").onclick = () => { playClick(); renderCalendar(); };
  } else {
    $("#viewHistoryLocked").onclick = () => { playClick(); renderUpgradePrompt(); };
    $("#viewCalendarLocked").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  
  // 체험 만료 배너 클릭
  if ($("#upgradeBanner")) {
    $("#upgradeBanner").onclick = () => { playClick(); renderUpgradePrompt(); };
  }
  
  // 설정
  $("#openSettings").onclick = () => { playClick(); renderSettings(); };
}
