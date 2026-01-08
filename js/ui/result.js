// ui/result.js
import { $ } from '../core/utils.js';
import { state, resetState, clearTestProgress } from '../core/state.js';
import { LS_KEYS, loadHistory, getUserProfile, markGuestTestDone } from '../core/storage.js';
import { getInterpretation, getOverallInterpretation, getTrendInterpretation } from '../core/scoring.js';
import { renderMainIntro } from './intro.js';
import { renderHome } from './home.js';
import { playClick } from '../core/sound.js';
import { startDigitSpanTraining, hasTrainedToday } from '../training/digitspan-training.js';
import { isLoggedIn, showSignupPrompt } from './auth.js';

const app = $("#app");

export function drawHistoryChart(canvasId) {
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
  
  const patternHist = loadHistory(LS_KEYS.patternHistory).slice(-10);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory).slice(-10);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory).slice(-10);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory).slice(-10);
  
  const normalize = (hist, key = 'raw', max = 100) => {
    return hist.map((x, i) => ({
      idx: i,
      value: Math.min(100, Math.max(0, (x.summary[key] / max) * 100)),
      date: new Date(x.ended_at)
    }));
  };
  
  const datasets = [
    { name: '처리속도', color: '#2563eb', data: normalize(patternHist, 'raw', 50) },
    { name: '주의·억제', color: '#16a34a', data: normalize(gonogoHist, 'raw', 100) },
    { name: '숫자기억', color: '#ea580c', data: normalize(digitspanHist, 'totalSpan', 14) },
    { name: '위치기억', color: '#dc2626', data: normalize(spatialHist, 'raw', 100) },
  ];
  
  const maxLen = Math.max(...datasets.map(d => d.data.length), 1);
  
  if (maxLen < 2) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '15px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('기록이 2회 이상 쌓이면 차트가 표시됩니다', w / 2, h / 2);
    return;
  }
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(String(100 - i * 25), pad.left - 8, y + 4);
  }
  
  ctx.fillStyle = '#6b7280';
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
      <span style="font-size:13px;"><span style="color:#ea580c;">●</span> 숫자기억</span>
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
  }
  
  const p = state.patternResult;
  const g = state.gonogoResult;
  const d = state.digitspanResult;
  const s = state.spatialResult;
  const profile = getUserProfile();

  const getBadgeClass = (label) => {
    if (label === "좋아지는 중") return "badgeGood";
    if (label === "변동 있음") return "badgeWarn";
    return "";
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

  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 완료${profileInfo}</div>
      <h1 class="title">오늘의 인지기능 결과</h1>

      <div class="interpretBox overall">
        <p class="interpMain">${overallInterp}</p>
        <p class="interpSub">${trendInterp}</p>
      </div>

      <div class="resultGrid">
        <div class="stat" style="padding:14px;">
          <div class="label">처리속도</div>
          <div class="value">${p.index.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(p.index.label)}">${p.index.label}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px;">
            ${p.summary.answered}문제 · ${Math.round(p.summary.accuracy * 100)}%
          </div>
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">주의·억제</div>
          <div class="value">${g.index.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(g.index.label)}">${g.index.label}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px;">
            Go ${Math.round(g.summary.goAcc * 100)}% · NoGo ${Math.round(g.summary.nogoAcc * 100)}%
          </div>
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">숫자 기억</div>
          <div class="value">${d.index.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(d.index.label)}">${d.index.label}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px;">
            정순 ${d.summary.forwardSpan} · 역순 ${d.summary.backwardSpan}
          </div>
        </div>

        <div class="stat" style="padding:14px;">
          <div class="label">위치 기억</div>
          <div class="value">${s.index.index}<small>/100</small></div>
          <div style="font-size:14px;" class="${getBadgeClass(s.index.label)}">${s.index.label}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:6px;">
            ${s.summary.correctTrials}/6 정답 · ${Math.round(s.summary.avgAccuracy * 100)}%
          </div>
        </div>
      </div>

      <div class="interpretSection">
        <div class="interpretItem">
          <span class="interpIcon" style="color:#2563eb;">●</span>
          <span class="interpText">${pInterp}</span>
        </div>
        <div class="interpretItem">
          <span class="interpIcon" style="color:#16a34a;">●</span>
          <span class="interpText">${gInterp}</span>
        </div>
        <div class="interpretItem">
          <span class="interpIcon" style="color:#ea580c;">●</span>
          <span class="interpText">${dInterp}</span>
        </div>
        <div class="interpretItem">
          <span class="interpIcon" style="color:#dc2626;">●</span>
          <span class="interpText">${sInterp}</span>
        </div>
      </div>

      <div class="chartSection">
        <div class="label" style="margin-bottom:8px;">변화 추이 (최근 10회)</div>
        <canvas id="historyChart" style="width:100%;height:180px;"></canvas>
        ${renderChartLegend()}
      </div>

      ${!hasTrainedToday() ? `
      <div class="homeCard action" id="goTraining" style="margin-top:16px;">
        <div class="homeCardIcon"><i class="fa-solid fa-brain"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">오늘의 두뇌 관리</div>
          <div class="homeCardDesc">작업기억 · 약 3분 소요</div>
        </div>
        <div class="homeCardArrow"><i class="fa-solid fa-chevron-right"></i></div>
      </div>
      ` : `
      <div class="homeCard done" style="margin-top:16px;">
        <div class="homeCardIcon"><i class="fa-solid fa-circle-check"></i></div>
        <div class="homeCardContent">
          <div class="homeCardTitle">오늘 관리 완료</div>
          <div class="homeCardDesc">잘 하셨어요! 내일 또 만나요</div>
        </div>
      </div>
      `}

      <div class="controls" style="margin-top:14px;grid-template-columns:1fr;">
        <button class="big" id="goHome">홈으로</button>
      </div>
    </section>
  `;

  setTimeout(() => drawHistoryChart('historyChart'), 50);

  // 비로그인 상태면 회원가입 유도
  if (!isLoggedIn()) {
    setTimeout(() => showSignupPrompt(), 1000);
  }

  if (!hasTrainedToday()) {
    $("#goTraining").onclick = async () => {
      playClick();
      // 로그인 체크
      if (!isLoggedIn()) {
        alert('관리 기능은 로그인 후 이용할 수 있어요.');
        const { renderLogin } = await import('./auth.js');
        renderLogin();
        return;
      }
      startDigitSpanTraining();
    };
  }
  
  $("#goHome").onclick = () => {
    playClick();
    clearTestProgress(); // 검사 진행 상태 삭제
    renderHome();
  };
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
