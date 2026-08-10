"use client";
import { useState, useEffect } from "react";
import { BRAND } from "@/lib/company";
import { createPortal } from "react-dom";
import { Home, X, Camera, Check, Image as ImageIcon, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { TODAY_STR } from "@/lib/constants";
import { downloadPhoto, downloadPhotosAsZip, extOf } from "@/lib/photos";
import { usePhotoLightboxGestures } from "@/app/hooks/usePhotoLightboxGestures";


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

// 앱 최초 진입 시 로딩 화면 — 텍스트만 뜨던 자리에 회사 로고를 보여준다.
// layout.js의 정적 스플래시(#app-splash, JS 뜨기 전 흰 화면 방지용)와 배경색·로고를 맞춰서,
// 그 정적 화면이 사라진 뒤 이 컴포넌트로 넘어와도 깜빡임 없이 이어지게 한다.
export function BrandSplash({ label }) {
  return (
    <div className="h-dvh w-screen bg-blue-950 flex flex-col items-center justify-center gap-4">
      <img src="/icon-512.png" alt={BRAND.short} className="w-20 h-20 rounded-2xl shadow-lg" />
      {label && <p className="text-xs font-bold text-blue-200">{label}</p>}
    </div>
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


/* 사진 여러 장을 터치하면 전체화면으로 볼 수 있는 그리드 — 2장 이상이면 좌우 넘김, 더블탭/휠로 확대 */
export function PhotoGrid({ urls = [], cols = 3, className = "" }) {
  const [viewerIndex, setViewerIndex] = useState(null);
  if (!urls.length) return null;
  return (
    <>
      <div className={`grid gap-2 ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            className="w-full aspect-square rounded-xl object-cover border border-slate-200 active:opacity-80"
            onClick={() => setViewerIndex(i)}
          />
        ))}
      </div>
      {viewerIndex != null && (
        <PhotoLightbox urls={urls} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </>
  );
}

// 사진 한 장 — 라이트박스 트랙 안 슬롯 하나. active일 때만 확대·이동 스타일을 받는다.
// PC 관리자 콘솔(adminShared.jsx)의 라이트박스도 이 조각을 그대로 재사용한다.
export function PhotoLightboxPane({ url, active, zoom, pan, isGesturing }) {
  return (
    <div className="w-full h-full shrink-0 flex items-center justify-center px-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        className={`max-w-full max-h-full object-contain select-none ${active && zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        style={active ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: isGesturing() ? "none" : "transform 0.15s ease-out" } : undefined}
      />
    </div>
  );
}

function PhotoLightbox({ urls, index, onIndexChange, onClose }) {
  const { containerRef, idx, showPrev, showNext, trackStyle, zoom, pan, isGesturing, handlers } =
    usePhotoLightboxGestures(urls.length, index, onIndexChange);
  const prev = () => onIndexChange((index - 1 + urls.length) % urls.length);
  const next = () => onIndexChange((index + 1) % urls.length);

  async function downloadOne() {
    try {
      await downloadPhoto(urls[index], `사진_${index + 1}.${extOf(urls[index])}`);
    } catch (err) {
      alert("다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }
  async function downloadAll() {
    try {
      await downloadPhotosAsZip(urls, "사진.zip", "사진");
    } catch (err) {
      alert("전체 다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-semibold">{index + 1} / {urls.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={downloadOne} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
            이 사진 다운로드
          </button>
          {urls.length > 1 && (
            <button onClick={downloadAll} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
              전체 다운로드
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white"><X size={22} /></button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 relative min-h-0 touch-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        {...handlers}
      >
        {urls.length > 1 && (
          <button onClick={prev} className="absolute left-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="flex h-full" style={trackStyle}>
          {showPrev && <PhotoLightboxPane key={idx - 1} url={urls[idx - 1]} />}
          <PhotoLightboxPane key={idx} url={urls[idx]} active zoom={zoom} pan={pan} isGesturing={isGesturing} />
          {showNext && <PhotoLightboxPane key={idx + 1} url={urls[idx + 1]} />}
        </div>
        {urls.length > 1 && (
          <button onClick={next} className="absolute right-2 z-20 top-1/2 -translate-y-1/2 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}


/* 엘맨PRO 스타일 타임라인 항목 (아이콘-라벨-값, 세로 연결선) */
export function TimelineRow({ icon: Icon, label, value, valueColor = "text-slate-700", highlight, last, onClick, multiline }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <div className={`flex px-5 ${highlight ? "bg-red-600" : ""}`}>
      <div className="flex flex-col items-center mr-3 pt-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${highlight ? "bg-white" : "bg-slate-100"}`}>
          <Icon size={13} className={highlight ? "text-red-600" : "text-slate-400"} />
        </div>
        {!last && <div className={`w-px flex-1 mt-1 ${highlight ? "bg-red-400" : "bg-slate-200"}`} />}
      </div>
      {multiline ? (
        <Wrapper
          onClick={onClick}
          className={`flex-1 py-3 text-left ${last ? "" : "border-b border-slate-100"} ${onClick ? "active:bg-slate-50" : ""}`}
        >
          <span className={`text-sm ${highlight ? "text-white font-bold" : "text-slate-500"}`}>{label}</span>
          <p className={`text-sm font-bold mt-1 text-left whitespace-pre-wrap ${highlight ? "text-white" : valueColor}`}>{value}</p>
        </Wrapper>
      ) : (
        <Wrapper
          onClick={onClick}
          className={`flex-1 flex items-center justify-between py-3 text-left ${last ? "" : "border-b border-slate-100"} ${onClick ? "active:bg-slate-50" : ""}`}
        >
          <span className={`text-sm ${highlight ? "text-white font-bold" : "text-slate-500"}`}>{label}</span>
          <span className={`text-sm font-bold text-right ${highlight ? "text-white" : valueColor}`}>{value}</span>
        </Wrapper>
      )}
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


export function Sheet({ title, onClose, children, bg = "bg-slate-50", full = false }) {
  // body Portal로 렌더 — 탭 콘텐츠(PullToRefresh)의 transform이 fixed를 가두는 걸 피해,
  // 플로팅 버튼(게시판 퀵) 등 다른 요소가 시트 위로 겹치지 않게 한다.
  // full=true면 하단 시트가 아니라 화면 전체를 덮는 모달로 렌더한다 (입력 항목이 많은 화면용).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const content = (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/40" onClick={onClose}>
      {!full && <div className="mt-auto" />}
      <div
        className={`${bg} ${full ? "h-full" : "rounded-t-3xl max-h-[88%]"} flex flex-col shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0 ${full ? "" : "rounded-t-3xl"}`}>
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


export function Field({ label, right, children }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <label className="block text-xs font-bold text-slate-500">{label}</label>
        {right}
      </div>
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

// 서브탭 버튼 바 바로 아래, 활성 탭 위치를 손가락 드래그를 따라 부드럽게 옮겨다니는 파란 밑줄.
// 탭 버튼들이 flex-1로 같은 폭이라는 전제로 useSwipeSubtab의 barStyle(left/width %)을 그대로 쓴다.
// 버튼 바 wrapper에 className="relative"가 있어야 이 절대위치 바가 그 안에서 자리를 잡는다.
export function SwipeIndicatorBar({ swipe }) {
  return <div className="absolute left-0 bottom-0 h-0.5 bg-blue-700 pointer-events-none" style={swipe.barStyle} />;
}

// 서브탭 화면 좌우 스와이프 트랙 — useSwipeSubtab이 계산한 위치를 그대로 받아 현재 탭과,
// 드래그 중일 때만 옆 탭(이전/다음) 한 장을 나란히 렌더링해 스크롤하듯 옆 화면이 보이게 한다.
// renderTab(tabKey)는 그 탭의 패널 JSX를 반환해야 하고, paneClassName은 각 패널이 원래 갖고 있던
// 스크롤·여백 클래스(overflow-y-auto, padding 등)를 그대로 옮겨 붙이는 용도다.
export function SwipeSubtabTrack({ swipe, tabs, renderTab, paneClassName = "", trackClassName = "" }) {
  const { containerRef, index, showPrev, showNext, trackStyle, onTouchStart, onTouchMove, onTouchEnd } = swipe;
  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${trackClassName}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex h-full" style={trackStyle}>
        {showPrev && (
          <div key={tabs[index - 1]} className={`w-full shrink-0 h-full ${paneClassName}`}>
            {renderTab(tabs[index - 1])}
          </div>
        )}
        <div key={tabs[index]} className={`w-full shrink-0 h-full ${paneClassName}`}>
          {renderTab(tabs[index])}
        </div>
        {showNext && (
          <div key={tabs[index + 1]} className={`w-full shrink-0 h-full ${paneClassName}`}>
            {renderTab(tabs[index + 1])}
          </div>
        )}
      </div>
    </div>
  );
}
