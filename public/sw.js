// 웹 푸시 수신 — 앱이 꺼져 있어도 이 워커가 깨어나 알림을 띄운다.
// 알림을 누르면 관련 화면으로 이동한다(payload.url).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() ?? "" }; }

  const title = data.title || "구일엘리베이터";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,                 // 같은 tag면 알림이 쌓이지 않고 갱신된다
    renotify: data.level === "urgent",
    silent: data.level !== "urgent",   // 긴급만 소리·진동
    requireInteraction: data.level === "urgent",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // 이미 열려 있는 창이 있으면 그 창을 쓴다 (앱을 두 번 띄우지 않게)
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
