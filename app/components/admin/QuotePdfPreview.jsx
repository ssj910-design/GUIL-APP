"use client";

// 견적서 PDF를 사진 미리보기처럼 보여준다 — 브라우저 네이티브 PDF 뷰어(인쇄·확대축소·다운로드
// 툴바, 썸네일 사이드바)를 그대로 iframe으로 띄우면 관리자 콘솔과 안 어울리고 한 장씩만 보고
// 싶다는 요구에도 안 맞는다. pdfjs-dist로 각 페이지를 이미지로 미리 렌더링한 뒤, 사진
// 라이트박스와 같은 좌우 스와이프 훅·조각(usePhotoLightboxGestures, PhotoLightboxPane)을
// 그대로 재사용해 한 장씩 넘겨보게 한다.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePhotoLightboxGestures } from "@/app/hooks/usePhotoLightboxGestures";
import { PhotoLightboxPane } from "@/app/components/ui";

export default function QuotePdfPreview({ url, height = "70vh" }) {
  const [pages, setPages] = useState(null); // null=로딩중, []=실패
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPages(null);
    setIndex(0);
    setError("");
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
          setError("PDF 미리보기를 불러오지 못했습니다: " + (e.message ?? "알 수 없는 오류"));
          setPages([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  const pageCount = pages?.length ?? 0;
  const { containerRef, idx, showPrev, showNext, trackStyle, zoom, pan, isGesturing, handlers } =
    usePhotoLightboxGestures(pageCount, index, setIndex);

  if (pages === null) {
    return <div className="flex items-center justify-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl" style={{ height }}>PDF 불러오는 중...</div>;
  }
  if (pageCount === 0) {
    return <div className="flex items-center justify-center text-xs text-red-500 bg-slate-50 border border-slate-200 rounded-xl px-4 text-center" style={{ height }}>{error || "PDF 미리보기를 불러오지 못했습니다."}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="relative bg-slate-50 border border-slate-200 rounded-xl overflow-hidden touch-none"
      style={{ height }}
      {...handlers}
    >
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
  );
}
