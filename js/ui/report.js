// ui/report.js
import { $ } from '../core/utils.js';
import { LS_KEYS, loadHistory, loadBaseline, getCurrentWeekRange } from '../core/storage.js';
import { computeIndexFromBaseline, getInterpretation, getOverallInterpretation, getTrendInterpretation } from '../core/scoring.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';
import { drawHistoryChart, renderChartLegend } from './result.js';
import { isLoggedIn, getResults } from '../core/api.js';

const app = $("#app");

// 현재 선택된 주 오프셋 (0 = 이번 주, -1 = 지난 주, -2 = 2주 전...)
let selectedWeekOffset = 0;

// 서버에서 가져온 결과 캐시
let cachedServerResults = null;

// 특정 오프셋의 주 범위 계산 (일요일 ~ 토요일)
function getWeekRangeByOffset(offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = 일요일
  
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek + (offset * 7));
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return { monday: sunday, sunday: saturday }; // 변수명은 유지 (sunday=시작, saturday=끝)
}

// 특정 주의 검사 결과 가져오기 (로컬스토리지)
function getWeekTestResultsFromLocal(offset = 0) {
  const { monday, sunday } = getWeekRangeByOffset(offset);
  
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  const filterWeek = (history) => {
    return history.filter(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= monday && entryDate <= sunday;
    });
  };
  
  return {
    pattern: filterWeek(patternHist),
    gonogo: filterWeek(gonogoHist),
    digitspan: filterWeek(digitspanHist),
    spatial: filterWeek(spatialHist)
  };
}

// 특정 주의 검사 결과 가져오기 (서버 데이터)
function getWeekTestResultsFromServer(offset = 0) {
  if (!cachedServerResults) return { pattern: [], gonogo: [], digitspan: [], spatial: [] };
  
  const { monday, sunday } = getWeekRangeByOffset(offset);
  
  const filterWeek = (testType) => {
    return cachedServerResults
      .filter(r => r.test_type === testType)
      .filter(r => {
        const dateStr = r.date || r.created_at;
        if (!dateStr) return offset === 0;
        const entryDate = new Date(dateStr);
        return entryDate >= monday && entryDate <= sunday;
      })
      .map(r => ({
        ended_at: r.date || r.created_at,
        summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary
      }));
  };
  
  return {
    pattern: filterWeek('pattern'),
    gonogo: filterWeek('gonogo'),
    digitspan: filterWeek('digitspan'),
    spatial: filterWeek('spatial')
  };
}

// 특정 주의 검사 결과 가져오기 (로그인 여부에 따라 분기)
function getWeekTestResults(offset = 0) {
  if (isLoggedIn() && cachedServerResults) {
    return getWeekTestResultsFromServer(offset);
  }
  return getWeekTestResultsFromLocal(offset);
}

// 가장 오래된 기록이 있는 주 오프셋 계산
function getOldestWeekOffset() {
  let oldestDate = null;
  
  if (isLoggedIn() && cachedServerResults && cachedServerResults.length > 0) {
    // 서버 데이터에서 가장 오래된 날짜 찾기
    cachedServerResults.forEach(r => {
      const d = new Date(r.date);
      if (!oldestDate || d < oldestDate) {
        oldestDate = d;
      }
    });
  } else {
    // 로컬스토리지에서 찾기
    const patternHist = loadHistory(LS_KEYS.patternHistory);
    if (patternHist.length === 0) return 0;
    
    patternHist.forEach(entry => {
      const d = new Date(entry.ended_at);
      if (!oldestDate || d < oldestDate) {
        oldestDate = d;
      }
    });
  }
  
  if (!oldestDate) return 0;
  
  const today = new Date();
  const diffTime = today - oldestDate;
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
  
  return -diffWeeks - 1;
}

// 주 라벨 생성 (예: "1월 5일 ~ 11일")
function getWeekLabel(offset) {
  const { monday, sunday } = getWeekRangeByOffset(offset);
  const startMonth = monday.getMonth() + 1;
  const startDay = monday.getDate();
  const endMonth = sunday.getMonth() + 1;
  const endDay = sunday.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  } else {
    return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
  }
}

// 점수 비교 (선택된 주 vs 이전 주)
function getComparison(currentWeekResults, prevWeekResults, key, baselineKey) {
  const thisResult = currentWeekResults[0];
  const lastResult = prevWeekResults[0];
  
  if (!thisResult) return { current: null, change: null, label: '기록 없음' };
  
  const baseline = loadBaseline(baselineKey);
  const currentIndex = computeIndexFromBaseline(thisResult.summary[key], baseline);
  
  if (!lastResult) {
    return { 
      current: currentIndex.index, 
      change: null, 
      label: currentIndex.label,
      isFirst: true
    };
  }
  
  const lastIndex = computeIndexFromBaseline(lastResult.summary[key], baseline);
  const change = currentIndex.index - lastIndex.index;
  
  return {
    current: currentIndex.index,
    previous: lastIndex.index,
    change: change,
    label: currentIndex.label
  };
}

// 변화 표시 텍스트
function getChangeText(change) {
  if (change === null) return '';
  if (change > 0) return `<span class="changeUp">+${change}</span>`;
  if (change < 0) return `<span class="changeDown">${change}</span>`;
  return `<span class="changeNeutral">±0</span>`;
}

// 종합 해석
function getOverallMessage(comparisons, isThisWeek) {
  const changes = Object.values(comparisons)
    .filter(c => c.change !== null)
    .map(c => c.change);
  
  const hasData = Object.values(comparisons).some(c => c.current !== null);
  
  if (!hasData) {
    return {
      icon: 'fa-solid fa-calendar-xmark',
      title: '이 주에는 검사 기록이 없어요',
      desc: '다른 주를 선택해보세요.'
    };
  }
  
  if (changes.length === 0) {
    return {
      icon: 'fa-solid fa-star',
      title: isThisWeek ? '첫 주간 검사를 완료했어요!' : '이 주에 검사를 완료했어요!',
      desc: '다음 주에도 검사하면 변화를 비교할 수 있어요.'
    };
  }
  
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  
  if (avg >= 3) {
    return {
      icon: 'fa-solid fa-arrow-trend-up',
      title: '이전 주보다 좋아졌어요! 🎉',
      desc: '꾸준히 관리한 보람이 있네요. 이 컨디션을 유지해보세요.'
    };
  } else if (avg <= -3) {
    return {
      icon: 'fa-solid fa-arrow-trend-down',
      title: '이전 주보다 조금 떨어졌어요',
      desc: '컨디션이나 환경 영향일 수 있어요. 걱정 마세요!'
    };
  } else {
    return {
      icon: 'fa-solid fa-minus',
      title: '이전 주와 비슷해요',
      desc: '안정적으로 유지되고 있어요. 잘 하고 계세요!'
    };
  }
}

// 상세 결과 보기 화면
function renderDetailedResult(weekResults, weekOffset) {
  const p = weekResults.pattern[0];
  const g = weekResults.gonogo[0];
  const d = weekResults.digitspan[0];
  const s = weekResults.spatial[0];
  
  // 하나라도 있어야 함
  if (!p && !g && !d && !s) {
    alert('이 주의 검사 데이터가 없습니다.');
    return;
  }
  
  // 인덱스 계산
  const pBaseline = loadBaseline(LS_KEYS.patternBaseline);
  const gBaseline = loadBaseline(LS_KEYS.gonogoBaseline);
  const dBaseline = loadBaseline(LS_KEYS.digitspanBaseline);
  const sBaseline = loadBaseline(LS_KEYS.spatialBaseline);
  
  const pIndex = p ? computeIndexFromBaseline(p.summary.raw, pBaseline) : null;
  const gIndex = g ? computeIndexFromBaseline(g.summary.raw, gBaseline) : null;
  const dIndex = d ? computeIndexFromBaseline(d.summary.totalSpan, dBaseline) : null;
  const sIndex = s ? computeIndexFromBaseline(s.summary.raw, sBaseline) : null;
  
  const getStatusClass = (label) => {
    if (label === "좋아지는 중") return "good";
    if (label === "변동 있음") return "warn";
    return "normal";
  };
  
  const pInterp = pIndex ? getInterpretation('pattern', pIndex.index) : '기록 없음';
  const gInterp = gIndex ? getInterpretation('gonogo', gIndex.index) : '기록 없음';
  const dInterp = dIndex ? getInterpretation('digitspan', dIndex.index) : '기록 없음';
  const sInterp = sIndex ? getInterpretation('spatial', sIndex.index) : '기록 없음';
  
  // 종합 해석 (있는 데이터만 사용)
  const indices = [pIndex, gIndex, dIndex, sIndex].filter(x => x !== null);
  let overallInterp = '검사 결과가 기록되었어요.';
  if (indices.length >= 2) {
    const avgIndex = Math.round(indices.reduce((a, b) => a + b.index, 0) / indices.length);
    if (avgIndex >= 80) overallInterp = '전반적으로 좋은 상태예요!';
    else if (avgIndex >= 60) overallInterp = '양호한 상태예요.';
    else overallInterp = '꼼준한 관리가 필요해요.';
  }
  const trendInterp = getTrendInterpretation(LS_KEYS.patternHistory);
  
  // 검사일 (있는 데이터 중 첫 번째)
  const firstResult = p || g || d || s;
  const testDate = new Date(firstResult.ended_at).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  });
  
  document.querySelector(".progress").textContent = "검사 결과";
  
  app.innerHTML = `
    <section class="card">
      <div class="pill">검사 결과 · ${testDate}</div>
      <h1 class="title">인지기능 상세 결과</h1>

      <div class="interpretBox overall">
        <p class="interpMain">${overallInterp}</p>
        <p class="interpSub">${trendInterp}</p>
      </div>

      <div class="resultGrid">
        <div class="stat pattern">
          <div class="label">처리속도</div>
          <div class="value">${pIndex ? pIndex.index : '-'}<small>/100</small></div>
          <div class="statusLabel ${pIndex ? getStatusClass(pIndex.label) : ''}">${pIndex ? pIndex.label : '기록 없음'}</div>
          ${p ? `<div class="detail">${p.summary.answered}문제 · ${Math.round(p.summary.accuracy * 100)}%</div>` : ''}
        </div>

        <div class="stat gonogo">
          <div class="label">주의·억제</div>
          <div class="value">${gIndex ? gIndex.index : '-'}<small>/100</small></div>
          <div class="statusLabel ${gIndex ? getStatusClass(gIndex.label) : ''}">${gIndex ? gIndex.label : '기록 없음'}</div>
          ${g ? `<div class="detail">Go ${Math.round(g.summary.goAcc * 100)}% · NoGo ${Math.round(g.summary.nogoAcc * 100)}%</div>` : ''}
        </div>

        <div class="stat digitspan">
          <div class="label">숫자 기억</div>
          <div class="value">${dIndex ? dIndex.index : '-'}<small>/100</small></div>
          <div class="statusLabel ${dIndex ? getStatusClass(dIndex.label) : ''}">${dIndex ? dIndex.label : '기록 없음'}</div>
          ${d ? `<div class="detail">정순 ${d.summary.forwardSpan} · 역순 ${d.summary.backwardSpan}</div>` : ''}
        </div>

        <div class="stat spatial">
          <div class="label">위치 기억</div>
          <div class="value">${sIndex ? sIndex.index : '-'}<small>/100</small></div>
          <div class="statusLabel ${sIndex ? getStatusClass(sIndex.label) : ''}">${sIndex ? sIndex.label : '기록 없음'}</div>
          ${s ? `<div class="detail">${s.summary.correctTrials}/6 정답 · ${Math.round(s.summary.avgAccuracy * 100)}%</div>` : ''}
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
          <span class="interpText"><b>숫자기억</b> ${dInterp}</span>
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

      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big" id="backToReport">주간 리포트로</button>
      </div>
    </section>
  `;
  
  setTimeout(() => drawHistoryChart('historyChart'), 50);
  
  $("#backToReport").onclick = () => {
    playClick();
    selectedWeekOffset = weekOffset;
    renderWeeklyReportContent();
  };
}

export async function renderWeeklyReport(initialOffset = 0) {
  selectedWeekOffset = initialOffset;
  document.querySelector(".progress").textContent = "주간 리포트";
  
  // 로딩 표시
  app.innerHTML = `
    <section class="card">
      <div style="text-align:center;padding:40px;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:32px;color:var(--accent);"></i>
        <p style="margin-top:16px;color:var(--muted);">데이터를 불러오는 중...</p>
      </div>
    </section>
  `;
  
  // 로그인 사용자는 서버에서 데이터 가져오기
  if (isLoggedIn()) {
    try {
      cachedServerResults = await getResults();
    } catch (e) {
      console.error('검사 결과 로드 실패:', e);
      cachedServerResults = [];
    }
  }
  
  renderWeeklyReportContent();
}

function renderWeeklyReportContent() {
  const isThisWeek = selectedWeekOffset === 0;
  const currentWeek = getWeekTestResults(selectedWeekOffset);
  const prevWeek = getWeekTestResults(selectedWeekOffset - 1);
  const oldestOffset = getOldestWeekOffset();
  
  // 각 영역별 비교
  const comparisons = {
    pattern: getComparison(currentWeek.pattern, prevWeek.pattern, 'raw', LS_KEYS.patternBaseline),
    gonogo: getComparison(currentWeek.gonogo, prevWeek.gonogo, 'raw', LS_KEYS.gonogoBaseline),
    digitspan: getComparison(currentWeek.digitspan, prevWeek.digitspan, 'totalSpan', LS_KEYS.digitspanBaseline),
    spatial: getComparison(currentWeek.spatial, prevWeek.spatial, 'raw', LS_KEYS.spatialBaseline)
  };
  
  const overall = getOverallMessage(comparisons, isThisWeek);
  
  // 4가지 검사 데이터가 하나라도 있는지 확인
  const hasAnyData = currentWeek.pattern.length > 0 || 
                     currentWeek.gonogo.length > 0 || 
                     currentWeek.digitspan.length > 0 || 
                     currentWeek.spatial.length > 0;
  
  // 4가지 검사 데이터가 모두 있는지 확인
  const hasCompleteData = currentWeek.pattern.length > 0 && 
                          currentWeek.gonogo.length > 0 && 
                          currentWeek.digitspan.length > 0 && 
                          currentWeek.spatial.length > 0;
  
  app.innerHTML = `
    <section class="card">
      <div class="reportHeader">
        <h1 class="title">📋 주간 리포트</h1>
      </div>
      
      <div class="weekNav">
        <button class="weekNavBtn" id="prevWeekBtn" ${selectedWeekOffset <= oldestOffset ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <div class="weekNavLabel">
          ${getWeekLabel(selectedWeekOffset)}
          ${isThisWeek ? '<br/><span class="thisWeekBadge">이번 주</span>' : ''}
        </div>
        <button class="weekNavBtn" id="nextWeekBtn" ${selectedWeekOffset >= 0 ? 'disabled' : ''}>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      
      <div class="reportOverall">
        <div class="reportOverallIcon"><i class="${overall.icon}"></i></div>
        <div class="reportOverallTitle">${overall.title}</div>
        <div class="reportOverallDesc">${overall.desc}</div>
      </div>
      
      <div class="reportGrid">
        <div class="reportItem">
          <div class="reportItemHeader">
            <span class="reportItemLabel">처리속도</span>
            ${getChangeText(comparisons.pattern.change)}
          </div>
          <div class="reportItemValue">${comparisons.pattern.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.pattern.label}</div>
        </div>
        
        <div class="reportItem">
          <div class="reportItemHeader">
            <span class="reportItemLabel">주의·억제</span>
            ${getChangeText(comparisons.gonogo.change)}
          </div>
          <div class="reportItemValue">${comparisons.gonogo.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.gonogo.label}</div>
        </div>
        
        <div class="reportItem">
          <div class="reportItemHeader">
            <span class="reportItemLabel">숫자 기억</span>
            ${getChangeText(comparisons.digitspan.change)}
          </div>
          <div class="reportItemValue">${comparisons.digitspan.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.digitspan.label}</div>
        </div>
        
        <div class="reportItem">
          <div class="reportItemHeader">
            <span class="reportItemLabel">위치 기억</span>
            ${getChangeText(comparisons.spatial.change)}
          </div>
          <div class="reportItemValue">${comparisons.spatial.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.spatial.label}</div>
        </div>
      </div>
      
      <div class="reportTip">
        <i class="fa-solid fa-lightbulb"></i>
        <span>매주 검사하면 변화 추이를 더 정확하게 볼 수 있어요</span>
      </div>
      
      ${hasAnyData ? `
      <button class="primaryBtn" id="viewDetailBtn" style="margin-top:16px;">
        <i class="fa-solid fa-chart-bar"></i>
        상세 결과 보기
      </button>
      ` : ''}
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:12px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  $("#prevWeekBtn").onclick = () => {
    if (selectedWeekOffset > oldestOffset) {
      playClick();
      selectedWeekOffset--;
      renderWeeklyReportContent();
    }
  };
  
  $("#nextWeekBtn").onclick = () => {
    if (selectedWeekOffset < 0) {
      playClick();
      selectedWeekOffset++;
      renderWeeklyReportContent();
    }
  };
  
  // 상세 결과 보기 버튼
  if (hasAnyData && $("#viewDetailBtn")) {
    $("#viewDetailBtn").onclick = () => {
      playClick();
      renderDetailedResult(currentWeek, selectedWeekOffset);
    };
  }
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}
