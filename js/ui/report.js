// ui/report.js
import { $ } from '../core/utils.js';
import { LS_KEYS, loadHistory, loadBaseline } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';
import { isLoggedIn, getResults } from '../core/api.js';
import { state } from '../core/state.js';

const app = $("#app");

// UTC를 한국 시간으로 변환 (서버 데이터용)
function toKoreaTime(dateStr) {
  if (!dateStr) return new Date();
  const utcDate = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// 현재 선택된 주 오프셋 (0 = 이번 주, -1 = 지난 주, -2 = 2주 전...)
let selectedWeekOffset = 0;

// 서버에서 가져온 결과 캐시
let cachedServerResults = null;

// 특정 오프셋의 주 범위 계산 (일요일 ~ 토요일)
function getWeekRangeByOffset(offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = 일요일
  
  // 일요일 시작 (일~토)
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - dayOfWeek + (offset * 7));
  sunday.setHours(0, 0, 0, 0);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  
  return { sunday, saturday };
}

// 특정 주의 검사 결과 가져오기 (로컬스토리지)
function getWeekTestResultsFromLocal(offset = 0) {
  const { sunday, saturday } = getWeekRangeByOffset(offset);
  
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
  const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
  const spatialHist = loadHistory(LS_KEYS.spatialHistory);
  
  const filterWeek = (history) => {
    return history.filter(entry => {
      const entryDate = new Date(entry.ended_at);
      return entryDate >= sunday && entryDate <= saturday;
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
  
  const { sunday, saturday } = getWeekRangeByOffset(offset);
  
  const filterWeek = (testType) => {
    return cachedServerResults
      .filter(r => r.test_type === testType)
      .filter(r => {
        const dateStr = r.date || r.created_at;
        if (!dateStr) return offset === 0;
        const entryDate = toKoreaTime(dateStr);
        return entryDate >= sunday && entryDate <= saturday;
      })
      .map(r => ({
        ended_at: toKoreaTime(r.date || r.created_at),
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
    // 서버 데이터에서 가장 오래된 날짜 찾기 (한국 시간 보정)
    cachedServerResults.forEach(r => {
      const d = toKoreaTime(r.date);
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
  const { sunday, saturday } = getWeekRangeByOffset(offset);
  const startMonth = sunday.getMonth() + 1;
  const startDay = sunday.getDate();
  const endMonth = saturday.getMonth() + 1;
  const endDay = saturday.getDate();
  
  if (startMonth === endMonth) {
    return `${startMonth}월 ${startDay}일 ~ ${endDay}일`;
  } else {
    return `${startMonth}월 ${startDay}일 ~ ${endMonth}월 ${endDay}일`;
  }
}

// 점수 비교 (선택된 주 vs 이전 주)
function getComparison(currentWeekResults, prevWeekResults) {
  const thisResult = currentWeekResults[0];
  const lastResult = prevWeekResults[0];
  
  if (!thisResult) return { current: null, change: null, label: '기록 없음' };
  
  // raw가 정확도 % (0-100) - 정수로 반올림
  const currentScore = Math.round(thisResult.summary.raw);
  
  if (!lastResult) {
    return { 
      current: currentScore, 
      change: null, 
      label: '첫 기록',
      isFirst: true
    };
  }
  
  const lastScore = Math.round(lastResult.summary.raw);
  const change = currentScore - lastScore;
  
  return {
    current: currentScore,
    previous: lastScore,
    change: change,
    label: change > 0 ? '상승' : change < 0 ? '하락' : '유지'
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

export async function renderWeeklyReport(initialOffset = 0) {
  state.phase = 'report';
  selectedWeekOffset = initialOffset;
  document.querySelector(".progress").textContent = "주간 리포트";
  
  // 로딩 표시
  app.innerHTML = `
    <section class="card">
      <div style="text-align:center;padding:60px 40px;">
        <div class="loadingSpinner"></div>
        <p style="margin-top:20px;color:var(--muted);font-size:14px;">데이터를 불러오는 중...</p>
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
    pattern: getComparison(currentWeek.pattern, prevWeek.pattern),
    gonogo: getComparison(currentWeek.gonogo, prevWeek.gonogo),
    digitspan: getComparison(currentWeek.digitspan, prevWeek.digitspan),
    spatial: getComparison(currentWeek.spatial, prevWeek.spatial)
  };
  
  const overall = getOverallMessage(comparisons, isThisWeek);
  
  
  
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
        <div class="reportItem pattern">
          <div class="reportItemHeader">
            <span class="reportItemLabel">처리속도</span>
            ${getChangeText(comparisons.pattern.change)}
          </div>
          <div class="reportItemValue">${comparisons.pattern.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.pattern.label}</div>
        </div>
        
        <div class="reportItem gonogo">
          <div class="reportItemHeader">
            <span class="reportItemLabel">주의·억제</span>
            ${getChangeText(comparisons.gonogo.change)}
          </div>
          <div class="reportItemValue">${comparisons.gonogo.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.gonogo.label}</div>
        </div>
        
        <div class="reportItem digitspan">
          <div class="reportItemHeader">
            <span class="reportItemLabel">작업기억</span>
            ${getChangeText(comparisons.digitspan.change)}
          </div>
          <div class="reportItemValue">${comparisons.digitspan.current ?? '-'}<small>/100</small></div>
          <div class="reportItemStatus">${comparisons.digitspan.label}</div>
        </div>
        
        <div class="reportItem spatial">
          <div class="reportItemHeader">
            <span class="reportItemLabel">위치기억</span>
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
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:16px;">
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
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}
