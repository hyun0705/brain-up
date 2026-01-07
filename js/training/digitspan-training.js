// training/digitspan-training.js
import { $, sleep, clamp } from '../core/utils.js';
import { state } from '../core/state.js';
import { LS_KEYS, loadHistory, getAnonId, getDateKey, hasTrainedToday, getStreak } from '../core/storage.js';
import { playCorrect, playWrong, playComplete, playTick, playClick } from '../core/sound.js';
import { renderHome } from '../ui/home.js';
import { renderPastResults } from '../ui/intro.js';

// re-export for other modules
export { hasTrainedToday, getStreak };

const app = $("#app");

// ========== 유틸 함수 ==========

// 관리 기록 저장
function saveTrainingHistory(history) {
  localStorage.setItem(LS_KEYS.digitspanTrainingHistory, JSON.stringify(history));
}

// 추천 난이도 (span - 1)
function getPlannedSpan() {
  const history = loadHistory(LS_KEYS.digitspanHistory);
  if (history.length === 0) return 3; // 기본값
  const last = history[history.length - 1];
  const forwardSpan = last.summary?.forwardSpan || 4;
  return clamp(forwardSpan - 1, 2, 9);
}

// 숫자 시퀀스 생성
function generateDigitSequence(length) {
  const digits = [];
  for (let i = 0; i < length; i++) {
    let d;
    do {
      d = Math.floor(Math.random() * 10);
    } while (digits.length > 0 && digits[digits.length - 1] === d);
    digits.push(d);
  }
  return digits;
}

// ========== 멘트 ==========

function getEncouragementMessage(correct) {
  if (correct) {
    const messages = ['잘 하셨어요', '정확해요', '좋습니다', '훌륭해요'];
    return messages[Math.floor(Math.random() * messages.length)];
  } else {
    const messages = ['괜찮아요', '천천히 해도 돼요', '다음엔 더 잘할 수 있어요', '걱정 마세요'];
    return messages[Math.floor(Math.random() * messages.length)];
  }
}

function getCompletionMessage(streak) {
  if (streak >= 30) return '한 달 넘게 꾸준히 하고 계시네요. 정말 대단해요!';
  if (streak >= 14) return '2주 연속 달성! 훌륭합니다';
  if (streak >= 7) return '일주일 연속! 좋은 습관이 만들어지고 있어요';
  if (streak >= 3) return '꾸준히 잘 하고 계세요';
  return '오늘도 잘 마무리하셨어요';
}

// ========== 화면 ==========

export function startDigitSpanTraining() {
  if (hasTrainedToday()) {
    renderAlreadyDone();
    return;
  }
  renderTrainingIntro();
}

function renderAlreadyDone() {
  document.querySelector(".progress").textContent = "관리 · 작업기억";
  
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

function renderTrainingIntro() {
  document.querySelector(".progress").textContent = "관리 · 작업기억";
  
  const plannedSpan = getPlannedSpan();
  
  // state에 저장
  state.trainingSpan = plannedSpan;
  state.trainingTrials = [];
  state.trainingIndex = 0;
  state.trainingTotal = 5;
  state.trainingCorrect = 0;
  
  app.innerHTML = `
    <section class="card">
      <div class="pill"><i class="fa-solid fa-brain"></i> 작업기억 관리</div>
      <h1 class="title">오늘의 두뇌 관리</h1>
      <p class="desc">
        화면에 나타나는 숫자를 기억한 뒤<br/>
        <b>순서대로</b> 입력해주세요.
      </p>
      
      <div class="trainingInfo">
        <div class="trainingInfoItem">
          <i class="fa-solid fa-hashtag"></i>
          <span>${plannedSpan}자리 숫자</span>
        </div>
        <div class="trainingInfoItem">
          <i class="fa-solid fa-repeat"></i>
          <span>총 5회 진행</span>
        </div>
        <div class="trainingInfoItem">
          <i class="fa-solid fa-clock"></i>
          <span>약 3분 소요</span>
        </div>
      </div>
      
      <div class="notice">
        <i class="fa-solid fa-lightbulb" style="color:var(--accent);"></i>
        맞고 틀리는 건 중요하지 않아요.<br/>
        매일 꾸준히 하는 것이 핵심입니다.
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:14px;">
        <button class="big" id="startTraining">시작하기</button>
      </div>
    </section>
  `;
  
  $("#startTraining").onclick = () => { playClick(); runTrainingTrial(); };
}

async function showDigitSequence(digits) {
  for (let i = 0; i < digits.length; i++) {
    playTick();
    app.innerHTML = `
      <section class="card">
        <div class="pill">관리 ${state.trainingIndex + 1}/${state.trainingTotal}</div>
        <div class="stimulusArea">
          <div style="font-size:120px;font-weight:900;color:var(--accent);">${digits[i]}</div>
        </div>
      </section>
    `;
    await sleep(1000);
    if (i < digits.length - 1) {
      app.innerHTML = `
        <section class="card">
          <div class="pill">관리 ${state.trainingIndex + 1}/${state.trainingTotal}</div>
          <div class="stimulusArea">
            <div style="font-size:48px;color:var(--muted);">·</div>
          </div>
        </section>
      `;
      await sleep(300);
    }
  }
}

async function runTrainingTrial() {
  const digits = generateDigitSequence(state.trainingSpan);
  const expectedAnswer = digits;
  
  await showDigitSequence(digits);
  
  let userInput = [];
  const inputLength = digits.length;
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">관리 ${state.trainingIndex + 1}/${state.trainingTotal}</div>
      <div style="text-align:center;margin:20px 0;">
        <div style="font-size:15px;color:var(--muted);margin-bottom:8px;">${digits.length}자리 입력</div>
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
  
  const finishTrial = async () => {
    const correct = userInput.length === expectedAnswer.length && 
                    userInput.every((d, i) => d === expectedAnswer[i]);
    
    if (correct) {
      playCorrect();
      state.trainingCorrect++;
    } else {
      playWrong();
    }
    
    state.trainingTrials.push({ correct, digits, userInput });
    state.trainingIndex++;
    
    // 검사 모드와 동일한 피드백
    const feedbackHtml = correct
      ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>`
      : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ 정답: ${expectedAnswer.join(' ')}</div>`;
    
    app.innerHTML = `
      <section class="card">
        <div class="pill">관리 ${state.trainingIndex}/${state.trainingTotal}</div>
        <div class="stimulusArea">
          ${feedbackHtml}
        </div>
      </section>
    `;
    
    await sleep(1000);
    
    if (state.trainingIndex < state.trainingTotal) {
      runTrainingTrial();
    } else {
      finishTraining();
    }
  };
  
  submitBtn.onclick = () => { playClick(); finishTrial(); };
  
  // 키보드 입력
  const keyHandler = (e) => {
    if (e.key >= '0' && e.key <= '9' && userInput.length < inputLength) {
      playClick();
      userInput.push(parseInt(e.key));
      updateDisplay();
    } else if (e.key === 'Backspace' && userInput.length > 0) {
      playClick();
      userInput.pop();
      updateDisplay();
    } else if (e.key === 'Enter' && userInput.length === inputLength) {
      playClick();
      window.removeEventListener('keydown', keyHandler);
      finishTrial();
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function finishTraining() {
  playComplete();
  
  // 저장 포맷 (설계대로)
  const record = {
    user_id: getAnonId(),
    ended_at: Date.now(),
    date_key: getDateKey(),
    planned_span: state.trainingSpan,
    mode: "forward",
    total: state.trainingTotal,
    correct: state.trainingCorrect
  };
  
  const history = loadHistory(LS_KEYS.digitspanTrainingHistory);
  history.push(record);
  saveTrainingHistory(history);
  
  const streak = getStreak();
  
  app.innerHTML = `
    <section class="card">
      <div class="pill"><i class="fa-solid fa-check"></i> 관리 완료</div>
      <h1 class="title">오늘 관리를 마쳤어요</h1>
      <p class="desc">
        ${state.trainingTotal}회 중 ${state.trainingCorrect}회 정답<br/>
        ${getCompletionMessage(streak)}
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
