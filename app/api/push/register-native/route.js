// 네이티브(Capacitor/FCM) 푸시 토큰 저장 — app/api/push/subscribe/route.js(웹푸시)의 네이티브 버전.
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function POST(request) {
  const { profileId, token, platform } = await request.json().catch(() => ({}));
  if (!profileId || !token) {
    return Response.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }
  const { error } = await db().from("native_push_tokens").upsert(
    { profile_id: profileId, token, platform: platform || "android" },
    { onConflict: "token" }
  );
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
