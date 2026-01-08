// core/guardian.js
// 자녀 공유 링크 관련 로직 (서버 기반)

import { getToken } from './api.js';

const API_URL = 'https://brainup-api.stardog0705.workers.dev';

/**
 * 공유 링크 생성 (서버에 저장)
 */
export async function createGuardianToken() {
  const token = getToken();
  if (!token) {
    throw new Error('로그인이 필요합니다.');
  }
  
  const response = await fetch(`${API_URL}/api/guardian/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || '공유 링크 생성 실패');
  }
  
  return data.shareToken;
}

/**
 * 공유 URL 생성
 */
export async function createGuardianUrl() {
  const shareToken = await createGuardianToken();
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${baseUrl}/guardian.html?token=${shareToken}`;
}
