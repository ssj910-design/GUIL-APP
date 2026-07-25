import { useRef, useState } from "react";

// 서브탭 화면 좌우 스와이프 전환 — 드래그 중엔 옆 탭 화면이 화면 가장자리에서부터
// 손가락을 따라 실제로 슬라이드해 들어오고(스크롤하듯 미리보기), 손을 떼면 임계값을
// 넘긴 경우 그대로 이어서 완전히 넘어가거나(커밋) 못 넘겼으면 제자리로 되돌아간다.
// 순수 React 합성 이벤트만 써서 파일마다 ref/useEffect 없이 컨테이너에 그대로 붙일 수 있다.
// pivotIndex·width는 렌더링(trackStyle/barStyle 계산)에도 쓰이므로 ref가 아니라 state로 둔다
// (ref.current를 렌더 중에 읽으면 React 규칙 위반 — 이벤트 핸들러 안에서만 읽어야 하는 값이 아니다).
const THRESHOLD_RATIO = 0.2; // 화면 폭의 20% 이상 끌면 손을 뗐을 때 다음/이전 탭으로 커밋
const EDGE_RESISTANCE = 0.35; // 맨 앞/뒤 탭에서 더 끌 때(더 넘어갈 곳이 없을 때)의 저항감
const SETTLE_MS = 450; // 커밋/복귀 애니메이션(0.42s)이 끝난 뒤 여분 탭을 정리하기까지 여유시간
const TRANSITION = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)";

export function useSwipeSubtab(tabs, active, onChange) {
  const containerRef = useRef(null);
  const [dragPx, setDragPx] = useState(0);
  const [dir, setDir] = useState(0); // -1 이전 탭이 옆에 보이는 중 · 1 다음 탭이 옆에 보이는 중
  const [animating, setAnimating] = useState(false);
  const [pivotIndex, setPivotIndex] = useState(0); // 드래그 시작 시점의 탭 위치 — 커밋 애니메이션이 끝날 때까지 고정
  const [width, setWidth] = useState(0); // 드래그 시작 시점의 컨테이너 폭(px)
  const start = useRef(null);
  const axis = useRef(null); // "x" | "y" | null — 첫 이동으로 방향을 확정한다
  const settleTimer = useRef(null);

  const liveIndex = tabs.indexOf(active);
  // 드래그/커밋 애니메이션 도중엔 pivotIndex 기준으로 렌더링해 옆 탭이 갑자기 바뀌지 않게 한다.
  const index = dir !== 0 || dragPx !== 0 ? pivotIndex : liveIndex;

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    clearTimeout(settleTimer.current);
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = null;
    setWidth(containerRef.current?.clientWidth || 0);
    setPivotIndex(liveIndex);
    setAnimating(false);
    setDragPx(0);
    setDir(0);
  }

  function onTouchMove(e) {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (axis.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axis.current !== "x") return;
    const atStart = pivotIndex === 0 && dx > 0;
    const atEnd = pivotIndex === tabs.length - 1 && dx < 0;
    const eased = atStart || atEnd ? dx * EDGE_RESISTANCE : dx;
    setDragPx(eased);
    setDir(eased < 0 ? 1 : eased > 0 ? -1 : 0);
  }

  function onTouchEnd() {
    let committed = false;
    let commitDir = 0;
    if (axis.current === "x" && width) {
      const ratio = dragPx / width;
      if (ratio <= -THRESHOLD_RATIO && pivotIndex < tabs.length - 1) {
        onChange(tabs[pivotIndex + 1]);
        committed = true;
        commitDir = 1;
      } else if (ratio >= THRESHOLD_RATIO && pivotIndex > 0) {
        onChange(tabs[pivotIndex - 1]);
        committed = true;
        commitDir = -1;
      }
    }
    // 커밋됐으면 옆 탭이 화면 중앙까지 완전히 밀려오도록 끝까지 슬라이드시키고,
    // 못 넘겼으면 0으로 되돌려 원래 탭이 다시 화면을 채우게 한다.
    setDir(committed ? commitDir : dir);
    setAnimating(true);
    const target = committed ? (commitDir === 1 ? -width : width) : 0;
    requestAnimationFrame(() => setDragPx(target));
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setDir(0);
      setAnimating(false);
      setDragPx(0);
    }, SETTLE_MS);
    start.current = null;
    axis.current = null;
  }

  const showPrev = dir === -1 && index > 0;
  const showNext = dir === 1 && index < tabs.length - 1;
  const slotOffset = showPrev ? 1 : 0; // 렌더링된 슬롯 중 "현재 탭"의 위치(0=첫 슬롯, 1=둘째 슬롯)

  const trackStyle = {
    transform: `translateX(calc(${-slotOffset * 100}% + ${dragPx}px))`,
    transition: animating ? TRANSITION : "none",
  };

  const virtualIndex = width ? index - dragPx / width : index;
  const barStyle = {
    left: `${(virtualIndex / tabs.length) * 100}%`,
    width: `${100 / tabs.length}%`,
    transition: animating ? "left 0.42s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
  };

  return {
    containerRef,
    index,
    showPrev,
    showNext,
    trackStyle,
    barStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
