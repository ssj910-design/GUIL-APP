// 로그인 — 기존 verify_login DB 함수로 아이디/비번을 그대로 확인하고, 성공하면
// Supabase가 RLS에서 알아볼 수 있는 서명된 JWT를 발급한다. 로그인 화면·과정 자체는
// 안 바뀐다 — 이 라우트가 기존 클라이언트 직접 rpc 호출을 대신할 뿐이다.
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const loginId = (body?.loginId || "").trim();
  const password = body?.password || "";
  if (!loginId || !password) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return Response.json({ ok: false, reason: "서버 설정 오류 — SUPABASE_JWT_SECRET 미설정" }, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const { data, error } = await supabase.rpc("verify_login", { p_login_id: loginId, p_password: password });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  // 비활성·삭제된 계정은 verify_login 통과 후에도 다시 막는다 — 기존 AdminApp.jsx/
  // ElevatorFieldApp.jsx의 세션 재확인 로직과 같은 목적.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,name,role,admin_tier,is_active,deleted_at")
    .eq("id", row.id)
    .single();
  if (!profile || profile.is_active === false || profile.deleted_at) {
    return Response.json({ ok: false, reason: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  // iat(발급시각) 클레임을 아예 안 넣는다 — 이 프로젝트의 Supabase는 값과 무관하게
  // iat이 있기만 하면 "JWT issued at future"(PGRST303)로 거부한다(실사고로 확인,
  // 시계 오차 문제 아님 — iat만 빼면 나머지는 그대로 정상 통과). exp만으로도 만료는
  // 정상 동작한다.
  const token = jwt.sign(
    {
      sub: profile.id,
      role: "authenticated",
      profile_id: profile.id,
      app_role: profile.role,
      admin_tier: profile.admin_tier ?? null,
    },
    secret,
    { expiresIn: "24h", noTimestamp: true }
  );

  return Response.json({
    ok: true,
    token,
    profile: { id: profile.id, name: profile.name, role: profile.role, adminTier: profile.admin_tier, mustChange: row.must_change },
  });
}
