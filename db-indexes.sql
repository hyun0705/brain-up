-- Brain-Up DB 인덱스 최적화
-- Cloudflare D1 콘솔에서 실행하세요

-- ========== users 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_kakao_id ON users(kakao_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ========== sessions 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- ========== test_results 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_test_results_user_id ON test_results(user_id);
CREATE INDEX IF NOT EXISTS idx_test_results_test_type ON test_results(test_type);
CREATE INDEX IF NOT EXISTS idx_test_results_created_at ON test_results(created_at);
-- 복합 인덱스: user_id + test_type (자주 같이 사용됨)
CREATE INDEX IF NOT EXISTS idx_test_results_user_type ON test_results(user_id, test_type);
-- 복합 인덱스: user_id + created_at (결과 조회 시)
CREATE INDEX IF NOT EXISTS idx_test_results_user_date ON test_results(user_id, created_at DESC);

-- ========== payments 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
-- 복합 인덱스: user_id + status (구독 확인 시)
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);

-- ========== guardian_shares 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_guardian_shares_user_id ON guardian_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_guardian_shares_token ON guardian_shares(share_token);

-- ========== user_baselines 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_user_baselines_user_id ON user_baselines(user_id);
-- 복합 인덱스: user_id + test_type (기준선 조회 시)
CREATE INDEX IF NOT EXISTS idx_user_baselines_user_type ON user_baselines(user_id, test_type);

-- ========== notices 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_notices_is_active ON notices(is_active);
CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at);

-- ========== inquiries 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at);

-- ========== admin_logs 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);

-- ========== app_settings 테이블 ==========
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
