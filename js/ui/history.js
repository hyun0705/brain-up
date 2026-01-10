// ui/history.js - 검사 기록 (전문 분석 버전)
import { $ } from '../core/utils.js';
import { LS_KEYS, loadHistory, getUserProfile } from '../core/storage.js';
import { getInterpretation } from '../core/scoring.js';
import { renderChartLegend } from './result.js';
import { playClick } from '../core/sound.js';
import { isLoggedIn, getResults } from '../core/api.js';
import { startPatternTest } from '../tests/pattern.js';
import { state } from '../core/state.js';

const app = $("#app");

// renderHome은 순환참조 방지를 위해 동적 import 사용
let renderHome = null;
async function getHome() {
  if (!renderHome) {
    const module = await import('./home.js');
    renderHome = module.renderHome;
  }
  return renderHome;
}

// 서버에서 가져온 결과 캐시
let cachedServerResults = null;

// 현재 선택된 탭
let currentTab = 'overview'; // 'overview' | 'list' | 'analysis'

// 현재 선택된 기간 필터
let periodFilter = 'all'; // 'all' | 'month' | 'week'


// 한글 조사 처리 (이/가)
function getSubjectParticle(word) {
  if (!word) return '이';
  const lastChar = word.charAt(word.length - 1);
  const code = lastChar.charCodeAt(0);
  // 한글 유니코드 범위 체크
  if (code < 0xAC00 || code > 0xD7A3) return '이';
  // 받침 있으면 '이', 없으면 '가'
  return (code - 0xAC00) % 28 > 0 ? '이' : '가';
}

// ==================== 데이터 처리 함수 ====================

// 히스토리 차트 그리기 (서버/로컬 데이터 모두 지원)
function drawHistoryChartFromData(canvasId, limit = 10) {
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
  
  // 데이터 소스 선택: 로그인 사용자는 서버 데이터, 아니면 로컬
  let patternData = [], gonogoData = [], digitspanData = [], spatialData = [];
  
  if (isLoggedIn() && cachedServerResults) {
    // 서버 데이터 사용
    const getTypeData = (type) => {
      return cachedServerResults
        .filter(r => r.test_type === type)
        .map(r => {
          const summary = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
          return { summary, date: toKoreaTime(r.date || r.created_at) };
        })
        .sort((a, b) => a.date - b.date)
        .slice(-limit);
    };
    patternData = getTypeData('pattern');
    gonogoData = getTypeData('gonogo');
    digitspanData = getTypeData('digitspan');
    spatialData = getTypeData('spatial');
  } else {
    // 로컬 데이터 사용
    const loadLocal = (key) => {
      return loadHistory(key).slice(-limit).map(x => ({
        summary: x.summary,
        date: new Date(x.ended_at)
      }));
    };
    patternData = loadLocal(LS_KEYS.patternHistory);
    gonogoData = loadLocal(LS_KEYS.gonogoHistory);
    digitspanData = loadLocal(LS_KEYS.digitspanHistory);
    spatialData = loadLocal(LS_KEYS.spatialHistory);
  }
  
  const normalize = (data) => {
    return data.map((x, i) => ({
      idx: i,
      value: Math.min(100, Math.max(0, x.summary.raw || 0)),
      date: x.date
    }));
  };
  
  const datasets = [
    { name: '처리속도', color: '#2563eb', data: normalize(patternData) },
    { name: '주의·억제', color: '#16a34a', data: normalize(gonogoData) },
    { name: '작업기억', color: '#ea580c', data: normalize(digitspanData) },
    { name: '위치기억', color: '#dc2626', data: normalize(spatialData) },
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

// UTC를 한국 시간으로 변환 (서버 데이터용)
function toKoreaTime(dateStr) {
  if (!dateStr) return new Date();
  
  // 이미 Date 객체인 경우
  if (dateStr instanceof Date) return dateStr;
  
  // 숫자(timestamp)인 경우
  if (typeof dateStr === 'number') {
    return new Date(dateStr);
  }
  
  // 문자열인 경우: 서버에서 오는 UTC 날짜 처리
  const utcDate = new Date(dateStr + (dateStr.includes('Z') || dateStr.includes('+') ? '' : 'Z'));
  return new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
}

// 전체 검사 기록 가져오기
function getAllTestRecords() {
  let records = [];
  
  if (isLoggedIn() && cachedServerResults) {
    cachedServerResults
      .filter(r => r.test_type !== 'training')
      .forEach(r => {
        records.push({
          date: toKoreaTime(r.date || r.created_at),
          testType: r.test_type,
          summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary
        });
      });
  } else {
    const patternHist = loadHistory(LS_KEYS.patternHistory);
    const gonogoHist = loadHistory(LS_KEYS.gonogoHistory);
    const digitspanHist = loadHistory(LS_KEYS.digitspanHistory);
    const spatialHist = loadHistory(LS_KEYS.spatialHistory);
    
    patternHist.forEach(r => records.push({ date: r.ended_at, testType: 'pattern', summary: r.summary }));
    gonogoHist.forEach(r => records.push({ date: r.ended_at, testType: 'gonogo', summary: r.summary }));
    digitspanHist.forEach(r => records.push({ date: r.ended_at, testType: 'digitspan', summary: r.summary }));
    spatialHist.forEach(r => records.push({ date: r.ended_at, testType: 'spatial', summary: r.summary }));
  }
  
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return records;
}

// 날짜별로 그룹화
function groupRecordsByDate(records) {
  const groups = {};
  
  records.forEach(r => {
    const dateKey = new Date(r.date).toLocaleDateString('ko-KR');
    if (!groups[dateKey]) {
      groups[dateKey] = {
        dateKey,
        date: new Date(r.date),
        tests: {}
      };
    }
    if (!groups[dateKey].tests[r.testType]) {
      groups[dateKey].tests[r.testType] = r;
    }
  });
  
  return Object.values(groups).sort((a, b) => b.date - a.date);
}

// 기간 필터링
function filterByPeriod(records, period) {
  if (period === 'all') return records;
  
  const now = new Date();
  let cutoff;
  
  if (period === 'week') {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'month') {
    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  return records.filter(r => new Date(r.date) >= cutoff);
}

// 통계 계산
function calculateStats(groupedRecords) {
  if (groupedRecords.length === 0) {
    return { totalTests: 0, avgScore: 0, bestScore: 0, trend: 'none' };
  }
  
  const scores = [];
  const recentScores = [];
  const olderScores = [];
  
  groupedRecords.forEach((group, idx) => {
    let total = 0, count = 0;
    
    Object.entries(group.tests).forEach(([type, test]) => {
      total += getAccuracyScore(type, test.summary);
      count++;
    });
    
    if (count > 0) {
      const avg = total / count;
      scores.push(avg);
      if (idx < 3) recentScores.push(avg);
      else if (idx >= 3 && idx < 6) olderScores.push(avg);
    }
  });
  
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const bestScore = scores.length > 0 ? Math.round(Math.max(...scores)) : 0;
  
  // 트렌드 계산
  let trend = 'stable';
  if (recentScores.length > 0 && olderScores.length > 0) {
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    if (recentAvg > olderAvg + 3) trend = 'up';
    else if (recentAvg < olderAvg - 3) trend = 'down';
  }
  
  return {
    totalTests: groupedRecords.length,
    avgScore,
    bestScore,
    trend
  };
}

// 점수 기준
const SCORE_THRESHOLDS = {
  STRENGTH: 70,    // 70% 이상이어야 강점
  WEAKNESS: 50,    // 50% 미만이면 개선 필요
};

// 맞은 개수와 총 문제 수 반환 (기존 데이터 호환)
function getCorrectAndTotal(type, summary) {
  if (type === 'pattern') {
    const total = summary.answered || 0;
    const correct = summary.correctN || Math.round((summary.accuracy || 0) * total);
    return { correct, total };
  } else if (type === 'gonogo') {
    const goTotal = summary.goTrials || 0;
    const nogoTotal = summary.nogoTrials || 0;
    const total = goTotal + nogoTotal || summary.totalTrials || 0;
    if (total === 0) {
      // 기존 데이터: combinedAcc만 있는 경우 (총 문제수 모름 → 정확도만 반환)
      const acc = summary.combinedAcc || ((summary.goAcc || 0) + (summary.nogoAcc || 0)) / 2;
      return { correct: Math.round(acc * 100), total: 100 }; // 100점 만점 기준
    }
    const goCorrect = Math.round((summary.goAcc || 0) * goTotal);
    const nogoCorrect = Math.round((summary.nogoAcc || 0) * nogoTotal);
    const correct = goCorrect + nogoCorrect;
    return { correct, total };
  } else if (type === 'digitspan') {
    const forwardTrials = summary.forwardTrials || 0;
    const backwardTrials = summary.backwardTrials || 0;
    const total = forwardTrials + backwardTrials;
    const forwardCorrect = summary.forwardCorrect || 0;
    const backwardCorrect = summary.backwardCorrect || 0;
    let correct = forwardCorrect + backwardCorrect;
    // 기존 데이터: 정답 수가 없는 경우
    if (total === 0 || (total > 0 && correct === 0)) {
      // accuracy가 있으면 사용
      if (summary.accuracy && summary.accuracy > 0) {
        const estimatedTotal = total || 10; // 기본 10문제 가정
        return { correct: Math.round(summary.accuracy * estimatedTotal), total: estimatedTotal };
      }
      // totalSpan 기반으로 추정 (최대 14)
      const totalSpan = summary.totalSpan || ((summary.forwardSpan || 0) + (summary.backwardSpan || 0));
      if (totalSpan > 0) {
        return { correct: totalSpan, total: 14 };
      }
    }
    return { correct, total: total || 1 };
  } else if (type === 'spatial') {
    const total = summary.totalTrials || 6;
    const correct = summary.correctTrials || Math.round((summary.avgAccuracy || 0) * total);
    return { correct, total };
  }
  return { correct: 0, total: 1 };
}

// 정확도 점수 계산 (기존 데이터 호환)
function getAccuracyScore(type, summary) {
  // 모든 타입에서 raw를 우선 사용 (report.js와 통일)
  if (summary.raw !== undefined) {
    return Math.round(summary.raw);
  }
  
  // 기존 데이터 호환
  if (type === 'pattern') {
    if (summary.accuracy !== undefined) {
      return Math.round(summary.accuracy * 100);
    }
  } else if (type === 'gonogo') {
    if (summary.combinedAcc !== undefined) {
      return Math.round(summary.combinedAcc * 100);
    }
    if (summary.goAcc !== undefined && summary.nogoAcc !== undefined) {
      return Math.round((summary.goAcc + summary.nogoAcc) / 2 * 100);
    }
  } else if (type === 'digitspan') {
    if (summary.accuracy !== undefined && summary.accuracy > 0) {
      return Math.round(summary.accuracy * 100);
    }
    // 아주 오래된 데이터: forwardSpan + backwardSpan 기반으로 추정 (최대 14)
    const totalSpan = summary.totalSpan || ((summary.forwardSpan || 0) + (summary.backwardSpan || 0));
    if (totalSpan > 0) {
      return Math.round((totalSpan / 14) * 100);
    }
  } else if (type === 'spatial') {
    if (summary.avgAccuracy !== undefined) {
      return Math.round(summary.avgAccuracy * 100);
    }
  }
  
  return 0;
}

// 영역별 강점/약점 분석 (기간 필터에 따라 데이터 제한)
function analyzeStrengthWeakness(groupedRecords, limit = null) {
  const areaScores = {
    pattern: [],
    gonogo: [],
    digitspan: [],
    spatial: []
  };
  
  // limit이 있으면 최근 N개만, 없으면 전체
  const targetRecords = limit ? groupedRecords.slice(0, limit) : groupedRecords;
  
  // 각 영역별로 맞은 개수와 총 문제 수 누적
  const areaTotals = {
    pattern: { correct: 0, total: 0 },
    gonogo: { correct: 0, total: 0 },
    digitspan: { correct: 0, total: 0 },
    spatial: { correct: 0, total: 0 }
  };
  
  targetRecords.forEach(group => {
    Object.entries(group.tests).forEach(([type, test]) => {
      const { correct, total } = getCorrectAndTotal(type, test.summary);
      areaTotals[type].correct += correct;
      areaTotals[type].total += total;
    });
  });
  
  const areaAvgs = {};
  Object.entries(areaTotals).forEach(([type, { correct, total }]) => {
    if (total > 0) {
      areaAvgs[type] = Math.round((correct / total) * 100);
    }
  });
  
  const validAreas = Object.entries(areaAvgs);
  if (validAreas.length === 0) return { strongest: null, weakest: null };
  
  validAreas.sort((a, b) => b[1] - a[1]);
  
  // 강점: 가장 높은 점수가 70% 이상일 때만
  const topArea = validAreas[0];
  const strongest = topArea[1] >= SCORE_THRESHOLDS.STRENGTH ? topArea : null;
  
  // 약점: 가장 낮은 점수가 50% 미만일 때만
  const bottomArea = validAreas[validAreas.length - 1];
  const weakest = bottomArea[1] < SCORE_THRESHOLDS.WEAKNESS ? bottomArea : null;
  
  return {
    strongest,
    weakest,
    all: areaAvgs
  };
}

// 기간 필터에 따른 데이터 제한 수 반환
function getDataLimit() {
  return periodFilter === 'month' ? 4 : null; // 30일=4회, 전체=무제한
}

// 시간대별 성과 분석
function analyzeTimeOfDay(records) {
  const timeSlots = {
    morning: { scores: [], label: '오전 (6-12시)' },
    afternoon: { scores: [], label: '오후 (12-18시)' },
    evening: { scores: [], label: '저녁 (18-24시)' },
    night: { scores: [], label: '새벽 (0-6시)' }
  };
  
  records.forEach(r => {
    // r.date는 Date 객체, timestamp, 또는 문자열일 수 있음
    const koreaDate = toKoreaTime(r.date);
    const hour = koreaDate.getHours();
    let slot;
    if (hour >= 6 && hour < 12) slot = 'morning';
    else if (hour >= 12 && hour < 18) slot = 'afternoon';
    else if (hour >= 18) slot = 'evening';
    else slot = 'night';
    
    timeSlots[slot].scores.push(getAccuracyScore(r.testType, r.summary));
  });
  
  let best = null;
  let bestAvg = 0;
  
  Object.entries(timeSlots).forEach(([key, data]) => {
    if (data.scores.length >= 2) {
      const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      data.avg = Math.round(avg);
      if (avg > bestAvg) {
        bestAvg = avg;
        best = key;
      }
    }
  });
  
  return { timeSlots, bestTime: best };
}

// 상세 통계 계산
function calculateDetailedStats(groupedRecords, limit = null) {
  if (groupedRecords.length === 0) {
    return null;
  }
  
  // limit이 있으면 최근 N개만
  const targetRecords = limit ? groupedRecords.slice(0, limit) : groupedRecords;
  const areaNames = { pattern: '처리속도', gonogo: '주의·억제', digitspan: '작업기억', spatial: '위치기억' };
  
  // 1. 완주율 (4개 검사 모두 완료한 비율)
  const completeCount = targetRecords.filter(g => Object.keys(g.tests).length === 4).length;
  const completionRate = Math.round((completeCount / targetRecords.length) * 100);
  
  // 2. 최고 점수 달성일
  let bestScore = 0;
  let bestScoreDate = null;
  targetRecords.forEach(group => {
    let total = 0, count = 0;
    Object.entries(group.tests).forEach(([type, test]) => {
      total += getAccuracyScore(type, test.summary);
      count++;
    });
    if (count > 0) {
      const avg = total / count;
      if (avg > bestScore) {
        bestScore = avg;
        bestScoreDate = group.date;
      }
    }
  });
  
  // 3. 평균 검사 간격
  let avgInterval = null;
  if (targetRecords.length >= 2) {
    const sortedDates = targetRecords.map(g => g.date.getTime()).sort((a, b) => a - b);
    let totalDays = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      totalDays += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
    }
    avgInterval = Math.round(totalDays / (sortedDates.length - 1));
  }
  
  // 4. 연속 검사 주 계산
  let consecutiveWeeks = 0;
  if (targetRecords.length > 0) {
    // 주 단위로 그룹화 (일요일 기준)
    const getWeekStart = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    
    const weekSet = new Set(targetRecords.map(g => getWeekStart(g.date)));
    const weeks = Array.from(weekSet).sort((a, b) => b - a); // 최신순
    
    // 현재 주부터 연속 카운트
    const now = new Date();
    const currentWeekStart = getWeekStart(now);
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    let checkWeek = currentWeekStart;
    while (weekSet.has(checkWeek)) {
      consecutiveWeeks++;
      checkWeek -= oneWeek;
    }
  }
  
  // 5. 가장 많이 향상된 영역
  let mostImprovedArea = null;
  if (targetRecords.length >= 4) {
    const areaImprovements = {};
    
    ['pattern', 'gonogo', 'digitspan', 'spatial'].forEach(type => {
      const areaRecords = targetRecords
        .filter(g => g.tests[type]);
      
      if (areaRecords.length >= 4) {
        // 최근 절반 vs 이전 절반
        const half = Math.floor(areaRecords.length / 2);
        const recent = areaRecords.slice(0, half);
        const older = areaRecords.slice(half);
        
        const getAvg = (records) => {
          let total = 0;
          records.forEach(g => {
            total += getAccuracyScore(type, g.tests[type].summary);
          });
          return total / records.length;
        };
        
        const recentAvg = getAvg(recent);
        const olderAvg = getAvg(older);
        areaImprovements[type] = recentAvg - olderAvg;
      }
    });
    
    // 가장 많이 향상된 영역 찾기
    let maxImprovement = 0;
    Object.entries(areaImprovements).forEach(([type, improvement]) => {
      if (improvement > maxImprovement) {
        maxImprovement = improvement;
        mostImprovedArea = { type, improvement: Math.round(improvement) };
      }
    });
  }
  
  return {
    completionRate,
    bestScoreDate,
    bestScore: Math.round(bestScore),
    avgInterval,
    consecutiveWeeks,
    mostImprovedArea,
    areaNames
  };
}

// 백분위 계산 (가상 - 실제로는 서버에서 계산)
function calculatePercentile(score, age) {
  // 간단한 시뮬레이션 - 실제로는 연령대별 데이터 필요
  const basePercentile = Math.min(99, Math.max(1, Math.round(score * 0.95 + 5)));
  return basePercentile;
}

// ==================== 렌더링 함수 ====================

export async function renderHistory() {
  state.phase = 'history';
  document.querySelector(".progress").textContent = "검사 기록";
  
  app.innerHTML = `
    <section class="card">
      <div style="text-align:center;padding:60px 40px;">
        <div class="loadingSpinner"></div>
        <p style="margin-top:20px;color:var(--muted);font-size:14px;">데이터를 불러오는 중...</p>
      </div>
    </section>
  `;
  
  if (isLoggedIn()) {
    try {
      cachedServerResults = await getResults();
    } catch (e) {
      console.error('검사 결과 로드 실패:', e);
      cachedServerResults = [];
    }
  }
  
  renderHistoryMain();
}

function renderHistoryMain() {
  const records = getAllTestRecords();
  const filteredRecords = filterByPeriod(records, periodFilter);
  const groupedRecords = groupRecordsByDate(filteredRecords);
  const stats = calculateStats(groupedRecords);
  const profile = getUserProfile();
  
  // 기록이 없을 때
  if (groupedRecords.length === 0) {
    renderEmptyState();
    return;
  }
  
  // 첫 검사일
  const allGrouped = groupRecordsByDate(records);
  const firstTestDate = allGrouped.length > 0 
    ? allGrouped[allGrouped.length - 1].date.toLocaleDateString('ko-KR')
    : '-';
  
  // 탭 콘텐츠
  let tabContent = '';
  if (currentTab === 'overview') {
    tabContent = renderOverviewTab(groupedRecords, stats, profile);
  } else if (currentTab === 'list') {
    tabContent = renderListTab(groupedRecords);
  } else if (currentTab === 'analysis') {
    tabContent = renderAnalysisTab(records, groupedRecords, profile);
  }
  
  app.innerHTML = `
    <section class="card historyCard">
      <div class="historyHeader">
        <h1 class="historyTitle">검사 기록</h1>
        <div class="historyMeta">${firstTestDate}부터 · 총 ${allGrouped.length}회</div>
      </div>
      
      <!-- 기간 필터 -->
      <div class="periodFilter">
        <button class="filterBtn ${periodFilter === 'month' ? 'active' : ''}" data-period="month">최근 30일</button>
        <button class="filterBtn ${periodFilter === 'all' ? 'active' : ''}" data-period="all">전체</button>
      </div>
      
      <!-- 탭 메뉴 -->
      <div class="historyTabs">
        <button class="historyTab ${currentTab === 'overview' ? 'active' : ''}" data-tab="overview">
          <i class="fa-solid fa-chart-simple"></i>
          <span>요약</span>
        </button>
        <button class="historyTab ${currentTab === 'list' ? 'active' : ''}" data-tab="list">
          <i class="fa-solid fa-list"></i>
          <span>기록</span>
        </button>
        <button class="historyTab ${currentTab === 'analysis' ? 'active' : ''}" data-tab="analysis">
          <i class="fa-solid fa-magnifying-glass-chart"></i>
          <span>분석</span>
        </button>
      </div>
      
      <!-- 탭 콘텐츠 -->
      <div class="historyTabContent">
        ${tabContent}
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:20px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  // 이벤트 바인딩
  bindHistoryEvents(groupedRecords);
}

function renderEmptyState() {
  app.innerHTML = `
    <section class="card">
      <h1 class="title" style="text-align:center;">검사 기록</h1>
      
      <div class="emptyState">
        <i class="fa-solid fa-clipboard-list"></i>
        <div class="emptyTitle">아직 검사 기록이 없어요</div>
        <div class="emptyDesc">첫 검사를 진행하고 인지기능을 확인해보세요</div>
        <button class="primaryBtn" id="startFirstTest">
          <i class="fa-solid fa-play"></i>
          검사 시작하기
        </button>
      </div>
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:16px;">
        <button class="big ghost" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  $("#startFirstTest").onclick = () => {
    playClick();
    startPatternTest();
  };
  $("#backHome").onclick = async () => {
    playClick();
    const home = await getHome();
    home();
  };
}

// 요약 탭
function renderOverviewTab(groupedRecords, stats, profile) {
  const trendIcon = stats.trend === 'up' ? 'fa-arrow-trend-up' : stats.trend === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';
  const trendColor = stats.trend === 'up' ? 'var(--good)' : stats.trend === 'down' ? 'var(--warn)' : 'var(--muted)';
  const trendText = stats.trend === 'up' ? '향상 중' : stats.trend === 'down' ? '하락 중' : '유지 중';
  
  // 백분위 (가상)
  const percentile = profile?.age ? calculatePercentile(stats.avgScore, profile.age) : null;
  
  // 영역별 분석 (기간 필터에 따라 제한)
  const limit = getDataLimit();
  const analysis = analyzeStrengthWeakness(groupedRecords, limit);
  const areaNames = { pattern: '처리속도', gonogo: '주의·억제', digitspan: '작업기억', spatial: '위치기억' };
  
  // 차트 표시 개수 (30일=4회, 전체=10회)
  const chartLimit = periodFilter === 'month' ? 4 : 10;
  const chartSubText = periodFilter === 'month' ? '최근 4회' : '최근 10회';
  
  return `
    <!-- 핵심 통계 카드 -->
    <div class="statsGrid">
      <div class="statCard primary">
        <div class="statValue">${stats.avgScore}<small>/100</small></div>
        <div class="statLabel">평균 점수</div>
        ${percentile ? `<div class="statExtra">상위 ${100 - percentile}%</div>` : ''}
      </div>
      <div class="statCard">
        <div class="statValue">${stats.bestScore}</div>
        <div class="statLabel">최고 점수</div>
      </div>
      <div class="statCard">
        <div class="statValue" style="color:${trendColor};">
          <i class="fa-solid ${trendIcon}"></i>
        </div>
        <div class="statLabel">${trendText}</div>
      </div>
    </div>
    
    <!-- 변화 추이 차트 -->
    <div class="chartSection">
      <div class="sectionHeader">
        <span class="sectionTitle">변화 추이</span>
        <span class="sectionSub">${chartSubText}</span>
      </div>
      <canvas id="historyChart" style="width:100%;height:160px;" data-limit="${chartLimit}"></canvas>
      ${renderChartLegend()}
    </div>
    
    <!-- 영역별 점수 -->
    ${analysis.all ? `
    <div class="areaScoresSection">
      <div class="sectionHeader">
        <span class="sectionTitle">영역별 평균</span>
      </div>
      <div class="areaScoresList">
        ${Object.entries(analysis.all).map(([type, score]) => {
          const isStrong = analysis.strongest && analysis.strongest[0] === type;
          const isWeak = analysis.weakest && analysis.weakest[0] === type;
          return `
            <div class="areaScoreItem ${type}">
              <div class="areaScoreLeft">
                <span class="areaScoreName">${areaNames[type]}</span>
                ${isStrong ? '<span class="areaTag strong">강점</span>' : ''}
                ${isWeak && !isStrong ? '<span class="areaTag weak">개선 필요</span>' : ''}
              </div>
              <div class="areaScoreRight">
                <div class="areaScoreBar">
                  <div class="areaScoreBarFill ${type}" style="width:${score}%;"></div>
                </div>
                <span class="areaScoreValue">${score}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- 인사이트 카드 -->
    ${analysis.strongest ? `
    <div class="insightCard">
      <div class="insightIcon"><i class="fa-solid fa-star"></i></div>
      <div class="insightContent">
        <div class="insightTitle">${areaNames[analysis.strongest[0]]}${getSubjectParticle(areaNames[analysis.strongest[0]])} 강점이에요</div>
        <div class="insightDesc">
          평균 ${analysis.strongest[1]}%로 좋은 성과를 보여주고 있어요.
        </div>
      </div>
    </div>
    ` : ''}
    ${analysis.weakest ? `
    <div class="insightCard warn">
      <div class="insightIcon"><i class="fa-solid fa-chart-line"></i></div>
      <div class="insightContent">
        <div class="insightTitle">${areaNames[analysis.weakest[0]]} 영역을 연습해보세요</div>
        <div class="insightDesc">
          평균 ${analysis.weakest[1]}%로, 꾸준한 관리를 통해 향상시킬 수 있어요.
        </div>
      </div>
    </div>
    ` : ''}
    ${!analysis.strongest && !analysis.weakest ? `
    <div class="insightCard">
      <div class="insightIcon"><i class="fa-solid fa-balance-scale"></i></div>
      <div class="insightContent">
        <div class="insightTitle">모든 영역이 균형 잡혀 있어요</div>
        <div class="insightDesc">
          특별히 강하거나 약한 영역 없이 고르게 유지되고 있어요.
        </div>
      </div>
    </div>
    ` : ''}
  `;
}

// 기록 탭
function renderListTab(groupedRecords) {
  if (groupedRecords.length === 0) {
    return `
      <div class="emptyTab">
        <i class="fa-solid fa-filter-circle-xmark"></i>
        <p>선택한 기간에 검사 기록이 없어요</p>
      </div>
    `;
  }
  
  let listHtml = '';
  groupedRecords.forEach((group, idx) => {
    const dateStr = group.date.toLocaleDateString('ko-KR', { 
      month: 'long', 
      day: 'numeric',
      weekday: 'short'
    });
    
    const testCount = Object.keys(group.tests).length;
    const testTypes = ['pattern', 'gonogo', 'digitspan', 'spatial'].filter(t => group.tests[t]);
    
    // 평균 점수 계산
    let totalIndex = 0, indexCount = 0;
    
    Object.entries(group.tests).forEach(([type, test]) => {
      totalIndex += getAccuracyScore(type, test.summary);
      indexCount++;
    });
    
    const avgIndex = indexCount > 0 ? Math.round(totalIndex / indexCount) : '-';
    
    // 검사 아이콘들
    const testIcons = testTypes.map(t => {
      const icons = {
        pattern: '<i class="fa-solid fa-bolt" style="color:#2563eb;"></i>',
        gonogo: '<i class="fa-solid fa-hand" style="color:#16a34a;"></i>',
        digitspan: '<i class="fa-solid fa-list-ol" style="color:#ea580c;"></i>',
        spatial: '<i class="fa-solid fa-grip" style="color:#dc2626;"></i>'
      };
      return icons[t] || '';
    }).join(' ');
    
    // 완료도 표시
    const completionRate = Math.round((testCount / 4) * 100);
    
    listHtml += `
      <div class="historyListItem" data-index="${idx}">
        <div class="historyListLeft">
          <div class="historyListDate">${dateStr}</div>
          <div class="historyListMeta">
            ${testIcons}
            <span class="historyListCount">${testCount}/4 검사</span>
          </div>
        </div>
        <div class="historyListRight">
          <div class="historyListScore">${avgIndex}<small>%</small></div>
          <i class="fa-solid fa-chevron-right historyListArrow"></i>
        </div>
      </div>
    `;
  });
  
  return `
    <div class="historyList">
      ${listHtml}
    </div>
  `;
}

// 분석 탭
function renderAnalysisTab(records, groupedRecords, profile) {
  const limit = getDataLimit();
  const timeAnalysis = analyzeTimeOfDay(records);
  const analysis = analyzeStrengthWeakness(groupedRecords, limit);
  const detailedStats = calculateDetailedStats(groupedRecords, limit);
  const areaNames = { pattern: '처리속도', gonogo: '주의·억제', digitspan: '작업기억', spatial: '위치기억' };
  const timeNames = { morning: '오전', afternoon: '오후', evening: '저녁', night: '새벽' };
  
  // 최고 점수 달성일 포맷
  const bestDateStr = detailedStats?.bestScoreDate 
    ? detailedStats.bestScoreDate.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    : '-';
  
  return `
    <!-- 시간대 분석 -->
    ${timeAnalysis.bestTime ? `
    <div class="analysisSection">
      <div class="sectionHeader">
        <span class="sectionTitle">🕐 시간대별 성과</span>
      </div>
      <div class="timeAnalysis">
        ${Object.entries(timeAnalysis.timeSlots)
          .filter(([_, data]) => data.scores.length > 0)
          .map(([key, data]) => `
            <div class="timeSlotItem ${key === timeAnalysis.bestTime ? 'best' : ''}">
              <div class="timeSlotLabel">${data.label}</div>
              <div class="timeSlotBar">
                <div class="timeSlotBarFill" style="width:${data.avg || 0}%;"></div>
              </div>
              <div class="timeSlotValue">${data.avg || '-'}</div>
              ${key === timeAnalysis.bestTime ? '<span class="bestBadge">최적</span>' : ''}
            </div>
          `).join('')}
      </div>
      ${timeAnalysis.bestTime ? `
        <div class="analysisInsight">
          <i class="fa-solid fa-clock"></i>
          <span>${timeNames[timeAnalysis.bestTime]}에 검사할 때 가장 좋은 결과를 보여요!</span>
        </div>
      ` : ''}
    </div>
    ` : ''}
    
    <!-- 상세 통계 -->
    <div class="analysisSection">
      <div class="sectionHeader">
        <span class="sectionTitle">📈 상세 통계</span>
      </div>
      <div class="detailStatsList">
        <div class="detailStatItem">
          <span class="detailStatLabel">검사 횟수${periodFilter === 'month' ? ' (30일)' : ''}</span>
          <span class="detailStatValue">${limit ? Math.min(groupedRecords.length, limit) : groupedRecords.length}회</span>
        </div>
        <div class="detailStatItem">
          <span class="detailStatLabel">연속 검사</span>
          <span class="detailStatValue">${detailedStats?.consecutiveWeeks ?? 0}주 연속</span>
        </div>
        <div class="detailStatItem">
          <span class="detailStatLabel">최고 점수</span>
          <span class="detailStatValue">${detailedStats?.bestScore ?? '-'}% (${bestDateStr})</span>
        </div>
        <div class="detailStatItem">
          <span class="detailStatLabel">완주율 (4개 모두 완료)</span>
          <span class="detailStatValue">${detailedStats?.completionRate ?? 0}%</span>
        </div>
        ${detailedStats?.avgInterval ? `
        <div class="detailStatItem">
          <span class="detailStatLabel">평균 검사 간격</span>
          <span class="detailStatValue">${detailedStats.avgInterval}일</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- 영역별 상세 분석 -->
    ${analysis.all ? `
    <div class="analysisSection">
      <div class="sectionHeader">
        <span class="sectionTitle">🧠 영역별 분석</span>
      </div>
      <div class="areaDetailList">
        ${Object.entries(analysis.all).map(([type, score]) => {
          const interpretation = getInterpretation(type, score);
          const isStrong = analysis.strongest && analysis.strongest[0] === type;
          const isWeak = analysis.weakest && analysis.weakest[0] === type && !isStrong;
          
          return `
            <div class="areaDetailItem ${type}">
              <div class="areaDetailHeader">
                <span class="areaDetailName">${areaNames[type]}</span>
                <span class="areaDetailScore">${score}%</span>
              </div>
              <div class="areaDetailDesc">${interpretation}</div>
              ${isStrong ? '<div class="areaDetailTag strong"><i class="fa-solid fa-star"></i> 강점 영역</div>' : ''}
              ${isWeak ? '<div class="areaDetailTag weak"><i class="fa-solid fa-dumbbell"></i> 개선 필요</div>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- 추천 -->
    <div class="recommendationCard">
      <div class="recommendationIcon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
      <div class="recommendationContent">
        <div class="recommendationTitle">맞춤 추천</div>
        <div class="recommendationText">
          ${analysis.weakest ? `${areaNames[analysis.weakest[0]]} 영역을 강화하는 훈련을 추천해요.` : '꾸준히 관리하며 현재 수준을 유지해보세요!'}
        </div>
      </div>
    </div>
  `;
}

// 상세 보기
function renderHistoryDetail(group) {
  document.querySelector(".progress").textContent = "검사 상세";
  
  const dateStr = group.date.toLocaleDateString('ko-KR', { 
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    weekday: 'long'
  });
  
  const areaNames = { pattern: '처리속도', gonogo: '주의·억제', digitspan: '작업기억', spatial: '위치기억' };
  const areaIcons = { pattern: 'fa-bolt', gonogo: 'fa-hand', digitspan: 'fa-list-ol', spatial: 'fa-grip' };
  
  let resultsHtml = '';
  let totalScore = 0, scoreCount = 0;
  
  ['pattern', 'gonogo', 'digitspan', 'spatial'].forEach(type => {
    if (group.tests[type]) {
      const test = group.tests[type];
      // 정확도 % 계산 (기존 데이터 호환)
      const score = getAccuracyScore(type, test.summary);
      const interpretation = getInterpretation(type, score);
      
      totalScore += score;
      scoreCount++;
      
      // 검사별 상세 정보
      let detailInfo = '';
      if (type === 'pattern') {
        const correctN = test.summary.correctN || Math.round((test.summary.accuracy || 0) * (test.summary.answered || 0));
        detailInfo = `정답 ${correctN}/${test.summary.answered}`;
      } else if (type === 'gonogo') {
        const goCorrect = test.summary.goCorrect || Math.round((test.summary.goAcc || 0) * (test.summary.goTrials || 0));
        const nogoCorrect = test.summary.nogoCorrect || Math.round((test.summary.nogoAcc || 0) * (test.summary.nogoTrials || 0));
        detailInfo = `Go ${goCorrect}/${test.summary.goTrials || 0} · NoGo ${nogoCorrect}/${test.summary.nogoTrials || 0}`;
      } else if (type === 'digitspan') {
        const totalTrials = (test.summary.forwardTrials || 0) + (test.summary.backwardTrials || 0);
        detailInfo = totalTrials > 0 
          ? `정순 ${test.summary.forwardCorrect || 0}/${test.summary.forwardTrials || 0} · 역순 ${test.summary.backwardCorrect || 0}/${test.summary.backwardTrials || 0}`
          : `정순 ${test.summary.forwardSpan}자리 · 역순 ${test.summary.backwardSpan}자리`;
      } else if (type === 'spatial') {
        detailInfo = `정답 ${test.summary.correctTrials}/${test.summary.totalTrials}`;
      }
      
      resultsHtml += `
        <div class="detailResultCard ${type}">
          <div class="detailResultHeader">
            <div class="detailResultIcon"><i class="fa-solid ${areaIcons[type]}"></i></div>
            <div class="detailResultName">${areaNames[type]}</div>
          </div>
          <div class="detailResultBody">
            <div class="detailResultScore">
              <span class="scoreNum">${score}</span>
              <span class="scoreMax">%</span>
            </div>
          </div>
          <div class="detailResultInfo">${detailInfo}</div>
          <div class="detailResultInterp">${interpretation}</div>
        </div>
      `;
    }
  });
  
  const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;
  const completedCount = Object.keys(group.tests).length;
  
  // 누락된 검사 안내
  const allTypes = ['pattern', 'gonogo', 'digitspan', 'spatial'];
  const missingTypes = allTypes.filter(t => !group.tests[t]);
  
  app.innerHTML = `
    <section class="card">
      <div class="detailPageHeader">
        <button class="backBtn" id="backToList">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="detailPageTitle">
          <div class="detailPageDate">${dateStr}</div>
          <div class="detailPageMeta">${completedCount}/4 검사 완료</div>
        </div>
      </div>
      
      <!-- 종합 점수 -->
      <div class="detailSummary">
        <div class="detailSummaryScore">
          <div class="summaryScoreNum">${avgScore}</div>
          <div class="summaryScoreLabel">종합 점수</div>
        </div>
      </div>
      
      <!-- 각 검사 결과 -->
      <div class="detailResultsGrid">
        ${resultsHtml}
      </div>
      
      ${missingTypes.length > 0 ? `
        <div class="notice" style="margin-top:16px;">
          <i class="fa-solid fa-info-circle"></i>
          ${missingTypes.map(t => areaNames[t]).join(', ')} 검사는 진행하지 않았어요
        </div>
      ` : ''}
      
      <div class="controls" style="grid-template-columns:1fr;margin-top:24px;">
        <button class="big" id="backHome">홈으로</button>
      </div>
    </section>
  `;
  
  $("#backToList").onclick = () => {
    playClick();
    renderHistoryMain();
  };
  
  $("#backHome").onclick = async () => {
    playClick();
    const home = await getHome();
    home();
  };
}

// 이벤트 바인딩
function bindHistoryEvents(groupedRecords) {
  // 기간 필터
  document.querySelectorAll('.filterBtn').forEach(btn => {
    btn.onclick = () => {
      playClick();
      periodFilter = btn.dataset.period;
      renderHistoryMain();
    };
  });
  
  // 탭 전환
  document.querySelectorAll('.historyTab').forEach(tab => {
    tab.onclick = () => {
      playClick();
      currentTab = tab.dataset.tab;
      renderHistoryMain();
    };
  });
  
  // 리스트 아이템 클릭
  document.querySelectorAll('.historyListItem').forEach(item => {
    item.onclick = () => {
      playClick();
      const idx = parseInt(item.dataset.index);
      renderHistoryDetail(groupedRecords[idx]);
    };
  });
  
  // 차트 그리기
  if (currentTab === 'overview' && $('#historyChart')) {
    const chartLimit = parseInt($('#historyChart').dataset.limit) || 10;
    setTimeout(() => drawHistoryChartFromData('historyChart', chartLimit), 50);
  }
  
  // 홈 버튼
  $("#backHome").onclick = async () => {
    playClick();
    const home = await getHome();
    home();
  };
}
