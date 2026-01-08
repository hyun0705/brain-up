// main.js - Entry point
import { renderMainIntro } from './ui/intro.js';
import { renderHome } from './ui/home.js';
import { $ } from './core/utils.js';
import { resetState, saveTestProgress } from './core/state.js';
import { getUserProfile } from './core/storage.js';
import { LS_KEYS, loadHistory } from './core/storage.js';
import { needsOnboarding, startOnboarding } from './ui/onboarding.js';

// 시작점 결정
function boot() {
  // 온보딩 필요한지 체크
  if (needsOnboarding()) {
    startOnboarding();
    return;
  }
  
  const profile = getUserProfile();
  const hasHistory = loadHistory(LS_KEYS.patternHistory).length > 0;
  
  // 온보딩 완료했으면 항상 홈으로
  // (진행 중인 검사가 있으면 홈에서 이어하기 표시)
  if (profile && profile.onboardingComplete) {
    renderHome();
  } else if (hasHistory) {
    // 기존 사용자 (온보딩 없던 시절 기록)
    renderHome();
  } else {
    renderMainIntro();
  }
}

// 페이지 이탈 시 진행 상태 저장
window.addEventListener('beforeunload', () => {
  saveTestProgress();
});

// 페이지 숨김 시에도 저장 (모바일 대응)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveTestProgress();
  }
});

boot();

// 로고 클릭 시 홈으로 이동
$("#logo").onclick = () => {
  const profile = getUserProfile();
  
  if (profile && profile.onboardingComplete) {
    if (confirm('현재 진행 중인 작업을 중단하고 홈으로 돌아갈까요?')) {
      resetState();
      renderHome();
    }
  } else {
    const hasHistory = loadHistory(LS_KEYS.patternHistory).length > 0;
    if (hasHistory) {
      if (confirm('현재 진행 중인 작업을 중단하고 홈으로 돌아갈까요?')) {
        resetState();
        renderHome();
      }
    } else {
      if (confirm('현재 진행 중인 작업을 중단하고 처음으로 돌아갈까요?')) {
        resetState();
        renderMainIntro();
      }
    }
  }
};
