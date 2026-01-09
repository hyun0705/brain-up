// tests/gonogo.js
import { $, clamp, nowMs, formatMMSS, showCountdown, sleep, TEST_DURATION_MS } from '../core/utils.js';
import { state, detachKeyHandler, saveTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, saveHistory, loadBaseline, tryUpdateBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { startDigitSpanTest } from './digitspan.js';
import { playCorrect, playWrong, playStart, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

function computeGoNoGoSummary(trials) {
  const goTrials = trials.filter(t => t.stimulus_type === "go");
  const nogoTrials = trials.filter(t => t.stimulus_type === "nogo");
  const goCorrect = goTrials.filter(t => t.correct).length;
  const nogoCorrect = nogoTrials.filter(t => t.correct).length;
  const goAcc = goTrials.length ? goCorrect / goTrials.length : 0;
  const nogoAcc = nogoTrials.length ? nogoCorrect / nogoTrials.length : 0;
  const goRts = goTrials.filter(t => t.correct && t.rt_ms > 0).map(t => t.rt_ms);
  const meanRt = goRts.length ? goRts.reduce((a, b) => a + b, 0) / goRts.length : null;
  const combinedAcc = goAcc * 0.5 + nogoAcc * 0.5;
  const speedFactor = meanRt ? clamp(1000 / meanRt, 0.5, 2) : 1;
  const raw = combinedAcc * speedFactor * 50;
  return {
    totalTrials: trials.length,
    goTrials: goTrials.length,
    nogoTrials: nogoTrials.length,
    goAcc: Number(goAcc.toFixed(3)),
    nogoAcc: Number(nogoAcc.toFixed(3)),
    combinedAcc: Number(combinedAcc.toFixed(3)),
    meanRtMs: meanRt ? Math.round(meanRt) : null,
    raw: Number(raw.toFixed(3)),
  };
}

export function startGoNoGoTest() {
  state.currentTest = "gonogo";
  state.phase = "intro";
  state.trialIndex = 0;
  state.trials = [];
  state.practiceCorrect = 0;
  state.practiceTotal = 0;
  state.practiceTarget = 6;
  renderGoNoGoIntro();
}

// 모바일 감지
function isMobile() {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

function renderGoNoGoIntro() {
  document.querySelector(".progress").textContent = "검사 2/4 · 주의·억제";
  
  const inputMethod = isMobile() 
    ? `<span class="kbd">화면 터치</span>` 
    : `<span class="kbd">스페이스바</span>`;
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 2 · 주의·억제</div>
      <h1 class="title">Go / No-Go 검사</h1>
      <p class="desc">
        <span style="color:#16a34a;font-size:28px;">●</span> <b>초록 원</b> → ${inputMethod}<br/>
        <span style="color:#dc2626;font-size:28px;">■</span> <b>빨간 사각형</b> → <span class="kbd">누르지 않기</span>
      </p>
      <div class="notice">빠르게 반응하되, 빨간 사각형엔 참아야 해요!</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startPractice">연습 시작</button>
      </div>
    </section>
  `;
  $("#startPractice").onclick = () => { playClick(); state.phase = "practice"; runGoNoGoPractice(); };
}

async function runGoNoGoPractice() {
  state.practiceCorrect = 0;
  state.practiceTotal = 0;
  const practiceTrials = [];
  for (let i = 0; i < state.practiceTarget; i++) practiceTrials.push(i % 2 === 0 ? "go" : "nogo");
  for (let i = practiceTrials.length - 1; i > 0; i--) {
    const j = Math.floor(state.rng() * (i + 1));
    [practiceTrials[i], practiceTrials[j]] = [practiceTrials[j], practiceTrials[i]];
  }
  for (let i = 0; i < practiceTrials.length; i++) {
    state.practiceTotal = i + 1;
    const result = await runSingleGoNoGoTrial(practiceTrials[i], true, i + 1, practiceTrials.length);
    if (result.correct) state.practiceCorrect++;
  }
  if (state.practiceCorrect / state.practiceTarget < 0.5) {
    state.practiceTarget += 3;
    app.innerHTML = `<section class="card"><div class="pill">연습 계속</div><h1 class="title">조금 더 연습해볼까요?</h1><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="retryPractice">연습 계속</button></div></section>`;
    $("#retryPractice").onclick = () => { playClick(); runGoNoGoPractice(); };
  } else renderGoNoGoReady();
}

function runSingleGoNoGoTrial(type, isPractice, currentNum, totalNum) {
  return new Promise((resolve) => {
    const isGo = type === "go";
    const mobile = isMobile();
    const pillLabel = isPractice ? `연습 ${currentNum}/${totalNum}` : '본 검사';
    const timerHtml = !isPractice ? `<div class="inTestTimer" id="inTestTimer">${formatMMSS(state.testEndMs - nowMs())}</div>` : '';
    app.innerHTML = `<section class="card"><div class="pillRow"><div class="pill">${pillLabel}</div>${timerHtml}</div><div class="stimulusArea"><div style="font-size:48px;color:var(--muted);">+</div></div></section>`;
    const fixationTime = 300 + Math.floor(state.rng() * 200);
    setTimeout(() => {
      const stimulusHtml = isGo 
        ? `<div style="width:140px;height:140px;background:#16a34a;border-radius:50%;box-shadow:0 4px 20px rgba(22,163,74,0.25);"></div>` 
        : `<div style="width:120px;height:120px;background:#dc2626;border-radius:12px;box-shadow:0 4px 20px rgba(220,38,38,0.25);"></div>`;
      
      // 모바일용 터치 버튼
      const touchBtnHtml = mobile 
        ? `<button class="gonogoTouchBtn" id="touchBtn">터치!</button>` 
        : '';
      const hintText = isGo 
        ? (mobile ? '터치!' : '스페이스바!') 
        : '누르지 마세요!';
      
      app.innerHTML = `<section class="card"><div class="pillRow"><div class="pill">${pillLabel}</div>${timerHtml}</div><div class="stimulusArea" id="stimArea">${stimulusHtml}</div><div class="notice" style="text-align:center;">${hintText}</div>${touchBtnHtml}</section>`;
      
      const stimulusStart = nowMs();
      let responded = false, responseRt = 0;
      
      const handleResponse = () => {
        if (!responded) {
          responded = true;
          responseRt = nowMs() - stimulusStart;
          cleanup();
          finishTrial();
        }
      };
      
      const handleKey = (e) => {
        if (e.code === "Space") {
          e.preventDefault();
          handleResponse();
        }
      };
      
      const handleTouch = (e) => {
        e.preventDefault();
        handleResponse();
      };
      
      const cleanup = () => { 
        window.removeEventListener("keydown", handleKey);
        const touchBtn = $("#touchBtn");
        if (touchBtn) touchBtn.removeEventListener("touchstart", handleTouch);
        const stimArea = $("#stimArea");
        if (stimArea) stimArea.removeEventListener("touchstart", handleTouch);
        if (state.gonogoTimeout) { clearTimeout(state.gonogoTimeout); state.gonogoTimeout = null; } 
      };
      
      const finishTrial = () => {
        const correct = isGo ? responded : !responded;
        if (isPractice) {
          if (correct) playCorrect(); else playWrong();
          const feedbackHtml = correct
            ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>` 
            : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ ${isGo ? '눌러야 해요!' : '참아야 해요!'}</div>`;
          app.innerHTML = `<section class="card"><div class="pill">연습 ${currentNum}/${totalNum}</div><div class="stimulusArea">${feedbackHtml}</div></section>`;
          setTimeout(() => resolve({ correct, responded, rt: responseRt, type }), 500);
        } else resolve({ correct, responded, rt: responseRt, type });
      };
      
      // 키보드 이벤트
      window.addEventListener("keydown", handleKey);
      
      // 터치 이벤트 (모바일)
      if (mobile) {
        const touchBtn = $("#touchBtn");
        if (touchBtn) touchBtn.addEventListener("touchstart", handleTouch, { passive: false });
        // 자극 영역 터치도 허용
        const stimArea = $("#stimArea");
        if (stimArea) stimArea.addEventListener("touchstart", handleTouch, { passive: false });
      }
      
      state.gonogoTimeout = setTimeout(() => { if (!responded) { cleanup(); finishTrial(); } }, 1000);
    }, fixationTime);
  });
}

function renderGoNoGoReady() {
  app.innerHTML = `<section class="card"><div class="pill">연습 완료</div><h1 class="title">본 검사 시작</h1><p class="desc">준비되면 시작하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="startTestBtn">본 검사 시작</button></div></section>`;
  $("#startTestBtn").onclick = async () => {
    playClick();
    await showCountdown(app);
    playStart();
    runGoNoGoTest();
  };
}

async function runGoNoGoTest() {
  state.phase = "test";
  state.trials = [];
  state.testStartMs = nowMs();
  state.testEndMs = state.testStartMs + TEST_DURATION_MS;
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = setInterval(() => {
    const remaining = state.testEndMs - nowMs();
    const inTimer = $("#inTestTimer");
    if (inTimer) inTimer.textContent = formatMMSS(remaining);
    if (remaining <= 0) { clearInterval(state.timerHandle); state.timerHandle = null; }
  }, 100);

  while (nowMs() < state.testEndMs) {
    const type = state.rng() < 0.6 ? "go" : "nogo";
    const result = await runSingleGoNoGoTrial(type, false, 0, 0);
    state.trials.push({ stimulus_type: type, correct: result.correct, responded: result.responded, rt_ms: result.rt });
    if (nowMs() >= state.testEndMs) break;
    await sleep(200 + Math.floor(state.rng() * 300));
  }
  
  finishGoNoGoTest();
}

function finishGoNoGoTest() {
  if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
  const summary = computeGoNoGoSummary(state.trials);
  
  // 비로그인일 때만 로컬스토리지에 저장
  if (!isLoggedIn()) {
    const history = loadHistory(LS_KEYS.gonogoHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.gonogoHistory, history);
  }
  
  const history = loadHistory(LS_KEYS.gonogoHistory);
  const baseline = tryUpdateBaseline(history, LS_KEYS.gonogoBaseline) || loadBaseline(LS_KEYS.gonogoBaseline);
  state.gonogoResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
  saveTestProgress(); // 진행 상태 저장
  
  // 로그인 사용자는 서버에만 저장
  if (isLoggedIn()) {
    saveResults('gonogo', summary).catch(e => console.error('결과 저장 실패:', e));
  }
  
  playComplete();
  renderGoNoGoDone();
}

function renderGoNoGoDone() {
  const { summary } = state.gonogoResult;
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 2 완료</div>
      <h1 class="title">Go/No-Go 완료!</h1>
      <p class="desc">Go 정확도: <b>${Math.round(summary.goAcc * 100)}%</b> · No-Go 정확도: <b>${Math.round(summary.nogoAcc * 100)}%</b></p>
      <div class="notice">다음은 <b>숫자 기억 검사</b>입니다.</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="nextTest">다음 검사로</button>
      </div>
    </section>
  `;
  $("#nextTest").onclick = () => { playClick(); startDigitSpanTest(); };
}

// 검사 이어하기
export function resumeGoNoGoTest() {
  document.querySelector(".progress").textContent = "검사 2/4 · 주의·억제";
  
  // 이미 완료된 경우 다음 검사로
  if (state.gonogoResult) {
    startDigitSpanTest();
    return;
  }
  
  // 연습/준비 상태면 인트로부터
  renderGoNoGoIntro();
}
