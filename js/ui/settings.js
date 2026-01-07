// ui/settings.js
import { $ } from '../core/utils.js';
import { getUserProfile, saveUserProfile, getTrialDaysLeft, isSubscribed, LS_KEYS } from '../core/storage.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';
import { renderUpgradePrompt } from './calendar.js';
import { createGuardianUrl } from '../core/guardian.js';

const app = $("#app");

export function renderSettings() {
  document.querySelector(".progress").textContent = "설정";
  
  const profile = getUserProfile() || {};
  const trialDaysLeft = getTrialDaysLeft();
  const subscribed = isSubscribed();
  
  // 연령대 텍스트
  const ageText = {
    '40대': '40대',
    '50대': '50대', 
    '60대': '60대',
    '70대 이상': '70대 이상'
  }[profile.age] || '미설정';
  
  // 성별 텍스트
  const genderText = {
    'male': '남성',
    'female': '여성'
  }[profile.gender] || '미설정';
  
  // 알림 시간 텍스트
  const reminderText = {
    '09:00': '아침 9시',
    '14:00': '오후 2시',
    '20:00': '저녁 8시',
    'none': '알림 안 받음'
  }[profile.reminderTime] || '미설정';
  
  // 구독 상태 텍스트
  let subscriptionStatus = '';
  if (subscribed) {
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
        
        <div class="settingItem" id="ageSetting">
          <div class="settingLabel">
            <i class="fa-solid fa-user"></i>
            <span>연령대</span>
          </div>
          <div class="settingValue">${ageText}</div>
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
        <div class="settingsSectionTitle">데이터</div>
        
        <div class="settingItem" id="exportData">
          <div class="settingLabel">
            <i class="fa-solid fa-download"></i>
            <span>데이터 내보내기</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
        
        <div class="settingItem danger" id="clearData">
          <div class="settingLabel">
            <i class="fa-solid fa-trash"></i>
            <span>모든 데이터 삭제</span>
          </div>
          <i class="fa-solid fa-chevron-right settingArrow"></i>
        </div>
      </div>
      
      <div class="settingsSection">
        <div class="settingsSectionTitle">정보</div>
        
        <div class="settingItem" id="appVersion">
          <div class="settingLabel">
            <i class="fa-solid fa-info-circle"></i>
            <span>앱 버전</span>
          </div>
          <div class="settingValue">1.0.0</div>
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
  $("#ageSetting").onclick = () => { playClick(); renderAgeSettings(); };
  $("#genderSetting").onclick = () => { playClick(); renderGenderSettings(); };
  $("#reminderSetting").onclick = () => { playClick(); renderReminderSettings(); };
  $("#exportData").onclick = () => { playClick(); exportAllData(); };
  $("#clearData").onclick = () => { playClick(); confirmClearData(); };
  $("#backHome").onclick = () => { playClick(); renderHome(); };
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
    
    const url = createGuardianUrl();
    
    try {
      await navigator.clipboard.writeText(url);
      showShareSuccess(url);
    } catch (err) {
      // 클립보드 실패 시 수동 복사 화면 표시
      showShareManual(url);
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
      alert('복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.');
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

// 연령대 설정
function renderAgeSettings() {
  const profile = getUserProfile() || {};
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">연령대 설정</h1>
      
      <div class="formOptions vertical">
        <button class="formOption ${profile.age === '40대' ? 'selected' : ''}" data-value="40대">40대</button>
        <button class="formOption ${profile.age === '50대' ? 'selected' : ''}" data-value="50대">50대</button>
        <button class="formOption ${profile.age === '60대' ? 'selected' : ''}" data-value="60대">60대</button>
        <button class="formOption ${profile.age === '70대 이상' ? 'selected' : ''}" data-value="70대 이상">70대 이상</button>
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
      
      const newProfile = { ...profile, age: btn.dataset.value };
      saveUserProfile(newProfile);
    };
  });
  
  $("#backSettings").onclick = () => { playClick(); renderSettings(); };
}

// 성별 설정
function renderGenderSettings() {
  const profile = getUserProfile() || {};
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:20px;">성별 설정</h1>
      
      <div class="formOptions vertical">
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
  
  alert('데이터가 다운로드되었습니다.');
}

// 데이터 삭제 확인
function confirmClearData() {
  if (confirm('정말 모든 데이터를 삭제할까요?\n\n검사 기록, 관리 기록, 설정 등 모든 데이터가 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.')) {
    if (confirm('마지막 확인입니다.\n정말로 삭제하시겠습니까?')) {
      Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
      alert('모든 데이터가 삭제되었습니다.');
      location.reload();
    }
  }
}
