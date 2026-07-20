import { useState, useContext, useRef } from "react";
import { X, Camera, Search, Image as ImageIcon } from "lucide-react";
import { uploadPhoto } from "@/lib/photos";
import { inputCls } from "@/app/components/ui";
import { SitesContext } from "@/app/components/context";


/* ------------------------------------------------------------------ */
/* MATERIAL (자재·견적)                                                  */
/* ------------------------------------------------------------------ */

export function SiteSearchSelect({ value, onChange, placeholder = "현장명을 검색하세요" }) {
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


export function MultiPhotoUpload({ photos, onAdd, onRemove, label, required = true, uploadFolder, onUploaded }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
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
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative aspect-square rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
            {p?.url ? <img src={p.url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-slate-400" />}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
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
      <p className={`text-[10px] ${required && photos.length === 0 ? "text-red-500 font-semibold" : "text-slate-400"}`}>
        {label} · {required ? "최소 1장 필수, " : ""}장수 제한 없음 · 현재 {photos.length}장
      </p>
    </div>
  );
}


// 교체 전/후/확인서처럼 슬롯 하나에 사진 한 장만 올릴 때 쓰는 업로드 컴포넌트입니다.
export function SinglePhotoUpload({ label, url, uploadFolder, onUploaded, onRemove }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

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
      <div className="relative rounded-xl overflow-hidden border border-slate-200 h-32">
        <img src={url} alt="" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
        >
          <X size={13} />
        </button>
      </div>
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
