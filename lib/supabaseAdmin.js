import { createClient } from "@supabase/supabase-js";

// 서버 전용(크론·웹훅·내부 API) — RLS를 우회하는 service_role 키로 만든 클라이언트.
// 이 파일을 import하는 라우트는 반드시 자체 인증(JWT 검증, CRON_SECRET, 웹훅 시크릿 등)을
// 이미 통과한 뒤에만 써야 한다 — RLS가 없는 만큼 그 검증이 유일한 방어선이다.
// 브라우저로는 절대 이 키가 넘어가면 안 되므로 "use client" 컴포넌트에서 import하지 않는다.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 로그인처럼 "멈추면 안 되는" 읽기·검증용 — 서버↔Supabase 연결이 한 번 먹통이 되면 기본 fetch는
// 60초 넘게 기다려서(실사고 2026-11-02: /api/login 62초 → 기기에서 Failed to fetch) 8초에서 끊고
// 새 연결로 1회 재시도한다. 재시도가 중복 쓰기를 만들 수 있어 쓰기가 섞인 라우트엔 쓰지 말 것.
const fetchWithRetry = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const signals = [AbortSignal.timeout(8000), init?.signal].filter(Boolean);
      return await fetch(input, { ...init, signal: AbortSignal.any(signals) });
    } catch (err) {
      if (attempt >= 1) throw err;
    }
  }
};

export const supabaseAdminRetry = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: fetchWithRetry } }
);
