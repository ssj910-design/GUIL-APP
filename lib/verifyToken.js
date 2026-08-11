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
