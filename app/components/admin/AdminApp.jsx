"use client";

// PC 전용 관리자 페이지 셸 — 모바일 앱(ElevatorFieldApp)과 별개 화면.
// v2 스키마(units, *_id FK)를 기본으로 사용한다. 데이터는 이 셸이 한 번에 로드해
// 각 섹션에 props로 내린다 (모바일 App 셸과 같은 관례).
import { useState, useEffect } from "react";
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu , Bell, MessageSquare, BookOpen } from "lucide-react";
import { supabase, fetchAll, loginFailReason } from "@/lib/supabaseClient";
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck, mapSelfCheckItem, mapFeedPost, mapRestockRequest, mapErrorCode,
} from "@/lib/mappers";
import Dashboard from "@/app/components/admin/Dashboard";
import SitesAdmin from "@/app/components/admin/SitesAdmin";
import FailuresAdmin from "@/app/components/admin/FailuresAdmin";
import InspectionsAdmin from "@/app/components/admin/InspectionsAdmin";
import MaterialsAdmin from "@/app/components/admin/MaterialsAdmin";
import BillingsAdmin from "@/app/components/admin/BillingsAdmin";
import TodosAdmin from "@/app/components/admin/TodosAdmin";
import SelfChecksAdmin from "@/app/components/admin/SelfChecksAdmin";
import EngineersAdmin from "@/app/components/admin/EngineersAdmin";
import StatsAdmin from "@/app/components/admin/StatsAdmin";
import NotifySettings from "@/app/components/admin/NotifySettings";
import RoomAdmin from "@/app/components/admin/RoomAdmin";
import ErrorCodesAdmin from "@/app/components/admin/ErrorCodesAdmin";
import { ConfirmHost } from "@/app/components/ConfirmHost";
import { LoginScreen } from "@/app/components/LoginScreen";
import { PasswordChangeForm } from "@/app/components/PasswordChangeForm";
import { AdminAuthContext, useBackdropClose } from "@/app/components/admin/adminShared";
import { BrandSplash } from "@/app/components/ui";
import { pushSupported, pushPermission, enablePush, disablePush, isSubscribed } from "@/lib/push";

// 로그인 강제 스위치 — 모바일 앱과 동일. 기본 꺼짐(배포본은 지금처럼 열림), 로컬 .env.local에서 켠다.
const SKIP_LOGIN = process.env.NEXT_PUBLIC_SKIP_LOGIN !== "false";

const MENU = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "sites", label: "현장정보", icon: Building2 },
  { id: "failures", label: "고장관리", icon: AlertTriangle },
  { id: "errorCodes", label: "에러코드집", icon: BookOpen },
  { id: "inspections", label: "검사관리", icon: ShieldCheck },
  { id: "materials", label: "자재·견적 신청내역", icon: Package },
  { id: "billings", label: "부품교체·공사 내역", icon: Receipt },
  { id: "todos", label: "할 일 관리", icon: ListTodo },
  { id: "selfChecks", label: "자체점검 현황", icon: CalendarCheck },
  { id: "room", label: "게시판", icon: MessageSquare },
  { id: "engineers", label: "인사관리", icon: Users },
  { id: "stats", label: "통계", icon: BarChart3 },
  { id: "notify", label: "알림 설정", icon: Bell, superOnly: true },
];

export default function AdminApp() {
  const [menu, setMenu] = useState("dashboard");
  const [hrSub, setHrSub] = useState("직원"); // 인사관리 하위 탭 (대시보드에서 워크 캘린더·연차관리로 바로 진입)
  const [navOpen, setNavOpen] = useState(false); // 모바일 드로어
  // 대시보드 "오늘 처리할 것" 클릭 시 해당 화면의 하위 탭/필터를 미리 지정해 바로 그 목록이 보이게 한다.
  const [todosInitialView, setTodosInitialView] = useState("open");
  const [materialsInitialTab, setMaterialsInitialTab] = useState("all");
  const [failuresInitialStatus, setFailuresInitialStatus] = useState("all");
  const [selfChecksInitialView, setSelfChecksInitialView] = useState("progress");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], restockRequests: [], todos: [], billings: [],
    selfChecks: [], selfCheckItems: [], profiles: [], feed: [], errorCodes: [],
  });

  // ── 콘솔 로그인 (관리자만) ──
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState(null); // { id, name, role, adminTier, mustChange }
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // layout.js가 JS 뜨기 전 흰 화면 방지용으로 그려둔 정적 로고 스플래시를, 이 앱이 마운트되는
  // 즉시 치운다 — 아래 BrandSplash 로딩화면이 같은 로고를 이어서 보여주므로 깜빡임이 없다.
  useEffect(() => { document.getElementById("app-splash")?.remove(); }, []);

  useEffect(() => {
    if (SKIP_LOGIN) { setAuthChecked(true); return; }
    let alive = true;
    (async () => {
      try {
        const raw = localStorage.getItem("guilAuthV1");
        if (!raw) { if (alive) setAuthChecked(true); return; }
        const s = JSON.parse(raw);
        const { data } = await supabase.from("profiles").select("id,name,role,admin_tier,is_active,deleted_at").eq("id", s.id).single();
        if (!alive) return;
        if (data && data.role === "admin" && data.is_active !== false && !data.deleted_at) {
          setMe({ id: data.id, name: data.name, role: data.role, adminTier: data.admin_tier, mustChange: s.mustChange });
        }
      } catch { /* 무시 — 로그인 화면으로 */ }
      if (alive) setAuthChecked(true);
    })();
    return () => { alive = false; };
  }, []);

  async function handleAdminLogin(loginId, password) {
    setAuthSubmitting(true); setAuthError("");
    const { data, error } = await supabase.rpc("verify_login", { p_login_id: (loginId || "").trim(), p_password: password });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) { setAuthError(await loginFailReason(loginId)); setAuthSubmitting(false); return; }
    if (row.role !== "admin") { setAuthError("관리자만 접근할 수 있는 페이지입니다."); setAuthSubmitting(false); return; }
    const { data: p } = await supabase.from("profiles").select("admin_tier").eq("id", row.id).single();
    // 자재담당관리자는 모바일 앱 관리자 모드(자재출하관리·상비부품보충)만 쓰고 PC 콘솔은 못 들어온다 —
    // 기사가 role!=='admin'이라 못 들어오는 것과 같은 구조(로그인 성공 직후 클라이언트에서 차단).
    if (p?.admin_tier === "material") {
      setAuthError("이 계정은 PC 관리자 콘솔에 접근할 수 없습니다. 모바일 앱을 이용해주세요.");
      setAuthSubmitting(false);
      return;
    }
    localStorage.setItem("guilAuthV1", JSON.stringify({ id: row.id, name: row.name, role: row.role, mustChange: row.must_change }));
    setMe({ id: row.id, name: row.name, role: row.role, adminTier: p?.admin_tier, mustChange: row.must_change });
    setAuthSubmitting(false);
  }

  function adminLogout() { localStorage.removeItem("guilAuthV1"); setMe(null); }

  // 관리자 알림(연차 신청·계약 만료·출근 미체크 요약) 푸시 딥링크 — 모바일 App 셸의
  // checkOpenParams와 같은 패턴. 알림이 이미 떠 있는 창을 재사용(navigate)할 수도 있어
  // 마운트 시점 한 번만으론 못 잡고, 창이 다시 포커스/보임 상태가 될 때마다 다시 확인한다.
  useEffect(() => {
    function checkOpenParams() {
      const url = new URL(window.location.href);
      const openLeave = url.searchParams.get("openLeave");
      const openContract = url.searchParams.get("openContract");
      const openAttendanceReport = url.searchParams.get("openAttendanceReport");
      if (!openLeave && !openContract && !openAttendanceReport) return;
      if (openLeave) { setHrSub("연차관리"); setMenu("engineers"); }
      if (openContract) setMenu("sites");
      if (openAttendanceReport) setMenu("dashboard");
      url.searchParams.delete("openLeave");
      url.searchParams.delete("openContract");
      url.searchParams.delete("openAttendanceReport");
      window.history.replaceState({}, "", url);
    }
    checkOpenParams();
    window.addEventListener("focus", checkOpenParams);
    document.addEventListener("visibilitychange", checkOpenParams);
    return () => {
      window.removeEventListener("focus", checkOpenParams);
      document.removeEventListener("visibilitychange", checkOpenParams);
    };
  }, []);

  // 이 브라우저(PC)의 웹푸시 구독 여부 — 모바일 마이페이지와 동일한 방식. 이게 꺼져있으면
  // (구독 자체가 없으면) 이 계정으로 온 알림·테스트 발송을 이 기기에서 받을 수 없다.
  useEffect(() => { if (me?.id) isSubscribed(me.id).then(setPushSubscribed); }, [me?.id]);
  async function toggleAdminPush() {
    setPushBusy(true);
    if (pushSubscribed) {
      await disablePush();
      setPushSubscribed(false);
    } else {
      const r = await enablePush(me.id);
      if (!r.ok) alert(r.reason);
      setPushSubscribed(r.ok);
    }
    setPushBusy(false);
  }

  const tier = SKIP_LOGIN ? "super" : me?.adminTier; // 로그인 꺼진 상태선 전 기능 노출(기존 동작)

  useEffect(() => {
    async function load() {
      // ⚠️ 임시 진단 로그 — 에러코드집 데이터가 원인불명으로 되돌아가는 문제 추적용. 원인 확인되면 지운다.
      console.log(`[에러코드집 진단] ${new Date().toISOString()} AdminApp load() 시작`);
      const [sites, units, siteManagers, failures, inspections, materials, quotes, restock, todos, billings, selfChecks, selfCheckItems, profiles, feed, errorCodes] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          supabase.from("site_managers").select("*"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          fetchAll("self_checks"),
          // B/C(주의관찰·긴급수리)만 — 나머지(A/D/E)는 자체점검 지적사항 화면에 필요 없어 뺀다(전체는 수백~수천행).
          supabase.from("self_check_items").select("*").in("result", ["B", "C"]),
          supabase.from("profiles").select("*").order("name"),
          supabase.from("feed_posts").select("*").order("created_at", { ascending: true }),
          supabase.from("error_codes").select("*"),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        restockRequests: (restock.data ?? []).map(mapRestockRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        selfCheckItems: (selfCheckItems.data ?? []).map(mapSelfCheckItem),
        profiles: profiles.data ?? [],
        feed: (feed.data ?? []).map(mapFeedPost),
        errorCodes: (errorCodes.data ?? []).map(mapErrorCode),
      });
      console.log(`[에러코드집 진단] ${new Date().toISOString()} AdminApp load() 완료, error_codes ${(errorCodes.data ?? []).length}건`);
      setLoading(false);
    }
    load();
  }, []);

  // ── 접근 통제 (로그인 켜졌을 때만) ──
  if (!SKIP_LOGIN && !authChecked) {
    return <BrandSplash />;
  }
  if (!SKIP_LOGIN && !me) {
    return <LoginScreen onLogin={handleAdminLogin} error={authError} submitting={authSubmitting} demo={false} />;
  }
  if (!SKIP_LOGIN && me?.mustChange) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-8">
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-extrabold text-blue-950 mb-1 text-center">비밀번호를 변경해주세요</h1>
          <p className="text-xs text-slate-400 mb-6 text-center">{me.name}님, 초기 비밀번호(1234)를 바꿔야 시작할 수 있습니다.</p>
          <PasswordChangeForm profileId={me.id} submitLabel="변경하고 시작하기" onDone={() => {
            // localStorage 세션도 함께 갱신해야 한다 — 안 하면 새로고침 때 캐시된 mustChange=true가 되살아나 또 변경창이 뜬다.
            const raw = localStorage.getItem("guilAuthV1");
            const s = raw ? JSON.parse(raw) : {};
            localStorage.setItem("guilAuthV1", JSON.stringify({ ...s, mustChange: false }));
            setMe({ ...me, mustChange: false });
          }} />
          <button onClick={adminLogout} className="w-full text-[11px] font-bold text-slate-400 mt-4">다른 계정으로 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={{ tier, name: me?.name ?? "관리자", id: me?.id, signOut: adminLogout }}>
    <div className="min-h-screen lg:flex bg-slate-100 text-slate-900">
      <ConfirmHost />
      {/* 모바일 상단바 */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-blue-950 text-white px-4 py-3">
        <button onClick={() => setNavOpen(true)} aria-label="메뉴 열기"><Menu size={20} /></button>
        <p className="font-bold text-sm">{MENU.find((m) => m.id === menu)?.label}</p>
        <p className="ml-auto text-[10px] text-blue-300">구일엘리베이터(주)</p>
      </header>
      {navOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* 사이드바 — 모바일에선 드로어, PC에선 스크롤해도 안 움직이게 고정 */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-blue-950 text-white flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-5 border-b border-blue-900">
          <p className="font-bold tracking-tight">구일엘리베이터(주)</p>
          <p className="text-xs text-blue-300 mt-0.5">관리자 콘솔</p>
        </div>
        <nav className="flex-1 py-3">
          {MENU.filter((m) => !m.superOnly || tier === "super").map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setMenu(id); setNavOpen(false); }}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm ${
                menu === id ? "bg-blue-800 font-bold" : "text-blue-200 hover:bg-blue-900"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        {!SKIP_LOGIN && me && (
          <div className="px-5 py-3 border-t border-blue-900">
            <p className="text-[11px] font-bold text-blue-100">{me.name}</p>
            <p className="text-[10px] text-blue-400 mb-2">{tier === "super" ? "최고관리자" : "중간관리자"}</p>
            <button
              onClick={toggleAdminPush}
              disabled={pushBusy || !pushSupported()}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 mb-1.5 border text-[11px] font-bold ${
                pushSubscribed ? "bg-blue-800 border-blue-700 text-blue-100" : "bg-blue-900 border-blue-800 text-blue-300"
              }`}
            >
              이 기기에서 알림 받기
              <span>
                {pushBusy ? "처리 중…"
                  : !pushSupported() ? "미지원"
                  : pushPermission() === "denied" ? "차단됨"
                  : pushSubscribed ? "켜짐" : "꺼짐"}
              </span>
            </button>
            <div className="flex gap-1.5">
              <button onClick={() => setPwOpen(true)} className="flex-1 text-[11px] font-bold text-blue-100 bg-blue-900 rounded-lg py-1.5">비밀번호 변경</button>
              <button onClick={adminLogout} className="flex-1 text-[11px] font-bold text-blue-100 bg-blue-900 rounded-lg py-1.5">로그아웃</button>
            </div>
          </div>
        )}
        <p className="px-5 py-3 text-[10px] text-blue-400 border-t border-blue-900">
          {/* ?stay=1 — 관리자 PC는 /에서 콘솔로 자동 이동하므로, 여기서 갈 땐 이동을 끈다 */}
          <a href="/?stay=1" className="hover:text-white">모바일 앱 화면 보기 →</a>
        </p>
      </aside>

      {/* 본문 */}
      <main className="flex-1 min-w-0 p-4 lg:p-8 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-slate-400 pt-20 text-center">데이터를 불러오는 중...</p>
        ) : menu === "dashboard" ? (
          <Dashboard
            data={data}
            setData={setData}
            onOpenWorkCalendar={() => { setHrSub("워크 캘린더"); setMenu("engineers"); }}
            onOpenLeaves={() => { setHrSub("연차관리"); setMenu("engineers"); }}
            onOpenTodos={(view) => { setTodosInitialView(view); setMenu("todos"); }}
            onOpenMaterials={(tab) => { setMaterialsInitialTab(tab); setMenu("materials"); }}
            onOpenBillings={() => setMenu("billings")}
            onOpenFailures={(status) => { setFailuresInitialStatus(status); setMenu("failures"); }}
            onOpenSelfChecks={(view) => { setSelfChecksInitialView(view); setMenu("selfChecks"); }}
          />
        ) : menu === "sites" ? (
          <SitesAdmin data={data} setData={setData} />
        ) : menu === "failures" ? (
          <FailuresAdmin data={data} setData={setData} initialStatus={failuresInitialStatus} />
        ) : menu === "inspections" ? (
          <InspectionsAdmin data={data} setData={setData} />
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} setData={setData} initialTab={materialsInitialTab} />
        ) : menu === "billings" ? (
          <BillingsAdmin data={data} setData={setData} />
        ) : menu === "todos" ? (
          <TodosAdmin data={data} setData={setData} initialView={todosInitialView} />
        ) : menu === "selfChecks" ? (
          <SelfChecksAdmin data={data} setData={setData} initialView={selfChecksInitialView} />
        ) : menu === "room" ? (
          <RoomAdmin data={data} setData={setData} />
        ) : menu === "engineers" ? (
          <EngineersAdmin data={data} setData={setData} sub={hrSub} onSub={setHrSub} />
        ) : menu === "notify" ? (
          tier === "super" ? <NotifySettings /> : <div className="pt-20 text-center text-slate-400 text-sm">최고관리자만 접근할 수 있습니다</div>
        ) : menu === "stats" ? (
          <StatsAdmin data={data} />
        ) : menu === "errorCodes" ? (
          <ErrorCodesAdmin data={data} setData={setData} />
        ) : (
          <div className="pt-20 text-center text-slate-400">
            <p className="font-bold text-slate-500">{MENU.find((m) => m.id === menu)?.label}</p>
            <p className="text-sm mt-1">준비 중입니다 (다음 단계)</p>
          </div>
        )}
      </main>

      {pwOpen && me && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" {...useBackdropClose(() => setPwOpen(false))}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-extrabold text-slate-800 mb-3">비밀번호 변경</p>
            <PasswordChangeForm profileId={me.id} onDone={() => setPwOpen(false)} />
            <button onClick={() => setPwOpen(false)} className="w-full text-xs font-bold text-slate-400 mt-2 py-2">닫기</button>
          </div>
        </div>
      )}
    </div>
    </AdminAuthContext.Provider>
  );
}
