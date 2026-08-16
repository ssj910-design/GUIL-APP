"use client";

// 교체확인서 전체화면 뷰어 — "부품교체·공사 내역" 목록의 "근거" 자리에서 여는 버튼으로
// 뜬다. 서버(app/api/generate-replacement-certificate-pdf)에서 그때그때 새로 그린 PDF를
// 받아, PhotoLightbox와 같은 방식(전체화면 어두운 배경 + createPortal)으로 보여준다.
// 미리보기는 pdfjs-dist로 각 페이지를 캔버스에 렌더링(QuotePdfPreview와 동일한 기법)해
// 세로로 이어 붙이고, 그 캔버스를 그대로 JPG 다운로드에도 재사용한다.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2 } from "lucide-react";

async function renderPdfToCanvases(blobUrl) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjsLib.getDocument(blobUrl).promise;
  const canvases = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
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
  const [canvases, setCanvases] = useState([]);
  const [downloading, setDownloading] = useState(null); // "pdf" | "jpg" | null
  const pdfBlobRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let blob;
        if (cachedUrl) {
          // 이미 한 번 만들어 Storage에 올려둔 파일이 있으면 다시 그리지 않고 그대로 받아온다
          // — 매번 새로 만들 때 몇 초씩 걸리던 한글 폰트 임베딩을 건너뛴다.
          const res = await fetch(cachedUrl);
          if (!res.ok) throw new Error("저장된 교체확인서를 불러오지 못했습니다");
          blob = await res.blob();
        } else {
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
          blob = await res.blob();
        }
        if (cancelled) return;
        pdfBlobRef.current = blob;
        const blobUrl = URL.createObjectURL(blob);
        const rendered = await renderPdfToCanvases(blobUrl);
        URL.revokeObjectURL(blobUrl);
        if (cancelled) return;
        setCanvases(rendered);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message ?? "알 수 없는 오류");
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadPdf() {
    if (!pdfBlobRef.current) return;
    setDownloading("pdf");
    triggerDownload(pdfBlobRef.current, `${filenameBase}.pdf`);
    setDownloading(null);
  }

  async function downloadJpg() {
    if (!canvases.length) return;
    setDownloading("jpg");
    const blob = await stitchCanvasesToJpegBlob(canvases);
    triggerDownload(blob, `${filenameBase}.jpg`);
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

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-4 p-4 md:p-8">
        {status === "loading" && (
          <div className="flex-1 flex items-center justify-center text-sm font-semibold text-white/70 gap-2">
            <Loader2 size={16} className="animate-spin" /> 교체확인서를 만드는 중...
          </div>
        )}
        {status === "error" && (
          <div className="flex-1 flex items-center justify-center text-sm font-semibold text-red-300 text-center px-6">
            {error}
          </div>
        )}
        {status === "ready" && canvases.map((canvas, i) => (
          <img
            key={i}
            src={canvas.toDataURL("image/png")}
            alt={`교체확인서 ${i + 1}페이지`}
            className="w-full max-w-3xl rounded-lg shadow-2xl bg-white"
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
