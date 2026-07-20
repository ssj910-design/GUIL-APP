// 푸시 구독 저장·삭제. 구독은 기기 단위라 한 사람이 여러 행을 가질 수 있다.
import { createClient } from "@supabase/supabase-js";

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function POST(request) {
  const { profileId, subscription, userAgent } = await request.json().catch(() => ({}));
  if (!profileId || !subscription?.endpoint) {
    return Response.json({ ok: false, reason: "잘못된 요청" }, { status: 400 });
  }
  const { error } = await db().from("push_subscriptions").upsert({
    endpoint: subscription.endpoint,
    profile_id: profileId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: userAgent ?? null,
  }, { onConflict: "endpoint" });
  if (error) return Response.json({ ok: false, reason: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const { endpoint } = await request.json().catch(() => ({}));
  if (!endpoint) return Response.json({ ok: false }, { status: 400 });
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint);
  return Response.json({ ok: true });
}
