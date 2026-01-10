// ui/intro.js
import { $, showAlertModal } from '../core/utils.js';
import { state } from '../core/state.js';
import { LS_KEYS, loadHistory, getUserProfile, saveUserProfile } from '../core/storage.js';
import { startPatternTest } from '../tests/pattern.js';
import { playClick } from '../core/sound.js';

// renderHome은 순환참조 방지를 위해 동적 import 사용
let renderHome = null;
async function getHome() {
  if (!renderHome) {
    const module = await import('./home.js');
    renderHome = module.renderHome;
  }
  return renderHome;
}

// renderHistory도 동적 import
let renderHistory = null;
async function getHistory() {
  if (!renderHistory) {
    const module = await import('./history.js');
    renderHistory = module.renderHistory;
  }
  return renderHistory;
}

const app = $("#app");

export function renderMainIntro() {
  state.currentTest = null;
  state.phase = "intro";
  document.querySelector(".progress").textContent = "검사 -/4 · 인지기능";

  const profile = getUserProfile();
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const hasHistory = patternHist.length > 0;
  const lastRecord = hasHistory ? patternHist[patternHist.length - 1] : null;
  const lastDate = lastRecord ? new Date(lastRecord.ended_at).toLocaleDateString() : null;

  let profileSection = '';
  if (profile && profile.birthYear && profile.birthMonth) {
    profileSection = `
      <div class="notice" style="margin-top:10px;">
        <b>내 정보</b>: ${profile.birthYear}년 ${profile.birthMonth}월생 (${profile.age}) · ${profile.gender === 'male' ? '남성' : '여성'}
        <button class="linkBtn" id="editProfile" style="margin-left:8px;">수정</button>
      </div>
    `;
  } else if (profile && profile.age) {
    // 온보딩으로 연령대만 입력한 경우
    profileSection = `
      <div class="notice" style="margin-top:10px;">
        <b>내 정보</b>: ${profile.age} ${profile.gender === 'male' ? '남성' : profile.gender === 'female' ? '여성' : ''}
      </div>
    `;
  }

  let historySection = '';
  if (hasHistory) {
    historySection = `
      <div class="notice" style="margin-top:10px;">
        <b>이전 기록</b><br/>
        마지막 검사: ${lastDate} (총 ${patternHist.length}회)<br/>
        <button class="linkBtn" id="viewLastResult">이전 결과 보기 →</button>
      </div>
    `;
  }

  app.innerHTML = `
    <section class="card">
      <div class="pill">브레인 업</div>
      <h1 class="title">인지기능 검사</h1>
      <p class="desc">
        4가지 검사를 통해 <b>처리속도</b>, <b>주의력</b>, <b>기억력</b>, <b>공간지각</b>을 측정합니다.<br/>
        총 소요시간은 약 <b>6~8분</b>입니다.
      </p>
      <div class="notice">
        <b>검사 구성</b><br/>
        1. 패턴 비교 (처리속도)<br/>
        2. Go/No-Go (주의·억제)<br/>
        3. 숫자 기억 (작업기억)<br/>
        4. 위치 기억 (공간기억)
      </div>
      <div class="notice" style="margin-top:10px;">
        🔊 사운드를 켜주세요<br/>
        권장: <b>PC</b> 사용 · <b>전체화면</b> · 방해받지 않는 환경
      </div>
      ${profileSection}
      ${historySection}
      <div class="controls" style="grid-template-columns:1fr;margin-top:14px;">
        <button class="big" id="startAll">검사 시작하기</button>
      </div>
    </section>
  `;

  $("#startAll").onclick = () => {
    playClick();
    const profile = getUserProfile();
    if (!profile) {
      renderProfileInput();
    } else {
      startPatternTest();
    }
  };
  
  if (profile && profile.birthYear && profile.birthMonth) {
    $("#editProfile").onclick = () => {
      playClick();
      renderProfileInput();
    };
  }
  
  if (hasHistory) {
    $("#viewLastResult").onclick = async () => {
      playClick();
      const history = await getHistory();
      history();
    };
  }
}

export function renderProfileInput() {
  document.querySelector(".progress").textContent = "검사 -/4 · 정보 입력";
  
  const profile = getUserProfile();
  const currentGender = profile?.gender || '';
  const today = new Date();
  const thisYear = today.getFullYear();
  const maxBirthYear = thisYear - 19;
  
  // 모바일 감지
  const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
  
  let birthInputHtml = '';
  if (mobile) {
    let currentDateValue = '';
    if (profile?.birthYear && profile?.birthMonth && profile?.birthDay) {
      currentDateValue = `${profile.birthYear}-${String(profile.birthMonth).padStart(2,'0')}-${String(profile.birthDay).padStart(2,'0')}`;
    }
    const maxDate = new Date(maxBirthYear, today.getMonth(), today.getDate());
    const maxDateStr = maxDate.toISOString().split('T')[0];
    birthInputHtml = `
      <input type="date" id="birthDate" class="formInput dateInput" 
        value="${currentDateValue}" min="1920-01-01" max="${maxDateStr}">
    `;
  } else {
    // 연도 옵션
    let yearOptions = '<option value="">연도</option>';
    for (let y = maxBirthYear; y >= 1920; y--) {
      const selected = profile?.birthYear === y ? 'selected' : '';
      yearOptions += `<option value="${y}" ${selected}>${y}년</option>`;
    }
    // 월 옵션
    let monthOptions = '<option value="">월</option>';
    for (let m = 1; m <= 12; m++) {
      const selected = profile?.birthMonth === m ? 'selected' : '';
      monthOptions += `<option value="${m}" ${selected}>${m}월</option>`;
    }
    // 일 옵션
    let dayOptions = '<option value="">일</option>';
    for (let d = 1; d <= 31; d++) {
      const selected = profile?.birthDay === d ? 'selected' : '';
      dayOptions += `<option value="${d}" ${selected}>${d}일</option>`;
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
    <section class="card">
      <div class="pill">시작 전 정보</div>
      <h1 class="title">기본 정보 입력</h1>
      <p class="desc">
        정확한 결과 분석을 위해 간단한 정보를 입력해주세요.<br/>
        입력하신 정보는 기기에만 저장되며 외부로 전송되지 않습니다.
      </p>
      
      <div class="formGroup">
        <label class="formLabel">생년월일</label>
        ${birthInputHtml}
      </div>
      
      <div class="formGroup">
        <label class="formLabel">성별</label>
        <div class="radioGroup">
          <label class="radioLabel">
            <input type="radio" name="gender" value="male" ${currentGender === 'male' ? 'checked' : ''}>
            <span class="radioText">남성</span>
          </label>
          <label class="radioLabel">
            <input type="radio" name="gender" value="female" ${currentGender === 'female' ? 'checked' : ''}>
            <span class="radioText">여성</span>
          </label>
        </div>
      </div>
      
      <div class="controls" style="margin-top:20px;">
        <button class="big" id="backBtn">뒤로</button>
        <button class="big" id="saveProfile">저장 후 시작</button>
      </div>
    </section>
  `;

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

  $("#backBtn").onclick = () => {
    playClick();
    renderMainIntro();
  };

  $("#saveProfile").onclick = () => {
    const birth = getBirthData();
    const genderInput = document.querySelector('input[name="gender"]:checked');
    const gender = genderInput?.value;

    if (!birth) {
      showAlertModal({
        title: '입력 필요',
        message: '생년월일을 입력해주세요.',
        type: 'warning'
      });
      return;
    }
    if (!gender) {
      showAlertModal({
        title: '입력 필요',
        message: '성별을 선택해주세요.',
        type: 'warning'
      });
      return;
    }

    // 나이 계산
    let age = today.getFullYear() - birth.year;
    const monthDiff = today.getMonth() + 1 - birth.month;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.day)) {
      age--;
    }

    // 만 19세 미만 체크
    if (age < 19) {
      showAlertModal({
        title: '이용 제한',
        message: '본 검사는 만 19세 이상 성인을 대상으로 합니다.',
        type: 'warning'
      });
      return;
    }

    playClick();
    saveUserProfile({ 
      birthYear: birth.year, 
      birthMonth: birth.month, 
      birthDay: birth.day, 
      age, 
      gender, 
      updatedAt: Date.now() 
    });
    startPatternTest();
  };
}
