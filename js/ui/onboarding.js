// ui/onboarding.js
import { $ } from '../core/utils.js';
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
      </div>
      
      <button class="primaryBtn" id="nextBtn">
        시작하기
        <i class="fa-solid fa-arrow-right"></i>
      </button>
    </section>
  `;
  
  $("#nextBtn").onclick = () => { playClick(); renderOnboardingStep2(); };
}

// 모바일 감지
function isMobile() {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

// Step 2: 프로필 입력
function renderOnboardingStep2() {
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
    birthInputHtml = `
      <input type="date" id="birthDate" class="formInput dateInput" 
        min="1920-01-01" max="${maxDateStr}">
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
        <span class="dot active"></span>
        <span class="dot"></span>
      </div>
      
      <button class="primaryBtn" id="nextBtn" disabled>
        다음
        <i class="fa-solid fa-arrow-right"></i>
      </button>
      
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
      alert('본 서비스는 만 19세 이상 성인을 대상으로 합니다.');
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
    renderOnboardingStep3();
  };
  
  $("#skipBtn").onclick = () => {
    playClick();
    window._onboardingData = { birthYear: null, birthMonth: null, birthDay: null, age: null, gender: null };
    renderOnboardingStep3();
  };
}

// Step 3: 알림 설정
function renderOnboardingStep3() {
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
      
      <div class="onboardingProgress">
        <span class="dot done"></span>
        <span class="dot done"></span>
        <span class="dot active"></span>
      </div>
      
      <button class="primaryBtn" id="completeBtn">
        <i class="fa-solid fa-check"></i>
        완료
      </button>
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
  
  $("#completeBtn").onclick = () => {
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
    
    // 완료 화면
    renderOnboardingComplete();
  };
}

// 완료 화면
function renderOnboardingComplete() {
  document.querySelector(".progress").textContent = "준비 완료";
  
  app.innerHTML = `
    <section class="card onboardingCard">
      <div class="onboardingIcon success">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h1 class="title">준비가 완료됐어요!</h1>
      <p class="desc">
        지금 바로 첫 두뇌 관리를<br/>
        시작해보세요.
      </p>
      
      <div class="onboardingTip">
        <i class="fa-solid fa-lightbulb"></i>
        <span>14일 무료로 체험할 수 있어요</span>
      </div>
      
      <button class="primaryBtn" id="startBtn">
        <i class="fa-solid fa-home"></i>
        홈으로 가기
      </button>
    </section>
  `;
  
  $("#startBtn").onclick = () => { playClick(); renderHome(); };
}
