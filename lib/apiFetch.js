// /api/* 라우트를 호출할 때 로그인 토큰을 자동으로 붙이는 fetch.
// Supabase 직접 호출(supabase.from(...))은 lib/supabaseClient.js의 setAuthToken()이
// 이미 커버하지만, 우리 자체 API 라우트를 부르는 일반 fetch()는 별개라 각자 붙여야 한다.
import { getAuthToken } from "@/lib/supabaseClient";

export function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(url, { ...options, headers });
}
