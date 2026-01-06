(() => {
  // ---------------------------
  // Utilities
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const TEST_DURATION_MS = 10000; // 테스트용 10초 (배포시 60000으로)

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function nowMs() { return performance.now(); }
  function formatMMSS(totalMs) {
    const s = Math.max(0, Math.ceil(totalMs / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function genSeed() {
    return (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------------------------
  // Storage
  // ---------------------------
  const LS_KEYS = {
    anonId: "bc_anon_id_v1",
    patternHistory: "bc_pattern_history_v1",
    patternBaseline: "bc_pattern_baseline_v1",
    gonogoHistory: "bc_gonogo_history_v1",
    gonogoBaseline: "bc_gonogo_baseline_v1",
    digitspanHistory: "bc_digitspan_history_v1",
    digitspanBaseline: "bc_digitspan_baseline_v1",
    spatialHistory: "bc_spatial_history_v1",
    spatialBaseline: "bc_spatial_baseline_v1",
  };

  function getAnonId() {
    let id = localStorage.getItem(LS_KEYS.anonId);
    if (!id) {
      id = `anon_${crypto?.randomUUID?.() ?? `${Date.now()}_${Math.floor(Math.random() * 1e6)}`}`;
      localStorage.setItem(LS_KEYS.anonId, id);
    }
    return id;
  }

  function loadHistory(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }
  function saveHistory(key, items) {
    localStorage.setItem(key, JSON.stringify(items));
  }

  function loadBaseline(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }
  function saveBaseline(key, b) {
    localStorage.setItem(key, JSON.stringify(b));
  }

  // ---------------------------
  // Pattern stimulus generator
  // ---------------------------
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
    const cellPx = 24;
    const gapPx = 3;
    const pad = 12;

    const w = pad * 2 + size * cellPx + (size - 1) * gapPx;
    const h = w;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        const x = pad + c * (cellPx + gapPx);
        const y = pad + r * (cellPx + gapPx);
        ctx.fillStyle = cells[i] ? "#00d4ff" : "#2a2a4a";
        ctx.fillRect(x, y, cellPx, cellPx);
      }
    }

    ctx.strokeStyle = "#243057";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  function diffToToggleCount(level) {
    if (level <= 2) return 1;
    if (level <= 4) return 2;
    return 3;
  }

  function nextPatternTrial(state) {
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
      stimulus_seed: state.seed,
      toggled,
      left,
      right,
    };
  }

  function updatePatternDifficulty(state) {
    const last = state.trials.slice(-10);
    if (last.length < 10) return;
    const acc = last.filter(t => t.correct).length / last.length;
    if (acc >= 0.9) state.difficulty = clamp(state.difficulty + 1, 1, 5);
    else if (acc <= 0.7) state.difficulty = clamp(state.difficulty - 1, 1, 5);
  }

  // ---------------------------
  // Scoring functions
  // ---------------------------
  function computePatternSummary(state) {
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

  function computeIndexFromBaseline(raw, baseline) {
    if (!baseline || !Number.isFinite(baseline.mean) || !Number.isFinite(baseline.sd) || baseline.sd <= 0) {
      return { index: 50, label: "안정적", note: "기준을 만드는 중" };
    }
    const z = (raw - baseline.mean) / Math.max(1e-6, baseline.sd);
    const idx = clamp(Math.round(50 + 20 * z), 0, 100);
    let label = "안정적";
    let note = "최근 평균과 비슷해요";
    if (idx >= 55) { label = "좋아지는 중"; note = "최근 평균보다 좋은 편이에요"; }
    else if (idx < 45) { label = "변동 있음"; note = "컨디션/환경 영향이 있었을 수 있어요"; }
    return { index: idx, label, note };
  }

  // ---------------------------
  // Result Interpretation System (결과 해석 문구)
  // ---------------------------
  const INTERPRETATIONS = {
    pattern: {
      high: [
        "오늘 반응속도가 빠른 편이에요! 집중력이 잘 유지되고 있어요.",
        "패턴을 빠르고 정확하게 구별하셨어요. 시각적 처리가 좋은 상태예요.",
      ],
      normal: [
        "반응속도가 평소와 비슷해요. 꾸준히 유지되고 있어요.",
        "오늘도 안정적인 처리속도를 보여주셨어요.",
      ],
      low: [
        "오늘은 조금 여유롭게 푸셨네요. 피로하실 때는 자연스러운 거예요.",
        "평소보다 조금 느린 편이에요. 컨디션이나 환경 영향일 수 있어요.",
      ],
    },
    gonogo: {
      high: [
        "주의력과 억제력이 모두 좋아요! 집중할 때와 참을 때를 잘 구분하셨어요.",
        "반응해야 할 때와 참아야 할 때를 정확히 판단하셨어요.",
      ],
      normal: [
        "주의력이 평소와 비슷한 수준이에요.",
        "오늘도 안정적인 주의력을 보여주셨어요.",
      ],
      low: [
        "오늘은 집중이 조금 흔들린 편이에요. 피곴하시거나 주변이 산만했을 수 있어요.",
        "빨간 사각형에 반응한 경우가 있었어요. 다음엔 조금 더 여유를 가져보세요.",
      ],
    },
    digitspan: {
      high: [
        "기억력이 좋은 상태예요! 숫자를 잘 기억하고 조작하셨어요.",
        "작업기억이 활발하게 작동하고 있어요.",
      ],
      normal: [
        "기억력이 평소와 비슷해요. 꾸준히 유지되고 있어요.",
        "오늘도 안정적인 기억력을 보여주셨어요.",
      ],
      low: [
        "오늘은 숫자 기억이 조금 어려웠던 것 같아요. 피로할 때 자연스러운 현상이에요.",
        "역순 기억이 조금 힘들었던 것 같아요. 다음엔 더 편한 상태에서 해보세요.",
      ],
    },
    spatial: {
      high: [
        "공간 기억력이 좋아요! 위치를 정확하게 기억하셨어요.",
        "시각적 기억이 잘 작동하고 있어요.",
      ],
      normal: [
        "공간 기억력이 평소와 비슷해요.",
        "오늘도 안정적인 공간 기억력을 보여주셨어요.",
      ],
      low: [
        "오늘은 위치 기억이 조금 헷갈렸던 것 같아요. 집중하기 어려운 환경이었을 수 있어요.",
        "칸 수가 많아지면서 어려웠던 것 같아요. 다음엔 더 편하게 해보세요.",
      ],
    },
    overall: {
      excellent: [
        "오늘 전반적으로 좋은 컨디션이에요! 모든 영역에서 안정적이거나 향상된 모습을 보여주셨어요.",
        "오늘 뇌가 활발하게 작동한 날이에요! 이 상태를 유지해보세요.",
      ],
      good: [
        "오늘 대체로 좋은 컨디션이에요. 꾸준히 측정하면서 변화를 살펴보세요.",
        "전반적으로 안정적인 결과예요. 잘하고 계세요!",
      ],
      mixed: [
        "오늘은 영역별로 조금씩 다른 결과가 나왔어요. 자연스러운 변동이니 걱정 안 하셔도 돼요.",
        "몇몇 영역에서 조금 흔들렸지만, 전체적으로는 괜찮아요. 다음에 다시 확인해보세요.",
      ],
      needsRest: [
        "오늘은 전반적으로 컨디션이 좋지 않았던 것 같아요. 피로하실 때는 누구나 그래요.",
        "조금 힘든 하루였나요? 충분히 쉬시고 다음에 다시 해보세요. 하루의 결과로 판단하지 않아도 돼요.",
      ],
    },
    trend: {
      improving: "최근 기록을 보면 점점 좋아지고 있어요! 이 추세를 유지해보세요.",
      stable: "최근 기록이 안정적으로 유지되고 있어요. 꾸준히 하고 계신 게 좋아요.",
      variable: "최근 기록이 조금씩 오르락내리락 해요. 컨디션에 따라 달라지는 건 자연스러운 거예요.",
      firstTime: "첫 검사네요! 앞으로 2~3회 더 측정하면 본인만의 기준이 만들어져요.",
    },
    reassurance: [
      "하루의 결과로 너무 걱정하지 마세요. 꾸준한 추세가 더 중요해요.",
      "이 검사는 진단이 아닌 건강 기록이에요. 편하게 참고해주세요.",
      "컨디션, 수면, 주변 환경에 따라 결과가 달라질 수 있어요.",
    ],
  };

  function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getInterpretation(type, index) {
    const interp = INTERPRETATIONS[type];
    if (!interp) return '';
    
    if (index >= 55) return getRandomItem(interp.high);
    if (index >= 45) return getRandomItem(interp.normal);
    return getRandomItem(interp.low);
  }

  function getOverallInterpretation(pIdx, gIdx, dIdx, sIdx) {
    const indices = [pIdx, gIdx, dIdx, sIdx].filter(x => typeof x === 'number');
    if (indices.length === 0) return '';
    
    const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
    const lowCount = indices.filter(x => x < 45).length;
    const highCount = indices.filter(x => x >= 55).length;
    
    if (avg >= 55 && lowCount === 0) {
      return getRandomItem(INTERPRETATIONS.overall.excellent);
    } else if (avg >= 50 && lowCount <= 1) {
      return getRandomItem(INTERPRETATIONS.overall.good);
    } else if (lowCount >= 3) {
      return getRandomItem(INTERPRETATIONS.overall.needsRest);
    } else {
      return getRandomItem(INTERPRETATIONS.overall.mixed);
    }
  }

  function getTrendInterpretation(historyKey) {
    const history = loadHistory(historyKey);
    if (history.length === 0) return INTERPRETATIONS.trend.firstTime;
    if (history.length < 3) return INTERPRETATIONS.trend.firstTime;
    
    const recent = history.slice(-5).map(x => x.summary.raw);
    if (recent.length < 2) return INTERPRETATIONS.trend.stable;
    
    // 간단한 추세 분석
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    const threshold = firstAvg * 0.1; // 10% 변화
    
    if (diff > threshold) return INTERPRETATIONS.trend.improving;
    if (diff < -threshold) return INTERPRETATIONS.trend.variable;
    return INTERPRETATIONS.trend.stable;
  }

  function tryUpdateBaseline(history, baselineKey) {
    const baseline = loadBaseline(baselineKey);
    if (baseline) return baseline;
    if (history.length >= 3) {
      const first3 = history.slice(0, 3).map(x => x.summary.raw);
      const mean = first3.reduce((a, b) => a + b, 0) / first3.length;
      const sd = Math.sqrt(first3.reduce((a, b) => a + (b - mean) * (b - mean), 0) / first3.length);
      const b = { mean: Number(mean.toFixed(3)), sd: Number(sd.toFixed(3)), n: 3 };
      saveBaseline(baselineKey, b);
      return b;
    }
    return null;
  }

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

  // ---------------------------
  // App state
  // ---------------------------
  const app = $("#app");
  const timerEl = $("#timer");
  const progressEl = $(".progress");

  const state = {
    anonId: getAnonId(),
    sessionId: `s_${Date.now()}`,
    seed: genSeed(),
    rng: null,
    currentTest: null,
    phase: "intro",
    difficulty: 2,
    trialIndex: 0,
    current: null,
    trialStartMs: 0,
    practiceCorrect: 0,
    practiceTotal: 0,
    practiceTarget: 6,
    trials: [],
    testStartMs: 0,
    testEndMs: 0,
    timerHandle: null,
    keyHandler: null,
    gonogoTimeout: null,
    digitSpan: { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] },
    spatialTrials: [],
    patternResult: null,
    gonogoResult: null,
    digitspanResult: null,
    spatialResult: null,
  };

  state.rng = mulberry32(state.seed);

  function updateHeader(testNum, testName) {
    if (progressEl) progressEl.textContent = `검사 ${testNum}/4 · ${testName}`;
  }

  function detachKeyHandler() {
    if (state.keyHandler) {
      window.removeEventListener("keydown", state.keyHandler);
      state.keyHandler = null;
    }
  }

  // ---------------------------
  // Main Intro
  // ---------------------------
  function renderMainIntro() {
    state.currentTest = null;
    state.phase = "intro";
    timerEl.textContent = "--:--";
    updateHeader("-", "인지기능 검사");

    // 이전 기록 확인
    const patternHist = loadHistory(LS_KEYS.patternHistory);
    const hasHistory = patternHist.length > 0;
    const lastRecord = hasHistory ? patternHist[patternHist.length - 1] : null;
    const lastDate = lastRecord ? new Date(lastRecord.ended_at).toLocaleDateString() : null;

    let historySection = '';
    if (hasHistory) {
      historySection = `
        <div class="notice" style="margin-top:10px;">
          <b>이전 기록</b><br/>
          마지막 검사: ${lastDate} (총 ${patternHist.length}회)<br/>
          <button class="linkBtn" id="viewLastResult">이전 결과 보기 →</button>
        </div>
      `;
    }

    app.innerHTML = `
      <section class="card">
        <div class="pill">브레인 업</div>
        <h1 class="title">인지기능 검사</h1>
        <p class="desc">
          4가지 검사를 통해 <b>처리속도</b>, <b>주의력</b>, <b>기억력</b>, <b>공간지각</b>을 측정합니다.<br/>
          총 소요시간은 약 <b>6~8분</b>입니다.
        </p>
        <div class="notice">
          <b>검사 구성</b><br/>
          1. 패턴 비교 (처리속도)<br/>
          2. Go/No-Go (주의·억제)<br/>
          3. 숫자 기억 (작업기억)<br/>
          4. 위치 기억 (공간기억)
        </div>
        <div class="notice" style="margin-top:10px;">
          권장: <b>PC</b> 사용 · <b>전체화면</b> · 방해받지 않는 환경
        </div>
        ${historySection}
        <div class="controls" style="grid-template-columns:1fr;margin-top:14px;">
          <button class="big" id="startAll">검사 시작하기</button>
        </div>
      </section>
    `;

    $("#startAll").onclick = () => startPatternTest();
    
    if (hasHistory) {
      $("#viewLastResult").onclick = () => renderPastResults();
    }
  }

  // ---------------------------
  // Past Results View
  // ---------------------------
  function renderPastResults() {
    timerEl.textContent = "--:--";
    updateHeader("-", "이전 기록");

    const patternHist = loadHistory(LS_KEYS.patternHistory);
    const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
    const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
    const spatialHist = loadHistory(LS_KEYS.spatialHistory);

    // 마지막 기록
    const lastPattern = patternHist[patternHist.length - 1];
    const lastGonogo = gonogoHist[gonogoHist.length - 1];
    const lastDigitspan = digitspanHist[digitspanHist.length - 1];
    const lastSpatial = spatialHist[spatialHist.length - 1];

    const getIndex = (hist, baselineKey) => {
      if (!hist) return { index: '-', label: '기록 없음' };
      const baseline = loadBaseline(baselineKey);
      return computeIndexFromBaseline(hist.summary.raw, baseline);
    };

    const pIdx = getIndex(lastPattern, LS_KEYS.patternBaseline);
    const gIdx = getIndex(lastGonogo, LS_KEYS.gonogoBaseline);
    const dIdx = lastDigitspan ? computeIndexFromBaseline(lastDigitspan.summary.totalSpan, loadBaseline(LS_KEYS.digitspanBaseline)) : { index: '-', label: '기록 없음' };
    const sIdx = getIndex(lastSpatial, LS_KEYS.spatialBaseline);

    const getBadgeClass = (label) => {
      if (label === "좋아지는 중") return "badgeGood";
      if (label === "변동 있음") return "badgeWarn";
      return "";
    };

    const lastDate = lastPattern ? new Date(lastPattern.ended_at).toLocaleDateString() : '-';

    app.innerHTML = `
      <section class="card">
        <div class="pill">이전 기록</div>
        <h1 class="title">마지막 검사 결과</h1>
        <p class="desc">검사일: ${lastDate} (총 ${patternHist.length}회 기록)</p>

        <div class="resultGrid">
          <div class="stat" style="padding:14px;">
            <div class="label">처리속도</div>
            <div class="value">${pIdx.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(pIdx.label)}">${pIdx.label}</div>
            ${lastPattern ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">${lastPattern.summary.answered}문제 · ${Math.round(lastPattern.summary.accuracy * 100)}%</div>` : ''}
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">주의·억제</div>
            <div class="value">${gIdx.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(gIdx.label)}">${gIdx.label}</div>
            ${lastGonogo ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">Go ${Math.round(lastGonogo.summary.goAcc * 100)}% · NoGo ${Math.round(lastGonogo.summary.nogoAcc * 100)}%</div>` : ''}
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">숫자 기억</div>
            <div class="value">${dIdx.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(dIdx.label)}">${dIdx.label}</div>
            ${lastDigitspan ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">정순 ${lastDigitspan.summary.forwardSpan} · 역순 ${lastDigitspan.summary.backwardSpan}</div>` : ''}
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">위치 기억</div>
            <div class="value">${sIdx.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(sIdx.label)}">${sIdx.label}</div>
            ${lastSpatial ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">${lastSpatial.summary.correctTrials}/6 · ${Math.round(lastSpatial.summary.avgAccuracy * 100)}%</div>` : ''}
          </div>
        </div>

        <div class="chartSection">
          <div class="label" style="margin-bottom:8px;">변화 추이 (최근 10회)</div>
          <canvas id="historyChart" style="width:100%;height:180px;"></canvas>
          ${renderChartLegend()}
        </div>

        <div class="controls" style="margin-top:14px;">
          <button class="big" id="backToIntro">돌아가기</button>
          <button class="big" id="startNew">새 검사 시작</button>
        </div>

        <div class="notice" style="margin-top:12px;">
          <button class="linkBtn" id="clearAllData" style="color:#ff6b6b;">모든 기록 삭제</button>
        </div>
      </section>
    `;

    setTimeout(() => drawHistoryChart('historyChart'), 50);

    $("#backToIntro").onclick = () => renderMainIntro();
    $("#startNew").onclick = () => startPatternTest();
    $("#clearAllData").onclick = () => {
      if (confirm('모든 검사 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
        Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key));
        alert('모든 기록이 삭제되었습니다.');
        renderMainIntro();
      }
    };
  }

  // ---------------------------
  // Test 1: Pattern Comparison
  // ---------------------------
  function startPatternTest() {
    state.currentTest = "pattern";
    state.phase = "intro";
    state.difficulty = 2;
    state.trialIndex = 0;
    state.trials = [];
    state.practiceCorrect = 0;
    state.practiceTotal = 0;
    state.practiceTarget = 6;
    renderPatternIntro();
  }

  function renderPatternIntro() {
    timerEl.textContent = "00:10";
    updateHeader("1", "처리속도");
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
    $("#startPractice").onclick = () => { state.phase = "practice"; startPatternTrial(); };
  }

  function renderPatternTrialScreen(isPractice) {
    const label = isPractice ? `연습 ${state.practiceTotal + 1}/${state.practiceTarget}` : `본 검사`;
    app.innerHTML = `
      <section class="card">
        <div class="pill">${label}</div>
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
    $("#btnSame").onclick = () => submitPatternAnswer("same", isPractice);
    $("#btnDiff").onclick = () => submitPatternAnswer("diff", isPractice);
  }

  function startPatternTrial() {
    const isPractice = (state.phase === "practice");
    state.current = nextPatternTrial(state);
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
      if (correct) state.practiceCorrect++;
      const feedback = $("#feedback");
      feedback.style.display = "block";
      feedback.innerHTML = correct ? "✅ 정답" : "❌ 오답";
      feedback.style.color = correct ? "#2bd576" : "#ffd166";
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

    state.trials.push({ trial_id: state.current.trial_id, rt_ms: rt, is_same: state.current.is_same, user_answer: ans, correct, difficulty_level: state.current.difficulty_level });
    updatePatternDifficulty(state);
    state.trialIndex++;
    if (nowMs() >= state.testEndMs) { finishPatternTest(); return; }
    startPatternTrial();
  }

  function renderPatternReady() {
    timerEl.textContent = "00:10";
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
    $("#startTestBtn").onclick = () => {
      state.phase = "test";
      state.trials = [];
      state.trialIndex = 0;
      state.testStartMs = nowMs();
      state.testEndMs = state.testStartMs + TEST_DURATION_MS;
      timerEl.textContent = formatMMSS(TEST_DURATION_MS);
      if (state.timerHandle) clearInterval(state.timerHandle);
      state.timerHandle = setInterval(() => {
        const remaining = state.testEndMs - nowMs();
        timerEl.textContent = formatMMSS(remaining);
        if (remaining <= 0) { clearInterval(state.timerHandle); state.timerHandle = null; finishPatternTest(); }
      }, 100);
      startPatternTrial();
    };
  }

  function finishPatternTest() {
    if (state.currentTest !== "pattern") return;
    detachKeyHandler();
    if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
    const summary = computePatternSummary(state);
    const history = loadHistory(LS_KEYS.patternHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.patternHistory, history);
    const baseline = tryUpdateBaseline(history, LS_KEYS.patternBaseline) || loadBaseline(LS_KEYS.patternBaseline);
    state.patternResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
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
    $("#nextTest").onclick = () => startGoNoGoTest();
  }

  // ---------------------------
  // Test 2: Go/No-Go
  // ---------------------------
  function startGoNoGoTest() {
    state.currentTest = "gonogo";
    state.phase = "intro";
    state.trialIndex = 0;
    state.trials = [];
    state.practiceCorrect = 0;
    state.practiceTotal = 0;
    state.practiceTarget = 6;
    renderGoNoGoIntro();
  }

  function renderGoNoGoIntro() {
    timerEl.textContent = "00:10";
    updateHeader("2", "주의·억제");
    app.innerHTML = `
      <section class="card">
        <div class="pill">검사 2 · 주의·억제</div>
        <h1 class="title">Go / No-Go 검사</h1>
        <p class="desc">
          <span style="color:#2bd576;font-size:28px;">●</span> <b>초록 원</b> → <span class="kbd">스페이스바</span><br/>
          <span style="color:#ff6b6b;font-size:28px;">■</span> <b>빨간 사각형</b> → <b>누르지 않기</b>
        </p>
        <div class="notice">빠르게 반응하되, 빨간 사각형엔 참아야 해요!</div>
        <div class="controls" style="grid-template-columns:1fr;">
          <button class="big" id="startPractice">연습 시작</button>
        </div>
      </section>
    `;
    $("#startPractice").onclick = () => { state.phase = "practice"; runGoNoGoPractice(); };
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
      $("#retryPractice").onclick = () => runGoNoGoPractice();
    } else renderGoNoGoReady();
  }

  function runSingleGoNoGoTrial(type, isPractice, currentNum, totalNum) {
    return new Promise((resolve) => {
      const isGo = type === "go";
      app.innerHTML = `<section class="card"><div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : '본 검사'}</div><div class="stimulusArea"><div style="font-size:48px;color:#a9b3da;">+</div></div></section>`;
      const fixationTime = 300 + Math.floor(state.rng() * 200);
      setTimeout(() => {
        const stimulusHtml = isGo ? `<div style="width:160px;height:160px;background:#2bd576;border-radius:50%;"></div>` : `<div style="width:140px;height:140px;background:#ff6b6b;border-radius:12px;"></div>`;
        app.innerHTML = `<section class="card"><div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : '본 검사'}</div><div class="stimulusArea">${stimulusHtml}</div><div class="notice" style="text-align:center;">${isGo ? '스페이스바!' : '누르지 마세요!'}</div></section>`;
        const stimulusStart = nowMs();
        let responded = false, responseRt = 0;
        const handleKey = (e) => {
          if (e.code === "Space" && !responded) {
            e.preventDefault();
            responded = true;
            responseRt = nowMs() - stimulusStart;
            if (!isPractice) { const area = document.querySelector('.stimulusArea'); if (area) { area.style.background = 'rgba(255,255,255,0.1)'; area.innerHTML = ''; } }
            cleanup();
            finishTrial();
          }
        };
        const cleanup = () => { window.removeEventListener("keydown", handleKey); if (state.gonogoTimeout) { clearTimeout(state.gonogoTimeout); state.gonogoTimeout = null; } };
        const finishTrial = () => {
          const correct = isGo ? responded : !responded;
          if (isPractice) {
            const feedbackHtml = correct ? `<div style="color:#2bd576;font-size:24px;font-weight:800;">✅ 정답!</div>` : `<div style="color:#ffd166;font-size:24px;font-weight:800;">❌ ${isGo ? '눌러야 해요!' : '참아야 해요!'}</div>`;
            app.innerHTML = `<section class="card"><div class="pill">연습 ${currentNum}/${totalNum}</div><div class="stimulusArea">${feedbackHtml}</div></section>`;
            setTimeout(() => resolve({ correct, responded, rt: responseRt, type }), 500);
          } else resolve({ correct, responded, rt: responseRt, type });
        };
        window.addEventListener("keydown", handleKey);
        state.gonogoTimeout = setTimeout(() => { if (!responded) { cleanup(); finishTrial(); } }, 1000);
      }, fixationTime);
    });
  }

  function renderGoNoGoReady() {
    timerEl.textContent = "00:10";
    app.innerHTML = `<section class="card"><div class="pill">연습 완료</div><h1 class="title">본 검사 시작</h1><p class="desc">준비되면 시작하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="startTestBtn">본 검사 시작</button></div></section>`;
    $("#startTestBtn").onclick = () => runGoNoGoTest();
  }

  async function runGoNoGoTest() {
    state.phase = "test";
    state.trials = [];
    state.testStartMs = nowMs();
    state.testEndMs = state.testStartMs + TEST_DURATION_MS;
    timerEl.textContent = formatMMSS(TEST_DURATION_MS);
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = setInterval(() => { timerEl.textContent = formatMMSS(Math.max(0, state.testEndMs - nowMs())); }, 100);
    let trialNum = 0;
    while (nowMs() < state.testEndMs) {
      const type = state.rng() < 0.7 ? "go" : "nogo";
      const result = await runSingleGoNoGoTrial(type, false, 0, 0);
      state.trials.push({ trial_id: `gonogo_${trialNum}`, stimulus_type: type, user_responded: result.responded, rt_ms: result.rt, correct: result.correct });
      trialNum++;
      if (nowMs() >= state.testEndMs) break;
      await sleep(200 + Math.floor(state.rng() * 200));
      if (nowMs() >= state.testEndMs) break;
    }
    finishGoNoGoTest();
  }

  function finishGoNoGoTest() {
    if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
    timerEl.textContent = "00:00";
    const summary = computeGoNoGoSummary(state.trials);
    const history = loadHistory(LS_KEYS.gonogoHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.gonogoHistory, history);
    const baseline = tryUpdateBaseline(history, LS_KEYS.gonogoBaseline) || loadBaseline(LS_KEYS.gonogoBaseline);
    state.gonogoResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
    renderGoNoGoDone();
  }

  function renderGoNoGoDone() {
    const { summary } = state.gonogoResult;
    app.innerHTML = `<section class="card"><div class="pill">검사 2 완료</div><h1 class="title">Go/No-Go 완료!</h1><p class="desc">Go: <b>${Math.round(summary.goAcc * 100)}%</b> · No-Go: <b>${Math.round(summary.nogoAcc * 100)}%</b></p><div class="notice">다음은 <b>숫자 기억 검사</b>입니다.</div><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="nextTest">다음 검사로</button></div></section>`;
    $("#nextTest").onclick = () => startDigitSpanTest();
  }

  // ---------------------------
  // Test 3: Digit Span
  // ---------------------------
  function startDigitSpanTest() {
    state.currentTest = "digitspan";
    state.phase = "intro";
    state.digitSpan = { forwardSpan: 0, backwardSpan: 0, forwardTrials: [], backwardTrials: [] };
    renderDigitSpanIntro();
  }

  function renderDigitSpanIntro() {
    timerEl.textContent = "--:--";
    updateHeader("3", "숫자 기억");
    app.innerHTML = `<section class="card"><div class="pill">검사 3 · 숫자 기억</div><h1 class="title">Digit Span 검사</h1><p class="desc">화면에 숫자가 하나씩 나타납니다.<br/><b>정순</b>: 본 순서대로 · <b>역순</b>: 거꾸로</p><div class="notice">예: 3→7→2 정순: 372 / 역순: 273</div><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="startPractice">연습 시작</button></div></section>`;
    $("#startPractice").onclick = () => runDigitSpanPractice();
  }

  async function runDigitSpanPractice() {
    app.innerHTML = `<section class="card"><div class="pill">연습 · 정순</div><h1 class="title">정순 연습</h1><p class="desc">숫자를 <b>본 순서대로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
    await new Promise(r => { $("#start").onclick = r; });
    await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 3), "forward", true, 1, 1);
    app.innerHTML = `<section class="card"><div class="pill">연습 · 역순</div><h1 class="title">역순 연습</h1><p class="desc">숫자를 <b>거꾸로</b> 입력하세요.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
    await new Promise(r => { $("#start").onclick = r; });
    await runSingleDigitSpanTrial(generateDigitSequence(state.rng, 2), "backward", true, 1, 1);
    renderDigitSpanReady();
  }

  async function showDigitSequence(digits) {
    for (let i = 0; i < digits.length; i++) {
      app.innerHTML = `<section class="card"><div class="pill">숫자 기억</div><div class="stimulusArea"><div style="font-size:120px;font-weight:900;color:#00d4ff;">${digits[i]}</div></div></section>`;
      await sleep(1000);
      if (i < digits.length - 1) { app.innerHTML = `<section class="card"><div class="pill">숫자 기억</div><div class="stimulusArea"><div style="font-size:48px;color:#a9b3da;">·</div></div></section>`; await sleep(300); }
    }
  }

  function runSingleDigitSpanTrial(digits, mode, isPractice, currentNum, totalNum) {
    return new Promise(async (resolve) => {
      const expectedAnswer = mode === "forward" ? digits : [...digits].reverse();
      await showDigitSequence(digits);
      let userInput = [];
      const inputLength = digits.length;
      const renderInputScreen = () => {
        const modeText = mode === "forward" ? "정순" : "역순";
        const inputDisplay = userInput.length > 0 ? userInput.map(d => `<span class="digitInput">${d}</span>`).join(' ') : '<span style="color:#a9b3da;">숫자를 입력하세요</span>';
        app.innerHTML = `<section class="card"><div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : '본 검사'} · ${modeText}</div><div style="text-align:center;margin:20px 0;"><div style="font-size:14px;color:#a9b3da;margin-bottom:8px;">${digits.length}자리</div><div style="font-size:32px;font-weight:700;min-height:50px;">${inputDisplay}</div></div><div class="digitPad">${[1,2,3,4,5,6,7,8,9,0].map(n=>`<button class="digitBtn" data-digit="${n}">${n}</button>`).join('')}</div><div class="controls" style="margin-top:12px;"><button class="big" id="clearBtn" ${userInput.length===0?'disabled':''}>지우기</button><button class="big" id="submitBtn" ${userInput.length!==inputLength?'disabled':''}>확인</button></div></section>`;
        document.querySelectorAll('.digitBtn').forEach(btn => { btn.onclick = () => { if (userInput.length < inputLength) { userInput.push(parseInt(btn.dataset.digit)); renderInputScreen(); } }; });
        const clearBtn = $("#clearBtn"); if (clearBtn) clearBtn.onclick = () => { userInput.pop(); renderInputScreen(); };
        const submitBtn = $("#submitBtn"); if (submitBtn) submitBtn.onclick = () => finishTrial();
      };
      const keyHandler = (e) => {
        if (e.key >= '0' && e.key <= '9' && userInput.length < inputLength) { userInput.push(parseInt(e.key)); renderInputScreen(); }
        else if (e.key === 'Backspace' && userInput.length > 0) { userInput.pop(); renderInputScreen(); }
        else if (e.key === 'Enter' && userInput.length === inputLength) finishTrial();
      };
      window.addEventListener('keydown', keyHandler);
      const finishTrial = () => {
        window.removeEventListener('keydown', keyHandler);
        const correct = userInput.length === expectedAnswer.length && userInput.every((d, i) => d === expectedAnswer[i]);
        if (isPractice) {
          app.innerHTML = `<section class="card"><div class="pill">연습 ${currentNum}/${totalNum}</div><div class="stimulusArea">${correct ? `<div style="color:#2bd576;font-size:24px;font-weight:800;">✅ 정답!</div>` : `<div style="color:#ffd166;font-size:24px;font-weight:800;">❌ 정답: ${expectedAnswer.join(' ')}</div>`}</div></section>`;
          setTimeout(() => resolve({ correct, userInput, expectedAnswer, digits, mode }), 1000);
        } else resolve({ correct, userInput, expectedAnswer, digits, mode });
      };
      renderInputScreen();
    });
  }

  function renderDigitSpanReady() {
    app.innerHTML = `<section class="card"><div class="pill">연습 완료</div><h1 class="title">본 검사 시작</h1><p class="desc">정순 → 역순 순서로 진행됩니다.</p><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="startTestBtn">본 검사 시작</button></div></section>`;
    $("#startTestBtn").onclick = () => runDigitSpanTest();
  }

  async function runDigitSpanTest() {
    state.phase = "test";
    app.innerHTML = `<section class="card"><div class="pill">본 검사 · 정순</div><h1 class="title">정순 검사</h1><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
    await new Promise(r => { $("#start").onclick = r; });
    let forwardSpan = 0, consecutiveErrors = 0, currentLength = 3;
    while (consecutiveErrors < 2 && currentLength <= 9) {
      const digits = generateDigitSequence(state.rng, currentLength);
      const result = await runSingleDigitSpanTrial(digits, "forward", false, 0, 0);
      state.digitSpan.forwardTrials.push({ length: currentLength, digits, userInput: result.userInput, correct: result.correct });
      if (result.correct) { forwardSpan = currentLength; consecutiveErrors = 0; currentLength++; } else consecutiveErrors++;
      await sleep(500);
    }
    state.digitSpan.forwardSpan = forwardSpan;

    app.innerHTML = `<section class="card"><div class="pill">본 검사 · 역순</div><h1 class="title">역순 검사</h1><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="start">시작</button></div></section>`;
    await new Promise(r => { $("#start").onclick = r; });
    let backwardSpan = 0; consecutiveErrors = 0; currentLength = 2;
    while (consecutiveErrors < 2 && currentLength <= 9) {
      const digits = generateDigitSequence(state.rng, currentLength);
      const result = await runSingleDigitSpanTrial(digits, "backward", false, 0, 0);
      state.digitSpan.backwardTrials.push({ length: currentLength, digits, userInput: result.userInput, correct: result.correct });
      if (result.correct) { backwardSpan = currentLength; consecutiveErrors = 0; currentLength++; } else consecutiveErrors++;
      await sleep(500);
    }
    state.digitSpan.backwardSpan = backwardSpan;
    finishDigitSpanTest();
  }

  function finishDigitSpanTest() {
    const summary = { forwardSpan: state.digitSpan.forwardSpan, backwardSpan: state.digitSpan.backwardSpan, totalSpan: state.digitSpan.forwardSpan + state.digitSpan.backwardSpan, raw: state.digitSpan.forwardSpan + state.digitSpan.backwardSpan };
    const history = loadHistory(LS_KEYS.digitspanHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.digitspanHistory, history);
    const baseline = tryUpdateBaseline(history, LS_KEYS.digitspanBaseline) || loadBaseline(LS_KEYS.digitspanBaseline);
    state.digitspanResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
    renderDigitSpanDone();
  }

  function renderDigitSpanDone() {
    const { summary } = state.digitspanResult;
    app.innerHTML = `<section class="card"><div class="pill">검사 3 완료</div><h1 class="title">숫자 기억 완료!</h1><p class="desc">정순: <b>${summary.forwardSpan}자리</b> · 역순: <b>${summary.backwardSpan}자리</b></p><div class="notice">다음은 <b>위치 기억 검사</b>입니다.</div><div class="controls" style="grid-template-columns:1fr;"><button class="big" id="nextTest">다음 검사로</button></div></section>`;
    $("#nextTest").onclick = () => startSpatialTest();
  }

  // ---------------------------
  // Test 4: Spatial Memory (위치 기억)
  // ---------------------------
  function startSpatialTest() {
    state.currentTest = "spatial";
    state.phase = "intro";
    state.spatialTrials = [];
    renderSpatialIntro();
  }

  function renderSpatialIntro() {
    timerEl.textContent = "--:--";
    updateHeader("4", "위치 기억");
    app.innerHTML = `
      <section class="card">
        <div class="pill">검사 4 · 위치 기억</div>
        <h1 class="title">위치 기억 검사</h1>
        <p class="desc">
          화면에 <b>파란 칸</b>이 잠깐 나타납니다.<br/>
          사라진 후, 같은 위치를 <b>클릭</b>하세요.
        </p>
        <div class="notice">
          총 6번 진행되며, 점점 어려워집니다.
        </div>
        <div class="controls" style="grid-template-columns:1fr;">
          <button class="big" id="startPractice">연습 시작</button>
        </div>
      </section>
    `;
    $("#startPractice").onclick = () => runSpatialPractice();
  }

  function generateSpatialTrial(rng, gridSize, numTargets) {
    const total = gridSize * gridSize;
    const targets = [];
    while (targets.length < numTargets) {
      const idx = Math.floor(rng() * total);
      if (!targets.includes(idx)) targets.push(idx);
    }
    return { gridSize, targets };
  }

  function renderSpatialGrid(gridSize, highlightedCells, clickableCells, onCellClick) {
    const cellSize = 70;
    const gap = 8;
    const gridHtml = [];
    
    for (let i = 0; i < gridSize * gridSize; i++) {
      const isHighlighted = highlightedCells.includes(i);
      const isClickable = clickableCells !== null;
      const cellClass = isHighlighted ? 'spatialCell highlighted' : 'spatialCell';
      gridHtml.push(`<div class="${cellClass}" data-idx="${i}" style="width:${cellSize}px;height:${cellSize}px;"></div>`);
    }
    
    return `
      <div class="spatialGrid" style="display:grid;grid-template-columns:repeat(${gridSize},${cellSize}px);gap:${gap}px;justify-content:center;">
        ${gridHtml.join('')}
      </div>
    `;
  }

  function runSingleSpatialTrial(trial, isPractice, currentNum, totalNum) {
    return new Promise(async (resolve) => {
      const { gridSize, targets } = trial;
      
      // 1. 타겟 보여주기 (2초)
      app.innerHTML = `
        <section class="card">
          <div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : `본 검사 ${currentNum}/6`}</div>
          <div class="notice" style="text-align:center;margin-bottom:16px;">위치를 기억하세요!</div>
          ${renderSpatialGrid(gridSize, targets, null, null)}
        </section>
      `;
      
      await sleep(2000);
      
      // 2. 빈 그리드 보여주고 클릭 받기
      let userClicks = [];
      const numRequired = targets.length;
      const startTime = nowMs();
      
      const renderClickableGrid = () => {
        app.innerHTML = `
          <section class="card">
            <div class="pill">${isPractice ? `연습 ${currentNum}/${totalNum}` : `본 검사 ${currentNum}/6`}</div>
            <div class="notice" style="text-align:center;margin-bottom:16px;">
              ${numRequired - userClicks.length}개 더 클릭하세요
            </div>
            ${renderSpatialGrid(gridSize, userClicks, [], null)}
            <div class="controls" style="margin-top:16px;">
              <button class="big" id="clearBtn" ${userClicks.length === 0 ? 'disabled' : ''}>다시 선택</button>
              <button class="big" id="submitBtn" ${userClicks.length !== numRequired ? 'disabled' : ''}>확인</button>
            </div>
          </section>
        `;
        
        document.querySelectorAll('.spatialCell').forEach(cell => {
          cell.onclick = () => {
            const idx = parseInt(cell.dataset.idx);
            if (!userClicks.includes(idx) && userClicks.length < numRequired) {
              userClicks.push(idx);
              renderClickableGrid();
            }
          };
        });
        
        const clearBtn = $("#clearBtn");
        if (clearBtn) clearBtn.onclick = () => { userClicks = []; renderClickableGrid(); };
        
        const submitBtn = $("#submitBtn");
        if (submitBtn) submitBtn.onclick = () => finishTrial();
      };
      
      const finishTrial = () => {
        const endTime = nowMs();
        const rt = Math.round(endTime - startTime);
        
        // 정확도 계산: 맞춘 개수 / 전체 타겟 개수
        const correctClicks = userClicks.filter(c => targets.includes(c)).length;
        const accuracy = correctClicks / targets.length;
        const correct = accuracy === 1; // 모두 맞춰야 정답
        
        if (isPractice) {
          const feedbackHtml = correct
            ? `<div style="color:#2bd576;font-size:24px;font-weight:800;">✅ 정답!</div>`
            : `<div style="color:#ffd166;font-size:24px;font-weight:800;">❌ ${correctClicks}/${targets.length}개 맞춤</div>`;
          
          app.innerHTML = `
            <section class="card">
              <div class="pill">연습 ${currentNum}/${totalNum}</div>
              <div class="stimulusArea">${feedbackHtml}</div>
            </section>
          `;
          
          setTimeout(() => resolve({ correct, accuracy, userClicks, targets, rt }), 1000);
        } else {
          resolve({ correct, accuracy, userClicks, targets, rt });
        }
      };
      
      renderClickableGrid();
    });
  }

  async function runSpatialPractice() {
    // 연습 1개 (3칸)
    const trial = generateSpatialTrial(state.rng, 4, 3);
    await runSingleSpatialTrial(trial, true, 1, 1);
    renderSpatialReady();
  }

  function renderSpatialReady() {
    app.innerHTML = `
      <section class="card">
        <div class="pill">연습 완료</div>
        <h1 class="title">본 검사 시작</h1>
        <p class="desc">
          6번의 검사가 진행됩니다.<br/>
          점점 기억할 칸이 늘어납니다.
        </p>
        <div class="controls" style="grid-template-columns:1fr;">
          <button class="big" id="startTestBtn">본 검사 시작</button>
        </div>
      </section>
    `;
    $("#startTestBtn").onclick = () => runSpatialTest();
  }

  async function runSpatialTest() {
    state.phase = "test";
    state.spatialTrials = [];
    
    // 난이도: 3칸 x2, 4칸 x2, 5칸 x2
    const difficulties = [3, 3, 4, 4, 5, 5];
    
    for (let i = 0; i < difficulties.length; i++) {
      const trial = generateSpatialTrial(state.rng, 4, difficulties[i]);
      const result = await runSingleSpatialTrial(trial, false, i + 1, 6);
      state.spatialTrials.push({
        trialNum: i + 1,
        numTargets: difficulties[i],
        ...result
      });
      await sleep(500);
    }
    
    finishSpatialTest();
  }

  function finishSpatialTest() {
    const trials = state.spatialTrials;
    const totalCorrect = trials.filter(t => t.correct).length;
    const avgAccuracy = trials.reduce((sum, t) => sum + t.accuracy, 0) / trials.length;
    const avgRt = Math.round(trials.reduce((sum, t) => sum + t.rt, 0) / trials.length);
    
    // raw score: 정확도 기반 (0~100 스케일)
    const raw = avgAccuracy * 100;
    
    const summary = {
      totalTrials: trials.length,
      correctTrials: totalCorrect,
      avgAccuracy: Number(avgAccuracy.toFixed(3)),
      avgRtMs: avgRt,
      raw: Number(raw.toFixed(3))
    };
    
    const history = loadHistory(LS_KEYS.spatialHistory);
    history.push({ user_id: state.anonId, session_id: state.sessionId, ended_at: Date.now(), summary });
    saveHistory(LS_KEYS.spatialHistory, history);
    
    const baseline = tryUpdateBaseline(history, LS_KEYS.spatialBaseline) || loadBaseline(LS_KEYS.spatialBaseline);
    state.spatialResult = { summary, index: computeIndexFromBaseline(summary.raw, baseline), baseline };
    
    renderFinalResult();
  }

  // ---------------------------
  // Chart Drawing
  // ---------------------------
  function drawHistoryChart(canvasId) {
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
    
    // 데이터 가져오기 (최근 10회)
    const patternHist = loadHistory(LS_KEYS.patternHistory).slice(-10);
    const gonogoHist = loadHistory(LS_KEYS.gonogoHistory).slice(-10);
    const digitspanHist = loadHistory(LS_KEYS.digitspanHistory).slice(-10);
    const spatialHist = loadHistory(LS_KEYS.spatialHistory).slice(-10);
    
    // 지수로 변환 (raw 기반, 0~100 스케일로 정규화)
    const normalize = (hist, key = 'raw', max = 100) => {
      return hist.map((x, i) => ({
        idx: i,
        value: Math.min(100, Math.max(0, (x.summary[key] / max) * 100)),
        date: new Date(x.ended_at)
      }));
    };
    
    const datasets = [
      { name: '처리속도', color: '#00d4ff', data: normalize(patternHist, 'raw', 50) },
      { name: '주의·억제', color: '#2bd576', data: normalize(gonogoHist, 'raw', 100) },
      { name: '숫자기억', color: '#ffd166', data: normalize(digitspanHist, 'totalSpan', 14) },
      { name: '위치기억', color: '#ff6b6b', data: normalize(spatialHist, 'raw', 100) },
    ];
    
    // 최대 데이터 개수
    const maxLen = Math.max(...datasets.map(d => d.data.length), 1);
    
    if (maxLen < 2) {
      // 데이터 부족 메시지
      ctx.fillStyle = '#a9b3da';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('기록이 2회 이상 쌍이면 차트가 표시됩니다', w / 2, h / 2);
      return;
    }
    
    // 배경
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    
    // 그리드 선
    ctx.strokeStyle = '#243057';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      
      // Y축 레이블
      ctx.fillStyle = '#a9b3da';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(String(100 - i * 25), pad.left - 8, y + 4);
    }
    
    // X축 레이블
    ctx.fillStyle = '#a9b3da';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    for (let i = 0; i < maxLen; i++) {
      const x = pad.left + (chartW / (maxLen - 1)) * i;
      ctx.fillText(String(i + 1), x, h - 10);
    }
    
    // 데이터 라인 그리기
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
      
      // 마지막 점 표시
      const lastPoint = dataset.data[dataset.data.length - 1];
      const lastX = pad.left + (chartW / (maxLen - 1)) * (dataset.data.length - 1);
      const lastY = pad.top + chartH - (lastPoint.value / 100) * chartH;
      
      ctx.fillStyle = dataset.color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  
  function renderChartLegend() {
    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px;">
        <span style="font-size:12px;"><span style="color:#00d4ff;">●</span> 처리속도</span>
        <span style="font-size:12px;"><span style="color:#2bd576;">●</span> 주의·억제</span>
        <span style="font-size:12px;"><span style="color:#ffd166;">●</span> 숫자기억</span>
        <span style="font-size:12px;"><span style="color:#ff6b6b;">●</span> 위치기억</span>
      </div>
    `;
  }

  // ---------------------------
  // Final Result
  // ---------------------------
  function renderFinalResult() {
    const p = state.patternResult;
    const g = state.gonogoResult;
    const d = state.digitspanResult;
    const s = state.spatialResult;

    const getBadgeClass = (label) => {
      if (label === "좋아지는 중") return "badgeGood";
      if (label === "변동 있음") return "badgeWarn";
      return "";
    };

    // 해석 문구 생성
    const pInterp = getInterpretation('pattern', p.index.index);
    const gInterp = getInterpretation('gonogo', g.index.index);
    const dInterp = getInterpretation('digitspan', d.index.index);
    const sInterp = getInterpretation('spatial', s.index.index);
    
    const overallInterp = getOverallInterpretation(p.index.index, g.index.index, d.index.index, s.index.index);
    const trendInterp = getTrendInterpretation(LS_KEYS.patternHistory);
    const reassurance = getRandomItem(INTERPRETATIONS.reassurance);

    app.innerHTML = `
      <section class="card">
        <div class="pill">검사 완료</div>
        <h1 class="title">오늘의 인지기능 결과</h1>

        <!-- 종합 해석 -->
        <div class="interpretBox overall">
          <p class="interpMain">${overallInterp}</p>
          <p class="interpSub">${trendInterp}</p>
        </div>

        <div class="resultGrid">
          <div class="stat" style="padding:14px;">
            <div class="label">처리속도</div>
            <div class="value">${p.index.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(p.index.label)}">${p.index.label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;">
              ${p.summary.answered}문제 · ${Math.round(p.summary.accuracy * 100)}%
            </div>
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">주의·억제</div>
            <div class="value">${g.index.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(g.index.label)}">${g.index.label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;">
              Go ${Math.round(g.summary.goAcc * 100)}% · NoGo ${Math.round(g.summary.nogoAcc * 100)}%
            </div>
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">숫자 기억</div>
            <div class="value">${d.index.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(d.index.label)}">${d.index.label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;">
              정순 ${d.summary.forwardSpan} · 역순 ${d.summary.backwardSpan}
            </div>
          </div>

          <div class="stat" style="padding:14px;">
            <div class="label">위치 기억</div>
            <div class="value">${s.index.index}<small>/100</small></div>
            <div style="font-size:13px;" class="${getBadgeClass(s.index.label)}">${s.index.label}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;">
              ${s.summary.correctTrials}/6 정답 · ${Math.round(s.summary.avgAccuracy * 100)}%
            </div>
          </div>
        </div>

        <!-- 영역별 해석 -->
        <div class="interpretSection">
          <div class="interpretItem">
            <span class="interpIcon" style="color:#00d4ff;">●</span>
            <span class="interpText">${pInterp}</span>
          </div>
          <div class="interpretItem">
            <span class="interpIcon" style="color:#2bd576;">●</span>
            <span class="interpText">${gInterp}</span>
          </div>
          <div class="interpretItem">
            <span class="interpIcon" style="color:#ffd166;">●</span>
            <span class="interpText">${dInterp}</span>
          </div>
          <div class="interpretItem">
            <span class="interpIcon" style="color:#ff6b6b;">●</span>
            <span class="interpText">${sInterp}</span>
          </div>
        </div>

        <div class="chartSection">
          <div class="label" style="margin-bottom:8px;">변화 추이 (최근 10회)</div>
          <canvas id="historyChart" style="width:100%;height:180px;"></canvas>
          ${renderChartLegend()}
        </div>

        <div class="notice" style="margin-top:14px;">
          💡 ${reassurance}
        </div>

        <div class="controls" style="margin-top:14px;">
          <button class="big" id="retry">처음부터 다시</button>
          <button class="big" id="viewHistory">기록 보기</button>
        </div>

        <div id="historyBox" class="notice" style="display:none;margin-top:12px;"></div>
      </section>
    `;

    // 차트 그리기
    setTimeout(() => drawHistoryChart('historyChart'), 50);

    $("#retry").onclick = () => resetAll();
    $("#viewHistory").onclick = () => showHistory();
  }

  function showHistory() {
    const box = $("#historyBox");
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
    box.style.display = "block";
  }

  function resetAll() {
    detachKeyHandler();
    if (state.timerHandle) clearInterval(state.timerHandle);
    if (state.gonogoTimeout) clearTimeout(state.gonogoTimeout);
    state.sessionId = `s_${Date.now()}`;
    state.seed = genSeed();
    state.rng = mulberry32(state.seed);
    state.currentTest = null;
    state.phase = "intro";
    state.difficulty = 2;
    state.trialIndex = 0;
    state.trials = [];
    state.patternResult = null;
    state.gonogoResult = null;
    state.digitspanResult = null;
    state.spatialResult = null;
    renderMainIntro();
  }

  // Boot
  renderMainIntro();
})();
