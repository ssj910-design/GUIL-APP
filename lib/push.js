// 브라우저 쪽 푸시 구독 관리.
// 서비스워커 등록 → 알림 권한 요청 → 구독 생성 → 서버에 저장.
// 권한을 거부해도 앱은 그대로 동작한다(앱 안 알림은 계속 보인다).
// Capacitor(안드로이드 네이티브 앱)에서는 웹푸시 대신 FCM 토큰으로 등록한다 — enablePush()가 내부에서 분기.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/**
 * 서버에 푸시 발송을 요청한다 — 어느 컴포넌트에서든 부를 수 있는 공용 헬퍼.
 * profileIds를 주면 그 사람들에게, 안 주면 알림 종류(key)의 audience(관리자/기사/전원)로
 * 서버가 대상을 정한다. 알림은 부가 기능이라 실패해도 조용히 넘어간다(앱 흐름을 막지 않는다).
 */
export function notify(key, { profileIds, title, body, url, tag } = {}) {
  if (typeof fetch === "undefined") return;
  // tag를 안 주면 같은 종류(key) 알림끼리 안드로이드에서 같은 알림 한 칸을 공유해 서로 덮어써서,
  // 나중 건은 "갱신"으로 처리돼 소리·진동이 안 울린다 — 호출자가 안 넘기면 매번 고유하게 만든다.
  const uniqueTag = tag ?? `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  fetch("/api/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, profileIds, title, body, url, tag: uniqueTag }),
  }).catch(() => {});
}

export function pushSupported() {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** 현재 상태: unsupported | denied | granted | default */
export function pushPermission() {
  if (!pushSupported()) return "unsupported";
  // 네이티브(Capacitor) WebView에는 브라우저 Notification 객체 자체가 없어서 참조하면 바로 죽는다.
  // 실제 권한 거부 여부는 enablePush() 탭할 때 PushNotifications.requestPermissions()가 비동기로 판단하므로,
  // 여기서는 동기 값이 필요한 이 화면 표시용으로 "granted"(차단 아님)를 기본값으로 돌려준다.
  if (Capacitor.isNativePlatform()) return "granted";
  return Notification.permission;
}

/** 네이티브(Capacitor) 앱에서 FCM 토큰을 받아 서버에 저장한다. enablePush()가 네이티브일 때 이걸 대신 부른다. */
async function enablePushNative(profileId) {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") {
    return { ok: false, reason: "알림 권한이 허용되지 않았습니다" };
  }
  await PushNotifications.register();
  return new Promise((resolve) => {
    PushNotifications.addListener("registration", async (token) => {
      const res = await fetch("/api/push/register-native", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, token: token.value, platform: "android" }),
      });
      resolve(res.ok ? { ok: true } : { ok: false, reason: "구독 저장에 실패했습니다" });
    });
    PushNotifications.addListener("registrationError", () => {
      resolve({ ok: false, reason: "네이티브 알림 등록에 실패했습니다" });
    });
  });
}

/**
 * 알림 켜기 — 권한을 묻고 구독을 만들어 서버에 저장한다.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function enablePush(profileId) {
  if (Capacitor.isNativePlatform()) return enablePushNative(profileId);
  if (!pushSupported()) return { ok: false, reason: "이 브라우저는 알림을 지원하지 않습니다" };
  if (!profileId) return { ok: false, reason: "프로필을 찾을 수 없습니다" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: permission === "denied"
      ? "알림이 차단돼 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요."
      : "알림 권한이 허용되지 않았습니다" };
  }

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, reason: "서버에 알림 키가 설정되지 않았습니다" };

  // 이미 구독이 있으면 재사용한다(브라우저가 같은 값을 돌려준다)
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!res.ok) return { ok: false, reason: "구독 저장에 실패했습니다" };
  return { ok: true };
}

/** 이 기기에서만 알림 끄기 (다른 기기 구독은 남는다) */
export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

/**
 * 이 기기가 구독돼 있는지 — 브라우저와 서버 양쪽이 맞아야 한다.
 *
 * 브라우저에는 구독이 남아 있는데 서버 기록이 없는 상태가 실제로 생긴다
 * (서버 데이터 정리, 구독 만료 삭제 등). 그러면 화면엔 '켜짐'으로 보이지만
 * 서버는 그 기기를 몰라 알림이 오지 않고, 사용자가 고치려고 버튼을 누르면
 * 오히려 해제돼 버린다. 그래서 브라우저 구독이 있으면 서버에 조용히 다시 등록해
 * 스스로 맞춘다(upsert라 여러 번 호출해도 안전하다).
 */
export async function isSubscribed(profileId) {
  if (!pushSupported()) return false;
  // 네이티브는 브라우저 PushManager가 없어 구독 여부를 다른 방식(권한 상태)으로 판단한다.
  if (Capacitor.isNativePlatform()) {
    const perm = await PushNotifications.checkPermissions();
    return perm.receive === "granted";
  }
  if (Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return false;
  if (profileId) {
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    }).catch(() => {});
  }
  return true;
}
