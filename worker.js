function getKoreaDateKey(dateStr) {
  const d = new Date(dateStr);
  const koreaTime = new Date(d.getTime() + (9 * 60 * 60 * 1000));
  return koreaTime.toISOString().split('T')[0];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const ADMIN_KEY = 'brainup2026!';

    try {
      // ========== 인증 API ==========
      
      if (path === '/api/signup' && request.method === 'POST') {
        const { email, password, name, birthDate, gender } = await request.json();
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
        if (existing) {
          return Response.json({ error: '이미 가입된 이메일입니다.' }, { status: 400, headers: corsHeaders });
        }
        const passwordHash = await hashPassword(password);
        await env.DB.prepare('INSERT INTO users (email, password_hash, name, birth_date, gender) VALUES (?, ?, ?, ?, ?)').bind(email, passwordHash, name || null, birthDate || null, gender || null).run();
        const user = await env.DB.prepare('SELECT id, email, name, birth_date, gender FROM users WHERE email = ?').bind(email).first();
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').bind(user.id, token, expiresAt).run();
        return Response.json({ user, token }, { headers: corsHeaders });
      }

      if (path === '/api/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const user = await env.DB.prepare('SELECT id, email, name, birth_date, gender, password_hash FROM users WHERE email = ?').bind(email).first();
        if (!user) {
          return Response.json({ error: '이메일 또는 비밀번호가 틀렸습니다.' }, { status: 401, headers: corsHeaders });
        }
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          return Response.json({ error: '이메일 또는 비밀번호가 틀렸습니다.' }, { status: 401, headers: corsHeaders });
        }
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').bind(user.id, token, expiresAt).run();
        return Response.json({ user: { id: user.id, email: user.email, name: user.name, birth_date: user.birth_date, gender: user.gender }, token }, { headers: corsHeaders });
      }

      if (path === '/api/kakao-login' && request.method === 'POST') {
        const { kakaoId, email, name } = await request.json();
        let user = await env.DB.prepare('SELECT id, email, name, birth_date, gender FROM users WHERE kakao_id = ?').bind(kakaoId).first();
        if (!user) {
          await env.DB.prepare('INSERT INTO users (kakao_id, email, name) VALUES (?, ?, ?)').bind(kakaoId, email || null, name || null).run();
          user = await env.DB.prepare('SELECT id, email, name, birth_date, gender FROM users WHERE kakao_id = ?').bind(kakaoId).first();
        } else {
          await env.DB.prepare('UPDATE users SET name = ? WHERE kakao_id = ?').bind(name || null, kakaoId).run();
          user.name = name;
        }
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').bind(user.id, token, expiresAt).run();
        return Response.json({ user, token }, { headers: corsHeaders });
      }

      if (path === '/api/me' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(token).first();
        if (!session || new Date(session.expires_at) < new Date()) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const user = await env.DB.prepare('SELECT id, email, name, birth_date, gender FROM users WHERE id = ?').bind(session.user_id).first();
        return Response.json({ user }, { headers: corsHeaders });
      }

      if (path === '/api/logout' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (token) {
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/update-name' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const { name } = await request.json();
        await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, session.user_id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/update-profile' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const { name, birthDate, gender } = await request.json();
        const updates = [];
        const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (birthDate !== undefined) { updates.push('birth_date = ?'); values.push(birthDate); }
        if (gender !== undefined) { updates.push('gender = ?'); values.push(gender); }
        if (updates.length > 0) {
          values.push(session.user_id);
          await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ========== 검사/훈련 결과 API ==========

      if (path === '/api/results' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const { testType, summary } = await request.json();
        await env.DB.prepare('INSERT INTO test_results (user_id, test_type, summary) VALUES (?, ?, ?)').bind(session.user_id, testType, JSON.stringify(summary)).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/results' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const results = await env.DB.prepare('SELECT * FROM test_results WHERE user_id = ? ORDER BY created_at DESC').bind(session.user_id).all();
        return Response.json({ results: results.results }, { headers: corsHeaders });
      }

      // ========== 보호자 공유 API ==========
      
      if (path === '/api/guardian/create' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        
        const existing = await env.DB.prepare('SELECT share_token FROM guardian_shares WHERE user_id = ?').bind(session.user_id).first();
        if (existing) {
          return Response.json({ shareToken: existing.share_token }, { headers: corsHeaders });
        }
        
        const shareToken = generateToken();
        await env.DB.prepare('INSERT INTO guardian_shares (user_id, share_token) VALUES (?, ?)').bind(session.user_id, shareToken).run();
        return Response.json({ shareToken }, { headers: corsHeaders });
      }
      
      if (path === '/api/guardian/data' && request.method === 'GET') {
        const shareToken = url.searchParams.get('token');
        if (!shareToken) {
          return Response.json({ error: '토큰이 필요합니다.' }, { status: 400, headers: corsHeaders });
        }
        
        const share = await env.DB.prepare('SELECT user_id FROM guardian_shares WHERE share_token = ?').bind(shareToken).first();
        if (!share) {
          return Response.json({ error: '유효하지 않은 토큰입니다.' }, { status: 404, headers: corsHeaders });
        }
        
        const user = await env.DB.prepare('SELECT name, birth_date, gender, created_at FROM users WHERE id = ?').bind(share.user_id).first();
        
        // 훈련 결과 (test_type = 'training')
        const trainings = await env.DB.prepare("SELECT summary, created_at FROM test_results WHERE user_id = ? AND test_type = 'training' ORDER BY created_at DESC LIMIT 60").bind(share.user_id).all();
        
        // 검사 결과 (training 제외)
        const tests = await env.DB.prepare("SELECT test_type, summary, created_at FROM test_results WHERE user_id = ? AND test_type != 'training' ORDER BY created_at DESC LIMIT 10").bind(share.user_id).all();
        
        // 참여 날짜 계산 (한국 시간 기준)
        const now = new Date();
        const koreaOffset = 9 * 60 * 60 * 1000;
        const nowKorea = new Date(now.getTime() + koreaOffset);
        const todayKorea = nowKorea.toISOString().split('T')[0];
        
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        
        let thisWeekCount = 0;
        let lastWeekCount = 0;
        const participationDates = [];
        
        for (const t of trainings.results) {
          const d = new Date(t.created_at);
          const dateKey = getKoreaDateKey(t.created_at);
          
          if (!participationDates.includes(dateKey)) {
            participationDates.push(dateKey);
          }
          
          if (d >= weekAgo) {
            thisWeekCount++;
          } else if (d >= twoWeeksAgo) {
            lastWeekCount++;
          }
        }
        
        // 연속일 계산 (한국 시간 기준)
        let streak = 0;
        for (let i = 0; i < 100; i++) {
          const checkDate = new Date(nowKorea);
          checkDate.setUTCDate(nowKorea.getUTCDate() - i);
          const checkKey = checkDate.toISOString().split('T')[0];
          
          if (participationDates.includes(checkKey)) {
            streak++;
          } else if (i > 0) {
            break;
          }
        }
        
        // 최장 연속 계산
        let maxStreak = 0;
        let currentStreak = 0;
        const sortedDates = [...participationDates].sort();
        
        for (let i = 0; i < sortedDates.length; i++) {
          if (i === 0) {
            currentStreak = 1;
          } else {
            const prevDate = new Date(sortedDates[i - 1]);
            const currDate = new Date(sortedDates[i]);
            const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              currentStreak++;
            } else {
              currentStreak = 1;
            }
          }
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
          }
        }
        
        return Response.json({
          user: {
            name: user.name || '사용자',
            birthDate: user.birth_date,
            gender: user.gender,
            joinedAt: user.created_at
          },
          trainings: trainings.results.map(t => ({
            summary: JSON.parse(t.summary || '{}'),
            date: t.created_at
          })),
          tests: tests.results.map(t => ({
            testType: t.test_type,
            summary: JSON.parse(t.summary || '{}'),
            date: t.created_at
          })),
          stats: {
            thisWeekCount,
            lastWeekCount,
            streak,
            maxStreak,
            totalTrainings: trainings.results.length
          }
        }, { headers: corsHeaders });
      }

      // ========== 회원 탈퇴 API ==========
      
      if (path === '/api/delete-account' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const userId = session.user_id;
        
        // 모든 관련 데이터 삭제
        await env.DB.prepare('DELETE FROM guardian_shares WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM payments WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM test_results WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ========== 결제 API ==========

      if (path === '/api/payment/request' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const { plan, amount } = await request.json();
        
        // 기존 pending 결제 삭제
        await env.DB.prepare("DELETE FROM payments WHERE user_id = ? AND status = 'pending'").bind(session.user_id).run();
        
        await env.DB.prepare('INSERT INTO payments (user_id, plan, amount, status) VALUES (?, ?, ?, ?)').bind(session.user_id, plan, amount, 'pending').run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/payment/cancel' && request.method === 'POST') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        await env.DB.prepare("DELETE FROM payments WHERE user_id = ? AND status = 'pending'").bind(session.user_id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/payment/pending' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const payment = await env.DB.prepare("SELECT * FROM payments WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").bind(session.user_id).first();
        return Response.json({ payment }, { headers: corsHeaders });
      }

      if (path === '/api/subscription' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const subscription = await env.DB.prepare("SELECT * FROM payments WHERE user_id = ? AND status = 'confirmed' AND expires_at > datetime('now') ORDER BY expires_at DESC LIMIT 1").bind(session.user_id).first();
        return Response.json({ 
          subscribed: !!subscription, 
          subscription: subscription ? {
            plan: subscription.plan,
            expiresAt: subscription.expires_at,
            amount: subscription.amount
          } : null
        }, { headers: corsHeaders });
      }

      // ========== 관리자 API ==========

      if (path === '/api/admin/stats' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const totalUsers = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
        const todaySignups = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')").first();
        const totalTests = await env.DB.prepare('SELECT COUNT(*) as count FROM test_results').first();
        const pendingPayments = await env.DB.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'").first();
        const activeSubscriptions = await env.DB.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'confirmed' AND expires_at > datetime('now')").first();
        return Response.json({
          totalUsers: totalUsers?.count || 0,
          todaySignups: todaySignups?.count || 0,
          totalTests: totalTests?.count || 0,
          pendingPayments: pendingPayments?.count || 0,
          activeSubscriptions: activeSubscriptions?.count || 0
        }, { headers: corsHeaders });
      }

      if (path === '/api/admin/users' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare('SELECT id, name, email, kakao_id, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/users-with-subscription' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare(`
          SELECT 
            u.id, u.name, u.email, u.kakao_id, u.created_at,
            p.status as subscription_status,
            p.plan as subscription_plan,
            p.expires_at as subscription_expires
          FROM users u
          LEFT JOIN (
            SELECT user_id, status, plan, expires_at,
              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY 
                CASE WHEN status = 'confirmed' AND expires_at > datetime('now') THEN 0
                     WHEN status = 'pending' THEN 1
                     ELSE 2 END,
                created_at DESC
              ) as rn
            FROM payments
          ) p ON u.id = p.user_id AND p.rn = 1
          ORDER BY u.created_at DESC 
          LIMIT 100
        `).all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/active-today' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const active = await env.DB.prepare("SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE date(created_at) = date('now')").first();
        return Response.json({ activeToday: active?.count || 0 }, { headers: corsHeaders });
      }

      if (path === '/api/admin/active-today-list' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare(`
          SELECT DISTINCT u.id, u.name, u.email, u.kakao_id, u.created_at 
          FROM users u 
          JOIN sessions s ON u.id = s.user_id 
          WHERE date(s.created_at) = date('now')
          ORDER BY s.created_at DESC
        `).all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/today-signups' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare("SELECT id, name, email, kakao_id, created_at FROM users WHERE date(created_at) = date('now') ORDER BY created_at DESC").all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/all-tests' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const tests = await env.DB.prepare(`
          SELECT t.*, u.name as user_name 
          FROM test_results t 
          JOIN users u ON t.user_id = u.id 
          ORDER BY t.created_at DESC 
          LIMIT 100
        `).all();
        return Response.json({ tests: tests.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/payments' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const payments = await env.DB.prepare(`
          SELECT p.*, u.name as user_name, u.email as user_email
          FROM payments p 
          JOIN users u ON p.user_id = u.id 
          ORDER BY p.created_at DESC 
          LIMIT 100
        `).all();
        return Response.json({ payments: payments.results }, { headers: corsHeaders });
      }

      // 승인 대기 결제 목록
      if (path === '/api/admin/payments/pending' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const payments = await env.DB.prepare(`
          SELECT p.*, u.name as user_name, u.email as user_email
          FROM payments p 
          JOIN users u ON p.user_id = u.id 
          WHERE p.status = 'pending'
          ORDER BY p.created_at ASC
        `).all();
        return Response.json({ payments: payments.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/payment/confirm' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { paymentId } = await request.json();
        const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();
        if (!payment) {
          return Response.json({ error: '결제를 찾을 수 없습니다.' }, { status: 404, headers: corsHeaders });
        }
        const days = payment.plan === 'yearly' ? 365 : 30;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare("UPDATE payments SET status = 'confirmed', confirmed_at = datetime('now'), expires_at = ? WHERE id = ?").bind(expiresAt, paymentId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/admin/payment/reject' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { paymentId } = await request.json();
        await env.DB.prepare("UPDATE payments SET status = 'rejected' WHERE id = ?").bind(paymentId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/admin/user/') && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const userId = path.split('/').pop();
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        const tests = await env.DB.prepare('SELECT * FROM test_results WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
        const sessions = await env.DB.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').bind(userId).all();
        const payments = await env.DB.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
        return Response.json({ user, tests: tests.results, sessions: sessions.results, payments: payments.results }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/admin/user/') && request.method === 'DELETE') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const userId = path.split('/').pop();
        await env.DB.prepare('DELETE FROM guardian_shares WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM payments WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM test_results WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ========== 공지사항 API ==========

      if (path === '/api/notices' && request.method === 'GET') {
        const notices = await env.DB.prepare("SELECT id, title, content, created_at FROM notices WHERE is_active = 1 ORDER BY created_at DESC").all();
        return Response.json({ notices: notices.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/notices' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const notices = await env.DB.prepare('SELECT * FROM notices ORDER BY created_at DESC').all();
        return Response.json({ notices: notices.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/notices' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { title, content } = await request.json();
        await env.DB.prepare('INSERT INTO notices (title, content) VALUES (?, ?)').bind(title, content).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path === '/api/admin/notices' && request.method === 'PUT') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { id, title, content, is_active } = await request.json();
        await env.DB.prepare('UPDATE notices SET title = ?, content = ?, is_active = ? WHERE id = ?').bind(title, content, is_active, id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/admin/notice/') && request.method === 'DELETE') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const noticeId = path.split('/').pop();
        await env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(noticeId).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      return Response.json({ message: 'Brainup API' }, { headers: corsHeaders });

    } catch (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
  }
};

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'brainup_salt_2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
  const newHash = await hashPassword(password);
  return newHash === hash;
}
