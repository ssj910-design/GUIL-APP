import { createClient } from "@supabase/supabase-js";

// 서버 전용(크론·웹훅·내부 API) — RLS를 우회하는 service_role 키로 만든 클라이언트.
// 이 파일을 import하는 라우트는 반드시 자체 인증(JWT 검증, CRON_SECRET, 웹훅 시크릿 등)을
// 이미 통과한 뒤에만 써야 한다 — RLS가 없는 만큼 그 검증이 유일한 방어선이다.
// 브라우저로는 절대 이 키가 넘어가면 안 되므로 "use client" 컴포넌트에서 import하지 않는다.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
