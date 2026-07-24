"use client";

// 네이티브 window.confirm()을 대체하는 커스텀 확인창.
// 일부 모바일 브라우저(특히 홈 화면에 추가한 PWA)에서 window.confirm()이 제대로 안 뜨거나
// 취소를 눌러도 무시되는 사례가 있어, 버튼 동작을 코드로 확실히 보장하기 위해 직접 그린다.
// 사용법: `if (!(await confirmAsync("정말 삭제할까요?"))) return;` — 기존 confirm() 자리에 그대로 대체.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

let pushRequest = null;

export function confirmAsync(message) {
  return new Promise((resolve) => {
    if (pushRequest) pushRequest({ message, resolve });
    else resolve(window.confirm(message)); // 호스트가 아직 마운트되지 않은 극히 드문 경우의 안전망
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    pushRequest = setReq;
    return () => { pushRequest = null; };
  }, []);

  if (!req) return null;

  const finish = (result) => {
    req.resolve(result);
    setReq(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6" onClick={() => finish(false)}>
      <div className="bg-white rounded-2xl p-5 max-w-xs w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed mb-5">{req.message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => finish(true)} className="text-sm font-bold text-white bg-blue-700 rounded-lg px-4 py-2.5">확인</button>
          <button onClick={() => finish(false)} className="text-sm font-bold text-slate-600 bg-slate-100 rounded-lg px-4 py-2.5">취소</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
