"use client";

// 모든 탭 화면 공통 당겨서 새로고침 — 각 탭이 자기만의 overflow-y-auto 스크롤 영역을 갖고 있어서,
// 터치 시작 지점에서 가장 가까운 실제 스크롤 컨테이너를 찾아 그게 맨 위(scrollTop 0)일 때만
// 아래로 당기는 제스처를 새로고침으로 인식한다.
import { useRef, useState } from "react";
import { RotateCw } from "lucide-react";

const THRESHOLD = 64; // 이만큼 당기면 손을 뗐을 때 새로고침 실행
const MAX_PULL = 90;

function findScrollParent(el) {
  let node = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const dragging = useRef(false);

  function handleTouchStart(e) {
    if (refreshing) return;
    const scrollParent = findScrollParent(e.touches[0].target);
    if (scrollParent && scrollParent.scrollTop > 0) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
    dragging.current = false;
  }

  function handleTouchMove(e) {
    if (startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      dragging.current = true;
      setPull(Math.min(dy * 0.5, MAX_PULL));
    }
  }

  async function handleTouchEnd() {
    if (!dragging.current || refreshing) { startY.current = null; setPull(0); return; }
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(56);
      await onRefresh?.();
      setRefreshing(false);
    }
    setPull(0);
    startY.current = null;
    dragging.current = false;
  }

  const indicatorHeight = refreshing ? 56 : pull;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative min-h-0"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-center overflow-hidden pointer-events-none"
        style={{ height: indicatorHeight, transition: dragging.current ? "none" : "height 0.2s" }}
      >
        <RotateCw
          size={20}
          className={`text-blue-600 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? "none" : `rotate(${pull * 3}deg)`, opacity: Math.min(pull / THRESHOLD, 1) }}
        />
      </div>
      <div
        className="flex-1 flex flex-col min-h-0"
        style={{ transform: `translateY(${indicatorHeight}px)`, transition: dragging.current ? "none" : "transform 0.2s" }}
      >
        {children}
      </div>
    </div>
  );
}
