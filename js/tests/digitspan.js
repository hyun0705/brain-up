// tests/digitspan.js
import { $, sleep } from '../core/utils.js';
import { state, saveTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, saveHistory, loadBaseline, tryUpdateBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { startSpatialTest } from './spatial.js';
import { playCorrect, playWrong, playComplete, playTick, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

function generateDigitSequence(rng, length) {
  const digits = [];
  for (let i = 0; i < length; i++) {
    let d;
    do {
      d = Math.floor(rng() * 10);
    } while (digits.length > 0 && digits[digits.length - 1] === d);
    digits.push(d);
  }
  return digits;
}

export function startDigitSpanTest() {
  state.currentTest = "digitspan";
  state.phase = "intro";
  state.digitSpan = { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] };
  renderDigitSpanIntro();
}

function renderDigitSpanIntro() {
  document.querySelector(".progress").textContent = "검사 3/4 · 작업기억";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 3 · 작업기억</div>
      <h1 class="title">숫자 기억 검사</h1>
      <p class="desc">
        화면에 숫자가 하나씩 나타납니다.<br/>
        <b>정순</b>: 본 순서대로 입력<br/>
        <b>역순</b>: 거꾸로 입력
      </p>
      <div class="notice" style="color:var(--muted);">
        제한 시간이 있지만, 빠르기보다 정확하게 푸는 게 중요해요.
      </div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startPractice">연습하기</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="skipPractice">바로 검사 시작</button>
      </div>
    </section>
  `;
  $("#startPractice").onclick = () => { playClick(); runDigitSpanPractice(); };
  $("#skipPractice").onclick = () => { playClick(); renderDigitSpanReady(); };
}

async function runDigitSpanPractice() {
  state.practiceCorrect = 0;
  state.practiceTotal = 0;
  
  // 정순 연습
  app.innerHTML = `<section class="card"><div class="pill">연습 · 정순</div><h1 class="title">정순 연습</h1><p class="desc">숫자를 <b>본 순서대로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
  await new Promise(r => { $("#start").onclick = () => { playClick(); r(); }; });
  const forwardResult = await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 3), "forward", true, 1, 2);
  state.practiceTotal++;
  if (forwardResult.correct) state.practiceCorrect++;
  
  // 역순 연습
  app.innerHTML = `<section class="card"><div class="pill">연습 · 역순</div><h1 class="title">역순 연습</h1><p class="desc">숫자를 <b>거꾸로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
  await new Promise(r => { $("#start").onclick = () => { playClick(); r(); }; });
  const backwardResult = await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 2), "backward", true, 2, 2);
  state.practiceTotal++;
  if (backwardResult.correct) state.practiceCorrect++;
  
  renderDigitSpanPracticeComplete();
}

function renderDigitSpanPracticeComplete() {
  const accuracy = state.practiceTotal > 0 ? Math.round(state.practiceCorrect / state.practiceTotal * 100) : 0;
  app.innerHTML = `
    <section class="card">
      <div class="pill">연습 완료</div>
      <h1 class="title">연습 완료!</h1>
      <p class="desc">정확도: <b>${accuracy}%</b> (${state.practiceCorrect}/${state.practiceTotal})</p>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big primary" id="startTestBtn">본 검사 시작</button>
      </div>
      <div class="controls" style="grid-template-columns:1fr;margin-top:8px;">
        <button class="big ghost" id="morePractice">더 연습하기</button>
      </div>
    </section>
  `;
  $("#startTestBtn").onclick = () => { playClick(); renderDigitSpanReady(); };
  $("#morePractice").onclick = () => { playClick(); runDigitSpanPractice(); };
}

async function showDigitSequence(digits, mode, isPractice, currentNum, totalNum) {
  const modeText = mode === "forward" ? "정순" : "역순";
  const modeHint = mode === "forward" ? "순서대로 입력하세요" : "거꾸로 입력하세요";
  const pillText = isPractice ? `연습 ${currentNum}/${totalNum} · ${modeText}` : `작업기억 ${currentNum}/${totalNum} · ${modeText}`;
  
  // 준비 화면 표시
  app.innerHTML = `
    <section class="card">
      <div class="pill">${pillText}</div>
      <div class="stimulusArea">
        <div style="text-align:center;">
          <div style="font-size:48px;color:var(--accent);margin-bottom:12px;">
            <i class="fa-solid fa-eye"></i>
          </div>
          <div style="font-size:20px;font-weight:700;color:var(--text);">곧 숫자가 나타납니다</div>
          <div style="font-size:15px;color:var(--muted);margin-top:8px;">${modeHint}</div>
        </div>
      </div>
    </section>
  `;
  
  await sleep(2000);
  
  // 숫자 표시 화면
  app.innerHTML = `
    <section class="card">
      <div class="pill">${pillText}</div>
      <div class="stimulusArea">
        <div id="digitDisplay" style="font-size:120px;font-weight:900;color:var(--accent);"></div>
      </div>
    </section>
  `;
  
  const display = $("#digitDisplay");
  
  for (let i = 0; i < digits.length; i++) {
    playTick();
    display.textContent = digits[i];
    await sleep(800);
  }
}

function runSingleDigitSpanTrial(digits, mode, isPractice, currentNum, totalNum) {
  return new Promise(async (resolve) => {
    const expectedAnswer = mode === "forward" ? digits : [...digits].reverse();
    await showDigitSequence(digits, mode, isPractice, currentNum, totalNum);
    let userInput = [];
    const inputLength = digits.length;
    
    const modeText = mode === "forward" ? "정순" : "역순";
    
    const pillText = isPractice ? `연습 ${currentNum}/${totalNum} · ${modeText}` : `작업기억 ${currentNum}/${totalNum} · ${modeText}`;
    
    app.innerHTML = `
      <section class="card">
        <div class="pill">${pillText}</div>
        <div style="text-align:center;margin:20px 0;">
          <div style="font-size:15px;color:var(--muted);margin-bottom:8px;">${digits.length}자리</div>
          <div id="inputDisplay" style="font-size:32px;font-weight:700;min-height:50px;"></div>
        </div>
        <div class="digitPad">
          ${[1,2,3,4,5,6,7,8,9,0].map(n=>`<button class="digitBtn" data-digit="${n}">${n}</button>`).join('')}
        </div>
        <div class="controls" style="margin-top:12px;">
          <button class="big" id="clearBtn" disabled>지우기</button>
          <button class="big" id="submitBtn" disabled>확인</button>
        </div>
      </section>
    `;
    
    const inputDisplay = $("#inputDisplay");
    const clearBtn = $("#clearBtn");
    const submitBtn = $("#submitBtn");
    
    const updateDisplay = () => {
      if (userInput.length > 0) {
        inputDisplay.innerHTML = userInput.map(d => `<span class="digitInput">${d}</span>`).join(' ');
      } else {
        inputDisplay.innerHTML = '<span style="color:var(--muted);">숫자를 입력하세요</span>';
      }
      clearBtn.disabled = userInput.length === 0;
      submitBtn.disabled = userInput.length !== inputLength;
    };
    
    updateDisplay();
    
    document.querySelectorAll('.digitBtn').forEach(btn => {
      btn.onclick = () => {
        if (userInput.length < inputLength) {
          playClick();
          userInput.push(parseInt(btn.dataset.digit));
          updateDisplay();
        }
      };
    });
    
    clearBtn.onclick = () => {
      playClick();
      userInput.pop();
      updateDisplay();
    };
    
    submitBtn.onclick = () => { playClick(); finishTrial(); };
    
    // 이전 키 핸들러 제거
    if (state.keyHandler) {
      window.removeEventListener('keydown', state.keyHandler);
    }
    
    const keyHandler = (e) => {
      if (e.key >= '0' && e.key <= '9' && userInput.length < inputLength) {
        userInput.push(parseInt(e.key));
        updateDisplay();
      } else if (e.key === 'Backspace' && userInput.length > 0) {
        userInput.pop();
        updateDisplay();
      } else if (e.key === 'Enter' && userInput.length === inputLength) {
        finishTrial();
      }
    };
    state.keyHandler = keyHandler;
    window.addEventListener('keydown', keyHandler);
    
    const finishTrial = () => {
      window.removeEventListener('keydown', keyHandler);
      state.keyHandler = null;
      const correct = userInput.length === expectedAnswer.length && userInput.every((d, i) => d === expectedAnswer[i]);
      if (correct) playCorrect(); else playWrong();
      if (isPractice) {
        app.innerHTML = `<section class="card"><div class="pill">연습 ${currentNum}/${totalNum}</div><div class="stimulusArea">${correct ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>` : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ 정답: ${expectedAnswer.join(' ')}</div>`}</div></section>`;
        setTimeout(() => resolve({ correct, userInput, expectedAnswer, digits, mode }), 1000);
      } else {
        resolve({ correct, userInput, expectedAnswer, digits, mode });
      }
    };
  });
}

function renderDigitSpanReady() {
  app.innerHTML = `
    <section class="card">
      <div class="pill">연습 완료</div>
      <h1 class="title">본 검사 시작</h1>
      <p class="desc">정순 → 역순 순서로 진행됩니다.<br/>틀리면 난이도가 조절됩니다.</p>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startTestBtn">본 검사 시작</button>
      </div>
    </section>
  `;
  $("#startTestBtn").onclick = () => { playClick(); runDigitSpanTest(); };
}

async function runDigitSpanTest() {
  state.phase = "test";
  
  // 정순
  let forwardLength = 3;
  let forwardErrors = 0;
  while (forwardErrors < 2 && forwardLength <= 9) {
    const digits = generateDigitSequence(state.rng, forwardLength);
    const result = await runSingleDigitSpanTrial(digits, "forward", false, 0, 0);
    state.digitSpan.forwardTrials.push({ length: forwardLength, correct: result.correct });
    if (result.correct) {
      state.digitSpan.forwardSpan = forwardLength;
      forwardLength++;
      forwardErrors = 0;
    } else {
      forwardErrors++;
    }
    await sleep(500);
  }
  
  // 역순
  app.innerHTML = `<section class="card"><div class="pill">역순 시작</div><h1 class="title">이제 역순입니다</h1><p class="desc">숫자를 <b>거꾸로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="cont">계속</button></div></section>`;
  await new Promise(r => { $("#cont").onclick = () => { playClick(); r(); }; });
  
  let backwardLength = 2;
  let backwardErrors = 0;
  while (backwardErrors < 2 && backwardLength <= 8) {
    const digits = generateDigitSequence(state.rng, backwardLength);
    const result = await runSingleDigitSpanTrial(digits, "backward", false, 0, 0);
    state.digitSpan.backwardTrials.push({ length: backwardLength, correct: result.correct });
    if (result.correct) {
      state.digitSpan.backwardSpan = backwardLength;
      backwardLength++;
      backwardErrors = 0;
    } else {
      backwardErrors++;
    }
    await sleep(500);
  }
  
  finishDigitSpanTest();
}

async function finishDigitSpanTest() {
  const forwardCorrect = state.digitSpan.forwardTrials.filter(t => t.correct).length;
  const backwardCorrect = state.digitSpan.backwardTrials.filter(t => t.correct).length;
  const totalTrials = state.digitSpan.forwardTrials.length + state.digitSpan.backwardTrials.length;
  const totalCorrect = forwardCorrect + backwardCorrect;
  const accuracy = totalTrials > 0 ? totalCorrect / totalTrials : 0;
  
  const summary = {
    forwardSpan: state.digitSpan.forwardSpan,
    backwardSpan: state.digitSpan.backwardSpan,
    totalSpan: state.digitSpan.forwardSpan + state.digitSpan.backwardSpan,
    forwardTrials: state.digitSpan.forwardTrials.length,
    backwardTrials: state.digitSpan.backwardTrials.length,
    forwardCorrect,
    backwardCorrect,
    accuracy: Number(accuracy.toFixed(3)),
    raw: Math.round(accuracy * 100), // 정확도 %
  };
  
  let baseline = null;
  let saveError = null;
  
  if (isLoggedIn()) {
    // 로그인 사용자: 서버에 저장하고 서버 baseline 사용
    try {
      const result = await saveResults('digitspan', summary);
      baseline = result.baseline;
    } catch (e) {
      console.error('결과 저장 실패:', e);
      saveError = e;
    }
  } else {
    // 비로그인: 로컬스토리지에 저장하고 로컬 baseline 사용
    const history = loadHistory(LS_KEYS.digitspanHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.digitspanHistory, history);
    baseline = tryUpdateBaseline(history, LS_KEYS.digitspanBaseline) || loadBaseline(LS_KEYS.digitspanBaseline);
  }
  
  state.digitspanResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline, saveError };
  saveTestProgress(); // 진행 상태 저장
  
  playComplete();
  renderDigitSpanDone();
}

function renderDigitSpanDone() {
  const { summary } = state.digitspanResult;
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 3 완료</div>
      <h1 class="title">숫자 기억 완료!</h1>
      <p class="desc">정순: <b>${summary.forwardSpan}자리</b> · 역순: <b>${summary.backwardSpan}자리</b></p>
      <div class="notice">다음은 <b>위치 기억 검사</b>입니다.</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="nextTest">다음 검사로</button>
      </div>
    </section>
  `;
  $("#nextTest").onclick = () => { playClick(); startSpatialTest(); };
}

// 검사 이어하기
export function resumeDigitSpanTest() {
  document.querySelector(".progress").textContent = "검사 3/4 · 작업기억";
  
  // 이미 완료된 경우 다음 검사로
  if (state.digitspanResult) {
    startSpatialTest();
    return;
  }
  
  // 인트로부터 시작
  renderDigitSpanIntro();
}
