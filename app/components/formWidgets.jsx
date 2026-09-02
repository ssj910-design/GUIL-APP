import { useState, useContext, useRef, useEffect } from "react";
import { X, Camera, Search, Image as ImageIcon } from "lucide-react";
import { uploadPhoto, dataUrlToBlob, isVideoUrl } from "@/lib/photos";
import { inputCls, Sheet, PhotoLightbox } from "@/app/components/ui";
import { SitesContext } from "@/app/components/context";
import { activeSites } from "@/lib/utils";


/* ------------------------------------------------------------------ */
/* MATERIAL (자재·견적)                                                  */
/* ------------------------------------------------------------------ */

export function SiteSearchSelect({ value, onChange, placeholder = "현장명을 검색하세요" }) {
  const sites = useContext(SitesContext);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = sites.find((s) => s.id === value);
  // 계약종료 현장은 새 고장접수·자재·견적 신청 대상이 아니므로 검색 목록에서 뺀다
  // (단, 이미 선택된 값이 계약종료 현장이어도 selected 표시는 원본 sites 기준으로 그대로 유지).
  const filtered = activeSites(sites).filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${inputCls} pl-8`}
          placeholder={placeholder}
          value={open ? query : selected ? (selected.elevatorNo ? `${selected.name} · ${selected.elevatorNo}` : selected.name) : ""}
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


export function MultiPhotoUpload({ photos, onAdd, onRemove, label, required = true, uploadFolder, onUploaded, compactHint = false, onUploadingChange }) {
  // iOS Safari는 accept="image/*" 입력칸에 multiple까지 붙으면(여러 장 한꺼번에 선택) 카메라
  // 촬영 옵션을 아예 빼고 곧장 사진 라이브러리 선택 화면으로 건너뛴다 — "촬영하면서 동시에
  // 여러 장 선택"은 말이 안 되기 때문. 그래서 카메라 입력칸(한 장, capture)과 사진첩 입력칸
  // (여러 장, multiple)을 따로 두고, "추가" 버튼을 누르면 그중 뭘 쓸지 먼저 고르게 한다.
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    onUploadingChange?.(true);
    for (const file of files) {
      try {
        const url = await uploadPhoto(file, uploadFolder);
        // onUploaded가 서버에 저장까지 끝내고 나서 다음 파일로 넘어가야, 여러 장을 연달아
        // 올릴 때 저장 요청들이 순서가 뒤섞여 서로 덮어쓰는 일이 없습니다.
        await onUploaded(url);
      } catch (err) {
        alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
      }
    }
    setUploading(false);
    onUploadingChange?.(false);
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative aspect-square rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
            {p?.url ? (
              isVideoUrl(p.url) ? <video src={p.url} className="w-full h-full object-cover" /> : <img src={p.url} alt="" className="w-full h-full object-cover" />
            ) : <ImageIcon size={16} className="text-slate-400" />}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {uploadFolder ? (
          <>
            <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={handleFiles} />
            <input ref={galleryInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
            <button
              type="button"
              onClick={() => setChoosing(true)}
              disabled={uploading}
              className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 active:bg-slate-50 disabled:opacity-50"
            >
              <Camera size={16} />
              <span className="text-[9px] font-semibold mt-0.5">{uploading ? "업로드 중" : "추가"}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 active:bg-slate-50"
          >
            <Camera size={16} />
            <span className="text-[9px] font-semibold mt-0.5">추가</span>
          </button>
        )}
      </div>
      {!compactHint && (
        <p className={`text-[10px] ${required && photos.length === 0 ? "text-red-500 font-semibold" : "text-slate-400"}`}>
          {`${label} · ${required ? "최소 1장 필수, " : ""}장수 제한 없음 · 현재 ${photos.length}장`}
        </p>
      )}
      {choosing && (
        <Sheet title="사진 추가" onClose={() => setChoosing(false)}>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setChoosing(false); cameraInputRef.current?.click(); }}
              className="w-full flex items-center gap-2.5 text-sm font-bold text-slate-800 bg-slate-100 rounded-xl px-4 py-3.5 active:bg-slate-200"
            >
              <Camera size={18} /> 카메라로 촬영
            </button>
            <button
              type="button"
              onClick={() => { setChoosing(false); galleryInputRef.current?.click(); }}
              className="w-full flex items-center gap-2.5 text-sm font-bold text-slate-800 bg-slate-100 rounded-xl px-4 py-3.5 active:bg-slate-200"
            >
              <ImageIcon size={18} /> 사진·영상첩에서 선택
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}


// 교체 전/후/확인서처럼 슬롯 하나에 사진 한 장만 올릴 때 쓰는 업로드 컴포넌트입니다.
export function SinglePhotoUpload({ label, url, uploadFolder, onUploaded, onRemove }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const uploadedUrl = await uploadPhoto(file, uploadFolder);
      onUploaded(uploadedUrl);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setUploading(false);
  }

  if (url) {
    return (
      <>
        <div className="relative rounded-xl overflow-hidden border border-slate-200 h-32">
          <img src={url} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setViewing(true)} />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
          >
            <X size={13} />
          </button>
        </div>
        {viewing && (
          <PhotoLightbox urls={[url]} index={0} onIndexChange={() => {}} onClose={() => setViewing(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center gap-1.5 text-slate-500 active:bg-slate-50 disabled:opacity-50"
      >
        <Camera size={22} />
        <span className="text-xs font-semibold">{uploading ? "업로드 중..." : label}</span>
      </button>
    </>
  );
}


// 관리자가 자재/견적/상비부품 지급 시 찍는 "지급 사진" 한 장을 올리는 버튼입니다.
export function SupplyPhotoButton({ label, uploadFolder, onUploaded, spacingClassName = "mt-2.5" }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, uploadFolder);
      onUploaded(url);
    } catch (err) {
      alert("사진 업로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setUploading(false);
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`w-full ${spacingClassName} border-2 border-dashed border-slate-300 rounded-lg py-3 flex flex-col items-center gap-1 text-slate-500 active:bg-slate-50 disabled:opacity-50`}
      >
        <Camera size={18} />
        <span className="text-[11px] font-semibold">{uploading ? "업로드 중..." : label}</span>
      </button>
    </>
  );
}


// 지류 교체확인서를 대체하는 현장 서명 캡처. 캔버스에 그린 서명을 이미지로 저장해
// SinglePhotoUpload와 동일한 url/onSigned·onClear 패턴으로 다룬다 — 부분 수정 없이
// "지우고 다시 서명"만 지원한다(지류에 다시 사인받는 것과 같은 개념).
export function SignaturePad({ url, uploadFolder, onSigned, onClear }) {
  const padRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (url) return;
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    const rect = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    // 캔버스를 흰 배경으로 채워둔다 — 안 채우면 투명(알파) 상태로 남아, JPEG로 압축될 때
    // 알파가 없어져 배경이 검게 뜬다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, [url]);

  function posOf(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function start(e) {
    e.preventDefault();
    drawingRef.current = true;
    hasDrawnRef.current = true;
    setEmpty(false);
    const p = posOf(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = posOf(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function stop() { drawingRef.current = false; }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    hasDrawnRef.current = false;
    setEmpty(true);
  }

  async function handleDone() {
    if (!hasDrawnRef.current) return;
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      // canvas.toBlob()은 이미지 크기와 무관하게 ~13초씩 걸리는 버그가 있어(lib/photos.js
      // compressImage 참고) 같은 이유로 동기 방식인 toDataURL을 쓴다.
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], "signature.jpg", { type: "image/jpeg" });
      const uploadedUrl = await uploadPhoto(file, uploadFolder);
      onSigned(uploadedUrl);
    } catch (err) {
      alert("서명 저장에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setSaving(false);
  }

  if (url) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="고객 서명" className="w-full h-40 object-contain" />
        <button
          type="button"
          onClick={() => { clearCanvas(); onClear(); }}
          className="w-full text-xs font-bold text-slate-500 py-2 border-t border-slate-200 active:bg-slate-100"
        >
          다시 서명받기
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={padRef}
        className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 h-40"
        style={{ touchAction: "none" }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full rounded-xl"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
        />
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400 pointer-events-none text-center px-4 leading-relaxed">
            여기에 손가락으로
            <br />
            서명해주세요
          </p>
        )}
        {!empty && (
          <button
            type="button"
            onClick={clearCanvas}
            className="absolute top-2 right-2 text-[11px] font-bold text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1"
          >
            지우기
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleDone}
        disabled={empty || saving}
        className="w-full mt-2 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 active:bg-blue-800"
      >
        {saving ? "저장 중..." : "서명 완료"}
      </button>
    </div>
  );
}
