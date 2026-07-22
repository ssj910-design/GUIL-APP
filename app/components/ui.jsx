"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Home, X, Camera, Check, Image as ImageIcon, ArrowLeft } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";


/* ------------------------------------------------------------------ */
/* Small shared bits                                                   */
/* ------------------------------------------------------------------ */

/**
 * 카카오맵/티맵 길안내 버튼 — 현장 좌표(sites.lat/lng, 지오코딩으로 캐시)로 경로안내를 띄운다.
 * 좌표가 없으면 아무것도 그리지 않는다(주소만으로는 앱이 엉뚱한 곳을 잡는 경우가 있어서).
 * 아이콘은 public/icons/tmap.png·kakaomap.png (실제 앱 아이콘).
 * 반드시 window.open(새 창/앱 전환)으로만 열고 현재 탭은 절대 이동시키지 않는다 —
 * 예전엔 window.location.href로 스킴을 직접 호출해서, 지도 앱에 갔다 뒤로가기로
 * 돌아오면 브라우저 히스토리가 꼬여 화면이 먹통이 되는 문제가 있었다.
 */
export function MapLinkButtons({ site, className = "", size = 30 }) {
  if (!site || site.lat == null || site.lng == null) return null;
  const name = encodeURIComponent(site.name ?? "현장");
  const openKakao = (e) => {
    e.stopPropagation();
    window.open(`https://map.kakao.com/link/to/${name},${site.lat},${site.lng}`, "_blank");
  };
  const openTmap = (e) => {
    e.stopPropagation();
    window.open(`tmap://route?goalname=${name}&goalx=${site.lng}&goaly=${site.lat}`, "_blank");
  };
  const boxStyle = { width: size, height: size };
  return (
    <span className={`shrink-0 flex items-center gap-1 ${className}`}>
      <button type="button" onClick={openTmap} aria-label="티맵으로 길찾기" style={boxStyle} className="active:opacity-70">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/tmap.png" alt="" className="w-full h-full rounded-[7px]" />
      </button>
      <button type="button" onClick={openKakao} aria-label="카카오맵으로 길찾기" style={boxStyle} className="active:opacity-70">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/kakaomap.png" alt="" className="w-full h-full rounded-[7px]" />
      </button>
    </span>
  );
}

export function ScreenHeader({ title, right }) {
  return (
    <div className="px-5 pt-3 pb-2.5 bg-blue-950 text-white shrink-0">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {right}
      </div>
    </div>
  );
}


export function Badge({ result }) {
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


export function DDay({ dueDate }) {
  if (!dueDate) return <span className="text-xs font-extrabold px-2 py-1 rounded-md bg-slate-100 text-slate-400">기한 미정</span>;
  const today = new Date(TODAY_STR);
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


export function PhotoUpload({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center gap-1.5 text-slate-500 active:bg-slate-50">
      <Camera size={22} />
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[10px] text-slate-400">표준 화질 · 글씨가 선명하게 보이도록 촬영</span>
    </button>
  );
}


export function PhotoThumb({ caption }) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-100 py-4 flex flex-col items-center gap-1">
      <ImageIcon size={20} className="text-slate-400" />
      {caption && <span className="text-[10px] text-slate-400 font-semibold">{caption}</span>}
    </div>
  );
}


/* 엘맨PRO 스타일 타임라인 항목 (아이콘-라벨-값, 세로 연결선) */
export function TimelineRow({ icon: Icon, label, value, valueColor = "text-slate-700", highlight, last, onClick }) {
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
export function TimelineInput({ icon: Icon, label, children, last, required }) {
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


export const tlInputCls = "text-right text-sm font-bold text-blue-600 bg-transparent outline-none w-full placeholder-slate-300";


/* 엘맨PRO 스타일 필터 바 (현장/담당자/부서 + 기간) */
export function FilterBar({ pills = [], startDate, endDate }) {
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
export function HistoryCard({ barColor, title, badge, rows, tags, date, timeCols, noPadding }) {
  return (
    <div className={`flex ${noPadding ? "" : "px-5 pb-5"}`}>
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


export function PrimaryButton({ children, onClick, disabled, tone = "blue", className = "" }) {
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


export function Sheet({ title, onClose, children }) {
  // body Portal로 렌더 — 탭 콘텐츠(PullToRefresh)의 transform이 fixed를 가두는 걸 피해,
  // 플로팅 버튼(게시판 퀵) 등 다른 요소가 시트 위로 겹치지 않게 한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const content = (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/40" onClick={onClose}>
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
  return mounted ? createPortal(content, document.body) : null;
}


export function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}


export const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";


/* ------------------------------------------------------------------ */
/* HOME                                                                 */
/* ------------------------------------------------------------------ */

export function DrillHeader({ title, onBack, onHome }) {
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


export function SmsToast({ message }) {
  if (!message) return null;
  return (
    <div className="absolute left-1/2 bottom-24 -translate-x-1/2 z-40 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 whitespace-nowrap">
      <Check size={13} className="text-emerald-400" /> {message}
    </div>
  );
}
