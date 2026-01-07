// core/guardian.js
// 자녀 공유 링크 관련 로직

import { getAnonId } from './storage.js';

const GUARDIAN_TOKENS_KEY = 'guardian_tokens_v1';

// 토큰 저장소 로드
function loadGuardianTokens() {
  try {
    return JSON.parse(localStorage.getItem(GUARDIAN_TOKENS_KEY) || '{}');
  } catch {
    return {};
  }
}

// 토큰 저장소 저장
function saveGuardianTokens(tokens) {
  localStorage.setItem(GUARDIAN_TOKENS_KEY, JSON.stringify(tokens));
}

/**
 * 새 공유 토큰 생성
 * - token 생성
 * - guardian_tokens_v1에 anonId 매핑 저장
 * - 생성된 token 반환
 */
export function createGuardianToken() {
  const token = crypto.randomUUID();
  const anonId = getAnonId();
  
  const tokens = loadGuardianTokens();
  tokens[token] = {
    anonId: anonId,
    createdAt: Date.now(),
    isPaid: false
  };
  saveGuardianTokens(tokens);
  
  return token;
}

/**
 * 토큰으로 anonId 조회
 * - token → anonId 매핑 조회
 * - 없으면 null 반환
 */
export function resolveGuardianToken(token) {
  if (!token) return null;
  
  const tokens = loadGuardianTokens();
  const entry = tokens[token];
  
  if (!entry) return null;
  
  return entry.anonId;
}

/**
 * 토큰의 유료 상태 조회
 */
export function isGuardianTokenPaid(token) {
  if (!token) return false;
  
  const tokens = loadGuardianTokens();
  const entry = tokens[token];
  
  return entry?.isPaid || false;
}

/**
 * 토큰에 유료 권한 부여 (결제 완료 시 호출)
 */
export function setGuardianTokenPaid(token, isPaid = true) {
  if (!token) return false;
  
  const tokens = loadGuardianTokens();
  const entry = tokens[token];
  
  if (!entry) return false;
  
  entry.isPaid = isPaid;
  entry.paidAt = isPaid ? Date.now() : null;
  saveGuardianTokens(tokens);
  
  return true;
}

/**
 * 공유 URL 생성
 * - 현재 origin 기준으로 guardian.html?token=xxx 형태 반환
 */
export function createGuardianUrl() {
  const token = createGuardianToken();
  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${baseUrl}/guardian.html?token=${token}`;
}

/**
 * 이 부모의 모든 공유 토큰 조회
 */
export function getMyGuardianTokens() {
  const anonId = getAnonId();
  const tokens = loadGuardianTokens();
  
  return Object.entries(tokens)
    .filter(([_, entry]) => entry.anonId === anonId)
    .map(([token, entry]) => ({
      token,
      createdAt: entry.createdAt,
      isPaid: entry.isPaid || false
    }));
}
