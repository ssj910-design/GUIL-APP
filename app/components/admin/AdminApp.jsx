"use client";

// PC 전용 관리자 페이지 셸 — 모바일 앱(ElevatorFieldApp)과 별개 화면.
// v2 스키마(units, *_id FK)를 기본으로 사용한다. 데이터는 이 셸이 한 번에 로드해
// 각 섹션에 props로 내린다 (모바일 App 셸과 같은 관례).
import { useState, useEffect } from "react";
import { Building2, AlertTriangle, ShieldCheck, Package, Receipt, ListTodo, CalendarCheck, Users, LayoutDashboard, BarChart3, Menu } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  mapSite, mapSiteManager, mapFailure, mapInspection, mapMaterialRequest,
  mapTodo, mapQuoteRequest, mapBilling, mapUnit, mapSelfCheck,
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

const MENU = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "sites", label: "현장정보", icon: Building2 },
  { id: "failures", label: "고장 관제", icon: AlertTriangle },
  { id: "inspections", label: "검사관리", icon: ShieldCheck },
  { id: "materials", label: "자재·견적 신청내역", icon: Package },
  { id: "billings", label: "청구내역", icon: Receipt },
  { id: "todos", label: "할 일 관리", icon: ListTodo },
  { id: "selfChecks", label: "자체점검", icon: CalendarCheck },
  { id: "engineers", label: "인사관리", icon: Users },
  { id: "stats", label: "통계", icon: BarChart3 },
];

export default function AdminApp() {
  const [menu, setMenu] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false); // 모바일 드로어
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    sites: [], units: [], siteManagers: [], failures: [], inspections: [],
    materialRequests: [], quoteRequests: [], todos: [], billings: [],
    selfChecks: [], profiles: [],
  });

  useEffect(() => {
    async function load() {
      const [sites, units, siteManagers, failures, inspections, materials, quotes, todos, billings, selfChecks, profiles] =
        await Promise.all([
          supabase.from("sites").select("*").order("name"),
          supabase.from("units").select("*").order("seq"),
          supabase.from("site_managers").select("*"),
          supabase.from("failures").select("*").order("created_at", { ascending: false }),
          supabase.from("inspections").select("*").order("due_date"),
          supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("todos").select("*").order("created_at", { ascending: false }),
          supabase.from("billings").select("*").order("created_at", { ascending: false }),
          supabase.from("self_checks").select("*"),
          supabase.from("profiles").select("id,name,role,phone,email,region,auth_user_id,minwon_id,duty_order").order("name"),
        ]);
      setData({
        sites: (sites.data ?? []).map(mapSite),
        units: (units.data ?? []).map(mapUnit),
        siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
        failures: (failures.data ?? []).map(mapFailure),
        inspections: (inspections.data ?? []).map(mapInspection),
        materialRequests: (materials.data ?? []).map(mapMaterialRequest),
        quoteRequests: (quotes.data ?? []).map(mapQuoteRequest),
        todos: (todos.data ?? []).map(mapTodo),
        billings: (billings.data ?? []).map(mapBilling),
        selfChecks: (selfChecks.data ?? []).map(mapSelfCheck),
        profiles: profiles.data ?? [],
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen lg:flex bg-slate-100 text-slate-900">
      {/* 모바일 상단바 */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-blue-950 text-white px-4 py-3">
        <button onClick={() => setNavOpen(true)} aria-label="메뉴 열기"><Menu size={20} /></button>
        <p className="font-bold text-sm">{MENU.find((m) => m.id === menu)?.label}</p>
        <p className="ml-auto text-[10px] text-blue-300">구일엘리베이터(주)</p>
      </header>
      {navOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* 사이드바 — 모바일에선 드로어 */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-blue-950 text-white flex flex-col transition-transform lg:static lg:shrink-0 lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-5 border-b border-blue-900">
          <p className="font-bold tracking-tight">구일엘리베이터(주)</p>
          <p className="text-xs text-blue-300 mt-0.5">관리자 콘솔</p>
        </div>
        <nav className="flex-1 py-3">
          {MENU.map(({ id, label, icon: Icon }) => (
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
        <p className="px-5 py-4 text-[10px] text-blue-400 border-t border-blue-900">
          모바일 앱: / · Phase 2에서 로그인 적용 예정
        </p>
      </aside>

      {/* 본문 */}
      <main className="flex-1 min-w-0 p-4 lg:p-8 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-slate-400 pt-20 text-center">데이터를 불러오는 중...</p>
        ) : menu === "dashboard" ? (
          <Dashboard data={data} />
        ) : menu === "sites" ? (
          <SitesAdmin data={data} setData={setData} />
        ) : menu === "failures" ? (
          <FailuresAdmin data={data} setData={setData} />
        ) : menu === "inspections" ? (
          <InspectionsAdmin data={data} setData={setData} />
        ) : menu === "materials" ? (
          <MaterialsAdmin data={data} />
        ) : menu === "billings" ? (
          <BillingsAdmin data={data} setData={setData} />
        ) : menu === "todos" ? (
          <TodosAdmin data={data} setData={setData} />
        ) : menu === "selfChecks" ? (
          <SelfChecksAdmin data={data} setData={setData} />
        ) : menu === "engineers" ? (
          <EngineersAdmin data={data} setData={setData} />
        ) : menu === "stats" ? (
          <StatsAdmin data={data} />
        ) : (
          <div className="pt-20 text-center text-slate-400">
            <p className="font-bold text-slate-500">{MENU.find((m) => m.id === menu)?.label}</p>
            <p className="text-sm mt-1">준비 중입니다 (다음 단계)</p>
          </div>
        )}
      </main>
    </div>
  );
}
