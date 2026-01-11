// ui/result.js
import { $, showAlertModal } from '../core/utils.js';
import { state, resetState, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, getUserProfile, markGuestTestDone, markTestedThisWeekLocal } from '../core/storage.js';
import { getInterpretation, getOverallInterpretation, getTrendInterpretation } from '../core/scoring.js';
import { renderMainIntro } from './intro.js';
import { renderHome } from './home.js';
import { playClick } from '../core/sound.js';
import { startDigitSpanTraining, hasTrainedToday } from '../training/digitspan-training.js';
import { showSignupPrompt } from './auth.js';
import { isLoggedIn, saveResults } from '../core/api.js';

const app = $("#app");

export function drawHistoryChart(canvasId, limit = 10) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const w = rect.width;
  const h = rect.height;
  const pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  
  // 다크모드 체크
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const colors = {
    bg: isDark ? '#1f2937' : '#ffffff',
    grid: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#9ca3af' : '#6b7280',
  };
  
  const patternHist = loadHistory(LS_KEYS.patternHistory).slice(-limit);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory).slice(-limit);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory).slice(-limit);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory).slice(-limit);
  
  const normalize = (hist, key = 'raw', max = 100) => {
    return hist.map((x, i) => ({
      idx: i,
      value: Math.min(100, Math.max(0, (x.summary[key] / max) * 100)),
      date: new Date(x.ended_at)
    }));
  };
  
  const datasets = [
    { name: '처리속도', color: isDark ? '#60a5fa' : '#2563eb', data: normalize(patternHist, 'raw', 100) },
    { name: '주의·억제', color: isDark ? '#34d399' : '#16a34a', data: normalize(gonogoHist, 'raw', 100) },
    { name: '작업기억', color: isDark ? '#fb923c' : '#ea580c', data: normalize(digitspanHist, 'raw', 100) },
    { name: '위치기억', color: isDark ? '#f87171' : '#dc2626', data: normalize(spatialHist, 'raw', 100) },
  ];
  
  const maxLen = Math.max(...datasets.map(d => d.data.length), 1);
  
  if (maxLen < 2) {
    ctx.fillStyle = colors.text;
    ctx.font = '15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('기록이 2회 이상 쌓이면 차트가 표시됩니다', w / 2, h / 2);
    return;
  }
  
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    
    ctx.fillStyle = colors.text;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(String(100 - i * 25), pad.left - 8, y + 4);
  }
  
  ctx.fillStyle = colors.text;
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  for (let i = 0; i < maxLen; i++) {
    const x = pad.left + (chartW / (maxLen - 1)) * i;
    ctx.fillText(String(i + 1), x, h - 10);
  }
  
  datasets.forEach(dataset => {
    if (dataset.data.length < 2) return;
    
    ctx.strokeStyle = dataset.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    
    dataset.data.forEach((point, i) => {
      const x = pad.left + (chartW / (maxLen - 1)) * i;
      const y = pad.top + chartH - (point.value / 100) * chartH;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    
    ctx.stroke();
    
    const lastPoint = dataset.data[dataset.data.length - 1];
    const lastX = pad.left + (chartW / (maxLen - 1)) * (dataset.data.length - 1);
    const lastY = pad.top + chartH - (lastPoint.value / 100) * chartH;
    
    ctx.fillStyle = dataset.color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function renderChartLegend() {
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px;">
      <span style="font-size:13px;"><span style="color:#2563eb;">●</span> 처리속도</span>
      <span style="font-size:13px;"><span style="color:#16a34a;">●</span> 주의·억제</span>
      <span style="font-size:13px;"><span style="color:#ea580c;">●</span> 작업기억</span>
      <span style="font-size:13px;"><span style="color:#dc2626;">●</span> 위치기억</span>
    </div>
  `;
}

export function renderFinalResult() {
  // 검사 완료 - 세션 상태 삭제
  clearTestProgress();
  
  // 비로그인이면 1회 체험 완료 기록
  if (!isLoggedIn()) {
    markGuestTestDone();
  } else {
    // 로그인 사용자는 이번 주 검사 완료 마킹
    markTestedThisWeekLocal();
  }
  
  const p = state.patternResult;
  const g = state.gonogoResult;
  const d = state.digitspanResult;
  const s = state.spatialResult;
  const profile = getUserProfile();
  
  // 저장 실패 여부 확인
  const hasSaveError = isLoggedIn() && (p.saveError || g.saveError || d.saveError || s.saveError);

  const getStatusClass = (label) => {
    if (label === "좋아지는 중") return "good";
    if (label === "변동 있음") return "warn";
    return "normal";
  };

  const pInterp = getInterpretation('pattern', p.index.index);
  const gInterp = getInterpretation('gonogo', g.index.index);
  const dInterp = getInterpretation('digitspan', d.index.index);
  const sInterp = getInterpretation('spatial', s.index.index);
  
  const overallInterp = getOverallInterpretation(p.index.index, g.index.index, d.index.index, s.index.index);
  const trendInterp = getTrendInterpretation(LS_KEYS.patternHistory);

  document.querySelector(".progress").textContent = "검사 완료";
  
  let profileInfo = '';
  if (profile && profile.age) {
    profileInfo = `<span style="color:var(--muted);font-size:14px;margin-left:8px;">${profile.age} ${profile.gender === 'male' ? '남성' : profile.gender === 'female' ? '여성' : ''}</span>`;
  }

  // 저장 실패 배너
  const saveErrorBanner = hasSaveError ? `
    <div class="saveErrorBanner" style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
      <i class="fa-solid fa-exclamation-triangle" style="color:#dc2626;font-size:18px;"></i>
      <div style="flex:1;">
        <div style="font-weight:600;color:#dc2626;font-size:14px;">결과 저장 실패</div>
        <div style="color:#7f1d1d;font-size:13px;">네트워크 문제로 저장되지 않았어요</div>
      </div>
      <button id="retrySave" style="background:#dc2626;color:white;border:none;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;">
        재시도
      </button>
    </div>
  ` : '';

  // 관리 섹션 (로그인 여부에 따라 다르게 표시)
  let trainingSection = '';
  if (!isLoggedIn()) {
    // 비로그인: 로그인 유도 카드
    trainingSection = `
      <div class="homeCard action" id="goLoginForTraining" style="margin-top:16px;">
        <div class="homeCardIcon"><i class="fa-solid fa-right-to-bracket"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">결과 저장 & 관리하기</div>
          <div class="homeCardDesc">로그인하면 모든 기능을 이용할 수 있어요</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else if (!hasTrainedToday()) {
    // 로그인 + 오늘 관리 안함
    trainingSection = `
      <div class="homeCard action" id="goTraining" style="margin-top:16px;">
        <div class="homeCardIcon"><i class="fa-solid fa-brain"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">오늘의 두뇌 관리</div>
          <div class="homeCardDesc">작업기억 · 약 3분 소요</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
    `;
  } else {
    // 로그인 + 오늘 관리 완료
    trainingSection = `
      <div class="homeCard done" style="margin-top:16px;">
        <div class="homeCardIcon"><i class="fa-solid fa-circle-check"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">오늘 관리 완료</div>
          <div class="homeCardDesc">잘 하셨어요! 내일 또 만나요</div>
        </div>
      </div>
    `;
  }

  app.innerHTML = `
    <section class="card">
      ${saveErrorBanner}
      <div class="pill">검사 완료${profileInfo}</div>
      <h1 class="title">오늘의 인지기능 결과</h1>

      <div class="interpretBox overall">
        <p class="interpMain">${overallInterp}</p>
        <p class="interpSub">${trendInterp}</p>
      </div>

      <div class="resultGrid">
        <div class="stat pattern">
          <div class="label">처리속도</div>
          <div class="value">${p.summary.raw}<small>%</small></div>
          <div class="detail">정답 ${p.summary.correctN || 0}/${p.summary.answered}</div>
        </div>

        <div class="stat gonogo">
          <div class="label">주의·억제</div>
          <div class="value">${g.summary.raw}<small>%</small></div>
          <div class="detail">Go ${g.summary.goCorrect || Math.round((g.summary.goAcc || 0) * (g.summary.goTrials || 0))}/${g.summary.goTrials || 0} · NoGo ${g.summary.nogoCorrect || Math.round((g.summary.nogoAcc || 0) * (g.summary.nogoTrials || 0))}/${g.summary.nogoTrials || 0}</div>
        </div>

        <div class="stat digitspan">
          <div class="label">작업기억</div>
          <div class="value">${d.summary.raw}<small>%</small></div>
          <div class="detail">정순 ${d.summary.forwardCorrect || 0}/${d.summary.forwardTrials || 0} · 역순 ${d.summary.backwardCorrect || 0}/${d.summary.backwardTrials || 0}</div>
        </div>

        <div class="stat spatial">
          <div class="label">위치기억</div>
          <div class="value">${s.summary.raw}<small>%</small></div>
          <div class="detail">정답 ${s.summary.correctTrials}/${s.summary.totalTrials}</div>
        </div>
      </div>

      <div class="interpretSection">
        <div class="interpretItem pattern">
          <span class="interpText"><b>처리속도</b> ${pInterp}</span>
        </div>
        <div class="interpretItem gonogo">
          <span class="interpText"><b>주의·억제</b> ${gInterp}</span>
        </div>
        <div class="interpretItem digitspan">
          <span class="interpText"><b>작업기억</b> ${dInterp}</span>
        </div>
        <div class="interpretItem spatial">
          <span class="interpText"><b>위치기억</b> ${sInterp}</span>
        </div>
      </div>

      <div class="chartSection">
        <div class="label" style="margin-bottom:8px;">변화 추이 (최근 10회)</div>
        <canvas id="historyChart" style="width:100%;height:180px;"></canvas>
        ${renderChartLegend()}
      </div>

      ${trainingSection}

      <div class="controls" style="margin-top:14px;grid-template-columns:1fr;">
        <button class="big" id="goHome">홈으로</button>
      </div>
    </section>
  `;

  setTimeout(() => drawHistoryChart('historyChart'), 50);

  // 비로그인 상태: 로그인 카드 클릭 시 회원가입 팝업
  if (!isLoggedIn()) {
    $("#goLoginForTraining").onclick = () => {
      playClick();
      showSignupPrompt();
    };
  } else if (!hasTrainedToday() && $("#goTraining")) {
    // 로그인 상태: 관리 시작
    $("#goTraining").onclick = () => {
      playClick();
      startDigitSpanTraining();
    };
  }
  
  $("#goHome").onclick = () => {
    playClick();
    clearTestProgress(); // 검사 진행 상태 삭제
    renderHome();
  };
  
  // 재시도 버튼
  if ($("#retrySave")) {
    $("#retrySave").onclick = async () => {
      const btn = $("#retrySave");
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      
      try {
        // 실패한 결과들 재시도
        const retryPromises = [];
        if (p.saveError) retryPromises.push(saveResults('pattern', p.summary).then(() => { p.saveError = null; }));
        if (g.saveError) retryPromises.push(saveResults('gonogo', g.summary).then(() => { g.saveError = null; }));
        if (d.saveError) retryPromises.push(saveResults('digitspan', d.summary).then(() => { d.saveError = null; }));
        if (s.saveError) retryPromises.push(saveResults('spatial', s.summary).then(() => { s.saveError = null; }));
        
        await Promise.all(retryPromises);
        
        // 성공하면 배너 숨기기
        const banner = document.querySelector('.saveErrorBanner');
        if (banner) {
          banner.style.background = '#f0fdf4';
          banner.style.borderColor = '#bbf7d0';
          banner.innerHTML = `
            <i class="fa-solid fa-check-circle" style="color:#16a34a;font-size:18px;"></i>
            <div style="flex:1;">
              <div style="font-weight:600;color:#16a34a;font-size:14px;">저장 완료!</div>
              <div style="color:#166534;font-size:13px;">결과가 정상적으로 저장되었어요</div>
            </div>
          `;
          setTimeout(() => banner.remove(), 2000);
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '재시도';
        showAlertModal({
          title: '저장 실패',
          message: '저장에 실패했어요. 잠시 후 다시 시도해주세요.',
          type: 'error'
        });
      }
    };
  }
}

function showHistory() {
  const box = document.createElement('div');
  box.className = 'notice';
  box.style.marginTop = '12px';
  
  const patternHist = loadHistory(LS_KEYS.patternHistory).slice(-5).reverse();
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory).slice(-5).reverse();
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory).slice(-5).reverse();
  const spatialHist = loadHistory(LS_KEYS.spatialHistory).slice(-5).reverse();

  let html = `<b>최근 기록 (최신 5개)</b><br/><br/>`;

  html += `<b>패턴 비교:</b><br/>`;
  patternHist.forEach(x => { html += `• ${new Date(x.ended_at).toLocaleDateString()} - ${x.summary.answered}개, ${Math.round(x.summary.accuracy * 100)}%<br/>`; });
  if (!patternHist.length) html += `- 없음<br/>`;

  html += `<br/><b>Go/No-Go:</b><br/>`;
  gonogoHist.forEach(x => { html += `• ${new Date(x.ended_at).toLocaleDateString()} - Go ${Math.round(x.summary.goAcc * 100)}%, NoGo ${Math.round(x.summary.nogoAcc * 100)}%<br/>`; });
  if (!gonogoHist.length) html += `- 없음<br/>`;

  html += `<br/><b>숫자 기억:</b><br/>`;
  digitspanHist.forEach(x => { html += `• ${new Date(x.ended_at).toLocaleDateString()} - 정순 ${x.summary.forwardSpan}, 역순 ${x.summary.backwardSpan}<br/>`; });
  if (!digitspanHist.length) html += `- 없음<br/>`;

  html += `<br/><b>위치 기억:</b><br/>`;
  spatialHist.forEach(x => { html += `• ${new Date(x.ended_at).toLocaleDateString()} - ${x.summary.correctTrials}/6, ${Math.round(x.summary.avgAccuracy * 100)}%<br/>`; });
  if (!spatialHist.length) html += `- 없음<br/>`;

  box.innerHTML = html;
  
  const existing = document.getElementById('historyBox');
  if (existing) existing.remove();
  
  box.id = 'historyBox';
  app.querySelector('.card').appendChild(box);
}
