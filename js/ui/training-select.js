// 관리 선택 화면
import { $, showToast } from '../core/utils.js';
import { state } from '../core/state.js';
import { playClick, playComplete } from '../core/sound.js';
import { renderHome } from './home.js';
import { hasTrainedToday, getStreak, loadHistory, LS_KEYS, markGuestTrainingDone, markTrainedTodayLocal } from '../core/storage.js';
import { isLoggedIn, getResults } from '../core/api.js';

const app = $("#app");

// 영역 정보 (가디언 페이지와 동일)
const TRAINING_AREAS = {
  pattern: {
    name: '처리속도',
    icon: 'fa-solid fa-bolt',
    color: '#2563eb',
    bgColor: '#dbeafe',
    desc: '빠르게 패턴 비교하기'
  },
  gonogo: {
    name: '주의·억제',
    icon: 'fa-solid fa-hand',
    color: '#16a34a',
    bgColor: '#dcfce7',
    desc: 'Go/No-Go 반응 훈련'
  },
  digitspan: {
    name: '작업기억',
    icon: 'fa-solid fa-list-ol',
    color: '#ea580c',
    bgColor: '#ffedd5',
    desc: '숫자 기억하기 (정순 + 역순)'
  },
  spatial: {
    name: '위치기억',
    icon: 'fa-solid fa-grip',
    color: '#dc2626',
    bgColor: '#fee2e2',
    desc: '위치 패턴을 기억하기'
  }
};

// 영역 순서 (기본: 처리속도 → 주의력 → 작업기억 → 위치기억)
const AREA_ORDER = ['pattern', 'gonogo', 'digitspan', 'spatial'];

// 추천 영역을 맨 위로 정렬
function getSortedAreas() {
  const entries = Object.entries(TRAINING_AREAS);
  
  // 추천 영역을 맨 위로
  entries.sort((a, b) => {
    const aIsWeakest = a[0] === weakestArea;
    const bIsWeakest = b[0] === weakestArea;
    
    if (aIsWeakest && !bIsWeakest) return -1;
    if (!aIsWeakest && bIsWeakest) return 1;
    
    // 나머지는 AREA_ORDER 순서대로
    return AREA_ORDER.indexOf(a[0]) - AREA_ORDER.indexOf(b[0]);
  });
  
  return entries;
}

// 영역별 문제 수 옵션 및 예상 시간 (초)
// 짧게=1분, 보통=2분, 길게=3분 기준
const TRIAL_OPTIONS = {
  pattern: [
    // 문제당 약 4초
    { value: 15, label: '15문제', seconds: 60 },
    { value: 30, label: '30문제', seconds: 120 },
    { value: 45, label: '45문제', seconds: 180 }
  ],
  gonogo: [
    // 문제당 약 3초
    { value: 20, label: '20문제', seconds: 60 },
    { value: 40, label: '40문제', seconds: 120 },
    { value: 60, label: '60문제', seconds: 180 }
  ],
  digitspan: [
    // 문제당 약 10초
    { value: 6, label: '6문제', seconds: 60 },
    { value: 12, label: '12문제', seconds: 120 },
    { value: 18, label: '18문제', seconds: 180 }
  ],
  spatial: [
    // 문제당 약 7초
    { value: 8, label: '8문제', seconds: 60 },
    { value: 16, label: '16문제', seconds: 120 },
    { value: 24, label: '24문제', seconds: 180 }
  ]
};

// 총 예상 시간 포맷팅
function formatTotalTime(seconds) {
  if (seconds <= 0) return '-';
  if (seconds < 60) {
    return `약 ${seconds}초`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) return `약 ${mins}분`;
  return `약 ${mins}분 ${secs}초`;
}

// 선택된 영역들의 총 예상 시간 계산 (초)
function calculateTotalSeconds() {
  let total = 0;
  for (const [area, trialCount] of Object.entries(selectedAreas)) {
    const options = TRIAL_OPTIONS[area];
    const option = options.find(o => o.value === trialCount);
    if (option) {
      total += option.seconds;
    }
  }
  return total;
}

// 캐시된 서버 결과
let cachedServerResults = null;

// UTC를 한국 시간으로 변환
function toKoreaTime(dateStr) {
  if (!dateStr) return new Date();
  const utcDate = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// 이번 주 범위 (일~토)
function getCurrentWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return { sunday, saturday };
}

// 가장 약한 영역 찾기 (서버 데이터 우선, 이번 주 검사 결과 기반)
function getWeakestArea() {
  const areas = ['digitspan', 'spatial', 'pattern', 'gonogo'];
  const scores = {};
  const { sunday, saturday } = getCurrentWeekRange();
  
  // 서버 데이터가 있으면 이번 주 결과 사용
  if (isLoggedIn() && cachedServerResults && cachedServerResults.length > 0) {
    areas.forEach(area => {
      const weekResults = cachedServerResults
        .filter(r => r.test_type === area)
        .filter(r => {
          const dateStr = r.date || r.created_at;
          if (!dateStr) return false;
          const entryDate = toKoreaTime(dateStr);
          return entryDate >= sunday && entryDate <= saturday;
        });
      
      if (weekResults.length > 0) {
        // 이번 주 결과 중 가장 최근 것
        const latest = weekResults[weekResults.length - 1];
        const summary = typeof latest.summary === 'string' ? JSON.parse(latest.summary) : latest.summary;
        scores[area] = summary.raw;
      } else {
        scores[area] = 50; // 기본값
      }
    });
  } else {
    // 로컬스토리지 사용 (비로그인 또는 서버 데이터 없음)
    areas.forEach(area => {
      const histKey = LS_KEYS[`${area}History`];
      const hist = loadHistory(histKey);
      
      if (hist.length === 0) {
        scores[area] = 50; // 기본값
      } else {
        const last = hist[hist.length - 1];
        scores[area] = last.summary.raw;
      }
    });
  }
  
  // 가장 낮은 점수의 영역
  let weakest = 'digitspan';
  let minScore = scores.digitspan;
  
  for (const [area, score] of Object.entries(scores)) {
    if (score < minScore) {
      minScore = score;
      weakest = area;
    }
  }
  
  return weakest;
}

// 선택 상태
let selectedAreas = {};
let weakestArea = null;

export async function renderTrainingSelect() {
  document.querySelector(".progress").textContent = "관리 설정";
  
  // 이미 오늘 완료했으면 완료 화면
  if (hasTrainedToday()) {
    renderAlreadyDone();
    return;
  }
  
  // 로그인 사용자는 서버 데이터 로드 (로딩 표시)
  if (isLoggedIn() && !cachedServerResults) {
    app.innerHTML = `
      <section class="card">
        <div style="text-align:center;padding:60px 40px;">
          <div class="loadingSpinner"></div>
          <p style="margin-top:20px;color:var(--muted);font-size:14px;">추천 영역을 분석하는 중...</p>
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
  
  weakestArea = getWeakestArea();
  
  // 초기 선택: 추천 영역만 선택, 3분(길게) 문제 수
  const defaultTrials = TRIAL_OPTIONS[weakestArea][2].value; // 길게 옵션
  selectedAreas = {
    [weakestArea]: defaultTrials
  };
  
  renderSelectScreen();
}

function renderAlreadyDone() {
  const streak = getStreak();
  
  app.innerHTML = `
    <section class="card">
      <div class="pill"><i class="fa-solid fa-check"></i> 완료</div>
      <h1 class="title">오늘은 이미 완료했어요</h1>
      <p class="desc">
        내일 같은 시간에 다시 만나요.<br/>
        매일 꾸준히 하는 게 가장 중요합니다.
      </p>
      <div class="streakBadge" style="margin:20px 0;">
        <i class="fa-solid fa-fire-flame-curved"></i>
        <span><b>${streak}일</b> 연속 관리 중</span>
      </div>
      <div class="controls" style="margin-top:14px;grid-template-columns:1fr;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}

function renderSelectScreen() {
  const totalSeconds = calculateTotalSeconds();
  const selectedCount = Object.keys(selectedAreas).length;
  const weakestAreaName = TRAINING_AREAS[weakestArea].name;
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="margin-bottom:8px;">오늘의 두뇌 관리</h1>
      <p class="desc" style="margin-bottom:20px;">훈련할 영역과 문제 수를 선택하세요</p>
      
      <div class="trainingAreaList">
        ${getSortedAreas().map(([key, area]) => {
          const isSelected = key in selectedAreas;
          const options = TRIAL_OPTIONS[key];
          const isWeakest = key === weakestArea;
          // 선택된 경우 저장된 값, 아니면 추천은 3분(길게), 나머지는 1분(짧게)
          const defaultTrials = isWeakest ? options[2].value : options[0].value;
          const selectedTrials = selectedAreas[key] || defaultTrials;
          
          return `
            <div class="trainingAreaItem ${isSelected ? 'selected' : ''}" data-area="${key}">
              <div class="trainingAreaCheck">
                <input type="checkbox" id="check_${key}" ${isSelected ? 'checked' : ''} />
              </div>
              <div class="trainingAreaIcon" style="background: ${area.bgColor}; color: ${area.color};">
                <i class="${area.icon}"></i>
              </div>
              <div class="trainingAreaInfo">
                <div class="trainingAreaName">
                  ${area.name}
                  ${isWeakest ? '<span class="recommendBadge">추천</span>' : ''}
                </div>
                <div class="trainingAreaDesc">${area.desc}</div>
              </div>
              <div class="trainingAreaTime ${isSelected ? '' : 'disabled'}">
                <select id="trials_${key}" ${isSelected ? '' : 'disabled'}>
                  ${options.map(opt => `
                    <option value="${opt.value}" ${selectedTrials === opt.value ? 'selected' : ''}>${opt.label}</option>
                  `).join('')}
                </select>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <!-- 선택 가이드 -->
      <div class="trainingGuide">
        <div class="guideHeader" id="toggleGuide">
          <i class="fa-solid fa-circle-question"></i>
          <span>선택 가이드</span>
          <i class="fa-solid fa-chevron-down guideArrow"></i>
        </div>
        <div class="guideContent" id="guideContent" style="display:none;">
          <div class="guideItem">
            <span class="recommendBadge">추천</span> 표시는 검사 결과에서 가장 점수가 낮았던 영역이에요.<br>
            이번 주는 <b>${weakestAreaName}</b> 집중 훈련을 추천해요.
          </div>
          <div class="guideItem">
            <b>처리속도</b> — 빠른 판단력과 시각 처리 능력
          </div>
          <div class="guideItem">
            <b>주의·억제</b> — 집중력과 충동 조절 능력
          </div>
          <div class="guideItem">
            <b>작업기억</b> — 정보를 기억하고 조작하는 능력
          </div>
          <div class="guideItem">
            <b>위치기억</b> — 공간 정보를 기억하는 능력
          </div>
          <div class="guideItem" style="color:var(--muted);">
            효과적인 훈련을 위해 3분 이상 진행하는 것을 권장해요.
          </div>
        </div>
      </div>
      
      <div class="trainingTotalTime">
        <i class="fa-solid fa-clock"></i>
        <span>총 예상 시간: <b>${formatTotalTime(totalSeconds)}</b></span>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big primary" id="startTrainingBtn" ${selectedCount === 0 ? 'disabled' : ''}>
          관리 시작하기
        </button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  bindEvents();
  
  // 가이드 토글
  $("#toggleGuide").onclick = () => {
    const content = $("#guideContent");
    const arrow = document.querySelector(".guideArrow");
    if (content.style.display === "none") {
      content.style.display = "block";
      arrow.style.transform = "rotate(180deg)";
    } else {
      content.style.display = "none";
      arrow.style.transform = "rotate(0deg)";
    }
  };
}

function bindEvents() {
  // 영역 선택/해제
  Object.keys(TRAINING_AREAS).forEach(key => {
    const checkbox = $(`#check_${key}`);
    const trialsSelect = $(`#trials_${key}`);
    const item = document.querySelector(`.trainingAreaItem[data-area="${key}"]`);
    // 추천 영역이면 3분(길게), 아니면 1분(짧게)
    const defaultTrials = key === weakestArea 
      ? TRIAL_OPTIONS[key][2].value  // 길게
      : TRIAL_OPTIONS[key][0].value; // 짧게
    
    // 체크박스 변경
    checkbox.onchange = () => {
      playClick();
      if (checkbox.checked) {
        selectedAreas[key] = parseInt(trialsSelect.value) || defaultTrials;
      } else {
        delete selectedAreas[key];
      }
      renderSelectScreen();
    };
    
    // 아이템 클릭 (체크박스 토글)
    item.onclick = (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      if (e.target.type === 'checkbox') return;
      playClick();
      checkbox.checked = !checkbox.checked;
      if (checkbox.checked) {
        selectedAreas[key] = parseInt(trialsSelect.value) || defaultTrials;
      } else {
        delete selectedAreas[key];
      }
      renderSelectScreen();
    };
    
    // 문제 수 변경
    trialsSelect.onchange = () => {
      playClick();
      if (key in selectedAreas) {
        selectedAreas[key] = parseInt(trialsSelect.value);
        renderSelectScreen();
      }
    };
  });
  
  // 시작 버튼
  $("#startTrainingBtn").onclick = () => {
    playClick();
    startSelectedTraining();
  };
  
  // 홈으로
  $("#backHome").onclick = () => {
    playClick();
    renderHome();
  };
}

async function startSelectedTraining() {
  const areas = Object.entries(selectedAreas);
  
  if (areas.length === 0) {
    showToast('훈련할 영역을 선택해주세요', 'error');
    return;
  }
  
  // 선택된 영역들을 state에 저장 (trials = 문제 수)
  state.trainingQueue = areas.map(([area, trials]) => ({ area, trials }));
  state.trainingQueueIndex = 0;
  
  // 첫 번째 훈련 시작
  runNextTraining();
}

async function runNextTraining() {
  if (state.trainingQueueIndex >= state.trainingQueue.length) {
    // 모든 훈련 완료
    finishAllTraining();
    return;
  }
  
  const { area, trials } = state.trainingQueue[state.trainingQueueIndex];
  
  // 영역별 훈련 모듈 로드 및 실행
  switch (area) {
    case 'digitspan':
      const { startDigitSpanTrainingWithTrials } = await import('../training/digitspan-training.js');
      startDigitSpanTrainingWithTrials(trials, () => {
        state.trainingQueueIndex++;
        runNextTraining();
      });
      break;
    case 'spatial':
      const { startSpatialTrainingWithTrials } = await import('../training/spatial-training.js');
      startSpatialTrainingWithTrials(trials, () => {
        state.trainingQueueIndex++;
        runNextTraining();
      });
      break;
    case 'pattern':
      const { startPatternTrainingWithTrials } = await import('../training/pattern-training.js');
      startPatternTrainingWithTrials(trials, () => {
        state.trainingQueueIndex++;
        runNextTraining();
      });
      break;
    case 'gonogo':
      const { startGoNoGoTrainingWithTrials } = await import('../training/gonogo-training.js');
      startGoNoGoTrainingWithTrials(trials, () => {
        state.trainingQueueIndex++;
        runNextTraining();
      });
      break;
  }
}

function finishAllTraining() {
  playComplete();
  
  // 오늘 관리 완료 처리
  if (!isLoggedIn()) {
    markGuestTrainingDone();
  } else {
    markTrainedTodayLocal();
  }
  
  const streak = getStreak();
  const completedAreas = state.trainingQueue.map(q => TRAINING_AREAS[q.area].name).join(', ');
  const totalTrials = state.trainingQueue.reduce((sum, q) => sum + q.trials, 0);
  
  document.querySelector(".progress").textContent = "관리 완료";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill"><i class="fa-solid fa-check"></i> 관리 완료</div>
      <h1 class="title">오늘 관리를 마쳤어요</h1>
      <p class="desc">
        ${completedAreas}<br/>
        총 ${totalTrials}문제 완료
      </p>
      
      <div class="streakBadge" style="margin:20px 0;">
        <i class="fa-solid fa-fire-flame-curved"></i>
        <span><b>${streak}일</b> 연속 관리 중</span>
      </div>
      
      <div class="notice">
        <i class="fa-solid fa-calendar-check" style="color:var(--accent);"></i>
        달력에 기록되었어요.<br/>
        내일도 잊지 말고 찾아와주세요.
      </div>
      
      <div class="controls" style="margin-top:14px;grid-template-columns:1fr;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}
