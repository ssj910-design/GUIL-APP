// 네이티브(Capacitor/FCM) 푸시 토큰 저장 — app/api/push/subscribe/route.js(웹푸시)의 네이티브 버전.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAuthToken } from "@/lib/verifyToken";

const db = () => supabaseAdmin;

export async function POST(request) {
  const auth = verifyAuthToken(request);
  if (!auth) return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const { profileId, token, platform } = await request.json().catch(() => ({}));
  if (!profileId || !token) {
    return Response.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }
  if (auth.profileId !== profileId && auth.appRole !== "admin") return Response.json({ ok: false, reason: "forbidden" }, { status: 403 });
  const { error } = await db().from("native_push_tokens").upsert(
    { profile_id: profileId, token, platform: platform || "android" },
    { onConflict: "token" }
  );
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
