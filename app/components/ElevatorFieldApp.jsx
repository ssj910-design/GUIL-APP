"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Home, AlertTriangle, CalendarCheck, CalendarClock, ShieldCheck, Package, Receipt, ListTodo, MessagesSquare, Settings, Bell, Building2, X, UserRound } from "lucide-react";
import { PullToRefresh } from "@/app/components/PullToRefresh";
import { supabase, writeOk, fetchAll, loginFailReason } from "@/lib/supabaseClient";
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap, mapErrorCode } from "@/lib/mappers";
import { addDays, profileIdByName, unitIdFor, parseErrorCode, formatUnitLabel } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { DutySwapNotice } from "@/app/components/DutyRoster";
import { WorkCalendarSheet } from "@/app/components/WorkCalendarSheet";
import { MyPage } from "@/app/components/MyPage";
import { simulateSms } from "@/lib/sms";
import { notify, enablePush, onPushNotificationOpened, onPushNotificationReceived } from "@/lib/push";
import { Capacitor } from "@capacitor/core";
import { ScreenHeader, BrandSplash } from "@/app/components/ui";
import { ConfirmHost, confirmAsync } from "@/app/components/ConfirmHost";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { LoginScreen } from "@/app/components/LoginScreen";
import { PasswordChangeForm } from "@/app/components/PasswordChangeForm";
import { SiteTab } from "@/app/components/tabs/SiteTab";
import { HomeTab } from "@/app/components/tabs/HomeTab";
import { FailureTab, FailureDetailSheet, DispatchEtaModal, ArrivalResultModal } from "@/app/components/tabs/FailureTab";
import { CheckupTab } from "@/app/components/tabs/CheckupTab";
import { InspectionTab } from "@/app/components/tabs/InspectionTab";
import { MaterialTab } from "@/app/components/tabs/MaterialTab";
import { BillingTab } from "@/app/components/tabs/BillingTab";
import { TodoTab } from "@/app/components/tabs/TodoTab";
import { AdminTab } from "@/app/components/tabs/AdminTab";
import { RoomTab } from "@/app/components/tabs/RoomTab";


const TABS = [
  { id: "home", label: "홈", icon: Home },
  { id: "sites", label: "현장정보", icon: Building2 },
  { id: "failure", label: "고장접수", icon: AlertTriangle },
  { id: "checkup", label: "자체점검", icon: CalendarCheck },
  { id: "inspection", label: "검사관리", icon: ShieldCheck },
  { id: "material", label: "자재·견적", icon: Package },
  { id: "billing", label: "비용청구", icon: Receipt },
  { id: "todo", label: "할일관리", icon: ListTodo },
  { id: "workcalendar", label: "워크캘린더", icon: CalendarClock },
  // 관리자 모드는 하단 탭에서 제외 — 관리자 전용 퀵버튼(게시판 FAB 위)으로만 진입
];


/* ------------------------------------------------------------------ */
/* App shell                                                            */
/* ------------------------------------------------------------------ */

// 앱 구성이 끝날 때까지 로그인 화면을 잠시 꺼두는 스위치입니다.
// 다시 로그인을 켜려면 이 값을 false로 바꾸면 됩니다.
// 로그인 강제 스위치. 기본은 꺼둠(true=로그인 생략)이라 배포본은 지금처럼 열려 있다.
// 로컬에서 3단계(진짜 로그인)를 만들 땐 .env.local에 NEXT_PUBLIC_SKIP_LOGIN=false 를 넣어 켠다.
// 나중에 운영에 실제 반영할 땐 Vercel 환경변수만 false로 바꾸면 된다(코드 분기 없음).
const SKIP_LOGIN = process.env.NEXT_PUBLIC_SKIP_LOGIN !== "false";

const DEV_FAKE_PROFILE = { name: "관리자", role: "admin" };


// SKIP_LOGIN 상태에서 로그인 없이 URL만으로 관리자/기사 화면을 바꿔볼 수 있게 해줍니다.
// 예: ?as=engineer (기본 이름 "신석주"), ?as=engineer&name=김기사, ?as=admin
function getDevProfileOverride() {
  if (typeof window === "undefined") return null;
  // ?as= 역할 전환은 로컬(개발)에서만 허용 — 배포된 도메인에선 URL 파라미터로 역할을 바꿔 들어올 수 없다.
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return null;
  const params = new URLSearchParams(window.location.search);
  const as = params.get("as");
  if (as === "admin") return { name: params.get("name") || "관리자", role: "admin" };
  if (as === "engineer") return { name: params.get("name") || "신석주", role: "engineer" };
  return null;
}


// 알림 드롭다운의 고장/할일/자재지급 항목 한 줄 — 클릭하면 해당 탭으로, ×를 누르면 지운다(dismiss).
function NotifRow({ onClick, onDismiss, title, subtitle }) {
  return (
    <div className="flex items-center border-b border-slate-50 active:bg-slate-50">
      <button onClick={onClick} className="flex-1 min-w-0 text-left px-4 py-2">
        <p className="text-xs font-bold text-slate-700 truncate">{title}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{subtitle}</p>
      </button>
      <button onClick={onDismiss} className="p-2 pr-3 text-slate-300 active:text-slate-500 shrink-0" aria-label="알림 지우기">
        <X size={14} />
      </button>
    </div>
  );
}


export default function App() {
  // undefined = 아직 로그인 여부 확인 중, null = 로그인 안 됨, 객체 = 로그인 됨
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [engineers, setEngineers] = useState([]);
  const engineerNames = engineers.map((e) => e.name);

  // layout.js가 JS 뜨기 전 흰 화면 방지용으로 그려둔 정적 로고 스플래시를, 이 앱이 마운트되는
  // 즉시 치운다 — 아래 BrandSplash 로딩화면들이 같은 로고를 이어서 보여주므로 깜빡임이 없다.
  useEffect(() => { document.getElementById("app-splash")?.remove(); }, []);

  const [tab, setTab] = useState("home");
  const [failureFocusTab, setFailureFocusTab] = useState(null); // 고장접수 탭 진입 시 열 서브탭 (홈 "모두 보기" 등)
  const [sites, setSites] = useState([]);
  const [units, setUnits] = useState([]); // v2: 호기 목록 (마이그레이션 전 DB에서는 빈 배열)
  const [errorCodes, setErrorCodes] = useState([]); // v2: 에러코드집 (마이그레이션 전 DB에서는 빈 배열)
  const [profilesAll, setProfilesAll] = useState([]); // v2: 전 직원 프로필 (이름→id 매핑용)
  const [attendances, setAttendances] = useState([]); // 오늘 출퇴근 기록
  const [dutySchedules, setDutySchedules] = useState([]); // 당직·숙직 근무표 (이번 달 이후)
  const [pendingNight, setPendingNight] = useState(null); // 어제 마감 안 한 숙직(익일 출근 시 자동 마감 / 연차면 홈 버튼으로)
  const [dutySwaps, setDutySwaps] = useState([]);
  const [todayLeaves, setTodayLeaves] = useState([]); // 오늘 휴가 중인 사람 (배정 차단용)
  const [myPageOpen, setMyPageOpen] = useState(false);
  const [siteManagers, setSiteManagers] = useState([]);
  const [failures, setFailures] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [todos, setTodos] = useState([]);
  const [billings, setBillings] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [restockRequests, setRestockRequests] = useState([]);
  const [kitStock, setKitStock] = useState([]);
  const [kitStockReady, setKitStockReady] = useState(false);
  const [selfChecks, setSelfChecks] = useState([]); // 자체점검 출석부(월별, 호기당 1건)
  const [feed, setFeed] = useState([]);
  // is_notice 컬럼은 마이그레이션 022 실행 전엔 존재하지 않는다 — undefined면 아직 미실행으로 간주.
  const feedNoticeReady = feed.some((p) => p.isNotice !== undefined);
  const todoBillingReady = todos.some((t) => t.billingAmount !== undefined);
  // failures.assigned_at 컬럼 존재 여부 — 마이그레이션 074 전엔 컬럼이 없어, 있을 때만 배정 시각을 쓴다(미구현 시 배정이 깨지지 않게).
  const assignedAtReady = failures.some((f) => f.assignedAt !== undefined);
  // 지급 사진을 여러 장 연달아 올릴 때, setState 업데이터 함수가 React 렌더링 타이밍에 따라
  // 아직 반영되지 않은 상태를 기준으로 계산될 수 있어(경쟁 상태) ref에 최신값을 직접 보관합니다.
  const supplyPhotoUrlsRef = useRef({ material: {}, quote: {}, restock: {} });
  // 상비부품 재고도 같은 이유로(한 번의 청구에서 여러 부품을 동시에 차감할 수 있어) ref에
  // 최신 수량을 직접 보관합니다. key: `${engineerId}|${part}`
  const kitStockRef = useRef({});
  // 출동거부는 window.prompt()로 블로킹되는 사이 두 번째 클릭이 큐에 쌓였다가 첫 처리 직후
  // 다시 실행될 수 있어(중복 피드글·중복 푸시), 같은 건은 처리 중엔 다시 안 받게 막는다.
  const refusingFailureIdsRef = useRef(new Set());
  const [failureToast, setFailureToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedReadAt, setFeedReadAt] = useState(null); // 이번 세션에서 게시판을 마지막으로 읽은 시각
  const [notifOpen, setNotifOpen] = useState(false); // 우측상단 알림(종) 드롭다운
  const notifRef = useRef(null);
  const [openFailureId, setOpenFailureId] = useState(null); // 알림에서 특정 고장 건을 눌러 상세를 바로 연다 (탭 이동 없이 현재 화면 위에 띄움)
  const [openTodoId, setOpenTodoId] = useState(null); // 알림에서 특정 할일을 눌러 할일 탭의 인라인 상세(카드 펼침)를 바로 연다
  const [openFeedPostId, setOpenFeedPostId] = useState(null); // 알림/푸시에서 특정 게시글을 눌러 게시판 탭에서 바로 그 글 화면으로 들어간다
  const [pushBanner, setPushBanner] = useState(null); // 네이티브 앱 포그라운드 중 도착한 푸시 — 상단 배너로 직접 보여준다 { title, body, url }
  const [materialFocusId, setMaterialFocusId] = useState(null); // 알림/푸시에서 특정 자재신청을 눌러 관리자 모드 자재출하관리에서 바로 상세를 연다
  const [quoteFocusId, setQuoteFocusId] = useState(null); // 알림/푸시에서 특정 견적신청을 눌러 관리자 모드 견적요청관리에서 바로 상세를 연다
  const [notifDispatchTarget, setNotifDispatchTarget] = useState(null);
  const [notifResultTarget, setNotifResultTarget] = useState(null);

  // SKIP_LOGIN 상태에서도 ?auth=1 이면 실제 로그인 흐름을 강제한다 (인증/회원가입 사전 점검용).
  const [forceAuth, setForceAuth] = useState(false);
  useEffect(() => {
    setForceAuth(new URLSearchParams(window.location.search).has("auth"));
  }, []);
  const skipLogin = SKIP_LOGIN && !forceAuth;

  // 알림 드롭다운 바깥을 누르면 닫는다 — 예전엔 화면 전체를 덮는 배경막을 썼는데,
  // 그 배경막이 뒤쪽 화면의 스크롤 제스처까지 가로막아서 알림이 열려있는 동안
  // 기존 화면을 스크롤할 수 없었다. 배경막 없이 바깥 클릭만 감지하면 뒤쪽 스크롤이 그대로 된다.
  useEffect(() => {
    if (!notifOpen) return;
    const handleOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [notifOpen]);

  // 로그인 세션 — Supabase Auth 대신 자체 로그인(민원24 아이디+비번, verify_login RPC) 결과를
  // localStorage에 담아둔다. 여기서 읽어와 로그인 여부를 판단한다. { id, name, role, mustChange }
  useEffect(() => {
    if (skipLogin) return;
    try {
      const raw = localStorage.getItem("guilAuthV1");
      setSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    }
  }, [skipLogin]);

  // 로그인이 되면 profiles 테이블에서 이 계정의 이름/역할을 가져옵니다.
  useEffect(() => {
    if (skipLogin) {
      setProfile(getDevProfileOverride() ?? DEV_FAKE_PROFILE);
      return;
    }
    if (!session) {
      setProfile(null);
      return;
    }
    // 세션의 프로필이 아직 유효한지(활성·미삭제) DB에서 다시 확인하고 최신 이름/역할을 반영한다.
    // 제외·삭제된 계정이면 세션을 버리고 로그아웃시킨다.
    let alive = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("id,name,role,admin_tier,is_active,deleted_at").eq("id", session.id).single();
      if (!alive) return;
      if (!data || data.is_active === false || data.deleted_at) {
        localStorage.removeItem("guilAuthV1");
        setSession(null);
        setProfile(null);
        return;
      }
      setProfile({ id: data.id, name: data.name, role: data.role, adminTier: data.admin_tier });
    })();
    return () => { alive = false; };
  }, [session, skipLogin]);

  // 자재·견적 신청 푸시알림(url=/?openMaterial=id 또는 ?openQuote=id)을 눌러 앱이 열렸을 때,
  // 관리자 모드 자재출하관리/견적요청관리에서 그 건 상세를 바로 띄운다. 종(🔔) 알림 클릭도 같은
  // materialFocusId/quoteFocusId state를 써서 동일하게 동작한다(그쪽은 URL 없이 바로 state만 설정).
  // 게시판 @멘션·공지 푸시(url=/?openPost=id)도 같은 방식 — 게시판 탭으로 실제 이동해서 그 글 화면을 띄운다.
  function applyOpenParams(params) {
    const openMaterial = params.get("openMaterial");
    const openQuote = params.get("openQuote");
    const openPost = params.get("openPost");
    const openTodo = params.get("openTodo");
    if (!openMaterial && !openQuote && !openPost && !openTodo) return false;
    if (openMaterial || openQuote) setTab("admin");
    if (openMaterial) setMaterialFocusId(openMaterial);
    if (openQuote) setQuoteFocusId(openQuote);
    if (openPost) { setTab("room"); setOpenFeedPostId(openPost); handleDismissNotif("post:" + openPost); }
    if (openTodo) { setTab("todo"); setOpenTodoId(openTodo); handleDismissNotif("todo:" + openTodo); }
    return true;
  }

  // 웹(PWA) — 주소창 쿼리로 들어온 경우(sw.js의 notificationclick이 이 URL로 이동시킴).
  // 앱이 이미 떠 있는 상태에서 알림을 누르면 sw.js가 기존 창을 그대로 재사용(navigate)하므로,
  // 마운트 시점 한 번만 검사해선 못 잡는다 — 창이 다시 포커스/보임 상태가 될 때마다 다시 확인한다.
  useEffect(() => {
    if (!profile) return;
    function checkOpenParams() {
      const url = new URL(window.location.href);
      if (applyOpenParams(url.searchParams)) {
        url.searchParams.delete("openMaterial");
        url.searchParams.delete("openQuote");
        url.searchParams.delete("openPost");
        url.searchParams.delete("openTodo");
        window.history.replaceState({}, "", url);
      }
    }
    checkOpenParams();
    window.addEventListener("focus", checkOpenParams);
    document.addEventListener("visibilitychange", checkOpenParams);
    return () => {
      window.removeEventListener("focus", checkOpenParams);
      document.removeEventListener("visibilitychange", checkOpenParams);
    };
  }, [profile]);

  // 네이티브 앱 — 백그라운드/종료 상태에서 푸시를 탭해 앱이 열린 경우. 주소 이동이 없어 별도로 받는다.
  useEffect(() => {
    return onPushNotificationOpened((urlStr) => {
      try {
        applyOpenParams(new URL(urlStr, window.location.origin).searchParams);
      } catch {}
    });
  }, []);

  // 네이티브 앱 — 화면 켜짐+포그라운드 상태에서 푸시가 도착한 순간. OS가 이 상태에선 알림함에만
  // 조용히 쌓고 배너·소리를 안 띄워주는 게 안드로이드 기본 정책이라(코드로 못 바꿈), 앱이 직접
  // 상단 배너로 대신 알려준다. 탭하면 그 알림의 화면으로 바로 이동.
  useEffect(() => {
    return onPushNotificationReceived((n) => {
      setPushBanner({ title: n.title, body: n.body, url: n.data?.url });
    });
  }, []);

  useEffect(() => {
    if (!pushBanner) return;
    const t = setTimeout(() => setPushBanner(null), 5000);
    return () => clearTimeout(t);
  }, [pushBanner]);

  function openPushBanner() {
    if (pushBanner?.url) {
      try { applyOpenParams(new URL(pushBanner.url, window.location.origin).searchParams); } catch {}
    }
    setPushBanner(null);
  }

  async function handleLogin(loginId, password) {
    setAuthSubmitting(true);
    setAuthError("");
    // 민원24 아이디 + 비번을 DB 함수(verify_login)로 검증한다. 해시는 클라이언트로 안 나온다.
    const { data, error } = await supabase.rpc("verify_login", { p_login_id: (loginId || "").trim(), p_password: password });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      setAuthError(await loginFailReason(loginId));
      setAuthSubmitting(false);
      return;
    }
    const sess = { id: row.id, name: row.name, role: row.role, mustChange: row.must_change };
    localStorage.setItem("guilAuthV1", JSON.stringify(sess));
    setSession(sess);
    setAuthSubmitting(false);
    // 네이티브 앱은 로그인 직후 알림 권한을 바로 물어본다 — 마이페이지까지 찾아가서 직접
    // 켜야 하는 불편을 없앤다. 이미 허용/거부된 상태면 시스템이 조용히 넘어간다.
    if (Capacitor.isNativePlatform()) enablePush(row.id).catch(() => {});
  }

  const adminIds = () => profilesAll.filter((p) => p.role === "admin" && p.is_active !== false).map((p) => p.id);
  const engineerIds = () => profilesAll.filter((p) => p.role === "engineer" && p.is_active !== false).map((p) => p.id);

  // 알림 발송 — 실패해도 앱 동작을 막지 않는다(알림은 부가 기능이라 조용히 넘어간다).
  function sendPush(key, profileIds, { title, body, url } = {}) {
    if (!profileIds?.length) return;
    fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, profileIds, title, body, url }),
    }).catch(() => {});
  }

  // 출퇴근 체크 — 하루 1행(profile_id + work_date). 출근은 insert, 퇴근/당직은 같은 행 update.
  // 출근 시에만 현위치를 1회 받는다 — GPS 상시 추적은 배터리 때문에 못 쓴다.
  // 권한 거부·시간초과여도 출근 체크는 그대로 진행한다(좌표만 비워둔다).
  function getPositionOnce() {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  // 기사의 '마지막 확인 위치'를 갱신한다 (배정 거리 계산의 기준).
  //  - 출근: GPS 좌표 (label='출근')
  //  - 현장 도착·처리완료·점검완료: 그 현장 좌표 (GPS 불필요)
  // profilesAll도 함께 갱신해 배정 시트가 바로 최신 위치를 쓰게 한다.
  async function updateLastLocation(profileId, lat, lng, label) {
    if (!profileId || lat == null || lng == null) return;
    const at = new Date().toISOString();
    const patch = { last_lat: lat, last_lng: lng, last_loc_at: at, last_loc_label: label };
    await supabase.from("profiles").update(patch).eq("id", profileId);
    setProfilesAll((prev) => prev.map((p) => (p.id === profileId ? { ...p, ...patch } : p)));
    setEngineers((prev) => prev.map((e) => (e.id === profileId ? { ...e, ...patch } : e))); // 배정 시트가 쓰는 목록도 갱신
  }

  // 현장 액션(도착·완료)이 일어나면 그 현장 좌표를 나의 마지막 위치로 기록한다.
  function markAtSite(failure, label) {
    const site = sites.find((s) => s.id === failure.siteId);
    const pid = failure.assigneeId ?? profileIdByName(profilesAll, failure.assignee);
    if (site?.lat != null && pid) updateLastLocation(pid, site.lat, site.lng, `${site.name} ${label}`);
  }

  // 어제 마감 안 한 숙직을 마감한다 (익일 출근 시 자동 호출 / 연차·미출근이면 홈 버튼).
  // 밤샘 마감 위치는 의미가 없어 시각·상태만 기록한다.
  async function closeNightDuty() {
    if (!pendingNight) return;
    const now = new Date().toISOString();
    await supabase.from("attendances").update({ checked_out_at: now, status: "숙직" }).eq("id", pendingNight.id);
    setPendingNight(null);
  }

  // 대기 중 기사 위치 자동 갱신 — 출동·도착 같은 업무 이벤트가 없어도 2시간마다 위치를 최신화한다.
  // (사무실·대기소에 가만히 있는 기사도 배정 거리 계산에 최신 위치가 반영되게)
  // ⚠️ 웹은 앱이 열려 있을 때만 위치를 받는다(백그라운드 불가). 앱을 켜두거나 다시 열 때 동작.
  // 위치 공유 ON + 권한 granted + 근무 중(출근O·마감X)인 본인만 대상.
  // PWA를 하루 넘게 열어두면 TODAY_STR(모듈 로드 시 1회 계산)이 어제로 고착돼,
  // 다음날 출근 버튼이 안 뜨거나 어제 날짜 행에 기록되는 문제가 생긴다.
  // KST 날짜가 바뀐 걸 감지하면 리로드해 모듈을 다시 평가한다(현장 업무폰은 앱을 종일 켜둔다).
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const nowStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
      if (nowStr !== TODAY_STR) window.location.reload();
    };
    const t = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);

  // 마감 안 하고 밤샘한 숙직을 잡아둔다. → 익일 출근하면 handleAttendance가 자동 마감,
  // 연차·미출근이면 홈의 '어제 숙직 마감' 버튼으로.
  // "정확히 어제"만 보면, 다음날 아예 로그인을 안 하는 경우(연차·경조사·퇴사 등) 그 미마감
  // 기록을 영영 못 챙긴다 — 오늘 이전 날짜 전체에서 미마감 출근기록을 찾는다.
  useEffect(() => {
    if (!profile || profile.role !== "engineer") { setPendingNight(null); return; }
    const pid = profileIdByName(profilesAll, profile.name);
    if (!pid) return;
    let alive = true;
    (async () => {
      const { data: att } = await supabase.from("attendances").select("*")
        .eq("profile_id", pid).lt("work_date", TODAY_STR)
        .not("checked_in_at", "is", null).is("checked_out_at", null)
        .order("work_date", { ascending: false }).limit(1);
      if (!alive) return;
      if (!att?.length) { setPendingNight(null); return; }
      const { data: duty } = await supabase.from("duty_schedules").select("id")
        .eq("profile_id", pid).eq("duty_date", att[0].work_date).eq("kind", "숙직").limit(1);
      if (alive) setPendingNight(duty?.length ? mapAttendance(att[0]) : null);
    })();
    return () => { alive = false; };
  }, [profile, profilesAll.length]);

  // ⚠️ 최신 profilesAll·attendances는 ref로 읽는다. 의존성 배열에 넣으면,
  // updateLastLocation이 setProfilesAll로 profilesAll을 바꿔 effect를 재실행 → refresh(true) →
  // 또 갱신 → 무한 루프(GPS·DB 쓰기 폭주)가 된다. deps는 profile(로그인)만 둔다.
  const liveRef = useRef({ profilesAll, attendances });
  liveRef.current = { profilesAll, attendances };
  useEffect(() => {
    if (!profile || profile.role !== "engineer") return;
    const pid = profileIdByName(liveRef.current.profilesAll, profile.name);
    if (!pid) return;

    const REFRESH_MS = 2 * 60 * 60 * 1000;
    // force=true: 앱을 새로 열 때(마운트) — 2시간 조건 없이 매번 갱신.
    // force=false: 열어둔 채 대기 중 — 마지막 갱신이 2시간 넘었을 때만.
    // 어느 경우든 위치 공유 ON + '근무 중(출근O·마감X)'일 때만 — 퇴근/미출근·공유OFF면 집 위치가 잡히지 않게.
    // (공유 상태·출근 상태는 매 호출 시 ref로 최신값을 확인해 마이페이지 토글·출퇴근이 바로 반영된다.)
    async function refresh(force) {
      const { profilesAll: pa, attendances: att } = liveRef.current;
      const self = pa.find((p) => p.id === pid);
      if (!self) return;
      const todayAtt = att.find((a) => a.profileId === pid);
      if (!todayAtt?.checkedInAt || todayAtt.checkedOutAt) return;
      if (!force) {
        const lastAt = self.last_loc_at ? new Date(self.last_loc_at).getTime() : 0;
        if (Date.now() - lastAt < REFRESH_MS) return;
      }
      if (navigator.permissions?.query) {
        const perm = await navigator.permissions.query({ name: "geolocation" }).catch(() => null);
        if (perm && perm.state !== "granted") return; // 권한 없으면 조용히 스킵(팝업 안 띄움)
      }
      const here = await getPositionOnce();
      if (here) updateLastLocation(pid, here.lat, here.lng, force ? "앱 실행" : "대기 중 자동");
    }

    refresh(true); // 앱을 열 때마다 갱신 (근무 중이면)
    const timer = setInterval(() => refresh(false), 10 * 60 * 1000); // 대기 중이면 2시간마다
    const onVisible = () => { if (document.visibilityState === "visible") refresh(false); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [profile]);

  // kind: in(출근) | out(퇴근) | duty(당직) | relocate(위치만 다시 받기)
  // 위치는 in·relocate에서만 받는다. 권한 거부·실패면 위치 없이 넘어가되,
  // 반환값 locFailed로 화면이 "위치 다시 받기"를 안내할 수 있게 한다.
  async function handleAttendance(kind) {
    const pid = profileIdByName(profilesAll, profile.name);
    if (!pid) return {};
    // 익일 출근 시, 어제 마감 안 한 숙직을 먼저 자동 마감한다.
    if (kind === "in" && pendingNight) await closeNightDuty();
    const now = new Date().toISOString();
    // 위치 공유를 끈 사람은 위치를 받지 않는다.
    // 출근·위치재시도는 출근 위치(lat/lng)로, 퇴근·당직은 퇴근 위치(out_lat/out_lng)로 저장.
    const isOut = kind === "out" || kind === "duty" || kind === "night";
    const wantLoc = kind === "in" || kind === "relocate" || isOut; // 위치는 항상 사용(권한 필수)
    // 출근 기록 없이 퇴근/당직/숙직 마감이 찍히는 걸 막는다 — 순서가 뒤바뀌면 "퇴근시각이
    // 출근시각보다 이른" 기록이 남는다.
    if (isOut) {
      const todayAtt = attendances.find((a) => a.profileId === pid && a.workDate === TODAY_STR);
      if (!todayAtt?.checkedInAt) { alert("출근 기록이 없어 퇴근 처리를 할 수 없어요."); return { locFailed: false }; }
    }
    const here = wantLoc ? await getPositionOnce() : null;

    // 위치만 다시 받기인데 실패하면 아무것도 저장하지 않는다
    if (kind === "relocate" && !here) return { locFailed: true };

    const outStatus = kind === "duty" ? "당직" : kind === "night" ? "숙직" : "퇴근";
    const patch = kind === "relocate"
      ? { lat: here.lat, lng: here.lng, located_at: now }
      : kind === "in"
      // 퇴근 후 다시 출근(재출근)이면 이전 퇴근 기록을 지워, "퇴근시각이 출근시각보다 이른"
      // 상태로 안 남게 한다.
      ? { checked_in_at: now, status: null, checked_out_at: null, out_lat: null, out_lng: null, ...(here ? { lat: here.lat, lng: here.lng, located_at: now } : {}) }
      : { checked_out_at: now, status: outStatus, ...(here ? { out_lat: here.lat, out_lng: here.lng } : {}) };

    const { data } = await supabase
      .from("attendances")
      .upsert({ profile_id: pid, work_date: TODAY_STR, ...patch }, { onConflict: "profile_id,work_date" })
      .select();
    const row = data?.[0];
    if (row) setAttendances((prev) => [...prev.filter((a) => a.id !== row.id), mapAttendance(row)]);
    // 출근 GPS는 마지막 위치도 갱신(배정 기준). 퇴근 위치는 배정에 안 씀(퇴근하면 배정 대상 아님).
    if (here && (kind === "in" || kind === "relocate")) updateLastLocation(pid, here.lat, here.lng, "출근");
    return { locFailed: wantLoc && !here };
  }

  // ---------- 당직·숙직 근무표 ----------
  async function handleSetDutyPerson(iso, kind, profileId) {
    // 이미 승인된 연차가 있는 날짜로 배정하려는 건지 확인 — 막지는 않고 관리자가 알고 결정하게 경고만 한다.
    if (profileId) {
      const { data: leaveHit } = await supabase.from("leaves").select("kind")
        .eq("profile_id", profileId).eq("status", "승인")
        .lte("start_date", iso).gte("end_date", iso).limit(1);
      if (leaveHit?.length) {
        const engName = profilesAll.find((p) => p.id === profileId)?.name ?? "이 사람";
        if (!(await confirmAsync(`${engName}님은 ${iso}에 ${leaveHit[0].kind}가 있어요.\n그래도 배정할까요?`))) return;
      }
    }
    const { data } = await supabase
      .from("duty_schedules").upsert({ duty_date: iso, kind, profile_id: profileId }, { onConflict: "duty_date,kind" }).select();
    const row = data?.[0];
    if (row) setDutySchedules((prev) => [...prev.filter((p) => p.id !== row.id), mapDutySchedule(row)].sort((a, b) => a.dutyDate.localeCompare(b.dutyDate)));
  }

  // opts.kind: 교환(기본) | 넘기기 | 대신서기
  //  교환   — from(내 근무) ↔ to(상대 근무). 승인자 = to의 주인
  //  넘기기 — from(내 근무)을 opts.toPersonId에게 넘김. 승인자 = 받을 사람
  //  대신서기 — from(남의 근무)을 내가 대신. 승인자 = from의 원주인
  async function handleRequestDutySwap(from, to, opts = {}) {
    const kind = opts.kind ?? "교환";
    const myId = profileIdByName(profilesAll, profile.name);
    const nameOfId = (id) => (engineers.find((e) => e.id === id)?.name ?? "");
    let row, targetId, msg;
    if (kind === "교환") {
      targetId = to.profileId;
      row = { from_schedule_id: from.id, to_schedule_id: to.id, requester_id: from.profileId, target_id: targetId, kind };
      msg = `${profile.name}님이 ${from.dutyDate.slice(5)} ${from.kind} ↔ ${to.dutyDate.slice(5)} ${to.kind} 교환을 요청했습니다`;
    } else if (kind === "넘기기") {
      targetId = opts.toPersonId;
      row = { from_schedule_id: from.id, to_schedule_id: null, requester_id: myId, target_id: targetId, kind };
      msg = `${profile.name}님이 ${from.dutyDate.slice(5)} ${from.kind} 근무를 넘기려 합니다`;
    } else { // 대신서기 — from은 남의 근무
      targetId = from.profileId;
      row = { from_schedule_id: from.id, to_schedule_id: null, requester_id: myId, target_id: targetId, kind };
      msg = `${profile.name}님이 ${from.dutyDate.slice(5)} ${from.kind} 근무를 대신 서겠다고 합니다`;
    }
    const { data } = await supabase.from("duty_swaps").insert(row).select();
    if (data?.[0]) setDutySwaps((prev) => [...prev, mapDutySwap(data[0])]);
    sendPush("duty_swap_request", [targetId], { title: "근무 요청", body: msg });
  }

  // 수락 = 두 칸의 담당자를 맞바꾼다. 같은 달이든 다음 달이든 동일 로직(이월도 이걸로 처리).
  async function handleRespondDutySwap(swap, decision) {
    const myId = profileIdByName(profilesAll, profile.name);
    if (decision !== "수락") {
      // 이 요청의 진짜 당사자(target)만 처리할 수 있게, 그리고 아직 대기중일 때만 반영되게 조건을 건다.
      // 화면에서 버튼을 숨기는 것만으론 처리 함수 자체를 막지 못한다.
      const { data: ok } = await supabase.from("duty_swaps")
        .update({ status: decision, responded_at: new Date().toISOString(), target_seen: true })
        .eq("id", swap.id).eq("status", "대기").eq("target_id", myId)
        .select();
      if (!ok?.length) { alert("이미 처리됐거나 내 요청이 아니에요. 새로고침 후 다시 확인해주세요."); return; }
      setDutySwaps((prev) => prev.map((w) => (w.id === swap.id ? { ...w, status: decision, targetSeen: true } : w)));
      sendPush("duty_swap_result", [swap.requesterId], {
        title: "교환이 거절됐습니다",
        body: `${profile.name}님이 근무 교환 요청을 거절했습니다`,
      });
      return;
    }

    // 수락 — 요청 당시 저장해둔 담당자 정보로 그대로 밀어쓰면, 그 사이 관리자가 재배정했거나
    // 같은 자리를 두고 다른 교환 요청이 있었을 때 최신 배정을 조용히 덮어쓴다. 지금 실제 담당자가
    // 요청 당시와 같은지 먼저 확인하고, 반영도 그 담당자를 조건으로 걸어 확인~반영 사이에
    // 또 바뀌어도 엉뚱한 사람 근무를 옮기지 않게 한다.
    const fromExpectedOwner = swap.kind === "대신서기" ? swap.targetId : swap.requesterId;
    const scheduleIds = [swap.fromScheduleId, ...(swap.kind === "교환" && swap.toScheduleId ? [swap.toScheduleId] : [])];
    const { data: current } = await supabase.from("duty_schedules").select("id, profile_id").in("id", scheduleIds);
    const fromRow = current?.find((d) => d.id === swap.fromScheduleId);
    const toRow = swap.kind === "교환" ? current?.find((d) => d.id === swap.toScheduleId) : null;
    const stale = !fromRow || fromRow.profile_id !== fromExpectedOwner
      || (swap.kind === "교환" && (!toRow || toRow.profile_id !== swap.targetId));
    if (stale) {
      alert("그 사이 근무표가 바뀌어서 이 요청을 반영할 수 없어요. 새로고침 후 다시 확인해주세요.");
      return;
    }

    // 당사자 확인 + 이중 처리 방지 (아직 대기중일 때만 수락 처리)
    const { data: ok } = await supabase.from("duty_swaps")
      .update({ status: "수락", responded_at: new Date().toISOString(), target_seen: true })
      .eq("id", swap.id).eq("status", "대기").eq("target_id", myId)
      .select();
    if (!ok?.length) { alert("이미 처리됐거나 내 요청이 아니에요. 새로고침 후 다시 확인해주세요."); return; }

    // 교환: 두 칸 맞바꿈 / 넘기기: from 주인=넘겨받은 사람(target) / 대신서기: from 주인=요청자(requester)
    if (swap.kind === "교환") {
      // from을 먼저 옮기고 to를 옮긴다 — 둘 다 "요청 당시 담당자일 때만" 조건을 걸어, from만
      // 옮겨지고 to는 실패하는 반쪽짜리 상태가 되면 즉시 되돌린다(그 사이 한쪽이 또 바뀐 경우).
      const { data: fromOk } = await supabase.from("duty_schedules").update({ profile_id: swap.targetId })
        .eq("id", swap.fromScheduleId).eq("profile_id", swap.requesterId).select();
      const { data: toOk } = fromOk?.length
        ? await supabase.from("duty_schedules").update({ profile_id: swap.requesterId })
            .eq("id", swap.toScheduleId).eq("profile_id", swap.targetId).select()
        : { data: null };
      if (!fromOk?.length || !toOk?.length) {
        if (fromOk?.length && !toOk?.length) {
          await supabase.from("duty_schedules").update({ profile_id: swap.requesterId }).eq("id", swap.fromScheduleId);
        }
        alert("근무표 반영에 실패했어요. 관리자에게 확인을 요청해주세요.");
        return;
      }
      setDutySchedules((prev) => prev.map((d) =>
        d.id === swap.fromScheduleId ? { ...d, profileId: swap.targetId }
          : d.id === swap.toScheduleId ? { ...d, profileId: swap.requesterId } : d
      ));
    } else {
      const newOwner = swap.kind === "넘기기" ? swap.targetId : swap.requesterId;
      const { data: moved } = await supabase.from("duty_schedules").update({ profile_id: newOwner })
        .eq("id", swap.fromScheduleId).eq("profile_id", fromExpectedOwner).select();
      if (!moved?.length) { alert("근무표 반영에 실패했어요. 관리자에게 확인을 요청해주세요."); return; }
      setDutySchedules((prev) => prev.map((d) => (d.id === swap.fromScheduleId ? { ...d, profileId: newOwner } : d)));
    }
    setDutySwaps((prev) => prev.map((w) => (w.id === swap.id ? { ...w, status: "수락", targetSeen: true } : w)));
    sendPush("duty_swap_result", [swap.requesterId], {
      title: swap.kind === "교환" ? "교환이 성사됐습니다" : "근무 요청이 수락됐습니다",
      body: `${profile.name}님이 수락했습니다`,
    });
  }

  // 교환 알림 팝업을 확인하면 다시 뜨지 않도록 표시한다 (게시판에는 아무것도 올리지 않는다)
  async function handleSeenDutySwap(swap, as) {
    const myId = profileIdByName(profilesAll, profile.name);
    const expectedId = as === "requester" ? swap.requesterId : swap.targetId;
    if (myId !== expectedId) return; // 당사자가 아니면 무시
    const patch = as === "requester" ? { requester_seen: true } : { target_seen: true };
    await supabase.from("duty_swaps").update(patch).eq("id", swap.id);
    setDutySwaps((prev) => prev.map((w) => (w.id === swap.id
      ? { ...w, ...(as === "requester" ? { requesterSeen: true } : { targetSeen: true }) } : w)));
  }

  function handleLogout() {
    localStorage.removeItem("guilAuthV1");
    setSession(null);
    setProfile(null);
  }

  // 로그인이 완료된 뒤에만 Supabase에서 실제 데이터를 불러옵니다.
  // (예전에는 INITIAL_FAILURES 같은 가짜 배열로 시작했지만, 이제는 DB가 기준입니다)
  // useCallback으로 빼둔 이유: 최초 로드뿐 아니라 당겨서 새로고침(PullToRefresh)에서도 그대로 재사용한다.
  const loadData = useCallback(async () => {
      const [
        sitesRes,
        siteManagersRes,
        failuresRes,
        inspectionsRes,
        materialRes,
        todosRes,
        quoteRes,
        billingsRes,
        restockRes,
        feedRes,
        engineersRes,
        unitsRes,
        errorCodesRes,
        kitStockRes,
        selfChecksRes,
        attendanceRes,
        dutyRes,
        dutySwapRes,
        leaveRes,
      ] = await Promise.all([
        supabase.from("sites").select("*"),
        supabase.from("site_managers").select("*"),
        supabase.from("failures").select("*").order("created_at", { ascending: false }),
        supabase.from("inspections").select("*"),
        supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("todos").select("*").order("created_at", { ascending: false }),
        supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("billings").select("*").order("created_at", { ascending: false }),
        supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("feed_posts").select("*").order("created_at", { ascending: true }), // 카톡식: 오래된 글이 위, 최신이 아래
        supabase.from("profiles").select("*").order("name"),
        supabase.from("units").select("*").order("seq"),
        supabase.from("error_codes").select("*"),
        supabase.from("kit_stock").select("*"),
        fetchAll("self_checks"),
        supabase.from("attendances").select("*").eq("work_date", TODAY_STR),
        supabase.from("duty_schedules").select("*").gte("duty_date", TODAY_STR.slice(0, 8) + "01").order("duty_date"),
        supabase.from("duty_swaps").select("*"),
        supabase.from("leaves").select("*").lte("start_date", TODAY_STR).gte("end_date", TODAY_STR),
      ]);
      setSites((sitesRes.data ?? []).map(mapSite));
      setSiteManagers((siteManagersRes.data ?? []).map(mapSiteManager));
      setFailures((failuresRes.data ?? []).map(mapFailure));
      setInspections((inspectionsRes.data ?? []).map(mapInspection));
      setMaterialRequests((materialRes.data ?? []).map(mapMaterialRequest));
      setTodos((todosRes.data ?? []).map(mapTodo));
      setQuoteRequests((quoteRes.data ?? []).map(mapQuoteRequest));
      setBillings((billingsRes.data ?? []).map(mapBilling));
      setRestockRequests((restockRes.data ?? []).map(mapRestockRequest));
      setFeed((feedRes.data ?? []).map(mapFeedPost));
      const allProfiles = engineersRes.data ?? [];
      setProfilesAll(allProfiles);
      setEngineers(allProfiles.filter((p) => p.role === "engineer" && p.is_active !== false));
      setUnits((unitsRes.data ?? []).map(mapUnit)); // 테이블 없으면(마이그레이션 전) error → 빈 배열
      setErrorCodes((errorCodesRes.data ?? []).map(mapErrorCode)); // 테이블 없으면(마이그레이션 전) error → 빈 배열
      const loadedKitStock = (kitStockRes.data ?? []).map(mapKitStock); // kit_stock 테이블 없으면(마이그레이션 전) error → 빈 배열
      setKitStock(loadedKitStock);
      loadedKitStock.forEach((k) => { kitStockRef.current[`${k.engineerId}|${k.part}`] = k.qty; });
      setKitStockReady(!kitStockRes.error);
      setSelfChecks((selfChecksRes.data ?? []).map(mapSelfCheck));
      setAttendances((attendanceRes.data ?? []).map(mapAttendance)); // 오늘치만 (출퇴근 체크)
      setDutySchedules((dutyRes.data ?? []).map(mapDutySchedule));
      setDutySwaps((dutySwapRes.data ?? []).map(mapDutySwap));
      setTodayLeaves((leaveRes.data ?? []).filter((l) => (l.status ?? "승인") === "승인"));
      setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!skipLogin && !session) return;
    loadData();
  }, [session, skipLogin, loadData]);

  // 새 글·근무 교환 감지 — 30초 폴링 (작은 팀이라 실시간 구독 대신 단순하게)
  // 교환은 상대가 수락하면 근무표 자체가 바뀌므로 duty_schedules도 같이 받는다.
  // 연차도 같이 받는다 — 안 받으면 앱을 오래 켜둔 세션에서 방금 승인된 연차가 고장 배정
  // 화면(todayLeaves 기준 배정 제외)에 계속 반영이 안 된다.
  useEffect(() => {
    if (!skipLogin && !session) return;
    const t = setInterval(async () => {
      const [feedRes, swapRes, dutyRes, leaveRes] = await Promise.all([
        supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
        supabase.from("duty_swaps").select("*"),
        supabase.from("duty_schedules").select("*").gte("duty_date", TODAY_STR.slice(0, 8) + "01").order("duty_date"),
        supabase.from("leaves").select("*").lte("start_date", TODAY_STR).gte("end_date", TODAY_STR),
      ]);
      if (feedRes.data) setFeed(feedRes.data.map(mapFeedPost));
      if (swapRes.data) setDutySwaps(swapRes.data.map(mapDutySwap));
      if (dutyRes.data) setDutySchedules(dutyRes.data.map(mapDutySchedule));
      if (leaveRes.data) setTodayLeaves(leaveRes.data.filter((l) => (l.status ?? "승인") === "승인"));
    }, 30000);
    return () => clearInterval(t);
  }, [session, skipLogin]);

  // 게시판을 보는 순간(보는 동안 새 글이 와도) 읽음 처리
  useEffect(() => {
    if (tab !== "room" || !profile) return;
    const now = new Date().toISOString();
    setFeedReadAt(now);
    const pid = profileIdByName(profilesAll, profile.name);
    // .then()이 있어야 실제 HTTP 요청이 나간다 (supabase-js 빌더는 lazy thenable)
    if (pid) supabase.from("profiles").update({ feed_read_at: now }).eq("id", pid).then(() => {});
  }, [tab, feed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // v2 마이그레이션이 실행된 DB인지 (units 존재 여부로 판단).
  // 마이그레이션 전 DB에 새 컬럼을 보내면 insert 전체가 실패하므로 반드시 이 가드를 통과해야 한다.
  const v2Ready = units.length > 0;

  // ★ 기사·관리자 누구나 현장정보의 "비고(전달사항)"을 수정
  async function handleUpdateSiteNotes(siteId, notes) {
    if (!(await writeOk(supabase.from("sites").update({ notes }).eq("id", siteId), "전달사항 저장 실패"))) return;
    setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, notes } : s)));
  }

  // ★ 기사·관리자 누구나 현장정보의 "출입 정보(비번·열쇠)"를 수정
  async function handleUpdateSiteAccessInfo(siteId, accessInfo) {
    if (!(await writeOk(supabase.from("sites").update({ access_info: accessInfo }).eq("id", siteId), "출입 정보 저장 실패"))) return;
    setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, accessInfo } : s)));
  }

  // ★ 고장 출동 응답/내가 출동하기 → ETA 확정 (홈, 고장접수 탭 공용)
  function notifyFailure(message) {
    setFailureToast(message);
    setTimeout(() => setFailureToast(""), 3000);
  }

  // ★ 관리자가 미배정 고장에 기사 배정 — 출동 시작은 기사가 "출동 응답"으로
  async function handleAssignFailure(failure, engineerName) {
    const assignedId = profileIdByName(profilesAll, engineerName);
    const { data: ok, error } = await supabase.from("failures")
      .update({ assignee: engineerName, ...(v2Ready ? { assignee_id: assignedId } : {}), ...(assignedAtReady ? { assigned_at: new Date().toISOString(), no_response_nag_at: null } : {}) })
      .eq("id", failure.id).eq("status", "미처리").is("assignee", null)
      .select();
    // 0행이 "이미 남이 배정함"인지 "저장 자체가 실패함"인지 구분한다 — 구분 안 하면 진짜 오류를
    // 정상적인 선점 상황으로 오인해서, 아무도 못 배정됐는데 배정된 것처럼 넘어갈 수 있다.
    if (error) { alert(`배정 저장 실패\n${error.message ?? ""}`); return; }
    if (!ok?.length) { notifyFailure("이미 배정되었거나 진행 중인 건이에요"); return; }
    setFailures((prev) => prev.map((x) => (x.id === failure.id ? { ...x, assignee: engineerName, assigneeId: assignedId } : x)));
    sendPush("failure_assigned", [assignedId], {
      title: "고장이 배정되었습니다",
      body: `${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"} — ${parseErrorCode(failure.errorCode).faultType}`,
    });
    notifyFailure(`${engineerName}에게 배정 완료`);
  }

  // ★ 관리자 재배정 — 잘못 배정·중복 출동 정정용. 진행 상태를 미처리로 되돌리고 새 기사(또는 미배정)로
  async function handleReassignFailure(failure, engineerName) {
    const newAssigneeId = engineerName ? profileIdByName(profilesAll, engineerName) : null;
    // 다른 형제 핸들러들과 동일하게, 지금 화면에서 본 배정자가 그대로일 때만 반영되게 조건을 걸어
    // 관리자 두 명이 동시에 재배정해도 한쪽이 조용히 덮어써지지 않게 한다.
    let query = supabase.from("failures")
      .update({
        assignee: engineerName || null,
        dispatched_at: null,
        eta_minutes: null,
        arrival_time: null,
        status: "미처리",
        ...(v2Ready ? { assignee_id: newAssigneeId } : {}),
        // 재배정: 새 기사면 배정시각 갱신(5분 미응답 재판정), 미배정 복귀면 비움. dedup도 리셋해 재알림 허용.
        ...(assignedAtReady ? { assigned_at: engineerName ? new Date().toISOString() : null, no_response_nag_at: null, stale_notified_at: null } : {}),
      })
      .eq("id", failure.id).neq("status", "완료");
    query = failure.assignee ? query.eq("assignee", failure.assignee) : query.is("assignee", null);
    const { data: ok, error } = await query.select();
    if (error) { alert(`재배정 저장 실패\n${error.message ?? ""}`); return; }
    if (!ok?.length) {
      const { data: fresh } = await supabase.from("failures").select("*").eq("id", failure.id).single();
      if (fresh) setFailures((prev) => prev.map((x) => (x.id === failure.id ? mapFailure(fresh) : x)));
      notifyFailure("이미 완료됐거나 다른 곳에서 먼저 바뀐 건이에요 · 목록을 새로고침했습니다");
      return;
    }
    setFailures((prev) => prev.map((x) => (x.id === failure.id
      ? { ...x, assignee: engineerName || null, assigneeId: newAssigneeId, dispatchedAt: null, etaMinutes: null, arrivalTime: null, status: "미처리" }
      : x)));
    // 재배정도 배정만큼 급하다 — 새 기사에겐 배정 알림, 회수당한 이전 기사에겐 회수 알림을 보낸다.
    const where = `${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"} — ${parseErrorCode(failure.errorCode).faultType}`;
    if (newAssigneeId) sendPush("failure_assigned", [newAssigneeId], { title: "고장이 배정되었습니다", body: where });
    if (failure.assigneeId && failure.assigneeId !== newAssigneeId) {
      sendPush("failure_reassigned", [failure.assigneeId], { title: "배정이 회수되었습니다", body: where });
    }
    notifyFailure(engineerName ? `${engineerName}(으)로 재배정 완료` : "미배정으로 되돌림");
  }

  // ★ 출동 거부 — 배정 해제(미배정 환원) + 게시판에 관리자 멘션 알림 (동시 2건 배정 등 못 가는 상황용)
  // 고장 접수 직후 — 관리자에게는 항상, 미배정이면 기사 전원에게(선착순으로 잡으라고)
  function handleFailureReported(created) {
    const first = created[0];
    if (!first) return;
    const where = `${first.siteName} · ${created.map((f) => formatUnitLabel(f.elevatorNo)).filter(Boolean).join(", ") || "호기 미상"}`;
    const what = parseErrorCode(first.errorCode).faultType;
    const more = created.length > 1 ? ` 외 ${created.length - 1}건` : "";

    sendPush("failure_reported", adminIds(), {
      title: `고장 접수 — ${what}`,
      body: `${where}${more}`,
    });
    if (created.some((f) => f.escalation)) {
      sendPush("failure_escalated", adminIds(), { title: "중대 고장 접수", body: `${where} — ${what}` });
    }
    if (!first.assignee) {
      sendPush("failure_unassigned", engineerIds(), {
        title: "미배정 고장 — 먼저 잡는 사람이 담당",
        body: `${where} — ${what}`,
      });
    }
  }

  async function handleRefuseFailure(failure) {
    if (refusingFailureIdsRef.current.has(failure.id)) return; // 처리 중 중복 클릭 무시
    refusingFailureIdsRef.current.add(failure.id);
    try {
      const reason = window.prompt("출동을 거부하고 미배정으로 돌립니다.\n사유를 입력하세요 (선택)");
      if (reason === null) return; // 취소
      // 출동 후 취소도 지원 — 출동 기록을 초기화하고 미처리·미배정으로 되돌린다 (완료 건은 불가)
      const { data: ok, error } = await supabase.from("failures")
        .update({
          assignee: null, dispatched_at: null, eta_minutes: null, arrival_time: null, status: "미처리",
          ...(v2Ready ? { assignee_id: null } : {}),
        })
        .eq("id", failure.id).neq("status", "완료")
        .select();
      if (error) { alert(`출동거부 저장 실패\n${error.message ?? ""}`); return; }
      if (!ok?.length) { notifyFailure("이미 완료 처리된 건이에요"); return; }
      setFailures((prev) => prev.map((x) => (x.id === failure.id
        ? { ...x, assignee: null, dispatchedAt: null, etaMinutes: null, arrivalTime: null, status: "미처리" }
        : x)));
      sendPush("failure_refused", adminIds(), {
        title: "출동 거부됨 — 재배정 필요",
        body: `${profile.name}님이 ${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"} 출동을 거부했습니다${reason.trim() ? ` (${reason.trim()})` : ""}`,
      });
      const admins = profilesAll.filter((p) => p.role === "admin").map((p) => "@" + p.name).join(" ");
      handleSendFeedPost(
        `⚠️ ${profile.name}님이 ${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"} 출동을 거부했습니다${reason.trim() ? ` — 사유: ${reason.trim()}` : ""}. 재배정이 필요합니다 ${admins}`.trim()
      );
      notifyFailure("출동 거부됨 — 미배정으로 이동, 관리자에게 알림");
    } finally {
      refusingFailureIdsRef.current.delete(failure.id);
    }
  }

  async function handleDispatchFailure(failure, etaMinutes) {
    const assignee = failure.assignee || profile.name;
    const dispatchedAt = new Date().toTimeString().slice(0, 5);
    // 선착순 보장 — "아직 미처리이고 배정 상태가 그대로일 때만" 갱신되게 조건을 걸어,
    // 두 기사가 동시에 눌러도 DB가 먼저 도착한 한 명만 받는다 (늦은 쪽은 0행 갱신).
    let claim = supabase
      .from("failures")
      .update({
        assignee,
        dispatched_at: dispatchedAt,
        eta_minutes: etaMinutes,
        status: "진행중",
        ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, assignee) } : {}),
      })
      .eq("id", failure.id)
      .eq("status", "미처리");
    claim = failure.assignee ? claim.eq("assignee", failure.assignee) : claim.is("assignee", null);
    const { data: claimed, error: claimError } = await claim.select();
    // 0행이 "남이 먼저 출동함"인지 "저장 자체가 실패함"인지 구분한다 — 안 그러면 진짜 통신 오류가
    // 났을 때도 "누가 먼저 갔다"고 안내해서, 아무도 출동 안 했는데 기사가 안심하고 안 갈 수 있다.
    if (claimError) { alert(`출동 저장 실패\n${claimError.message ?? ""}`); return; }
    if (!claimed?.length) {
      const { data: fresh } = await supabase.from("failures").select("*").eq("id", failure.id).single();
      if (fresh) setFailures((prev) => prev.map((x) => (x.id === failure.id ? mapFailure(fresh) : x)));
      // 오류가 아니라 정상 안내(선착순) — 브라우저 alert 대신 부드러운 토스트로.
      notifyFailure(`${fresh?.assignee ?? "다른 기사"}님이 먼저 출동했어요 · 목록을 갱신했습니다`);
      return;
    }
    setFailures((prev) =>
      prev.map((x) => (x.id === failure.id ? { ...x, assignee, dispatchedAt, etaMinutes, status: "진행중" } : x))
    );
    // 출동 응답 = "지금 여기서 출발" → 출발 시점 GPS로 마지막 위치 갱신.
    // 출동 처리를 지연시키지 않도록 백그라운드로 받는다(await 안 함).
    const selfPid = profileIdByName(profilesAll, profile.name);
    if (selfPid) {
      getPositionOnce().then((here) => { if (here) updateLastLocation(selfPid, here.lat, here.lng, "출동 출발"); });
    }
    simulateSms(failure.reporterPhone, `구일엘리베이터입니다. 담당 기사가 약 ${etaMinutes}분 후 도착 예정입니다.`);
    notifyFailure(`문자 발송 완료 · ${failure.reporterPhone || "신고자"}에게 도착예정시간 안내`);
  }

  // 도착 = 원터치. 버튼을 누른 그 순간을 도착 시각으로 기록한다.
  // (사람이 갇힌 급한 현장에선 앱에 도착시간을 입력할 여유가 없다 — 일단 도착만 찍고 구조부터, 처리결과는 나중에.)
  async function handleArriveFailure(failure) {
    const arrivalTime = new Date().toTimeString().slice(0, 5); // "HH:MM" — 기존 도착시간 형식과 일치(모달 입력값과 동일)
    // 그 사이 관리자가 재배정/거부해 담당자·상태가 바뀌었으면 덮어쓰지 않는다 — 배정 갱신과 동일하게
    // 조건부 update로 막고, 0행이면 최신 상태로 새로고침한다.
    const { data: ok, error } = await supabase
      .from("failures")
      .update({ arrival_time: arrivalTime })
      .eq("id", failure.id).eq("status", "진행중").eq("assignee", failure.assignee)
      .select();
    if (error) { alert(`도착 기록 저장 실패\n${error.message ?? ""}`); return; }
    if (!ok?.length) {
      const { data: fresh } = await supabase.from("failures").select("*").eq("id", failure.id).single();
      if (fresh) setFailures((prev) => prev.map((x) => (x.id === failure.id ? mapFailure(fresh) : x)));
      notifyFailure("이미 상태가 바뀐 건이에요 · 목록을 새로고침했습니다");
      return;
    }
    setFailures((prev) => prev.map((x) => (x.id === failure.id ? { ...x, arrivalTime } : x)));
    markAtSite(failure, "도착"); // 도착 = 그 현장에 있음 → 마지막 위치 갱신
  }

  async function handleFailureResult(failure, payload) {
    const { result, symptom, cause, processContent, note, photoCount, photoUrls } = payload;
    const errorCode = (payload.errorCode || "").trim();
    const isClosed = result === "처리완료" || result === "오신고";
    // 지원요청·운행정지 = 혼자 못 끝냄 → 미배정(미처리)으로 되돌려 지원 갈 기사가 이어받게 한다.
    // 출동 기록(배정자·출발·ETA·도착)을 초기화하되, escalation은 남겨 위험 상태로 표시한다.
    const isEscalation = result === "지원요청" || result === "운행정지";
    if (result === "처리완료") markAtSite(failure, "처리완료"); // 완료한 그 현장 = 마지막 위치
    const escalation = isClosed ? null : result;
    // 완료 시각도 도착시각과 같은 "HH:MM" 형식으로 남긴다 — 상세 타임라인(도착→완료)에 쓰인다.
    const completeTime = isClosed ? new Date().toTimeString().slice(0, 5) : null;
    // 지원요청·운행정지로 배정을 풀면 assignee가 비어서 "누가 그 판단을 내렸는지"가 사라진다 —
    // 비우기 직전 값을 별도 컬럼에 스냅샷으로 남겨 고장상세 화면에서 보여준다.
    const escalatedBy = isEscalation ? (failure.assignee || null) : null;
    const escalatedById = isEscalation ? (failure.assigneeId ?? profileIdByName(profilesAll, failure.assignee) ?? null) : null;
    const escalatedAt = isEscalation ? new Date().toISOString() : null;
    // arrival_time도 같은 이유로 비우기 직전 값을 스냅샷 — 안 그러면 "실제로 언제 도착했었는지"가 사라진다.
    const escalatedArrivalTime = isEscalation ? (failure.arrivalTime || null) : null;
    const statePatch = isClosed
      ? { status: "완료", complete_time: completeTime }
      : isEscalation
      ? {
          status: "미처리", assignee: null, dispatched_at: null, eta_minutes: null, arrival_time: null,
          escalated_by: escalatedBy, escalated_by_id: escalatedById, escalated_at: escalatedAt,
          escalated_arrival_time: escalatedArrivalTime,
          ...(v2Ready ? { assignee_id: null } : {}),
          // 미배정 복귀 → 배정시각 비우고 dedup 리셋(다시 미배정 15분·재알림 판정되게).
          ...(assignedAtReady ? { assigned_at: null, no_response_nag_at: null, stale_notified_at: null } : {}),
        }
      : { status: failure.status };
    // 처리결과는 유실되면 재작성이 어렵다 — 저장 실패는 물론, 그 사이 재배정/거부로 담당자·상태가
    // 바뀐 경우(동시성 충돌)에도 낙관적 반영을 막는다. 배정 갱신과 동일한 조건부 update 패턴.
    const { data: resultRows, error: resultError } = await supabase
      .from("failures")
      .update({
        ...statePatch,
        process_result: result,
        escalation,
        fault_symptom: symptom || null,
        fault_error_code: errorCode || null,
        fault_cause: cause || null,
        process_content: processContent || null,
        process_note: note || null,
        photo_count: photoCount || 0,
        photo_urls: photoUrls?.length ? photoUrls : null,
      })
      .eq("id", failure.id).eq("status", "진행중").eq("assignee", failure.assignee)
      .select();
    if (resultError) { alert(`처리결과 저장 실패\n${resultError.message ?? ""}`); return; }
    if (!resultRows?.length) {
      const { data: fresh } = await supabase.from("failures").select("*").eq("id", failure.id).single();
      if (fresh) setFailures((prev) => prev.map((x) => (x.id === failure.id ? mapFailure(fresh) : x)));
      notifyFailure("다른 곳에서 이미 처리된 건이에요 · 목록을 새로고침했습니다");
      return;
    }
    setFailures((prev) =>
      prev.map((x) =>
        x.id === failure.id
          ? {
              ...x,
              status: isClosed ? "완료" : isEscalation ? "미처리" : x.status,
              ...(isClosed ? { completeTime } : {}),
              ...(isEscalation ? { assignee: null, assigneeId: null, dispatchedAt: null, etaMinutes: null, arrivalTime: null, escalatedBy, escalatedById, escalatedAt, escalatedArrivalTime } : {}),
              processResult: result,
              escalation,
              faultSymptom: symptom || null,
              faultErrorCode: errorCode || null,
              faultCause: cause || null,
              processContent: processContent || null,
              processNote: note || null,
              photoCount: photoCount || 0,
              photoUrls: photoUrls ?? [],
            }
          : x
      )
    );
    // 지원요청·운행정지로 미배정 풀에 되돌린 건은 접수 때와 마찬가지로 기사 전원에게 알린다.
    // 이게 없으면 지원이 필요한 건이 미배정으로 돌아가도 아무도 모른다. (P2-7)
    if (isEscalation) {
      const unit = formatUnitLabel(failure.elevatorNo);
      sendPush("failure_unassigned", engineerIds(), {
        title: `${result} — 지원 필요 (미배정 복귀)`,
        body: `${failure.siteName}${unit ? ` ${unit}` : ""}`,
      });
    }
  }

  async function handleSubmitBilling({ type, siteName, elevatorNo, part, cost, replaceDate, contactPhone, beforePhotoUrls, afterPhotoUrls, confirmPhotoUrl, siteId, unitId, materialRequestId }) {
    // 같은 자재신청 건에 이미 청구기록이 있으면 막는다 — 할 일 완료 처리가 실패해 재시도하는
    // 과정에서 청구 자체는 또 저장돼버리는(중복청구) 경로를 막기 위함.
    if (materialRequestId) {
      const { data: already } = await supabase.from("billings").select("id").eq("material_request_id", materialRequestId).limit(1);
      if (already?.length) {
        alert("이 신청은 이미 비용청구가 접수됐어요. 화면을 새로고침해주세요.");
        return false;
      }
    }
    // v2: 호기 확정 — 직접 전달받거나(자재건), siteId 또는 유일한 현장명으로 찾는다
    const billSite = siteId
      ? sites.find((x) => x.id === siteId)
      : sites.filter((x) => x.name === siteName).length === 1
        ? sites.find((x) => x.name === siteName)
        : null;
    const billUnitId = unitId ?? (billSite ? unitIdFor(units, billSite.id, elevatorNo) : null);
    const newBilling = {
      // 다중 호기 청구는 같은 ms에 여러 건 생성되어 Date.now() PK가 충돌·조용히 실패했다 → 호기별 고유 id (P1-1)
      id: "bill-" + crypto.randomUUID(),
      type,
      siteName,
      elevatorNo: elevatorNo || null,
      part,
      cost,
      replaceDate,
      contactPhone,
      engineer: profile.name,
      submittedAt: TODAY_STR,
      beforePhotoUrls: beforePhotoUrls?.length ? beforePhotoUrls : [],
      afterPhotoUrls: afterPhotoUrls?.length ? afterPhotoUrls : [],
      confirmPhotoUrl: confirmPhotoUrl || null,
    };
    const { error } = await supabase.from("billings").insert({
      id: newBilling.id,
      type: newBilling.type,
      site_name: newBilling.siteName,
      elevator_no: newBilling.elevatorNo,
      part: newBilling.part,
      cost: newBilling.cost || null,
      replace_date: newBilling.replaceDate,
      contact_phone: newBilling.contactPhone,
      engineer: newBilling.engineer,
      submitted_at: newBilling.submittedAt,
      before_photo_urls: newBilling.beforePhotoUrls.length ? newBilling.beforePhotoUrls : null,
      after_photo_urls: newBilling.afterPhotoUrls.length ? newBilling.afterPhotoUrls : null,
      confirm_photo_url: newBilling.confirmPhotoUrl,
      ...(v2Ready ? {
        unit_id: billUnitId,
        engineer_id: profileIdByName(profilesAll, profile.name),
        material_request_id: materialRequestId ?? null,
      } : {}),
    });
    // ★ 실패 시 유령 청구(낙관적 표시 후 새로고침에 사라짐)를 막고 호출부에 성공여부를 알린다 (P1-1/P1-2)
    if (error) {
      alert("비용청구 저장에 실패했습니다. 네트워크 상태를 확인하고 다시 시도해주세요.");
      return false;
    }
    setBillings((prev) => [newBilling, ...prev]);
    return true;
  }

  // ★ 게시판 피드에 새 글 등록 (extra: photoUrls 첨부, replyToId 답장)
  async function handleSendFeedPost(text, extra = {}) {
    const newPost = {
      id: "p" + Date.now(),
      author: profile.name,
      time: new Date().toTimeString().slice(0, 5),
      createdAt: new Date().toISOString(),
      text,
      photoUrls: extra.photoUrls ?? [],
      replyToId: extra.replyToId ?? null,
      reactions: {},
      isNotice: extra.isNotice ?? false,
    };
    const posted = await writeOk(supabase.from("feed_posts").insert({
      id: newPost.id,
      author: newPost.author,
      body: newPost.text,
      photo_urls: newPost.photoUrls.length ? newPost.photoUrls : null,
      reply_to_id: newPost.replyToId,
      ...(v2Ready ? { author_id: profileIdByName(profilesAll, newPost.author) } : {}),
      ...(feedNoticeReady ? { is_notice: newPost.isNotice } : {}),
    }), "글 등록 실패 — 다시 시도해주세요");
    if (!posted) return false; // 글이 조용히 사라지지 않도록 (P1-7)
    setFeed((prev) => [...prev, newPost]);
    // 게시판 알림 — @멘션 대상에겐 멘션 알림, 공지글이면 전원에게 공지 알림 (본인은 제외).
    const myId = profileIdByName(profilesAll, profile.name);
    const tags = [...text.matchAll(/@([가-힣a-zA-Z0-9()]+)/g)].map((m) => m[1]);
    const mentionIds = tags.includes("모두")
      ? profilesAll.filter((p) => p.is_active !== false && p.id !== myId).map((p) => p.id)
      : profilesAll.filter((p) => tags.includes(p.name) && p.id !== myId).map((p) => p.id);
    if (mentionIds.length) sendPush("room_mention", mentionIds, { title: `${profile.name}님이 회원님을 언급했어요`, body: text.slice(0, 60), url: `/?openPost=${newPost.id}` });
    if (newPost.isNotice) notify("room_notice", { title: "새 공지가 등록됐어요", body: text.slice(0, 60), url: `/?openPost=${newPost.id}` });
    // 댓글이면(replyToId 있음) 원글 작성자에게 알림 — 멘션 대상엔 이미 위에서 갔으니 중복은 허용(드묾).
    if (newPost.replyToId) {
      const parentPost = feed.find((p) => p.id === newPost.replyToId);
      const authorId = parentPost?.authorId ?? profileIdByName(profilesAll, parentPost?.author);
      if (authorId && authorId !== myId) sendPush("room_comment", [authorId], {
        title: `${profile.name}님이 내 글에 댓글을 남겼어요`,
        body: text.slice(0, 60),
        url: `/?openPost=${newPost.replyToId}`,
      });
    }
    return true;
  }

  // ★ 게시판 좋아요 토글
  // ponytail: 마지막 쓰기 승리 — 두 명이 동시에 누르면 한쪽이 덮일 수 있음(소규모 팀 허용), 문제되면 RPC로
  async function handleToggleLike(postId) {
    const me = profile.name;
    const post = feed.find((p) => p.id === postId);
    if (!post) return;
    const cur = post.reactions?.["👍"] ?? [];
    const next = cur.includes(me) ? cur.filter((n) => n !== me) : [...cur, me];
    const reactions = { ...(post.reactions ?? {}), "👍": next };
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, reactions } : p)));
    await supabase.from("feed_posts").update({ reactions }).eq("id", postId);
  }

  // ★ 게시판 글 수정 (본인 글만 — RoomTab에서 작성자 확인 후 호출)
  async function handleUpdateFeedPost(postId, text) {
    const prevText = feed.find((p) => p.id === postId)?.text;
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, text } : p)));
    // 실패하면 화면만 바뀐 채 남지 않도록 원래 글로 되돌린다 (P1-7)
    if (!(await writeOk(supabase.from("feed_posts").update({ body: text }).eq("id", postId), "글 수정 저장 실패"))) {
      setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, text: prevText } : p)));
    }
  }

  // ★ 게시판 글 삭제 — 그 글의 댓글도 함께 삭제
  async function handleDeleteFeedPost(postId) {
    setFeed((prev) => prev.filter((p) => p.id !== postId && p.replyToId !== postId));
    await supabase.from("feed_posts").delete().eq("reply_to_id", postId);
    await supabase.from("feed_posts").delete().eq("id", postId);
  }

  // ★ 게시판 공지 등록/해제 — is_notice 컬럼 없으면(마이그레이션 전) 조용히 건너뜀
  async function handleSetFeedNotice(postId, isNotice) {
    if (!feedNoticeReady) return;
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, isNotice } : p)));
    await supabase.from("feed_posts").update({ is_notice: isNotice }).eq("id", postId);
    if (isNotice) {
      const post = feed.find((p) => p.id === postId);
      notify("room_notice", { title: "새 공지가 등록됐어요", body: (post?.text ?? "").slice(0, 60) });
    }
  }

  // ★ 자재 신청 등록 — 탭에서 폼만 만들고 실제 DB 쓰기·에러체크는 여기서 한다(다른 handleXxx와 동일 패턴).
  // 중복 신청 경고(같은 현장 승인대기건 존재 여부) 판단은 MaterialTab에서 미리 하고, 여기는 쓰기만 담당.
  async function handleAddMaterialRequest(newRequests, dbRows) {
    if (!(await writeOk(supabase.from("material_requests").insert(dbRows), "자재 신청 실패"))) return false;
    setMaterialRequests((prev) => [...newRequests, ...prev]);
    notify("material_requested", { title: "자재 신청이 들어왔어요", body: `${newRequests[0]?.engineer ?? ""} · ${newRequests[0]?.siteName ?? ""} ${newRequests.length}건`, url: `/?openMaterial=${newRequests[0]?.id}` });
    return true;
  }

  // ★ 견적 신청 등록 — handleAddMaterialRequest와 동일한 이유로 App 셸로 옮김.
  async function handleAddQuoteRequest(newQuotes, dbRows) {
    if (!(await writeOk(supabase.from("quote_requests").insert(dbRows), "견적 요청 실패"))) return false;
    setQuoteRequests((prev) => [...newQuotes, ...prev]);
    notify("quote_requested", { title: "견적 신청이 들어왔어요", body: `${newQuotes[0]?.engineer ?? ""} · ${newQuotes[0]?.siteName ?? ""} ${newQuotes.length}건`, url: `/?openQuote=${newQuotes[0]?.id}` });
    return true;
  }

  // ★ 자재 신청 취소 — 아직 관리자가 처리 전(승인대기)일 때만. eq("status", "승인대기")를 조건에
  // 같이 걸어서, 그 사이 관리자가 이미 지급완료 등으로 바꿨으면(동시성) 0행 적용되고 실패로 안내한다.
  async function handleCancelMaterialRequest(requestId) {
    const target = materialRequests.find((r) => r.id === requestId);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from("material_requests")
      .update({ status: "취소", cancelled_at: nowIso, cancelled_by: profile.name })
      .eq("id", requestId).eq("status", "승인대기").select();
    if (error) { alert("취소 실패: " + error.message); return false; }
    if (!data?.length) { alert("이미 관리자가 처리를 시작해서 취소할 수 없습니다. 새로고침 후 확인해주세요."); return false; }
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "취소", cancelledAt: nowIso, cancelledBy: profile.name } : r)));
    notify("material_request_cancelled", {
      title: "자재 신청이 취소됐어요",
      body: `${profile.name}님이 ${target?.siteName ?? ""} · ${target?.part ?? ""} 신청을 취소했습니다`,
    });
    return true;
  }

  // ★ 견적 신청 취소 — handleCancelMaterialRequest와 동일한 이유로 요청접수 단계에서만.
  async function handleCancelQuoteRequest(requestId) {
    const target = quoteRequests.find((q) => q.id === requestId);
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from("quote_requests")
      .update({ status: "취소", cancelled_at: nowIso, cancelled_by: profile.name })
      .eq("id", requestId).eq("status", "요청접수").select();
    if (error) { alert("취소 실패: " + error.message); return false; }
    if (!data?.length) { alert("이미 관리자가 처리를 시작해서 취소할 수 없습니다. 새로고침 후 확인해주세요."); return false; }
    setQuoteRequests((prev) => prev.map((q) => (q.id === requestId ? { ...q, status: "취소", cancelledAt: nowIso, cancelledBy: profile.name } : q)));
    notify("quote_request_cancelled", {
      title: "견적 신청이 취소됐어요",
      body: `${profile.name}님이 ${target?.siteName ?? ""} · ${target?.constructionType ?? ""} 신청을 취소했습니다`,
    });
    return true;
  }

  // ★ 자재 담당자가 지급할 자재 사진을 한 장 추가하는 순간 (지급완료 체크의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachPhoto(requestId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.material;
    const existing = ref[requestId] ?? materialRequests.find((r) => r.id === requestId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[requestId] = urls;
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, hasSupplyPhoto: true, supplyPhotoUrls: urls } : r)));
    await supabase.from("material_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", requestId);
  }

  // ★ 등록된 지급 사진을 한 장 삭제
  async function handleRemoveSupplyPhoto(requestId, idx) {
    const ref = supplyPhotoUrlsRef.current.material;
    const existing = ref[requestId] ?? materialRequests.find((r) => r.id === requestId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[requestId] = urls;
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : r)));
    await supabase
      .from("material_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", requestId);
  }

  // ★ 자재 지급 완료 트리거: 이 순간에만 할 일이 자동 생성됩니다 (D-30 시작)
  // assignee를 넘기면(신청자와 실제 교체 기사가 다른 경우) 그 이름으로 할 일이 생성되고,
  // 생략하면 지금처럼 신청 기사 본인 앞으로 생성됩니다.
  async function handleSupplyComplete(requestId, assignee, billingPart, billingAmount, dueDate, description) {
    const req = materialRequests.find((r) => r.id === requestId);
    if (!req) return;

    const newTodo = {
      id: "todo-" + requestId,
      materialRequestId: requestId,
      source: "material",
      title: `${req.siteName}${formatUnitLabel(req.elevatorNo) ? ` ${formatUnitLabel(req.elevatorNo)}` : ""} ${req.part} 교체 및 확인서 제출`,
      siteName: req.siteName,
      elevatorNo: req.elevatorNo,
      part: req.part,
      assignee: assignee || req.engineer,
      assignedDate: TODAY_STR,
      dueDate: dueDate || addDays(TODAY_STR, 30),
      done: false,
      billingPart: billingPart || null,
      billingAmount: billingAmount || null,
      description: description || null,
    };
    // ★ 할 일을 먼저 만든 뒤 자재 상태를 바꾼다 — 순서가 반대면 todo insert 실패 시
    // "지급완료인데 할 일 없음"(= 교체작업 소실)이 된다. id가 요청당 고정이라 upsert면 재시도도
    // 안전하다 (관리자 콘솔 견적 지급완료와 동일 패턴). (P1-7)
    const todoSaved = await writeOk(
      supabase.from("todos").upsert({
        id: newTodo.id,
        material_request_id: newTodo.materialRequestId,
        source: newTodo.source,
        title: newTodo.title,
        site_name: newTodo.siteName,
        elevator_no: newTodo.elevatorNo,
        part: newTodo.part,
        assignee: newTodo.assignee,
        assigned_date: newTodo.assignedDate,
        due_date: newTodo.dueDate,
        done: newTodo.done,
        description: newTodo.description,
        ...(v2Ready ? {
          unit_id: req.unitId ?? unitIdFor(units, req.siteId, req.elevatorNo),
          assignee_id: profileIdByName(profilesAll, newTodo.assignee),
        } : {}),
        ...(todoBillingReady ? { billing_part: newTodo.billingPart, billing_amount: newTodo.billingAmount } : {}),
      }),
      "할 일 생성 실패 — 자재 지급완료 처리를 중단했습니다"
    );
    if (!todoSaved) return;

    const statusSaved = await writeOk(
      supabase.from("material_requests").update({ status: "지급완료", supplied_date: TODAY_STR }).eq("id", requestId),
      "자재 지급완료 처리 실패"
    );
    if (!statusSaved) return;

    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "지급완료", suppliedDate: TODAY_STR } : r))
    );
    setTodos((prev) => [newTodo, ...prev]);
    const suppliedTo = profileIdByName(profilesAll, newTodo.assignee);
    if (suppliedTo) sendPush("supply_ready", [suppliedTo], {
      title: "자재 지급 완료 — 수령 확인해주세요",
      body: `${req.siteName}${formatUnitLabel(req.elevatorNo) ? ` ${formatUnitLabel(req.elevatorNo)}` : ""} · ${req.part}`,
    });
  }

  // ★ 이미 지급완료된 자재신청 수정 — 상태/지급일/사진(별도 handleAttachPhoto)은 그대로 두고
  // 연결된 할 일(담당기사·청구금액·기한·내용)만 그 자리에서 갱신한다 (새 할 일을 만들지 않음).
  async function handleSupplyEdit(requestId, assignee, billingPart, billingAmount, dueDate, description) {
    const req = materialRequests.find((r) => r.id === requestId);
    if (!req) return;
    const todoId = "todo-" + requestId;
    const assigneeName = assignee || req.engineer;
    const finalDueDate = dueDate || addDays(TODAY_STR, 30);
    const patch = {
      assignee: assigneeName,
      due_date: finalDueDate,
      description: description || null,
      ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, assigneeName) } : {}),
      ...(todoBillingReady ? { billing_part: billingPart || null, billing_amount: billingAmount || null } : {}),
    };
    const { error } = await supabase.from("todos").update(patch).eq("id", todoId);
    if (error) { alert("수정 실패: " + error.message); return; }
    setTodos((prev) => prev.map((t) => (t.id === todoId ? {
      ...t,
      assignee: assigneeName,
      dueDate: finalDueDate,
      description: description || null,
      ...(v2Ready ? { assigneeId: patch.assignee_id } : {}),
      ...(todoBillingReady ? { billingPart: billingPart || null, billingAmount: billingAmount || null } : {}),
    } : t)));
  }

  // ★ 기사가 비용청구에서 "상비부품에서 사용함"을 체크하고 제출하면 보충 요청이 자동 생성되고,
  // 사용한 수량만큼 그 기사의 상비부품 재고(kit_stock)가 즉시 차감됩니다 (0 아래로는 내려가지 않음).
  async function handleUseKitPart({ part, siteName, qty }) {
    const usedQty = Number(qty) || 1;
    const engineerId = profileIdByName(profilesAll, profile.name);
    const newRestock = {
      id: "restock-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      engineer: profile.name,
      part,
      siteName,
      requestedDate: TODAY_STR,
      status: "대기",
      suppliedDate: null,
      hasSupplyPhoto: false,
      quantity: usedQty,
      engineerId,
      receivedAt: null,
    };
    await supabase.from("restock_requests").insert({
      id: newRestock.id,
      engineer: newRestock.engineer,
      part: newRestock.part,
      site_name: newRestock.siteName,
      requested_date: newRestock.requestedDate,
      status: newRestock.status,
      ...(v2Ready ? { engineer_id: engineerId } : {}),
      ...(kitStockReady ? { quantity: usedQty } : {}),
    });
    setRestockRequests((prev) => [newRestock, ...prev]);
    // sendPush(로컬 헬퍼)는 항상 profileIds를 직접 넘겨야 해서 알림 설정의 "받는 사람" 좁히기가
    // 안 먹는다 — 자재 신청과 같은 대상 규칙을 타야 하니 notify()로 관리자 대상 자동 해석을 쓴다.
    notify("material_requested", {
      title: "상비부품 보충 신청",
      body: `${profile.name} · ${part}${siteName ? ` (${siteName})` : ""}`,
    });

    if (kitStockReady && engineerId) {
      const key = `${engineerId}|${part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = Math.max(0, currentQty - usedQty);
      kitStockRef.current[key] = newQty;
      // 재고는 수치 정합이 중요 — 저장 실패 시 화면·ref를 원래 수량으로 되돌린다 (P1-7)
      if (!(await writeOk(supabase.from("kit_stock").upsert({ engineer_id: engineerId, part, qty: newQty }, { onConflict: "engineer_id,part" }), "상비부품 재고 갱신 실패"))) {
        kitStockRef.current[key] = currentQty;
        return;
      }
      setKitStock((prev) => {
        const existing = prev.find((k) => k.engineerId === engineerId && k.part === part);
        if (existing) return prev.map((k) => (k === existing ? { ...k, qty: newQty } : k));
        return [...prev, { id: key, engineerId, part, qty: newQty }];
      });
    }
  }

  // ★ 기사가 지급완료된 보충 요청을 "수령하기" 하면 그만큼 상비부품 재고가 늘어납니다.
  async function handleReceiveRestock(restockId) {
    const restock = restockRequests.find((r) => r.id === restockId);
    if (!restock) return;
    if (restock.receivedAt) return; // 이미 수령한 건은 무시 — 더블탭 시 재고 이중 증가 방지 (P2-5)
    const receivedAt = new Date().toISOString();
    await supabase.from("restock_requests").update({ received_at: receivedAt }).eq("id", restockId);
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, receivedAt } : r)));

    if (kitStockReady && restock.engineerId) {
      const key = `${restock.engineerId}|${restock.part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = currentQty + (restock.quantity || 1);
      kitStockRef.current[key] = newQty;
      // 실패 시 원복 — 안 그러면 화면 재고와 DB 재고가 어긋난다 (P1-7)
      if (!(await writeOk(supabase.from("kit_stock").upsert({ engineer_id: restock.engineerId, part: restock.part, qty: newQty }, { onConflict: "engineer_id,part" }), "상비부품 재고 갱신 실패"))) {
        kitStockRef.current[key] = currentQty;
        return;
      }
      setKitStock((prev) => {
        const existing = prev.find((k) => k.engineerId === restock.engineerId && k.part === restock.part);
        if (existing) return prev.map((k) => (k === existing ? { ...k, qty: newQty } : k));
        return [...prev, { id: key, engineerId: restock.engineerId, part: restock.part, qty: newQty }];
      });
    }
  }

  // ★ 관리자가 보충할 부품 사진을 등록 (지급완료의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachRestockPhoto(restockId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.restock;
    const existing = ref[restockId] ?? restockRequests.find((r) => r.id === restockId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[restockId] = urls;
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, hasSupplyPhoto: true, supplyPhotoUrls: urls } : r)));
    await supabase.from("restock_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", restockId);
  }

  async function handleRemoveRestockSupplyPhoto(restockId, idx) {
    const ref = supplyPhotoUrlsRef.current.restock;
    const existing = ref[restockId] ?? restockRequests.find((r) => r.id === restockId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[restockId] = urls;
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : r)));
    await supabase
      .from("restock_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", restockId);
  }

  // ★ 보충 지급완료 처리
  async function handleCompleteRestock(restockId) {
    const r = restockRequests.find((x) => x.id === restockId);
    if (!r) return;
    await supabase.from("restock_requests").update({ status: "완료", supplied_date: TODAY_STR }).eq("id", restockId);
    setRestockRequests((prev) =>
      prev.map((x) => (x.id === restockId ? { ...x, status: "완료", suppliedDate: TODAY_STR } : x))
    );
    const restockTo = r.engineerId ?? profileIdByName(profilesAll, r.engineer);
    if (restockTo) sendPush("supply_ready", [restockTo], {
      title: "상비부품 지급 완료 — 수령 확인해주세요",
      body: `${r.part}${r.siteName ? ` · ${r.siteName}` : ""}`,
    });
  }

  // ★ 견적 진행 단계 전진: 요청접수 → 견적발행 → 승인 (사진 불필요)
  async function handleAdvanceQuote(quoteId) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    // 저장 실패했는데 화면만 다음 단계로 넘어가면, 이후 지급완료 처리가 실제 DB 상태와 다른
    // 단계를 기준으로 동작할 수 있다 — 실패 시 반영하지 않는다.
    if (q.status === "요청접수") {
      if (!(await writeOk(supabase.from("quote_requests").update({ status: "견적발행", quote_issued_date: TODAY_STR }).eq("id", quoteId), "견적발행 처리 실패"))) return;
    } else if (q.status === "견적발행") {
      if (!(await writeOk(supabase.from("quote_requests").update({ status: "승인", approved_date: TODAY_STR }).eq("id", quoteId), "승인 처리 실패"))) return;
    } else {
      return;
    }
    setQuoteRequests((prev) =>
      prev.map((x) => {
        if (x.id !== quoteId) return x;
        if (x.status === "요청접수") return { ...x, status: "견적발행", quoteIssuedDate: TODAY_STR };
        if (x.status === "견적발행") return { ...x, status: "승인", approvedDate: TODAY_STR };
        return x;
      })
    );
  }

  // ★ 관리자가 지급할 자재 사진을 등록 (자재지급완료 처리의 선행 조건)
  // 여러 장을 연달아 올릴 때 setState 업데이터만으로는 React 렌더링 타이밍에 따라 아직 반영되지
  // 않은 상태를 기준으로 계산될 수 있어(경쟁 상태), ref에 최신 배열을 직접 동기적으로 보관합니다.
  async function handleAttachQuotePhoto(quoteId, newUrl) {
    const ref = supplyPhotoUrlsRef.current.quote;
    const existing = ref[quoteId] ?? quoteRequests.find((q) => q.id === quoteId)?.supplyPhotoUrls ?? [];
    if (existing.includes(newUrl)) return;
    const urls = [...existing, newUrl];
    ref[quoteId] = urls;
    setQuoteRequests((prev) => prev.map((q) => (q.id === quoteId ? { ...q, hasSupplyPhoto: true, supplyPhotoUrls: urls } : q)));
    await supabase.from("quote_requests").update({ has_supply_photo: true, supply_photo_urls: urls }).eq("id", quoteId);
  }

  async function handleRemoveQuoteSupplyPhoto(quoteId, idx) {
    const ref = supplyPhotoUrlsRef.current.quote;
    const existing = ref[quoteId] ?? quoteRequests.find((q) => q.id === quoteId)?.supplyPhotoUrls ?? [];
    const urls = existing.filter((_, i) => i !== idx);
    ref[quoteId] = urls;
    setQuoteRequests((prev) => prev.map((q) => (q.id === quoteId ? { ...q, hasSupplyPhoto: urls.length > 0, supplyPhotoUrls: urls } : q)));
    await supabase
      .from("quote_requests")
      .update({ has_supply_photo: urls.length > 0, supply_photo_urls: urls.length ? urls : null })
      .eq("id", quoteId);
  }

  // ★ 자재지급완료 트리거: 이 순간 담당 기사(들)에게 할 일이 자동 생성됩니다
  // assignees(배열)를 넘기면 신청자 외에 실제 시공 기사를 2명 이상 지정할 수 있고,
  // 각 담당자마다 할 일이 하나씩 생성됩니다 (같은 quoteRequestId를 공유 — 한 명이 비용청구를
  // 하면 나머지 담당자의 할 일도 함께 자동완료됩니다).
  async function handleCompleteQuoteSupply(quoteId, assignees, dueDate, description) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    const finalAssignees = assignees?.length ? assignees : [q.engineer];
    const finalDueDate = dueDate || addDays(TODAY_STR, 30);

    const newTodos = finalAssignees.map((assignee, idx) => ({
      id: `todo-quote-${quoteId}-${idx}`,
      materialRequestId: null,
      quoteRequestId: quoteId,
      source: "quote",
      title: `${q.siteName}${formatUnitLabel(q.elevatorNo) ? ` ${formatUnitLabel(q.elevatorNo)}` : ""} ${q.constructionType} 시공 확인 및 서류 제출`,
      siteName: q.siteName,
      elevatorNo: q.elevatorNo,
      part: q.constructionType,
      assignee,
      assignedDate: TODAY_STR,
      dueDate: finalDueDate,
      done: false,
      description: description || null,
    }));
    // ★ 할 일을 먼저 만든 뒤 견적 상태를 바꾼다 — 자재 지급완료(handleSupplyComplete)와 동일 패턴.
    // id가 견적당 고정이라 upsert면 재시도도 안전하다.
    const todosSaved = await writeOk(
      supabase.from("todos").upsert(
        newTodos.map((t) => ({
          id: t.id,
          quote_request_id: t.quoteRequestId,
          source: t.source,
          title: t.title,
          site_name: t.siteName,
          elevator_no: t.elevatorNo,
          part: t.part,
          assignee: t.assignee,
          assigned_date: t.assignedDate,
          due_date: t.dueDate,
          done: t.done,
          description: t.description,
          ...(v2Ready ? {
            unit_id: q.unitId ?? unitIdFor(units, q.siteId, q.elevatorNo),
            assignee_id: profileIdByName(profilesAll, t.assignee),
          } : {}),
        }))
      ),
      "할 일 생성 실패 — 견적 지급완료 처리를 중단했습니다"
    );
    if (!todosSaved) return;

    const statusSaved = await writeOk(
      supabase.from("quote_requests").update({ status: "자재지급완료", supplied_date: TODAY_STR }).eq("id", quoteId),
      "견적 지급완료 처리 실패"
    );
    if (!statusSaved) return;

    setQuoteRequests((prev) =>
      prev.map((x) => (x.id === quoteId ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR } : x))
    );
    setTodos((prev) => [...newTodos, ...prev]);
    const quoteTo = finalAssignees.map((n) => profileIdByName(profilesAll, n)).filter(Boolean);
    if (quoteTo.length) sendPush("supply_ready", quoteTo, {
      title: "견적 자재 지급 완료 — 수령 확인해주세요",
      body: `${q.siteName}${formatUnitLabel(q.elevatorNo) ? ` ${formatUnitLabel(q.elevatorNo)}` : ""} · ${q.constructionType}`,
    });
  }

  // ★ 이미 자재지급완료된 견적요청 수정 — 상태/지급일/사진(별도 onAttachQuotePhoto)은 그대로 두고
  // 담당 기사 구성이 바뀐 만큼만 할 일을 정리한다: 빠진 담당자는 할 일 삭제, 새로 추가된
  // 담당자는 할 일 신규 생성, 그대로 남는 담당자는 새 기한/내용으로 갱신 (admin 콘솔의
  // handleQuoteEdit과 동일한 로직 — 새 할 일을 무작정 다시 만들지 않는다).
  async function handleQuoteSupplyEdit(quoteId, assignees, dueDate, description) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    const finalAssignees = assignees?.length ? assignees : [q.engineer];
    const finalDueDate = dueDate || addDays(TODAY_STR, 30);

    const existingTodos = todos.filter((t) => t.quoteRequestId === quoteId);
    const kept = existingTodos.filter((t) => finalAssignees.includes(t.assignee));
    const toRemove = existingTodos.filter((t) => !finalAssignees.includes(t.assignee));
    const toAddNames = finalAssignees.filter((name) => !existingTodos.some((t) => t.assignee === name));

    if (toRemove.length) {
      const { error: delError } = await supabase.from("todos").delete().in("id", toRemove.map((t) => t.id));
      if (delError) { alert("할 일 정리 실패: " + delError.message); return; }
    }
    if (kept.length) {
      const { error: keepError } = await supabase.from("todos")
        .update({ due_date: finalDueDate, description: description || null })
        .in("id", kept.map((t) => t.id));
      if (keepError) { alert("할 일 수정 실패: " + keepError.message); return; }
    }

    const newTodos = toAddNames.map((assignee, idx) => ({
      id: `todo-quote-${quoteId}-edit-${Date.now()}-${idx}`,
      materialRequestId: null,
      quoteRequestId: quoteId,
      source: "quote",
      title: `${q.siteName}${formatUnitLabel(q.elevatorNo) ? ` ${formatUnitLabel(q.elevatorNo)}` : ""} ${q.constructionType} 시공 확인 및 서류 제출`,
      siteName: q.siteName,
      elevatorNo: q.elevatorNo,
      part: q.constructionType,
      assignee,
      assignedDate: TODAY_STR,
      dueDate: finalDueDate,
      done: false,
      description: description || null,
    }));
    if (newTodos.length) {
      const { error: insError } = await supabase.from("todos").insert(
        newTodos.map((t) => ({
          id: t.id, quote_request_id: t.quoteRequestId, source: t.source, title: t.title,
          site_name: t.siteName, elevator_no: t.elevatorNo, part: t.part, assignee: t.assignee,
          assigned_date: t.assignedDate, due_date: t.dueDate, done: t.done, description: t.description,
          ...(v2Ready ? {
            unit_id: q.unitId ?? unitIdFor(units, q.siteId, q.elevatorNo),
            assignee_id: profileIdByName(profilesAll, t.assignee),
          } : {}),
        }))
      );
      if (insError) { alert("할 일 생성 실패: " + insError.message); return; }
    }

    setTodos((prev) => [
      ...newTodos,
      ...prev
        .filter((t) => !toRemove.some((r) => r.id === t.id))
        .map((t) => (kept.some((k) => k.id === t.id) ? { ...t, dueDate: finalDueDate, description: description || null } : t)),
    ]);
  }

  // ★ 관리자가 직원(1명 이상)에게 할 일을 직접 부여 — 담당자마다 할 일을 하나씩 만듭니다
  async function handleAssignTodo({ assignees, siteName, title, dueDate, photoCount, photoUrls }) {
    const newTodos = assignees.map((assignee, idx) => ({
      id: "todo-manual-" + Date.now() + "-" + idx,
      materialRequestId: null,
      source: "manual",
      title,
      siteName,
      part: null,
      assignee,
      assignedDate: TODAY_STR,
      dueDate,
      done: false,
      photoCount: photoCount || 0,
      photoUrls: photoUrls ?? [],
    }));
    const assigned = await writeOk(supabase.from("todos").insert(
      newTodos.map((t) => ({
        id: t.id,
        source: t.source,
        title: t.title,
        site_name: t.siteName,
        assignee: t.assignee,
        assigned_date: t.assignedDate,
        due_date: t.dueDate,
        done: t.done,
        photo_count: t.photoCount,
        photo_urls: t.photoUrls?.length ? t.photoUrls : null,
        requested_by_id: profile.id ?? null,
        requested_by_name: profile.name,
        ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, t.assignee) } : {}),
      }))
    ), "할 일 부여 실패");
    if (!assigned) return; // 부여했다고 보이는데 실제로는 없는 상황 방지 (P1-7)
    setTodos((prev) => [...newTodos.map((t) => ({ ...t, requestedById: profile.id ?? null, requestedByName: profile.name })), ...prev]);
    // 각자 다른 할일 id를 받으므로(assignees 수만큼 별도 행), 딥링크 url이 정확하도록 한 명씩 보낸다.
    for (const t of newTodos) {
      const assigneeId = profileIdByName(profilesAll, t.assignee);
      if (!assigneeId) continue;
      sendPush("todo_assigned", [assigneeId], {
        title: "할 일이 배정되었습니다",
        body: `${siteName ? `${siteName} · ` : ""}${title}`,
        url: `/?openTodo=${t.id}`,
      });
    }
  }

  // ★ 관리자 권한: 어떤 할 일이든(자재/견적 연동건 포함) 임의로 완료·완료취소 처리할 수 있음
  async function handleAdminToggleTodo(todoId) {
    const current = todos.find((t) => t.id === todoId);
    if (!current) return;
    await supabase.from("todos").update({ done: !current.done }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)));
  }

  // ★ 할 일 담당자 재지정 — 신청자와 실제 교체 기사가 지급 시점엔 다르게 정해졌거나
  // 나중에 배차가 바뀐 경우의 안전망입니다. 관리자 화면과 기사 본인 화면 양쪽에서 호출됩니다.
  async function handleReassignTodo(todoId, newAssignee) {
    // 재배정하면 걸려 있던 재배정 요청도 함께 해제한다.
    if (!(await writeOk(supabase.from("todos").update({ assignee: newAssignee, reassign_requested: false, reassign_reason: null, reassign_to: null }).eq("id", todoId), "재배정 실패"))) return;
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, assignee: newAssignee, reassignRequested: false, reassignReason: null, reassignTo: null } : t)));
    const t = todos.find((x) => x.id === todoId);
    const newAssigneeId = profileIdByName(profilesAll, newAssignee);
    if (newAssigneeId) sendPush("todo_assigned", [newAssigneeId], {
      title: "할 일이 배정되었습니다",
      body: `${t?.siteName ? `${t.siteName} · ` : ""}${t?.title ?? ""}`,
      url: `/?openTodo=${todoId}`,
    });
  }

  // ★ 기사가 자기 할일을 다른 사람에게 넘겨달라고 관리자에게 요청 (사유·희망담당자 선택).
  async function handleRequestReassignTodo(todoId, reason, to) {
    await supabase.from("todos").update({ reassign_requested: true, reassign_reason: reason || null, reassign_to: to || null }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, reassignRequested: true, reassignReason: reason || null, reassignTo: to || null } : t)));
    const todo = todos.find((t) => t.id === todoId);
    sendPush("todo_reassign_requested", adminIds(), {
      title: "할일 재배정 요청",
      body: `${profile.name}님이 "${todo?.title ?? "할일"}"을(를) 넘겨달라고 요청했습니다${to ? ` (희망 담당자: ${to})` : ""}`,
      url: `/?openTodo=${todoId}`,
    });
  }

  // ★ 재배정 요청 해제 — 관리자가 반려하거나 기사가 요청 취소.
  async function handleClearReassignRequest(todoId) {
    await supabase.from("todos").update({ reassign_requested: false, reassign_reason: null, reassign_to: null }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, reassignRequested: false, reassignReason: null, reassignTo: null } : t)));
  }

  // ★ 직원 비밀번호 초기화(1234로) — 모바일 관리자 모드에서도 PC 관리자 콘솔과 동일하게
  // 최고관리자만 쓸 수 있다(버튼 자체는 AdminTab에서 adminTier==='super'일 때만 보임).
  // 그것만으로는 부족해서(화면 노출만 막는 건 우회 가능) RPC 안에서 호출자의 최고관리자
  // 아이디·비번을 다시 확인한다 — PC 콘솔(EngineersAdmin.jsx superReset)과 같은 방식.
  async function handleResetEngineerPassword(targetId) {
    const aid = prompt("본인 확인 — 최고관리자 아이디를 입력하세요");
    if (aid === null) return;
    const pw = prompt("최고관리자 비밀번호를 입력하세요");
    if (pw === null) return;
    const { data, error } = await supabase.rpc("admin_reset_password", {
      p_admin_login_id: aid.trim(), p_admin_password: pw, p_target_id: targetId,
    });
    if (error) { alert("처리 실패: " + error.message); return; }
    if (data) { alert(data); return; } // 인증 실패 사유
    alert("비밀번호가 1234로 초기화됐습니다. 다음 로그인 때 새 비밀번호를 정하게 됩니다.");
  }

  // ★ 관리자가 할 일에 설명(내용)을 추가/수정합니다.
  async function handleUpdateTodoDescription(todoId, description) {
    await supabase.from("todos").update({ description }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, description } : t)));
  }

  // ★ 관리자가 마감일을 직접 수정합니다 (사유 기록 없이 바로 반영).
  async function handleUpdateTodoDueDate(todoId, dueDate) {
    await supabase.from("todos").update({ due_date: dueDate }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, dueDate } : t)));
  }

  // ★ 기사의 마감일 연장 — 승인 절차 없이 바로 반영하되, 언제·왜 늦춰졌는지 나중에 볼 수 있도록
  // 연장 일자와 사유를 할 일 내용(description)에 함께 남긴다.
  async function handleExtendTodoDueDate(todoId, dueDate, reason) {
    const current = todos.find((t) => t.id === todoId);
    if (!current) return;
    const logLine = `[기한연장] ${current.dueDate} → ${dueDate} · 사유: ${reason}`;
    const description = current.description ? `${current.description}\n${logLine}` : logLine;
    await supabase.from("todos").update({ due_date: dueDate, description }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, dueDate, description } : t)));
  }

  // ★ 기사 반려: 잘못된 자재가 지급된 경우. 연결된 할 일은 취소되고 담당자에게 재지급 알림이 전달됩니다.
  async function handleReject(requestId, reason) {
    // "이미 비용청구 완료된 건은 반려 불가"는 화면에선 로컬 todos로 버튼을 숨기는 것뿐이라,
    // 반려 시트를 열어둔 채로 다른 곳에서 청구가 끝나는 경쟁을 못 막는다 — 실행 직전 DB를 다시 조회해 확인.
    // 할 일의 done 여부가 아니라 실제 청구기록(billings) 존재 여부로 판단한다 — 관리자가 "완료취소"로
    // 할 일을 되돌려도 청구기록 자체는 안 지워지므로 이게 더 확실한 기준이다.
    const { data: existingBillings } = await supabase.from("billings").select("id").eq("material_request_id", requestId).limit(1);
    if (existingBillings?.length) {
      alert("이미 비용청구가 완료된 건이라 반려할 수 없어요. 화면을 새로고침해주세요.");
      return;
    }
    if (!(await writeOk(
      supabase.from("material_requests").update({ status: "반려", reject_reason: reason, rejected_date: TODAY_STR }).eq("id", requestId),
      "반려 처리 실패"
    ))) return;
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "반려", rejectReason: reason, rejectedDate: TODAY_STR } : r))
    );

    // 삭제 대상도 방금 확인한 최신 DB 상태로 다시 조회해서 정하고, 삭제 자체의 실패 여부도 확인한다 —
    // 실패했는데 화면에서만 지워지면 반려된 신청에 할 일이 유령처럼 DB에 남는다.
    const { data: freshTodos } = await supabase.from("todos").select("id, done").eq("material_request_id", requestId);
    const todoIdsToRemove = (freshTodos ?? []).filter((t) => !t.done).map((t) => t.id);
    if (todoIdsToRemove.length > 0) {
      const { error: delError } = await supabase.from("todos").delete().in("id", todoIdsToRemove);
      if (delError) {
        alert(`반려는 처리됐지만 연결된 할 일 정리에 실패했어요.\n${delError.message ?? ""}\n관리자에게 확인을 요청해주세요.`);
        return;
      }
    }
    setTodos((prev) => prev.filter((t) => !todoIdsToRemove.includes(t.id)));
  }

  // 관리자가 반려 건을 재확인하고 다시 '지급 대기' 목록으로 돌려보냅니다.
  async function handleReprocess(requestId) {
    // 지급사진도 함께 비운다 — 안 지우면 재지급 때 옛 사진 URL이 남아 새 사진에 덧붙는다 (P2-6)
    delete supplyPhotoUrlsRef.current.material[requestId];
    await supabase
      .from("material_requests")
      .update({ status: "승인대기", supplied_date: null, reject_reason: null, rejected_date: null, has_supply_photo: false, supply_photo_urls: null })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "승인대기", suppliedDate: null, rejectReason: null, rejectedDate: null, hasSupplyPhoto: false, supplyPhotoUrls: [] }
          : r
      )
    );
  }

  const tabTitle = tab === "room" ? "게시판" : TABS.find((t) => t.id === tab)?.label ?? "";
  const visibleTabs = TABS.filter((t) => t.id !== "admin" || profile?.role === "admin");

  // 게시판 안읽음/멘션 — 세션 로컬 읽음 시각이 있으면 그걸, 없으면 DB(profiles.feed_read_at) 기준
  const myName = profile?.name ?? "";
  const selfDbReadAt = profilesAll.find((p) => p.id === profileIdByName(profilesAll, myName))?.feed_read_at;
  const readMs = Date.parse(feedReadAt ?? selfDbReadAt ?? "") || 0;
  const unreadPosts = feed.filter((p) => p.author !== myName && p.createdAt && new Date(p.createdAt).getTime() > readMs);
  const mentionCnt = unreadPosts.filter((p) => (p.text ?? "").includes("@" + myName) || (p.text ?? "").includes("@모두")).length;

  // 알림(종) — 고장/할일/자재지급: "안읽음" 개념이 없어 각 탭이 이미 쓰는 "지금 나에게 처리 필요한 건" 기준을 그대로 재사용한다.
  // 사용자가 개별로 "지우기"한 항목은 dismissed_notif_ids(profiles)에 저장해 다시 뜨지 않게 한다.
  const selfProfileRow = profilesAll.find((p) => p.id === profileIdByName(profilesAll, myName));
  const dismissedNotifReady = profilesAll.some((p) => p.dismissed_notif_ids !== undefined);
  const dismissedIds = new Set(selfProfileRow?.dismissed_notif_ids ?? []);
  async function handleDismissNotif(key) {
    if (!dismissedNotifReady || !selfProfileRow) return;
    const next = [...new Set([...(selfProfileRow.dismissed_notif_ids ?? []), key])];
    setProfilesAll((prev) => prev.map((p) => (p.id === selfProfileRow.id ? { ...p, dismissed_notif_ids: next } : p)));
    await supabase.from("profiles").update({ dismissed_notif_ids: next }).eq("id", selfProfileRow.id);
  }

  // 자재/견적 지급완료는 지급 즉시 관련 할일이 자동 생성된다 — 그 할일이 존재하는 동안은
  // "할일" 알림 하나로만 보여주고 "자재지급" 알림은 중복으로 띄우지 않는다(할일이 처리되면 자동 삭제되므로 재노출 불필요).
  const notifFailures = failures.filter((f) => f.status !== "완료" && (f.assignee === myName || !f.assignee) && !dismissedIds.has("fail:" + f.id));
  // 담당기사(현장 기본 담당)와 배정기사(이 건을 실제로 처리한 기사)가 다른 경우,
  // 배정기사가 처리완료했을 때 담당기사에게 알려준다.
  const siteAssigneeById = new Map(sites.map((s) => [s.id, s.assignedEngineer]));
  const notifCompletedFailures = failures.filter((f) => {
    if (f.status !== "완료" || !f.assignee || f.assignee === myName) return false;
    if (siteAssigneeById.get(f.siteId) !== myName) return false;
    return !dismissedIds.has("faildone:" + f.id);
  });
  const notifTodos = todos.filter((t) => t.assignee === myName && !t.done && !dismissedIds.has("todo:" + t.id));
  const notifMaterials = materialRequests.filter((r) => r.engineer === myName && r.status === "지급완료" && !todos.some((t) => t.materialRequestId === r.id) && !dismissedIds.has("mat:" + r.id));
  const notifQuotes = quoteRequests.filter((q) => q.engineer === myName && q.status === "자재지급완료" && !todos.some((t) => t.quoteRequestId === q.id) && !dismissedIds.has("quote:" + q.id));
  const notifRestock = restockRequests.filter((r) => r.engineer === myName && r.status === "완료" && !r.receivedAt && !dismissedIds.has("restock:" + r.id));
  const notifSupplyCnt = notifMaterials.length + notifQuotes.length + notifRestock.length;
  // 관리자용 — 새로 들어온(아직 아무도 처리 안 한) 자재·견적 신청. 지금까지는 푸시로만 갔고
  // 종(🔔) 알림 목록엔 안 떴다.
  const notifNewMaterials = profile?.role === "admin" ? materialRequests.filter((r) => r.status === "승인대기" && !dismissedIds.has("newmat:" + r.id)) : [];
  // 자재담당관리자는 관리자 모드에 견적요청관리 화면 자체가 없어(자재출하관리·상비부품보충만
  // 볼 수 있음) 여기 떠도 눌러봤자 갈 곳이 없다 — 처음부터 안 보이게 뺀다.
  const notifNewQuotes = profile?.role === "admin" && profile?.adminTier !== "material"
    ? quoteRequests.filter((q) => q.status === "요청접수" && !dismissedIds.has("newquote:" + q.id))
    : [];
  // 게시판 알림(종)은 게시판 탭을 그냥 열기만 해도 통째로 사라지면 안 된다 — 실제로 그 글을 열어봤을
  // 때만(dismissedIds) 없어지게, feedReadAt(전체 읽음 시각)과 무관하게 독립적으로 계산한다.
  // 대상도 푸시가 실제로 가는 것과 맞춰 @멘션·공지 글만(전체 새 글이 아니라).
  const notifPosts = feed.filter((p) =>
    p.author !== myName
    && ((p.text ?? "").includes("@" + myName) || (p.text ?? "").includes("@모두") || p.isNotice)
    && !dismissedIds.has("post:" + p.id)
  );
  const totalNotifCnt = notifPosts.length + notifFailures.length + notifCompletedFailures.length + notifTodos.length + notifSupplyCnt + notifNewMaterials.length + notifNewQuotes.length;

  if (!skipLogin && session === undefined) {
    return <BrandSplash />;
  }

  if (!skipLogin && !session) {
    return <LoginScreen onLogin={handleLogin} error={authError} submitting={authSubmitting} demo={false} />;
  }

  if (loading || !profile) {
    return <BrandSplash label="데이터를 불러오는 중..." />;
  }

  // 첫 로그인(초기 비번 1234) 또는 관리자 초기화 후에는 비밀번호를 바꿔야 앱에 들어갈 수 있다.
  if (!skipLogin && session?.mustChange) {
    return (
      <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-extrabold text-blue-950 mb-1 text-center">비밀번호를 변경해주세요</h1>
          <p className="text-xs text-slate-400 mb-6 text-center">{profile.name}님, 초기 비밀번호(1234)를 바꿔야 시작할 수 있습니다.</p>
          <PasswordChangeForm
            profileId={session.id}
            submitLabel="변경하고 시작하기"
            onDone={() => {
              const next = { ...session, mustChange: false };
              localStorage.setItem("guilAuthV1", JSON.stringify(next));
              setSession(next);
            }}
          />
          <button onClick={handleLogout} className="w-full text-[11px] font-bold text-slate-400 mt-4">다른 계정으로 로그인</button>
        </div>
      </div>
    );
  }

  // 자재담당관리자는 기사앱을 기사와 똑같이 쓴다(현장·고장·점검·워크캘린더 등 전부 본인 담당
  // 기준으로만 — 전체 데이터·관리자 전용 기능 없음). 관리자모드(⚙️)로 들어가는 자재출하관리·
  // 상비부품보충만 별도로 추가된다. 관리자모드 진입 버튼·라우팅은 profile.role(실제 값)을 그대로
  // 쓰므로 이 대체는 하위 탭 컴포넌트들이 보는 AuthContext의 role에만 영향을 준다.
  const isMaterialTierAdmin = profile.role === "admin" && profile.adminTier === "material";
  const scopedRole = isMaterialTierAdmin ? "engineer" : profile.role;

  return (
    <AuthContext.Provider value={{ name: profile.name, role: scopedRole, adminTier: skipLogin ? "super" : profile.adminTier, engineerNames, engineers, profiles: profilesAll, selfId: profile.id ?? profileIdByName(profilesAll, profile.name), signOut: handleLogout }}>
    <SitesContext.Provider value={sites}>
    <UnitsContext.Provider value={units}>
      <div className="h-dvh w-screen bg-slate-50 flex flex-col overflow-hidden relative">
          <ConfirmHost />
          {pushBanner && (
            <button
              onClick={openPushBanner}
              className="absolute left-2 right-2 z-50 bg-blue-950 text-white rounded-2xl shadow-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
              style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
            >
              <p className="text-xs font-extrabold truncate">{pushBanner.title || "새 알림"}</p>
              {pushBanner.body && <p className="text-[11px] text-blue-200 truncate mt-0.5">{pushBanner.body}</p>}
            </button>
          )}
          <ScreenHeader
            title={tab === "home" ? "구일엘리베이터(주)" : tabTitle}
            right={
              <div className="relative flex items-center gap-1.5">
                <button onClick={() => setMyPageOpen(true)} className="p-1.5 bg-blue-900 rounded-full" aria-label="마이페이지">
                  <UserRound size={16} />
                </button>
                <div ref={notifRef} className="relative">
                <button onClick={() => setNotifOpen((v) => !v)} className="relative p-1.5 bg-blue-900 rounded-full" aria-label="알림">
                  <Bell size={16} />
                  {totalNotifCnt > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-blue-950">
                      {totalNotifCnt > 99 ? "99+" : totalNotifCnt}
                    </span>
                  )}
                </button>
                {notifOpen && (
                    <div className="absolute right-0 top-10 z-40 w-72 max-h-96 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200">
                      <div className="px-4 py-3 border-b border-slate-100">
                        <p className="text-sm font-bold text-slate-800">알림</p>
                      </div>
                      {totalNotifCnt === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">새 알림이 없습니다</p>
                      ) : (
                        <>
                          {notifFailures.length > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">고장</p>
                              {notifFailures.map((f) => (
                                <NotifRow
                                  key={f.id}
                                  onClick={() => { setNotifOpen(false); setOpenFailureId(f.id); }}
                                  onDismiss={() => handleDismissNotif("fail:" + f.id)}
                                  title={`${f.siteName} · ${formatUnitLabel(f.elevatorNo)}`}
                                  subtitle={`${f.errorCode} · ${f.assignee ? "출동 대기" : "미배정"}`}
                                />
                              ))}
                            </div>
                          )}
                          {notifCompletedFailures.length > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">고장 처리완료</p>
                              {notifCompletedFailures.map((f) => (
                                <NotifRow
                                  key={f.id}
                                  onClick={() => { setNotifOpen(false); setOpenFailureId(f.id); }}
                                  onDismiss={() => handleDismissNotif("faildone:" + f.id)}
                                  title={`${f.siteName} · ${formatUnitLabel(f.elevatorNo)}`}
                                  subtitle={`${f.assignee} 기사가 처리완료했습니다`}
                                />
                              ))}
                            </div>
                          )}
                          {notifTodos.length > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">할일</p>
                              {notifTodos.map((t) => (
                                <NotifRow
                                  key={t.id}
                                  onClick={() => { setNotifOpen(false); setTab("todo"); setOpenTodoId(t.id); }}
                                  onDismiss={() => handleDismissNotif("todo:" + t.id)}
                                  title={t.title}
                                  subtitle={
                                    t.source === "material" || t.source === "quote"
                                      ? "자재지급완료되어 할일이 자동등록되었습니다"
                                      : `${t.siteName ?? ""}${t.dueDate ? ` · ~${t.dueDate}` : ""}`
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {notifSupplyCnt > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">자재지급</p>
                              {notifMaterials.map((r) => (
                                <NotifRow
                                  key={r.id}
                                  onClick={() => { setNotifOpen(false); setTab("material"); }}
                                  onDismiss={() => handleDismissNotif("mat:" + r.id)}
                                  title={r.part}
                                  subtitle={`${r.siteName ?? ""} · 지급완료`}
                                />
                              ))}
                              {notifQuotes.map((q) => (
                                <NotifRow
                                  key={q.id}
                                  onClick={() => { setNotifOpen(false); setTab("material"); }}
                                  onDismiss={() => handleDismissNotif("quote:" + q.id)}
                                  title={q.constructionType}
                                  subtitle={`${q.siteName ?? ""} · 자재지급완료`}
                                />
                              ))}
                              {notifRestock.map((r) => (
                                <NotifRow
                                  key={r.id}
                                  onClick={() => { setNotifOpen(false); setTab("material"); }}
                                  onDismiss={() => handleDismissNotif("restock:" + r.id)}
                                  title={`${r.part} 상비부품`}
                                  subtitle={`${r.suppliedDate} 지급완료 · 수령확인 필요`}
                                />
                              ))}
                            </div>
                          )}
                          {(notifNewMaterials.length > 0 || notifNewQuotes.length > 0) && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">새 자재·견적 신청</p>
                              {notifNewMaterials.map((r) => (
                                <NotifRow
                                  key={r.id}
                                  onClick={() => { setNotifOpen(false); setTab("admin"); setMaterialFocusId(r.id); }}
                                  onDismiss={() => handleDismissNotif("newmat:" + r.id)}
                                  title={r.part}
                                  subtitle={`${r.siteName ?? ""} · ${r.engineer} 신청`}
                                />
                              ))}
                              {notifNewQuotes.map((q) => (
                                <NotifRow
                                  key={q.id}
                                  onClick={() => { setNotifOpen(false); setTab("admin"); setQuoteFocusId(q.id); }}
                                  onDismiss={() => handleDismissNotif("newquote:" + q.id)}
                                  title={q.constructionType}
                                  subtitle={`${q.siteName ?? ""} · ${q.engineer} 신청`}
                                />
                              ))}
                            </div>
                          )}
                          {notifPosts.length > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">게시판</p>
                              {[...notifPosts].reverse().map((p) => (
                                <div key={p.id} className="flex items-center border-b border-slate-50 last:border-0 active:bg-slate-50">
                                  <button
                                    onClick={() => { setNotifOpen(false); setTab("room"); setOpenFeedPostId(p.id); handleDismissNotif("post:" + p.id); }}
                                    className="flex-1 min-w-0 text-left px-4 py-2.5"
                                  >
                                    <p className="text-xs font-bold text-slate-700">
                                      {(p.text ?? "").includes("@" + myName) || (p.text ?? "").includes("@모두") ? (
                                        <span className="text-amber-600">@멘션 · </span>
                                      ) : null}
                                      {p.author}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                      {p.text || ((p.photoUrls ?? []).length > 0 ? "사진을 게시했습니다" : "")}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{(p.createdAt ?? "").slice(0, 10)} {p.time}</p>
                                  </button>
                                  <button onClick={() => handleDismissNotif("post:" + p.id)} className="p-2 pr-3 text-slate-300 active:text-slate-500 shrink-0" aria-label="알림 지우기">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                )}
                </div>
              </div>
            }
          />

          <DutySwapNotice
            swaps={dutySwaps}
            schedules={dutySchedules}
            onSeen={(w, as) => { handleSeenDutySwap(w, as); if (as === "target") setTab("workcalendar"); }}
          />

          {myPageOpen && (
            <MyPage attendances={attendances} dutySchedules={dutySchedules} onClose={() => setMyPageOpen(false)} />
          )}

          <PullToRefresh onRefresh={loadData}>
          {tab === "home" && (
            <HomeTab
              attendances={attendances}
              dutySchedules={dutySchedules}
              todayLeaves={todayLeaves}
              pendingNight={pendingNight}
              onCloseNight={closeNightDuty}
              onAttendance={handleAttendance}
              onOpenRoster={() => setTab("workcalendar")}
              onSendPost={handleSendFeedPost}
              swapCount={dutySwaps.filter((w) => w.status === "대기" && w.targetId === profileIdByName(profilesAll, profile.name)).length}
              inspections={inspections}
              failures={failures}
              errorCodes={errorCodes}
              onDispatch={handleDispatchFailure}
              onArrive={handleArriveFailure}
              onResult={handleFailureResult}
              onRefuse={handleRefuseFailure}
              onAssign={handleAssignFailure}
              onReassign={handleReassignFailure}
              onShowAllFailures={() => { setFailureFocusTab("처리현황"); setTab("failure"); }}
              toast={failureToast}
            />
          )}
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} quoteRequests={quoteRequests} todos={todos} siteManagers={siteManagers} onUpdateSiteNotes={handleUpdateSiteNotes} onUpdateSiteAccessInfo={handleUpdateSiteAccessInfo} />}
          {tab === "failure" && (
            <FailureTab
              onReported={handleFailureReported}
              attendances={attendances}
              todayLeaves={todayLeaves}
              failures={failures}
              errorCodes={errorCodes}
              setFailures={setFailures}
              onDispatch={handleDispatchFailure}
              onArrive={handleArriveFailure}
              onResult={handleFailureResult}
              onRefuse={handleRefuseFailure}
              onAssign={handleAssignFailure}
              onReassign={handleReassignFailure}
              focusSubTab={failureFocusTab}
              onFocusHandled={() => setFailureFocusTab(null)}
              toast={failureToast}
            />
          )}
          {tab === "checkup" && <CheckupTab selfChecks={selfChecks} setSelfChecks={setSelfChecks} siteManagers={siteManagers} profilesAll={profilesAll} inspections={inspections} />}
          {tab === "inspection" && <InspectionTab inspections={inspections} />}
          {tab === "material" && <MaterialTab requests={materialRequests} onAddMaterialRequest={handleAddMaterialRequest} onCancelMaterialRequest={handleCancelMaterialRequest} todos={todos} onReject={handleReject} quoteRequests={quoteRequests} onAddQuoteRequest={handleAddQuoteRequest} onCancelQuoteRequest={handleCancelQuoteRequest} restockRequests={restockRequests} kitStock={kitStock} onReceiveRestock={handleReceiveRestock} />}
          {tab === "billing" && <BillingTab todos={todos} setTodos={setTodos} onSubmitBilling={handleSubmitBilling} onUseKitPart={handleUseKitPart} />}
          {tab === "todo" && (
            <TodoTab
              todos={todos}
              setTodos={setTodos}
              onReassignTodo={handleReassignTodo}
              onUpdateTodoDescription={handleUpdateTodoDescription}
              onUpdateTodoDueDate={handleUpdateTodoDueDate}
              onExtendTodoDueDate={handleExtendTodoDueDate}
              onRequestReassignTodo={handleRequestReassignTodo}
              onClearReassignRequest={handleClearReassignRequest}
              onAssignTodo={handleAssignTodo}
              onAdminToggle={handleAdminToggleTodo}
              materialRequests={materialRequests}
              quoteRequests={quoteRequests}
              focusTodoId={openTodoId}
              onFocusHandled={() => setOpenTodoId(null)}
            />
          )}
          {tab === "room" && <RoomTab
                  feed={feed}
                  onSendChat={handleSendFeedPost}
                  onToggleLike={handleToggleLike}
                  onUpdatePost={handleUpdateFeedPost}
                  onDeletePost={handleDeleteFeedPost}
                  onSetNotice={feedNoticeReady ? handleSetFeedNotice : null}
                  onDismissNotif={handleDismissNotif}
                  focusPostId={openFeedPostId}
                  onFocusHandled={() => setOpenFeedPostId(null)}
                />}
          {tab === "workcalendar" && (
            <WorkCalendarSheet
              schedules={dutySchedules}
              swaps={dutySwaps}
              onSetPerson={handleSetDutyPerson}
              onRequestSwap={handleRequestDutySwap}
              onRespondSwap={handleRespondDutySwap}
              onSchedulesChange={setDutySchedules}
              onEngineersChange={setEngineers}
            />
          )}
          {tab === "admin" && profile.role === "admin" && <AdminTab materialRequests={materialRequests} billings={billings} quoteRequests={quoteRequests} restockRequests={restockRequests} todos={todos} onSupplyComplete={handleSupplyComplete} onSupplyEdit={handleSupplyEdit} onReprocess={handleReprocess} onAttachPhoto={handleAttachPhoto} onRemoveSupplyPhoto={handleRemoveSupplyPhoto} onAdvanceQuote={handleAdvanceQuote} onAttachQuotePhoto={handleAttachQuotePhoto} onRemoveQuoteSupplyPhoto={handleRemoveQuoteSupplyPhoto} onCompleteQuoteSupply={handleCompleteQuoteSupply} onQuoteSupplyEdit={handleQuoteSupplyEdit} onAttachRestockPhoto={handleAttachRestockPhoto} onRemoveRestockSupplyPhoto={handleRemoveRestockSupplyPhoto} onCompleteRestock={handleCompleteRestock} onReassignTodo={handleReassignTodo} onClearReassignRequest={handleClearReassignRequest} onAssignTodo={handleAssignTodo} onResetEngineerPassword={handleResetEngineerPassword} materialFocusId={materialFocusId} onMaterialFocusHandled={() => setMaterialFocusId(null)} quoteFocusId={quoteFocusId} onQuoteFocusHandled={() => setQuoteFocusId(null)} />}
          </PullToRefresh>

          {/* 게시판 플로팅 버튼 — 어느 탭에서든 즉시 게시판으로 이동 (게시판 탭에서는 숨김) */}
          {tab !== "room" && (
          <button
            onClick={() => setTab("room")}
            aria-label="게시판 열기"
            className="absolute right-4 z-20 w-12 h-12 rounded-full bg-blue-700 text-white shadow-lg flex items-center justify-center active:scale-95 bottom-20"
          >
            <MessagesSquare size={22} />
            {unreadPosts.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                {unreadPosts.length > 99 ? "99+" : unreadPosts.length}
              </span>
            )}
            {mentionCnt > 0 && (
              <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-amber-400 text-slate-900 text-[11px] font-extrabold flex items-center justify-center border-2 border-white">
                @
              </span>
            )}
          </button>
          )}

          {/* 관리자 퀵버튼 — 관리자는 어느 탭에서든 관리자 모드로 바로 이동 (관리자 모드 탭에서는 숨김) */}
          {profile.role === "admin" && tab !== "admin" && (
          <button
            onClick={() => setTab("admin")}
            aria-label="관리자 모드 열기"
            className={`absolute right-4 z-20 w-12 h-12 rounded-full bg-slate-800 text-white shadow-lg flex items-center justify-center active:scale-95 ${tab === "room" ? "bottom-40" : "bottom-36"}`}
          >
            <Settings size={22} />
          </button>
          )}

          {/* 알림(종)에서 특정 건을 눌렀을 때 — 탭 이동 없이 지금 화면 위에 상세만 띄운다 */}
          {openFailureId && (() => {
            const f = failures.find((x) => x.id === openFailureId);
            if (!f) return null;
            return (
              <FailureDetailSheet
                failure={f}
                onClose={() => setOpenFailureId(null)}
                onDispatch={setNotifDispatchTarget}
                onArrive={handleArriveFailure}
                onOpenResult={setNotifResultTarget}
              />
            );
          })()}
          {notifDispatchTarget && (
            <DispatchEtaModal
              failure={notifDispatchTarget}
              onClose={() => setNotifDispatchTarget(null)}
              onConfirm={(eta) => { handleDispatchFailure(notifDispatchTarget, eta); setNotifDispatchTarget(null); }}
            />
          )}
          {notifResultTarget && (
            <ArrivalResultModal
              failure={notifResultTarget}
              failures={failures}
              errorCodes={errorCodes}
              onClose={() => setNotifResultTarget(null)}
              onConfirm={(result) => { handleFailureResult(notifResultTarget, result); setNotifResultTarget(null); }}
            />
          )}
          {/* bottom nav — 기존 형태(전체 탭 가로 스크롤), 팀 합의로 원복 (2026-07-17) */}
          <div
            className="shrink-0 bg-slate-50 border-t-2 border-slate-300 flex overflow-x-auto"
            style={{ boxShadow: "0 -4px 6px -1px rgba(0,0,0,0.1)" }}
          >
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 px-2 shrink-0 border-r border-slate-200 last:border-r-0 ${active ? "bg-blue-900" : "bg-transparent"}`}
                  style={{ minWidth: "68px" }}
                >
                  <Icon size={19} className={active ? "text-white" : "text-slate-400"} strokeWidth={active ? 2.75 : 2} />
                  <span className={`text-[10px] leading-tight text-center font-bold ${active ? "text-white" : "text-slate-500"}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
      </div>
    </UnitsContext.Provider>
    </SitesContext.Provider>
    </AuthContext.Provider>
  );
}
