// tests/spatial.js
import { $, sleep } from '../core/utils.js';
import { state, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, saveHistory, loadBaseline, tryUpdateBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { renderFinalResult } from '../ui/result.js';
import { playCorrect, playWrong, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

function generateSpatialTrial(rng, gridSize, numTargets) {
  const total = gridSize * gridSize;
  const targets = [];
  while (targets.length < numTargets) {
    const idx = Math.floor(rng() * total);
    if (!targets.includes(idx)) targets.push(idx);
  }
  return { gridSize, targets, numTargets };
}

function renderSpatialGrid(gridSize, highlightedCells, clickableCells, onCellClick) {
  // 모바일 대응: 화면 너비에 따라 셀 크기 조정
  const isMobile = window.innerWidth <= 480;
  const cellSize = isMobile ? 50 : 70;
  const gap = isMobile ? 6 : 8;
  const totalSize = gridSize * cellSize + (gridSize - 1) * gap;
  
  let html = `<div class="spatialGrid" style="display:grid;grid-template-columns:repeat(${gridSize},${cellSize}px);gap:${gap}px;width:${totalSize}px;">`;
  
  for (let i = 0; i < gridSize * gridSize; i++) {
    const isHighlighted = highlightedCells.includes(i);
    const isClickable = clickableCells !== null;
    const isSelected = clickableCells && clickableCells.includes(i);
    
    html += `<div class="spatialCell ${isHighlighted ? 'highlighted' : ''} ${isSelected ? 'highlighted' : ''}" 
      data-idx="${i}" 
      style="width:${cellSize}px;height:${cellSize}px;${isClickable ? 'cursor:pointer;' : ''}"></div>`;
  }
  
  html += '</div>';
  return html;
}

export function startSpatialTest() {
  state.currentTest = "spatial";
  state.phase = "intro";
  state.spatialTrials = [];
  renderSpatialIntro();
}

function renderSpatialIntro() {
  document.querySelector(".progress").textContent = "검사 4/4 · 공간기억";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 4 · 공간기억</div>
      <h1 class="title">위치 기억 검사</h1>
      <p class="desc">
        파란색으로 표시된 칸의 <b>위치</b>를 기억하세요.<br/>
        사라진 후, 같은 위치를 클릭해주세요.
      </p>
      <div class="notice">칸 수가 점점 늘어납니다. 집중해서 위치를 기억하세요!</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startPractice">연습 시작</button>
      </div>
    </section>
  `;
  $("#startPractice").onclick = () => { playClick(); runSpatialPractice(); };
}

async function runSpatialPractice() {
  const trial = generateSpatialTrial(state.rng, 4, 3);
  await runSingleSpatialTrial(trial, true, 1, 1);
  renderSpatialReady();
}

function renderSpatialReady() {
  app.innerHTML = `
    <section class="card">
      <div class="pill">연습 완료</div>
      <h1 class="title">본 검사 시작</h1>
      <p class="desc">총 6회 진행됩니다. 3칸 → 4칸 → 5칸으로 늘어납니다.</p>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startTestBtn">본 검사 시작</button>
      </div>
    </section>
  `;
  $("#startTestBtn").onclick = () => { playClick(); runSpatialTest(); };
}

async function runSpatialTest() {
  state.phase = "test";
  state.spatialTrials = [];
  
  // 테스트용: 2회 (배포시 [3, 3, 4, 4, 5, 5]로 변경)
  const difficulties = [3, 4];
  
  for (let i = 0; i < difficulties.length; i++) {
    const trial = generateSpatialTrial(state.rng, 4, difficulties[i]);
    const result = await runSingleSpatialTrial(trial, false, i + 1, difficulties.length);
    state.spatialTrials.push(result);
    if (i < difficulties.length - 1) await sleep(500);
  }
  
  finishSpatialTest();
}

function runSingleSpatialTrial(trial, isPractice, currentNum, totalNum) {
  return new Promise(async (resolve) => {
    const { gridSize, targets, numTargets } = trial;
    
    // 타겟 표시
    app.innerHTML = `
      <section class="card">
        <div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : `본 검사 ${currentNum}/6`}</div>
        <div class="notice" style="text-align:center;margin-bottom:16px;">
          위치를 기억하세요! (${numTargets}칸)
        </div>
        ${renderSpatialGrid(gridSize, targets, null, null)}
      </section>
    `;
    
    await sleep(2000);
    
    // 입력 받기
    let userClicks = [];
    const numRequired = targets.length;
    const startTime = Date.now();
    
    const renderClickableGrid = () => {
      app.innerHTML = `
        <section class="card">
          <div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : `본 검사 ${currentNum}/${totalNum}`}</div>
          <div class="notice" style="text-align:center;margin-bottom:16px;">
            <span id="remainCount">${numRequired - userClicks.length}</span>개 더 클릭하세요
          </div>
          <div id="gridContainer">${renderSpatialGrid(gridSize, userClicks, [], null)}</div>
          <div class="controls" style="margin-top:16px;grid-template-columns:1fr;">
            <button class="big" id="submitBtn" ${userClicks.length !== numRequired ? 'disabled' : ''}>확인</button>
          </div>
        </section>
      `;
      
      attachGridEvents();
    };
    
    const updateGrid = () => {
      const gridContainer = $("#gridContainer");
      const remainCount = $("#remainCount");
      const submitBtn = $("#submitBtn");
      
      if (gridContainer) {
        gridContainer.innerHTML = renderSpatialGrid(gridSize, userClicks, [], null);
        attachGridEvents();
      }
      if (remainCount) remainCount.textContent = numRequired - userClicks.length;
      if (submitBtn) submitBtn.disabled = userClicks.length !== numRequired;
    };
    
    const attachGridEvents = () => {
      document.querySelectorAll('.spatialCell').forEach(cell => {
        cell.onclick = () => {
          const idx = parseInt(cell.dataset.idx);
          // 이미 선택된 셀이면 취소
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
      if (submitBtn) submitBtn.onclick = () => { playClick(); finishTrial(); };
    };
    
    const finishTrial = () => {
      const endTime = Date.now();
      const rt = endTime - startTime;
      
      const correctClicks = userClicks.filter(idx => targets.includes(idx)).length;
      const accuracy = correctClicks / targets.length;
      const correct = accuracy === 1;
      
      if (correct) playCorrect(); else playWrong();
      
      if (isPractice) {
        const feedbackHtml = correct
          ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>`
          : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ ${correctClicks}/${targets.length}개 맞춤</div>`;
        
        app.innerHTML = `
          <section class="card">
            <div class="pill">연습 ${currentNum}/${totalNum}</div>
            <div class="stimulusArea">${feedbackHtml}</div>
          </section>
        `;
        setTimeout(() => resolve({ correct, accuracy, rt, numTargets, userClicks, targets }), 1000);
      } else {
        resolve({ correct, accuracy, rt, numTargets, userClicks, targets });
      }
    };
    
    renderClickableGrid();
  });
}

function finishSpatialTest() {
  const trials = state.spatialTrials;
  const correctTrials = trials.filter(t => t.correct).length;
  const avgAccuracy = trials.reduce((sum, t) => sum + t.accuracy, 0) / trials.length;
  const avgRt = Math.round(trials.reduce((sum, t) => sum + t.rt, 0) / trials.length);
  const raw = avgAccuracy * 100;
  
  const summary = {
    totalTrials: trials.length,
    correctTrials,
    avgAccuracy: Number(avgAccuracy.toFixed(3)),
    avgRtMs: avgRt,
    raw: Number(raw.toFixed(3))
  };
  
  const history = loadHistory(LS_KEYS.spatialHistory);
  history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
  saveHistory(LS_KEYS.spatialHistory, history);
  
  const baseline = tryUpdateBaseline(history, LS_KEYS.spatialBaseline) || loadBaseline(LS_KEYS.spatialBaseline);
  state.spatialResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
  clearTestProgress(); // 모든 검사 완료 - 진행 상태 삭제
  
  // 서버에 결과 저장
  if (isLoggedIn()) {
    saveResults('spatial', summary).catch(e => console.error('결과 저장 실패:', e));
  }
  
  playComplete();
  renderFinalResult();
}
