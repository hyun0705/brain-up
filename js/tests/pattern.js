// tests/pattern.js
import { $, clamp, nowMs, formatMMSS, showCountdown, TEST_DURATION_MS } from '../core/utils.js';
import { state, detachKeyHandler, saveTestProgress, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, saveHistory, loadBaseline, tryUpdateBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { startGoNoGoTest } from './gonogo.js';
import { playCorrect, playWrong, playStart, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

function makeGridPattern(rng, size = 6, filled = 16) {
  const total = size * size;
  const cells = new Array(total).fill(0);
  const idxs = [];
  while (idxs.length < filled) {
    const idx = Math.floor(rng() * total);
    if (!idxs.includes(idx)) idxs.push(idx);
  }
  for (const idx of idxs) cells[idx] = 1;
  return { size, cells };
}

function clonePattern(p) {
  return { size: p.size, cells: p.cells.slice() };
}

function toggleRandomCells(rng, p, k) {
  const total = p.size * p.size;
  const chosen = [];
  while (chosen.length < k) {
    const idx = Math.floor(rng() * total);
    if (!chosen.includes(idx)) chosen.push(idx);
  }
  for (const idx of chosen) p.cells[idx] = p.cells[idx] ? 0 : 1;
  return chosen;
}

function renderPatternToCanvas(pattern, canvas) {
  const { size, cells } = pattern;
  
  // 모바일 대응: 화면 너비에 따라 셀 크기 조정
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

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const x = pad + c * (cellPx + gapPx);
      const y = pad + r * (cellPx + gapPx);
      ctx.fillStyle = cells[i] ? "#2563eb" : "#f1f5f9";
      ctx.fillRect(x, y, cellPx, cellPx);
    }
  }

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

function diffToToggleCount(level) {
  if (level <= 2) return 1;
  if (level <= 4) return 2;
  return 3;
}

function nextPatternTrial() {
  const isSame = (state.trialIndex % 2 === 0) ? (state.rng() < 0.5) : (state.rng() >= 0.5);
  const toggleK = diffToToggleCount(state.difficulty);
  const base = makeGridPattern(state.rng, 6, 16);
  const left = base;
  const right = clonePattern(base);
  let toggled = [];
  if (!isSame) toggled = toggleRandomCells(state.rng, right, toggleK);
  return {
    trial_id: `t_${state.sessionId}_${state.trialIndex}`,
    is_same: isSame,
    difficulty_level: state.difficulty,
    toggled,
    left,
    right,
  };
}

function updatePatternDifficulty() {
  const last = state.trials.slice(-10);
  if (last.length < 10) return;
  const acc = last.filter(t => t.correct).length / last.length;
  if (acc >= 0.9) state.difficulty = clamp(state.difficulty + 1, 1, 5);
  else if (acc <= 0.7) state.difficulty = clamp(state.difficulty - 1, 1, 5);
}

function computePatternSummary() {
  const answered = state.trials.length;
  const correctN = state.trials.filter(t => t.correct).length;
  const accuracy = answered ? correctN / answered : 0;
  const rts = state.trials.map(t => t.rt_ms).filter(x => Number.isFinite(x) && x > 0);
  const meanRt = rts.length ? (rts.reduce((a, b) => a + b, 0) / rts.length) : null;
  const durationSec = TEST_DURATION_MS / 1000;
  const speed = answered / (durationSec / 60);
  const raw = speed * Math.pow(accuracy, 2);
  return {
    answered,
    correctN,
    accuracy,
    meanRtMs: meanRt ? Math.round(meanRt) : null,
    speedApm: Number(speed.toFixed(2)),
    raw: Number(raw.toFixed(3)),
  };
}

export function startPatternTest() {
  state.currentTest = "pattern";
  state.phase = "overview";
  state.difficulty = 2;
  state.trialIndex = 0;
  state.trials = [];
  state.practiceCorrect = 0;
  state.practiceTotal = 0;
  state.practiceTarget = 6;
  renderTestOverview();
}

// 검사 전체 안내 화면
function renderTestOverview() {
  document.querySelector(".progress").textContent = "검사 안내";
  
  app.innerHTML = `
    <section class="card">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:48px;margin-bottom:12px;"><i class="fa-solid fa-clipboard-list" style="color:var(--accent);"></i></div>
        <h1 class="title">인지기능 검사</h1>
        <p class="desc" style="margin-bottom:0;">
          4가지 검사를 통해 두뇌 건강을 확인해요
        </p>
      </div>
      
      <div style="background:var(--bg);border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📝 검사 구성</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:28px;height:28px;background:var(--accent);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">1</div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text);">패턴 비교</div>
              <div style="font-size:12px;color:var(--muted);">처리속도 · 1분</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:28px;height:28px;background:var(--accent);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">2</div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text);">Go/No-Go</div>
              <div style="font-size:12px;color:var(--muted);">주의·억제 · 1분</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:28px;height:28px;background:var(--accent);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">3</div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text);">숫자 기억</div>
              <div style="font-size:12px;color:var(--muted);">작업기억 · 2~3분</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:28px;height:28px;background:var(--accent);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">4</div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text);">위치 기억</div>
              <div style="font-size:12px;color:var(--muted);">공간기억 · 2~3분</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:16px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="font-size:18px;">🔊</div>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">검사 전 안내</div>
            <div style="font-size:13px;color:var(--muted);line-height:1.5;">
              • 사운드를 켜주세요<br/>
              • 방해받지 않는 환경에서 진행해주세요<br/>
              • 중간에 중단하면 처음부터 다시 시작해요
            </div>
          </div>
        </div>
      </div>
      
      <div style="text-align:center;font-size:14px;color:var(--muted);margin-bottom:16px;">
        총 소요시간: 약 <b style="color:var(--text);">6~8분</b>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big primary" id="startTestBtn">검사 시작하기</button>
      </div>
    </section>
  `;
  
  $("#startTestBtn").onclick = () => { 
    playClick(); 
    state.phase = "intro";
    renderPatternIntro(); 
  };
}

function renderPatternIntro() {
  document.querySelector(".progress").textContent = "검사 1/4 · 처리속도";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 1 · 처리속도</div>
      <h1 class="title">패턴 비교 검사</h1>
      <p class="desc">
        두 그림이 <b>완전히 같으면</b> <span class="kbd">같다</span>,
        <b>하나라도 다르면</b> <span class="kbd">다르다</span>를 누르세요.
      </p>
      <div class="notice">키보드: <b>F</b>=같다 · <b>J</b>=다르다</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startPractice">연습 시작</button>
      </div>
    </section>
  `;
  $("#startPractice").onclick = () => { playClick(); state.phase = "practice"; startPatternTrial(); };
}

function renderPatternTrialScreen(isPractice) {
  const label = isPractice ? `연습 ${state.practiceTotal + 1}/${state.practiceTarget}` : `본 검사`;
  const timerHtml = !isPractice ? `<div class="inTestTimer" id="inTestTimer">01:00</div>` : '';
  app.innerHTML = `
    <section class="card">
      <div class="pillRow">
        <div class="pill">${label}</div>
        ${timerHtml}
      </div>
      <div class="patternWrap">
        <div class="patternCard"><canvas id="leftCanvas"></canvas></div>
        <div class="patternCard"><canvas id="rightCanvas"></canvas></div>
      </div>
      <div class="controls">
        <button class="big" id="btnSame">같다 (F)</button>
        <button class="big" id="btnDiff">다르다 (J)</button>
      </div>
      <div class="notice" id="feedback" style="display:none;"></div>
    </section>
  `;
  renderPatternToCanvas(state.current.left, $("#leftCanvas"));
  renderPatternToCanvas(state.current.right, $("#rightCanvas"));
  $("#btnSame").onclick = () => { playClick(); submitPatternAnswer("same", isPractice); };
  $("#btnDiff").onclick = () => { playClick(); submitPatternAnswer("diff", isPractice); };
}

function startPatternTrial() {
  const isPractice = (state.phase === "practice");
  state.current = nextPatternTrial();
  state.trialStartMs = nowMs();
  renderPatternTrialScreen(isPractice);
  detachKeyHandler();
  state.keyHandler = (e) => {
    if (e.repeat) return;
    if (e.key === "f" || e.key === "F") submitPatternAnswer("same", isPractice);
    if (e.key === "j" || e.key === "J") submitPatternAnswer("diff", isPractice);
  };
  window.addEventListener("keydown", state.keyHandler);
}

function submitPatternAnswer(ans, isPractice) {
  if (!state.current) return;
  detachKeyHandler();
  const end = nowMs();
  const rt = Math.max(0, Math.round(end - state.trialStartMs));
  const correct = (ans === "same" && state.current.is_same) || (ans === "diff" && !state.current.is_same);

  if (isPractice) {
    state.practiceTotal++;
    if (correct) {
      state.practiceCorrect++;
      playCorrect();
    } else {
      playWrong();
    }
    const feedback = $("#feedback");
    feedback.style.display = "block";
    feedback.innerHTML = correct ? "✅ 정답" : "❌ 오답";
    feedback.style.color = correct ? "var(--good)" : "var(--warn)";
    setTimeout(() => {
      if (state.practiceTotal >= state.practiceTarget) {
        if (state.practiceCorrect / state.practiceTotal < 0.5) state.practiceTarget += 3;
        else { state.phase = "ready"; renderPatternReady(); return; }
      }
      state.trialIndex++;
      startPatternTrial();
    }, 350);
    return;
  }

  state.trials.push({ 
    trial_id: state.current.trial_id, 
    rt_ms: rt, 
    is_same: state.current.is_same, 
    user_answer: ans, 
    correct, 
    difficulty_level: state.current.difficulty_level 
  });
  updatePatternDifficulty();
  state.trialIndex++;
  if (nowMs() >= state.testEndMs) { finishPatternTest(); return; }
  startPatternTrial();
}

function renderPatternReady() {
  app.innerHTML = `
    <section class="card">
      <div class="pill">연습 완료</div>
      <h1 class="title">본 검사 시작</h1>
      <p class="desc">가능한 많이, 정확하게 풀어주세요.</p>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startTestBtn">본 검사 시작</button>
      </div>
    </section>
  `;
  $("#startTestBtn").onclick = async () => {
    playClick();
    await showCountdown(app);
    playStart();
    state.phase = "test";
    state.trials = [];
    state.trialIndex = 0;
    state.testStartMs = nowMs();
    state.testEndMs = state.testStartMs + TEST_DURATION_MS;
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => {
      const remaining = state.testEndMs - nowMs();
      const inTimer = $("#inTestTimer");
      if (inTimer) inTimer.textContent = formatMMSS(remaining);
      if (remaining <= 0) { clearInterval(state.timerHandle); state.timerHandle = null; finishPatternTest(); }
    }, 100);
    startPatternTrial();
  };
}

function finishPatternTest() {
  if (state.currentTest !== "pattern") return;
  detachKeyHandler();
  if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
  const summary = computePatternSummary();
  const history = loadHistory(LS_KEYS.patternHistory);
  history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
  saveHistory(LS_KEYS.patternHistory, history);
  const baseline = tryUpdateBaseline(history, LS_KEYS.patternBaseline) || loadBaseline(LS_KEYS.patternBaseline);
  state.patternResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
  saveTestProgress(); // 진행 상태 저장
  
  // 서버에 결과 저장
  if (isLoggedIn()) {
    saveResults('pattern', summary).catch(e => console.error('결과 저장 실패:', e));
  }
  
  playComplete();
  renderPatternDone();
}

function renderPatternDone() {
  const { summary } = state.patternResult;
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 1 완료</div>
      <h1 class="title">패턴 비교 완료!</h1>
      <p class="desc">푼 문제: <b>${summary.answered}개</b> · 정확도: <b>${Math.round(summary.accuracy * 100)}%</b></p>
      <div class="notice">다음은 <b>주의·억제 검사</b>입니다.</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="nextTest">다음 검사로</button>
      </div>
    </section>
  `;
  $("#nextTest").onclick = () => { playClick(); startGoNoGoTest(); };
}

// 검사 이어하기
export function resumePatternTest() {
  document.querySelector(".progress").textContent = "검사 1/4 · 처리속도";
  
  // 이미 완료된 경우 다음 검사로
  if (state.patternResult) {
    startGoNoGoTest();
    return;
  }
  
  // 진행 상태에 따라 적절한 화면으로
  if (state.phase === "overview") {
    renderTestOverview();
  } else if (state.phase === "intro") {
    renderPatternIntro();
  } else if (state.phase === "practice") {
    renderPatternIntro(); // 연습은 처음부터
  } else if (state.phase === "ready") {
    renderPatternReady();
  } else if (state.phase === "test") {
    // 본 검사 중이었으면 이어서 시작
    renderPatternReady();
  } else {
    renderPatternIntro();
  }
}
