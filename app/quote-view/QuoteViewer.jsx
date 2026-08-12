"use client";

// 견적서 PDF를 이미지로 변환해 사진처럼 스와이프로 보여준다 — 카카오톡 인앱 브라우저는
// 대부분 PDF 뷰어가 없어서 PDF 직접 링크는 화면에 뜨지 않고 다운로드로 넘어가버린다.
// 반면 캔버스·자바스크립트는 어떤 인앱 브라우저든 기본 지원하므로, PDF를 우리가 직접
// 읽어서 이미지로 그려 보여주면 뷰어 유무와 무관하게 뜬다. 관리자 콘솔 견적 상세내역의
// PDF 미리보기(app/components/admin/QuotePdfPreview.jsx)와 완전히 같은 방식 —
// usePhotoLightboxGestures·PhotoLightboxPane을 그대로 재사용한다.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePhotoLightboxGestures } from "@/app/hooks/usePhotoLightboxGestures";
import { PhotoLightboxPane } from "@/app/components/ui";

export default function QuoteViewer({ url }) {
  const [pages, setPages] = useState(null); // null=로딩중, []=실패
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument(url).promise;
        const images = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          // 화면에서 확대해봐도 흐리지 않도록 실제 표시 크기보다 넉넉히 큰 해상도로 렌더한다.
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          images.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPages(images);
      } catch (e) {
        if (!cancelled) {
          setError(e.message ?? "알 수 없는 오류");
          setPages([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const pageCount = pages?.length ?? 0;
  // 휠 확대는 쓸 일이 없는 모바일 화면이라 꺼둔다 — 더블탭 확대만 남긴다.
  const { containerRef, idx, showPrev, showNext, trackStyle, zoom, pan, isGesturing, handlers } =
    usePhotoLightboxGestures(pageCount, index, setIndex, { wheelZoom: false });

  if (pages === null) {
    return <div className="flex-1 flex items-center justify-center text-sm text-slate-400">견적서 불러오는 중...</div>;
  }

  if (pageCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-slate-500 px-6 text-center">
        <p>견적서를 불러오지 못했습니다{error ? ` (${error})` : ""}.</p>
        <a href={url} className="text-blue-600 font-bold underline">PDF 파일 다운로드</a>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div ref={containerRef} className="relative flex-1 min-h-0 touch-none overflow-hidden" {...handlers}>
        {pageCount > 1 && (
          <span className="absolute top-2 right-2 z-10 text-[11px] font-bold text-white bg-black/50 rounded-full px-2 py-0.5">{index + 1}/{pageCount}</span>
        )}
        {pageCount > 1 && (
          <button
            onClick={() => setIndex((i) => (i - 1 + pageCount) % pageCount)}
            className="absolute left-2 z-20 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-600 bg-white/90 border border-slate-200 rounded-full shadow"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex h-full" style={trackStyle}>
          {showPrev && <PhotoLightboxPane key={idx - 1} url={pages[idx - 1]} />}
          <PhotoLightboxPane key={idx} url={pages[idx]} active zoom={zoom} pan={pan} isGesturing={isGesturing} />
          {showNext && <PhotoLightboxPane key={idx + 1} url={pages[idx + 1]} />}
        </div>
        {pageCount > 1 && (
          <button
            onClick={() => setIndex((i) => (i + 1) % pageCount)}
            className="absolute right-2 z-20 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-600 bg-white/90 border border-slate-200 rounded-full shadow"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      <a href={url} className="shrink-0 text-center text-xs font-bold text-blue-600 py-3 border-t border-slate-200 bg-white">
        PDF 원본 다운로드
      </a>
    </div>
  );
}
