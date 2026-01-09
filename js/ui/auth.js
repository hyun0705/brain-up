// ui/auth.js - 로그인/회원가입 UI

import { $, showToast } from '../core/utils.js';
import { playClick } from '../core/sound.js';
import { login, signup, kakaoLogin, isLoggedIn, getMe, logout, getUserName, getUserBirthDate, getUserGender, syncTodayStatus } from '../core/api.js';
import { saveServerStatus, clearServerStatus } from '../core/storage.js';

const app = $("#app");
const KAKAO_JS_KEY = 'adc4f06aa51de1a85ffeca1989719c3c';

// 순환참조 방지를 위해 동적 import
async function goHome() {
  const { renderHome } = await import('./home.js');
  renderHome();
}

async function goCompleteProfile() {
  const { renderCompleteProfile } = await import('./settings.js');
  renderCompleteProfile();
}

// 프로필 완성 여부 확인
function needsProfileCompletion() {
  const name = getUserName();
  const birthDate = getUserBirthDate();
  const gender = getUserGender();
  return !name || !birthDate || !gender;
}

// 카카오 SDK 초기화
let kakaoInitialized = false;
function initKakao() {
  if (kakaoInitialized) return;
  if (window.Kakao && !window.Kakao.isInitialized()) {
    window.Kakao.init(KAKAO_JS_KEY);
    kakaoInitialized = true;
  }
}

// 카카오 연결 끊기 (탈퇴 시 사용)
export async function unlinkKakao() {
  return new Promise((resolve) => {
    initKakao();
    if (!window.Kakao || !window.Kakao.Auth.getAccessToken()) {
      // 카카오 토큰 없으면 그냥 성공 처리
      resolve(true);
      return;
    }
    
    window.Kakao.API.request({
      url: '/v1/user/unlink',
      success: function(res) {
        console.log('카카오 연결 끊기 성공:', res);
        resolve(true);
      },
      fail: function(error) {
        console.error('카카오 연결 끊기 실패:', error);
        // 실패해도 탈퇴는 진행
        resolve(false);
      }
    });
  });
}

// 로그인 화면 (카카오만)
export function renderLogin(redirectAfter = null) {
  document.querySelector(".progress").textContent = "로그인";
  initKakao();
  
  app.innerHTML = `
    <section class="card">
      <h1 class="title">시작하기</h1>
      <p class="desc">카카오 계정으로 간편하게 시작하세요.<br/>검사 결과 저장과 관리 기능을 이용할 수 있어요.</p>
      
      <button class="kakaoBtn" id="kakaoLoginBtn" style="margin-top:20px;">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#000" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.82 5.3 4.56 6.72l-.96 3.56c-.08.31.24.56.52.4l4.18-2.77c.55.06 1.12.09 1.7.09 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg>
        카카오로 시작하기
      </button>
      
      <div class="authLinks" style="margin-top:20px;">
        <button class="textBtn" id="goHome">나중에 할게요</button>
      </div>
    </section>
  `;
  
  $("#kakaoLoginBtn").onclick = () => {
    playClick();
    doKakaoLogin();
  };
  
  $("#goHome").onclick = () => { playClick(); goHome(); };
}

// 회원가입 화면
// 회원가입 화면 (카카오만 사용하므로 로그인 화면으로 리다이렉트)
export function renderSignup(redirectAfter = null) {
  renderLogin(redirectAfter);
}

// 카카오 로그인 실행
function doKakaoLogin() {
  if (!window.Kakao) {
    showToast('카카오 SDK를 불러오는 중입니다', 'warning');
    return;
  }
  
  window.Kakao.Auth.login({
    success: async function(authObj) {
      // 사용자 정보 요청
      window.Kakao.API.request({
        url: '/v2/user/me',
        success: async function(res) {
          console.log('카카오 사용자 정보:', res);
          const kakaoId = String(res.id);
          const email = res.kakao_account?.email || '';
          const name = res.kakao_account?.profile?.nickname || res.properties?.nickname || '사용자';
          console.log('가져온 이름:', name);
          
          try {
            await kakaoLogin({ kakaoId, email, name });
            
            // 서버에서 오늘/이번 주 상태 동기화
            try {
              const status = await syncTodayStatus();
              saveServerStatus(status);
              console.log('서버 상태 동기화 완료:', status);
            } catch (syncErr) {
              console.error('서버 상태 동기화 실패:', syncErr);
            }
            
            showToast('로그인 성공!', 'success');
            // 프로필 완성 여부 확인
            setTimeout(() => {
              if (needsProfileCompletion()) {
                goCompleteProfile();
              } else {
                goHome();
              }
            }, 500);
          } catch (e) {
            showToast('로그인 실패: ' + e.message, 'error');
          }
        },
        fail: function(error) {
          showToast('사용자 정보를 가져올 수 없어요', 'error');
        }
      });
    },
    fail: function(err) {
      showToast('카카오 로그인 실패', 'error');
    }
  });
}

// 회원가입 유도 팝업 (검사 완료 후)
export function showSignupPrompt() {
  initKakao();
  
  const overlay = document.createElement('div');
  overlay.className = 'modalOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modalIcon"><i class="fa-solid fa-gift"></i></div>
      <h2 class="modalTitle">결과를 저장할까요?</h2>
      <p class="modalDesc">
        카카오로 시작하면 검사 결과를 저장하고<br/>
        14일간 모든 기능을 무료로 이용할 수 있어요.
      </p>
      <button class="kakaoBtn" id="modalKakao">
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#000" d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.82 5.3 4.56 6.72l-.96 3.56c-.08.31.24.56.52.4l4.18-2.77c.55.06 1.12.09 1.7.09 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg>
        카카오로 시작하기
      </button>
      <button class="secondaryBtn" id="modalLater" style="width:100%;margin-top:8px;">
        나중에 할게요
      </button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#modalKakao').onclick = () => {
    playClick();
    document.body.removeChild(overlay);
    doKakaoLogin();
  };
  
  overlay.querySelector('#modalLater').onclick = () => {
    playClick();
    document.body.removeChild(overlay);
  };
}

// 로그인 체크 (관리 기능용)
export async function checkLoginForFeature(featureName, callback) {
  if (isLoggedIn()) {
    try {
      await getMe(); // 세션 유효성 확인
      callback();
    } catch (e) {
      // 세션 만료
      renderLogin();
    }
  } else {
    showToast(`${featureName} 기능은 로그인이 필요해요`, 'error');
    renderLogin();
  }
}

// 현재 로그인 상태 반환 및 API 재export
export { isLoggedIn, logout, getMe };
