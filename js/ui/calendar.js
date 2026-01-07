// ui/calendar.js
import { $ } from '../core/utils.js';
import { LS_KEYS, loadHistory, getDateKey, getTrialDaysLeft } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';

const app = $("#app");

// ========== 업그레이드 안내 화면 ==========

export function renderUpgradePrompt() {
  document.querySelector(".progress").textContent = "구독 안내";
  
  let selectedPlan = 'yearly'; // 기본 선택: 연 구독
  
  function render() {
    app.innerHTML = `
      <section class="card">
        <div class="upgradeHeader">
          <div class="upgradeIcon"><i class="fa-solid fa-crown"></i></div>
          <h1 class="title">브레인업 프리미엄</h1>
          <p class="desc">꾸준한 두뇌 관리를 위한 모든 기능</p>
        </div>
        
        <div class="upgradeFeatures">
          <div class="upgradeFeatureItem">
            <i class="fa-solid fa-calendar-check"></i>
            <div>
              <div class="upgradeFeatureTitle">달력 & 통계</div>
              <div class="upgradeFeatureDesc">완료 스탬프와 주간/월간 통계</div>
            </div>
          </div>
          <div class="upgradeFeatureItem">
            <i class="fa-solid fa-chart-line"></i>
            <div>
              <div class="upgradeFeatureTitle">상세 분석</div>
              <div class="upgradeFeatureDesc">검사 결과 추이와 변화 그래프</div>
            </div>
          </div>
          <div class="upgradeFeatureItem">
            <i class="fa-solid fa-brain"></i>
            <div>
              <div class="upgradeFeatureTitle">무제한 관리</div>
              <div class="upgradeFeatureDesc">매일 두뇌 관리 무제한 이용</div>
            </div>
          </div>
          <div class="upgradeFeatureItem">
            <i class="fa-solid fa-bell"></i>
            <div>
              <div class="upgradeFeatureTitle">리마인더</div>
              <div class="upgradeFeatureDesc">매일 알림으로 꾸준히 관리</div>
            </div>
          </div>
        </div>
        
        <div class="upgradePricing">
          <div class="upgradePriceBox ${selectedPlan === 'monthly' ? 'selected' : ''}" id="monthlyPlan">
            <div class="upgradePriceLabel">월 구독</div>
            <div class="upgradePrice">₩9,900<span>/월</span></div>
          </div>
          <div class="upgradePriceBox ${selectedPlan === 'yearly' ? 'selected' : ''}" id="yearlyPlan">
            <div class="upgradePopularBadge">인기</div>
            <div class="upgradePriceLabel">연 구독</div>
            <div class="upgradePrice">₩99,000<span>/년</span></div>
            <div class="upgradePriceSub">월 8,250원 · 17% 할인</div>
          </div>
        </div>
        
        <button class="primaryBtn" id="payBtn" style="margin-top:20px;">
          <i class="fa-solid fa-credit-card"></i>
          ${selectedPlan === 'yearly' ? '₩99,000 결제하기' : '₩9,900 결제하기'}
        </button>
        
        <p class="upgradeNote">
          언제든 해지 가능 · 7일 환불 보장
        </p>
        
        <div class="controls" style="grid-template-columns:1fr;margin-top:12px;">
          <button class="big ghost" id="backHome">나중에 할게요</button>
        </div>
      </section>
    `;
    
    bindEvents();
  }
  
  function bindEvents() {
    $("#monthlyPlan").onclick = () => {
      playClick();
      selectedPlan = 'monthly';
      render();
    };
    
    $("#yearlyPlan").onclick = () => {
      playClick();
      selectedPlan = 'yearly';
      render();
    };
    
    $("#payBtn").onclick = () => {
      playClick();
      const planText = selectedPlan === 'yearly' ? '연 구독 (₩99,000/년)' : '월 구독 (₩9,900/월)';
      alert(`${planText}\n\n결제 기능은 준비 중입니다.\n곧 서비스될 예정이에요!`);
    };
    
    $("#backHome").onclick = () => { playClick(); renderHome(); };
  }
  
  render();
}

// ========== 유틸 함수 ==========

// 관리 완료 날짜 Set
function getTrainingCompletedSet() {
  try {
    const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
    return new Set(history.map(e => e.date_key));
  } catch {
    return new Set();
  }
}

// 검사 완료 날짜 Set
function getTestCompletedSet() {
  try {
    const history = loadHistory(LS_KEYS.patternHistory);
    return new Set(history.map(e => getDateKey(new Date(e.ended_at))));
  } catch {
    return new Set();
  }
}

// 주간 범위 (월요일 시작)
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day; // 일요일이면 -6, 아니면 월요일까지 차이
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(getDateKey(day));
  }
  
  return { monday, sunday, days };
}

// 주간 완료율
function getWeekCompletion(date = new Date()) {
  const { days } = getWeekRange(date);
  const completedSet = getTrainingCompletedSet();
  const today = getDateKey();
  
  // 오늘까지만 카운트 (미래는 제외)
  const pastDays = days.filter(d => d <= today);
  const completedCount = pastDays.filter(d => completedSet.has(d)).length;
  
  return {
    completed: completedCount,
    total: pastDays.length,
    days,
    completedSet
  };
}



// 월의 첫 날 요일 (0=일, 1=월, ...)
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

// 월의 마지막 날짜
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// ========== 렌더링 ==========

export function renderCalendar(year = null, month = null) {
  const now = new Date();
  if (year === null) year = now.getFullYear();
  if (month === null) month = now.getMonth();
  
  document.querySelector(".progress").textContent = "달력";
  
  const trainingSet = getTrainingCompletedSet();
  const testSet = getTestCompletedSet();
  const todayKey = getDateKey();
  const weekStats = getWeekCompletion();
  
  // 월 정보
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
  
  // 달력 그리드 생성
  let calendarHtml = '';
  
  // 요일 헤더 (일요일 시작)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  calendarHtml += '<div class="calendarHeader">';
  dayNames.forEach((name, i) => {
    const isWeekend = i === 0 || i === 6; // 일요일(0), 토요일(6)
    calendarHtml += `<div class="calendarDayName ${isWeekend ? 'weekend' : ''}">${name}</div>`;
  });
  calendarHtml += '</div>';
  
  // 날짜 셀
  calendarHtml += '<div class="calendarGrid">';
  
  // 첫 주 빈 칸 (일요일 시작이므로 그대로 사용)
  const adjustedFirstDay = firstDay;
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarHtml += '<div class="calendarCell empty"></div>';
  }
  
  // 날짜 셀
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateKey === todayKey;
    const hasTraining = trainingSet.has(dateKey);
    const hasTest = testSet.has(dateKey);
    const isFuture = dateKey > todayKey;
    
    let cellClass = 'calendarCell';
    if (isToday) cellClass += ' today';
    if (isFuture) cellClass += ' future';
    
    let stamps = '';
    if (hasTraining) stamps += '<span class="stamp training"><i class="fa-solid fa-check"></i></span>';
    if (hasTest) stamps += '<span class="stamp test"><i class="fa-solid fa-clipboard-check"></i></span>';
    
    calendarHtml += `
      <div class="${cellClass}">
        <span class="dayNum">${day}</span>
        <div class="stamps">${stamps}</div>
      </div>
    `;
  }
  
  calendarHtml += '</div>';
  
  // 이번 주 통계 메시지
  let weekMessage = '';
  if (weekStats.total > 0) {
    const percent = Math.round((weekStats.completed / weekStats.total) * 100);
    weekMessage = `이번 주 ${weekStats.completed}/${weekStats.total}일 완료 (${percent}%)`;
  }
  
  app.innerHTML = `
    <section class="card">
      <div class="calendarNav">
        <button class="calendarNavBtn" id="prevMonth"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="calendarTitle">${year}년 ${monthNames[month]}</div>
        <button class="calendarNavBtn" id="nextMonth"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      
      <button class="calendarTodayBtn" id="goToday">오늘로</button>
      
      ${calendarHtml}
      
      <div class="calendarLegend">
        <div class="legendItem">
          <span class="stamp training"><i class="fa-solid fa-check"></i></span>
          <span>관리 완료</span>
        </div>
        <div class="legendItem">
          <span class="stamp test"><i class="fa-solid fa-clipboard-check"></i></span>
          <span>검사 완료</span>
        </div>
      </div>
      
      ${weekMessage ? `<p class="weekStats">${weekMessage}</p>` : ''}
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:16px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  $("#prevMonth").onclick = () => {
    playClick();
    let newMonth = month - 1;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    renderCalendar(newYear, newMonth);
  };
  
  $("#nextMonth").onclick = () => {
    playClick();
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    renderCalendar(newYear, newMonth);
  };
  
  $("#goToday").onclick = () => {
    playClick();
    renderCalendar();
  };
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}
