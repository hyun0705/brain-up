// ui/intro.js
import { $ } from '../core/utils.js';
import { state, resetState } from '../core/state.js';
import { LS_KEYS, loadHistory, loadBaseline, getUserProfile, saveUserProfile, hasTestedThisWeek } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { startPatternTest } from '../tests/pattern.js';
import { renderChartLegend, drawHistoryChart } from './result.js';
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

const app = $("#app");

// 현재 선택된 주 오프셋
let selectedWeekOffset = 0;

// 특정 오프셋의 주 범위 계산 (월요일 ~ 일요일)
function getWeekRangeByOffset(offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
}

// 특정 주의 검사 결과 가져오기
function getWeekTestResults(offset = 0) {
  const { monday, sunday } = getWeekRangeByOffset(offset);
  
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  const filterWeek = (history) => {
    return history.filter(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= monday && entryDate <= sunday;
    });
  };
  
  return {
    pattern: filterWeek(patternHist),
    gonogo: filterWeek(gonogoHist),
    digitspan: filterWeek(digitspanHist),
    spatial: filterWeek(spatialHist)
  };
}

// 주 라벨 생성
function getWeekLabel(offset) {
  const { monday, sunday } = getWeekRangeByOffset(offset);
  const startMonth = monday.getMonth() + 1;
  const startDay = monday.getDate();
  const endMonth = sunday.getMonth() + 1;
  const endDay = sunday.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  } else {
    return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
  }
}

// 가장 오래된 기록이 있는 주 오프셋 계산
function getOldestWeekOffset() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  if (patternHist.length === 0) return 0;
  
  let oldestDate = null;
  for (let i = 0; i < patternHist.length; i++) {
    const d = new Date(patternHist[i].ended_at);
    if (!oldestDate || d < oldestDate) {
      oldestDate = d;
    }
  }
  
  if (!oldestDate) return 0;
  
  const today = new Date();
  const diffTime = today - oldestDate;
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
  
  return -diffWeeks - 1;
}

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
        <b>내 정보</b>: ${profile.birthYear}년 ${profile.birthMonth}월생 (만 ${profile.age}세) · ${profile.gender === 'male' ? '남성' : '여성'}
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
    $("#viewLastResult").onclick = () => {
      playClick();
      selectedWeekOffset = 0; // 초기화
      renderPastResults();
    };
  }
}

export function renderProfileInput() {
  document.querySelector(".progress").textContent = "검사 -/4 · 정보 입력";
  
  const profile = getUserProfile();
  const currentYear = profile?.birthYear || '';
  const currentMonth = profile?.birthMonth || '';
  const currentGender = profile?.gender || '';

  // 연도 옵션 생성 (2007년까지 - 만 19세 이상)
  const thisYear = new Date().getFullYear(); // 2026년
  const maxBirthYear = thisYear - 19; // 2007년
  let yearOptions = '<option value="">연도</option>';
  for (let y = maxBirthYear; y >= 1920; y--) {
    yearOptions += `<option value="${y}" ${currentYear === y ? 'selected' : ''}>${y}년</option>`;
  }
  
  // 월 옵션
  let monthOptions = '<option value="">월</option>';
  for (let m = 1; m <= 12; m++) {
    monthOptions += `<option value="${m}" ${currentMonth === m ? 'selected' : ''}>${m}월</option>`;
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
        <label class="formLabel">생년월</label>
        <div class="selectGroup">
          <select id="yearSelect" class="formSelect">${yearOptions}</select>
          <select id="monthSelect" class="formSelect">${monthOptions}</select>
        </div>
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

  $("#backBtn").onclick = () => {
    playClick();
    renderMainIntro();
  };

  $("#saveProfile").onclick = () => {
    const birthYear = parseInt($("#yearSelect").value);
    const birthMonth = parseInt($("#monthSelect").value);
    const genderInput = document.querySelector('input[name="gender"]:checked');
    const gender = genderInput?.value;

    if (!birthYear) {
      alert('생년을 선택해주세요.');
      return;
    }
    if (!birthMonth) {
      alert('생월을 선택해주세요.');
      return;
    }
    if (!gender) {
      alert('성별을 선택해주세요.');
      return;
    }

    // 나이 계산
    const today = new Date();
    let age = today.getFullYear() - birthYear;
    if (today.getMonth() + 1 < birthMonth) {
      age--;
    }

    // 만 19세 미만 체크
    if (age < 19) {
      alert('본 검사는 만 19세 이상 성인을 대상으로 합니다.');
      return;
    }

    playClick();
    saveUserProfile({ birthYear, birthMonth, age, gender, updatedAt: Date.now() });
    startPatternTest();
  };
}

export function renderPastResults(initialOffset = null) {
  if (initialOffset !== null) {
    selectedWeekOffset = initialOffset;
  }
  
  document.querySelector(".progress").textContent = "검사 결과";

  const profile = getUserProfile();
  const isThisWeek = selectedWeekOffset === 0;
  const oldestOffset = getOldestWeekOffset();
  
  // 선택된 주의 결과 가져오기
  const weekResults = getWeekTestResults(selectedWeekOffset);
  const hasWeekData = weekResults.pattern.length > 0 || 
                      weekResults.gonogo.length > 0 || 
                      weekResults.digitspan.length > 0 || 
                      weekResults.spatial.length > 0;
  
  // 선택된 주의 마지막 결과
  const lastPattern = weekResults.pattern[weekResults.pattern.length - 1];
  const lastGonogo = weekResults.gonogo[weekResults.gonogo.length - 1];
  const lastDigitspan = weekResults.digitspan[weekResults.digitspan.length - 1];
  const lastSpatial = weekResults.spatial[weekResults.spatial.length - 1];

  const getIndex = (hist, baselineKey) => {
    if (!hist) return { index: '-', label: '기록 없음' };
    const baseline = loadBaseline(baselineKey);
    return computeIndexFromBaseline(hist.summary.raw, baseline);
  };

  const pIdx = getIndex(lastPattern, LS_KEYS.patternBaseline);
  const gIdx = getIndex(lastGonogo, LS_KEYS.gonogoBaseline);
  const dIdx = lastDigitspan ? computeIndexFromBaseline(lastDigitspan.summary.totalSpan, loadBaseline(LS_KEYS.digitspanBaseline)) : { index: '-', label: '기록 없음' };
  const sIdx = getIndex(lastSpatial, LS_KEYS.spatialBaseline);

  const getBadgeClass = (label) => {
    if (label === "좋아지는 중") return "badgeGood";
    if (label === "변동 있음") return "badgeWarn";
    return "";
  };

  // 전체 기록 수
  const allPatternHist = loadHistory(LS_KEYS.patternHistory);
  
  let profileInfo = '';
  if (profile && profile.age) {
    profileInfo = `<span style="color:var(--muted);font-size:14px;"> · 만 ${profile.age}세 ${profile.gender === 'male' ? '남성' : '여성'}</span>`;
  }

  // 결과 카드 (데이터 있을 때만)
  let resultSection = '';
  if (hasWeekData) {
    const lastDate = lastPattern ? new Date(lastPattern.ended_at).toLocaleDateString() : '-';
    
    resultSection = `
      <p class="desc" style="text-align:center;margin-bottom:16px;">
        검사일: ${lastDate}${profileInfo}
      </p>

      <div class="resultGrid">
        <div class="stat" style="padding:14px;">
          <div class="label">처리속도</div>
          <div class="value">${pIdx.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(pIdx.label)}">${pIdx.label}</div>
          ${lastPattern ? `<div style="font-size:13px;color:var(--muted);margin-top:6px;">${lastPattern.summary.answered}문제 · ${Math.round(lastPattern.summary.accuracy * 100)}%</div>` : ''}
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">주의·억제</div>
          <div class="value">${gIdx.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(gIdx.label)}">${gIdx.label}</div>
          ${lastGonogo ? `<div style="font-size:13px;color:var(--muted);margin-top:6px;">Go ${Math.round(lastGonogo.summary.goAcc * 100)}% · NoGo ${Math.round(lastGonogo.summary.nogoAcc * 100)}%</div>` : ''}
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">숫자 기억</div>
          <div class="value">${dIdx.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(dIdx.label)}">${dIdx.label}</div>
          ${lastDigitspan ? `<div style="font-size:13px;color:var(--muted);margin-top:6px;">정순 ${lastDigitspan.summary.forwardSpan} · 역순 ${lastDigitspan.summary.backwardSpan}</div>` : ''}
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">위치 기억</div>
          <div class="value">${sIdx.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(sIdx.label)}">${sIdx.label}</div>
          ${lastSpatial ? `<div style="font-size:13px;color:var(--muted);margin-top:6px;">${lastSpatial.summary.correctTrials}/6 · ${Math.round(lastSpatial.summary.avgAccuracy * 100)}%</div>` : ''}
        </div>
      </div>
    `;
  } else {
    resultSection = `
      <div style="text-align:center;padding:40px 20px;background:var(--bg);border-radius:14px;margin-bottom:16px;">
        <i class="fa-solid fa-calendar-xmark" style="font-size:36px;color:var(--muted);margin-bottom:12px;"></i>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">
          이 주에는 검사 기록이 없어요
        </div>
        <div style="font-size:14px;color:var(--muted);">
          다른 주를 선택해보세요
        </div>
      </div>
    `;
  }

  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="text-align:center;">📊 검사 결과</h1>
      
      <div class="weekNav">
        <button class="weekNavBtn" id="prevWeekBtn" ${selectedWeekOffset <= oldestOffset ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="weekNavLabel">
          ${getWeekLabel(selectedWeekOffset)}
          ${isThisWeek ? '<br/><span class="thisWeekBadge">이번 주</span>' : ''}
        </div>
        <button class="weekNavBtn" id="nextWeekBtn" ${selectedWeekOffset >= 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      
      ${resultSection}

      <div class="chartSection">
        <div class="label" style="margin-bottom:8px;">변화 추이 (최근 10회)</div>
        <canvas id="historyChart" style="width:100%;height:180px;"></canvas>
        ${renderChartLegend()}
      </div>
      
      <p class="desc" style="text-align:center;margin-top:12px;font-size:13px;">
        총 ${allPatternHist.length}회 검사 기록
      </p>

      <div class="controls" style="margin-top:14px;grid-template-columns:1fr;">
        <button class="big" id="backToIntro">홈으로</button>
      </div>
      
      ${isThisWeek && hasTestedThisWeek() ? `
        <div class="notice" style="margin-top:12px;text-align:center;">
          <i class="fa-solid fa-circle-check" style="color:var(--good);"></i>
          이번 주 검사를 완료했어요. 다음 주에 다시 검사할 수 있어요.
        </div>
      ` : isThisWeek && !hasTestedThisWeek() ? `
        <div class="controls" style="margin-top:12px;grid-template-columns:1fr;">
          <button class="big primary" id="startNew">새 검사 시작</button>
        </div>
      ` : ''}

    </section>
  `;

  setTimeout(() => drawHistoryChart('historyChart'), 50);

  // 주 네비게이션 이벤트
  $("#prevWeekBtn").onclick = () => {
    if (selectedWeekOffset > oldestOffset) {
      playClick();
      selectedWeekOffset--;
      renderPastResults();
    }
  };
  
  $("#nextWeekBtn").onclick = () => {
    if (selectedWeekOffset < 0) {
      playClick();
      selectedWeekOffset++;
      renderPastResults();
    }
  };

  $("#backToIntro").onclick = async () => {
    playClick();
    selectedWeekOffset = 0; // 초기화
    const home = await getHome();
    home();
  };
  
  if (isThisWeek && !hasTestedThisWeek() && $("#startNew")) {
    $("#startNew").onclick = () => {
      playClick();
      resetState();
      startPatternTest();
    };
  }
}
