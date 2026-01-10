// main.js - Entry point
import { renderMainIntro } from './ui/intro.js';
import { renderHome } from './ui/home.js';
import { $, showConfirmModal } from './core/utils.js';
import { resetState, saveTestProgress } from './core/state.js';
import { getUserProfile, clearSessionState } from './core/storage.js';
import { LS_KEYS, loadHistory } from './core/storage.js';
import { needsOnboarding, startOnboarding } from './ui/onboarding.js';
import { initTheme } from './ui/settings.js';
import { playClick } from './core/sound.js';

// 테마 초기화
initTheme();

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
$("#logo").onclick = async () => {
  playClick();
  const profile = getUserProfile();
  const { state } = await import('./core/state.js');
  
  // 홈, 설정, 공지사항 등에서는 바로 이동 (검사/관리 중이 아닐 때만)
  const safePhases = ['home', 'settings', 'notices', 'noticeDetail', 'calendar', 'report', 'history'];
  const isInTest = state.currentTest !== null;
  const isInTraining = (state.trainingQueue && state.trainingQueueIndex !== undefined) || 
                       state.gonogoTraining !== null || 
                       state.patternTraining !== null || 
                       state.spatialTraining !== null;
  
  if (safePhases.includes(state.phase) && !isInTest && !isInTraining) {
    goToHome(profile);
    return;
  }
  
  // 검사/관리/온보딩 중일 때는 확인 모달
  let title = '진행 중인 작업이 있어요';
  let message = '지금 나가면 진행 상황이<br/>저장되지 않아요';
  
  // 검사 중일 때
  if (isInTest) {
    title = '검사를 중단할까요?';
    message = '지금 나가면 진행 중인 검사 기록이<br/>저장되지 않을 수 있어요';
  }
  // 관리(training) 중일 때
  else if (isInTraining) {
    title = '관리를 중단할까요?';
    message = '지금 나가면 진행 중인 관리 기록이<br/>저장되지 않을 수 있어요';
  }
  // 온보딩 중일 때
  else if (state.phase && state.phase.includes('onboarding')) {
    title = '설정 중인 내용이 있어요';
    message = '지금 나가면 입력한 내용이<br/>저장되지 않아요';
  }
  
  const confirmed = await showConfirmModal({
    title,
    message,
    confirmText: '나가기',
    cancelText: '취소',
    danger: true
  });
  
  if (confirmed) {
    // 관리 중단 시에만 세션 클리어 (검사는 이어하기 허용)
    if (isInTraining) {
      clearSessionState();
    } else if (isInTest) {
      // 검사 중단 시 현재 상태 저장 (이어하기용)
      saveTestProgress();
    }
    // 상태 초기화
    resetState();
    goToHome(profile);
  }
};

function goToHome(profile) {
  if (profile && profile.onboardingComplete) {
    renderHome();
  } else {
    const hasHistory = loadHistory(LS_KEYS.patternHistory).length > 0;
    if (hasHistory) {
      renderHome();
    } else {
      renderMainIntro();
    }
  }
}

// 플로팅 위로가기 버튼
function initScrollTopButton() {
  // 버튼 생성
  const btn = document.createElement('button');
  btn.id = 'scrollTopBtn';
  btn.className = 'scrollTopBtn';
  btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
  btn.setAttribute('aria-label', '맨 위로');
  document.body.appendChild(btn);
  
  // 스크롤 이벤트
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 100) {
          btn.classList.add('show');
        } else {
          btn.classList.remove('show');
        }
        ticking = false;
      });
      ticking = true;
    }
  });
  
  // 클릭 이벤트
  btn.onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

initScrollTopButton();
