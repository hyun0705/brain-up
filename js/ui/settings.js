// ui/settings.js
import { $, showToast, showConfirmModal } from '../core/utils.js';
import { getUserProfile, saveUserProfile, getTrialDaysLeft, isSubscribedSync, LS_KEYS } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';
import { renderUpgradePrompt } from './calendar.js';
import { createGuardianUrl } from '../core/guardian.js';
import { isLoggedIn, logout, renderLogin, unlinkKakao } from './auth.js';
import { getUserName, updateUserName, getUserBirthDate, getUserGender, updateUserProfile, deleteAccount } from '../core/api.js';

const app = $("#app");
const API_URL = 'https://brainup-api.stardog0705.workers.dev';

// 다크모드 초기화
export function initTheme() {
  const savedTheme = localStorage.getItem('brainup_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

// 다크모드 토글
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('brainup_theme', next);
  return next;
}

// 현재 테마 가져오기
function getCurrentTheme() {
  return localStorage.getItem('brainup_theme') || 'light';
}

// 앱 버전 로드
async function loadAppVersion() {
  try {
    const res = await fetch(`${API_URL}/api/app-version`);
    const data = await res.json();
    const versionEl = document.getElementById('appVersionValue');
    if (versionEl) {
      versionEl.textContent = data.version || '1.0.0';
    }
  } catch (e) {
    const versionEl = document.getElementById('appVersionValue');
    if (versionEl) {
      versionEl.textContent = '1.0.0';
    }
  }
}

// 문의하기 화면
function renderInquiry() {
  document.querySelector(".progress").textContent = "문의하기";
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">문의하기</h1>
      <p class="desc" style="margin-bottom:20px;">겁금한 점이나 개선 요청사항을 남겨주세요.</p>
      
      <div class="formGroup">
        <label class="formLabel">문의 유형</label>
        <select id="inquiryType" class="formSelect" style="width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:15px;">
          <option value="bug">오류/버그 신고</option>
          <option value="feature">기능 요청</option>
          <option value="payment">결제 문의</option>
          <option value="account">계정 문제</option>
          <option value="other">기타</option>
        </select>
      </div>
      
      <div class="formGroup" style="margin-top:16px;">
        <label class="formLabel">내용</label>
        <textarea id="inquiryContent" class="formInput" style="height:150px;resize:none;" placeholder="문의 내용을 작성해주세요..."></textarea>
      </div>
      
      <div class="formGroup" style="margin-top:16px;">
        <label class="formLabel">연락처 (선택)</label>
        <input type="text" id="inquiryContact" class="formInput" placeholder="이메일 또는 연락처" />
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="submitInquiry">문의 접수</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backSettings">취소</button>
      </div>
    </section>
  `;
  
  $("#submitInquiry").onclick = async () => {
    const type = $("#inquiryType").value;
    const content = $("#inquiryContent").value.trim();
    const contact = $("#inquiryContact").value.trim();
    
    if (!content) {
      showToast('문의 내용을 입력해주세요', 'error');
      return;
    }
    
    playClick();
    
    try {
      const btn = $("#submitInquiry");
      btn.disabled = true;
      btn.textContent = '접수 중...';
      
      const res = await fetch(`${API_URL}/api/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, contact })
      });
      
      const data = await res.json();
      
      if (data.success) {
        showToast('문의가 접수되었어요', 'success');
        setTimeout(() => renderSettings(), 500);
      } else {
        showToast('접수 실패: ' + (data.error || '알 수 없는 오류'), 'error');
        btn.disabled = false;
        btn.textContent = '문의 접수';
      }
    } catch (e) {
      showToast('오류: ' + e.message, 'error');
      $("#submitInquiry").disabled = false;
      $("#submitInquiry").textContent = '문의 접수';
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 생년월일 포맷 (YYYY-MM-DD -> YYYY년 M월 D일)
function formatBirthDate(dateStr) {
  if (!dateStr) return '미설정';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parts[0];
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${y}년 ${m}월 ${d}일`;
}

export function renderSettings() {
  document.querySelector(".progress").textContent = "설정";
  
  const profile = getUserProfile() || {};
  const trialDaysLeft = getTrialDaysLeft();
  const subscribed = isSubscribedSync();
  const loggedIn = isLoggedIn();
  
  // 생년월일 텍스트 (로그인 상태면 서버 데이터, 아니면 로컬)
  let birthDateText = '미설정';
  if (loggedIn) {
    const serverBirthDate = getUserBirthDate();
    if (serverBirthDate) {
      birthDateText = formatBirthDate(serverBirthDate);
    }
  } else if (profile.birthYear && profile.birthMonth && profile.birthDay) {
    // 온보딩에서 입력한 생년월일 사용
    const y = profile.birthYear;
    const m = String(profile.birthMonth).padStart(2, '0');
    const d = String(profile.birthDay).padStart(2, '0');
    birthDateText = formatBirthDate(`${y}-${m}-${d}`);
  }
  
  // 성별 텍스트 (로그인 상태면 서버 데이터, 아니면 로컬)
  let genderText = '미설정';
  if (loggedIn) {
    const serverGender = getUserGender();
    genderText = { 'male': '남성', 'female': '여성' }[serverGender] || '미설정';
  } else {
    genderText = { 'male': '남성', 'female': '여성' }[profile.gender] || '미설정';
  }
  
  // 알림 시간 텍스트
  const reminderText = {
    '09:00': '아침 9시',
    '14:00': '오후 2시',
    '20:00': '저녁 8시',
    'none': '알림 안 받음'
  }[profile.reminderTime] || '미설정';
  
  // 구독 상태 텍스트
  let subscriptionStatus = '';
  if (!loggedIn) {
    // 비로그인: 회원가입 유도
    subscriptionStatus = `
      <div class="settingValue">
        <span class="subscriptionBadge trial">회원가입하고 14일 무료체험</span>
      </div>
    `;
  } else if (subscribed) {
    subscriptionStatus = `
      <div class="settingValue">
        <span class="subscriptionBadge active">구독 중</span>
      </div>
    `;
  } else if (trialDaysLeft > 0) {
    subscriptionStatus = `
      <div class="settingValue">
        <span class="subscriptionBadge trial">무료체험 ${trialDaysLeft}일 남음</span>
      </div>
    `;
  } else {
    subscriptionStatus = `
      <div class="settingValue">
        <span class="subscriptionBadge expired">체험 종료</span>
      </div>
    `;
  }
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">설정</h1>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">자녀 공유</div>
        
        <div class="settingItem highlight" id="shareToChild">
          <div class="settingLabel">
            <i class="fa-solid fa-share-nodes"></i>
            <span>자녀에게 공유하기</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        <p class="settingHint">자녀가 관리 상태를 확인할 수 있는 링크를 생성합니다</p>
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">구독</div>
        
        <div class="settingItem" id="subscriptionSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-crown"></i>
            <span>구독 상태</span>
          </div>
          ${subscriptionStatus}
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">프로필</div>
        
        ${isLoggedIn() ? `
        <div class="settingItem" id="nameSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-signature"></i>
            <span>이름</span>
          </div>
          <div class="settingValue">${getUserName() || '미설정'}</div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        ` : ''}
        
        <div class="settingItem" id="birthDateSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-cake-candles"></i>
            <span>생년월일</span>
          </div>
          <div class="settingValue">${birthDateText}</div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        
        <div class="settingItem" id="genderSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-venus-mars"></i>
            <span>성별</span>
          </div>
          <div class="settingValue">${genderText}</div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">알림</div>
        
        <div class="settingItem" id="reminderSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-bell"></i>
            <span>리마인더</span>
          </div>
          <div class="settingValue">${reminderText}</div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">화면</div>
        
        <div class="settingItem" id="themeSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-${getCurrentTheme() === 'dark' ? 'moon' : 'sun'}"></i>
            <span>다크 모드</span>
          </div>
          <div class="themeToggle ${getCurrentTheme() === 'dark' ? 'active' : ''}" id="themeToggle">
            <div class="themeToggleKnob"></div>
          </div>
        </div>
      </div>
      
      ${!isLoggedIn() ? `
      <div class="settingsSection">
        <div class="settingsSectionTitle">데이터</div>
        
        <div class="settingItem danger" id="clearData">
          <div class="settingLabel">
            <i class="fa-solid fa-trash"></i>
            <span>모든 데이터 삭제</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
      </div>
      ` : ''}
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">계정</div>
        
        ${isLoggedIn() ? `
        <div class="settingItem" id="logoutBtn">
          <div class="settingLabel">
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>로그아웃</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        <div class="settingItem danger" id="deleteAccountBtn">
          <div class="settingLabel">
            <i class="fa-solid fa-user-xmark"></i>
            <span>탈퇴하기</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        ` : `
        <div class="settingItem" id="loginBtn">
          <div class="settingLabel">
            <i class="fa-solid fa-right-to-bracket"></i>
            <span>로그인 / 회원가입</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        `}
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">정보</div>
        
        <div class="settingItem" id="inquirySetting">
          <div class="settingLabel">
            <i class="fa-solid fa-envelope"></i>
            <span>문의하기</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        
        <div class="settingItem" id="appVersion">
          <div class="settingLabel">
            <i class="fa-solid fa-info-circle"></i>
            <span>앱 버전</span>
          </div>
          <div class="settingValue" id="appVersionValue">로딩...</div>
        </div>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  $("#shareToChild").onclick = () => { playClick(); renderShareToChild(); };
  $("#subscriptionSetting").onclick = () => { playClick(); renderUpgradePrompt(); };
  if (isLoggedIn() && $("#nameSetting")) {
    $("#nameSetting").onclick = () => { playClick(); renderNameSettings(); };
  }
  // 생년월일, 성별 설정
  if (loggedIn) {
    $("#birthDateSetting").onclick = () => { playClick(); renderBirthDateSettings(); };
    $("#genderSetting").onclick = () => { playClick(); renderGenderSettingsLoggedIn(); };
  } else {
    $("#birthDateSetting").onclick = () => { playClick(); renderAgeSettings(); };
    $("#genderSetting").onclick = () => { playClick(); renderGenderSettings(); };
  }
  $("#reminderSetting").onclick = () => { playClick(); renderReminderSettings(); };
  
  // 다크모드 토글
  $("#themeSetting").onclick = () => {
    playClick();
    const newTheme = toggleTheme();
    $("#themeToggle").classList.toggle('active', newTheme === 'dark');
    $("#themeSetting .fa-solid").className = `fa-solid fa-${newTheme === 'dark' ? 'moon' : 'sun'}`;
  };
  
  // 비로그인일 때만 데이터 삭제
  if (!isLoggedIn() && $("#clearData")) {
    $("#clearData").onclick = () => { playClick(); confirmClearData(); };
  }
  
  // 로그인/로그아웃
  if (isLoggedIn()) {
    $("#logoutBtn").onclick = async () => {
      playClick();
      const confirmed = await showConfirmModal({
        title: '로그아웃 할까요?',
        message: '다시 로그인하면 데이터를<br/>이어서 사용할 수 있어요',
        confirmText: '로그아웃',
        cancelText: '취소'
      });
      if (confirmed) {
        await logout();
        showToast('로그아웃 되었어요', 'success');
        setTimeout(() => renderHome(), 500);
      }
    };
    
    $("#deleteAccountBtn").onclick = () => {
      playClick();
      confirmDeleteAccount();
    };
  } else {
    $("#loginBtn").onclick = () => { playClick(); renderLogin(); };
  }
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
  
  // 문의하기
  $("#inquirySetting").onclick = () => { playClick(); renderInquiry(); };
  
  // 앱 버전 로드
  loadAppVersion();
}

// 자녀 공유 화면
function renderShareToChild() {
  document.querySelector(".progress").textContent = "자녀에게 공유";
  
  app.innerHTML = `
    <section class="card">
      <div class="shareIcon">
        <i class="fa-solid fa-people-arrows"></i>
      </div>
      <h1 class="title">자녀에게 공유하기</h1>
      <p class="desc">
        아래 버튼을 누르면 자녀가 볼 수 있는<br/>
        <b>읽기 전용 링크</b>가 생성됩니다.
      </p>
      
      <div class="shareInfoBox">
        <div class="shareInfoItem">
          <i class="fa-solid fa-eye"></i>
          <span>자녀가 볼 수 있는 정보</span>
        </div>
        <ul class="shareInfoList">
          <li>오늘 관리 완료 여부</li>
          <li>이번 주 관리 횟수</li>
          <li>연속 관리 일수</li>
        </ul>
        <div class="shareInfoItem" style="margin-top:12px;">
          <i class="fa-solid fa-eye-slash"></i>
          <span>자녀가 볼 수 없는 정보</span>
        </div>
        <ul class="shareInfoList muted">
          <li>검사 점수/결과</li>
          <li>상세 기록</li>
          <li>설정 변경</li>
        </ul>
      </div>
      
      <button class="primaryBtn" id="createShareLink" style="margin-top:20px;">
        <i class="fa-solid fa-link"></i>
        공유 링크 생성하기
      </button>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:16px;">
        <button class="big ghost" id="backSettings">뒤로</button>
      </div>
    </section>
  `;
  
  $("#createShareLink").onclick = async () => {
    playClick();
    
    // 로그인 확인
    if (!isLoggedIn()) {
      showToast('로그인이 필요해요', 'error');
      renderLogin();
      return;
    }
    
    try {
      // 버튼 비활성화 및 로딩 표시
      const btn = $("#createShareLink");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 생성 중...';
      
      const url = await createGuardianUrl();
      
      try {
        await navigator.clipboard.writeText(url);
        showToast('공유 링크가 생성되었어요', 'success');
        showShareSuccess(url);
      } catch (err) {
        showToast('공유 링크가 생성되었어요', 'success');
        showShareManual(url);
      }
    } catch (e) {
      showToast('공유 링크 생성 실패', 'error');
      const btn = $("#createShareLink");
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-link"></i> 공유 링크 생성하기';
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 공유 성공 화면
function showShareSuccess(url) {
  app.innerHTML = `
    <section class="card">
      <div class="shareIcon success">
        <i class="fa-solid fa-check"></i>
      </div>
      <h1 class="title">링크가 복사되었어요!</h1>
      <p class="desc">
        카카오톡이나 문자로<br/>
        자녀에게 보내주세요.
      </p>
      
      <div class="shareLinkBox">
        <code id="shareUrlDisplay">${url}</code>
        <button class="copyBtn" id="copyAgain">
          <i class="fa-solid fa-copy"></i>
        </button>
      </div>
      
      <div class="notice" style="margin-top:16px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        이 링크로는 관리 상태만 확인할 수 있어요.<br/>
        검사나 설정 변경은 불가능합니다.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big" id="backSettings">완료</button>
      </div>
    </section>
  `;
  
  $("#copyAgain").onclick = async () => {
    playClick();
    try {
      await navigator.clipboard.writeText(url);
      $("#copyAgain").innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        $("#copyAgain").innerHTML = '<i class="fa-solid fa-copy"></i>';
      }, 1500);
    } catch (err) {
      showToast('복사에 실패했어요', 'error');
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 수동 복사 화면 (클립보드 API 실패 시)
function showShareManual(url) {
  app.innerHTML = `
    <section class="card">
      <div class="shareIcon">
        <i class="fa-solid fa-link"></i>
      </div>
      <h1 class="title">공유 링크가 생성되었어요</h1>
      <p class="desc">
        아래 링크를 복사해서<br/>
        자녀에게 보내주세요.
      </p>
      
      <div class="shareLinkBox manual">
        <input type="text" id="shareUrlInput" value="${url}" readonly />
        <button class="copyBtn" id="selectAll">전체 선택</button>
      </div>
      
      <div class="notice" style="margin-top:16px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        링크를 길게 눌러서 복사하거나,<br/>
        '전체 선택' 후 복사해주세요.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big" id="backSettings">완료</button>
      </div>
    </section>
  `;
  
  $("#selectAll").onclick = () => {
    playClick();
    const input = $("#shareUrlInput");
    input.select();
    input.setSelectionRange(0, 99999);
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 이름 설정
function renderNameSettings() {
  const currentName = getUserName();
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">이름 설정</h1>
      <p class="desc" style="margin-bottom:20px;">홈 화면에서 표시될 이름이에요.</p>
      
      <div class="formGroup">
        <label class="formLabel">이름</label>
        <input type="text" id="nameInput" class="formInput" placeholder="이름 입력" value="${currentName}">
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="saveName">저장</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backSettings">취소</button>
      </div>
    </section>
  `;
  
  $("#saveName").onclick = async () => {
    const newName = $("#nameInput").value.trim();
    if (!newName) {
      showToast('이름을 입력해주세요', 'error');
      return;
    }
    
    playClick();
    try {
      await updateUserName(newName);
      showToast('이름이 변경되었어요', 'success');
      setTimeout(() => renderSettings(), 500);
    } catch (e) {
      showToast('변경 실패: ' + e.message, 'error');
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 비로그인 사용자용 생년월일 설정
function renderAgeSettings() {
  const profile = getUserProfile() || {};
  
  const currentYear = profile.birthYear || '';
  const currentMonth = profile.birthMonth ? String(profile.birthMonth).padStart(2, '0') : '';
  const currentDay = profile.birthDay ? String(profile.birthDay).padStart(2, '0') : '';
  
  // 연도 옵션 (1930~2010)
  const yearOptions = ['<option value="">연도</option>'];
  for (let y = 2010; y >= 1930; y--) {
    yearOptions.push(`<option value="${y}" ${currentYear == y ? 'selected' : ''}>${y}</option>`);
  }
  
  // 월 옵션
  const monthOptions = ['<option value="">월</option>'];
  for (let m = 1; m <= 12; m++) {
    const mv = String(m).padStart(2, '0');
    monthOptions.push(`<option value="${mv}" ${currentMonth == mv ? 'selected' : ''}>${m}</option>`);
  }
  
  // 일 옵션
  const dayOptions = ['<option value="">일</option>'];
  for (let d = 1; d <= 31; d++) {
    const dv = String(d).padStart(2, '0');
    dayOptions.push(`<option value="${dv}" ${currentDay == dv ? 'selected' : ''}>${d}</option>`);
  }
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">생년월일 설정</h1>
      <p class="desc" style="margin-bottom:20px;">연령대별 분석에 사용됩니다.</p>
      
      <div class="formGroup">
        <label class="formLabel">생년월일</label>
        <div class="selectRow">
          <select id="birthYear" class="formSelect">${yearOptions.join('')}</select>
          <select id="birthMonth" class="formSelect">${monthOptions.join('')}</select>
          <select id="birthDay" class="formSelect">${dayOptions.join('')}</select>
        </div>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="saveBirthDate">저장</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backSettings">취소</button>
      </div>
    </section>
  `;
  
  $("#saveBirthDate").onclick = () => {
    const year = $("#birthYear").value;
    const month = $("#birthMonth").value;
    const day = $("#birthDay").value;
    
    if (!year || !month || !day) {
      showToast('생년월일을 모두 선택해주세요', 'error');
      return;
    }
    
    playClick();
    
    // 나이 계산
    const today = new Date();
    let age = today.getFullYear() - parseInt(year);
    const monthDiff = today.getMonth() + 1 - parseInt(month);
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parseInt(day))) {
      age--;
    }
    
    const newProfile = { 
      ...profile, 
      birthYear: parseInt(year),
      birthMonth: parseInt(month),
      birthDay: parseInt(day),
      age: age
    };
    saveUserProfile(newProfile);
    
    showToast('생년월일이 변경되었어요', 'success');
    setTimeout(() => renderSettings(), 500);
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 성별 설정
function renderGenderSettings() {
  const profile = getUserProfile() || {};
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">성별 설정</h1>
      
      <div class="formOptions">
        <button class="formOption ${profile.gender === 'male' ? 'selected' : ''}" data-value="male">남성</button>
        <button class="formOption ${profile.gender === 'female' ? 'selected' : ''}" data-value="female">여성</button>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="backSettings">저장</button>
      </div>
    </section>
  `;
  
  document.querySelectorAll('.formOption').forEach(btn => {
    btn.onclick = () => {
      playClick();
      document.querySelectorAll('.formOption').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      const newProfile = { ...profile, gender: btn.dataset.value };
      saveUserProfile(newProfile);
    };
  });
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 알림 설정
function renderReminderSettings() {
  const profile = getUserProfile() || {};
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">리마인더 설정</h1>
      <p class="desc" style="margin-bottom:20px;">매일 같은 시간에 알림을 보내드려요.</p>
      
      <div class="reminderOptions vertical">
        <div class="reminderOption ${profile.reminderTime === '09:00' ? 'selected' : ''}" data-time="09:00">
          <i class="fa-solid fa-sun"></i>
          <span>아침 9시</span>
        </div>
        <div class="reminderOption ${profile.reminderTime === '14:00' ? 'selected' : ''}" data-time="14:00">
          <i class="fa-solid fa-cloud-sun"></i>
          <span>오후 2시</span>
        </div>
        <div class="reminderOption ${profile.reminderTime === '20:00' ? 'selected' : ''}" data-time="20:00">
          <i class="fa-solid fa-moon"></i>
          <span>저녁 8시</span>
        </div>
        <div class="reminderOption ${profile.reminderTime === 'none' ? 'selected' : ''}" data-time="none">
          <i class="fa-solid fa-bell-slash"></i>
          <span>알림 안 받기</span>
        </div>
      </div>
      
      <div class="notice" style="margin-top:16px;">
        <i class="fa-solid fa-info-circle" style="color:var(--accent);"></i>
        실제 푸시 알림은 추후 업데이트 예정이에요.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="backSettings">저장</button>
      </div>
    </section>
  `;
  
  document.querySelectorAll('.reminderOption').forEach(opt => {
    opt.onclick = () => {
      playClick();
      document.querySelectorAll('.reminderOption').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      
      const newProfile = { ...profile, reminderTime: opt.dataset.time };
      saveUserProfile(newProfile);
    };
  });
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 데이터 내보내기
function exportAllData() {
  const data = {};
  Object.values(LS_KEYS).forEach(key => {
    const value = localStorage.getItem(key);
    if (value) data[key] = JSON.parse(value);
  });
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brainup_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('데이터가 다운로드되었어요', 'success');
}

// 데이터 삭제 확인
async function confirmClearData() {
  const confirmed = await showConfirmModal({
    title: '모든 데이터를 삭제할까요?',
    message: '검사 기록, 관리 기록, 설정 등<br/>모든 데이터가 삭제되며<br/>이 작업은 되돌릴 수 없어요',
    confirmText: '삭제',
    cancelText: '취소',
    danger: true
  });
  
  if (confirmed) {
    Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
    showToast('모든 데이터가 삭제되었어요', 'success');
    setTimeout(() => location.reload(), 500);
  }
}

// 회원 탈퇴 확인
async function confirmDeleteAccount() {
  const confirmed = await showConfirmModal({
    title: '정말 탈퇴하시겠어요?',
    message: '모든 계정 정보와 검사/관리 기록이<br/>삭제되며 되돌릴 수 없어요',
    confirmText: '탈퇴하기',
    cancelText: '취소',
    danger: true
  });
  
  if (confirmed) {
    try {
      // 카카오 연결 끊기 시도
      await unlinkKakao();
      // 서버 탈퇴
      await deleteAccount();
      // 로컬 데이터도 삭제
      Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
      showToast('탈퇴가 완료되었어요', 'success');
      setTimeout(() => location.reload(), 500);
    } catch (e) {
      showToast('탈퇴 실패: ' + e.message, 'error');
    }
  }
}

// 로그인 사용자용 생년월일 설정
function renderBirthDateSettings() {
  const currentBirthDate = getUserBirthDate();
  let currentYear = '';
  let currentMonth = '';
  let currentDay = '';
  
  if (currentBirthDate) {
    const parts = currentBirthDate.split('-');
    if (parts.length === 3) {
      currentYear = parts[0];
      currentMonth = parts[1];
      currentDay = parts[2];
    }
  }
  
  // 연도 옵션 (1930~2010)
  const yearOptions = ['<option value="">연도</option>'];
  for (let y = 2010; y >= 1930; y--) {
    yearOptions.push(`<option value="${y}" ${currentYear == y ? 'selected' : ''}>${y}</option>`);
  }
  
  // 월 옵션
  const monthOptions = ['<option value="">월</option>'];
  for (let m = 1; m <= 12; m++) {
    const mv = String(m).padStart(2, '0');
    monthOptions.push(`<option value="${mv}" ${currentMonth == mv ? 'selected' : ''}>${m}</option>`);
  }
  
  // 일 옵션
  const dayOptions = ['<option value="">일</option>'];
  for (let d = 1; d <= 31; d++) {
    const dv = String(d).padStart(2, '0');
    dayOptions.push(`<option value="${dv}" ${currentDay == dv ? 'selected' : ''}>${d}</option>`);
  }
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">생년월일 설정</h1>
      <p class="desc" style="margin-bottom:20px;">연령대별 분석에 사용됩니다.</p>
      
      <div class="formGroup">
        <label class="formLabel">생년월일</label>
        <div class="selectRow">
          <select id="birthYear" class="formSelect">${yearOptions.join('')}</select>
          <select id="birthMonth" class="formSelect">${monthOptions.join('')}</select>
          <select id="birthDay" class="formSelect">${dayOptions.join('')}</select>
        </div>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="saveBirthDate">저장</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backSettings">취소</button>
      </div>
    </section>
  `;
  
  $("#saveBirthDate").onclick = async () => {
    const year = $("#birthYear").value;
    const month = $("#birthMonth").value;
    const day = $("#birthDay").value;
    
    if (!year || !month || !day) {
      showToast('생년월일을 모두 선택해주세요', 'error');
      return;
    }
    
    const birthDate = `${year}-${month}-${day}`;
    
    playClick();
    try {
      await updateUserProfile({ birthDate });
      showToast('생년월일이 변경되었어요', 'success');
      setTimeout(() => renderSettings(), 500);
    } catch (e) {
      showToast('변경 실패: ' + e.message, 'error');
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 로그인 사용자용 성별 설정
function renderGenderSettingsLoggedIn() {
  const currentGender = getUserGender();
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">성별 설정</h1>
      
      <div class="formOptions">
        <button class="formOption ${currentGender === 'male' ? 'selected' : ''}" data-value="male">남성</button>
        <button class="formOption ${currentGender === 'female' ? 'selected' : ''}" data-value="female">여성</button>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="saveGender">저장</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backSettings">취소</button>
      </div>
    </section>
  `;
  
  let selectedGender = currentGender;
  
  document.querySelectorAll('.formOption').forEach(btn => {
    btn.onclick = () => {
      playClick();
      document.querySelectorAll('.formOption').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGender = btn.dataset.value;
    };
  });
  
  $("#saveGender").onclick = async () => {
    if (!selectedGender) {
      showToast('성별을 선택해주세요', 'error');
      return;
    }
    
    playClick();
    try {
      await updateUserProfile({ gender: selectedGender });
      showToast('성별이 변경되었어요', 'success');
      setTimeout(() => renderSettings(), 500);
    } catch (e) {
      showToast('변경 실패: ' + e.message, 'error');
    }
  };
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 프로필 완성 화면 (로그인 후 정보 없을 때)
export function renderCompleteProfile() {
  document.querySelector(".progress").textContent = "프로필 설정";
  
  const currentName = getUserName();
  const currentBirthDate = getUserBirthDate();
  const currentGender = getUserGender();
  
  let currentYear = '';
  let currentMonth = '';
  let currentDay = '';
  
  if (currentBirthDate) {
    const parts = currentBirthDate.split('-');
    if (parts.length === 3) {
      currentYear = parts[0];
      currentMonth = parts[1];
      currentDay = parts[2];
    }
  }
  
  // 연도 옵션 (1930~2010)
  const yearOptions = ['<option value="">연도</option>'];
  for (let y = 2010; y >= 1930; y--) {
    yearOptions.push(`<option value="${y}" ${currentYear == y ? 'selected' : ''}>${y}</option>`);
  }
  
  // 월 옵션
  const monthOptions = ['<option value="">월</option>'];
  for (let m = 1; m <= 12; m++) {
    const mv = String(m).padStart(2, '0');
    monthOptions.push(`<option value="${mv}" ${currentMonth == mv ? 'selected' : ''}>${m}</option>`);
  }
  
  // 일 옵션
  const dayOptions = ['<option value="">일</option>'];
  for (let d = 1; d <= 31; d++) {
    const dv = String(d).padStart(2, '0');
    dayOptions.push(`<option value="${dv}" ${currentDay == dv ? 'selected' : ''}>${d}</option>`);
  }
  
  app.innerHTML = `
    <section class="card">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:48px;margin-bottom:12px;"><i class="fa-solid fa-user-pen" style="color:var(--accent);"></i></div>
        <h1 class="title">프로필을 완성해주세요</h1>
        <p class="desc">더 정확한 분석을 위해 필요해요</p>
      </div>
      
      <div class="formGroup">
        <label class="formLabel">이름</label>
        <input type="text" id="profileName" class="formInput" placeholder="이름 입력" value="${currentName}">
      </div>
      
      <div class="formGroup">
        <label class="formLabel">생년월일</label>
        <div class="selectRow">
          <select id="profileYear" class="formSelect">${yearOptions.join('')}</select>
          <select id="profileMonth" class="formSelect">${monthOptions.join('')}</select>
          <select id="profileDay" class="formSelect">${dayOptions.join('')}</select>
        </div>
      </div>
      
      <div class="formGroup">
        <label class="formLabel">성별</label>
        <div class="formOptions">
          <button class="formOption ${currentGender === 'male' ? 'selected' : ''}" data-value="male">남성</button>
          <button class="formOption ${currentGender === 'female' ? 'selected' : ''}" data-value="female">여성</button>
        </div>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big primary" id="saveProfile">완료</button>
      </div>
      <button class="textBtn" id="skipProfile" style="width:100%;text-align:center;">나중에 하기</button>
    </section>
  `;
  
  let selectedGender = currentGender;
  
  document.querySelectorAll('.formOption').forEach(btn => {
    btn.onclick = () => {
      playClick();
      document.querySelectorAll('.formOption').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedGender = btn.dataset.value;
    };
  });
  
  $("#saveProfile").onclick = async () => {
    const name = $("#profileName").value.trim();
    const year = $("#profileYear").value;
    const month = $("#profileMonth").value;
    const day = $("#profileDay").value;
    
    if (!name) {
      showToast('이름을 입력해주세요', 'error');
      return;
    }
    if (!year || !month || !day) {
      showToast('생년월일을 모두 선택해주세요', 'error');
      return;
    }
    if (!selectedGender) {
      showToast('성별을 선택해주세요', 'error');
      return;
    }
    
    const birthDate = `${year}-${month}-${day}`;
    
    playClick();
    try {
      await updateUserProfile({ name, birthDate, gender: selectedGender });
      showToast('프로필이 저장되었어요', 'success');
      setTimeout(() => renderHome(), 500);
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  };
  
  $("#skipProfile").onclick = () => { playClick(); renderHome(); };
}
