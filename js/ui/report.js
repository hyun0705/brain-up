// ui/report.js
import { $ } from '../core/utils.js';
import { LS_KEYS, loadHistory, loadBaseline, getCurrentWeekRange } from '../core/storage.js';
import { computeIndexFromBaseline } from '../core/scoring.js';
import { playClick } from '../core/sound.js';
import { renderHome } from './home.js';

const app = $("#app");

// 현재 선택된 주 오프셋 (0 = 이번 주, -1 = 지난 주, -2 = 2주 전...)
let selectedWeekOffset = 0;

// 특정 오프셋의 주 범위 계산 (월요일 ~ 일요일)
function getWeekRangeByOffset(offset = 0) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { monday, sunday };
}

// 특정 주의 검사 결과 가져오기
function getWeekTestResults(offset = 0) {
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

// 주 라벨 생성 (예: "1월 6일 ~ 12일")
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

// 가장 오래된 기록이 있는 주 오프셋 계산
function getOldestWeekOffset() {
  const patternHist = loadHistory(LS_KEYS.patternHistory);
  if (patternHist.length === 0) return 0;
  
  // 가장 오래된 기록 찾기
  let oldestDate = null;
  for (let i = 0; i < patternHist.length; i++) {
    const d = new Date(patternHist[i].ended_at);
    if (!oldestDate || d < oldestDate) {
      oldestDate = d;
    }
  }
  
  if (!oldestDate) return 0;
  
  // 오늘 기준 몇 주 전인지 계산
  const today = new Date();
  const diffTime = today - oldestDate;
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
  
  return -diffWeeks - 1;
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

export function renderWeeklyReport(initialOffset = 0) {
  selectedWeekOffset = initialOffset;
  document.querySelector(".progress").textContent = "주간 리포트";
  
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
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  $("#prevWeekBtn").onclick = () => {
    if (selectedWeekOffset > oldestOffset) {
      playClick();
      renderWeeklyReport(selectedWeekOffset - 1);
    }
  };
  
  $("#nextWeekBtn").onclick = () => {
    if (selectedWeekOffset < 0) {
      playClick();
      renderWeeklyReport(selectedWeekOffset + 1);
    }
  };
  
  $("#backHome").onclick = () => { playClick(); renderHome(); };
}
