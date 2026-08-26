"use client";

// 교체확인서 전체화면 뷰어 — "부품교체·공사 내역" 목록의 "근거" 자리에서 여는 버튼으로
// 뜬다. 서버(app/api/generate-replacement-certificate-pdf)에서 그때그때 새로 그린(또는
// 캐시된) PDF를 받아, PhotoLightbox와 같은 방식(전체화면 어두운 배경 + createPortal)으로
// 보여준다.
// 미리보기는 브라우저 내장 PDF 뷰어(<iframe>)를 그대로 쓴다 — pdfjs-dist로 캔버스에 직접
// 그리던 이전 방식은 열 때마다 pdf.js 워커를 CDN에서 받아와 페이지를 렌더링해야 해서
// (캐시된 PDF를 열 때도 마찬가지) 체감이 계속 느렸다. iframe은 그 비용이 전혀 없다.
// pdf.js는 "JPG" 다운로드를 실제로 누를 때만(드물게, 필요할 때만) 지연 로드한다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2 } from "lucide-react";

async function renderPdfToCanvases(blobUrl) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjsLib.getDocument(blobUrl).promise;
  const pageNums = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  return Promise.all(pageNums.map(async (i) => {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return canvas;
  }));
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Storage 공개 URL → 문서명이 붙는 중계 URL(app/api/certificate-pdf). 미리보기를 이걸로
// 열어야 브라우저 내장 PDF 뷰어의 저장 버튼도 문서명 그대로 받는다.
function namedPdfUrl(storageUrl, filenameBase) {
  const path = storageUrl?.split("/object/public/photos/")[1];
  return path ? `/api/certificate-pdf/${encodeURIComponent(filenameBase + ".pdf")}?path=${path}` : null;
}

// 여러 페이지 캔버스를 세로로 이어 붙여 JPG 한 장으로 만든다.
function stitchCanvasesToJpegBlob(canvases) {
  const w = Math.max(...canvases.map((c) => c.width));
  const h = canvases.reduce((sum, c) => sum + c.height, 0);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  canvases.forEach((c) => {
    ctx.drawImage(c, 0, y);
    y += c.height;
  });
  return new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.92));
}

export default function ReplacementCertificateViewer({ cert, filenameBase, cachedUrl, onGenerated, onClose }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloading, setDownloading] = useState(null); // "pdf" | "jpg" | null
  const pdfBlobRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    (async () => {
      try {
        if (cachedUrl) {
          setPreviewUrl(namedPdfUrl(cachedUrl, filenameBase) ?? cachedUrl);
          setStatus("ready");
          return;
        }
        const res = await fetch("/api/generate-replacement-certificate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cert),
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("application/pdf")) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.reason ?? "교체확인서를 만들지 못했습니다");
        }
        const newCertUrl = res.headers.get("x-certificate-url");
        if (newCertUrl) onGenerated?.(newCertUrl);
        const blob = await res.blob();
        if (cancelled) return;
        pdfBlobRef.current = blob;
        // Storage 업로드가 됐으면 문서명이 붙는 중계 URL로, 안 됐으면 blob으로 보여준다.
        const named = newCertUrl && namedPdfUrl(newCertUrl, filenameBase);
        if (!named) objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(named || objectUrl);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? "알 수 없는 오류");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다운로드 버튼용 원본 — 저장된 URL을 그대로 미리보기에 쓴 경우엔 아직 안 받아왔다.
  async function pdfBlob() {
    if (!pdfBlobRef.current) pdfBlobRef.current = await (await fetch(previewUrl)).blob();
    return pdfBlobRef.current;
  }

  async function downloadPdf() {
    setDownloading("pdf");
    triggerDownload(await pdfBlob(), `${filenameBase}.pdf`);
    setDownloading(null);
  }

  // JPG는 자주 쓰는 기능이 아니라 여기서만 pdf.js를 지연 로드한다 — 미리보기(iframe)는
  // 이 비용을 안 치른다.
  async function downloadJpg() {
    setDownloading("jpg");
    try {
      const blobUrl = URL.createObjectURL(await pdfBlob());
      const canvases = await renderPdfToCanvases(blobUrl);
      URL.revokeObjectURL(blobUrl);
      const jpegBlob = await stitchCanvasesToJpegBlob(canvases);
      triggerDownload(jpegBlob, `${filenameBase}.jpg`);
    } catch (err) {
      alert("JPG 변환에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setDownloading(null);
  }

  return createPortal(
    <div className="fixed inset-0 lg:left-56 z-[70] bg-slate-900/70 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white shrink-0" aria-label="닫기">
            <X size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">교체확인서</p>
            <p className="text-[11px] text-white/60 truncate">{cert.siteUnit}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={downloadJpg}
            disabled={status !== "ready" || downloading}
            className="flex items-center gap-1.5 text-xs font-bold text-white border border-white/25 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            {downloading === "jpg" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} JPG
          </button>
          <button
            onClick={downloadPdf}
            disabled={status !== "ready" || downloading}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-700 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            {downloading === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-stretch p-4 md:p-8">
        {status === "loading" && (
          <div className="flex-1 flex items-center justify-center text-sm font-semibold text-white/70 gap-2">
            <Loader2 size={16} className="animate-spin" /> 교체확인서를 불러오는 중...
          </div>
        )}
        {status === "error" && (
          <div className="flex-1 flex items-center justify-center text-sm font-semibold text-red-300 text-center px-6">
            {error}
          </div>
        )}
        {status === "ready" && (
          <iframe src={previewUrl} title="교체확인서" className="w-full h-full rounded-lg shadow-2xl bg-white border-0" />
        )}
      </div>
    </div>,
    document.body
  );
}
