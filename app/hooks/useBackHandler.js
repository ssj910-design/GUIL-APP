"use client";
import { useEffect, useRef } from "react";

// 안드로이드 하드웨어 뒤로가기 — 전역 스택. 지금 열려있는 시트·드릴다운·모달이
// useBackHandler(true, onBack)로 스스로 등록해두면, 뒤로가기가 눌렸을 때 가장 최근에
// 열린 것 하나만 골라 닫는다(여러 겹 열려있어도 한 번에 하나씩). ElevatorFieldApp.jsx의
// backButton 리스너가 popBackHandler()를 불러 쓴다 — 스택이 비어있으면 false를 돌려주고,
// 그때는 호출자가 탭 전환→앱 종료 등 다음 단계를 처리한다.
const stack = [];

export function useBackHandler(active, onBack) {
  const ref = useRef(onBack);
  ref.current = onBack;

  useEffect(() => {
    if (!active) return;
    const entry = { call: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

export function popBackHandler() {
  const entry = stack[stack.length - 1];
  if (!entry) return false;
  entry.call();
  return true;
}
