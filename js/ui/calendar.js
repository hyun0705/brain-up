// ui/calendar.js
import { $, showConfirmModal, showAlertModal } from '../core/utils.js';
import { LS_KEYS, loadHistory, getDateKey, getTrialDaysLeft, isSubscribedSync, getSubscriptionCache, clearSubscription } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';
import { isLoggedIn, requestPayment, cancelPayment, getPendingPayment, getResults } from '../core/api.js';
import { state } from '../core/state.js';

const app = $("#app");

// 서버에서 가져온 결과 캐시
let cachedServerResults = null;

// UTC를 한국 시간으로 변환 (서버 데이터용)
function toKoreaTime(dateStr) {
  if (!dateStr) return new Date();
  const utcDate = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// ========== 업그레이드 안내 화면 ==========

export async function renderUpgradePrompt() {
  document.querySelector(".progress").textContent = "구독 안내";
  
  // 구독 중이면 구독 상태 화면으로
  if (isSubscribedSync()) {
    renderSubscriptionStatus();
    return;
  }
  
  // 이미 대기 중인 결제가 있는지 확인
  if (isLoggedIn()) {
    try {
      const pending = await getPendingPayment();
      if (pending && pending.payment) {
        renderPaymentComplete();
        return;
      }
    } catch (e) {
      // 무시
    }
  }
  
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
      renderPaymentInfo(selectedPlan);
    };
    
    $("#backHome").onclick = () => { playClick(); renderHome(); };
  }
  
  render();
}

// ========== 결제 안내 화면 ==========

function renderPaymentInfo(plan) {
  const amount = plan === 'yearly' ? 99000 : 9900;
  const planText = plan === 'yearly' ? '연 구독' : '월 구독';
  
  app.innerHTML = `
    <section class="card">
      <div class="upgradeHeader">
        <div class="upgradeIcon"><i class="fa-solid fa-building-columns"></i></div>
        <h1 class="title">계좌이체 안내</h1>
        <p class="desc">${planText} · ${amount.toLocaleString()}원</p>
      </div>
      
      <div class="paymentInfoBox">
        <div class="paymentInfoRow">
          <span class="paymentInfoLabel">은행</span>
          <span class="paymentInfoValue">카카오뱅크</span>
        </div>
        <div class="paymentInfoRow">
          <span class="paymentInfoLabel">계좌번호</span>
          <span class="paymentInfoValue" id="accountNumber">3333-10-3568315</span>
          <button class="copyBtn" id="copyAccount"><i class="fa-solid fa-copy"></i></button>
        </div>
        <div class="paymentInfoRow">
          <span class="paymentInfoLabel">예금주</span>
          <span class="paymentInfoValue">강현</span>
        </div>
        <div class="paymentInfoRow">
          <span class="paymentInfoLabel">금액</span>
          <span class="paymentInfoValue highlight">${amount.toLocaleString()}원</span>
        </div>
      </div>
      
      <div class="notice" style="margin-top:16px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        입금 후 아래 버튼을 눌러주세요.<br/>
        확인까지 최대 24시간이 소요될 수 있어요.
      </div>
      
      <button class="primaryBtn" id="confirmPayment" style="margin-top:20px;">
        <i class="fa-solid fa-check"></i>
        입금 완료했어요
      </button>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:12px;">
        <button class="big ghost" id="backToUpgrade">뒤로</button>
      </div>
    </section>
  `;
  
  $("#copyAccount").onclick = async () => {
    playClick();
    try {
      await navigator.clipboard.writeText('3333103568315');
      $("#copyAccount").innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        $("#copyAccount").innerHTML = '<i class="fa-solid fa-copy"></i>';
      }, 1500);
    } catch {
      showAlertModal({
        title: '복사 실패',
        message: '직접 복사해주세요.',
        type: 'warning'
      });
    }
  };
  
  $("#confirmPayment").onclick = async () => {
    playClick();
    
    if (!isLoggedIn()) {
      showAlertModal({
        title: '로그인 필요',
        message: '로그인이 필요해요.',
        type: 'info'
      });
      return;
    }
    
    const confirmed = await showConfirmModal({
      title: '입금 확인',
      message: `${amount.toLocaleString()}원을 입금하셨나요?<br><br>입금하지 않았다면 '취소'를 눌러주세요.`,
      confirmText: '입금했어요',
      cancelText: '취소'
    });
    if (!confirmed) return;
    
    try {
      await requestPayment(plan, amount);
      renderPaymentComplete();
    } catch (e) {
      showAlertModal({
        title: '오류',
        message: e.message,
        type: 'error'
      });
    }
  };
  
  $("#backToUpgrade").onclick = () => { playClick(); renderUpgradePrompt(); };
}

function renderPaymentComplete(paymentId) {
  app.innerHTML = `
    <section class="card" style="text-align:center;">
      <div class="upgradeIcon" style="background:#f0fdf4;"><i class="fa-solid fa-clock" style="color:var(--good);"></i></div>
      <h1 class="title">입금 확인 중</h1>
      <p class="desc">
        입금 확인 후 구독이 활성화됩니다.<br/>
        확인까지 최대 24시간이 소요될 수 있어요.
      </p>
      
      <div class="notice" style="margin-top:20px;">
        <i class="fa-solid fa-bell" style="color:var(--accent);"></i>
        구독이 활성화되면 앱에서 알려드릴게요.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="goHome">홈으로</button>
      </div>
      
      <button class="textBtn" id="cancelPayment" style="margin-top:16px;color:#dc2626;">
        잘못 눌렀어요 (취소)
      </button>
    </section>
  `;
  
  $("#goHome").onclick = () => { playClick(); renderHome(); };
  
  $("#cancelPayment").onclick = async () => {
    playClick();
    const confirmed = await showConfirmModal({
      title: '결제 취소',
      message: '결제 요청을 취소할까요?',
      confirmText: '취소할게요',
      cancelText: '아니요',
      danger: true
    });
    if (!confirmed) return;
    
    try {
      await cancelPayment();
      await showAlertModal({
        title: '취소 완료',
        message: '결제 요청이 취소되었습니다.',
        type: 'success'
      });
      renderUpgradePrompt();
    } catch (e) {
      showAlertModal({
        title: '오류',
        message: e.message,
        type: 'error'
      });
    }
  };
}

// ========== 구독 상태 화면 ==========

function renderSubscriptionStatus() {
  document.querySelector(".progress").textContent = "구독 관리";
  
  const subscription = getSubscriptionCache();
  const planText = subscription?.plan === 'yearly' ? '연간 구독' : '월간 구독';
  const amount = subscription?.plan === 'yearly' ? '99,000' : '9,900';
  
  // 만료일 포맷팅
  let expiresText = '-';
  let daysLeft = 0;
  if (subscription?.expiresAt) {
    const expiresDate = new Date(subscription.expiresAt);
    expiresText = expiresDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    daysLeft = Math.ceil((expiresDate - new Date()) / (1000 * 60 * 60 * 24));
  }
  
  app.innerHTML = `
    <section class="card">
      <div class="upgradeHeader subscribed">
        <div class="upgradeIcon subscribed"><i class="fa-solid fa-crown"></i></div>
        <h1 class="title">구독 중</h1>
        <p class="desc">프리미엄 회원이신 것을 환영해요!</p>
      </div>
      
      <div class="subscriptionInfoBox">
        <div class="subscriptionInfoRow">
          <span class="subscriptionInfoLabel">현재 플랜</span>
          <span class="subscriptionInfoValue">${planText}</span>
        </div>
        <div class="subscriptionInfoRow">
          <span class="subscriptionInfoLabel">결제 금액</span>
          <span class="subscriptionInfoValue">₩${amount}</span>
        </div>
        <div class="subscriptionInfoRow">
          <span class="subscriptionInfoLabel">다음 결제일</span>
          <span class="subscriptionInfoValue">${expiresText}</span>
        </div>
        <div class="subscriptionInfoRow">
          <span class="subscriptionInfoLabel">남은 기간</span>
          <span class="subscriptionInfoValue highlight">${daysLeft}일</span>
        </div>
      </div>
      
      <div class="subscriptionBenefits">
        <div class="subscriptionBenefitTitle">이용 중인 혜택</div>
        <div class="subscriptionBenefitList">
          <div class="subscriptionBenefitItem">
            <i class="fa-solid fa-check"></i>
            <span>달력 & 통계</span>
          </div>
          <div class="subscriptionBenefitItem">
            <i class="fa-solid fa-check"></i>
            <span>상세 분석</span>
          </div>
          <div class="subscriptionBenefitItem">
            <i class="fa-solid fa-check"></i>
            <span>무제한 관리</span>
          </div>
          <div class="subscriptionBenefitItem">
            <i class="fa-solid fa-check"></i>
            <span>리마인더</span>
          </div>
        </div>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
      
      <button class="textBtn" id="cancelSubscription" style="margin-top:16px;color:#dc2626;">
        구독 해지하기
      </button>
    </section>
  `;
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
  
  $("#cancelSubscription").onclick = () => {
    playClick();
    renderCancelSubscription();
  };
}

// ========== 구독 해지 화면 ==========

function renderCancelSubscription() {
  const subscription = getSubscriptionCache();
  
  let expiresText = '-';
  if (subscription?.expiresAt) {
    const expiresDate = new Date(subscription.expiresAt);
    expiresText = expiresDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  
  app.innerHTML = `
    <section class="card" style="text-align:center;">
      <div class="upgradeIcon" style="background:#1f2937;"><i class="fa-solid fa-heart-crack" style="color:#ef4444;"></i></div>
      <h1 class="title">정말 해지하시겠어요?</h1>
      <p class="desc">
        해지하시면 <b>${expiresText}</b>까지<br/>
        프리미엄 기능을 이용할 수 있어요.<br/>
        이후에는 무료 기능만 사용 가능해요.
      </p>
      
      <div class="notice" style="margin-top:20px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        해지 후에도 기존 기록은 유지됩니다.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="keepSubscription">계속 구독할게요</button>
      </div>
      
      <button class="textBtn" id="confirmCancel" style="margin-top:16px;color:#dc2626;">
        그래도 해지할게요
      </button>
    </section>
  `;
  
  $("#keepSubscription").onclick = () => { 
    playClick(); 
    renderSubscriptionStatus(); 
  };
  
  $("#confirmCancel").onclick = async () => {
    playClick();
    
    const confirmed = await showConfirmModal({
      title: '구독 해지',
      message: '정말 구독을 해지할까요?<br><br>현재 구독 기간이 끝날 때까지는<br>계속 이용할 수 있어요.',
      confirmText: '해지할게요',
      cancelText: '취소',
      danger: true
    });
    if (!confirmed) return;
    
    // 로컬에서 구독 상태 삭제 (실제 해지는 서버에서 자동 만료)
    // 나중에 서버 API로 해지 요청 추가 가능
    await showAlertModal({
      title: '해지 완료',
      message: '구독이 해지되었어요.<br>현재 구독 기간이 끝날 때까지는<br>계속 이용할 수 있어요.',
      type: 'success'
    });
    renderHome();
  };
}

// ========== 유틸 함수 ==========

// 관리 완료 날짜 Set (로그인: 서버, 비로그인: 로컬)
function getTrainingCompletedSet() {
  const dates = new Set();
  
  try {
    // 로그인 사용자: 서버 데이터 사용
    if (isLoggedIn() && cachedServerResults) {
      cachedServerResults
        .filter(r => r.test_type === 'training')
        .forEach(r => {
          const koreaDate = toKoreaTime(r.date || r.created_at);
          const dateKey = getDateKey(koreaDate);
          dates.add(dateKey);
        });
    }
    
    // 로컬 데이터도 합산 (비로그인이거나, 로그인이어도 로컬에 있을 수 있음)
    const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
    history.forEach(e => {
      if (e.date_key) dates.add(e.date_key);
    });
  } catch {
    // 무시
  }
  
  return dates;
}

// 검사 완료 날짜 Set (로그인: 서버, 비로그인: 로컬)
function getTestCompletedSet() {
  const dates = new Set();
  
  try {
    // 로그인 사용자: 서버 데이터 사용
    if (isLoggedIn() && cachedServerResults) {
      cachedServerResults
        .filter(r => r.test_type !== 'training')
        .forEach(r => {
          const koreaDate = toKoreaTime(r.date || r.created_at);
          const dateKey = getDateKey(koreaDate);
          dates.add(dateKey);
        });
    }
    
    // 로컬 데이터도 합산 (비로그인용)
    const history = loadHistory(LS_KEYS.patternHistory);
    history.forEach(e => {
      dates.add(getDateKey(new Date(e.ended_at)));
    });
  } catch {
    // 무시
  }
  
  return dates;
}

// 주간 범위 (일요일 시작)
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0=일, 1=월, ..., 6=토
  
  // 일요일 시작 (일~토)
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);
    days.push(getDateKey(day));
  }
  
  return { sunday, saturday, days };
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

export async function renderCalendar(year = null, month = null) {
  state.phase = 'calendar';
  const now = new Date();
  if (year === null) year = now.getFullYear();
  if (month === null) month = now.getMonth();
  
  document.querySelector(".progress").textContent = "달력";
  
  // 로그인 사용자: 서버 데이터 로드
  if (isLoggedIn() && !cachedServerResults) {
    app.innerHTML = `
      <section class="card">
        <div style="text-align:center;padding:60px 40px;">
          <div class="loadingSpinner"></div>
          <p style="margin-top:20px;color:var(--muted);font-size:14px;">데이터를 불러오는 중...</p>
        </div>
      </section>
    `;
    
    try {
      cachedServerResults = await getResults();
    } catch (e) {
      console.error('검사 결과 로드 실패:', e);
      cachedServerResults = [];
    }
  }
  
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
