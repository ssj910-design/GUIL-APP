"use client";

// 첨부 문서(PDF·오피스·한글 등) 목록 — 사진·영상은 각 화면의 PhotoGrid가 맡고, 문서만 이 칩으로 보여준다.
// 관리자웹 할일 상세·폰앱 할일 상세 공용. PDF는 새 탭에서 바로 열리고 나머지는 다운로드된다.
import { FileText, X } from "lucide-react";
import { attachmentNameOf, isFileUrl } from "@/lib/photos";

export function splitAttachments(urls) {
  const list = urls ?? [];
  return { media: list.filter((u) => !isFileUrl(u)), files: list.filter((u) => isFileUrl(u)) };
}

export default function FileChips({ urls, onRemove }) {
  if (!urls?.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {urls.map((url, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 pl-2.5 pr-1.5 py-2">
          <FileText size={15} className="text-slate-400 shrink-0" />
          <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-xs font-semibold text-blue-700">
            {attachmentNameOf(url)}
          </a>
          {onRemove && (
            <button type="button" onClick={() => onRemove(url)} aria-label="첨부 삭제" className="shrink-0 w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center">
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
