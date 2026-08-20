import { createClient } from "@supabase/supabase-js";

// .env.local 파일에 있는 두 값을 읽어옵니다.
// (이 파일은 Supabase와 대화하는 통로 하나를 만들어두는 것뿐이라,
//  실제 데이터를 읽고 쓰는 코드는 각 화면 컴포넌트에서 이 supabase를
//  import 해서 사용합니다.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 로그인 토큰이 24시간 뒤 만료되면 PostgREST가 401 + "exp" claim 관련 메시지(PGRST303 등)를
// 돌려주는데, 예전엔 이걸 감지하는 곳이 없어 화면마다 알 수 없는 저장 실패 alert만 떴다
// (docs/HANDOFF.md 2026-08-14 기록). 모든 요청이 거치는 fetch를 감싸서 여기 한 곳에서
// 감지하고, 각 앱 셸(ElevatorFieldApp.jsx/AdminApp.jsx)이 등록해둔 로그아웃 콜백을 부른다.
let sessionExpiredHandler = null;
export function onSessionExpired(handler) {
  sessionExpiredHandler = handler;
}
let lastNotifiedAt = 0;
async function authAwareFetch(input, init) {
  const res = await fetch(input, init);
  if (res.status === 401 && sessionExpiredHandler && Date.now() - lastNotifiedAt > 3000) {
    try {
      const body = await res.clone().json();
      const msg = String(body?.message ?? "");
      if (body?.code === "PGRST303" || /exp.*claim|jwt expired/i.test(msg)) {
        lastNotifiedAt = Date.now();
        sessionExpiredHandler();
      }
    } catch { /* JSON이 아니면(다른 401) 무시 */ }
  }
  return res;
}

// 로그인 성공 시 발급받은 토큰을 붙여 재생성한다(RLS가 이 토큰으로 접근을 판단한다).
// `let`로 선언해 재할당해도, 다른 파일의 `import { supabase }`는 ES 모듈 라이브 바인딩
// 덕분에 코드 변경 없이 항상 최신 인스턴스를 참조한다.
export let supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: authAwareFetch } });

const TOKEN_KEY = "guilAuthTokenV1";

// 2026-08-11 실사고 원인 확인: 발급 토큰에 iat 클레임이 있으면(값 무관) 이 프로젝트
// Supabase가 "JWT issued at future"(PGRST303)로 전체 조회를 401 처리했다 — 시계 오차가
// 아니라 iat 자체가 문제였다. /api/login이 이제 iat 없이 서명하도록 고쳐서 헤더 부착을
// 다시 켠다.
export function setAuthToken(token) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: authAwareFetch, headers: { Authorization: `Bearer ${token}` } },
  });
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: authAwareFetch } });
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken() {
  return typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

// ★ write 공용 처리 — RLS가 꺼진 실운영 DB라 컬럼 오타·제약 위반이 조용히 실패하고 화면만 성공으로
// 보이는 사고가 있었다(P1-7). 쓰기는 이걸로 감싸고, false면 낙관적 setState를 건너뛴다.
//   if (!(await writeOk(supabase.from("x").update(p).eq("id", id), "저장 실패"))) return;
export async function writeOk(query, failMsg) {
  const { error } = await query;
  if (error) {
    alert(`${failMsg}\n${error.message ?? ""}`);
    return false;
  }
  return true;
}

// 로그인 실패(verify_login이 빈 결과) 시 보여줄 문구 — 5회 이상 틀려 잠긴 계정도 비번이
// 그냥 틀린 것과 똑같이 빈 결과라, 이 함수로 한 번 더 잠금 여부를 확인해 문구를 구분한다.
export async function loginFailReason(loginId) {
  const { data } = await supabase.rpc("check_login_lock", { p_login_id: (loginId || "").trim() });
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.locked_until) {
    return "5회 이상 잘못 입력하여 계정이 잠겼습니다. 15분 후 다시 시도하시거나, 관리자에게 문의해주세요.";
  }
  return "아이디 또는 비밀번호가 올바르지 않습니다.";
}

// PostgREST 프로젝트 설정의 최대 행수(이 프로젝트는 1000)를 넘는 테이블은 select("*")만으론
// 조용히 잘린다 — self_checks가 실제로 여기 걸렸다(1744행인데 1000행만 옴). 그런 테이블은
// 이걸로 1000행씩 끝까지 나눠 받는다.
export async function fetchAll(table, select = "*") {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows, error: null };
}
