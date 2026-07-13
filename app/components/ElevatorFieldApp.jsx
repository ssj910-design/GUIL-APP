"use client";

import React, { useState, useMemo, useEffect, useContext, createContext } from "react";
import {
  Home, AlertTriangle, CalendarCheck, ShieldCheck, Package, Receipt,
  ListTodo, MessagesSquare, ChevronRight, ChevronLeft, X, Camera,
  MapPin, Check, Clock, Users, Settings, Plus, Search, Navigation,
  FileText, TrendingUp, Bell, ClipboardCheck, AlertOctagon, Lock, PackageCheck, RotateCcw, PackageX, Image as ImageIcon,
  Building2, PhoneCall, ArrowLeft, Flag, Mail, User, Paperclip, Radio, Flame, Award, Send
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/* ------------------------------------------------------------------ */
/* Supabase 연동                                                        */
/* ------------------------------------------------------------------ */
// SITES는 파일 여러 곳(약 13곳)에서 전역 상수처럼 쓰이던 값이라,
// prop으로 일일이 넘기는 대신 Context로 어디서든 꺼내 쓸 수 있게 했습니다.
const SitesContext = createContext([]);

// 로그인한 사용자 정보(이름/역할)와 전체 기사 이름 목록을 어디서든 꺼내 쓸 수 있게 합니다.
const AuthContext = createContext({ name: "", role: "engineer", engineerNames: [], signOut: () => {} });

// Supabase 테이블의 snake_case 컬럼명을 화면 코드가 쓰던 camelCase 이름으로 바꿔줍니다.
function mapSite(row) {
  return {
    id: row.id,
    siteCode: row.site_code,
    name: row.name,
    elevatorNo: row.elevator_no,
    address: row.address,
    region: row.region,
    contractType: row.contract_type,
    phone: row.phone,
    elevatorModel: row.elevator_model,
    unitCount: row.unit_count,
    manager: row.manager,
    managerPhone: row.manager_phone,
    overdueLong: row.overdue_long,
    overdueTotal: row.overdue_total,
    failures30d: row.failures_30d,
    assignedEngineer: row.assigned_engineer,
    notes: row.notes,
  };
}

function mapFailure(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    errorCode: row.error_code,
    status: row.status,
    reportedAt: row.reported_at,
    assignee: row.assignee,
    notFault: row.not_fault,
    reporterPhone: row.reporter_phone,
    arrivalTime: row.arrival_time,
    completeTime: row.complete_time,
    processResult: row.process_result,
    processNote: row.process_note,
  };
}

function mapInspection(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    type: row.type,
    org: row.org,
    dueDate: row.due_date,
    result: row.result,
    notes: row.notes,
  };
}

function mapMaterialRequest(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    part: row.part,
    urgency: row.urgency,
    note: row.note,
    photoCount: row.photo_count,
    engineer: row.engineer,
    requestedDate: row.requested_date,
    status: row.status,
    suppliedDate: row.supplied_date,
    rejectReason: row.reject_reason,
    rejectedDate: row.rejected_date,
    hasSupplyPhoto: row.has_supply_photo,
  };
}

function mapTodo(row) {
  return {
    id: row.id,
    materialRequestId: row.material_request_id,
    quoteRequestId: row.quote_request_id,
    source: row.source,
    title: row.title,
    siteName: row.site_name,
    part: row.part,
    assignee: row.assignee,
    assignedDate: row.assigned_date,
    dueDate: row.due_date,
    done: row.done,
    photoCount: row.photo_count,
  };
}

function mapQuoteRequest(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    constructionType: row.construction_type,
    contactPhone: row.contact_phone,
    note: row.note,
    photoCount: row.photo_count,
    engineer: row.engineer,
    requestedDate: row.requested_date,
    status: row.status,
    quoteIssuedDate: row.quote_issued_date,
    approvedDate: row.approved_date,
    suppliedDate: row.supplied_date,
    hasSupplyPhoto: row.has_supply_photo,
  };
}

function mapBilling(row) {
  return {
    id: row.id,
    type: row.type,
    siteName: row.site_name,
    part: row.part,
    cost: row.cost,
    replaceDate: row.replace_date,
    contactPhone: row.contact_phone,
    engineer: row.engineer,
    submittedAt: row.submitted_at,
  };
}

function mapRestockRequest(row) {
  return {
    id: row.id,
    engineer: row.engineer,
    part: row.part,
    siteName: row.site_name,
    requestedDate: row.requested_date,
    status: row.status,
    suppliedDate: row.supplied_date,
    hasSupplyPhoto: row.has_supply_photo,
  };
}

function mapFeedPost(row) {
  return {
    id: row.id,
    author: row.author,
    time: new Date(row.created_at).toTimeString().slice(0, 5),
    text: row.body,
  };
}

function siteUnits(site) {
  const n = site.unitCount || 1;
  return Array.from({ length: n }, (_, i) => `1-${i + 1}`);
}

const RESULT_LABEL = { pass: "합격", conditional: "조건부합격", fail: "불합격" };

const TODAY_STR = "2026-07-10";

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const FAULT_TYPES = ["운행정지", "문닫힘 이상", "소음/진동", "기타"];
const KIT_PARTS = ["도어 롤러", "리미트 스위치", "인터폰 배터리", "비상통화장치 배터리", "컨트롤러 퓨즈", "브레이크 패드", "기타"];
const FAULT_FACTORS = ["부품노후", "사용자과실", "외부요인(정전 등)", "원인불명", "기타"];
const FAULT_PARTS = ["도어", "권상기", "제어반", "인터폰", "비상통화장치", "와이어로프", "기타"];
const DETAIL_PARTS = ["상부", "하부", "좌측", "우측", "전체", "기타"];
const PROCESS_CONTENTS = ["부품교체", "조정/조립", "청소", "리셋", "기타"];
const PROCESS_RESULTS = ["정상처리", "부분처리(재방문 필요)", "처리불가(자재 대기)"];

// 자재 신청, 할일 관련 안내:
// m1은 아직 '승인대기'(관리자가 지급완료 처리 전), m2는 이미 지급완료되어
// 할일이 생성된 상태를 시연하기 위한 샘플입니다 — 이제 이 데이터들은 이
// 파일이 아니라 Supabase의 failures / inspections / material_requests /
// todos 테이블에서 불러옵니다 (App 컴포넌트의 useEffect 참고).

// 견적요청 진행 단계: 요청접수 → 견적발행 → 승인 → 자재지급완료(할일 자동생성)
const QUOTE_STAGES = ["요청접수", "견적발행", "승인", "자재지급완료"];

const TABS = [
  { id: "home", label: "홈", icon: Home },
  { id: "sites", label: "현장관리", icon: Building2 },
  { id: "failure", label: "고장접수", icon: AlertTriangle },
  { id: "checkup", label: "정기점검", icon: CalendarCheck },
  { id: "inspection", label: "검사관리", icon: ShieldCheck },
  { id: "material", label: "자재·견적", icon: Package },
  { id: "billing", label: "비용청구", icon: Receipt },
  { id: "todo", label: "할일관리", icon: ListTodo },
  { id: "room", label: "우리방", icon: MessagesSquare },
  { id: "admin", label: "관리자 모드", icon: Settings },
];

/* ------------------------------------------------------------------ */
/* Small shared bits                                                   */
/* ------------------------------------------------------------------ */

function ScreenHeader({ title, subtitle, right }) {
  return (
    <div className="px-5 pt-5 pb-4 bg-blue-950 text-white shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-blue-200 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

function Badge({ result }) {
  const map = {
    pass: { label: "합격", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    conditional: { label: "조건부합격", cls: "bg-amber-100 text-amber-700 border-amber-300" },
    fail: { label: "불합격", cls: "bg-red-100 text-red-700 border-red-300" },
  };
  const v = map[result];
  if (!v) return null;
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-full border ${v.cls}`}>
      {v.label}
    </span>
  );
}

function DDay({ dueDate }) {
  const today = new Date("2026-07-10");
  const due = new Date(dueDate);
  const diff = Math.ceil((due - today) / 86400000);
  let cls = "bg-slate-100 text-slate-600";
  let text = `D-${diff}`;
  if (diff < 0) { cls = "bg-red-600 text-white"; text = `D+${Math.abs(diff)}`; }
  else if (diff <= 7) { cls = "bg-red-100 text-red-700"; }
  else if (diff <= 14) { cls = "bg-amber-100 text-amber-700"; }
  else { cls = "bg-blue-100 text-blue-700"; }
  if (diff === 0) text = "D-DAY";
  return <span className={`text-xs font-extrabold px-2 py-1 rounded-md ${cls}`}>{text}</span>;
}

function PhotoUpload({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center gap-1.5 text-slate-500 active:bg-slate-50">
      <Camera size={22} />
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-slate-400">표준 화질 · 글씨가 선명하게 보이도록 촬영</span>
    </button>
  );
}

function PhotoThumb({ caption }) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-100 py-4 flex flex-col items-center gap-1">
      <ImageIcon size={20} className="text-slate-400" />
      {caption && <span className="text-[10px] text-slate-400 font-semibold">{caption}</span>}
    </div>
  );
}

/* 엘맨PRO 스타일 타임라인 항목 (아이콘-라벨-값, 세로 연결선) */
function TimelineRow({ icon: Icon, label, value, valueColor = "text-slate-700", highlight, last, onClick }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <div className={`flex px-5 ${highlight ? "bg-red-600" : ""}`}>
      <div className="flex flex-col items-center mr-3 pt-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${highlight ? "bg-white" : "bg-slate-100"}`}>
          <Icon size={13} className={highlight ? "text-red-600" : "text-slate-400"} />
        </div>
        {!last && <div className={`w-px flex-1 mt-1 ${highlight ? "bg-red-400" : "bg-slate-200"}`} />}
      </div>
      <Wrapper
        onClick={onClick}
        className={`flex-1 flex items-center justify-between py-3 text-left ${last ? "" : "border-b border-slate-100"} ${onClick ? "active:bg-slate-50" : ""}`}
      >
        <span className={`text-sm ${highlight ? "text-white font-bold" : "text-slate-500"}`}>{label}</span>
        <span className={`text-sm font-bold text-right ${highlight ? "text-white" : valueColor}`}>{value}</span>
      </Wrapper>
    </div>
  );
}

/* 엘맨PRO 스타일 편집 가능한 타임라인 입력 행 */
function TimelineInput({ icon: Icon, label, children, last, required }) {
  return (
    <div className="flex px-5">
      <div className="flex flex-col items-center mr-3 pt-3">
        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={13} className="text-slate-400" />
        </div>
        {!last && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>
      <div className={`flex-1 flex items-center justify-between py-2.5 gap-3 ${last ? "" : "border-b border-slate-100"}`}>
        <span className="text-sm text-slate-500 shrink-0">
          {label}
          {required && <span className="text-red-500">*</span>}
        </span>
        <div className="flex-1 flex justify-end min-w-0">{children}</div>
      </div>
    </div>
  );
}

const tlInputCls = "text-right text-sm font-bold text-blue-600 bg-transparent outline-none w-full placeholder-slate-300";

/* 엘맨PRO 스타일 필터 바 (현장/담당자/부서 + 기간) */
function FilterBar({ pills = [], startDate, endDate }) {
  return (
    <div className="bg-slate-100 px-5 py-3 shrink-0">
      <div className="flex gap-2 overflow-x-auto mb-2">
        {pills.map((p, idx) => (
          <span
            key={idx}
            className={`shrink-0 flex items-center rounded-full border text-xs font-bold overflow-hidden ${p.active ? "border-blue-600" : "border-slate-300"}`}
          >
            <span className={`px-3 py-1.5 ${p.active ? "text-blue-600 bg-white" : "text-slate-400 bg-slate-200"}`}>{p.label}</span>
            <span className={`px-3 py-1.5 ${p.active ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-500"}`}>{p.value}</span>
          </span>
        ))}
      </div>
      {(startDate || endDate) && (
        <div className="flex gap-2 overflow-x-auto">
          {startDate && (
            <span className="shrink-0 flex items-center rounded-full border border-blue-600 text-xs font-bold overflow-hidden">
              <span className="px-3 py-1.5 text-blue-600 bg-white">시작일</span>
              <span className="px-3 py-1.5 bg-blue-600 text-white">{startDate}</span>
            </span>
          )}
          {endDate && (
            <span className="shrink-0 flex items-center rounded-full border border-blue-600 text-xs font-bold overflow-hidden">
              <span className="px-3 py-1.5 text-blue-600 bg-white">종료일</span>
              <span className="px-3 py-1.5 bg-blue-600 text-white">{endDate}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}


/* 엘맨PRO 스타일 이력 카드 (고장/검사 이력 공용) */
function HistoryCard({ barColor, title, badge, rows, tags, date, timeCols }) {
  return (
    <div className="flex px-5 pb-5">
      <div className="w-1 rounded-full mr-3 shrink-0" style={{ background: barColor }} />
      <div className="flex-1 pt-0.5">
        <div className="flex items-center gap-1.5 mb-2">
          <p className="font-bold text-slate-800 text-[15px]">{title}</p>
          {badge != null && (
            <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>
          )}
        </div>
        <div className="space-y-1 mb-2">
          {rows.map((r, idx) => (
            <div key={idx} className="flex items-center gap-1.5 text-sm">
              <span className="text-slate-400">{r.label} -</span>
              <span className="text-blue-600 font-semibold">{r.value}</span>
            </div>
          ))}
        </div>
        {(date || tags) && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {date && <span className="text-sm text-slate-700 font-bold">{date}</span>}
            {tags?.map((t, idx) => (
              <span key={idx} className="text-[11px] border border-blue-300 text-blue-600 rounded-full px-2 py-0.5 font-semibold">{t}</span>
            ))}
          </div>
        )}
        {timeCols && (
          <div className="rounded-lg overflow-hidden border border-slate-100">
            <div className="bg-blue-500 grid grid-cols-3">
              {timeCols.map((c, idx) => (
                <span key={idx} className="text-[10.5px] text-white font-bold text-center py-1.5">{c.label}</span>
              ))}
            </div>
            <div className="bg-white grid grid-cols-3">
              {timeCols.map((c, idx) => (
                <span key={idx} className={`text-[13px] font-extrabold text-center py-2 ${c.color}`}>{c.value}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, tone = "blue", className = "" }) {
  const toneCls = tone === "red" ? "bg-red-600 active:bg-red-700" : "bg-blue-700 active:bg-blue-800";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full ${toneCls} disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl text-sm ${className}`}
    >
      {children}
    </button>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto" />
      <div
        className="bg-slate-50 rounded-t-3xl max-h-[88%] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white rounded-t-3xl shrink-0">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 active:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

/* ------------------------------------------------------------------ */
/* LOGIN                                                                */
/* ------------------------------------------------------------------ */

function LoginScreen({ onLogin, error, submitting }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="h-screen w-screen bg-slate-200 flex items-center justify-center overflow-hidden">
      <div
        className="bg-slate-50 flex flex-col shadow-2xl border-4 border-slate-900 rounded-[2.5rem] px-8"
        style={{ width: "375px", height: "min(812px, 100vh - 24px)", maxHeight: "100vh" }}
      >
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-xl font-extrabold text-blue-950 mb-1 text-center">구일엘리베이터(주)</h1>
          <p className="text-xs text-slate-400 mb-8 text-center">현장관리 시스템 로그인</p>

          <Field label="이메일">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </Field>
          <Field label="비밀번호">
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && onLogin(email, password)}
            />
          </Field>
          {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
          <PrimaryButton onClick={() => onLogin(email, password)} disabled={submitting || !email || !password}>
            {submitting ? "로그인 중..." : "로그인"}
          </PrimaryButton>
          <p className="text-[11px] text-slate-400 text-center mt-4">
            계정이 없으신가요? 관리자에게 계정 발급을 요청하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HOME                                                                 */
/* ------------------------------------------------------------------ */

function DrillHeader({ title, onBack, onHome }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100 shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-slate-800 active:text-slate-400">
          <ArrowLeft size={22} strokeWidth={2.5} />
        </button>
        <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
      </div>
      <button onClick={onHome} className="text-slate-800 active:text-slate-400">
        <Home size={20} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ---- 승강기정보 화면 (정보 / 고장 / 검사) ---- */
function ElevatorDetailScreen({ site, unit, subTab, setSubTab, failures, inspections, billings, onBack, onHome }) {
  const unitFailures = failures.filter((f) => f.siteId === site.id);
  const unitInspections = [...inspections.filter((i) => i.siteId === site.id)].sort(
    (a, b) => new Date(b.dueDate) - new Date(a.dueDate)
  );
  const unitBillings = billings.filter((b) => b.siteName === site.name);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="승강기정보" onBack={onBack} onHome={onHome} />
      <div className="flex border-b border-slate-100 shrink-0">
        {["정보", "고장", "검사", "부품교체내역"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "정보" && (
          <div className="bg-slate-50 pb-6">
            <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">기본정보</p>
            <div className="bg-white">
              <TimelineRow icon={Flag} label="호기코드" value={unit} />
              <TimelineRow icon={Flag} label="승강기번호" value="-" />
              <TimelineRow icon={Flag} label="구분" value="승객용" />
              <TimelineRow icon={Flag} label="종류" value="로프식" />
              <TimelineRow icon={Flag} label="형식" value="MRL" />
              <TimelineRow icon={Flag} label="CCTV" value="있음" valueColor="text-blue-600" />
              <TimelineRow icon={Flag} label="도어방식" value="1중앙 열림식" />
              <TimelineRow icon={Flag} label="점검기종" value={site.elevatorModel} />
              <TimelineRow icon={Flag} label="제어반" value="MR" />
              <TimelineRow icon={Flag} label="모델명" value={site.elevatorModel} valueColor="text-blue-600" />
              <TimelineRow icon={Flag} label="제조업체" value="-" />
              <TimelineRow icon={Flag} label="층수[지상/지하]" value="15 / 2" />
              <TimelineRow icon={Flag} label="최대정원/적재하중" value="17인승 / 1150kg" last />
            </div>
          </div>
        )}

        {subTab === "고장" && (
          <div className="bg-slate-50 pt-4 pb-2">
            <p className="px-5 pb-3 text-xs font-bold text-slate-400">고장 과거이력</p>
            {unitFailures.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 고장 이력이 없습니다</p>
            ) : (
              unitFailures.map((f) => {
                const seed = f.id.charCodeAt(1) || 1;
                const barColor = f.status === "완료" ? "#10b981" : f.status === "진행중" ? "#f59e0b" : "#ef4444";
                return (
                  <HistoryCard
                    key={f.id}
                    barColor={barColor}
                    title={f.errorCode.split(" ")[0]}
                    badge={1}
                    rows={[
                      { label: "접수", value: f.errorCode },
                      { label: "처리", value: f.status },
                      { label: "원인", value: f.status === "완료" ? "부품 교체" : "확인중" },
                    ]}
                    date={`2026-${f.reportedAt.replace("/", "-")}`}
                    tags={["김기사", "가산엘리베이터"]}
                    timeCols={[
                      { label: "접수-배정", value: `${(seed * 3) % 20 + 2}분`, color: "text-red-500" },
                      { label: "배정-도착", value: `${(seed * 7) % 40 + 10}분`, color: "text-amber-500" },
                      { label: "도착-완료", value: `${(seed * 11) % 60 + 20}분`, color: "text-emerald-600" },
                    ]}
                  />
                );
              })
            )}
          </div>
        )}

        {subTab === "검사" && (
          <div className="bg-slate-50 pt-4 pb-2">
            <p className="px-5 pb-3 text-xs font-bold text-slate-400">검사이력</p>
            {unitInspections.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 검사 이력이 없습니다</p>
            ) : (
              unitInspections.map((insp) => {
                const runEnd = insp.dueDate;
                const runStart = addDays(runEnd, -365);
                const inspDate = addDays(runStart, -5);
                return (
                  <HistoryCard
                    key={insp.id}
                    barColor={insp.result === "fail" ? "#ef4444" : insp.result === "conditional" ? "#f59e0b" : "#10b981"}
                    title={insp.type}
                    rows={[
                      { label: "상태", value: insp.result ? "완료" : "예정" },
                      { label: "결과", value: insp.result ? RESULT_LABEL[insp.result] : "미정" },
                      { label: "검사기관", value: insp.org },
                    ]}
                    timeCols={[
                      { label: "검사일", value: inspDate, color: "text-red-500" },
                      { label: "운행시작일", value: runStart, color: "text-amber-500" },
                      { label: "운행종료일", value: runEnd, color: "text-emerald-600" },
                    ]}
                  />
                );
              })
            )}
          </div>
        )}

        {subTab === "부품교체내역" && (
          <div className="bg-slate-50 pt-4 pb-6 px-5">
            <p className="pb-3 text-xs font-bold text-slate-400">부품교체내역</p>
            {unitBillings.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">등록된 부품교체 내역이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {unitBillings.map((b) => <BillingCard key={b.id} b={b} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- 현장정보 화면 ---- */
function SiteDetailScreen({ site, onBack, onHome, onOpenUnit, onUpdateSiteNotes }) {
  const units = siteUnits(site);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(site.notes ?? "");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="현장정보" onBack={onBack} onHome={onHome} />
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-6">
        <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400">상세정보</p>
        <div className="bg-white">
          <TimelineRow icon={Flag} label="현장코드" value={site.siteCode} valueColor="text-blue-600" />
          <TimelineRow icon={Flag} label="현장명" value={site.name} />
          <TimelineRow icon={Flag} label="대수" value={`${units.length} 대`} />
          <TimelineRow icon={PhoneCall} label="현장전화번호" value="-" />
          <TimelineRow icon={MapPin} label="주소" value={site.address} valueColor="text-blue-600" />
          <TimelineRow icon={Navigation} label="상세주소" value="-" />
          <TimelineRow icon={Flame} label="회사구분" value="자사" />
          <TimelineRow icon={Flame} label="프로젝트No(협력사코드)" value="-" />
          <TimelineRow icon={Flame} label="보수업체명" value="가산엘리베이터(주)" />
          <TimelineRow icon={User} label="담당자" value={site.manager} />
          <TimelineRow icon={PhoneCall} label="담당전화번호" value={site.managerPhone} valueColor="text-blue-600" />
          <TimelineRow icon={Flame} label="계약구분" value={site.contractType} />
          <TimelineRow icon={Flame} label="점검시행안내문" value="사용" valueColor="text-blue-600" last />
        </div>

        <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">담당자 정보</p>
        <div className="bg-white">
          <TimelineRow icon={User} label="이름" value="-" />
          <TimelineRow icon={Mail} label="메일주소" value="-" />
          <TimelineRow icon={PhoneCall} label="휴대폰번호" value={site.phone} valueColor="text-blue-600" />
          <TimelineRow icon={Radio} label="원격점검 사용여부" value="미사용" />
          <TimelineRow
            icon={ClipboardCheck}
            label="비고(전달사항)"
            value={site.notes ? site.notes : "터치해서 입력"}
            valueColor={site.notes ? "text-slate-700" : "text-slate-400"}
            last
            onClick={() => {
              setNotesDraft(site.notes ?? "");
              setEditingNotes(true);
            }}
          />
        </div>

        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400">호기</p>
          <span className="text-xs font-semibold text-blue-600">리스트보기입니다</span>
        </div>
        <div className="bg-white">
          {units.map((u, idx) => (
            <div key={u} className="flex px-5">
              <div className="flex flex-col items-center mr-3 pt-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                {idx !== units.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
              </div>
              <div className="flex-1 pb-3">
                <p className="text-sm font-bold text-slate-800 py-2.5">{u} (--------)</p>
                <button
                  onClick={() => onOpenUnit(u)}
                  className="w-full bg-blue-500 text-white text-sm font-bold py-2.5 rounded-md active:bg-blue-600 mb-1"
                >
                  상세내용
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingNotes && (
        <Sheet title="비고(전달사항)" onClose={() => setEditingNotes(false)}>
          <Field label="현장 전달사항">
            <textarea
              className={inputCls}
              rows={4}
              placeholder="예: 지하 기계실 열쇠는 경비실에 있음"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
          </Field>
          <PrimaryButton
            onClick={async () => {
              await onUpdateSiteNotes(site.id, notesDraft.trim());
              setEditingNotes(false);
            }}
          >
            저장
          </PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}

function SiteTab({ inspections, failures, billings, onUpdateSiteNotes }) {
  const allSites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const sites = role === "admin" ? allSites : allSites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [view, setView] = useState("list"); // list | site | elevator
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [elevatorSubTab, setElevatorSubTab] = useState("정보");
  const regions = ["전체", "가산", "양재"];

  const list = sites.filter(
    (s) => (region === "전체" || s.region === region) && s.name.includes(query.trim())
  );

  function latestInspection(siteId) {
    return inspections.find((i) => i.siteId === siteId) ?? null;
  }
  function openFailures(siteId) {
    return failures.filter((f) => f.siteId === siteId && f.status !== "완료").length;
  }

  function backToList() {
    setView("list");
    setSelectedSite(null);
    setSelectedUnit(null);
  }

  // sites 배열이 갱신돼도(예: 비고 저장 후) 최신 정보가 보이도록 id로 다시 찾습니다.
  const liveSelectedSite = selectedSite ? sites.find((s) => s.id === selectedSite.id) ?? selectedSite : null;

  if (view === "elevator" && liveSelectedSite && selectedUnit) {
    return (
      <ElevatorDetailScreen
        site={liveSelectedSite}
        unit={selectedUnit}
        subTab={elevatorSubTab}
        setSubTab={setElevatorSubTab}
        failures={failures}
        inspections={inspections}
        billings={billings}
        onBack={() => setView("site")}
        onHome={backToList}
      />
    );
  }

  if (view === "site" && liveSelectedSite) {
    return (
      <SiteDetailScreen
        site={liveSelectedSite}
        onBack={backToList}
        onHome={backToList}
        onUpdateSiteNotes={onUpdateSiteNotes}
        onOpenUnit={(u) => {
          setSelectedUnit(u);
          setElevatorSubTab("정보");
          setView("elevator");
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-2 shrink-0">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="건물명으로 검색"
            className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 mt-2.5 overflow-x-auto">
          {regions.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${region === r ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">총 720개 현장 중 {list.length}건 표시 (샘플 데이터)</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {list.map((s) => {
          const insp = latestInspection(s.id);
          const openF = openFailures(s.id);
          return (
            <button
              key={s.id}
              onClick={() => { setSelectedSite(s); setView("site"); }}
              className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 active:bg-slate-50"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{s.name} · {s.elevatorNo}</p>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{s.region}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{s.address}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {s.failures30d >= 3 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">집중관리</span>
                )}
                {openF > 0 && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">미처리 고장 {openF}건</span>
                )}
                {insp?.result && <Badge result={insp.result} />}
              </div>
            </button>
          );
        })}
        {list.length === 0 && <p className="text-xs text-slate-400 text-center py-8">검색 결과가 없습니다</p>}
      </div>
    </div>
  );
}

function HomeTab({ inspections, failures }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER, role } = useContext(AuthContext);
  const mySites = role === "admin" ? sites : sites.filter((s) => s.assignedEngineer === CURRENT_ENGINEER);
  const hotSites = mySites.filter((s) => s.failures30d >= 3);

  const dueSoon = inspections
    .filter((i) => !i.result)
    .map((i) => ({ ...i, daysLeft: Math.ceil((new Date(i.dueDate) - new Date(TODAY_STR)) / 86400000) }))
    .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const flagged = inspections
    .filter((i) => i.result === "conditional" || i.result === "fail")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const doneCount = mine.filter((f) => f.status === "완료").length;
  const processingCount = mine.filter((f) => f.status === "진행중").length;
  const pendingCount = mine.filter((f) => f.status === "미처리").length;
  const arrivalList = mine.filter((f) => f.status === "미처리");
  const [arrived, setArrived] = useState({});

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {/* 고장처리현황 */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3">고장처리현황</h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                <TrendingUp size={18} className="text-blue-600" />
              </div>
              <span className="text-lg font-extrabold text-blue-600">{hotSites.length}</span>
              <span className="text-[11px] text-slate-500">예측</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <ClipboardCheck size={18} className="text-emerald-600" />
              </div>
              <span className="text-lg font-extrabold text-emerald-600">{doneCount}</span>
              <span className="text-[11px] text-slate-500">처리</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                <ClipboardCheck size={18} className="text-amber-600" />
              </div>
              <span className="text-lg font-extrabold text-amber-600">{processingCount}</span>
              <span className="text-[11px] text-slate-500">처리중</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <ClipboardCheck size={18} className="text-red-600" />
              </div>
              <span className="text-lg font-extrabold text-red-600">{pendingCount}</span>
              <span className="text-[11px] text-slate-500">미처리</span>
            </div>
          </div>
        </div>
      </div>

      {/* 고장 현장 도착 */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={16} className="text-slate-700" />
          <h3 className="font-bold text-slate-800 text-sm">고장 현장 도착</h3>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {arrivalList.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-5">도착 대기 중인 고장 현장이 없습니다</p>
          ) : (
            arrivalList.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">{f.siteName} {f.elevatorNo}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400 font-mono">{arrived[f.id] ?? "--:--"}</span>
                  <button
                    onClick={() => setArrived((prev) => ({ ...prev, [f.id]: new Date().toTimeString().slice(0, 5) }))}
                    className={`text-xs font-bold px-4 py-2 rounded-lg ${arrived[f.id] ? "bg-emerald-100 text-emerald-700" : "bg-blue-700 text-white active:bg-blue-800"}`}
                  >
                    {arrived[f.id] ? "도착완료" : "도착"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 집중 관리 현장 */}
      <div className="px-5 pt-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon size={18} className="text-red-600" />
            <h3 className="font-extrabold text-red-700 text-sm whitespace-nowrap">집중 관리현장(한달 내 고장 3회 이상)</h3>
          </div>
          {hotSites.length === 0 ? (
            <p className="text-xs text-red-500">현재 집중 관리 대상 현장이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {hotSites.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-red-100">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{s.name} · {s.elevatorNo}</p>
                    <p className="text-[11px] text-slate-400">{s.address}</p>
                  </div>
                  <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                    {s.failures30d}회 고장
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 공공데이터 실시간 검사 관제 */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-blue-950 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-blue-950 bg-white px-1.5 py-0.5 rounded">공공데이터</span>
              <span className="text-xs font-extrabold text-white">실시간 검사 관제</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 rounded-full pl-1.5 pr-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] font-extrabold text-emerald-300 tracking-wide">LIVE</span>
            </div>
          </div>
          <p className="px-4 pt-2.5 text-[10px] text-slate-400">국가승강기정보센터(행정안전부) Open API 연동 · 담당 현장 승강기 고유번호 기준 실시간 조회</p>

          <div className="px-4 pt-3 pb-3.5">
            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} /> 검사도래현장 · 60일 이내
            </p>
            {dueSoon.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">60일 이내 검사 도래 현장이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {dueSoon.map((i) => (
                  <div key={i.id} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
                      <p className="text-[11px] text-slate-500">{i.type} · {i.org}</p>
                    </div>
                    <DDay dueDate={i.dueDate} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 pt-3 border-t border-slate-100">
            <p className="text-xs font-bold text-red-600 mb-2 flex items-center gap-1.5">
              <AlertOctagon size={13} /> 조건부/불합격 현장 · 보완조치 필요
            </p>
            {flagged.length === 0 ? (
              <p className="text-xs text-slate-400 py-1.5">조건부·불합격 현장이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {flagged.map((i) => (
                  <div key={i.id} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-slate-800">{i.siteName} · {i.elevatorNo}</p>
                      <Badge result={i.result} />
                    </div>
                    <p className="text-[11px] text-slate-500 mb-1.5">{i.type} · {i.org}</p>
                    <p className="text-[11px] text-red-600 leading-relaxed">지적사항: {i.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="px-4 pb-3 text-[9.5px] text-slate-300">* 프로토타입 시연용 시뮬레이션 데이터입니다</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FAILURE (고장접수)                                                   */
/* ------------------------------------------------------------------ */

function FailureRegisterForm({ setFailures, goToUnassigned }) {
  const sites = useContext(SitesContext);
  const { engineerNames } = useContext(AuthContext);
  const [form, setForm] = useState({
    siteId: "", unit: "", faultType: "", faultDetail: "", notFault: false, assignee: "", reporterPhone: "", sendSms: false,
  });
  const site = sites.find((s) => s.id === form.siteId);
  const nowLabel = "2026-07-10 " + new Date().toTimeString().slice(0, 5);
  const canSubmit = !!site && !!form.faultType && form.reporterPhone.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    const newFailure = {
      id: "f" + Date.now(),
      siteId: site.id,
      siteName: site.name,
      elevatorNo: form.unit || site.elevatorNo,
      errorCode: form.faultType + (form.faultDetail ? ` (${form.faultDetail})` : ""),
      status: "미처리",
      reportedAt: "07/10 " + new Date().toTimeString().slice(0, 5),
      assignee: form.assignee || null,
      notFault: form.notFault,
      reporterPhone: form.reporterPhone.trim(),
    };
    await supabase.from("failures").insert({
      id: newFailure.id,
      site_id: newFailure.siteId,
      site_name: newFailure.siteName,
      elevator_no: newFailure.elevatorNo,
      error_code: newFailure.errorCode,
      status: newFailure.status,
      reported_at: newFailure.reportedAt,
      assignee: newFailure.assignee,
      not_fault: newFailure.notFault,
      reporter_phone: newFailure.reporterPhone,
    });
    setFailures((prev) => [newFailure, ...prev]);
    setForm({ siteId: "", unit: "", faultType: "", faultDetail: "", notFault: false, assignee: "", reporterPhone: "", sendSms: false });
    goToUnassigned();
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-24">
      <p className="px-5 pt-4 pb-2 flex items-center justify-between text-xs font-bold text-slate-400">
        정보 <span className="text-blue-600">필수입력</span>
      </p>
      <div className="bg-white overflow-visible">
        <TimelineInput icon={Flag} label="현장명" required>
          <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id, unit: "" })} placeholder="현장명 검색" />
        </TimelineInput>
        <TimelineInput icon={ClipboardCheck} label="접수일시">
          <span className={tlInputCls}>{nowLabel}</span>
        </TimelineInput>
        <TimelineInput icon={PhoneCall} label="현장 전화번호">
          <span className={tlInputCls}>{site?.phone ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Home} label="주소">
          <span className={`${tlInputCls} truncate`}>{site?.address ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Flame} label="계약구분">
          <span className={tlInputCls}>{site?.contractType ?? "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={User} label="담당자">
          <span className={tlInputCls}>{site ? site.manager : "현장을 선택해주세요"}</span>
        </TimelineInput>
        <TimelineInput icon={Settings} label="호기" last>
          <select className={tlInputCls} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={!site}>
            <option value="">호기를 선택해주세요</option>
            {site && siteUnits(site).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </TimelineInput>
      </div>

      <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">신고자 정보</p>
      <div className="bg-white">
        <TimelineInput icon={PhoneCall} label="신고자 전화번호" required last>
          <input
            className={tlInputCls}
            placeholder="필수 입력"
            value={form.reporterPhone}
            onChange={(e) => setForm({ ...form, reporterPhone: e.target.value })}
          />
        </TimelineInput>
      </div>

      <p className="px-5 pt-5 pb-2 text-xs font-bold text-slate-400">입력란</p>
      <div className="bg-white">
        <TimelineInput icon={PackageX} label="고장구분" required>
          <select className={tlInputCls} value={form.faultType} onChange={(e) => setForm({ ...form, faultType: e.target.value })}>
            <option value="">고장구분을 선택해주세요</option>
            {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </TimelineInput>
        <TimelineInput icon={PackageX} label="고장상세내역">
          <input
            className={tlInputCls}
            placeholder="입력하세요"
            value={form.faultDetail}
            onChange={(e) => setForm({ ...form, faultDetail: e.target.value })}
          />
        </TimelineInput>
        <TimelineInput icon={PackageX} label="고장아님(다발아님)">
          <button
            onClick={() => setForm({ ...form, notFault: !form.notFault })}
            className={`text-sm font-bold ${form.notFault ? "text-slate-400" : "text-blue-600"}`}
          >
            {form.notFault ? "고장아님" : "고장"}
          </button>
        </TimelineInput>
        <TimelineInput icon={User} label="배정자" last>
          <select className={tlInputCls} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
            <option value="">배정자를 선택해주세요</option>
            {engineerNames.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </TimelineInput>
      </div>

      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-600">고객안심 출동문자 발송</span>
        <button onClick={() => setForm({ ...form, sendSms: !form.sendSms })}>
          <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${form.sendSms ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
            <div className="w-4 h-4 rounded-full bg-white" />
          </div>
        </button>
      </div>
      {form.sendSms && (
        <p className="px-5 pt-1 text-[11px] text-blue-600 leading-relaxed">
          접수완료시 신고자 전화번호로 고장처리 상태와 기사님의 실시간 위치가 전송됩니다
        </p>
      )}

      <div className="px-5 pt-6">
        <PrimaryButton onClick={submit} disabled={!canSubmit}>접수완료</PrimaryButton>
        {!form.reporterPhone.trim() && form.siteId && (
          <p className="text-[11px] text-red-500 text-center mt-2">신고자 전화번호는 필수 입력 항목입니다</p>
        )}
      </div>
    </div>
  );
}

function FailureUnassignedList({ failures, setFailures }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const list = failures.filter((f) => !f.assignee && f.status === "미처리");
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <FilterBar startDate="2026년 07월 10일 金" endDate="2026년 07월 10일 金" />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">미배정 고장이 없습니다</p>
        ) : (
          list.map((f) => {
            const site = sites.find((s) => s.id === f.siteId);
            return (
              <div key={f.id} className="flex rounded-xl overflow-hidden border border-slate-200 bg-white">
                <div className="w-1.5 bg-red-500 shrink-0" />
                <div className="flex-1 p-3.5">
                  <p className="font-bold text-slate-800 text-[15px]">
                    {f.siteName} {f.elevatorNo} <span className="text-slate-400 font-normal text-sm">({site?.contractType ?? "일반계약"})</span>
                  </p>
                  <p className="text-sm text-slate-500 mt-1">{f.reportedAt.replace(" ", " / ")}</p>
                  <div className="mt-2.5 bg-blue-500 text-white text-sm font-semibold rounded-lg px-3 py-2.5">
                    {f.errorCode}
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from("failures").update({ assignee: CURRENT_ENGINEER }).eq("id", f.id);
                      setFailures((prev) => prev.map((x) => (x.id === f.id ? { ...x, assignee: CURRENT_ENGINEER } : x)));
                    }}
                    className="w-full mt-2.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    나에게 배정하기
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FailureProcessDetail({ failure, onBack, onSave }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER, engineerNames } = useContext(AuthContext);
  const site = sites.find((s) => s.id === failure.siteId);
  const [form, setForm] = useState({
    arrivalTime: "",
    completeTime: "",
    processor2: "",
    result: "",
    faultFactor: "",
    faultPart: "",
    detailPart: "",
    processContent: "",
    faultDetailNote: "",
    processDetailNote: "",
    postCareNote: "",
    customerRequestNote: "",
  });
  const nowTime = () => new Date().toTimeString().slice(0, 5);

  const resultToStatus = {
    "정상처리": "완료",
    "부분처리(재방문 필요)": "진행중",
    "처리불가(자재 대기)": "진행중",
  };

  function submit() {
    if (!form.result) return;
    onSave({
      status: resultToStatus[form.result] ?? failure.status,
      arrivalTime: form.arrivalTime,
      completeTime: form.completeTime,
      processResult: form.result,
      processNote: form.processDetailNote,
    });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="고장 처리등록" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-24">
        <div className="bg-white overflow-visible">
          <TimelineRow icon={PhoneCall} label="전화번호" value={site?.phone ?? "-"} />
          <TimelineRow icon={Home} label="주소" value={site?.address ?? "-"} />
          <TimelineInput icon={Settings} label="호기">
            <span className={tlInputCls}>{failure.elevatorNo}</span>
          </TimelineInput>
          <TimelineRow icon={PackageX} label="고장아님(다발아님)" value={failure.notFault ? "비고장" : "고장"} />
          <TimelineInput icon={ClipboardCheck} label="도착시간">
            {form.arrivalTime ? (
              <span className={tlInputCls}>{form.arrivalTime}</span>
            ) : (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, arrivalTime: nowTime() })}
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg"
                >
                  직접등록
                </button>
                <button type="button" className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                  QR 코드등록
                </button>
              </div>
            )}
          </TimelineInput>
          <TimelineInput icon={ClipboardCheck} label="완료시간">
            {form.completeTime ? (
              <span className={tlInputCls}>{form.completeTime}</span>
            ) : (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, completeTime: nowTime() })}
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg"
                >
                  직접등록
                </button>
                <button type="button" className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                  QR 코드등록
                </button>
              </div>
            )}
          </TimelineInput>
          <TimelineRow icon={User} label="처리자" value={CURRENT_ENGINEER} />
          <TimelineInput icon={User} label="(지원)처리자2" last>
            <select className={tlInputCls} value={form.processor2} onChange={(e) => setForm({ ...form, processor2: e.target.value })}>
              <option value="">선택하세요</option>
              {engineerNames.filter((e) => e !== CURRENT_ENGINEER).map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </TimelineInput>
        </div>

        <p className="px-5 pt-5 pb-2 flex items-center justify-between text-xs font-bold text-slate-400">
          입력란 <span className="text-blue-600">필수입력</span>
        </p>
        <div className="bg-white overflow-visible">
          <TimelineInput icon={Check} label="처리결과" required>
            <select className={tlInputCls} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
              <option value="">선택하세요</option>
              {PROCESS_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </TimelineInput>
          <TimelineRow icon={PackageX} label="고장내용" value={failure.errorCode} />
          <TimelineInput icon={PackageX} label="고장요인">
            <select className={tlInputCls} value={form.faultFactor} onChange={(e) => setForm({ ...form, faultFactor: e.target.value })}>
              <option value="">선택하세요</option>
              {FAULT_FACTORS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </TimelineInput>
          <TimelineInput icon={ClipboardCheck} label="고장부위">
            <select className={tlInputCls} value={form.faultPart} onChange={(e) => setForm({ ...form, faultPart: e.target.value })}>
              <option value="">선택하세요</option>
              {FAULT_PARTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </TimelineInput>
          <TimelineInput icon={ClipboardCheck} label="상세부위">
            <select className={tlInputCls} value={form.detailPart} onChange={(e) => setForm({ ...form, detailPart: e.target.value })}>
              <option value="">선택하세요</option>
              {DETAIL_PARTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </TimelineInput>
          <TimelineInput icon={ClipboardCheck} label="처리내용" last>
            <select className={tlInputCls} value={form.processContent} onChange={(e) => setForm({ ...form, processContent: e.target.value })}>
              <option value="">선택하세요</option>
              {PROCESS_CONTENTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </TimelineInput>
        </div>

        <div className="px-5 pt-5">
          <p className="text-xs font-bold text-slate-400 mb-2">고장원인상세</p>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="입력하세요"
            value={form.faultDetailNote}
            onChange={(e) => setForm({ ...form, faultDetailNote: e.target.value })}
          />
        </div>
        <div className="px-5 pt-4">
          <p className="text-xs font-bold text-slate-400 mb-2">처리내용상세</p>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="입력하세요"
            value={form.processDetailNote}
            onChange={(e) => setForm({ ...form, processDetailNote: e.target.value })}
          />
        </div>
        <div className="px-5 pt-4">
          <p className="text-xs font-bold text-slate-400 mb-2">사후관리사항</p>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="입력하세요"
            value={form.postCareNote}
            onChange={(e) => setForm({ ...form, postCareNote: e.target.value })}
          />
        </div>
        <div className="px-5 pt-4">
          <p className="text-xs font-bold text-slate-400 mb-2">고객요구사항</p>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="입력하세요"
            value={form.customerRequestNote}
            onChange={(e) => setForm({ ...form, customerRequestNote: e.target.value })}
          />
        </div>

        <div className="px-5 pt-5 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-600">첨부</span>
          <button type="button" className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
            <Camera size={13} /> 사진
          </button>
        </div>

        <div className="px-5 pt-6">
          <PrimaryButton onClick={submit} disabled={!form.result}>처리완료</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function FailureProcessRegister({ failures, setFailures }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [showProcessing, setShowProcessing] = useState(false);
  const [selected, setSelected] = useState(null);
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const waiting = mine.filter((f) => f.status === "미처리" || (showProcessing && f.status === "진행중"));
  const done = mine.filter((f) => f.status === "완료");

  if (selected) {
    return (
      <FailureProcessDetail
        failure={selected}
        onBack={() => setSelected(null)}
        onSave={async (updates) => {
          await supabase
            .from("failures")
            .update({
              status: updates.status,
              arrival_time: updates.arrivalTime,
              complete_time: updates.completeTime,
              process_result: updates.processResult,
              process_note: updates.processNote,
            })
            .eq("id", selected.id);
          setFailures((prev) => prev.map((x) => (x.id === selected.id ? { ...x, ...updates } : x)));
          setSelected(null);
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <FilterBar
        pills={[
          { label: "현장", value: "전체" },
          { label: "담당자", value: CURRENT_ENGINEER, active: true },
          { label: "부서", value: "전체" },
        ]}
        startDate="2026년 07월 01일 水"
        endDate="2026년 07월 31일 金"
      />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-700">등록대기</p>
        </div>
        <div className="space-y-2 mb-5">
          {waiting.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">등록 대기중인 고장이 없습니다</p>
          ) : (
            waiting.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-3.5 active:bg-slate-50"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-slate-800 text-sm">{f.siteName} · {f.elevatorNo}</p>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${f.status === "진행중" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{f.status}</span>
                </div>
                <p className="text-xs text-slate-500">{f.errorCode}</p>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-700">처리완료</p>
          <button onClick={() => setShowProcessing((v) => !v)} className="flex items-center gap-1.5">
            <div className={`w-9 h-5 rounded-full flex items-center px-0.5 ${showProcessing ? "bg-blue-600 justify-end" : "bg-slate-300 justify-start"}`}>
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
            <span className="text-xs font-bold text-slate-500">처리중 보기</span>
          </button>
        </div>
        <div className="space-y-2">
          {done.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">처리완료된 고장이 없습니다</p>
          ) : (
            done.map((f) => (
              <div key={f.id} className="bg-white rounded-xl border border-slate-200 p-3.5 opacity-70">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-slate-800 text-sm">{f.siteName} · {f.elevatorNo}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">완료</span>
                </div>
                <p className="text-xs text-slate-500">{f.errorCode}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function FailureStatusOverview({ failures }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const mine = failures.filter((f) => f.assignee === CURRENT_ENGINEER);
  const myDone = mine.filter((f) => f.status === "완료").length;
  const myUndone = mine.filter((f) => f.status !== "완료").length;
  const allDone = failures.filter((f) => f.status === "완료").length;
  const allProcessing = failures.filter((f) => f.status === "진행중").length;
  const allUndone = failures.filter((f) => f.status === "미처리").length;
  const statusColor = { 미처리: "bg-red-100 text-red-700", 진행중: "bg-amber-100 text-amber-700", 완료: "bg-emerald-100 text-emerald-700" };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">내 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 처리 {myDone}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 미처리 {myUndone}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 처리 {allDone}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 처리중 {allProcessing}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 미처리 {allUndone}</span>
          </div>
        </div>
      </div>
      <FilterBar
        pills={[
          { label: "현장", value: "전체" },
          { label: "고장", value: "전체" },
          { label: "담당자", value: "전체", active: true },
          { label: "부서", value: "전체" },
        ]}
        startDate="2026년 07월 10일 金"
        endDate="2026년 07월 10일 金"
      />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {failures.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">고장 접수 이력이 없습니다</p>
        ) : (
          failures.map((f) => (
            <div key={f.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{f.siteName} · {f.elevatorNo}</p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusColor[f.status]}`}>{f.status}</span>
              </div>
              <p className="text-xs text-slate-500">{f.errorCode}</p>
              <p className="text-[11px] text-slate-400 mt-1">{f.reportedAt} 접수 · {f.assignee ?? "미배정"}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FailureTab({ failures, setFailures }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("접수등록");
  const subTabs = ["접수등록", "미배정", "처리등록", "처리현황"];
  const unassignedCount = failures.filter((f) => !f.assignee && f.status === "미처리").length;
  const waitingCount = failures.filter((f) => f.assignee === CURRENT_ENGINEER && f.status === "미처리").length;
  const badgeCount = { 미배정: unassignedCount, 처리등록: waitingCount };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold shrink-0 px-1.5 whitespace-nowrap flex items-center justify-center gap-1 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {!!badgeCount[t] && (
              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{badgeCount[t]}</span>
            )}
            {t}
          </button>
        ))}
      </div>
      {subTab === "접수등록" && <FailureRegisterForm setFailures={setFailures} goToUnassigned={() => setSubTab("미배정")} />}
      {subTab === "미배정" && <FailureUnassignedList failures={failures} setFailures={setFailures} />}
      {subTab === "처리등록" && <FailureProcessRegister failures={failures} setFailures={setFailures} />}
      {subTab === "처리현황" && <FailureStatusOverview failures={failures} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CHECKUP (정기점검)                                                    */
/* ------------------------------------------------------------------ */

function CheckupTab() {
  const [subTab, setSubTab] = useState("달력");
  const [openForm, setOpenForm] = useState(false);
  const unassigned = ["동일빌딩 1호기", "서초타워 3호기", "가산프라자 1호기"];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const checkedDays = [2, 3, 4, 8, 9, 10, 11, 15, 16];
  const weekLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const padCount = 3; // 2026-07-01은 수요일

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["달력", "계획", "처리"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {checkedDays.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {unassigned.length}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {checkedDays.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {unassigned.length}</span>
          </div>
        </div>
      </div>

      {subTab === "달력" ? (
        <FilterBar
          pills={[
            { label: "현장", value: "전체" },
            { label: "담당자", value: "전체" },
            { label: "부서", value: "전체", active: true },
            { label: "해당월", value: "2026년 07월", active: true },
          ]}
        />
      ) : (
        <FilterBar
          pills={[
            { label: "현장", value: "전체" },
            { label: "담당자", value: "전체" },
            { label: "부서", value: "전체", active: true },
          ]}
          startDate="2026년 07월 01일 水"
          endDate="2026년 07월 10일 金"
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {subTab === "달력" && (
          <div className="px-5 pt-4 pb-4">
            <div className="grid grid-cols-7 text-center text-sm font-bold mb-3">
              {weekLabels.map((d, idx) => (
                <div key={d} className={idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-slate-700"}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-4 text-center">
              {Array.from({ length: padCount }).map((_, i) => <div key={"pad" + i} />)}
              {days.map((d) => {
                const dow = (d + padCount - 1) % 7;
                const isToday = d === 10;
                const colorCls = isToday ? "text-white" : dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-slate-700";
                return (
                  <div key={d} className="flex justify-center">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-blue-500" : ""} ${colorCls}`}>
                      {d}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {subTab === "계획" && (
          <div className="px-5 pt-4">
            <h3 className="font-bold text-slate-800 text-sm mb-2">이번 달 나에게 할당된 미배정 현장</h3>
            <div className="space-y-2">
              {unassigned.map((u) => (
                <div key={u} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{u}</p>
                  <button onClick={() => setOpenForm(u)} className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg">
                    일정 등록
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {subTab === "처리" && (
          <div className="px-5 pt-10 text-center">
            <p className="text-xs text-slate-400">해당 기간에 처리된 점검이 없습니다</p>
          </div>
        )}
      </div>

      {openForm && (
        <Sheet title={`${openForm} 점검 등록`} onClose={() => setOpenForm(false)}>
          <Field label="점검 예정일"><input type="date" className={inputCls} defaultValue="2026-07-14" /></Field>
          <Field label="점검 사진"><PhotoUpload label="표준 화질 점검 사진 등록" /></Field>
          <Field label="특이사항"><textarea className={inputCls} rows={3} placeholder="예: 로프 장력 미세 저하, 다음 점검 시 재확인 필요" /></Field>
          <PrimaryButton onClick={() => setOpenForm(false)}>일정 저장</PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* INSPECTION (검사관리) - centerpiece                                  */
/* ------------------------------------------------------------------ */

function InspectionTab({ inspections, setInspections }) {
  const sites = useContext(SitesContext);
  const [subTab, setSubTab] = useState("검사도래현장");
  const [openRegister, setOpenRegister] = useState(null); // inspection object or null
  const [form, setForm] = useState({});

  const dueSoon = [...inspections]
    .filter((i) => !i.result)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const flagged = [...inspections]
    .filter((i) => i.result === "conditional" || i.result === "fail")
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  function startRegister(insp) {
    setForm({
      siteId: insp.siteId,
      type: insp.type,
      org: insp.org,
      result: "",
      nextDate: "",
      notes: "",
    });
    setOpenRegister(insp);
  }

  async function submit() {
    const nextDueDate = form.nextDate || openRegister.dueDate;
    await supabase
      .from("inspections")
      .update({ result: form.result, notes: form.notes, due_date: nextDueDate })
      .eq("id", openRegister.id);
    setInspections((prev) =>
      prev.map((i) => (i.id === openRegister.id ? { ...i, result: form.result, notes: form.notes, dueDate: nextDueDate } : i))
    );
    setOpenRegister(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["검사도래현장", "조건부/불합격 현장"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-xs font-bold whitespace-nowrap px-1.5 ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 py-4 flex items-start shrink-0">
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {dueSoon.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {flagged.length}</span>
          </div>
        </div>
        <div className="w-px self-stretch bg-slate-200 mx-3" />
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-700 mb-1.5">전체 진행상황</p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 도래 {dueSoon.length}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> 조건부/불합격 {flagged.length}</span>
          </div>
        </div>
      </div>

      <FilterBar
        pills={[
          { label: "현장", value: "전체" },
          { label: "담당자", value: "전체" },
          { label: "부서", value: "전체", active: true },
        ]}
        startDate="2026년 07월 01일 水"
        endDate="2026년 08월 31일 月"
      />

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
        {subTab === "검사도래현장" ? (
          dueSoon.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">도래한 검사 현장이 없습니다</p>
          ) : (
            dueSoon.map((insp) => (
              <div key={insp.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-bold text-slate-800 text-sm">{insp.siteName} · {insp.elevatorNo}</p>
                  <DDay dueDate={insp.dueDate} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-500">{insp.type}</span>
                  <span className="text-slate-300 text-xs">·</span>
                  <span className="text-xs text-slate-500">{insp.org}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">검사 결과 미등록</span>
                  <button
                    onClick={() => startRegister(insp)}
                    className="text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg active:bg-blue-800"
                  >
                    결과 등록
                  </button>
                </div>
              </div>
            ))
          )
        ) : flagged.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">조건부·불합격 현장이 없습니다</p>
        ) : (
          flagged.map((insp) => (
            <div key={insp.id} className="bg-white rounded-xl border border-red-100 p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-bold text-slate-800 text-sm">{insp.siteName} · {insp.elevatorNo}</p>
                <Badge result={insp.result} />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-500">{insp.type}</span>
                <span className="text-slate-300 text-xs">·</span>
                <span className="text-xs text-slate-500">{insp.org}</span>
              </div>
              <p className="text-[11px] text-red-600 leading-relaxed mb-2.5">지적사항: {insp.notes}</p>
              <div className="flex items-center justify-between">
                {insp.result === "fail" && <span className="text-[11px] text-red-500 font-semibold">재검사 필요</span>}
                <button
                  onClick={() => startRegister(insp)}
                  className="ml-auto text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg active:bg-blue-800"
                >
                  재검사 결과 등록
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {openRegister && (
        <Sheet title="검사 결과 등록" onClose={() => setOpenRegister(null)}>
          <Field label="현장">
            <select className={inputCls} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.elevatorNo}</option>)}
            </select>
          </Field>
          <Field label="검사 구분">
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {["정기검사", "정밀안전검사", "수시검사", "재검사"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="검사 기관">
            <select className={inputCls} value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })}>
              <option>한국승강기안전공단</option>
              <option>지정검사기관 A</option>
              <option>지정검사기관 B</option>
            </select>
          </Field>
          <Field label="검사 판정">
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "pass", label: "합격", emoji: "🟢", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
                { v: "conditional", label: "조건부합격", emoji: "🟡", cls: "border-amber-300 bg-amber-50 text-amber-700" },
                { v: "fail", label: "불합격", emoji: "🔴", cls: "border-red-300 bg-red-50 text-red-700" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setForm({ ...form, result: opt.v })}
                  className={`rounded-xl border-2 py-3 flex flex-col items-center gap-1 text-xs font-bold ${form.result === opt.v ? opt.cls + " ring-2 ring-offset-1 ring-blue-400" : "border-slate-200 text-slate-400"}`}
                >
                  <span className="text-lg leading-none">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          {form.result && form.result !== "fail" && (
            <Field label="차기 검사 예정일 (유효기간)">
              <input type="date" className={inputCls} value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} />
            </Field>
          )}
          <Field label="증빙 서류 사진">
            <PhotoUpload label="검사합격증 · 검사필증 사진 등록" />
          </Field>
          <Field label="지적사항 및 특이사항">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="조건부합격 · 불합격 시 보완할 내용을 적어주세요"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <PrimaryButton disabled={!form.result} onClick={submit}>
            검사 결과 제출
          </PrimaryButton>
          <p className="text-[11px] text-slate-400 text-center mt-2">제출 시 본사 관리자 페이지로 즉시 연동됩니다</p>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MATERIAL (자재·견적)                                                  */
/* ------------------------------------------------------------------ */

function SiteSearchSelect({ value, onChange, placeholder = "현장명을 검색하세요" }) {
  const sites = useContext(SitesContext);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = sites.find((s) => s.id === value);
  const filtered = sites.filter((s) => s.name.includes(query.trim()));

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputCls} pl-8`}
          placeholder={placeholder}
          value={open ? query : selected ? `${selected.name} · ${selected.elevatorNo}` : ""}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => { onChange(s.id); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
            >
              <span className="font-semibold text-slate-700">{s.name}</span>
              <span className="text-slate-400 text-xs ml-1.5">{s.address}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-3">검색 결과가 없습니다</p>}
        </div>
      )}
    </div>
  );
}

function MultiPhotoUpload({ photos, onAdd, onRemove, label, required = true }) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative aspect-square rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
            <ImageIcon size={16} className="text-slate-400" />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 active:bg-slate-50"
        >
          <Camera size={16} />
          <span className="text-[9px] font-semibold mt-0.5">추가</span>
        </button>
      </div>
      <p className={`text-[10px] ${required && photos.length === 0 ? "text-red-500 font-semibold" : "text-slate-400"}`}>
        {label} · {required ? "최소 1장 필수, " : ""}장수 제한 없음 · 현재 {photos.length}장
      </p>
    </div>
  );
}

function MaterialHistoryScreen({ requests, isBilled, onBack }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const stages = ["전체", "승인대기", "지급완료", "반려", "비용청구완료"];

  const withStage = requests.map((r) => ({ ...r, displayStage: isBilled(r.id) ? "비용청구완료" : r.status }));
  const filtered = withStage
    .filter((r) => stage === "전체" || r.displayStage === stage)
    .filter((r) => r.siteName.includes(query.trim()) || r.part.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 자재 신청 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 부품명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 신청 내역이 없습니다</p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl border p-3 ${r.status === "반려" ? "border-red-200" : "border-slate-200"}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{r.siteName} · {r.part}</p>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                    r.displayStage === "비용청구완료" ? "bg-slate-100 text-slate-500" :
                    r.displayStage === "지급완료" ? "bg-emerald-100 text-emerald-700" :
                    r.displayStage === "반려" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.displayStage === "비용청구완료" ? "비용청구 완료" : r.displayStage}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{r.urgency} · 신청일 {r.requestedDate}{r.suppliedDate ? ` · 지급일 ${r.suppliedDate}` : ""}</p>
              {r.status === "반려" && r.rejectReason && (
                <p className="text-[11px] text-red-600 mt-1.5">반려 사유: {r.rejectReason}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QuoteHistoryScreen({ quoteRequests, isQuoteBilled, onBack }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const stages = ["전체", "요청접수", "견적발행", "승인", "자재지급완료", "비용청구완료"];

  const withStage = quoteRequests.map((q) => ({ ...q, displayStage: isQuoteBilled(q.id) ? "비용청구완료" : q.status }));
  const filtered = withStage
    .filter((q) => stage === "전체" || q.displayStage === stage)
    .filter((q) => q.siteName.includes(query.trim()) || q.constructionType.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 견적 요청 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 부품명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 견적 요청 내역이 없습니다</p>
        ) : (
          filtered.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{q.siteName} · {q.constructionType}</p>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                    q.displayStage === "비용청구완료" ? "bg-slate-100 text-slate-500" :
                    q.displayStage === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                    q.displayStage === "승인" ? "bg-indigo-100 text-indigo-700" :
                    q.displayStage === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {q.displayStage === "비용청구완료" ? "비용청구 완료" : q.displayStage}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">신청일 {q.requestedDate}{q.suppliedDate ? ` · 지급일 ${q.suppliedDate}` : ""}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RestockHistoryScreen({ restockRequests, onBack }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("전체");
  const [photoViewTarget, setPhotoViewTarget] = useState(null);
  const stages = ["전체", "대기", "완료"];

  const filtered = restockRequests
    .filter((r) => stage === "전체" || r.status === stage)
    .filter((r) => r.part.includes(query.trim()) || r.siteName.includes(query.trim()))
    .sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="나의 상비부품 보충 전체보기" onBack={onBack} onHome={onBack} />
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="부품명 또는 현장명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${stage === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 보충 내역이 없습니다</p>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{r.part}</p>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                    r.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {r.siteName}에서 사용 · 요청일 {r.requestedDate}{r.suppliedDate ? ` · 보충일 ${r.suppliedDate}` : ""}
              </p>
              {r.status === "완료" && (
                <button
                  onClick={() => setPhotoViewTarget({ title: r.part, subtitle: `${r.suppliedDate} 보충 · 자재 담당자 등록` })}
                  className="w-full mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 active:bg-emerald-100"
                >
                  <span className="text-[11px] text-emerald-600 font-semibold">지급완료 사진 확인하기</span>
                  <ChevronRight size={13} className="text-emerald-600" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {photoViewTarget && (
        <Sheet title="지급 자재 사진" onClose={() => setPhotoViewTarget(null)}>
          <div className="bg-slate-100 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-slate-800">{photoViewTarget.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{photoViewTarget.subtitle}</p>
          </div>
          <PhotoThumb caption="자재 담당자가 등록한 지급 자재 사진" />
        </Sheet>
      )}
    </div>
  );
}

function emptyPartRow() {
  return { id: Date.now() + Math.random(), name: "", qty: "", unit: "" };
}

function formatPartRows(rows) {
  return rows
    .filter((r) => r.name.trim() && r.qty && r.unit.trim())
    .map((r) => `${r.name.trim()} ${r.qty}${r.unit.trim()}`)
    .join(", ");
}

function PartsRowsInput({ rows, setRows }) {
  function updateRow(id, field, value) {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows([...rows, emptyPartRow()]);
  }
  function removeRow(id) {
    if (rows.length === 1) return;
    setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-1.5 px-0.5">
        <span className="text-[10px] font-bold text-slate-400" style={{ flex: 2 }}>부품명</span>
        <span className="text-[10px] font-bold text-slate-400" style={{ flex: 1 }}>수량</span>
        <span className="text-[10px] font-bold text-slate-400" style={{ flex: 1 }}>단위</span>
        <span className="w-5 shrink-0" />
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex gap-1.5 items-center">
            <input
              className={inputCls}
              style={{ flex: 2 }}
              placeholder="예: 인버터"
              value={row.name}
              onChange={(e) => updateRow(row.id, "name", e.target.value)}
            />
            <input
              type="number"
              min={1}
              className={inputCls}
              style={{ flex: 1 }}
              placeholder="1"
              value={row.qty}
              onChange={(e) => updateRow(row.id, "qty", e.target.value)}
            />
            <input
              className={inputCls}
              style={{ flex: 1 }}
              placeholder="개"
              value={row.unit}
              onChange={(e) => updateRow(row.id, "unit", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 disabled:opacity-0"
              disabled={rows.length === 1}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="w-full mt-2 border-2 border-dashed border-slate-300 rounded-lg py-2 text-xs font-bold text-slate-500 flex items-center justify-center gap-1 active:bg-slate-50"
      >
        <Plus size={13} /> 추가하기
      </button>
    </div>
  );
}

function MaterialTab({ requests, setRequests, todos, onReject, quoteRequests, setQuoteRequests, restockRequests }) {
  const sites = useContext(SitesContext);
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const [sub, setSub] = useState("material");
  const [form, setForm] = useState({ siteId: "", parts: [emptyPartRow()], urgency: "일반", photos: [], note: "" });
  const [quoteForm, setQuoteForm] = useState({ siteId: "", parts: [emptyPartRow()], contactPhone: "", photos: [], note: "" });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [photoViewTarget, setPhotoViewTarget] = useState(null);
  const [showMaterialHistory, setShowMaterialHistory] = useState(false);
  const [showQuoteHistory, setShowQuoteHistory] = useState(false);
  const [showRestockHistory, setShowRestockHistory] = useState(false);

  const formPartText = formatPartRows(form.parts);

  async function addRequest() {
    if (!form.siteId || !formPartText || form.photos.length === 0) return;
    const site = sites.find((s) => s.id === form.siteId);
    const newRequest = {
      id: "m" + Date.now(),
      siteId: form.siteId,
      siteName: site.name,
      part: formPartText,
      urgency: form.urgency,
      note: form.note,
      photoCount: form.photos.length,
      engineer: CURRENT_ENGINEER,
      requestedDate: TODAY_STR,
      status: "승인대기",
      suppliedDate: null,
      rejectReason: null,
    };
    await supabase.from("material_requests").insert({
      id: newRequest.id,
      site_id: newRequest.siteId,
      site_name: newRequest.siteName,
      part: newRequest.part,
      urgency: newRequest.urgency,
      note: newRequest.note,
      photo_count: newRequest.photoCount,
      engineer: newRequest.engineer,
      requested_date: newRequest.requestedDate,
      status: newRequest.status,
    });
    setRequests((prev) => [newRequest, ...prev]);
    setForm({ siteId: "", parts: [emptyPartRow()], urgency: "일반", photos: [], note: "" });
  }

  function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    onReject(rejectTarget.id, rejectReason.trim());
    setRejectTarget(null);
    setRejectReason("");
  }

  // 이미 비용청구까지 끝난 건은 반려 불가 (연결된 할일이 완료 상태인 경우)
  function isBilled(requestId) {
    const t = todos.find((x) => x.materialRequestId === requestId);
    return t?.done === true;
  }

  function isQuoteBilled(quoteId) {
    const t = todos.find((x) => x.quoteRequestId === quoteId);
    return t?.done === true;
  }

  const myRequests = requests.filter((r) => r.engineer === CURRENT_ENGINEER && !isBilled(r.id));
  const myQuotes = quoteRequests.filter((q) => q.engineer === CURRENT_ENGINEER && !isQuoteBilled(q.id));
  const quoteFormText = formatPartRows(quoteForm.parts);
  const quoteValid = quoteForm.siteId && quoteFormText && quoteForm.contactPhone && quoteForm.photos.length > 0;

  async function submitQuote() {
    if (!quoteValid) return;
    const site = sites.find((s) => s.id === quoteForm.siteId);
    const newQuote = {
      id: "q" + Date.now(),
      siteId: quoteForm.siteId,
      siteName: site.name,
      constructionType: quoteFormText,
      contactPhone: quoteForm.contactPhone,
      note: quoteForm.note,
      photoCount: quoteForm.photos.length,
      engineer: CURRENT_ENGINEER,
      requestedDate: TODAY_STR,
      status: "요청접수",
      quoteIssuedDate: null,
      approvedDate: null,
      suppliedDate: null,
      hasSupplyPhoto: false,
    };
    await supabase.from("quote_requests").insert({
      id: newQuote.id,
      site_id: newQuote.siteId,
      site_name: newQuote.siteName,
      construction_type: newQuote.constructionType,
      contact_phone: newQuote.contactPhone,
      note: newQuote.note,
      photo_count: newQuote.photoCount,
      engineer: newQuote.engineer,
      requested_date: newQuote.requestedDate,
      status: newQuote.status,
    });
    setQuoteRequests((prev) => [newQuote, ...prev]);
    setQuoteForm({ siteId: "", parts: [emptyPartRow()], contactPhone: "", photos: [], note: "" });
  }

  if (showMaterialHistory) {
    return (
      <MaterialHistoryScreen
        requests={requests.filter((r) => r.engineer === CURRENT_ENGINEER)}
        isBilled={isBilled}
        onBack={() => setShowMaterialHistory(false)}
      />
    );
  }

  if (showQuoteHistory) {
    return (
      <QuoteHistoryScreen
        quoteRequests={quoteRequests.filter((q) => q.engineer === CURRENT_ENGINEER)}
        isQuoteBilled={isQuoteBilled}
        onBack={() => setShowQuoteHistory(false)}
      />
    );
  }

  if (showRestockHistory) {
    return (
      <RestockHistoryScreen
        restockRequests={restockRequests.filter((r) => r.engineer === CURRENT_ENGINEER)}
        onBack={() => setShowRestockHistory(false)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-5 pt-4 flex gap-2">
        <button onClick={() => setSub("material")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${sub === "material" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
          자재신청
        </button>
        <button onClick={() => setSub("quote")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${sub === "quote" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
          견적 요청
        </button>
      </div>

      {sub === "material" ? (
        <>
          <div className="px-5 pt-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
              <Field label="현장 선택">
                <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id })} />
              </Field>
              <Field label="부품 내역 (부품명, 수량, 단위)">
                <PartsRowsInput rows={form.parts} setRows={(rows) => setForm({ ...form, parts: rows })} />
              </Field>
              <Field label="긴급도">
                <div className="flex gap-2">
                  {["일반", "긴급"].map((u) => (
                    <button key={u} onClick={() => setForm({ ...form, urgency: u })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.urgency === u ? "bg-blue-700 text-white border-blue-700" : "bg-white border-slate-300 text-slate-500"}`}>
                      {u}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="부품 규격 사진">
                <MultiPhotoUpload
                  photos={form.photos}
                  onAdd={() => setForm({ ...form, photos: [...form.photos, Date.now()] })}
                  onRemove={(idx) => setForm({ ...form, photos: form.photos.filter((_, i) => i !== idx) })}
                  label="교체할 부품 규격/모델명이 보이도록 촬영"
                />
              </Field>
              <Field label="기사 의견 (교체 사유 및 특이사항)">
                <textarea
                  className={inputCls}
                  rows={3}
                  placeholder="예: 도어 롤러 마모로 소음 발생, 조속 교체 필요"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
              <PrimaryButton onClick={addRequest} disabled={!form.siteId || !formPartText || form.photos.length === 0}>신청하기</PrimaryButton>
              <p className="text-[11px] text-slate-400 text-center mt-2">신청 후 자재 담당자의 지급 완료 처리 시 할 일이 자동 생성됩니다</p>
            </div>
          </div>
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">나의 신청 현황</h3>
              <button onClick={() => setShowMaterialHistory(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {myRequests.map((r) => (
                <div key={r.id} className={`bg-white rounded-xl border p-3 ${r.status === "반려" ? "border-red-200" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{r.siteName} · {r.part}</p>
                      <p className="text-[11px] text-slate-400">{r.urgency} · 신청일 {r.requestedDate} · 사진 {r.photoCount ?? 1}장</p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                        r.status === "지급완료" ? "bg-emerald-100 text-emerald-700" : r.status === "반려" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  {r.note && <p className="text-[11px] text-slate-500 mt-1.5">기사 의견: {r.note}</p>}

                  {r.status === "지급완료" && (
                    <>
                      {r.hasSupplyPhoto && (
                        <div className="mt-2">
                          <PhotoThumb caption="자재 담당자가 등록한 사진 · 이 자재를 챙겨가세요" />
                        </div>
                      )}
                      <p className="text-[11px] text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
                        <PackageCheck size={12} /> {r.suppliedDate} 지급완료 · 할 일이 자동 생성되었습니다
                      </p>
                      {isBilled(r.id) ? (
                        <p className="text-[11px] text-slate-400 mt-1.5">비용청구 완료 · 반려 불가</p>
                      ) : (
                        <button
                          onClick={() => { setRejectTarget(r); setRejectReason(""); }}
                          className="w-full mt-2 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 text-xs font-bold py-2 rounded-lg active:bg-red-50"
                        >
                          <PackageX size={13} /> 자재가 잘못 나왔어요 · 반려하기
                        </button>
                      )}
                    </>
                  )}

                  {r.status === "반려" && (
                    <div className="mt-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
                      <p className="text-[11px] text-red-600 font-semibold">반려 사유: {r.rejectReason}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">자재 담당자가 재확인 후 다시 지급할 예정입니다</p>
                    </div>
                  )}
                </div>
              ))}
              {myRequests.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">신청 내역이 없습니다</p>
              )}
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">나의 상비부품 보충 현황</h3>
              <button onClick={() => setShowRestockHistory(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {(() => {
                const mine = restockRequests.filter((r) => r.engineer === CURRENT_ENGINEER);
                const pending = mine.filter((r) => r.status === "대기");
                const recentDone = mine
                  .filter((r) => r.status === "완료")
                  .sort((a, b) => new Date(b.suppliedDate) - new Date(a.suppliedDate))
                  .slice(0, 3);
                const preview = [...pending, ...recentDone];
                if (preview.length === 0) {
                  return <p className="text-xs text-slate-400 text-center py-4">보충 요청 내역이 없습니다</p>;
                }
                return preview.map((r) => (
                  <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">{r.part}</p>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                          r.status === "완료" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {r.siteName}에서 사용 · 요청일 {r.requestedDate}{r.suppliedDate ? ` · 보충일 ${r.suppliedDate}` : ""}
                    </p>
                    {r.status === "완료" && (
                      <button
                        onClick={() => setPhotoViewTarget({ title: r.part, subtitle: `${r.suppliedDate} 보충 · 자재 담당자 등록` })}
                        className="w-full mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 active:bg-emerald-100"
                      >
                        <span className="text-[11px] text-emerald-600 font-semibold">지급완료 사진 확인하기</span>
                        <ChevronRight size={13} className="text-emerald-600" />
                      </button>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      ) : (
        <div className="px-5 pt-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
            <Field label="현장 선택">
              <SiteSearchSelect value={quoteForm.siteId} onChange={(id) => setQuoteForm({ ...quoteForm, siteId: id })} />
            </Field>
            <Field label="견적 내역 (부품명, 수량, 단위)">
              <PartsRowsInput rows={quoteForm.parts} setRows={(rows) => setQuoteForm({ ...quoteForm, parts: rows })} />
            </Field>
            <Field label="현장 견적 담당자 전화번호">
              <input
                className={inputCls}
                placeholder="예: 010-1234-5678"
                value={quoteForm.contactPhone}
                onChange={(e) => setQuoteForm({ ...quoteForm, contactPhone: e.target.value })}
              />
            </Field>
            <Field label="현장 상태 사진">
              <MultiPhotoUpload
                photos={quoteForm.photos}
                onAdd={() => setQuoteForm({ ...quoteForm, photos: [...quoteForm.photos, Date.now()] })}
                onRemove={(idx) => setQuoteForm({ ...quoteForm, photos: quoteForm.photos.filter((_, i) => i !== idx) })}
                label="견적이 필요한 현장 상태 촬영"
              />
            </Field>
            <Field label="기사 의견 (견적 사유 및 특이사항)">
              <textarea
                className={inputCls}
                rows={3}
                placeholder="현장 상태 및 견적 필요 사유를 적어주세요"
                value={quoteForm.note}
                onChange={(e) => setQuoteForm({ ...quoteForm, note: e.target.value })}
              />
            </Field>
            <PrimaryButton onClick={submitQuote} disabled={!quoteValid}>견적 요청하기</PrimaryButton>
          </div>

          <div className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-800 text-sm">나의 견적 요청 현황</h3>
              <button onClick={() => setShowQuoteHistory(true)} className="text-xs font-bold text-blue-600 flex items-center gap-0.5">
                전체보기 <ChevronRight size={12} />
              </button>
            </div>
            <div className="space-y-2">
              {myQuotes.map((q) => (
                <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{q.siteName} · {q.constructionType}</p>
                      <p className="text-[11px] text-slate-400">신청일 {q.requestedDate} · 사진 {q.photoCount}장</p>
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                        q.status === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                        q.status === "승인" ? "bg-indigo-100 text-indigo-700" :
                        q.status === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {q.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2.5">
                    {QUOTE_STAGES.map((s, idx) => (
                      <React.Fragment key={s}>
                        {idx > 0 && <div className={`h-0.5 flex-1 ${QUOTE_STAGES.indexOf(q.status) >= idx ? "bg-blue-600" : "bg-slate-200"}`} />}
                        <div className={`w-2 h-2 rounded-full shrink-0 ${QUOTE_STAGES.indexOf(q.status) >= idx ? "bg-blue-600" : "bg-slate-200"}`} />
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex items-start mt-1">
                    {QUOTE_STAGES.map((s) => {
                      const dateMap = { 요청접수: q.requestedDate, 견적발행: q.quoteIssuedDate, 승인: q.approvedDate, 자재지급완료: q.suppliedDate };
                      const d = dateMap[s];
                      return (
                        <div key={s} className="flex-1 flex flex-col items-center gap-0.5 px-0.5 min-w-0">
                          <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap leading-none">{s}</span>
                          <span className="text-[9px] text-slate-300 whitespace-nowrap leading-none">{d ? d.slice(5).replace("-", "/") : "-"}</span>
                        </div>
                      );
                    })}
                  </div>
                  {q.status === "자재지급완료" && (
                    <button
                      onClick={() => setPhotoViewTarget({ title: `${q.siteName} · ${q.constructionType}`, subtitle: `${q.suppliedDate} 지급 · 자재 담당자 등록` })}
                      className="w-full mt-2.5 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 active:bg-emerald-100"
                    >
                      <span className="text-[11px] text-emerald-600 font-semibold">지급 자재 사진 확인하기</span>
                      <ChevronRight size={13} className="text-emerald-600" />
                    </button>
                  )}
                </div>
              ))}
              {myQuotes.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">견적 요청 내역이 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <Sheet title="자재 반려하기" onClose={() => setRejectTarget(null)}>
          <div className="bg-slate-100 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-slate-800">{rejectTarget.siteName} · {rejectTarget.part}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{rejectTarget.suppliedDate} 지급</p>
          </div>
          <Field label="반려 사유">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="예: 인버터 규격이 달라요 / 수량이 부족해요 등"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
          <p className="text-[11px] text-slate-400 mb-4">반려하면 이 건에 연결된 할 일이 취소되고, 자재 담당자에게 재지급 요청이 전달됩니다.</p>
          <PrimaryButton disabled={!rejectReason.trim()} onClick={submitReject} tone="red">
            반려 제출
          </PrimaryButton>
        </Sheet>
      )}

      {photoViewTarget && (
        <Sheet title="지급 자재 사진" onClose={() => setPhotoViewTarget(null)}>
          <div className="bg-slate-100 rounded-xl p-3 mb-4">
            <p className="text-sm font-bold text-slate-800">{photoViewTarget.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{photoViewTarget.subtitle}</p>
          </div>
          <PhotoThumb caption="자재 담당자가 등록한 지급 자재 사진" />
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BILLING (비용청구)                                                    */
/* ------------------------------------------------------------------ */

function BillingTab({ todos, setTodos, onSubmitBilling, onUseKitPart }) {
  const sites = useContext(SitesContext);
  const [mode, setMode] = useState("material"); // material | manual
  const openTodos = todos.filter((t) => !t.done);
  const [selectedId, setSelectedId] = useState(openTodos[0]?.id ?? "");
  const [materialCost, setMaterialCost] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [manualForm, setManualForm] = useState({ siteId: "", part: "", replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });

  const selected = todos.find((t) => t.id === selectedId);
  const manualValid = manualForm.siteId && manualForm.part.trim() && manualForm.replaceDate && manualForm.contactPhone.trim();

  async function submitMaterial() {
    if (!selected) return;
    await supabase.from("todos").update({ done: true }).eq("id", selected.id);
    setTodos((prev) => prev.map((t) => (t.id === selected.id ? { ...t, done: true } : t)));
    onSubmitBilling({
      type: "material",
      siteName: selected.siteName,
      part: selected.part,
      cost: materialCost,
      replaceDate: TODAY_STR,
      contactPhone: null,
    });
    setSubmitted({ siteName: selected.siteName, part: selected.part, manual: false });
    setSelectedId(openTodos.find((t) => t.id !== selected.id)?.id ?? "");
    setMaterialCost("");
    setTimeout(() => setSubmitted(null), 2600);
  }

  function submitManual() {
    if (!manualValid) return;
    const site = sites.find((s) => s.id === manualForm.siteId);
    onSubmitBilling({
      type: "manual",
      siteName: site.name,
      part: manualForm.part,
      cost: manualForm.cost,
      replaceDate: manualForm.replaceDate,
      contactPhone: manualForm.contactPhone,
    });
    if (manualForm.fromKit) {
      onUseKitPart({ part: manualForm.part, siteName: site.name });
    }
    setSubmitted({ siteName: site.name, part: manualForm.part, manual: true, fromKit: manualForm.fromKit });
    setManualForm({ siteId: "", part: "", replaceDate: TODAY_STR, contactPhone: "", cost: "", fromKit: false });
    setTimeout(() => setSubmitted(null), 2600);
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-5 pt-4 flex gap-2">
        <button
          onClick={() => setMode("material")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${mode === "material" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
        >
          자재 지급건
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${mode === "manual" ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-500"}`}
        >
          직접 입력
        </button>
      </div>

      {mode === "material" ? (
        openTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 text-center pt-16">
            <Receipt size={32} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">청구할 수 있는 자재 지급건이 없습니다</p>
            <p className="text-xs text-slate-400 mt-1.5">자재 담당자가 [자재 지급 완료] 처리를 해야<br />비용청구 대상 건이 여기에 나타납니다</p>
          </div>
        ) : (
          <div className="px-5 pt-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <Field label="청구 대상 건 (지급완료된 자재)">
                <select className={inputCls} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {openTodos.map((t) => (
                    <option key={t.id} value={t.id}>{t.siteName} · {t.part ?? t.title}</option>
                  ))}
                </select>
              </Field>
              {selected && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between">
                  <span className="text-xs text-blue-700 font-semibold">지급일 {selected.assignedDate} 기준</span>
                  <DDay dueDate={selected.dueDate} />
                </div>
              )}
              <Field label="교체 전 사진"><PhotoUpload label="교체 전 표준 화질 사진 등록" /></Field>
              <Field label="교체 후 사진"><PhotoUpload label="교체 후 표준 화질 사진 등록" /></Field>
              <Field label="교체확인서"><PhotoUpload label="교체확인서 종이 사진 등록" /></Field>
              <Field label="수리비">
                <input
                  type="number"
                  className={inputCls}
                  placeholder="예: 350000"
                  value={materialCost}
                  onChange={(e) => setMaterialCost(e.target.value)}
                />
              </Field>
              <PrimaryButton onClick={submitMaterial} disabled={!selected}>청구 요청 제출</PrimaryButton>
              {submitted && !submitted.manual && (
                <p className="text-xs text-emerald-600 font-bold text-center mt-3 flex items-center justify-center gap-1">
                  <Check size={14} /> 제출 완료 · "{submitted.siteName} {submitted.part}" 할 일이 자동 완료되었습니다
                </p>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="px-5 pt-4">
          <p className="text-[11px] text-slate-400 mb-3 px-1">자재 신청 없이 현장에서 바로 교체한 부품(예비 재고 사용 등)을 직접 입력해 청구합니다.</p>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-visible">
            <Field label="현장 선택">
              <SiteSearchSelect value={manualForm.siteId} onChange={(id) => setManualForm({ ...manualForm, siteId: id })} />
            </Field>
            <button
              type="button"
              onClick={() => setManualForm({ ...manualForm, fromKit: !manualForm.fromKit, part: "" })}
              className={`w-full flex items-center gap-2.5 border rounded-xl px-3.5 py-3 mb-4 text-left ${manualForm.fromKit ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${manualForm.fromKit ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                {manualForm.fromKit && <Check size={13} className="text-white" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">상비부품에서 사용함</p>
                <p className="text-[11px] text-slate-400 mt-0.5">체크하면 자재 담당자에게 보충 요청이 자동으로 전달됩니다</p>
              </div>
            </button>
            <Field label="교체 부품명">
              {manualForm.fromKit ? (
                <select
                  className={inputCls}
                  value={manualForm.part}
                  onChange={(e) => setManualForm({ ...manualForm, part: e.target.value })}
                >
                  <option value="">상비부품 목록에서 선택하세요</option>
                  {KIT_PARTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input
                  className={inputCls}
                  placeholder="예: 도어 롤러"
                  value={manualForm.part}
                  onChange={(e) => setManualForm({ ...manualForm, part: e.target.value })}
                />
              )}
            </Field>
            <Field label="교체일자">
              <input
                type="date"
                className={inputCls}
                value={manualForm.replaceDate}
                onChange={(e) => setManualForm({ ...manualForm, replaceDate: e.target.value })}
              />
            </Field>
            <Field label="교체확인서 받은 현장담당자 연락처">
              <input
                className={inputCls}
                placeholder="예: 010-1234-5678"
                value={manualForm.contactPhone}
                onChange={(e) => setManualForm({ ...manualForm, contactPhone: e.target.value })}
              />
            </Field>
            <Field label="교체 전 사진"><PhotoUpload label="교체 전 표준 화질 사진 등록" /></Field>
            <Field label="교체 후 사진"><PhotoUpload label="교체 후 표준 화질 사진 등록" /></Field>
            <Field label="교체확인서"><PhotoUpload label="교체확인서 종이 사진 등록" /></Field>
            <Field label="수리비">
              <input
                type="number"
                className={inputCls}
                placeholder="예: 150000"
                value={manualForm.cost}
                onChange={(e) => setManualForm({ ...manualForm, cost: e.target.value })}
              />
            </Field>
            <PrimaryButton onClick={submitManual} disabled={!manualValid}>청구 요청 제출</PrimaryButton>
            {submitted && submitted.manual && (
              <p className="text-xs text-emerald-600 font-bold text-center mt-3 flex items-center justify-center gap-1">
                <Check size={14} />
                제출 완료 · "{submitted.siteName} {submitted.part}" 청구가 접수되었습니다
                {submitted.fromKit && " · 상비부품 보충 요청도 함께 전달됐습니다"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TODO (할일관리)                                                       */
/* ------------------------------------------------------------------ */

function TodoTab({ todos, setTodos }) {
  const { name: CURRENT_ENGINEER } = useContext(AuthContext);
  const mine = todos.filter((t) => t.assignee === CURRENT_ENGINEER);

  if (mine.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <ListTodo size={32} className="text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">할 일이 없습니다</p>
        <p className="text-xs text-slate-400 mt-1.5">자재 담당자가 [자재 지급 완료] 처리를 하거나<br />관리자가 할 일을 부여하면 이곳에 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      <div className="px-5 pt-4 space-y-2.5">
        {mine.map((t) => {
          const isManual = t.source === "manual";
          return (
            <div key={t.id} className={`bg-white rounded-xl border p-3.5 ${t.done ? "border-slate-200 opacity-50" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-sm font-bold text-slate-800 ${t.done ? "line-through" : ""}`}>{t.title}</p>
                    {isManual && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">관리자 부여</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">{t.siteName} · {isManual ? `부여일 ${t.assignedDate}` : `자재지급 ${t.assignedDate}`}</p>
                </div>
                {!t.done && <DDay dueDate={t.dueDate} />}
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[11px] text-slate-400">마감 {t.dueDate}</span>
                {t.done ? (
                  <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center gap-1">
                    <Check size={12} /> 완료됨
                  </span>
                ) : isManual ? (
                  <button
                    onClick={async () => {
                      await supabase.from("todos").update({ done: true }).eq("id", t.id);
                      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: true } : x)));
                    }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-700 text-white active:bg-blue-800"
                  >
                    완료 처리
                  </button>
                ) : (
                  <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 flex items-center gap-1">
                    <Lock size={11} /> 비용청구 시 자동완료
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ROOM (우리방) incl. admin dashboard                                  */
/* ------------------------------------------------------------------ */

function BillingCard({ b }) {
  return (
    <div className="border border-slate-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-slate-800">{b.siteName} · {b.part}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${b.type === "material" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
          {b.type === "material" ? "자재지급" : "직접입력"}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{b.engineer} · {b.replaceDate} 교체{b.contactPhone ? ` · 현장담당 ${b.contactPhone}` : ""}</span>
        <span className="font-bold text-slate-600 shrink-0 ml-2">{b.cost ? `₩${Number(b.cost).toLocaleString()}` : "-"}</span>
      </div>
    </div>
  );
}

function BillingHistoryScreen({ billings, onBack }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("전체");

  const filtered = billings.filter(
    (b) => (type === "전체" || (type === "자재지급" && b.type === "material") || (type === "직접입력" && b.type === "manual")) && b.siteName.includes(query.trim())
  );

  // 날짜별 그룹핑 (최신 날짜 먼저)
  const groups = {};
  filtered.forEach((b) => {
    (groups[b.replaceDate] ??= []).push(b);
  });
  const dates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));
  const total = filtered.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="비용청구 내역" onBack={onBack} onHome={onBack} />

      <div className="px-5 py-3 bg-blue-950 shrink-0 flex items-center justify-between">
        <span className="text-xs text-blue-200">이번 달 총 {filtered.length}건</span>
        <span className="text-sm font-extrabold text-white">₩{total.toLocaleString()}</span>
      </div>

      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {["전체", "자재지급", "직접입력"].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${type === t ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {dates.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 청구 내역이 없습니다</p>
        ) : (
          dates.map((d) => (
            <div key={d} className="mb-4">
              <p className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-white py-1">{d} · {groups[d].length}건</p>
              <div className="space-y-2">
                {groups[d].map((b) => <BillingCard key={b.id} b={b} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TodoRow({ t, onToggle, onOpenDetail }) {
  return (
    <div className={`border rounded-xl p-3 ${t.done ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
      <button type="button" onClick={() => onOpenDetail(t)} className="w-full flex items-start justify-between gap-2 text-left">
        <div className="flex-1">
          <p className={`text-sm font-bold text-slate-800 ${t.done ? "line-through" : ""}`}>{t.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {t.assignee} 담당 · {t.siteName} · {t.source === "manual" ? "관리자 부여" : t.source === "quote" ? "견적 연동" : "자재 연동"}
          </p>
        </div>
        {!t.done && <DDay dueDate={t.dueDate} />}
      </button>
      <button
        onClick={() => onToggle(t.id)}
        className={`w-full mt-2.5 text-xs font-bold py-2 rounded-lg ${t.done ? "bg-slate-100 text-slate-500 active:bg-slate-200" : "bg-blue-700 text-white active:bg-blue-800"}`}
      >
        {t.done ? "완료 취소" : "완료 처리"}
      </button>
    </div>
  );
}

function TodoDetailSheet({ todo, onToggle, onClose }) {
  const sourceLabel = todo.source === "manual" ? "관리자 부여" : todo.source === "quote" ? "견적 연동" : "자재 연동";
  return (
    <Sheet title="할 일 상세" onClose={onClose}>
      <div className="bg-slate-100 rounded-xl p-3 mb-4">
        <p className="font-bold text-slate-800">{todo.title}</p>
      </div>
      <div className="space-y-2.5 mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">담당자</span>
          <span className="font-semibold text-slate-700">{todo.assignee}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">현장</span>
          <span className="font-semibold text-slate-700">{todo.siteName}</span>
        </div>
        {todo.part && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">부품/공사</span>
            <span className="font-semibold text-slate-700">{todo.part}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">출처</span>
          <span className="font-semibold text-slate-700">{sourceLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">부여일</span>
          <span className="font-semibold text-slate-700">{todo.assignedDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">마감일</span>
          <span className="font-semibold text-slate-700">{todo.dueDate}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">상태</span>
          <span className={`font-semibold ${todo.done ? "text-emerald-600" : "text-amber-600"}`}>{todo.done ? "완료" : "미완료"}</span>
        </div>
      </div>
      {todo.photoCount > 0 && (
        <div className="mb-4">
          <p className="text-xs font-bold text-slate-500 mb-2">첨부 사진 ({todo.photoCount}장)</p>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: todo.photoCount }).map((_, i) => <PhotoThumb key={i} />)}
          </div>
        </div>
      )}
      <PrimaryButton
        onClick={() => {
          onToggle(todo.id);
          onClose();
        }}
      >
        {todo.done ? "완료 취소" : "완료 처리"}
      </PrimaryButton>
    </Sheet>
  );
}

function TodoAssignSheet({ engineerNames, onSubmit, onClose }) {
  const sites = useContext(SitesContext);
  const [form, setForm] = useState({ assignees: [], siteId: "", title: "", dueDate: addDays(TODAY_STR, 7), photos: [] });

  function toggleAssignee(name) {
    setForm((f) => ({
      ...f,
      assignees: f.assignees.includes(name) ? f.assignees.filter((a) => a !== name) : [...f.assignees, name],
    }));
  }

  const site = sites.find((s) => s.id === form.siteId);
  const canSubmit = form.assignees.length > 0 && !!site && form.title.trim().length > 0;

  return (
    <Sheet title="할 일 부여" onClose={onClose}>
      <Field label="담당자 (1명 이상 선택)">
        <div className="flex flex-wrap gap-1.5">
          {engineerNames.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggleAssignee(e)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border ${form.assignees.includes(e) ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-300"}`}
            >
              {e}
            </button>
          ))}
          {engineerNames.length === 0 && <p className="text-xs text-slate-400">등록된 기사 계정이 없습니다</p>}
        </div>
      </Field>
      <Field label="현장">
        <SiteSearchSelect value={form.siteId} onChange={(id) => setForm({ ...form, siteId: id })} />
      </Field>
      <Field label="할 일 내용">
        <textarea
          className={inputCls}
          rows={3}
          placeholder="예: 소방연동 점검 서류 제출"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="마감일">
        <input type="date" className={inputCls} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
      </Field>
      <Field label="첨부 사진">
        <MultiPhotoUpload
          required={false}
          photos={form.photos}
          onAdd={() => setForm({ ...form, photos: [...form.photos, Date.now()] })}
          onRemove={(idx) => setForm({ ...form, photos: form.photos.filter((_, i) => i !== idx) })}
          label="작업 관련 참고 사진 (선택)"
        />
      </Field>
      <PrimaryButton
        disabled={!canSubmit}
        onClick={() => {
          onSubmit({ assignees: form.assignees, siteName: site.name, title: form.title.trim(), dueDate: form.dueDate, photoCount: form.photos.length });
          onClose();
        }}
      >
        할 일 부여하기
      </PrimaryButton>
    </Sheet>
  );
}

function TodoManageScreen({ todos, onToggle, onAssignTodo, engineerNames, onBack }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("전체");
  const [assignOpen, setAssignOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const sourceMatch = { 전체: null, 자재연동: "material", 견적연동: "quote", 관리자부여: "manual" };

  const filtered = todos.filter((t) => {
    const matchesSource = source === "전체" || t.source === sourceMatch[source];
    const matchesQuery = t.siteName.includes(query.trim()) || t.assignee.includes(query.trim());
    return matchesSource && matchesQuery;
  });

  const groups = {};
  filtered.forEach((t) => {
    (groups[t.assignee] ??= []).push(t);
  });
  const assignees = Object.keys(groups).sort((a, b) => groups[b].filter((t) => !t.done).length - groups[a].filter((t) => !t.done).length);
  const undoneCount = filtered.filter((t) => !t.done).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="할 일 관리" onBack={onBack} onHome={onBack} />

      <div className="px-5 py-3 bg-blue-950 shrink-0 flex items-center justify-between">
        <span className="text-xs text-blue-200">조건에 맞는 할 일 {filtered.length}건</span>
        <span className="text-sm font-extrabold text-white">미완료 {undoneCount}건</span>
      </div>

      <div className="px-5 pt-3 pb-2 shrink-0">
        <PrimaryButton onClick={() => setAssignOpen(true)} className="mb-3">
          + 새 할 일 부여
        </PrimaryButton>
        <div className="relative mb-2.5">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="현장명 또는 담당자로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {["전체", "자재연동", "견적연동", "관리자부여"].map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 ${source === s ? "bg-blue-700 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {assignees.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-10">해당 조건의 할 일이 없습니다</p>
        ) : (
          assignees.map((a) => (
            <div key={a} className="mb-4">
              <p className="text-xs font-bold text-slate-400 mb-2 sticky top-0 bg-white py-1">
                {a} · {groups[a].filter((t) => !t.done).length}건 미완료 / 총 {groups[a].length}건
              </p>
              <div className="space-y-2">
                {groups[a].map((t) => <TodoRow key={t.id} t={t} onToggle={onToggle} onOpenDetail={setDetailTarget} />)}
              </div>
            </div>
          ))
        )}
      </div>

      {assignOpen && (
        <TodoAssignSheet
          engineerNames={engineerNames}
          onSubmit={onAssignTodo}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {detailTarget && (
        <TodoDetailSheet
          todo={todos.find((t) => t.id === detailTarget.id) ?? detailTarget}
          onToggle={onToggle}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

function AdminMenuRow({ icon: Icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-slate-600" />
        </div>
        <span className="text-sm font-bold text-slate-800">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {!!badge && <span className="text-[11px] font-bold text-white bg-blue-700 px-2 py-0.5 rounded-full">{badge}</span>}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );
}

const emptySiteForm = {
  name: "", siteCode: "", elevatorNo: "", region: "", address: "",
  contractType: "", phone: "", elevatorModel: "", unitCount: "1",
  manager: "", managerPhone: "", assignedEngineer: "",
};

function SiteEditorSheet({ initial, engineerNames, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const canSave = form.name.trim().length > 0;

  return (
    <Sheet title={initial === emptySiteForm ? "새 현장 등록" : "현장 정보 수정"} onClose={onClose}>
      <Field label="현장명"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 대박빌딩" /></Field>
      <Field label="현장코드"><input className={inputCls} value={form.siteCode} onChange={(e) => setForm({ ...form, siteCode: e.target.value })} placeholder="예: 00007" /></Field>
      <Field label="대표 호기"><input className={inputCls} value={form.elevatorNo} onChange={(e) => setForm({ ...form, elevatorNo: e.target.value })} placeholder="예: 1호기" /></Field>
      <Field label="대수"><input type="number" min={1} className={inputCls} value={form.unitCount} onChange={(e) => setForm({ ...form, unitCount: e.target.value })} /></Field>
      <Field label="지역"><input className={inputCls} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="예: 가산" /></Field>
      <Field label="주소"><input className={inputCls} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="계약구분"><input className={inputCls} value={form.contractType} onChange={(e) => setForm({ ...form, contractType: e.target.value })} placeholder="예: 월정료(개인건물주)" /></Field>
      <Field label="현장 전화번호"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="승강기 모델"><input className={inputCls} value={form.elevatorModel} onChange={(e) => setForm({ ...form, elevatorModel: e.target.value })} /></Field>
      <Field label="담당자"><input className={inputCls} value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></Field>
      <Field label="담당자 전화번호"><input className={inputCls} value={form.managerPhone} onChange={(e) => setForm({ ...form, managerPhone: e.target.value })} /></Field>
      <Field label="담당 기사 배정">
        <select className={inputCls} value={form.assignedEngineer} onChange={(e) => setForm({ ...form, assignedEngineer: e.target.value })}>
          <option value="">미배정</option>
          {engineerNames.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </Field>
      <PrimaryButton onClick={() => onSave(form)} disabled={!canSave}>저장</PrimaryButton>
    </Sheet>
  );
}

function SiteManagementScreen({ sites, engineerNames, onAddSite, onUpdateSite, onDeleteSite, onBack }) {
  const [editingSite, setEditingSite] = useState(null); // null | "new" | site object
  const [deleteTarget, setDeleteTarget] = useState(null);

  function siteToForm(s) {
    return {
      name: s.name ?? "", siteCode: s.siteCode ?? "", elevatorNo: s.elevatorNo ?? "",
      region: s.region ?? "", address: s.address ?? "", contractType: s.contractType ?? "",
      phone: s.phone ?? "", elevatorModel: s.elevatorModel ?? "", unitCount: String(s.unitCount ?? 1),
      manager: s.manager ?? "", managerPhone: s.managerPhone ?? "", assignedEngineer: s.assignedEngineer ?? "",
    };
  }

  async function handleSave(form) {
    if (editingSite === "new") {
      await onAddSite(form);
    } else {
      await onUpdateSite(editingSite.id, form);
    }
    setEditingSite(null);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="현장관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PrimaryButton onClick={() => setEditingSite("new")} className="mb-4">
          + 새 현장 등록
        </PrimaryButton>
        <div className="space-y-2.5">
          {sites.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">{s.name} · {s.elevatorNo}</p>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{s.region || "-"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{s.address || "주소 미등록"}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  담당 기사: <span className="font-semibold text-slate-700">{s.assignedEngineer || "미배정"}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingSite(s)}
                    className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
          {sites.length === 0 && <p className="text-xs text-slate-400 text-center py-10">등록된 현장이 없습니다</p>}
        </div>
      </div>

      {editingSite && (
        <SiteEditorSheet
          initial={editingSite === "new" ? emptySiteForm : siteToForm(editingSite)}
          engineerNames={engineerNames}
          onSave={handleSave}
          onClose={() => setEditingSite(null)}
        />
      )}

      {deleteTarget && (
        <Sheet title="현장 삭제" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-700 mb-1">
            <span className="font-bold">{deleteTarget.name}</span> 현장을 삭제하시겠습니까?
          </p>
          <p className="text-[11px] text-slate-400 mb-4">
            이 현장과 연결된 고장·검사·자재 이력은 남아있지만, 더 이상 이 현장을 참조하지 않게 됩니다.
          </p>
          <PrimaryButton
            tone="red"
            onClick={async () => {
              await onDeleteSite(deleteTarget.id);
              setDeleteTarget(null);
            }}
          >
            삭제
          </PrimaryButton>
        </Sheet>
      )}
    </div>
  );
}

function MaterialRequestsScreen({ materialRequests, onSupplyComplete, onReprocess, onAttachPhoto, onBack }) {
  const [detailTarget, setDetailTarget] = useState(null);
  const pending = materialRequests.filter((r) => r.status === "승인대기");
  const supplied = materialRequests.filter((r) => r.status === "지급완료");
  const rejected = materialRequests.filter((r) => r.status === "반려");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="자재 지급 대기" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {rejected.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <PackageX size={16} className="text-red-600" />
              <h3 className="font-extrabold text-red-700 text-sm">기사 반려 · 재지급 필요</h3>
            </div>
            <div className="space-y-2">
              {rejected.map((r) => (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-red-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-slate-800 text-sm">{r.siteName} · {r.part}</p>
                    <span className="text-[11px] text-slate-400">{r.engineer}</span>
                  </div>
                  <p className="text-xs text-red-600 mb-2">사유: {r.rejectReason}</p>
                  <button
                    onClick={() => onReprocess(r.id)}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    <RotateCcw size={13} /> 재지급 대상으로 되돌리기
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">자재 지급 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">{r.siteName} · {r.part}</p>
                  <button
                    onClick={() => setDetailTarget({ type: "material", data: r })}
                    className="text-[11px] font-bold text-blue-600 shrink-0 flex items-center gap-0.5"
                  >
                    상세보기 <ChevronRight size={12} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 신청 · {r.requestedDate} · {r.urgency}</p>

                {r.hasSupplyPhoto ? (
                  <div className="mt-2.5 flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-2.5 py-2">
                    <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-emerald-500" />
                    </div>
                    <span className="text-[11px] text-emerald-600 font-semibold">자재 사진 등록 완료</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onAttachPhoto(r.id)}
                    className="w-full mt-2.5 border-2 border-dashed border-slate-300 rounded-lg py-3 flex flex-col items-center gap-1 text-slate-500 active:bg-slate-50"
                  >
                    <Camera size={18} />
                    <span className="text-[11px] font-semibold">지급할 자재 사진 촬영</span>
                  </button>
                )}

                <button
                  onClick={() => r.hasSupplyPhoto && onSupplyComplete(r.id)}
                  disabled={!r.hasSupplyPhoto}
                  className={`w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg ${
                    r.hasSupplyPhoto ? "bg-blue-700 text-white active:bg-blue-800" : "bg-slate-200 text-slate-400"
                  }`}
                >
                  <PackageCheck size={14} /> 자재 지급 완료 체크
                </button>
                {!r.hasSupplyPhoto && (
                  <p className="text-[10px] text-slate-400 text-center mt-1">사진을 등록해야 지급완료 처리를 할 수 있습니다</p>
                )}
              </div>
            ))}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">지급 대기 중인 자재 신청이 없습니다</p>}
          </div>

          {supplied.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 mt-4 mb-2">최근 지급완료 (할 일 자동 생성됨)</p>
              <div className="space-y-1.5">
                {supplied.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{r.siteName} · {r.part}</span>
                    <span className="text-emerald-600 font-semibold">{r.suppliedDate} 지급 · D-30 시작</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {detailTarget?.type === "material" && (
        <Sheet title="자재 신청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">부품 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.part}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">긴급도</p>
                <p className="font-bold text-slate-800">{detailTarget.data.urgency}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (교체 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 부품 규격 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
            {detailTarget.data.status === "반려" && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                <p className="text-[11px] text-red-600 font-semibold">반려 사유</p>
                <p className="text-sm text-red-700 mt-0.5">{detailTarget.data.rejectReason}</p>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function QuoteRequestsScreen({ quoteRequests, onAdvanceQuote, onAttachQuotePhoto, onCompleteQuoteSupply, onBack }) {
  const [detailTarget, setDetailTarget] = useState(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="견적 요청 관리" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="space-y-3">
            {quoteRequests.map((q) => (
              <div key={q.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-slate-800">{q.siteName} · {q.constructionType}</p>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      q.status === "자재지급완료" ? "bg-emerald-100 text-emerald-700" :
                      q.status === "승인" ? "bg-indigo-100 text-indigo-700" :
                      q.status === "견적발행" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {q.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-1">{q.engineer} 기사 신청 · {q.requestedDate} · 현장담당 {q.contactPhone}</p>
                <button
                  onClick={() => setDetailTarget({ type: "quote", data: q })}
                  className="text-[11px] font-bold text-blue-600 mb-2 flex items-center gap-0.5"
                >
                  상세보기 <ChevronRight size={12} />
                </button>

                {q.status === "요청접수" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg active:bg-blue-800"
                  >
                    견적발행 처리
                  </button>
                )}
                {q.status === "견적발행" && (
                  <button
                    onClick={() => onAdvanceQuote(q.id)}
                    className="w-full bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-lg active:bg-indigo-700"
                  >
                    승인 처리
                  </button>
                )}
                {q.status === "승인" && (
                  <>
                    {q.hasSupplyPhoto ? (
                      <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-2.5 py-2 mb-2">
                        <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                          <ImageIcon size={16} className="text-emerald-500" />
                        </div>
                        <span className="text-[11px] text-emerald-600 font-semibold">자재 사진 등록 완료</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => onAttachQuotePhoto(q.id)}
                        className="w-full mb-2 border-2 border-dashed border-slate-300 rounded-lg py-3 flex flex-col items-center gap-1 text-slate-500 active:bg-slate-50"
                      >
                        <Camera size={18} />
                        <span className="text-[11px] font-semibold">지급할 자재 사진 촬영</span>
                      </button>
                    )}
                    <button
                      onClick={() => q.hasSupplyPhoto && onCompleteQuoteSupply(q.id)}
                      disabled={!q.hasSupplyPhoto}
                      className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg ${
                        q.hasSupplyPhoto ? "bg-blue-700 text-white active:bg-blue-800" : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      <PackageCheck size={14} /> 자재 지급 완료 체크
                    </button>
                    {!q.hasSupplyPhoto && (
                      <p className="text-[10px] text-slate-400 text-center mt-1">사진을 등록해야 지급완료 처리를 할 수 있습니다</p>
                    )}
                  </>
                )}
                {q.status === "자재지급완료" && (
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <PackageCheck size={12} /> {q.suppliedDate} 지급완료 · {q.engineer} 기사에게 할 일 자동 생성됨
                  </p>
                )}
              </div>
            ))}
            {quoteRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-3">접수된 견적 요청이 없습니다</p>}
          </div>
        </div>
      </div>

      {detailTarget?.type === "quote" && (
        <Sheet title="견적 요청 상세" onClose={() => setDetailTarget(null)}>
          <div className="space-y-3">
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">현장</p>
              <p className="font-bold text-slate-800">{detailTarget.data.siteName}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-3">
              <p className="text-[11px] text-slate-500">견적 내역 (부품명, 수량)</p>
              <p className="font-bold text-slate-800 whitespace-pre-wrap">{detailTarget.data.constructionType}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">현장 견적 담당자 연락처</p>
                <p className="font-bold text-slate-800">{detailTarget.data.contactPhone}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">신청 기사</p>
                <p className="font-bold text-slate-800">{detailTarget.data.engineer}</p>
              </div>
              <div className="bg-slate-100 rounded-xl p-3 col-span-2">
                <p className="text-[11px] text-slate-500">신청일</p>
                <p className="font-bold text-slate-800">{detailTarget.data.requestedDate}</p>
              </div>
            </div>
            {detailTarget.data.note && (
              <div className="bg-slate-100 rounded-xl p-3">
                <p className="text-[11px] text-slate-500">기사 의견 (견적 사유 및 특이사항)</p>
                <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{detailTarget.data.note}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">기사가 첨부한 현장 상태 사진 ({detailTarget.data.photoCount ?? 1}장)</p>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: detailTarget.data.photoCount ?? 1 }).map((_, i) => <PhotoThumb key={i} />)}
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function InspectionMonitorScreen({ inspections, onBack }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="검사결과 및 합격증 모니터링" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="space-y-3">
            {inspections.map((i) => (
              <div key={i.id} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{i.siteName} · {i.type}</span>
                {i.result ? <Badge result={i.result} /> : <span className="text-[11px] text-slate-400">미등록</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function RestockScreen({ restockRequests, onAttachRestockPhoto, onCompleteRestock, onBack }) {
  const pending = restockRequests.filter((r) => r.status === "대기");
  const done = restockRequests.filter((r) => r.status === "완료");

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <DrillHeader title="상비부품 보충" onBack={onBack} onHome={onBack} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 text-sm">보충 대기</h3>
            <span className="text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="border border-amber-200 bg-amber-50 rounded-xl p-3">
                <p className="text-sm font-bold text-slate-800">{r.part}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.engineer} 기사 · {r.siteName}에서 사용 · {r.requestedDate}</p>

                {r.hasSupplyPhoto ? (
                  <div className="mt-2.5 flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-2.5 py-2">
                    <div className="w-9 h-9 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-emerald-500" />
                    </div>
                    <span className="text-[11px] text-emerald-600 font-semibold">보충 부품 사진 등록 완료</span>
                  </div>
                ) : (
                  <button
                    onClick={() => onAttachRestockPhoto(r.id)}
                    className="w-full mt-2.5 border-2 border-dashed border-slate-300 rounded-lg py-3 flex flex-col items-center gap-1 text-slate-500 active:bg-slate-50"
                  >
                    <Camera size={18} />
                    <span className="text-[11px] font-semibold">보충할 부품 사진 촬영</span>
                  </button>
                )}

                <button
                  onClick={() => r.hasSupplyPhoto && onCompleteRestock(r.id)}
                  disabled={!r.hasSupplyPhoto}
                  className={`w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-lg ${
                    r.hasSupplyPhoto ? "bg-blue-700 text-white active:bg-blue-800" : "bg-slate-200 text-slate-400"
                  }`}
                >
                  <PackageCheck size={14} /> 보충 지급 완료 체크
                </button>
                {!r.hasSupplyPhoto && (
                  <p className="text-[10px] text-slate-400 text-center mt-1">사진을 등록해야 지급완료 처리를 할 수 있습니다</p>
                )}
              </div>
            ))}
            {pending.length === 0 && <p className="text-xs text-slate-400 text-center py-3">보충 대기 중인 상비부품이 없습니다</p>}
          </div>

          {done.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-400 mt-4 mb-2">최근 보충완료</p>
              <div className="space-y-1.5">
                {done.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs text-slate-500">
                    <span>{r.engineer} · {r.part}</span>
                    <span className="text-emerald-600 font-semibold">{r.suppliedDate} 보충완료</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function RoomTab({ feed, onSendChat }) {
  const { name: CURRENT_ENGINEER, role, signOut } = useContext(AuthContext);
  const [chatInput, setChatInput] = useState("");

  function sendChat() {
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput("");
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-slate-800">사내 피드</p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{CURRENT_ENGINEER}{role === "admin" ? " · 관리자" : ""}</span>
          <button onClick={signOut} className="text-[11px] font-bold text-slate-400 active:text-slate-600">
            로그아웃
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-3">
        {feed.map((p) => {
          const mine = p.author === CURRENT_ENGINEER;
          return (
            <div key={p.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {!mine && <p className="text-[11px] font-bold text-slate-500 mb-1 px-1">{p.author}</p>}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "bg-blue-700 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-700 rounded-bl-sm"}`}>
                  {p.text}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">{p.time}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2">
        <input
          className="flex-1 border border-slate-300 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="메시지를 입력하세요"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendChat()}
        />
        <button
          onClick={sendChat}
          disabled={!chatInput.trim()}
          className="w-10 h-10 rounded-full bg-blue-700 disabled:bg-slate-300 text-white flex items-center justify-center shrink-0 active:bg-blue-800"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function AdminTab({ inspections, materialRequests, billings, quoteRequests, restockRequests, todos, onSupplyComplete, onReprocess, onAttachPhoto, onAssignTodo, onAdvanceQuote, onAttachQuotePhoto, onCompleteQuoteSupply, onAdminToggleTodo, onAttachRestockPhoto, onCompleteRestock, onAddSite, onUpdateSite, onDeleteSite }) {
  const sites = useContext(SitesContext);
  const { engineerNames } = useContext(AuthContext);
  const [billingViewOpen, setBillingViewOpen] = useState(false);
  const [todoViewOpen, setTodoViewOpen] = useState(false);
  const [adminScreen, setAdminScreen] = useState(null); // null | "sites" | "materials" | "quotes" | "inspections" | "restock"
  const pendingCount = materialRequests.filter((r) => r.status === "승인대기").length;
  const quoteActiveCount = quoteRequests.filter((q) => q.status !== "자재지급완료").length;

  if (billingViewOpen) {
    return <BillingHistoryScreen billings={billings} onBack={() => setBillingViewOpen(false)} />;
  }

  if (todoViewOpen) {
    return (
      <TodoManageScreen
        todos={todos}
        onToggle={onAdminToggleTodo}
        onAssignTodo={onAssignTodo}
        engineerNames={engineerNames}
        onBack={() => setTodoViewOpen(false)}
      />
    );
  }

  if (adminScreen === "sites") {
    return (
      <SiteManagementScreen
        sites={sites}
        engineerNames={engineerNames}
        onAddSite={onAddSite}
        onUpdateSite={onUpdateSite}
        onDeleteSite={onDeleteSite}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "materials") {
    return (
      <MaterialRequestsScreen
        materialRequests={materialRequests}
        onSupplyComplete={onSupplyComplete}
        onReprocess={onReprocess}
        onAttachPhoto={onAttachPhoto}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "quotes") {
    return (
      <QuoteRequestsScreen
        quoteRequests={quoteRequests}
        onAdvanceQuote={onAdvanceQuote}
        onAttachQuotePhoto={onAttachQuotePhoto}
        onCompleteQuoteSupply={onCompleteQuoteSupply}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  if (adminScreen === "inspections") {
    return <InspectionMonitorScreen inspections={inspections} onBack={() => setAdminScreen(null)} />;
  }

  if (adminScreen === "restock") {
    return (
      <RestockScreen
        restockRequests={restockRequests}
        onAttachRestockPhoto={onAttachRestockPhoto}
        onCompleteRestock={onCompleteRestock}
        onBack={() => setAdminScreen(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <AdminMenuRow icon={Building2} label="현장관리" badge={sites.length} onClick={() => setAdminScreen("sites")} />
          <AdminMenuRow icon={PackageCheck} label="자재 지급 대기" badge={pendingCount} onClick={() => setAdminScreen("materials")} />
          <AdminMenuRow icon={Package} label="상비부품 보충" badge={restockRequests.filter((r) => r.status === "대기").length} onClick={() => setAdminScreen("restock")} />
          <AdminMenuRow icon={FileText} label="견적 요청 관리" badge={quoteActiveCount} onClick={() => setAdminScreen("quotes")} />
          <AdminMenuRow icon={ListTodo} label="할 일 관리" badge={todos.filter((t) => !t.done).length} onClick={() => setTodoViewOpen(true)} />
          <AdminMenuRow icon={Receipt} label="비용청구 내역" badge={billings.length} onClick={() => setBillingViewOpen(true)} />
          <AdminMenuRow icon={ShieldCheck} label="검사결과 및 합격증 모니터링" onClick={() => setAdminScreen("inspections")} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App shell                                                            */
/* ------------------------------------------------------------------ */

// 앱 구성이 끝날 때까지 로그인 화면을 잠시 꺼두는 스위치입니다.
// 다시 로그인을 켜려면 이 값을 false로 바꾸면 됩니다.
const SKIP_LOGIN = true;
const DEV_FAKE_PROFILE = { name: "관리자", role: "admin" };

export default function App() {
  // undefined = 아직 로그인 여부 확인 중, null = 로그인 안 됨, 객체 = 로그인 됨
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [engineerNames, setEngineerNames] = useState([]);

  const [tab, setTab] = useState("home");
  const [sites, setSites] = useState([]);
  const [failures, setFailures] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [todos, setTodos] = useState([]);
  const [billings, setBillings] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [restockRequests, setRestockRequests] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  // 로그인 상태를 확인하고, 로그인/로그아웃이 일어날 때마다 알림을 받습니다.
  useEffect(() => {
    if (SKIP_LOGIN) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 로그인이 되면 profiles 테이블에서 이 계정의 이름/역할을 가져옵니다.
  useEffect(() => {
    if (SKIP_LOGIN) {
      setProfile(DEV_FAKE_PROFILE);
      return;
    }
    if (!session) {
      setProfile(null);
      return;
    }
    async function loadProfile() {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(data ? { name: data.name, role: data.role } : null);
    }
    loadProfile();
  }, [session]);

  async function handleLogin(email, password) {
    setAuthSubmitting(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("이메일 또는 비밀번호가 올바르지 않습니다.");
    setAuthSubmitting(false);
  }

  function handleLogout() {
    supabase.auth.signOut();
  }

  // 로그인이 완료된 뒤에만 Supabase에서 실제 데이터를 불러옵니다.
  // (예전에는 INITIAL_FAILURES 같은 가짜 배열로 시작했지만, 이제는 DB가 기준입니다)
  useEffect(() => {
    if (!SKIP_LOGIN && !session) return;
    async function loadData() {
      const [
        sitesRes,
        failuresRes,
        inspectionsRes,
        materialRes,
        todosRes,
        quoteRes,
        billingsRes,
        restockRes,
        feedRes,
        engineersRes,
      ] = await Promise.all([
        supabase.from("sites").select("*"),
        supabase.from("failures").select("*").order("created_at", { ascending: false }),
        supabase.from("inspections").select("*"),
        supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("todos").select("*").order("created_at", { ascending: false }),
        supabase.from("quote_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("billings").select("*").order("created_at", { ascending: false }),
        supabase.from("restock_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("feed_posts").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("name").eq("role", "engineer").order("name"),
      ]);
      setSites((sitesRes.data ?? []).map(mapSite));
      setFailures((failuresRes.data ?? []).map(mapFailure));
      setInspections((inspectionsRes.data ?? []).map(mapInspection));
      setMaterialRequests((materialRes.data ?? []).map(mapMaterialRequest));
      setTodos((todosRes.data ?? []).map(mapTodo));
      setQuoteRequests((quoteRes.data ?? []).map(mapQuoteRequest));
      setBillings((billingsRes.data ?? []).map(mapBilling));
      setRestockRequests((restockRes.data ?? []).map(mapRestockRequest));
      setFeed((feedRes.data ?? []).map(mapFeedPost));
      setEngineerNames((engineersRes.data ?? []).map((r) => r.name));
      setLoading(false);
    }
    loadData();
  }, [session]);

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
    };
    await supabase.from("sites").insert({
      id: newSite.id,
      site_code: newSite.siteCode,
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
    });
    setSites((prev) => [...prev, newSite]);
  }

  // ★ 관리자가 현장관리 메뉴에서 현장 정보(담당 기사 배정 포함)를 수정
  async function handleUpdateSite(siteId, form) {
    await supabase
      .from("sites")
      .update({
        site_code: form.siteCode,
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
            }
          : s
      )
    );
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

  async function handleSubmitBilling({ type, siteName, part, cost, replaceDate, contactPhone }) {
    const newBilling = {
      id: "bill-" + Date.now(),
      type,
      siteName,
      part,
      cost,
      replaceDate,
      contactPhone,
      engineer: profile.name,
      submittedAt: TODAY_STR,
    };
    await supabase.from("billings").insert({
      id: newBilling.id,
      type: newBilling.type,
      site_name: newBilling.siteName,
      part: newBilling.part,
      cost: newBilling.cost || null,
      replace_date: newBilling.replaceDate,
      contact_phone: newBilling.contactPhone,
      engineer: newBilling.engineer,
      submitted_at: newBilling.submittedAt,
    });
    setBillings((prev) => [newBilling, ...prev]);
  }

  // ★ 우리방 피드에 새 글 등록
  async function handleSendFeedPost(text) {
    const newPost = {
      id: "p" + Date.now(),
      author: profile.name,
      time: new Date().toTimeString().slice(0, 5),
      text,
    };
    await supabase.from("feed_posts").insert({
      id: newPost.id,
      author: newPost.author,
      body: newPost.text,
    });
    setFeed((prev) => [...prev, newPost]);
  }

  // ★ 자재 담당자가 지급할 자재 사진을 등록하는 순간 (지급완료 체크의 선행 조건)
  async function handleAttachPhoto(requestId) {
    await supabase.from("material_requests").update({ has_supply_photo: true }).eq("id", requestId);
    setMaterialRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, hasSupplyPhoto: true } : r)));
  }

  // ★ 자재 지급 완료 트리거: 이 순간에만 할 일이 자동 생성됩니다 (D-30 시작)
  async function handleSupplyComplete(requestId) {
    const req = materialRequests.find((r) => r.id === requestId);
    if (!req || !req.hasSupplyPhoto) return;

    await supabase
      .from("material_requests")
      .update({ status: "지급완료", supplied_date: TODAY_STR })
      .eq("id", requestId);
    setMaterialRequests((prev) =>
      prev.map((r) => (r.id === requestId && r.hasSupplyPhoto ? { ...r, status: "지급완료", suppliedDate: TODAY_STR } : r))
    );

    const newTodo = {
      id: "todo-" + requestId,
      materialRequestId: requestId,
      source: "material",
      title: `${req.siteName} ${req.part} 교체 및 확인서 제출`,
      siteName: req.siteName,
      part: req.part,
      assignee: req.engineer,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
    };
    await supabase.from("todos").insert({
      id: newTodo.id,
      material_request_id: newTodo.materialRequestId,
      source: newTodo.source,
      title: newTodo.title,
      site_name: newTodo.siteName,
      part: newTodo.part,
      assignee: newTodo.assignee,
      assigned_date: newTodo.assignedDate,
      due_date: newTodo.dueDate,
      done: newTodo.done,
    });
    setTodos((prev) => [newTodo, ...prev]);
  }

  // ★ 기사가 비용청구에서 "상비부품에서 사용함"을 체크하면 보충 요청이 자동 생성됩니다
  async function handleUseKitPart({ part, siteName }) {
    const newRestock = {
      id: "restock-" + Date.now(),
      engineer: profile.name,
      part,
      siteName,
      requestedDate: TODAY_STR,
      status: "대기",
      suppliedDate: null,
      hasSupplyPhoto: false,
    };
    await supabase.from("restock_requests").insert({
      id: newRestock.id,
      engineer: newRestock.engineer,
      part: newRestock.part,
      site_name: newRestock.siteName,
      requested_date: newRestock.requestedDate,
      status: newRestock.status,
    });
    setRestockRequests((prev) => [newRestock, ...prev]);
  }

  // ★ 관리자가 보충할 부품 사진을 등록 (지급완료의 선행 조건)
  async function handleAttachRestockPhoto(restockId) {
    await supabase.from("restock_requests").update({ has_supply_photo: true }).eq("id", restockId);
    setRestockRequests((prev) => prev.map((r) => (r.id === restockId ? { ...r, hasSupplyPhoto: true } : r)));
  }

  // ★ 보충 지급완료 처리
  async function handleCompleteRestock(restockId) {
    const r = restockRequests.find((x) => x.id === restockId);
    if (!r || !r.hasSupplyPhoto) return;
    await supabase.from("restock_requests").update({ status: "완료", supplied_date: TODAY_STR }).eq("id", restockId);
    setRestockRequests((prev) =>
      prev.map((x) => (x.id === restockId && x.hasSupplyPhoto ? { ...x, status: "완료", suppliedDate: TODAY_STR } : x))
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
  async function handleAttachQuotePhoto(quoteId) {
    await supabase.from("quote_requests").update({ has_supply_photo: true }).eq("id", quoteId);
    setQuoteRequests((prev) => prev.map((q) => (q.id === quoteId ? { ...q, hasSupplyPhoto: true } : q)));
  }

  // ★ 자재지급완료 트리거: 이 순간 담당 기사에게 할 일이 자동 생성됩니다
  async function handleCompleteQuoteSupply(quoteId) {
    const q = quoteRequests.find((x) => x.id === quoteId);
    if (!q || !q.hasSupplyPhoto) return;

    await supabase.from("quote_requests").update({ status: "자재지급완료", supplied_date: TODAY_STR }).eq("id", quoteId);
    setQuoteRequests((prev) =>
      prev.map((x) => (x.id === quoteId && x.hasSupplyPhoto ? { ...x, status: "자재지급완료", suppliedDate: TODAY_STR } : x))
    );

    const newTodo = {
      id: "todo-quote-" + quoteId,
      materialRequestId: null,
      quoteRequestId: quoteId,
      source: "quote",
      title: `${q.siteName} ${q.constructionType} 시공 확인 및 서류 제출`,
      siteName: q.siteName,
      part: q.constructionType,
      assignee: q.engineer,
      assignedDate: TODAY_STR,
      dueDate: addDays(TODAY_STR, 30),
      done: false,
    };
    await supabase.from("todos").insert({
      id: newTodo.id,
      quote_request_id: newTodo.quoteRequestId,
      source: newTodo.source,
      title: newTodo.title,
      site_name: newTodo.siteName,
      part: newTodo.part,
      assignee: newTodo.assignee,
      assigned_date: newTodo.assignedDate,
      due_date: newTodo.dueDate,
      done: newTodo.done,
    });
    setTodos((prev) => [newTodo, ...prev]);
  }

  // ★ 관리자가 직원(1명 이상)에게 할 일을 직접 부여 — 담당자마다 할 일을 하나씩 만듭니다
  async function handleAssignTodo({ assignees, siteName, title, dueDate, photoCount }) {
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
  const subtitleMap = {
    sites: "담당 현장 마스터 정보 조회",
    failure: "고장 접수 및 처리 현황",
    checkup: "정기점검 자율 스케줄링",
    inspection: "안전공단 검사 일정 · 결과 등록",
    material: "자재 신청 · 견적 요청",
    billing: "부품 교체 및 수리비 청구",
    todo: "자재 지급일 기준 D-30 관리",
    room: "사내 피드",
    admin: "현장·기사·자재 전체 관리",
  };
  const visibleTabs = TABS.filter((t) => t.id !== "admin" || profile?.role === "admin");

  if (!SKIP_LOGIN && session === undefined) {
    return (
      <div className="h-screen w-screen bg-slate-200 flex items-center justify-center overflow-hidden">
        <div
          className="bg-slate-50 flex flex-col items-center justify-center gap-2 shadow-2xl border-4 border-slate-900 rounded-[2.5rem]"
          style={{ width: "375px", height: "min(812px, 100vh - 24px)", maxHeight: "100vh" }}
        >
          <p className="text-sm font-bold text-slate-400">로그인 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!SKIP_LOGIN && !session) {
    return <LoginScreen onLogin={handleLogin} error={authError} submitting={authSubmitting} />;
  }

  if (loading || !profile) {
    return (
      <div className="h-screen w-screen bg-slate-200 flex items-center justify-center overflow-hidden">
        <div
          className="bg-slate-50 flex flex-col items-center justify-center gap-2 shadow-2xl border-4 border-slate-900 rounded-[2.5rem]"
          style={{ width: "375px", height: "min(812px, 100vh - 24px)", maxHeight: "100vh" }}
        >
          <p className="text-sm font-bold text-slate-400">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ name: profile.name, role: profile.role, engineerNames, signOut: handleLogout }}>
    <SitesContext.Provider value={sites}>
      <div className="h-screen w-screen bg-slate-200 flex items-center justify-center overflow-hidden">
        <div
          className="bg-slate-50 flex flex-col overflow-hidden shadow-2xl border-4 border-slate-900 rounded-[2.5rem]"
          style={{ width: "375px", height: "min(812px, 100vh - 24px)", maxHeight: "100vh" }}
        >
          {/* status bar */}
          <div className="bg-blue-950 text-white text-[11px] px-6 pt-2.5 pb-1 flex justify-between shrink-0">
            <span>9:41</span>
            <span>구일엘리베이터(주)</span>
          </div>

          <ScreenHeader
            title={tab === "home" ? "구일엘리베이터(주)" : tabTitle}
            subtitle={tab === "home" ? `${profile.name}님 반갑습니다` : subtitleMap[tab]}
            right={
              <button className="relative p-1.5 bg-blue-900 rounded-full">
                <Bell size={16} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            }
          />

          {tab === "home" && <HomeTab inspections={inspections} failures={failures} />}
          {tab === "sites" && <SiteTab inspections={inspections} failures={failures} billings={billings} onUpdateSiteNotes={handleUpdateSiteNotes} />}
          {tab === "failure" && <FailureTab failures={failures} setFailures={setFailures} />}
          {tab === "checkup" && <CheckupTab />}
          {tab === "inspection" && <InspectionTab inspections={inspections} setInspections={setInspections} />}
          {tab === "material" && <MaterialTab requests={materialRequests} setRequests={setMaterialRequests} todos={todos} onReject={handleReject} quoteRequests={quoteRequests} setQuoteRequests={setQuoteRequests} restockRequests={restockRequests} />}
          {tab === "billing" && <BillingTab todos={todos} setTodos={setTodos} onSubmitBilling={handleSubmitBilling} onUseKitPart={handleUseKitPart} />}
          {tab === "todo" && <TodoTab todos={todos} setTodos={setTodos} />}
          {tab === "room" && <RoomTab feed={feed} onSendChat={handleSendFeedPost} />}
          {tab === "admin" && profile.role === "admin" && <AdminTab inspections={inspections} materialRequests={materialRequests} billings={billings} quoteRequests={quoteRequests} restockRequests={restockRequests} todos={todos} onSupplyComplete={handleSupplyComplete} onReprocess={handleReprocess} onAttachPhoto={handleAttachPhoto} onAssignTodo={handleAssignTodo} onAdvanceQuote={handleAdvanceQuote} onAttachQuotePhoto={handleAttachQuotePhoto} onCompleteQuoteSupply={handleCompleteQuoteSupply} onAdminToggleTodo={handleAdminToggleTodo} onAttachRestockPhoto={handleAttachRestockPhoto} onCompleteRestock={handleCompleteRestock} onAddSite={handleAddSite} onUpdateSite={handleUpdateSite} onDeleteSite={handleDeleteSite} />}

          {/* bottom nav */}
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
      </div>
    </SitesContext.Provider>
    </AuthContext.Provider>
  );
}
