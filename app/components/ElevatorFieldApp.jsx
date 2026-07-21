"use client";

import { useState, useEffect, useRef } from "react";
import { Home, AlertTriangle, CalendarCheck, ShieldCheck, Package, Receipt, ListTodo, MessagesSquare, Settings, Bell, Building2, X, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest, mapTodo, mapQuoteRequest, mapBilling, mapRestockRequest, mapFeedPost, mapUnit, mapKitStock, mapSelfCheck, mapAttendance, mapDutySchedule, mapDutySwap } from "@/lib/mappers";
import { addDays, profileIdByName, unitIdFor, parseErrorCode, formatUnitLabel } from "@/lib/utils";
import { TODAY_STR } from "@/lib/constants";
import { DutyRoster, DutySwapNotice } from "@/app/components/DutyRoster";
import { MyPage } from "@/app/components/MyPage";
import { simulateSms } from "@/lib/sms";
import { ScreenHeader } from "@/app/components/ui";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import { LoginScreen } from "@/app/components/LoginScreen";
import { SiteTab } from "@/app/components/tabs/SiteTab";
import { HomeTab } from "@/app/components/tabs/HomeTab";
import { FailureTab, FailureDetailSheet, DispatchEtaModal, ArrivalTimeModal, ArrivalResultModal } from "@/app/components/tabs/FailureTab";
import { CheckupTab } from "@/app/components/tabs/CheckupTab";
import { InspectionTab } from "@/app/components/tabs/InspectionTab";
import { MaterialTab } from "@/app/components/tabs/MaterialTab";
import { BillingTab } from "@/app/components/tabs/BillingTab";
import { TodoTab, TodoDetailSheet, getRequesterName, getCoAssignees, getSupplyPhotos } from "@/app/components/tabs/TodoTab";
import { AdminTab } from "@/app/components/tabs/AdminTab";
import { RoomTab, PostDetailOverlay } from "@/app/components/tabs/RoomTab";


const TABS = [
  { id: "home", label: "홈", icon: Home },
  { id: "sites", label: "현장정보", icon: Building2 },
  { id: "failure", label: "고장접수", icon: AlertTriangle },
  { id: "checkup", label: "정기점검", icon: CalendarCheck },
  { id: "inspection", label: "검사관리", icon: ShieldCheck },
  { id: "material", label: "자재·견적", icon: Package },
  { id: "billing", label: "비용청구", icon: Receipt },
  { id: "todo", label: "할일관리", icon: ListTodo },
  { id: "room", label: "게시판", icon: MessagesSquare },
  { id: "admin", label: "관리자 모드", icon: Settings },
];


/* ------------------------------------------------------------------ */
/* App shell                                                            */
/* ------------------------------------------------------------------ */

// 앱 구성이 끝날 때까지 로그인 화면을 잠시 꺼두는 스위치입니다.
// 다시 로그인을 켜려면 이 값을 false로 바꾸면 됩니다.
const SKIP_LOGIN = true;

const DEV_FAKE_PROFILE = { name: "관리자", role: "admin" };


// SKIP_LOGIN 상태에서 로그인 없이 URL만으로 관리자/기사 화면을 바꿔볼 수 있게 해줍니다.
// 예: ?as=engineer (기본 이름 "신석주"), ?as=engineer&name=김기사, ?as=admin
function getDevProfileOverride() {
  if (typeof window === "undefined") return null;
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

  const [tab, setTab] = useState("home");
  const [focusSiteId, setFocusSiteId] = useState(null);
  const [failureFocusTab, setFailureFocusTab] = useState(null); // 고장접수 탭 진입 시 열 서브탭 (홈 "모두 보기" 등)
  const [focusUnit, setFocusUnit] = useState(null);
  const [sites, setSites] = useState([]);
  const [units, setUnits] = useState([]); // v2: 호기 목록 (마이그레이션 전 DB에서는 빈 배열)
  const [profilesAll, setProfilesAll] = useState([]); // v2: 전 직원 프로필 (이름→id 매핑용)
  const [attendances, setAttendances] = useState([]); // 오늘 출퇴근 기록
  const [dutySchedules, setDutySchedules] = useState([]); // 당직·숙직 근무표 (이번 달 이후)
  const [dutySwaps, setDutySwaps] = useState([]);
  const [todayLeaves, setTodayLeaves] = useState([]); // 오늘 휴가 중인 사람 (배정 차단용)
  const [rosterOpen, setRosterOpen] = useState(false);
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
  // 지급 사진을 여러 장 연달아 올릴 때, setState 업데이터 함수가 React 렌더링 타이밍에 따라
  // 아직 반영되지 않은 상태를 기준으로 계산될 수 있어(경쟁 상태) ref에 최신값을 직접 보관합니다.
  const supplyPhotoUrlsRef = useRef({ material: {}, quote: {}, restock: {} });
  // 상비부품 재고도 같은 이유로(한 번의 청구에서 여러 부품을 동시에 차감할 수 있어) ref에
  // 최신 수량을 직접 보관합니다. key: `${engineerId}|${part}`
  const kitStockRef = useRef({});
  const [failureToast, setFailureToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomOpen, setRoomOpen] = useState(false); // 우리방 — 탭이 아니라 플로팅 버튼으로 어디서든 연다
  const [feedReadAt, setFeedReadAt] = useState(null); // 이번 세션에서 우리방을 마지막으로 읽은 시각
  const [notifOpen, setNotifOpen] = useState(false); // 우측상단 알림(종) 드롭다운
  const [openFailureId, setOpenFailureId] = useState(null); // 알림에서 특정 고장 건을 눌러 상세를 바로 연다 (탭 이동 없이 현재 화면 위에 띄움)
  const [openTodoId, setOpenTodoId] = useState(null); // 알림에서 특정 할일을 눌러 상세를 바로 연다
  const [openFeedPostId, setOpenFeedPostId] = useState(null); // 알림에서 특정 게시글을 눌러 그 글만 팝업으로 연다 (게시판 전체를 열어 안읽음을 한번에 지우지 않도록)
  const [notifDispatchTarget, setNotifDispatchTarget] = useState(null);
  const [notifArriveTarget, setNotifArriveTarget] = useState(null);
  const [notifResultTarget, setNotifResultTarget] = useState(null);

  // SKIP_LOGIN 상태에서도 ?auth=1 이면 실제 로그인 흐름을 강제한다 (인증/회원가입 사전 점검용).
  const [forceAuth, setForceAuth] = useState(false);
  useEffect(() => {
    setForceAuth(new URLSearchParams(window.location.search).has("auth"));
  }, []);
  const skipLogin = SKIP_LOGIN && !forceAuth;

  // 로그인 상태를 확인하고, 로그인/로그아웃이 일어날 때마다 알림을 받습니다.
  useEffect(() => {
    if (skipLogin) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
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
    async function loadProfile() {
      const { data } = await supabase.from("profiles").select("*").eq("auth_user_id", session.user.id).single();
      setProfile(data ? { name: data.name, role: data.role } : null);
    }
    loadProfile();
  }, [session, skipLogin]);

  async function handleLogin(email, password) {
    // Phase 2 전 미리보기: SKIP_LOGIN 동안 ?auth=1 로그인은 아무 값이나 통과시켜 화면 흐름만 확인한다.
    if (SKIP_LOGIN) {
      setForceAuth(false);
      return;
    }
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("이메일 또는 비밀번호가 올바르지 않습니다.");
    setAuthSubmitting(false);
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

  // kind: in(출근) | out(퇴근) | duty(당직) | relocate(위치만 다시 받기)
  // 위치는 in·relocate에서만 받는다. 권한 거부·실패면 위치 없이 넘어가되,
  // 반환값 locFailed로 화면이 "위치 다시 받기"를 안내할 수 있게 한다.
  async function handleAttendance(kind) {
    const pid = profileIdByName(profilesAll, profile.name);
    if (!pid) return {};
    const now = new Date().toISOString();
    // 위치 공유를 끈 사람은 출근해도 위치를 받지 않는다
    const shareLoc = profilesAll.find((p) => p.id === pid)?.share_location !== false;
    const wantLoc = (kind === "in" || kind === "relocate") && shareLoc;
    const here = wantLoc ? await getPositionOnce() : null;

    // 위치만 다시 받기인데 실패하면 아무것도 저장하지 않는다
    if (kind === "relocate" && !here) return { locFailed: true };

    const patch = kind === "relocate"
      ? { lat: here.lat, lng: here.lng, located_at: now }
      : kind === "in"
      ? { checked_in_at: now, status: null, ...(here ? { lat: here.lat, lng: here.lng, located_at: now } : {}) }
      : { checked_out_at: now, status: kind === "duty" ? "당직" : "퇴근" };

    const { data } = await supabase
      .from("attendances")
      .upsert({ profile_id: pid, work_date: TODAY_STR, ...patch }, { onConflict: "profile_id,work_date" })
      .select();
    const row = data?.[0];
    if (row) setAttendances((prev) => [...prev.filter((a) => a.id !== row.id), mapAttendance(row)]);
    // 출근 GPS를 받았으면 마지막 위치도 갱신 (배정 기준)
    if (here && (kind === "in" || kind === "relocate")) updateLastLocation(pid, here.lat, here.lng, "출근");
    return { locFailed: wantLoc && !here };
  }

  // ---------- 당직·숙직 근무표 ----------
  // 자동 배정: 기사 순번(profiles.duty_order)을 하루 2칸(숙직→당직)씩 끊어 순환한다.
  // 직전 배정이 있으면 그 순번 다음부터 이어받아 달이 바뀌어도 순환이 끊기지 않는다.
  async function handleGenerateDuty(ym, mode = "주5일") {
    // 선택한 근무제(주5일·주4일)에 속하면서 순번이 있는 사람만 순환에 넣는다 — 인사관리에서 관리
    const roster = engineers
      .filter((e) => e.duty_order != null && (e.duty_modes ?? []).includes(mode))
      .sort((a, b) => a.duty_order - b.duty_order);
    if (!roster.length) { alert(`${mode} 근무제 대상자가 없습니다. 관리자 콘솔 → 인사관리에서 순번과 근무제를 지정하세요.`); return; }
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const first = `${ym}-01`;

    // 이 달 직전에 배정된 마지막 칸의 순번 위치를 찾아 이어붙인다.
    const { data: prevRows } = await supabase
      .from("duty_schedules").select("*").lt("duty_date", first)
      .order("duty_date", { ascending: false }).order("kind").limit(1);
    const prevPid = prevRows?.[0]?.profile_id;
    let cursor = prevPid ? roster.findIndex((e) => e.id === prevPid) : -1;
    const next = () => { cursor = (cursor + 1) % roster.length; return roster[cursor].id; };

    const existing = new Set(dutySchedules.filter((d) => d.dutyDate.startsWith(ym)).map((d) => `${d.dutyDate}|${d.kind}`));
    const rows = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${ym}-${String(d).padStart(2, "0")}`;
      for (const kind of ["숙직", "당직"]) {
        const pid = next(); // 빈 칸만 채우더라도 순번은 계속 돌려 배열을 유지한다
        if (existing.has(`${iso}|${kind}`)) continue;
        rows.push({ duty_date: iso, kind, profile_id: pid });
      }
      // 주4일 근무제는 금요일에 정상근무 칸을 하나 더 만든다. 순번 순환과 무관한 자리라
      // 담당자는 비워두고 관리자가 달력에서 지정한다 (실제 표에서도 순번 없는 직원이 들어감).
      if (mode === "주4일" && new Date(`${iso}T00:00:00`).getDay() === 5 && !existing.has(`${iso}|정상근무`)) {
        rows.push({ duty_date: iso, kind: "정상근무", profile_id: null });
      }
    }
    if (!rows.length) return;
    const { data } = await supabase.from("duty_schedules").upsert(rows, { onConflict: "duty_date,kind" }).select();
    const mapped = (data ?? []).map(mapDutySchedule);
    setDutySchedules((prev) => [...prev.filter((p) => !mapped.some((n) => n.id === p.id)), ...mapped].sort((a, b) => a.dutyDate.localeCompare(b.dutyDate)));
  }

  async function handleSetDutyPerson(iso, kind, profileId) {
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
    await supabase.from("duty_swaps")
      .update({ status: decision, responded_at: new Date().toISOString(), target_seen: true })
      .eq("id", swap.id);
    setDutySwaps((prev) => prev.map((w) => (w.id === swap.id ? { ...w, status: decision, targetSeen: true } : w)));
    if (decision !== "수락") {
      sendPush("duty_swap_result", [swap.requesterId], {
        title: "교환이 거절됐습니다",
        body: `${profile.name}님이 근무 교환 요청을 거절했습니다`,
      });
      return;
    }
    // 교환: 두 칸 맞바꿈 / 넘기기: from 주인=넘겨받은 사람(target) / 대신서기: from 주인=요청자(requester)
    if (swap.kind === "교환") {
      await Promise.all([
        supabase.from("duty_schedules").update({ profile_id: swap.targetId }).eq("id", swap.fromScheduleId),
        supabase.from("duty_schedules").update({ profile_id: swap.requesterId }).eq("id", swap.toScheduleId),
      ]);
      setDutySchedules((prev) => prev.map((d) =>
        d.id === swap.fromScheduleId ? { ...d, profileId: swap.targetId }
          : d.id === swap.toScheduleId ? { ...d, profileId: swap.requesterId } : d
      ));
    } else {
      const newOwner = swap.kind === "넘기기" ? swap.targetId : swap.requesterId;
      await supabase.from("duty_schedules").update({ profile_id: newOwner }).eq("id", swap.fromScheduleId);
      setDutySchedules((prev) => prev.map((d) => (d.id === swap.fromScheduleId ? { ...d, profileId: newOwner } : d)));
    }
    sendPush("duty_swap_result", [swap.requesterId], {
      title: swap.kind === "교환" ? "교환이 성사됐습니다" : "근무 요청이 수락됐습니다",
      body: `${profile.name}님이 수락했습니다`,
    });
  }

  // 교환 알림 팝업을 확인하면 다시 뜨지 않도록 표시한다 (우리방에는 아무것도 올리지 않는다)
  async function handleSeenDutySwap(swap, as) {
    const patch = as === "requester" ? { requester_seen: true } : { target_seen: true };
    await supabase.from("duty_swaps").update(patch).eq("id", swap.id);
    setDutySwaps((prev) => prev.map((w) => (w.id === swap.id
      ? { ...w, ...(as === "requester" ? { requesterSeen: true } : { targetSeen: true }) } : w)));
  }

  function handleLogout() {
    supabase.auth.signOut();
  }

  // 로그인이 완료된 뒤에만 Supabase에서 실제 데이터를 불러옵니다.
  // (예전에는 INITIAL_FAILURES 같은 가짜 배열로 시작했지만, 이제는 DB가 기준입니다)
  useEffect(() => {
    if (!skipLogin && !session) return;
    async function loadData() {
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
        supabase.from("kit_stock").select("*"),
        supabase.from("self_checks").select("*"),
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
    }
    loadData();
  }, [session, skipLogin]);

  // 새 글·근무 교환 감지 — 30초 폴링 (작은 팀이라 실시간 구독 대신 단순하게)
  // 교환은 상대가 수락하면 근무표 자체가 바뀌므로 duty_schedules도 같이 받는다.
  useEffect(() => {
    if (!skipLogin && !session) return;
    const t = setInterval(async () => {
      const [feedRes, swapRes, dutyRes] = await Promise.all([
        supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
        supabase.from("duty_swaps").select("*"),
        supabase.from("duty_schedules").select("*").gte("duty_date", TODAY_STR.slice(0, 8) + "01").order("duty_date"),
      ]);
      if (feedRes.data) setFeed(feedRes.data.map(mapFeedPost));
      if (swapRes.data) setDutySwaps(swapRes.data.map(mapDutySwap));
      if (dutyRes.data) setDutySchedules(dutyRes.data.map(mapDutySchedule));
    }, 30000);
    return () => clearInterval(t);
  }, [session, skipLogin]);

  // 우리방을 보는 순간(플로팅 시트든 탭이든, 보는 동안 새 글이 와도) 읽음 처리
  useEffect(() => {
    if ((!roomOpen && tab !== "room") || !profile) return;
    const now = new Date().toISOString();
    setFeedReadAt(now);
    const pid = profileIdByName(profilesAll, profile.name);
    if (pid) supabase.from("profiles").update({ feed_read_at: now }).eq("id", pid);
  }, [roomOpen, tab, feed.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // v2 마이그레이션이 실행된 DB인지 (units 존재 여부로 판단).
  // 마이그레이션 전 DB에 새 컬럼을 보내면 insert 전체가 실패하므로 반드시 이 가드를 통과해야 한다.
  const v2Ready = units.length > 0;

  // ★ 관리자가 현장관리 메뉴에서 현장을 새로 등록
  async function handleAddSite(form) {
    const newSite = {
      id: "site-" + Date.now(),
      siteCode: form.siteCode,
      name: form.name,
      elevatorNo: form.elevatorNo,
      address: form.address,
      region: form.region,
      contractType: form.contractType,
      phone: form.phone,
      elevatorModel: form.elevatorModel,
      unitCount: Number(form.unitCount) || 1,
      manager: form.manager,
      managerPhone: form.managerPhone,
      overdueLong: 0,
      overdueTotal: 0,
      failures30d: 0,
      assignedEngineer: form.assignedEngineer || null,
      notes: null,
      govElevatorNos: (form.govElevatorNos ?? []).map((v) => v || null),
    };
    await supabase.from("sites").insert({
      id: newSite.id,
      site_code: newSite.siteCode || null,
      name: newSite.name,
      elevator_no: newSite.elevatorNo,
      address: newSite.address,
      region: newSite.region,
      contract_type: newSite.contractType,
      phone: newSite.phone,
      elevator_model: newSite.elevatorModel,
      unit_count: newSite.unitCount,
      manager: newSite.manager,
      manager_phone: newSite.managerPhone,
      assigned_engineer: newSite.assignedEngineer,
      gov_elevator_nos: newSite.govElevatorNos,
    });
    setSites((prev) => [...prev, newSite]);
    // v2 듀얼라이트: 호기(units) 생성 + 담당기사 배정 (마이그레이션 전 DB에서는 조용히 무시됨)
    const unitRows = Array.from({ length: newSite.unitCount }, (_, i) => ({
      site_id: newSite.id,
      seq: i + 1,
      unit_no: `${i + 1}호기`,
      model: newSite.elevatorModel || null,
      gov_no: newSite.govElevatorNos[i] || null,
    }));
    const { data: createdUnits } = await supabase.from("units").insert(unitRows).select();
    if (createdUnits) setUnits((prev) => [...prev, ...createdUnits.map(mapUnit)]);
    const leadId = profileIdByName(profilesAll, newSite.assignedEngineer);
    if (leadId) await supabase.from("site_assignments").insert({ site_id: newSite.id, tech_id: leadId, is_lead: true });
  }

  // ★ 관리자가 현장관리 메뉴에서 현장 정보(담당 기사 배정 포함)를 수정
  async function handleUpdateSite(siteId, form) {
    await supabase
      .from("sites")
      .update({
        site_code: form.siteCode || null,
        name: form.name,
        elevator_no: form.elevatorNo,
        address: form.address,
        region: form.region,
        contract_type: form.contractType,
        phone: form.phone,
        elevator_model: form.elevatorModel,
        unit_count: Number(form.unitCount) || 1,
        manager: form.manager,
        manager_phone: form.managerPhone,
        assigned_engineer: form.assignedEngineer || null,
        gov_elevator_nos: (form.govElevatorNos ?? []).map((v) => v || null),
      })
      .eq("id", siteId);
    setSites((prev) =>
      prev.map((s) =>
        s.id === siteId
          ? {
              ...s,
              siteCode: form.siteCode,
              name: form.name,
              elevatorNo: form.elevatorNo,
              address: form.address,
              region: form.region,
              contractType: form.contractType,
              phone: form.phone,
              elevatorModel: form.elevatorModel,
              unitCount: Number(form.unitCount) || 1,
              manager: form.manager,
              managerPhone: form.managerPhone,
              assignedEngineer: form.assignedEngineer || null,
              govElevatorNos: (form.govElevatorNos ?? []).map((v) => v || null),
            }
          : s
      )
    );
    // v2 듀얼라이트: units 동기화 — 없는 호기 생성, gov_no 갱신, 초과분 비활성.
    // 호기별 모델은 여기서 덮어쓰지 않는다 (신규 생성 시에만 현장 공통 모델을 시드).
    const count = Number(form.unitCount) || 1;
    const govNos = (form.govElevatorNos ?? []).map((v) => v || null);
    await supabase.from("units").upsert(
      Array.from({ length: count }, (_, i) => ({
        site_id: siteId, seq: i + 1, unit_no: `${i + 1}호기`,
        model: form.elevatorModel || null, gov_no: govNos[i],
      })),
      { onConflict: "site_id,seq", ignoreDuplicates: true }
    );
    for (let i = 0; i < count; i++) {
      await supabase.from("units").update({ gov_no: govNos[i], is_active: true }).eq("site_id", siteId).eq("seq", i + 1);
    }
    await supabase.from("units").update({ is_active: false }).eq("site_id", siteId).gt("seq", count);
    const { data: freshUnits } = await supabase.from("units").select("*").eq("site_id", siteId).order("seq");
    if (freshUnits) setUnits((prev) => [...prev.filter((u) => u.siteId !== siteId), ...freshUnits.map(mapUnit)]);
    await supabase.from("site_assignments").delete().eq("site_id", siteId);
    const leadId = profileIdByName(profilesAll, form.assignedEngineer);
    if (leadId) await supabase.from("site_assignments").insert({ site_id: siteId, tech_id: leadId, is_lead: true });
  }

  // ★ 관리자가 현장관리 메뉴에서 현장을 삭제
  async function handleDeleteSite(siteId) {
    await supabase.from("sites").delete().eq("id", siteId);
    setSites((prev) => prev.filter((s) => s.id !== siteId));
  }

  // ★ 기사·관리자 누구나 현장정보의 "비고(전달사항)"을 수정
  async function handleUpdateSiteNotes(siteId, notes) {
    await supabase.from("sites").update({ notes }).eq("id", siteId);
    setSites((prev) => prev.map((s) => (s.id === siteId ? { ...s, notes } : s)));
  }

  // ★ 관리자가 현장구성에서 담당자(보수업체 담당자)를 추가
  async function handleAddSiteManager(siteId, form) {
    const newManager = { id: "sm-" + Date.now(), siteId, name: form.name, phone: form.phone, email: form.email, fax: form.fax };
    await supabase.from("site_managers").insert({
      id: newManager.id,
      site_id: siteId,
      name: newManager.name,
      phone: newManager.phone,
      email: newManager.email,
      fax: newManager.fax,
    });
    setSiteManagers((prev) => [...prev, newManager]);
  }

  // ★ 관리자가 현장구성에서 담당자 정보를 수정
  async function handleUpdateSiteManager(managerId, form) {
    await supabase
      .from("site_managers")
      .update({ name: form.name, phone: form.phone, email: form.email, fax: form.fax })
      .eq("id", managerId);
    setSiteManagers((prev) => prev.map((m) => (m.id === managerId ? { ...m, ...form } : m)));
  }

  // ★ 관리자가 현장구성에서 담당자를 삭제
  async function handleDeleteSiteManager(managerId) {
    await supabase.from("site_managers").delete().eq("id", managerId);
    setSiteManagers((prev) => prev.filter((m) => m.id !== managerId));
  }

  // ★ 관리자가 기사관리에서 기사 개인의 전화번호/메일주소를 입력
  async function handleUpdateEngineerContact(engineerId, { phone, email }) {
    await supabase.from("profiles").update({ phone, email }).eq("id", engineerId);
    setEngineers((prev) => prev.map((e) => (e.id === engineerId ? { ...e, phone, email } : e)));
  }

  // ★ 고장 출동 응답/내가 출동하기 → ETA 확정 (홈, 고장접수 탭 공용)
  function notifyFailure(message) {
    setFailureToast(message);
    setTimeout(() => setFailureToast(""), 3000);
  }

  // ★ 관리자가 미배정 고장에 기사 배정 — 출동 시작은 기사가 "출동 응답"으로
  async function handleAssignFailure(failure, engineerName) {
    const assignedId = profileIdByName(profilesAll, engineerName);
    const { data: ok } = await supabase.from("failures")
      .update({ assignee: engineerName, ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, engineerName) } : {}) })
      .eq("id", failure.id).eq("status", "미처리").is("assignee", null)
      .select();
    if (!ok?.length) { alert("이미 배정되었거나 진행 중인 건입니다."); return; }
    setFailures((prev) => prev.map((x) => (x.id === failure.id ? { ...x, assignee: engineerName } : x)));
    sendPush("failure_assigned", [assignedId], {
      title: "고장이 배정되었습니다",
      body: `${failure.siteName} · ${formatUnitLabel(failure.elevatorNo) || "호기 미상"} — ${parseErrorCode(failure.errorCode).faultType}`,
    });
    notifyFailure(`${engineerName}에게 배정 완료`);
  }

  // ★ 관리자 재배정 — 잘못 배정·중복 출동 정정용. 진행 상태를 미처리로 되돌리고 새 기사(또는 미배정)로
  async function handleReassignFailure(failure, engineerName) {
    const { data: ok } = await supabase.from("failures")
      .update({
        assignee: engineerName || null,
        dispatched_at: null,
        eta_minutes: null,
        arrival_time: null,
        status: "미처리",
        ...(v2Ready ? { assignee_id: engineerName ? profileIdByName(profilesAll, engineerName) : null } : {}),
      })
      .eq("id", failure.id).neq("status", "완료")
      .select();
    if (!ok?.length) { alert("이미 완료된 건은 재배정할 수 없습니다."); return; }
    setFailures((prev) => prev.map((x) => (x.id === failure.id
      ? { ...x, assignee: engineerName || null, dispatchedAt: null, etaMinutes: null, arrivalTime: null, status: "미처리" }
      : x)));
    notifyFailure(engineerName ? `${engineerName}(으)로 재배정 완료` : "미배정으로 되돌림");
  }

  // ★ 출동 거부 — 배정 해제(미배정 환원) + 우리방에 관리자 멘션 알림 (동시 2건 배정 등 못 가는 상황용)
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
    const reason = window.prompt("출동을 거부하고 미배정으로 돌립니다.\n사유를 입력하세요 (선택)");
    if (reason === null) return; // 취소
    // 출동 후 취소도 지원 — 출동 기록을 초기화하고 미처리·미배정으로 되돌린다 (완료 건은 불가)
    const { data: ok } = await supabase.from("failures")
      .update({
        assignee: null, dispatched_at: null, eta_minutes: null, arrival_time: null, status: "미처리",
        ...(v2Ready ? { assignee_id: null } : {}),
      })
      .eq("id", failure.id).neq("status", "완료")
      .select();
    if (!ok?.length) { alert("이미 완료 처리된 건입니다."); return; }
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
    const { data: claimed } = await claim.select();
    if (!claimed?.length) {
      const { data: fresh } = await supabase.from("failures").select("*").eq("id", failure.id).single();
      if (fresh) setFailures((prev) => prev.map((x) => (x.id === failure.id ? mapFailure(fresh) : x)));
      alert(`이미 ${fresh?.assignee ?? "다른 기사"}님이 먼저 출동한 건입니다.`);
      return;
    }
    setFailures((prev) =>
      prev.map((x) => (x.id === failure.id ? { ...x, assignee, dispatchedAt, etaMinutes, status: "진행중" } : x))
    );
    // 출동 응답 = "지금 여기서 출발" → 출발 시점 GPS로 마지막 위치 갱신 (위치 공유 켠 사람만).
    // 출동 처리를 지연시키지 않도록 백그라운드로 받는다(await 안 함).
    const selfPid = profileIdByName(profilesAll, profile.name);
    if (selfPid && profilesAll.find((p) => p.id === selfPid)?.share_location !== false) {
      getPositionOnce().then((here) => { if (here) updateLastLocation(selfPid, here.lat, here.lng, "출동 출발"); });
    }
    simulateSms(failure.reporterPhone, `구일엘리베이터입니다. 담당 기사가 약 ${etaMinutes}분 후 도착 예정입니다.`);
    notifyFailure(`문자 발송 완료 · ${failure.reporterPhone || "신고자"}에게 도착예정시간 안내`);
    setFocusSiteId(failure.siteId);
    setFocusUnit(failure.elevatorNo || null);
    setTab("sites");
  }

  async function handleArriveFailure(failure, arrivalTime) {
    await supabase.from("failures").update({ arrival_time: arrivalTime }).eq("id", failure.id);
    setFailures((prev) => prev.map((x) => (x.id === failure.id ? { ...x, arrivalTime } : x)));
    markAtSite(failure, "도착"); // 도착 = 그 현장에 있음 → 마지막 위치 갱신
  }

  async function handleFailureResult(failure, payload) {
    const { result, symptom, errorCode, cause, processContent, note, photoCount, photoUrls } = payload;
    const isClosed = result === "처리완료" || result === "오신고";
    if (result === "처리완료") markAtSite(failure, "처리완료"); // 완료한 그 현장 = 마지막 위치
    const escalation = result === "처리완료" ? null : result;
    await supabase
      .from("failures")
      .update({
        status: isClosed ? "완료" : failure.status,
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
      .eq("id", failure.id);
    setFailures((prev) =>
      prev.map((x) =>
        x.id === failure.id
          ? {
              ...x,
              status: isClosed ? "완료" : x.status,
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
  }

  async function handleSubmitBilling({ type, siteName, elevatorNo, part, cost, replaceDate, contactPhone, beforePhotoUrls, afterPhotoUrls, confirmPhotoUrl, siteId, unitId, materialRequestId }) {
    // v2: 호기 확정 — 직접 전달받거나(자재건), siteId 또는 유일한 현장명으로 찾는다
    const billSite = siteId
      ? sites.find((x) => x.id === siteId)
      : sites.filter((x) => x.name === siteName).length === 1
        ? sites.find((x) => x.name === siteName)
        : null;
    const billUnitId = unitId ?? (billSite ? unitIdFor(units, billSite.id, elevatorNo) : null);
    const newBilling = {
      id: "bill-" + Date.now(),
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
    await supabase.from("billings").insert({
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
    setBillings((prev) => [newBilling, ...prev]);
  }

  // ★ 우리방 피드에 새 글 등록 (extra: photoUrls 첨부, replyToId 답장)
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
    await supabase.from("feed_posts").insert({
      id: newPost.id,
      author: newPost.author,
      body: newPost.text,
      photo_urls: newPost.photoUrls.length ? newPost.photoUrls : null,
      reply_to_id: newPost.replyToId,
      ...(v2Ready ? { author_id: profileIdByName(profilesAll, newPost.author) } : {}),
      ...(feedNoticeReady ? { is_notice: newPost.isNotice } : {}),
    });
    setFeed((prev) => [...prev, newPost]);
  }

  // ★ 우리방 좋아요 토글
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

  // ★ 우리방 글 수정 (본인 글만 — RoomTab에서 작성자 확인 후 호출)
  async function handleUpdateFeedPost(postId, text) {
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, text } : p)));
    await supabase.from("feed_posts").update({ body: text }).eq("id", postId);
  }

  // ★ 우리방 글 삭제 — 그 글의 댓글도 함께 삭제
  async function handleDeleteFeedPost(postId) {
    setFeed((prev) => prev.filter((p) => p.id !== postId && p.replyToId !== postId));
    await supabase.from("feed_posts").delete().eq("reply_to_id", postId);
    await supabase.from("feed_posts").delete().eq("id", postId);
  }

  // ★ 우리방 공지 등록/해제 — is_notice 컬럼 없으면(마이그레이션 전) 조용히 건너뜀
  async function handleSetFeedNotice(postId, isNotice) {
    if (!feedNoticeReady) return;
    setFeed((prev) => prev.map((p) => (p.id === postId ? { ...p, isNotice } : p)));
    await supabase.from("feed_posts").update({ is_notice: isNotice }).eq("id", postId);
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
  async function handleSupplyComplete(requestId, assignee, billingPart, billingAmount) {
    const req = materialRequests.find((r) => r.id === requestId);
    if (!req) return;

    await supabase
      .from("material_requests")
      .update({ status: "지급완료", supplied_date: TODAY_STR })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "지급완료", suppliedDate: TODAY_STR } : r))
    );

    const newTodo = {
      id: "todo-" + requestId,
      materialRequestId: requestId,
      source: "material",
      title: `${req.siteName} ${req.part} 교체 및 확인서 제출`,
      siteName: req.siteName,
      elevatorNo: req.elevatorNo,
      part: req.part,
      assignee: assignee || req.engineer,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
      billingPart: billingPart || null,
      billingAmount: billingAmount || null,
    };
    await supabase.from("todos").insert({
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
      ...(v2Ready ? {
        unit_id: req.unitId ?? unitIdFor(units, req.siteId, req.elevatorNo),
        assignee_id: profileIdByName(profilesAll, newTodo.assignee),
      } : {}),
      ...(todoBillingReady ? { billing_part: newTodo.billingPart, billing_amount: newTodo.billingAmount } : {}),
    });
    setTodos((prev) => [newTodo, ...prev]);
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

    if (kitStockReady && engineerId) {
      const key = `${engineerId}|${part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = Math.max(0, currentQty - usedQty);
      kitStockRef.current[key] = newQty;
      await supabase.from("kit_stock").upsert({ engineer_id: engineerId, part, qty: newQty }, { onConflict: "engineer_id,part" });
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
    const receivedAt = new Date().toISOString();
    await supabase.from("restock_requests").update({ received_at: receivedAt }).eq("id", restockId);
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, receivedAt } : r)));

    if (kitStockReady && restock.engineerId) {
      const key = `${restock.engineerId}|${restock.part}`;
      const currentQty = kitStockRef.current[key] ?? 0;
      const newQty = currentQty + (restock.quantity || 1);
      kitStockRef.current[key] = newQty;
      await supabase.from("kit_stock").upsert({ engineer_id: restock.engineerId, part: restock.part, qty: newQty }, { onConflict: "engineer_id,part" });
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
  }

  // ★ 견적 진행 단계 전진: 요청접수 → 견적발행 → 승인 (사진 불필요)
  async function handleAdvanceQuote(quoteId) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    if (q.status === "요청접수") {
      await supabase.from("quote_requests").update({ status: "견적발행", quote_issued_date: TODAY_STR }).eq("id", quoteId);
    } else if (q.status === "견적발행") {
      await supabase.from("quote_requests").update({ status: "승인", approved_date: TODAY_STR }).eq("id", quoteId);
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
  async function handleCompleteQuoteSupply(quoteId, assignees) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q) return;
    const finalAssignees = assignees?.length ? assignees : [q.engineer];

    await supabase.from("quote_requests").update({ status: "자재지급완료", supplied_date: TODAY_STR }).eq("id", quoteId);
    setQuoteRequests((prev) =>
      prev.map((x) => (x.id === quoteId ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR } : x))
    );

    const newTodos = finalAssignees.map((assignee, idx) => ({
      id: `todo-quote-${quoteId}-${idx}`,
      materialRequestId: null,
      quoteRequestId: quoteId,
      source: "quote",
      title: `${q.siteName} ${q.constructionType} 시공 확인 및 서류 제출`,
      siteName: q.siteName,
      elevatorNo: q.elevatorNo,
      part: q.constructionType,
      assignee,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
    }));
    await supabase.from("todos").insert(
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
        ...(v2Ready ? {
          unit_id: q.unitId ?? unitIdFor(units, q.siteId, q.elevatorNo),
          assignee_id: profileIdByName(profilesAll, t.assignee),
        } : {}),
      }))
    );
    setTodos((prev) => [...newTodos, ...prev]);
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
    await supabase.from("todos").insert(
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
        ...(v2Ready ? { assignee_id: profileIdByName(profilesAll, t.assignee) } : {}),
      }))
    );
    setTodos((prev) => [...newTodos, ...prev]);
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
    await supabase.from("todos").update({ assignee: newAssignee }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, assignee: newAssignee } : t)));
  }

  // ★ 관리자가 할 일에 설명(내용)을 추가/수정합니다.
  async function handleUpdateTodoDescription(todoId, description) {
    await supabase.from("todos").update({ description }).eq("id", todoId);
    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, description } : t)));
  }

  // ★ 기사 반려: 잘못된 자재가 지급된 경우. 연결된 할 일은 취소되고 담당자에게 재지급 알림이 전달됩니다.
  async function handleReject(requestId, reason) {
    await supabase
      .from("material_requests")
      .update({ status: "반려", reject_reason: reason, rejected_date: TODAY_STR })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: "반려", rejectReason: reason, rejectedDate: TODAY_STR } : r))
    );

    const todoIdsToRemove = todos.filter((t) => t.materialRequestId === requestId && !t.done).map((t) => t.id);
    if (todoIdsToRemove.length > 0) {
      await supabase.from("todos").delete().in("id", todoIdsToRemove);
    }
    setTodos((prev) => prev.filter((t) => !(t.materialRequestId === requestId && !t.done)));
  }

  // 관리자가 반려 건을 재확인하고 다시 '지급 대기' 목록으로 돌려보냅니다.
  async function handleReprocess(requestId) {
    await supabase
      .from("material_requests")
      .update({ status: "승인대기", supplied_date: null, reject_reason: null, rejected_date: null, has_supply_photo: false })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "승인대기", suppliedDate: null, rejectReason: null, rejectedDate: null, hasSupplyPhoto: false }
          : r
      )
    );
  }

  const tabTitle = TABS.find((t) => t.id === tab)?.label ?? "";
  const visibleTabs = TABS.filter((t) => t.id !== "admin" || profile?.role === "admin");

  // 우리방 안읽음/멘션 — 세션 로컬 읽음 시각이 있으면 그걸, 없으면 DB(profiles.feed_read_at) 기준
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
  // 게시판 알림은 글 하나를 눌러도(팝업으로만 확인) feedReadAt 전체읽음은 건드리지 않고, 그 글만 지운 것으로 처리한다
  // — 그래야 나머지 안읽은 글 알림이 같이 사라지지 않는다.
  const notifPosts = unreadPosts.filter((p) => !dismissedIds.has("post:" + p.id));
  const totalNotifCnt = notifPosts.length + notifFailures.length + notifCompletedFailures.length + notifTodos.length + notifSupplyCnt;

  if (!skipLogin && session === undefined) {
    return (
      <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-bold text-slate-400">로그인 확인 중...</p>
      </div>
    );
  }

  if (!skipLogin && !session) {
    return <LoginScreen onLogin={handleLogin} error={authError} submitting={authSubmitting} demo={SKIP_LOGIN} />;
  }

  if (loading || !profile) {
    return (
      <div className="h-dvh w-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-bold text-slate-400">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ name: profile.name, role: profile.role, engineerNames, engineers, profiles: profilesAll, selfId: profileIdByName(profilesAll, profile.name), signOut: handleLogout }}>
    <SitesContext.Provider value={sites}>
    <UnitsContext.Provider value={units}>
      <div className="h-dvh w-screen bg-slate-50 flex flex-col overflow-hidden relative">
          <ScreenHeader
            title={tab === "home" ? "구일엘리베이터(주)" : tabTitle}
            right={
              <div className="relative flex items-center gap-1.5">
                <button onClick={() => setMyPageOpen(true)} className="p-1.5 bg-blue-900 rounded-full" aria-label="마이페이지">
                  <UserRound size={16} />
                </button>
                <button onClick={() => setNotifOpen((v) => !v)} className="relative p-1.5 bg-blue-900 rounded-full" aria-label="알림">
                  <Bell size={16} />
                  {totalNotifCnt > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-blue-950">
                      {totalNotifCnt > 99 ? "99+" : totalNotifCnt}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
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
                                  onClick={() => { setNotifOpen(false); setOpenTodoId(t.id); }}
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
                          {notifPosts.length > 0 && (
                            <div>
                              <p className="px-4 pt-2.5 pb-1 text-[10px] font-bold text-slate-400">게시판</p>
                              {[...notifPosts].reverse().map((p) => (
                                <div key={p.id} className="flex items-center border-b border-slate-50 last:border-0 active:bg-slate-50">
                                  <button
                                    onClick={() => { setNotifOpen(false); setOpenFeedPostId(p.id); handleDismissNotif("post:" + p.id); }}
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
                  </>
                )}
              </div>
            }
          />

          <DutySwapNotice
            swaps={dutySwaps}
            schedules={dutySchedules}
            onSeen={(w, as) => { handleSeenDutySwap(w, as); if (as === "target") setRosterOpen(true); }}
          />

          {myPageOpen && (
            <MyPage attendances={attendances} dutySchedules={dutySchedules} onClose={() => setMyPageOpen(false)} />
          )}

          {rosterOpen && (
            <DutyRoster
              schedules={dutySchedules}
              swaps={dutySwaps}
              onGenerate={handleGenerateDuty}
              onSetPerson={handleSetDutyPerson}
              onRequestSwap={handleRequestDutySwap}
              onRespondSwap={handleRespondDutySwap}
              onClose={() => setRosterOpen(false)}
            />
          )}

          {tab === "home" && (
            <HomeTab
              attendances={attendances}
              todayLeaves={todayLeaves}
              onAttendance={handleAttendance}
              onOpenRoster={() => setRosterOpen(true)}
              onSendPost={handleSendFeedPost}
              swapCount={dutySwaps.filter((w) => w.status === "대기" && w.targetId === profileIdByName(profilesAll, profile.name)).length}
              inspections={inspections}
              failures={failures}
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
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} siteManagers={siteManagers} onUpdateSiteNotes={handleUpdateSiteNotes} focusSiteId={focusSiteId} focusUnit={focusUnit} onFocusSiteHandled={() => { setFocusSiteId(null); setFocusUnit(null); }} />}
          {tab === "failure" && (
            <FailureTab
              onReported={handleFailureReported}
              attendances={attendances}
              todayLeaves={todayLeaves}
              failures={failures}
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
          {tab === "checkup" && <CheckupTab selfChecks={selfChecks} setSelfChecks={setSelfChecks} siteManagers={siteManagers} profilesAll={profilesAll} />}
          {tab === "inspection" && <InspectionTab inspections={inspections} />}
          {tab === "material" && <MaterialTab requests={materialRequests} setRequests={setMaterialRequests} todos={todos} onReject={handleReject} quoteRequests={quoteRequests} setQuoteRequests={setQuoteRequests} restockRequests={restockRequests} kitStock={kitStock} onReceiveRestock={handleReceiveRestock} />}
          {tab === "billing" && <BillingTab todos={todos} setTodos={setTodos} onSubmitBilling={handleSubmitBilling} onUseKitPart={handleUseKitPart} />}
          {tab === "todo" && (
            <TodoTab
              todos={todos}
              setTodos={setTodos}
              onReassignTodo={handleReassignTodo}
              onUpdateTodoDescription={handleUpdateTodoDescription}
              materialRequests={materialRequests}
              quoteRequests={quoteRequests}
            />
          )}
          {tab === "room" && <RoomTab
                  feed={feed}
                  onSendChat={handleSendFeedPost}
                  onToggleLike={handleToggleLike}
                  onUpdatePost={handleUpdateFeedPost}
                  onDeletePost={handleDeleteFeedPost}
                  onSetNotice={feedNoticeReady ? handleSetFeedNotice : null}
                />}
          {tab === "admin" && profile.role === "admin" && <AdminTab inspections={inspections} materialRequests={materialRequests} billings={billings} quoteRequests={quoteRequests} restockRequests={restockRequests} todos={todos} onSupplyComplete={handleSupplyComplete} onReprocess={handleReprocess} onAttachPhoto={handleAttachPhoto} onRemoveSupplyPhoto={handleRemoveSupplyPhoto} onAssignTodo={handleAssignTodo} onAdvanceQuote={handleAdvanceQuote} onAttachQuotePhoto={handleAttachQuotePhoto} onRemoveQuoteSupplyPhoto={handleRemoveQuoteSupplyPhoto} onCompleteQuoteSupply={handleCompleteQuoteSupply} onAdminToggleTodo={handleAdminToggleTodo} onAttachRestockPhoto={handleAttachRestockPhoto} onRemoveRestockSupplyPhoto={handleRemoveRestockSupplyPhoto} onCompleteRestock={handleCompleteRestock} onReassignTodo={handleReassignTodo} onUpdateTodoDescription={handleUpdateTodoDescription} onAddSite={handleAddSite} onUpdateSite={handleUpdateSite} onDeleteSite={handleDeleteSite} siteManagers={siteManagers} onAddSiteManager={handleAddSiteManager} onUpdateSiteManager={handleUpdateSiteManager} onDeleteSiteManager={handleDeleteSiteManager} onUpdateEngineerContact={handleUpdateEngineerContact} />}

          {/* 우리방 플로팅 버튼 — 어느 탭에서든 즉시 팀 채팅 (우리방 탭에서는 숨김) */}
          {tab !== "room" && (
          <button
            onClick={() => setRoomOpen(true)}
            aria-label="게시판 열기"
            className={`absolute right-4 z-20 w-12 h-12 rounded-full bg-blue-700 text-white shadow-lg flex items-center justify-center active:scale-95 ${tab === "failure" ? "bottom-36" : "bottom-20"}`}
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

          {/* 우리방 바텀시트 */}
          {roomOpen && (
            <div className="fixed inset-0 z-30 flex flex-col bg-black/40" onClick={() => setRoomOpen(false)}>
              <div className="mt-auto" />
              <div
                className="bg-slate-50 rounded-t-3xl h-[85%] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
                  <h2 className="font-bold text-slate-900">게시판</h2>
                  <button onClick={() => setRoomOpen(false)} className="p-1 text-slate-400 active:text-slate-700">
                    <X size={20} />
                  </button>
                </div>
                <RoomTab
                  feed={feed}
                  onSendChat={handleSendFeedPost}
                  onToggleLike={handleToggleLike}
                  onUpdatePost={handleUpdateFeedPost}
                  onDeletePost={handleDeleteFeedPost}
                  onSetNotice={feedNoticeReady ? handleSetFeedNotice : null}
                />
              </div>
            </div>
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
                onArrive={setNotifArriveTarget}
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
          {notifArriveTarget && (
            <ArrivalTimeModal
              failure={notifArriveTarget}
              onClose={() => setNotifArriveTarget(null)}
              onConfirm={(time) => { handleArriveFailure(notifArriveTarget, time); setNotifArriveTarget(null); }}
            />
          )}
          {notifResultTarget && (
            <ArrivalResultModal
              failure={notifResultTarget}
              onClose={() => setNotifResultTarget(null)}
              onConfirm={(result) => { handleFailureResult(notifResultTarget, result); setNotifResultTarget(null); }}
            />
          )}
          {openTodoId && (() => {
            const t = todos.find((x) => x.id === openTodoId);
            if (!t) return null;
            return (
              <TodoDetailSheet
                todo={t}
                requester={getRequesterName(t, materialRequests, quoteRequests)}
                coAssignees={getCoAssignees(t, todos)}
                supplyPhotoUrls={getSupplyPhotos(t, materialRequests, quoteRequests)}
                onToggle={t.source === "manual" && !t.done ? handleAdminToggleTodo : null}
                onReassign={handleReassignTodo}
                engineerNames={engineerNames}
                onUpdateDescription={profile.role === "admin" ? handleUpdateTodoDescription : null}
                onClose={() => setOpenTodoId(null)}
              />
            );
          })()}
          {openFeedPostId && (
            <PostDetailOverlay
              feed={feed}
              postId={openFeedPostId}
              onSendChat={handleSendFeedPost}
              onToggleLike={handleToggleLike}
              onUpdatePost={handleUpdateFeedPost}
              onDeletePost={handleDeleteFeedPost}
              onSetNotice={feedNoticeReady ? handleSetFeedNotice : null}
              onClose={() => setOpenFeedPostId(null)}
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
