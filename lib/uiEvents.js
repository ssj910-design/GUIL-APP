// 화면 사용 로그 — "어느 화면을 실제로 쓰나"를 모아 UI 정리에 쓴다.
//
// 두 가지 원칙으로 만들었다.
//  1) **개인을 남기지 않는다.** profile_id를 안 보낸다(역할만). UI 개선에 개인 식별은 불필요하고,
//     그건 분석이 아니라 감시다 — 위치 수집을 중단한 것과 같은 기준.
//  2) **앱을 느리게 하지 않는다.** 탭 누를 때마다 서버로 쏘면 낭비라, 메모리에 모아뒀다가
//     30초마다(또는 앱을 덮을 때) 한 번에 보낸다. 실패해도 조용히 버린다 — 로그 때문에
//     화면이 멈추거나 에러가 뜨는 일은 없어야 한다.
import { supabase } from "@/lib/supabaseClient";

let queue = [];
let timer = null;

async function flush() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  try {
    await supabase.from("ui_events").insert(batch);
  } catch {
    /* 로그 유실은 감수 — 재시도하다 화면을 방해하지 않는다 */
  }
}

/** 화면 진입·주요 동작 1건 기록 (screen은 탭 id, action 기본값 'view') */
export function trackEvent(screen, { action = "view", role, meta } = {}) {
  if (typeof window === "undefined" || !screen) return;
  queue.push({ screen, action, role: role ?? null, meta: meta ?? null });

  if (!timer) {
    timer = setInterval(flush, 30000);
    // 앱을 덮거나 백그라운드로 갈 때 남은 것을 흘려보낸다 (모바일은 여기서 대부분 정리된다).
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", flush);
  }
  // 한 번에 너무 쌓이면 바로 보낸다 (오래 켜둔 화면 대비)
  if (queue.length >= 20) flush();
}
