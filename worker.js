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

    const ADMIN_KEY = env.ADMIN_KEY || 'CHANGE_ME_IN_ENV';
    
    // DB에서 관리자 비밀번호 확인 함수
    async function getAdminPassword(env) {
      try {
        const settings = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind('admin_password').first();
        return settings ? settings.value : ADMIN_KEY;
      } catch {
        return ADMIN_KEY;
      }
    }
    
    // 관리자 인증 확인
    async function verifyAdmin(request, env) {
      const adminKey = request.headers.get('X-Admin-Key');
      const storedPassword = await getAdminPassword(env);
      return adminKey === storedPassword;
    }

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
        const session = await env.DB.prepare('SELECT user_id, expires_at, created_at FROM sessions WHERE token = ?').bind(token).first();
        if (!session || new Date(session.expires_at) < new Date()) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        const user = await env.DB.prepare('SELECT id, email, name, birth_date, gender FROM users WHERE id = ?').bind(session.user_id).first();
        
        // 오늘 첫 접속인 경우에만 세션 시간 갱신 (하루 1회)
        const lastLoginDate = session.created_at ? session.created_at.split('T')[0] : null;
        const todayDate = new Date().toISOString().split('T')[0];
        if (lastLoginDate !== todayDate) {
          await env.DB.prepare('UPDATE sessions SET created_at = datetime("now") WHERE token = ?').bind(token).run();
        }
        
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
        
        // 검사 타입이면 baseline 자동 계산 (training 제외)
        let baseline = null;
        if (testType !== 'training' && summary.raw !== undefined) {
          baseline = await calculateAndSaveBaseline(env, session.user_id, testType);
        }
        
        return Response.json({ success: true, baseline }, { headers: corsHeaders });
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
        const results = await env.DB.prepare('SELECT id, user_id, test_type, summary, created_at FROM test_results WHERE user_id = ? ORDER BY created_at DESC').bind(session.user_id).all();
        // summary를 파싱하고 date 필드 추가
        const parsedResults = results.results.map(r => ({
          id: r.id,
          user_id: r.user_id,
          test_type: r.test_type,
          summary: JSON.parse(r.summary || '{}'),
          date: r.created_at,
          created_at: r.created_at
        }));
        return Response.json({ results: parsedResults }, { headers: corsHeaders });
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
        const todaySignups = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE date(created_at, '+9 hours') = date('now', '+9 hours')").first();
        const totalTests = await env.DB.prepare('SELECT COUNT(*) as count FROM test_results').first();
        const pendingPayments = await env.DB.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'").first();
        const activeSubscriptions = await env.DB.prepare("SELECT COUNT(DISTINCT user_id) as count FROM payments WHERE status = 'confirmed' AND expires_at > datetime('now')").first();
        const monthlySubscriptions = await env.DB.prepare("SELECT COUNT(DISTINCT user_id) as count FROM payments WHERE status = 'confirmed' AND expires_at > datetime('now') AND plan = 'monthly'").first();
        const yearlySubscriptions = await env.DB.prepare("SELECT COUNT(DISTINCT user_id) as count FROM payments WHERE status = 'confirmed' AND expires_at > datetime('now') AND plan = 'yearly'").first();
        return Response.json({
          totalUsers: totalUsers?.count || 0,
          todaySignups: todaySignups?.count || 0,
          totalTests: totalTests?.count || 0,
          pendingPayments: pendingPayments?.count || 0,
          activeSubscriptions: activeSubscriptions?.count || 0,
          monthlySubscriptions: monthlySubscriptions?.count || 0,
          yearlySubscriptions: yearlySubscriptions?.count || 0
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
        const active = await env.DB.prepare("SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE date(created_at, '+9 hours') = date('now', '+9 hours')").first();
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
          WHERE date(s.created_at, '+9 hours') = date('now', '+9 hours')
          ORDER BY s.created_at DESC
        `).all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      if (path === '/api/admin/today-signups' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare("SELECT id, name, email, kakao_id, created_at FROM users WHERE date(created_at, '+9 hours') = date('now', '+9 hours') ORDER BY created_at DESC").all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      // 가입 추이 (7일)
      if (path === '/api/admin/signup-trend' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const trend = await env.DB.prepare(`
          SELECT date(created_at) as date, COUNT(*) as count 
          FROM users 
          WHERE created_at >= date('now', '-7 days')
          GROUP BY date(created_at)
          ORDER BY date ASC
        `).all();
        return Response.json({ trend: trend.results }, { headers: corsHeaders });
      }

      // 가입 기록 전체
      if (path === '/api/admin/all-signups' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const period = url.searchParams.get('period') || '7';
        let query = 'SELECT id, name, email, kakao_id, created_at FROM users';
        if (period === '7') {
          query += " WHERE created_at >= datetime('now', '-7 days')";
        } else if (period === '30') {
          query += " WHERE created_at >= datetime('now', '-30 days')";
        }
        query += ' ORDER BY created_at DESC';
        const users = await env.DB.prepare(query).all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      // 휴면 사용자 (30일 이상 미접속)
      if (path === '/api/admin/dormant-users' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const users = await env.DB.prepare(`
          SELECT u.id, u.name, u.email, u.kakao_id, u.created_at,
            (SELECT MAX(created_at) FROM sessions WHERE user_id = u.id) as last_login
          FROM users u
          WHERE (
            SELECT MAX(created_at) FROM sessions WHERE user_id = u.id
          ) < datetime('now', '-30 days')
          OR NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = u.id)
          ORDER BY last_login ASC
        `).all();
        return Response.json({ users: users.results }, { headers: corsHeaders });
      }

      // 시간대별 이용 현황 (최근 7일, 한국시간 기준)
      if (path === '/api/admin/hourly-usage' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const hourly = await env.DB.prepare(`
          SELECT CAST(strftime('%H', datetime(created_at, '+9 hours')) AS INTEGER) as hour, COUNT(*) as count
          FROM test_results
          WHERE created_at >= datetime('now', '-7 days')
          GROUP BY hour
          ORDER BY hour
        `).all();
        return Response.json({ hourly: hourly.results }, { headers: corsHeaders });
      }

      // 월별 매출 현황
      if (path === '/api/admin/monthly-revenue' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const monthly = await env.DB.prepare(`
          SELECT strftime('%Y-%m', confirmed_at) as month, SUM(amount) as revenue, COUNT(*) as count
          FROM payments
          WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
          GROUP BY month
          ORDER BY month ASC
        `).all();
        return Response.json({ monthly: monthly.results }, { headers: corsHeaders });
      }

      // 곧 만료되는 구독 (7일 이내)
      if (path === '/api/admin/expiring-subscriptions' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const subscriptions = await env.DB.prepare(`
          SELECT p.*, u.name as user_name, u.email as user_email
          FROM payments p
          JOIN users u ON p.user_id = u.id
          WHERE p.status = 'confirmed' 
            AND p.expires_at > datetime('now')
            AND p.expires_at <= datetime('now', '+7 days')
          ORDER BY p.expires_at ASC
        `).all();
        return Response.json({ subscriptions: subscriptions.results }, { headers: corsHeaders });
      }

      // 구독 이탈률 (만료 후 갱신 안 한 사용자)
      if (path === '/api/admin/churn-rate' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        // 만료된 구독 (갱신 안 함)
        const churned = await env.DB.prepare(`
          SELECT p.*, u.name as user_name, u.email as user_email
          FROM payments p
          JOIN users u ON p.user_id = u.id
          WHERE p.status = 'confirmed' 
            AND p.expires_at < datetime('now')
            AND p.user_id NOT IN (
              SELECT user_id FROM payments 
              WHERE status = 'confirmed' AND expires_at > datetime('now')
            )
          ORDER BY p.expires_at DESC
        `).all();
        
        // 전체 구독 이력 있는 사용자 수
        const totalSubscribed = await env.DB.prepare(`
          SELECT COUNT(DISTINCT user_id) as count FROM payments WHERE status = 'confirmed'
        `).first();
        
        const churnRate = totalSubscribed.count > 0 
          ? Math.round((churned.results.length / totalSubscribed.count) * 100) 
          : 0;
        
        return Response.json({ 
          churned: churned.results, 
          churnRate,
          totalSubscribed: totalSubscribed.count
        }, { headers: corsHeaders });
      }

      // 오늘의 검사/관리 현황
      if (path === '/api/admin/today-activity' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        
        // 오늘 검사 수 (타입별)
        const todayTests = await env.DB.prepare(`
          SELECT test_type, COUNT(*) as count 
          FROM test_results 
          WHERE created_at >= datetime('now', '-1 day')
          GROUP BY test_type
        `).all();
        
        // 어제 검사 수 (비교용)
        const yesterdayTests = await env.DB.prepare(`
          SELECT COUNT(*) as count 
          FROM test_results 
          WHERE created_at >= datetime('now', '-2 day') AND created_at < datetime('now', '-1 day')
        `).first();
        
        const tests = { pattern: 0, gonogo: 0, digitspan: 0, spatial: 0, training: 0 };
        for (const t of todayTests.results) {
          tests[t.test_type] = t.count;
        }
        
        const totalTests = tests.pattern + tests.gonogo + tests.digitspan + tests.spatial;
        const totalTraining = tests.training;
        
        return Response.json({
          tests,
          totalTests,
          totalTraining,
          yesterdayTotal: yesterdayTests?.count || 0
        }, { headers: corsHeaders });
      }

      // 최근 활동 피드
      if (path === '/api/admin/recent-activity' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        
        // 최근 검사/관리 (30개)
        const recentTests = await env.DB.prepare(`
          SELECT t.test_type, t.created_at, u.name as user_name, u.id as user_id
          FROM test_results t
          JOIN users u ON t.user_id = u.id
          ORDER BY t.created_at DESC
          LIMIT 30
        `).all();
        
        // 최근 결제 요청 (15개)
        const recentPayments = await env.DB.prepare(`
          SELECT p.plan, p.status, p.created_at, p.confirmed_at, u.name as user_name, u.id as user_id
          FROM payments p
          JOIN users u ON p.user_id = u.id
          ORDER BY p.created_at DESC
          LIMIT 15
        `).all();
        
        // 최근 가입 (15개)
        const recentSignups = await env.DB.prepare(`
          SELECT id as user_id, name as user_name, created_at
          FROM users
          ORDER BY created_at DESC
          LIMIT 15
        `).all();
        
        // 모든 활동 합쳐서 시간순 정렬
        const activities = [
          ...recentTests.results.map(t => ({
            type: t.test_type === 'training' ? 'training' : 'test',
            testType: t.test_type,
            userName: t.user_name,
            userId: t.user_id,
            createdAt: t.created_at
          })),
          ...recentPayments.results.map(p => ({
            type: 'payment',
            status: p.status,
            plan: p.plan,
            userName: p.user_name,
            userId: p.user_id,
            createdAt: p.status === 'confirmed' ? p.confirmed_at : p.created_at
          })),
          ...recentSignups.results.map(s => ({
            type: 'signup',
            userName: s.user_name,
            userId: s.user_id,
            createdAt: s.created_at
          }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
        
        return Response.json({ activities }, { headers: corsHeaders });
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

      // 구독 취소 (관리자)
      if (path === '/api/admin/subscription/cancel' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { userId } = await request.json();
        await env.DB.prepare("UPDATE payments SET status = 'cancelled', expires_at = datetime('now') WHERE user_id = ? AND status = 'confirmed' AND expires_at > datetime('now')").bind(userId).run();
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

      // 앱 버전 조회 (공개 API - 인증 없이)
      if (path === '/api/app-version' && request.method === 'GET') {
        const version = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind('app_version').first();
        const notes = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind('version_notes').first();
        return Response.json({ 
          version: version ? version.value : '1.0.0',
          notes: notes ? notes.value : null
        }, { headers: corsHeaders });
      }

      // 문의 접수 (공개 API)
      if (path === '/api/inquiry' && request.method === 'POST') {
        const { type, content, contact } = await request.json();
        if (!content) {
          return Response.json({ error: '내용을 입력해주세요.' }, { status: 400, headers: corsHeaders });
        }
        await env.DB.prepare('INSERT INTO inquiries (type, content, contact) VALUES (?, ?, ?)').bind(type, content, contact || null).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 관리자: 문의 목록 조회
      if (path === '/api/admin/inquiries' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const filter = url.searchParams.get('filter') || 'pending';
        let sql = 'SELECT * FROM inquiries';
        if (filter === 'pending') sql += " WHERE status = 'pending'";
        else if (filter === 'resolved') sql += " WHERE status = 'resolved'";
        sql += ' ORDER BY created_at DESC';
        const inquiries = await env.DB.prepare(sql).all();
        return Response.json({ inquiries: inquiries.results }, { headers: corsHeaders });
      }

      // 관리자: 문의 상세
      if (path.match(/^\/api\/admin\/inquiry\/\d+$/) && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const id = path.split('/').pop();
        const inquiry = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
        return Response.json({ inquiry }, { headers: corsHeaders });
      }

      // 관리자: 문의 완료 처리
      if (path.match(/^\/api\/admin\/inquiry\/\d+\/resolve$/) && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const id = path.split('/')[4];
        await env.DB.prepare("UPDATE inquiries SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 관리자: 문의 재오픈
      if (path.match(/^\/api\/admin\/inquiry\/\d+\/reopen$/) && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const id = path.split('/')[4];
        await env.DB.prepare("UPDATE inquiries SET status = 'pending', resolved_at = NULL WHERE id = ?").bind(id).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 관리자: 대기 중 문의 수
      if (path === '/api/admin/inquiries/count' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const result = await env.DB.prepare("SELECT COUNT(*) as count FROM inquiries WHERE status = 'pending'").first();
        return Response.json({ count: result.count }, { headers: corsHeaders });
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

      // 관리자 활동 로그 기록
      if (path === '/api/admin/log' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { action, target, details } = await request.json();
        await env.DB.prepare('INSERT INTO admin_logs (action, target, details) VALUES (?, ?, ?)').bind(action, target || null, details || null).run();
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 관리자 활동 로그 조회
      if (path === '/api/admin/logs' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const logs = await env.DB.prepare('SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT 100').all();
        return Response.json({ logs: logs.results }, { headers: corsHeaders });
      }

      // 관리자 비밀번호 변경
      if (path === '/api/admin/change-password' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { currentPassword, newPassword } = await request.json();
        
        // 현재 비밀번호 확인
        const settings = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind('admin_password').first();
        const storedPassword = settings ? settings.value : (env.ADMIN_KEY || 'CHANGE_ME_IN_ENV');
        
        if (currentPassword !== storedPassword) {
          return Response.json({ error: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400, headers: corsHeaders });
        }
        
        // 새 비밀번호 저장
        await env.DB.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))').bind('admin_password', newPassword).run();
        
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // 앱 버전 조회
      if (path === '/api/admin/app-version' && request.method === 'GET') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const version = await env.DB.prepare('SELECT value, updated_at FROM app_settings WHERE key = ?').bind('app_version').first();
        return Response.json({ 
          version: version ? version.value : '1.0.0',
          updated_at: version ? version.updated_at : null
        }, { headers: corsHeaders });
      }

      // 앱 버전 업데이트
      if (path === '/api/admin/app-version' && request.method === 'POST') {
        const adminKey = request.headers.get('X-Admin-Key');
        if (adminKey !== ADMIN_KEY) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }
        const { version, notes } = await request.json();
        await env.DB.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))').bind('app_version', version).run();
        if (notes) {
          await env.DB.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))').bind('version_notes', notes).run();
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // ========== Baseline API ==========

      if (path === '/api/baseline' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        
        const testType = url.searchParams.get('testType');
        if (!testType) {
          return Response.json({ error: 'testType 파라미터가 필요합니다.' }, { status: 400, headers: corsHeaders });
        }
        
        const baseline = await env.DB.prepare('SELECT mean, sd, n, updated_at FROM user_baselines WHERE user_id = ? AND test_type = ?').bind(session.user_id, testType).first();
        
        return Response.json({ baseline: baseline || null }, { headers: corsHeaders });
      }

      if (path === '/api/baseline/all' && request.method === 'GET') {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
          return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders });
        }
        const session = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")').bind(token).first();
        if (!session) {
          return Response.json({ error: '세션이 만료되었습니다.' }, { status: 401, headers: corsHeaders });
        }
        
        const baselines = await env.DB.prepare('SELECT test_type, mean, sd, n, updated_at FROM user_baselines WHERE user_id = ?').bind(session.user_id).all();
        
        // test_type을 키로 하는 객체로 변환
        const baselineMap = {};
        for (const b of baselines.results) {
          baselineMap[b.test_type] = { mean: b.mean, sd: b.sd, n: b.n };
        }
        
        return Response.json({ baselines: baselineMap }, { headers: corsHeaders });
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

// Baseline 계산 및 저장
async function calculateAndSaveBaseline(env, userId, testType) {
  // 해당 사용자의 해당 테스트 결과 조회 (최근 순)
  const results = await env.DB.prepare(
    'SELECT summary FROM test_results WHERE user_id = ? AND test_type = ? ORDER BY created_at ASC'
  ).bind(userId, testType).all();
  
  if (results.results.length < 3) {
    // 3회 미만이면 baseline 없음
    return null;
  }
  
  // 기존 baseline 확인
  const existing = await env.DB.prepare(
    'SELECT mean, sd, n FROM user_baselines WHERE user_id = ? AND test_type = ?'
  ).bind(userId, testType).first();
  
  if (existing) {
    // 이미 baseline이 있으면 반환
    return { mean: existing.mean, sd: existing.sd, n: existing.n };
  }
  
  // 처음 3개 결과로 baseline 계산
  const first3 = results.results.slice(0, 3).map(r => {
    const summary = JSON.parse(r.summary || '{}');
    return summary.raw || 0;
  });
  
  const mean = first3.reduce((a, b) => a + b, 0) / first3.length;
  const variance = first3.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / first3.length;
  const sd = Math.sqrt(variance);
  
  const roundedMean = Number(mean.toFixed(3));
  const roundedSd = Number(sd.toFixed(3));
  
  // baseline 저장
  await env.DB.prepare(
    'INSERT OR REPLACE INTO user_baselines (user_id, test_type, mean, sd, n, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"))'
  ).bind(userId, testType, roundedMean, roundedSd, 3).run();
  
  return { mean: roundedMean, sd: roundedSd, n: 3 };
}
