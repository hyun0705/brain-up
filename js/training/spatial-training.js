// 위치기억 훈련
import { $, sleep } from '../core/utils.js';
import { state } from '../core/state.js';
import { LS_KEYS, loadHistory, getAnonId, getDateKey } from '../core/storage.js';
import { playCorrect, playWrong, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

// 훈련 기록 저장
function saveTrainingHistory(record) {
  const key = 'brainup_spatial_training_history';
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  history.push(record);
  localStorage.setItem(key, JSON.stringify(history));
}

// 추천 난이도 (이전 검사 기록 기반)
function getPlannedDifficulty() {
  const history = loadHistory(LS_KEYS.spatialHistory);
  if (history.length === 0) return 3; // 기본값: 3칸
  const last = history[history.length - 1];
  const avgAcc = last.summary?.avgAccuracy || 0.5;
  if (avgAcc >= 0.8) return 4;
  if (avgAcc >= 0.6) return 3;
  return 3;
}

// 그리드 생성
function generateSpatialTrial(gridSize, numTargets) {
  const total = gridSize * gridSize;
  const targets = [];
  while (targets.length < numTargets) {
    const idx = Math.floor(Math.random() * total);
    if (!targets.includes(idx)) targets.push(idx);
  }
  return { gridSize, targets, numTargets };
}

// 그리드 렌더링
function renderSpatialGrid(gridSize, highlightedCells, clickableCells) {
  const isMobile = window.innerWidth <= 480;
  const cellSize = isMobile ? 50 : 70;
  const gap = isMobile ? 6 : 8;
  const totalSize = gridSize * cellSize + (gridSize - 1) * gap;
  
  let html = `<div class="spatialGrid" style="display:grid;grid-template-columns:repeat(${gridSize},${cellSize}px);gap:${gap}px;width:${totalSize}px;margin:0 auto;">`;
  
  for (let i = 0; i < gridSize * gridSize; i++) {
    const isHighlighted = highlightedCells.includes(i);
    const isSelected = clickableCells && clickableCells.includes(i);
    
    html += `<div class="spatialCell ${isHighlighted || isSelected ? 'highlighted' : ''}" 
      data-idx="${i}" 
      style="width:${cellSize}px;height:${cellSize}px;cursor:pointer;"></div>`;
  }
  
  html += '</div>';
  return html;
}

// 문제 수 기반 훈련 시작
export function startSpatialTrainingWithTrials(trialCount, onComplete) {
  const baseDifficulty = getPlannedDifficulty();
  
  state.spatialTraining = {
    trials: [],
    index: 0,
    total: trialCount,
    correct: 0,
    baseDifficulty,
    onComplete
  };
  
  document.querySelector(".progress").textContent = "관리 · 위치기억";
  
  runSpatialTrainingTrial();
}

async function runSpatialTrainingTrial() {
  // 훈련이 중단된 경우
  if (!state.spatialTraining) return;
  
  const t = state.spatialTraining;
  const currentDifficulty = t.baseDifficulty + Math.floor(t.index / 2); // 2문제마다 난이도 증가
  const numTargets = Math.min(currentDifficulty, 6); // 최대 6칸
  
  const trial = generateSpatialTrial(4, numTargets);
  
  // 타겟 표시
  app.innerHTML = `
    <section class="card">
      <div class="pill">위치기억 ${t.index + 1}/${t.total}</div>
      <div class="notice" style="text-align:center;margin-bottom:16px;">
        위치를 기억하세요! (${numTargets}칸)
      </div>
      ${renderSpatialGrid(trial.gridSize, trial.targets, null)}
    </section>
  `;
  
  await sleep(2000);
  
  // 훈련이 중단된 경우
  if (!state.spatialTraining) return;
  
  // 입력 받기
  let userClicks = [];
  const numRequired = trial.targets.length;
  
  const renderClickableGrid = () => {
    app.innerHTML = `
      <section class="card">
        <div class="pill">위치기억 ${t.index + 1}/${t.total}</div>
        <div class="notice" style="text-align:center;margin-bottom:16px;">
          <span id="remainCount">${numRequired - userClicks.length}</span>개 더 클릭하세요
        </div>
        <div id="gridContainer">${renderSpatialGrid(trial.gridSize, [], userClicks)}</div>
        <div class="controls" style="margin-top:16px;grid-template-columns:1fr;">
          <button class="big" id="submitBtn" ${userClicks.length !== numRequired ? 'disabled' : ''}>확인</button>
        </div>
      </section>
    `;
    
    attachGridEvents();
  };
  
  const updateGrid = () => {
    // 훈련이 중단된 경우
    if (!state.spatialTraining) return;
    
    const gridContainer = $("#gridContainer");
    const remainCount = $("#remainCount");
    const submitBtn = $("#submitBtn");
    
    if (gridContainer) {
      gridContainer.innerHTML = renderSpatialGrid(trial.gridSize, [], userClicks);
      attachGridEvents();
    }
    if (remainCount) remainCount.textContent = numRequired - userClicks.length;
    if (submitBtn) submitBtn.disabled = userClicks.length !== numRequired;
  };
  
  const attachGridEvents = () => {
    document.querySelectorAll('.spatialCell').forEach(cell => {
      cell.onclick = () => {
        // 훈련이 중단된 경우
        if (!state.spatialTraining) return;
        
        const idx = parseInt(cell.dataset.idx);
        if (userClicks.includes(idx)) {
          playClick();
          userClicks = userClicks.filter(i => i !== idx);
          updateGrid();
        } else if (userClicks.length < numRequired) {
          playClick();
          userClicks.push(idx);
          updateGrid();
        }
      };
    });
    
    const submitBtn = $("#submitBtn");
    if (submitBtn) submitBtn.onclick = () => { 
      if (!state.spatialTraining) return;
      playClick(); 
      finishTrial(); 
    };
  };
  
  const finishTrial = async () => {
    // 훈련이 중단된 경우
    if (!state.spatialTraining) return;
    
    const correctClicks = userClicks.filter(idx => trial.targets.includes(idx)).length;
    const accuracy = correctClicks / trial.targets.length;
    const correct = accuracy === 1;
    
    if (correct) {
      playCorrect();
      t.correct++;
    } else {
      playWrong();
    }
    
    t.trials.push({ correct, accuracy, numTargets, userClicks, targets: trial.targets });
    t.index++;
    
    const feedbackHtml = correct
      ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>`
      : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ ${correctClicks}/${trial.targets.length}개 맞춤</div>`;
    
    app.innerHTML = `
      <section class="card">
        <div class="pill">위치기억 ${t.index}/${t.total}</div>
        <div class="stimulusArea">${feedbackHtml}</div>
      </section>
    `;
    
    await sleep(1000);
    
    // 훈련이 중단된 경우
    if (!state.spatialTraining) return;
    
    if (t.index < t.total) {
      runSpatialTrainingTrial();
    } else {
      finishSpatialTraining();
    }
  };
  
  renderClickableGrid();
}

function finishSpatialTraining() {
  const t = state.spatialTraining;
  
  // 기록 저장
  const record = {
    user_id: getAnonId(),
    ended_at: Date.now(),
    date_key: getDateKey(),
    total: t.total,
    correct: t.correct
  };
  
  saveTrainingHistory(record);
  
  // 서버에 결과 저장
  if (isLoggedIn()) {
    const summary = {
      type: 'training',
      area: 'spatial',
      total: t.total,
      correct: t.correct,
      accuracy: t.correct / t.total
    };
    saveResults('training', summary).catch(e => console.error('훈련 결과 저장 실패:', e));
  }
  
  playComplete();
  
  // 콜백이 있으면 호출
  if (t.onComplete) {
    app.innerHTML = `
      <section class="card">
        <div class="pill"><i class="fa-solid fa-check"></i> 위치기억 완료</div>
        <div class="stimulusArea">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <div style="font-size:18px;font-weight:700;color:var(--text);">${t.total}회 중 ${t.correct}회 정답</div>
        </div>
      </section>
    `;
    
    setTimeout(() => {
      t.onComplete();
    }, 1500);
  }
}
