// API 라우트에서 로그인 토큰(Authorization: Bearer ...)을 검증하는 서버 전용 헬퍼.
// /api/login이 발급한 것과 같은 SUPABASE_JWT_SECRET으로 서명을 확인한다.
import jwt from "jsonwebtoken";

export function verifyAuthToken(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret);
    return { profileId: payload.profile_id, appRole: payload.app_role, adminTier: payload.admin_tier ?? null };
  } catch {
    return null;
  }
}

// 라우트 맨 앞에서 쓰는 가드 — 통과하면 null, 아니면 그대로 돌려줄 응답(401/403).
//   const denied = authGuard(request, { adminOnly: true }); if (denied) return denied;
// adminOnly: 관리자(app_role === "admin")만. 자재담당 등 관리자 등급은 모두 app_role이 admin이다.
export function authGuard(request, { adminOnly = false } = {}) {
  const auth = verifyAuthToken(request);
  if (!auth) return Response.json({ ok: false, reason: "unauthorized", error: "unauthorized" }, { status: 401 });
  if (adminOnly && auth.appRole !== "admin") return Response.json({ ok: false, reason: "forbidden", error: "forbidden" }, { status: 403 });
  return null;
}
