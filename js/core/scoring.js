// core/scoring.js
import { clamp, getRandomItem } from './utils.js';
import { loadHistory } from './storage.js';

export function computeIndexFromBaseline(raw, baseline) {
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

export const INTERPRETATIONS = {
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
      "오늘은 집중이 조금 흔들린 편이에요. 피곤하시거나 주변이 산만했을 수 있어요.",
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
};

export function getInterpretation(type, index) {
  const interp = INTERPRETATIONS[type];
  if (!interp) return '';
  
  if (index >= 55) return getRandomItem(interp.high);
  if (index >= 45) return getRandomItem(interp.normal);
  return getRandomItem(interp.low);
}

export function getOverallInterpretation(pIdx, gIdx, dIdx, sIdx) {
  const indices = [pIdx, gIdx, dIdx, sIdx].filter(x => typeof x === 'number');
  if (indices.length === 0) return '';
  
  const avg = indices.reduce((a, b) => a + b, 0) / indices.length;
  const lowCount = indices.filter(x => x < 45).length;
  
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

export function getTrendInterpretation(historyKey) {
  const history = loadHistory(historyKey);
  if (history.length < 3) return INTERPRETATIONS.trend.firstTime;
  
  const recent = history.slice(-5).map(x => x.summary.raw);
  if (recent.length < 2) return INTERPRETATIONS.trend.stable;
  
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const diff = secondAvg - firstAvg;
  const threshold = firstAvg * 0.1;
  
  if (diff > threshold) return INTERPRETATIONS.trend.improving;
  if (diff < -threshold) return INTERPRETATIONS.trend.variable;
  return INTERPRETATIONS.trend.stable;
}
