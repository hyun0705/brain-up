// 주의력(Go/No-Go) 훈련
import { $, sleep } from '../core/utils.js';
import { state } from '../core/state.js';
import { getAnonId, getDateKey } from '../core/storage.js';
import { playCorrect, playWrong, playComplete, playClick } from '../core/sound.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

// 훈련 기록 저장
function saveTrainingHistory(record) {
  const key = 'brainup_gonogo_training_history';
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  history.push(record);
  localStorage.setItem(key, JSON.stringify(history));
}

// 모바일 감지
function isMobile() {
  return window.innerWidth <= 768 || 'ontouchstart' in window;
}

// 문제 수 기반 훈련 시작
export function startGoNoGoTrainingWithTrials(trialCount, onComplete) {
  // 시행 순서 생성 (go:nogo = 7:3 비율)
  const trials = [];
  for (let i = 0; i < trialCount; i++) {
    trials.push(Math.random() < 0.7 ? 'go' : 'nogo');
  }
  
  state.gonogoTraining = {
    trialTypes: trials,
    results: [],
    index: 0,
    total: trialCount,
    goCorrect: 0,
    nogoCorrect: 0,
    onComplete
  };
  
  document.querySelector(".progress").textContent = "관리 · 주의력";
  
  runGoNoGoTrainingTrial();
}

function runGoNoGoTrainingTrial() {
  const t = state.gonogoTraining;
  // 관리가 중단된 경우 (홈 버튼 등으로 나감)
  if (!t) return;
  
  const trialType = t.trialTypes[t.index];
  const isGo = trialType === 'go';
  const mobile = isMobile();
  
  const inputMethod = mobile ? '화면 터치' : '스페이스바';
  
  // 자극 표시 전 대기
  app.innerHTML = `
    <section class="card">
      <div class="pill">주의력 ${t.index + 1}/${t.total}</div>
      <div class="stimulusArea">
        <div style="font-size:18px;color:var(--muted);">준비...</div>
      </div>
    </section>
  `;
  
  // 랜덤 대기 시간 (500~1500ms)
  const waitTime = 500 + Math.random() * 1000;
  
  setTimeout(() => {
    showStimulus(isGo, mobile, inputMethod);
  }, waitTime);
}

function showStimulus(isGo, mobile, inputMethod) {
  const t = state.gonogoTraining;
  // 관리가 중단된 경우 (홈 버튼 등으로 나감)
  if (!t) return;
  
  const startTime = Date.now();
  let responded = false;
  let timeoutId = null;
  
  // 자극 표시 (검사와 동일한 스타일)
  const stimulusHtml = isGo
    ? `<div style="width:140px;height:140px;background:#16a34a;border-radius:50%;box-shadow:0 4px 20px rgba(22,163,74,0.25);margin:0 auto;"></div>`
    : `<div style="width:120px;height:120px;background:#dc2626;border-radius:12px;box-shadow:0 4px 20px rgba(220,38,38,0.25);margin:0 auto;"></div>`;
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">주의력 ${t.index + 1}/${t.total}</div>
      <div class="stimulusArea" id="stimArea" style="min-height:200px;display:flex;align-items:center;justify-content:center;">
        ${stimulusHtml}
      </div>
      <div class="notice" style="text-align:center;margin-top:16px;">
        ${isGo ? `초록 원 → ${inputMethod}!` : '빨간 사각형 → 참으세요!'}
      </div>
    </section>
  `;
  
  const handleResponse = async () => {
    if (responded) return;
    responded = true;
    
    if (timeoutId) clearTimeout(timeoutId);
    window.removeEventListener('keydown', keyHandler);
    state.keyHandler = null;
    document.getElementById('stimArea')?.removeEventListener('click', clickHandler);
    
    const rt = Date.now() - startTime;
    const correct = isGo; // Go일 때 반응하면 정답
    
    if (correct) {
      playCorrect();
      t.goCorrect++;
    } else {
      playWrong();
    }
    
    t.results.push({ type: isGo ? 'go' : 'nogo', correct, rt });
    t.index++;
    
    await showFeedback(correct, isGo);
  };
  
  const handleTimeout = async () => {
    if (responded) return;
    responded = true;
    
    window.removeEventListener('keydown', keyHandler);
    state.keyHandler = null;
    document.getElementById('stimArea')?.removeEventListener('click', clickHandler);
    
    const correct = !isGo; // NoGo일 때 반응 안 하면 정답
    
    if (correct) {
      playCorrect();
      t.nogoCorrect++;
    } else {
      playWrong();
    }
    
    t.results.push({ type: isGo ? 'go' : 'nogo', correct, rt: null });
    t.index++;
    
    await showFeedback(correct, isGo);
  };
  
  // 이전 키 핸들러 제거
  if (state.keyHandler) {
    window.removeEventListener('keydown', state.keyHandler);
  }
  
  // 키보드 이벤트
  const keyHandler = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      handleResponse();
    }
  };
  state.keyHandler = keyHandler;
  window.addEventListener('keydown', keyHandler);
  
  // 터치/클릭 이벤트
  const clickHandler = () => handleResponse();
  document.getElementById('stimArea')?.addEventListener('click', clickHandler);
  
  // 타임아웃 (1.5초)
  timeoutId = setTimeout(handleTimeout, 1500);
}

async function showFeedback(correct, isGo) {
  const t = state.gonogoTraining;
  // 관리가 중단된 경우 (홈 버튼 등으로 나감)
  if (!t) return;
  
  const feedbackHtml = correct
    ? `<div style="color:var(--good);font-size:24px;font-weight:800;">✅ 정답!</div>`
    : `<div style="color:var(--warn);font-size:24px;font-weight:800;">❌ ${isGo ? '눌러야 해요!' : '참아야 해요!'}</div>`;
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">주의력 ${t.index}/${t.total}</div>
      <div class="stimulusArea">${feedbackHtml}</div>
    </section>
  `;
  
  await sleep(600);
  
  if (t.index < t.total) {
    runGoNoGoTrainingTrial();
  } else {
    finishGoNoGoTraining();
  }
}

function finishGoNoGoTraining() {
  const t = state.gonogoTraining;
  // 관리가 중단된 경우 (홈 버튼 등으로 나감)
  if (!t) return;
  
  const goTrials = t.results.filter(r => r.type === 'go');
  const nogoTrials = t.results.filter(r => r.type === 'nogo');
  const totalCorrect = t.goCorrect + t.nogoCorrect;
  
  // 기록 저장
  const record = {
    user_id: getAnonId(),
    ended_at: Date.now(),
    date_key: getDateKey(),
    total: t.total,
    correct: totalCorrect,
    goCorrect: t.goCorrect,
    nogoCorrect: t.nogoCorrect,
    goTotal: goTrials.length,
    nogoTotal: nogoTrials.length
  };
  
  saveTrainingHistory(record);
  
  // 서버에 결과 저장
  if (isLoggedIn()) {
    const summary = {
      type: 'training',
      area: 'gonogo',
      total: t.total,
      correct: totalCorrect,
      accuracy: totalCorrect / t.total,
      goAcc: goTrials.length ? t.goCorrect / goTrials.length : 0,
      nogoAcc: nogoTrials.length ? t.nogoCorrect / nogoTrials.length : 0
    };
    saveResults('training', summary).catch(e => console.error('훈련 결과 저장 실패:', e));
  }
  
  playComplete();
  
  // 콜백이 있으면 호출
  if (t.onComplete) {
    app.innerHTML = `
      <section class="card">
        <div class="pill"><i class="fa-solid fa-check"></i> 주의력 완료</div>
        <div class="stimulusArea">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <div style="font-size:18px;font-weight:700;color:var(--text);">${t.total}회 중 ${totalCorrect}회 정답</div>
        </div>
      </section>
    `;
    
    setTimeout(() => {
      t.onComplete();
    }, 1500);
  }
}
