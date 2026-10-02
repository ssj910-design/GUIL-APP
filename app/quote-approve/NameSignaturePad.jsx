"use client";

// 이름을 손가락으로 또박또박(정자) 3칸에 나눠 쓰게 하는 서명 캡처 — 카드결제 단말기의
// "이름 3칸 입력" 방식과 같다. 타이핑이 아니라 손글씨라 일반 서명과 같은 증빙력을 가지면서도
// 휘갈겨 쓴 서명보다 나중에 읽기 쉽다. 가운데 칸 양옆 선만 점선으로 그려서(2글자 이름처럼
// 가운데를 비워도 되는 칸이라는 느낌을 준다) 좁은 인라인 칸에서 바로 쓰게 하면 손가락으로
// 정확히 쓰기 어려워서, 탭하면 전체화면으로 띄워 크게 쓰고 "확인"을 눌러야 저장되게 한다.
import { useEffect, useRef, useState } from "react";
import { uploadPhoto, dataUrlToBlob } from "@/lib/photos";

function NameBoxFrame({ children }) {
  return (
    <div className="relative h-28 flex">
      <div className="flex-1 border-r border-dashed border-slate-300" />
      <div className="flex-1 border-r border-dashed border-slate-300" />
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function NameSignaturePad({ url, uploadFolder, onSigned, onClear, highlight }) {
  const [open, setOpen] = useState(false);

  if (url) {
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
        <NameBoxFrame>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="발주자 성함" className="absolute inset-0 w-full h-full object-contain" />
        </NameBoxFrame>
        <button
          type="button"
          onClick={onClear}
          className="w-full text-xs font-bold text-slate-500 py-2 border-t border-slate-200 active:bg-slate-100"
        >
          다시 쓰기
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-xl border-2 bg-slate-50 overflow-hidden ${highlight ? "border-red-400" : "border-slate-200"}`}
      >
        <NameBoxFrame>
          <p className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-400 text-center px-4 leading-relaxed">
            탭하여 이름 석자를
            <br />
            정자로 써주세요
          </p>
        </NameBoxFrame>
      </button>
      {open && (
        <FullscreenCapture
          uploadFolder={uploadFolder}
          onCancel={() => setOpen(false)}
          onDone={(uploadedUrl) => { setOpen(false); onSigned(uploadedUrl); }}
        />
      )}
    </>
  );
}

function FullscreenCapture({ uploadFolder, onCancel, onDone }) {
  const padRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    const rect = pad.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    // SignaturePad와 같은 이유로 흰 배경을 미리 채운다 — 안 채우면 JPEG 압축 시 배경이 검게 뜬다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

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

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setEmpty(true);
  }

  async function confirm() {
    if (!hasDrawnRef.current) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);
      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], "approver-name.jpg", { type: "image/jpeg" });
      const uploadedUrl = await uploadPhoto(file, uploadFolder);
      onDone(uploadedUrl);
    } catch (err) {
      alert("저장에 실패했습니다: " + (err.message ?? "알 수 없는 오류"));
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <button type="button" onClick={onCancel} className="text-sm font-bold text-slate-500 py-1 px-2 -ml-2">취소</button>
        <p className="text-sm font-bold text-slate-800">이름 석자를 정자로 써주세요</p>
        <div className="w-10" />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div
          ref={padRef}
          className="relative w-full max-w-sm border-2 border-slate-300 rounded-2xl bg-slate-50"
          style={{ touchAction: "none", aspectRatio: "3 / 1.3" }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full rounded-2xl"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="flex-1 border-r border-dashed border-slate-300" />
            <div className="flex-1 border-r border-dashed border-slate-300" />
            <div className="flex-1" />
          </div>
          {empty && (
            <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-400 pointer-events-none">
              여기에 이름을 써주세요
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 px-4 py-3 border-t border-slate-200 shrink-0">
        <button
          type="button"
          onClick={clear}
          disabled={empty}
          className="px-4 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 disabled:opacity-50"
        >
          지우기
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={empty || saving}
          className="flex-1 py-3 rounded-xl text-sm font-extrabold text-white bg-blue-700 disabled:bg-slate-300"
        >
          {saving ? "저장 중..." : "확인"}
        </button>
      </div>
    </div>
  );
}
