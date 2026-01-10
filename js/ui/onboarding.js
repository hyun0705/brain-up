// ui/onboarding.js
import { $, showToast } from '../core/utils.js';
import { saveUserProfile, getUserProfile } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';

const app = $("#app");

// 온보딩 완료 여부
export function needsOnboarding() {
  const profile = getUserProfile();
  return !profile || !profile.onboardingComplete;
}

// 온보딩 시작
export function startOnboarding() {
  renderOnboardingStep1();
}

// Step 1: 환영 화면
function renderOnboardingStep1() {
  document.querySelector(".progress").textContent = "시작하기";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon">
        <i class="fa-solid fa-brain"></i>
      </div>
      <h1 class="title">브레인업에 오신 것을 환영해요</h1>
      <p class="desc">
        매일 3분, 간단한 두뇌 관리로<br/>
        인지 건강을 챙겨보세요.
      </p>
      
      <div class="onboardingFeatures">
        <div class="onboardingFeatureItem">
          <i class="fa-solid fa-clock"></i>
          <span>하루 3분이면 충분해요</span>
        </div>
        <div class="onboardingFeatureItem">
          <i class="fa-solid fa-chart-line"></i>
          <span>변화를 기록하고 확인해요</span>
        </div>
        <div class="onboardingFeatureItem">
          <i class="fa-solid fa-calendar-check"></i>
          <span>꾸준함이 가장 중요해요</span>
        </div>
      </div>
      
      <div class="onboardingProgress">
        <span class="dot active"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      
      <button class="primaryBtn" id="nextBtn">
        시작하기
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </section>
  `;
  
  $("#nextBtn").onclick = () => { playClick(); renderOnboardingStep2(); };
}

// Step 2: 검사란?
function renderOnboardingStep2() {
  document.querySelector(".progress").textContent = "검사 소개";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon small">
        <i class="fa-solid fa-clipboard-check"></i>
      </div>
      <h1 class="title">주간 검사란?</h1>
      <p class="desc">
        <b>일주일에 1번</b>, 내 인지 상태를<br/>
        정확하게 측정해요.
      </p>
      
      <div class="testIntroList">
        <div class="testIntroItem">
          <div class="testIntroIcon" style="background: #dbeafe;">
            <i class="fa-solid fa-bolt" style="color: #2563eb;"></i>
          </div>
          <div class="testIntroText">
            <strong>처리속도</strong>
            <span>빠르게 패턴 비교하기</span>
          </div>
        </div>
        <div class="testIntroItem">
          <div class="testIntroIcon" style="background: #dcfce7;">
            <i class="fa-solid fa-hand" style="color: #16a34a;"></i>
          </div>
          <div class="testIntroText">
            <strong>주의·억제</strong>
            <span>Go/No-Go 반응 훈련</span>
          </div>
        </div>
        <div class="testIntroItem">
          <div class="testIntroIcon" style="background: #ffedd5;">
            <i class="fa-solid fa-list-ol" style="color: #ea580c;"></i>
          </div>
          <div class="testIntroText">
            <strong>작업기억</strong>
            <span>숫자를 순서대로 기억하기</span>
          </div>
        </div>
        <div class="testIntroItem">
          <div class="testIntroIcon" style="background: #fee2e2;">
            <i class="fa-solid fa-grip" style="color: #dc2626;"></i>
          </div>
          <div class="testIntroText">
            <strong>위치기억</strong>
            <span>위치 패턴을 기억하기</span>
          </div>
        </div>
      </div>
      
      <div class="onboardingTip">
        <i class="fa-solid fa-lightbulb"></i>
        <span>4가지 검사로 약 6분 정도 걸려요</span>
      </div>
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot active"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      
      <div class="onboardingBtnRow">
        <button class="secondaryBtn" id="prevBtn">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <button class="primaryBtn" id="nextBtn">
          다음
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </section>
  `;
  
  $("#prevBtn").onclick = () => { playClick(); renderOnboardingStep1(); };
  $("#nextBtn").onclick = () => { playClick(); renderOnboardingStep3(); };
}

// Step 3: 관리란?
function renderOnboardingStep3() {
  document.querySelector(".progress").textContent = "관리 소개";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon small">
        <i class="fa-solid fa-dumbbell"></i>
      </div>
      <h1 class="title">매일 관리란?</h1>
      <p class="desc">
        <b>매일 3분</b>, 두뇌를 훈련해서<br/>
        인지 기능을 유지하고 향상시켜요.
      </p>
      
      <div class="trainingIntroBox">
        <div class="trainingIntroIcon">
          <i class="fa-solid fa-brain"></i>
        </div>
        <div class="trainingIntroContent">
          <strong>숫자 기억 훈련</strong>
          <p>점점 길어지는 숫자를 기억하며<br/>작업 기억력을 강화해요</p>
        </div>
      </div>
      
      <div class="onboardingCompare">
        <div class="compareItem">
          <div class="compareLabel">주간 검사</div>
          <div class="compareDesc">측정 · 주 1회 · 5분</div>
        </div>
        <div class="compareVs">VS</div>
        <div class="compareItem">
          <div class="compareLabel">매일 관리</div>
          <div class="compareDesc">훈련 · 매일 · 3분</div>
        </div>
      </div>
      
      <div class="onboardingTip">
        <i class="fa-solid fa-fire"></i>
        <span>꾸준히 하면 연속 기록이 쌓여요!</span>
      </div>
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot active"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      
      <div class="onboardingBtnRow">
        <button class="secondaryBtn" id="prevBtn">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <button class="primaryBtn" id="nextBtn">
          다음
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </section>
  `;
  
  $("#prevBtn").onclick = () => { playClick(); renderOnboardingStep2(); };
  $("#nextBtn").onclick = () => { playClick(); renderOnboardingStep4(); };
}

// 모바일 감지
function isMobile() {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

// Step 4: 프로필 입력
function renderOnboardingStep4() {
  document.querySelector(".progress").textContent = "프로필 설정";
  
  const today = new Date();
  const thisYear = today.getFullYear();
  const maxBirthYear = thisYear - 19; // 만 19세 이상
  
  // 모바일: 네이티브 date picker, PC: 드롭다운 3개
  const mobile = isMobile();
  
  let birthInputHtml = '';
  if (mobile) {
    const maxDate = new Date(maxBirthYear, today.getMonth(), today.getDate());
    const maxDateStr = maxDate.toISOString().split('T')[0];
    const defaultDate = '1970-01-01';
    birthInputHtml = `
      <input type="date" id="birthDate" class="formInput dateInput" 
        min="1920-01-01" max="${maxDateStr}" value="${defaultDate}">
    `;
  } else {
    // 연도 옵션
    let yearOptions = '<option value="">연도</option>';
    for (let y = maxBirthYear; y >= 1920; y--) {
      yearOptions += `<option value="${y}">${y}년</option>`;
    }
    // 월 옵션
    let monthOptions = '<option value="">월</option>';
    for (let m = 1; m <= 12; m++) {
      monthOptions += `<option value="${m}">${m}월</option>`;
    }
    // 일 옵션
    let dayOptions = '<option value="">일</option>';
    for (let d = 1; d <= 31; d++) {
      dayOptions += `<option value="${d}">${d}일</option>`;
    }
    birthInputHtml = `
      <div class="selectRow">
        <select id="yearSelect" class="formSelect">${yearOptions}</select>
        <select id="monthSelect" class="formSelect">${monthOptions}</select>
        <select id="daySelect" class="formSelect">${dayOptions}</select>
      </div>
    `;
  }
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon small">
        <i class="fa-solid fa-user"></i>
      </div>
      <h1 class="title">간단한 정보를 알려주세요</h1>
      <p class="desc">
        맞춤형 분석을 위해 사용돼요.<br/>
        언제든 설정에서 변경할 수 있어요.
      </p>
      
      <div class="formGroup">
        <label class="formLabel">생년월일</label>
        ${birthInputHtml}
      </div>
      
      <div class="formGroup">
        <label class="formLabel">성별</label>
        <div class="formOptions" id="genderOptions">
          <button class="formOption" data-value="male">남성</button>
          <button class="formOption" data-value="female">여성</button>
        </div>
      </div>
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot active"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      
      <div class="onboardingBtnRow">
        <button class="secondaryBtn" id="prevBtn">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <button class="primaryBtn" id="nextBtn" disabled>
          다음
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
      
      <button class="textBtn" id="skipBtn">나중에 할게요</button>
    </section>
  `;
  
  let selectedGender = null;
  
  const getBirthData = () => {
    if (mobile) {
      const val = $("#birthDate").value;
      if (!val) return null;
      const d = new Date(val);
      return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
    } else {
      const year = parseInt($("#yearSelect").value);
      const month = parseInt($("#monthSelect").value);
      const day = parseInt($("#daySelect").value);
      if (!year || !month || !day) return null;
      return { year, month, day };
    }
  };
  
  const updateNextBtn = () => {
    const birth = getBirthData();
    $("#nextBtn").disabled = !(birth && selectedGender);
  };
  
  // 입력 변경 이벤트
  if (mobile) {
    $("#birthDate").onchange = updateNextBtn;
  } else {
    $("#yearSelect").onchange = updateNextBtn;
    $("#monthSelect").onchange = updateNextBtn;
    $("#daySelect").onchange = updateNextBtn;
  }
  
  // 성별 선택
  document.querySelectorAll('#genderOptions .formOption').forEach(btn => {
    btn.onclick = () => {
      playClick();
      document.querySelectorAll('#genderOptions .formOption').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGender = btn.dataset.value;
      updateNextBtn();
    };
  });
  
  $("#prevBtn").onclick = () => { playClick(); renderOnboardingStep3(); };
  
  $("#nextBtn").onclick = () => {
    const birth = getBirthData();
    
    // 나이 계산
    let age = today.getFullYear() - birth.year;
    const monthDiff = today.getMonth() + 1 - birth.month;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.day)) {
      age--;
    }
    
    // 만 19세 미만 체크
    if (age < 19) {
      showToast('만 19세 이상만 이용할 수 있어요', 'error');
      return;
    }
    
    playClick();
    window._onboardingData = { 
      birthYear: birth.year, 
      birthMonth: birth.month,
      birthDay: birth.day,
      age, 
      gender: selectedGender 
    };
    renderOnboardingStep5();
  };
  
  $("#skipBtn").onclick = () => {
    playClick();
    window._onboardingData = { birthYear: null, birthMonth: null, birthDay: null, age: null, gender: null };
    renderOnboardingStep5();
  };
}

// Step 5: 알림 설정
function renderOnboardingStep5() {
  document.querySelector(".progress").textContent = "알림 설정";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon small">
        <i class="fa-solid fa-bell"></i>
      </div>
      <h1 class="title">리마인더를 설정할까요?</h1>
      <p class="desc">
        매일 같은 시간에 알림을 보내드려요.<br/>
        꾸준한 관리에 도움이 돼요.
      </p>
      
      <div class="reminderOptions">
        <div class="reminderOption selected" data-time="09:00">
          <i class="fa-solid fa-sun"></i>
          <span>아침 9시</span>
        </div>
        <div class="reminderOption" data-time="14:00">
          <i class="fa-solid fa-cloud-sun"></i>
          <span>오후 2시</span>
        </div>
        <div class="reminderOption" data-time="20:00">
          <i class="fa-solid fa-moon"></i>
          <span>저녁 8시</span>
        </div>
        <div class="reminderOption" data-time="none">
          <i class="fa-solid fa-bell-slash"></i>
          <span>알림 안 받기</span>
        </div>
      </div>
      
      <div class="notice" style="margin-top: 12px; font-size: 13px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        알림 기능은 추후 업데이트 예정이에요.
      </div>
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot active"></span>
        <span class="dot"></span>
      </div>
      
      <div class="onboardingBtnRow">
        <button class="secondaryBtn" id="prevBtn">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <button class="primaryBtn" id="nextBtn">
          다음
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    </section>
  `;
  
  let selectedTime = '09:00';
  
  document.querySelectorAll('.reminderOption').forEach(opt => {
    opt.onclick = () => {
      playClick();
      document.querySelectorAll('.reminderOption').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedTime = opt.dataset.time;
    };
  });
  
  $("#prevBtn").onclick = () => { playClick(); renderOnboardingStep4(); };
  
  $("#nextBtn").onclick = () => {
    playClick();
    
    // 프로필 저장
    const data = window._onboardingData || {};
    const profile = {
      birthYear: data.birthYear,
      birthMonth: data.birthMonth,
      birthDay: data.birthDay,
      age: data.age,
      gender: data.gender,
      reminderTime: selectedTime,
      onboardingComplete: true,
      createdAt: Date.now()
    };
    saveUserProfile(profile);
    
    // 첫 검사 유도 화면
    renderOnboardingStep6();
  };
}

// Step 6: 첫 검사 유도
function renderOnboardingStep6() {
  document.querySelector(".progress").textContent = "준비 완료";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon success">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h1 class="title">준비가 완료됐어요!</h1>
      <p class="desc">
        지금 바로 첫 검사를 해볼까요?<br/>
        내 두뇌 상태를 확인해보세요.
      </p>
      
      <div class="firstTestBox">
        <div class="firstTestIcon">
          <i class="fa-solid fa-play-circle"></i>
        </div>
        <div class="firstTestContent">
          <strong>첫 주간 검사 시작하기</strong>
          <p>4가지 검사 · 약 6분 소요</p>
        </div>
      </div>
      
      <div class="onboardingTip">
        <i class="fa-solid fa-gift"></i>
        <span>14일 무료로 모든 기능을 체험하세요</span>
      </div>
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot active"></span>
      </div>
      
      <button class="primaryBtn" id="startTestBtn">
        <i class="fa-solid fa-clipboard-check"></i>
        첫 검사 시작하기
      </button>
      
      <button class="textBtn" id="goHomeBtn">홈에서 둘러볼게요</button>
    </section>
  `;
  
  $("#startTestBtn").onclick = async () => {
    playClick();
    // 검사 인트로 화면으로 이동
    const { startPatternTest } = await import('../tests/pattern.js');
    startPatternTest();
  };
  
  $("#goHomeBtn").onclick = () => { playClick(); renderHome(); };
}
