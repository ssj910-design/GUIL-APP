// /api/* 라우트를 호출할 때 로그인 토큰을 자동으로 붙이는 fetch.
// Supabase 직접 호출(supabase.from(...))은 lib/supabaseClient.js의 setAuthToken()이
// 이미 커버하지만, 우리 자체 API 라우트를 부르는 일반 fetch()는 별개라 각자 붙여야 한다.
import { getAuthToken, clearAuthToken } from "@/lib/supabaseClient";

// 토큰(24시간 만료, app/api/login/route.js)이 있는데도 401이면 만료된 것 — 검사이력 조회 등
// 개별 화면이 "결과 없음"으로 조용히 잘못 보여주는 대신, 세션을 지우고 재로그인을 안내한다.
// 여러 호출이 동시에 만료를 만나도 안내(및 새로고침)는 한 번만.
let expiredHandled = false;

export async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && token && !expiredHandled) {
    expiredHandled = true;
    localStorage.removeItem("guilAuthV1");
    clearAuthToken();
    alert("로그인이 만료됐습니다. 다시 로그인해주세요.");
    window.location.reload();
  }
  return res;
}
