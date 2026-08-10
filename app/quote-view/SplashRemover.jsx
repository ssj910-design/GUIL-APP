"use client";

import { useEffect } from "react";

// layout.js의 정적 스플래시(#app-splash)는 ElevatorFieldApp/AdminApp이 마운트되며 지우는데,
// 이 페이지는 그 둘을 거치지 않으므로 직접 지운다.
export function SplashRemover() {
  useEffect(() => { document.getElementById("app-splash")?.remove(); }, []);
  return null;
}
