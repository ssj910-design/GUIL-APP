"use client";

// 관리자 콘솔 공용 헬퍼 — 표기(호기·담당자)는 v2 FK 우선, 옛 라벨 fallback.
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Pencil, Paperclip } from "lucide-react";
import { downloadPhoto, downloadPhotosAsZip, extOf } from "@/lib/photos";
import { shortDate, parseShortDate, autoFormatShortDate, formatUnitLabel, sortEngineersByDistance, busyStatusOf } from "@/lib/utils";
import { confirmAsync } from "@/app/components/ConfirmHost";

export const inputCls = "border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

// 기록의 위치 표기: unitId → "현장 · N호기", 없으면 옛 텍스트
export function locOf(data, unitId, fallbackSiteName, fallbackLabel) {
  const u = data.units.find((x) => x.id === unitId);
  if (!u) return [fallbackSiteName, fallbackLabel].filter(Boolean).join(" · ") || "-";
  const s = data.sites.find((x) => x.id === u.siteId);
  return `${s?.name ?? fallbackSiteName ?? "-"} · ${u.unitNo}`;
}

// 현장명만: unitId → 현장명, 없으면 옛 텍스트
export function siteOf(data, unitId, fallbackSiteName) {
  const u = data.units.find((x) => x.id === unitId);
  if (!u) return fallbackSiteName ?? "-";
  return data.sites.find((x) => x.id === u.siteId)?.name ?? fallbackSiteName ?? "-";
}

// 호기만: unitId → 호기명, 없으면 옛 텍스트(N호기로 정규화)
export function unitOf(data, unitId, fallbackLabel) {
  const u = data.units.find((x) => x.id === unitId);
  if (u) return u.unitNo;
  return fallbackLabel ? formatUnitLabel(fallbackLabel) : "-";
}

// 현장 주소: unitId로 site를 찾고, 없으면 옛 현장명 텍스트로 매칭
export function addressOf(data, unitId, fallbackSiteName) {
  const u = data.units.find((x) => x.id === unitId);
  const s = u ? data.sites.find((x) => x.id === u.siteId) : data.sites.find((x) => x.name === fallbackSiteName);
  return s?.address || "-";
}

// 담당자 표기: profileId → 이름, 없으면 옛 이름 텍스트
export function personOf(data, profileId, fallbackName) {
  return data.profiles.find((p) => p.id === profileId)?.name ?? fallbackName ?? "-";
}

const TONES = {
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  slate: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ tone = "slate", children }) {
  return <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function AdminTable({ head, children, minWidth = "48rem" }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-xs text-slate-400 border-b border-slate-100">
            {head.map((h, i) => (
              <th key={i} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${i === 0 ? "pl-5 text-left" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`text-xs font-bold rounded-full px-3 py-1.5 border ${
            value === o.value ? "bg-blue-700 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"
          }`}>
          {o.label}{o.count != null ? ` ${o.count}` : ""}
        </button>
      ))}
    </div>
  );
}

// PC용 중앙 모달 (관리자 콘솔 최초의 상세보기 팝업 패턴 — 모바일 Sheet와 별개).
export function Modal({ title, onClose, children, wide }) {
  const widthCls = wide === "2xl" ? "max-w-[88rem]" : wide === "xl" ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg";
  return (
    <div className="fixed inset-0 lg:left-56 z-40 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl max-h-[85vh] flex flex-col w-full ${widthCls}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// 계약서·지급대장 등 첨부파일 뷰어 — 클릭해서 새 탭을 열 필요 없이 바로 보여주고,
// 여러 장이면 좌우로 넘기고, 다운로드·삭제·추가까지 한 곳에서 한다 (현장정보 계약서와 인사관리 첨부 공통 사용).
export function FileCarousel({ urls, accept = "image/*,.pdf", uploadLabel = "파일 첨부 (사진/PDF)", height = "h-[60vh]", onUpload, onSave }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [idx, setIdx] = useState(0);
  const current = urls[Math.min(idx, urls.length - 1)];
  const isPdf = (current ?? "").toLowerCase().includes(".pdf");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUpload(file);
      const next = [...urls, url];
      await onSave(next);
      setIdx(next.length - 1);
    } catch (err) {
      alert("업로드 실패: " + (err.message ?? "알 수 없는 오류"));
    }
    setUploading(false);
  }

  async function removeCurrent() {
    if (!(await confirmAsync("이 파일을 삭제할까요?"))) return;
    const next = urls.filter((_, i) => i !== idx);
    await onSave(next);
    setIdx((i) => Math.max(0, Math.min(i, next.length - 1)));
  }

  if (urls.length === 0) {
    return (
      <>
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-slate-300 rounded-xl py-8 flex flex-col items-center gap-1.5 text-slate-500 disabled:opacity-50"
        >
          <Paperclip size={22} />
          <span className="text-xs font-semibold">{uploading ? "업로드 중..." : uploadLabel}</span>
        </button>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className={`relative bg-slate-50 border border-slate-200 rounded-xl overflow-hidden ${height} flex items-center justify-center`}>
        {urls.length > 1 && (
          <span className="absolute top-2 right-2 z-10 text-[11px] font-bold text-white bg-black/50 rounded-full px-2 py-0.5">{idx + 1}/{urls.length}</span>
        )}
        {isPdf ? (
          <iframe src={current} className="w-full h-full" title="첨부파일" />
        ) : (
          <img src={current} alt="첨부파일" className="max-w-full max-h-full object-contain" />
        )}
        {urls.length > 1 && (
          <>
            <button
              onClick={() => setIdx((i) => (i - 1 + urls.length) % urls.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-lg font-bold text-slate-600 bg-white/90 border border-slate-200 rounded-full shadow"
            >
              ‹
            </button>
            <button
              onClick={() => setIdx((i) => (i + 1) % urls.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-lg font-bold text-slate-600 bg-white/90 border border-slate-200 rounded-full shadow"
            >
              ›
            </button>
          </>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => downloadPhoto(current, `attachment-${idx + 1}.${extOf(current)}`)} className="text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5">
            다운로드
          </button>
          <button onClick={removeCurrent} className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            삭제
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          <Paperclip size={13} /> {uploading ? "업로드 중..." : "추가"}
        </button>
      </div>
    </div>
  );
}

// 재배정 팝업 — 배정 기사 select를 누르면 바로 바뀌던 것 대신, 버튼을 눌러야 여는 확인 단계.
// 모바일 AssignEngineerSheet와 같은 기준(바쁜 기사 경고, 미배정 알림 문구)으로 확인 팝업을 띄운다.
// 대시보드 실시간 고장 현황·고장관리 표 양쪽에서 공유.
export function ReassignModal({ failure, siteObj, engineers, engineerJobs, failures, onAssign, onClose }) {
  const rows = sortEngineersByDistance(engineers, siteObj);
  async function pick(name) {
    const st = name ? busyStatusOf(failures, name) : null;
    const msg = !name
      ? "미배정 하시겠습니까?\n모든 직원에게 알림이 갑니다."
      : st
        ? `${name}님은 지금 ${st}입니다.\n그래도 이 건을 배정할까요?`
        : `${name}으로 배정하시겠습니까?`;
    if (!(await confirmAsync(msg))) return;
    onAssign(failure, name);
    onClose();
  }
  return (
    <Modal title={`재배정 — ${failure.siteName}${failure.elevatorNo ? ` · ${formatUnitLabel(failure.elevatorNo)}` : ""}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => pick(null)} className="py-3 rounded-xl text-sm font-bold border text-red-500 border-red-200 bg-white hover:bg-red-50">
          미배정으로
        </button>
        {rows.map(({ engineer: p, km }) => {
          const job = engineerJobs.get(p.name);
          return (
            <button
              key={p.id}
              onClick={() => pick(p.name)}
              className="py-3 rounded-xl text-sm font-bold border text-slate-700 border-slate-200 bg-white hover:bg-blue-50"
            >
              {p.name}{km != null ? ` (${km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`})` : ""}
              {job && <span className="block text-[10px] font-normal text-slate-400 mt-0.5">{job.siteName} · {job.label}</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// 정렬 가능한 표 헤더 셀. sort = { key, dir } / setSort(next)
export function SortableTh({ label, sortKey, sort, setSort, className = "" }) {
  const active = sort?.key === sortKey;
  return (
    <th
      className={`px-3 py-2.5 font-semibold text-left cursor-pointer select-none ${className}`}
      onClick={() => setSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronsUpDown size={12} className="text-slate-300" />}
      </span>
    </th>
  );
}

// 정렬 유틸 — sort={key,dir}, getVal(row, key) => 비교값
export function sortRows(rows, sort, getVal) {
  if (!sort) return rows;
  const sorted = [...rows].sort((a, b) => {
    const va = getVal(a, sort.key);
    const vb = getVal(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });
  return sort.dir === "desc" ? sorted.reverse() : sorted;
}


// 날짜 입력 — 모바일은 년/월/일 셀렉트(네이티브 휠 피커로 뜬다), PC는 직접 타이핑.
// input[type=date]의 달력 팝업이 모바일에서 쓰기 불편하다는 피드백으로 나눠 놓았다.
// 캘린더 팝업 대신 "26.01.01" 형식을 키보드로 직접 입력 — 숫자만 쳐도 점은 자동으로 채워진다.
// 입력 중엔 로컬 상태로만 갖고 있다가 포커스를 벗어날 때 파싱해서 커밋한다(매 키입력마다
// 커밋하면 커서가 튄다). 저장된 값이 바뀌면 부모가 key={value}로 감싸 리마운트시켜야 반영된다.
export function DateTextInput({ value, onChange, placeholder = "26.01.01", className = "", autoFocus = false }) {
  const [text, setText] = useState(shortDate(value) === "-" ? "" : shortDate(value));

  function commit() {
    if (text.trim() === "") { onChange(""); return; }
    const parsed = parseShortDate(text);
    if (!parsed) {
      alert("날짜 형식이 올바르지 않습니다 (예: 26.01.01)");
      setText(shortDate(value) === "-" ? "" : shortDate(value));
      return;
    }
    onChange(parsed);
  }

  return (
    <input
      autoFocus={autoFocus}
      className={`${inputCls} ${className}`}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(autoFormatShortDate(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

// 값이 있는 칸은 평소엔 읽기 전용 텍스트("26.01.01")로 보여주고, 연필 아이콘을 눌러야
// 입력창이 뜬다 — 목록·상세보기에 입력창이 항상 떠 있으면 실수로 건드리기 쉬워서다.
export function EditableDate({ value, onCommit, emptyText = "-", className = "" }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <DateTextInput
        key={value ?? "unset"}
        value={value}
        autoFocus
        className={`min-w-24 ${className}`}
        onChange={(v) => { onCommit(v); setEditing(false); }}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-slate-600 ${className}`}>{value ? shortDate(value) : emptyText}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-slate-300 hover:text-slate-500 shrink-0" aria-label="날짜 수정">
        <Pencil size={12} />
      </button>
    </span>
  );
}

// 일반 텍스트용 연필-수정 칸 (휴대폰·아이디(민원24) 등) — EditableDate와 동일한 방식.
export function EditableText({ value, onCommit, placeholder = "", format, emptyText = "-", className = "" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  if (editing) {
    return (
      <input
        autoFocus
        className={`${inputCls} min-w-24 ${className}`}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(format ? format(e.target.value) : e.target.value)}
        onBlur={() => { onCommit(text); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`text-slate-600 ${className}`}>{value || emptyText}</span>
      <button type="button" onClick={() => { setText(value ?? ""); setEditing(true); }} className="text-slate-300 hover:text-slate-500 shrink-0" aria-label="수정">
        <Pencil size={12} />
      </button>
    </span>
  );
}

// 사진 그리드 — 상세보기 모달 전체 공용. 클릭하면 크게보기(좌우 이동, 낱장/전체 다운로드)가 뜬다.
export function PhotoGrid({ urls = [], cols = 4, emptyText = "등록된 사진이 없습니다" }) {
  const [viewerIndex, setViewerIndex] = useState(null);
  if (!urls.length) return <p className="text-xs text-slate-400">{emptyText}</p>;
  return (
    <>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {urls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt=""
            className="w-full aspect-square rounded-lg object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition"
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

// 크게보기 — 좌우 화살표로 이동, 지금 보는 사진 한 장 또는 전체(zip) 다운로드.
function PhotoLightbox({ urls, index, onIndexChange, onClose }) {
  const url = urls[index];

  function prev() { onIndexChange((index - 1 + urls.length) % urls.length); }
  function next() { onIndexChange((index + 1) % urls.length); }

  async function downloadOne() {
    try {
      await downloadPhoto(url, `사진_${index + 1}.${extOf(url)}`);
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

  // 사이드바(z-50)에 화살표가 가려지지 않도록 body에 바로 붙인다 — 이 div는 관리자 콘솔
  // 레이아웃(사이드바·본문) 트리 밖에서 렌더링되어 항상 전체 뷰포트 기준으로 뜬다.
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
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white"><X size={20} /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative px-4 min-h-0" onClick={(e) => e.stopPropagation()}>
        {urls.length > 1 && (
          <button onClick={prev} className="absolute left-2 md:left-6 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronLeft size={24} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
        {urls.length > 1 && (
          <button onClick={next} className="absolute right-2 md:right-6 text-white bg-black/40 hover:bg-black/60 rounded-full p-2">
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
