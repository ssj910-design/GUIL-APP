// 푸시 발송 — 알림 종류(key)와 받는 사람을 받아 실제로 보낸다.
//
// 설정 2층을 여기서 확인한다: 회사가 껐으면 아무에게도 안 가고,
// 개인이 껐으면 그 사람만 건너뛴다 (lib/notifications.js의 isEnabled).
// 만료된 구독(404/410)은 지워서 다음부터 헛되이 보내지 않는다.
import webpush from "web-push";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { NOTIFICATIONS, isEnabled, levelOf } from "@/lib/notifications";

const CATALOG = Object.fromEntries(NOTIFICATIONS.map((n) => [n.key, n]));

function firebaseApp() {
  if (admin.apps.length) return admin.apps[0];
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

export async function POST(request) {
  try {
    return await handlePost(request);
  } catch (e) {
    console.error("push/send 처리 중 예외:", e);
    return Response.json({ ok: false, reason: String(e?.message || e) }, { status: 500 });
  }
}

async function handlePost(request) {
  const { key, profileIds, title, body, url, tag } = await request.json().catch(() => ({}));
  const item = CATALOG[key];
  if (!item) return Response.json({ ok: false, reason: `알 수 없는 알림 종류: ${key}` }, { status: 400 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return Response.json({ ok: false, reason: "VAPID 키 미설정" }, { status: 200 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // 받는 사람 결정: profileIds를 주면 그대로, 안 주면 알림 종류의 audience(admin/engineer/all)로 서버가 정한다.
  // 이러면 관리자 전체·기사 전체·전원 대상 알림은 호출자가 대상 목록을 몰라도 key만으로 보낼 수 있다.
  const hasIds = Array.isArray(profileIds) && profileIds.length > 0;
  let profQ = db.from("profiles").select("id,name,role,notify_prefs,is_active,deleted_at");
  if (hasIds) profQ = profQ.in("id", profileIds);
  else if (item.audience === "admin") profQ = profQ.eq("role", "admin");
  else if (item.audience === "engineer") profQ = profQ.eq("role", "engineer");
  // audience === "all"이면 역할 필터 없이 전원

  const [{ data: settingRows }, { data: profRows }] = await Promise.all([
    db.from("notify_settings").select("*"),
    profQ,
  ]);
  // audience 자동 대상은 비활성·삭제 계정을 뺀다 (명시 id는 호출자가 책임진다)
  const profiles = hasIds ? (profRows ?? []) : (profRows ?? []).filter((p) => p.is_active !== false && !p.deleted_at);
  const org = {};
  for (const r of settingRows ?? []) org[r.key] = { enabled: r.enabled, level: r.level };

  // 회사 설정에서 꺼둔 알림이면 여기서 끝
  if (org[key]?.enabled === false) return Response.json({ ok: true, sent: 0, skipped: "회사 설정에서 꺼짐" });

  const targets = (profiles ?? []).filter((p) => isEnabled(item, org, p.notify_prefs ?? {}));
  if (!targets.length) return Response.json({ ok: true, sent: 0, skipped: "받을 사람 없음" });

  // 웹 구독자(subs)와 네이티브 앱 사용자(native_push_tokens)는 서로 다른 채널이라, 한쪽이
  // 없어도 다른 쪽엔 보내야 한다 — 그래서 "구독 기기 없음" 판정은 두 채널을 다 조회한 뒤로 미룬다.
  const [{ data: subs }, { data: nativeTokens }] = await Promise.all([
    db.from("push_subscriptions").select("*").in("profile_id", targets.map((p) => p.id)),
    db.from("native_push_tokens").select("token").in("profile_id", targets.map((p) => p.id)),
  ]);
  if (!subs?.length && !nativeTokens?.length) {
    return Response.json({ ok: true, sent: 0, skipped: "구독 기기 없음" });
  }

  const payload = JSON.stringify({
    title: title || item.label,
    body: body || "",
    url: url || "/",
    // tag를 안 주면 매번 고유하게 — 같은 종류(key) 알림이 안드로이드에서 서로 덮어써(소리 없이 갱신)
    // 두 번째부터 안 울리는 문제 방지. sendPush()·크론처럼 tag를 안 넘기는 호출까지 서버에서 일괄 커버.
    tag: tag || `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level: levelOf(item, org),
  });

  // urgent 등급은 FCM에도 높은 우선순위로 알려야, 안드로이드가 절전모드(Doze)일 때도
  // 즉시 깨워서 전달한다 — 이게 없으면 잠금화면에서 알림이 늦게(화면 켤 때) 도착할 수 있다.
  const urgency = levelOf(item, org) === "urgent" ? "high" : "normal";

  let sent = 0;
  const gone = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { urgency }
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);

  // 네이티브(Capacitor) 앱 사용자는 web-push 대신 FCM으로 받는다 — 같은 대상(targets)에 병행 발송.
  // firebase-admin 초기화 실패가 web-push 발송까지 통째로 죽이면 안 되므로 이 블록 전체를 격리한다.
  let nativeError = null;
  if (nativeTokens?.length && process.env.FIREBASE_PROJECT_ID) {
    try {
      const app = firebaseApp();
      const goneNative = [];
      await Promise.all(nativeTokens.map(async (t) => {
        try {
          await admin.messaging(app).send({
            token: t.token,
            notification: { title: title || item.label, body: body || "" },
            data: { url: url || "/", tag: tag || key },
            android: { priority: urgency === "high" ? "high" : "normal" },
          });
          sent++;
        } catch (e) {
          if (e.code === "messaging/registration-token-not-registered") goneNative.push(t.token);
          else console.error("FCM 개별 발송 실패:", e.message);
        }
      }));
      if (goneNative.length) await db.from("native_push_tokens").delete().in("token", goneNative);
    } catch (e) {
      console.error("FCM 초기화/발송 실패:", e.message);
      nativeError = e.message;
    }
  }

  return Response.json({ ok: true, sent, removed: gone.length, nativeError });
}
