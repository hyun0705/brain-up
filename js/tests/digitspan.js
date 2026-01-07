// tests/digitspan.js
import { $, sleep } from '../core/utils.js';
import { state } from '../core/state.js';
import { LS_KEYS, loadHistory, saveHistory, loadBaseline, tryUpdateBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { startSpatialTest } from './spatial.js';
import { playCorrect, playWrong, playComplete, playTick, playClick } from '../core/sound.js';

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
  document.querySelector(".progress").textContent = "검사 3/4 · 숫자기억";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 3 · 작업기억</div>
      <h1 class="title">숫자 기억 검사</h1>
      <p class="desc">
        화면에 숫자가 하나씩 나타납니다.<br/>
        <b>정순</b>: 본 순서대로 입력<br/>
        <b>역순</b>: 거꾸로 입력
      </p>
      <div class="notice">숫자를 잘 기억한 뒤, 순서대로 또는 거꾸로 입력하세요.</div>
      <div class="controls" style="grid-template-columns:1fr;">
        <button class="big" id="startPractice">연습 시작</button>
      </div>
    </section>
  `;
  $("#startPractice").onclick = () => { playClick(); runDigitSpanPractice(); };
}

async function runDigitSpanPractice() {
  app.innerHTML = `<section class="card"><div class="pill">연습 · 정순</div><h1 class="title">정순 연습</h1><p class="desc">숫자를 <b>본 순서대로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
  await new Promise(r => { $("#start").onclick = () => { playClick(); r(); }; });
  await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 3), "forward", true, 1, 1);
  app.innerHTML = `<section class="card"><div class="pill">연습 · 역순</div><h1 class="title">역순 연습</h1><p class="desc">숫자를 <b>거꾸로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
  await new Promise(r => { $("#start").onclick = () => { playClick(); r(); }; });
  await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 2), "backward", true, 1, 1);
  renderDigitSpanReady();
}

async function showDigitSequence(digits) {
  for (let i = 0; i < digits.length; i++) {
    playTick();
    app.innerHTML = `<section class="card"><div class="pill">숫자 기억</div><div class="stimulusArea"><div style="font-size:120px;font-weight:900;color:var(--accent);">${digits[i]}</div></div></section>`;
    await sleep(1000);
    if (i < digits.length - 1) { 
      app.innerHTML = `<section class="card"><div class="pill">숫자 기억</div><div class="stimulusArea"><div style="font-size:48px;color:var(--muted);">·</div></div></section>`; 
      await sleep(300); 
    }
  }
}

function runSingleDigitSpanTrial(digits, mode, isPractice, currentNum, totalNum) {
  return new Promise(async (resolve) => {
    const expectedAnswer = mode === "forward" ? digits : [...digits].reverse();
    await showDigitSequence(digits);
    let userInput = [];
    const inputLength = digits.length;
    
    const modeText = mode === "forward" ? "정순" : "역순";
    
    app.innerHTML = `
      <section class="card">
        <div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : '본 검사'} · ${modeText}</div>
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
    window.addEventListener('keydown', keyHandler);
    
    const finishTrial = () => {
      window.removeEventListener('keydown', keyHandler);
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

function finishDigitSpanTest() {
  const summary = {
    forwardSpan: state.digitSpan.forwardSpan,
    backwardSpan: state.digitSpan.backwardSpan,
    totalSpan: state.digitSpan.forwardSpan + state.digitSpan.backwardSpan,
    forwardTrials: state.digitSpan.forwardTrials.length,
    backwardTrials: state.digitSpan.backwardTrials.length,
    raw: (state.digitSpan.forwardSpan + state.digitSpan.backwardSpan) / 14 * 100,
  };
  
  const history = loadHistory(LS_KEYS.digitspanHistory);
  history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
  saveHistory(LS_KEYS.digitspanHistory, history);
  
  const baseline = tryUpdateBaseline(history, LS_KEYS.digitspanBaseline) || loadBaseline(LS_KEYS.digitspanBaseline);
  state.digitspanResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
  
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
