// core/api.js - API 통신 모듈

const API_URL = 'https://brainup-api.stardog0705.workers.dev';

// 토큰 저장/조회
export function getToken() {
  return localStorage.getItem('brainup_token');
}

export function setToken(token) {
  localStorage.setItem('brainup_token', token);
}

export function removeToken() {
  localStorage.removeItem('brainup_token');
}

// 로그인 상태 확인
export function isLoggedIn() {
  return !!getToken();
}

// API 요청 헬퍼
async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };
  
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || '요청 실패');
  }
  
  return data;
}

// 사용자 정보 로컬 저장
function saveUserToLocal(user) {
  localStorage.setItem('brainup_user_name', user.name || '');
  localStorage.setItem('brainup_user_birthdate', user.birth_date || '');
  localStorage.setItem('brainup_user_gender', user.gender || '');
}

// 회원가입
export async function signup({ email, password, name, birthDate, gender }) {
  const data = await apiRequest('/api/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, birthDate, gender }),
  });
  setToken(data.token);
  saveUserToLocal(data.user);
  return data.user;
}

// 로그인
export async function login({ email, password }) {
  const data = await apiRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  saveUserToLocal(data.user);
  return data.user;
}

// 카카오 로그인
export async function kakaoLogin({ kakaoId, email, name }) {
  const data = await apiRequest('/api/kakao-login', {
    method: 'POST',
    body: JSON.stringify({ kakaoId, email, name }),
  });
  setToken(data.token);
  saveUserToLocal(data.user);
  return data.user;
}

// 로그아웃
export async function logout() {
  try {
    await apiRequest('/api/logout', { method: 'POST' });
  } catch (e) {
    // 무시
  }
  removeToken();
  localStorage.removeItem('brainup_user_name');
  localStorage.removeItem('brainup_user_birthdate');
  localStorage.removeItem('brainup_user_gender');
  // 검사 세션 삭제
  localStorage.removeItem('bc_session_state_v1');
  // 구독 상태 삭제
  localStorage.removeItem('bc_subscription_v1');
}

// 저장된 사용자 이름 가져오기
export function getUserName() {
  return localStorage.getItem('brainup_user_name') || '';
}

// 저장된 생년월일 가져오기
export function getUserBirthDate() {
  return localStorage.getItem('brainup_user_birthdate') || '';
}

// 저장된 성별 가져오기
export function getUserGender() {
  return localStorage.getItem('brainup_user_gender') || '';
}

// 이름 업데이트
export async function updateUserName(name) {
  const data = await apiRequest('/api/update-name', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  localStorage.setItem('brainup_user_name', name);
  return data;
}

// 프로필 업데이트 (이름, 생년월일, 성별)
export async function updateUserProfile({ name, birthDate, gender }) {
  const data = await apiRequest('/api/update-profile', {
    method: 'POST',
    body: JSON.stringify({ name, birthDate, gender }),
  });
  if (name) localStorage.setItem('brainup_user_name', name);
  if (birthDate) localStorage.setItem('brainup_user_birthdate', birthDate);
  if (gender) localStorage.setItem('brainup_user_gender', gender);
  return data;
}

// 내 정보 조회
export async function getMe() {
  const data = await apiRequest('/api/me', { method: 'GET' });
  return data.user;
}

// 결과 저장
export async function saveResults(testType, summary) {
  return apiRequest('/api/results', {
    method: 'POST',
    body: JSON.stringify({ testType, summary }),
  });
}

// 관리(훈련) 결과 저장
export async function saveTrainingResult(summary) {
  return apiRequest('/api/training', {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
}

// 결제 요청 (입금 확인 요청)
export async function requestPayment(plan, amount) {
  return apiRequest('/api/payment/request', {
    method: 'POST',
    body: JSON.stringify({ plan, amount }),
  });
}

// 결제 요청 취소
export async function cancelPayment() {
  return apiRequest('/api/payment/cancel', {
    method: 'POST',
  });
}

// 대기 중인 결제 확인
export async function getPendingPayment() {
  return apiRequest('/api/payment/pending', { method: 'GET' });
}

// 구독 상태 확인
export async function getSubscription() {
  return apiRequest('/api/subscription', { method: 'GET' });
}

// 검사 결과 조회
export async function getResults() {
  const data = await apiRequest('/api/results', { method: 'GET' });
  return data.results;
}

// 공지사항 조회
export async function getNotices() {
  try {
    const response = await fetch(`${API_URL}/api/notices`);
    const data = await response.json();
    return data.notices || [];
  } catch (e) {
    console.error('공지사항 로드 실패:', e);
    return [];
  }
}

// 회원 탈퇴
export async function deleteAccount() {
  const data = await apiRequest('/api/delete-account', {
    method: 'POST',
  });
  removeToken();
  localStorage.removeItem('brainup_user_name');
  localStorage.removeItem('brainup_user_birthdate');
  localStorage.removeItem('brainup_user_gender');
  return data;
}
