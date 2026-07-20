// 푸시 발송 — 알림 종류(key)와 받는 사람을 받아 실제로 보낸다.
//
// 설정 2층을 여기서 확인한다: 회사가 껐으면 아무에게도 안 가고,
// 개인이 껐으면 그 사람만 건너뛴다 (lib/notifications.js의 isEnabled).
// 만료된 구독(404/410)은 지워서 다음부터 헛되이 보내지 않는다.
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { NOTIFICATIONS, isEnabled, levelOf } from "@/lib/notifications";

const CATALOG = Object.fromEntries(NOTIFICATIONS.map((n) => [n.key, n]));

export async function POST(request) {
  const { key, profileIds, title, body, url, tag } = await request.json().catch(() => ({}));
  const item = CATALOG[key];
  if (!item) return Response.json({ ok: false, reason: `알 수 없는 알림 종류: ${key}` }, { status: 400 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return Response.json({ ok: false, reason: "VAPID 키 미설정" }, { status: 200 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const [{ data: settingRows }, { data: profiles }] = await Promise.all([
    db.from("notify_settings").select("*"),
    db.from("profiles").select("id,name,role,notify_prefs").in("id", profileIds ?? []),
  ]);
  const org = {};
  for (const r of settingRows ?? []) org[r.key] = { enabled: r.enabled, level: r.level };

  // 회사 설정에서 꺼둔 알림이면 여기서 끝
  if (org[key]?.enabled === false) return Response.json({ ok: true, sent: 0, skipped: "회사 설정에서 꺼짐" });

  const targets = (profiles ?? []).filter((p) => isEnabled(item, org, p.notify_prefs ?? {}));
  if (!targets.length) return Response.json({ ok: true, sent: 0, skipped: "받을 사람 없음" });

  const { data: subs } = await db.from("push_subscriptions").select("*").in("profile_id", targets.map((p) => p.id));
  if (!subs?.length) return Response.json({ ok: true, sent: 0, skipped: "구독 기기 없음" });

  const payload = JSON.stringify({
    title: title || item.label,
    body: body || "",
    url: url || "/",
    tag: tag || key,
    level: levelOf(item, org),
  });

  let sent = 0;
  const gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);

  return Response.json({ ok: true, sent, removed: gone.length });
}
