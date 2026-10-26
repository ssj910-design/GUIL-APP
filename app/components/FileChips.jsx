"use client";

// 첨부 문서(PDF·오피스·한글 등) 목록 — 사진·영상은 각 화면의 PhotoGrid가 맡고, 문서만 이 칩으로 보여준다.
// 관리자웹 할일 상세·폰앱 할일 상세 공용.
// 예전엔 링크(<a>)로 열기만 해서 눌러도 아무 표시가 없었다(웹은 몇 초 걸리고 앱은 안드로이드
// 알림으로만 알려줘 받아졌는지 알 수 없었다) — 사진 다운로드처럼 진행·완료 상태를 칩에 보여준다.
import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Check, FileText, Loader2, X } from "lucide-react";
import { attachmentNameOf, isFileUrl, downloadPhoto } from "@/lib/photos";

export function splitAttachments(urls) {
  const list = urls ?? [];
  return { media: list.filter((u) => !isFileUrl(u)), files: list.filter((u) => isFileUrl(u)) };
}

function FileChip({ url, onRemove }) {
  const name = attachmentNameOf(url);
  const [state, setState] = useState(null); // null | loading | done
  const native = Capacitor.isNativePlatform();

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    try {
      // 너무 빨리 끝나면 깜빡이고 말아서 무슨 일이 있었는지 모른다 — 최소 0.4초는 "받는 중"을 보여준다.
      await Promise.all([downloadPhoto(url, name), new Promise((r) => setTimeout(r, 400))]);
      setState("done");
      setTimeout(() => setState(null), 2500);
    } catch (err) {
      setState(null);
      alert("다운로드에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-2">
      {state === "loading" ? <Loader2 size={15} className="text-blue-500 shrink-0 animate-spin" />
        : state === "done" ? <Check size={15} className="text-emerald-600 shrink-0" />
        : <FileText size={15} className="text-slate-400 shrink-0" />}
      <button
        type="button"
        onClick={handleClick}
        className={`flex-1 min-w-0 truncate text-left text-xs font-semibold ${state === "done" ? "text-emerald-600" : "text-blue-700"}`}
      >
        {name}
        {state === "loading" && <span className="ml-1.5 font-normal text-slate-500">받는 중…</span>}
        {state === "done" && <span className="ml-1.5 font-normal">{native ? "다운로드함" : "저장함"}</span>}
      </button>
      {onRemove && (
        <button type="button" onClick={() => onRemove(url)} aria-label="첨부 삭제" className="shrink-0 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center">
          <X size={11} />
        </button>
      )}
    </div>
  );
}

export default function FileChips({ urls, onRemove }) {
  if (!urls?.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {urls.map((url, i) => <FileChip key={i} url={url} onRemove={onRemove} />)}
    </div>
  );
}
