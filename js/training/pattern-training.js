// 처리속도 훈련
import { $, sleep, clamp } from '../core/utils.js';
import { state } from '../core/state.js';
import { LS_KEYS, loadHistory, getAnonId, getDateKey } from '../core/storage.js';
import { playCorrect, playWrong, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

// 훈련 기록 저장
function saveTrainingHistory(record) {
  const key = 'brainup_pattern_training_history';
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  history.push(record);
  localStorage.setItem(key, JSON.stringify(history));
}

// 패턴 생성
function makeGridPattern(size = 6, filled = 16) {
  const total = size * size;
  const cells = new Array(total).fill(0);
  const idxs = [];
  while (idxs.length < filled) {
    const idx = Math.floor(Math.random() * total);
    if (!idxs.includes(idx)) idxs.push(idx);
  }
  for (const idx of idxs) cells[idx] = 1;
  return { size, cells };
}

function clonePattern(p) {
  return { size: p.size, cells: p.cells.slice() };
}

function toggleRandomCells(p, k) {
  const total = p.size * p.size;
  const chosen = [];
  while (chosen.length < k) {
    const idx = Math.floor(Math.random() * total);
    if (!chosen.includes(idx)) chosen.push(idx);
  }
  for (const idx of chosen) p.cells[idx] = p.cells[idx] ? 0 : 1;
  return chosen;
}

// 패턴 렌더링
function renderPatternToCanvas(pattern, canvas) {
  const { size, cells } = pattern;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const isMobile = window.innerWidth <= 480;
  const cellPx = isMobile ? 18 : 24;
  const gapPx = isMobile ? 2 : 3;
  const pad = isMobile ? 8 : 12;

  const w = pad * 2 + size * cellPx + (size - 1) * gapPx;
  const h = w;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);

  ctx.fillStyle = isDark ? "#1f2937" : "#ffffff";
  ctx.fillRect(0, 0, w, h);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const x = pad + c * (cellPx + gapPx);
      const y = pad + r * (cellPx + gapPx);
      ctx.fillStyle = cells[i] 
        ? (isDark ? "#60a5fa" : "#2563eb") 
        : (isDark ? "#374151" : "#f1f5f9");
      ctx.fillRect(x, y, cellPx, cellPx);
    }
  }

  ctx.strokeStyle = isDark ? "#4b5563" : "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

// 문제 수 기반 훈련 시작
export function startPatternTrainingWithTrials(trialCount, onComplete) {
  state.patternTraining = {
    trials: [],
    index: 0,
    total: trialCount,
    correct: 0,
    difficulty: 2,
    onComplete
  };
  
  document.querySelector(".progress").textContent = "관리 · 처리속도";
  
  runPatternTrainingTrial();
}

function runPatternTrainingTrial() {
  const t = state.patternTraining;
  
  // 훈련이 중단된 경우 (홈 버튼 등으로 나감)
  if (!t) return;
  
  // 같음/다름 결정
  const isSame = Math.random() < 0.5;
  const toggleK = t.difficulty <= 2 ? 1 : (t.difficulty <= 4 ? 2 : 3);
  
  const base = makeGridPattern(6, 16);
  const left = base;
  const right = clonePattern(base);
  if (!isSame) toggleRandomCells(right, toggleK);
  
  const startTime = Date.now();
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">처리속도 ${t.index + 1}/${t.total}</div>
      <div class="patternWrap">
        <div class="patternCard"><canvas id="leftCanvas"></canvas></div>
        <div class="patternCard"><canvas id="rightCanvas"></canvas></div>
      </div>
      <div class="controls">
        <button class="big" id="sameBtn">같다 (F)</button>
        <button class="big" id="diffBtn">다르다 (J)</button>
      </div>
      <div class="notice" style="text-align:center;margin-top:8px;">키보드: <b>F</b>=같다 · <b>J</b>=다르다</div>
    </section>
  `;
  
  renderPatternToCanvas(left, $("#leftCanvas"));
  renderPatternToCanvas(right, $("#rightCanvas"));
  
  // 이전 키 핸들러 제거
  if (state.keyHandler) {
    window.removeEventListener("keydown", state.keyHandler);
  }
  
  // 키보드 핸들러
  const keyHandler = (e) => {
    if (!state.patternTraining) return;
    if (e.repeat) return;
    if (e.key === "f" || e.key === "F") { handleAnswer(true); }
    if (e.key === "j" || e.key === "J") { handleAnswer(false); }
  };
  state.keyHandler = keyHandler;
  window.addEventListener("keydown", keyHandler);
  
  let answered = false;
  const handleAnswer = async (userSaidSame) => {
    if (answered) return;
    // 훈련이 중단된 경우
    if (!state.patternTraining) return;
    
    answered = true;
    window.removeEventListener("keydown", keyHandler);
    state.keyHandler = null;
    const rt = Date.now() - startTime;
    const correct = userSaidSame === isSame;
    
    if (correct) {
      playCorrect();
      t.correct++;
    } else {
      playWrong();
    }
    
    t.trials.push({ correct, rt, isSame, userSaidSame });
    t.index++;
    
    // 난이도 조정 (10문제마다)
    if (t.index % 10 === 0) {
      const last10 = t.trials.slice(-10);
      const acc = last10.filter(x => x.correct).length / 10;
      if (acc >= 0.9) t.difficulty = clamp(t.difficulty + 1, 1, 5);
      else if (acc <= 0.7) t.difficulty = clamp(t.difficulty - 1, 1, 5);
    }
    
    const feedbackHtml = correct
      ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>`
      : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ 오답</div>`;
    
    app.innerHTML = `
      <section class="card">
        <div class="pill">처리속도 ${t.index}/${t.total}</div>
        <div class="stimulusArea">${feedbackHtml}</div>
      </section>
    `;
    
    await sleep(800);
    
    // 훈련이 중단된 경우
    if (!state.patternTraining) return;
    
    if (t.index < t.total) {
      runPatternTrainingTrial();
    } else {
      finishPatternTraining();
    }
  };
  
  $("#sameBtn").onclick = () => { 
    if (!state.patternTraining) return;
    playClick(); 
    handleAnswer(true); 
  };
  $("#diffBtn").onclick = () => { 
    if (!state.patternTraining) return;
    playClick(); 
    handleAnswer(false); 
  };
}

function finishPatternTraining() {
  const t = state.patternTraining;
  
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
      area: 'pattern',
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
        <div class="pill"><i class="fa-solid fa-check"></i> 처리속도 완료</div>
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
