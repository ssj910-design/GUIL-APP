import { useEffect, useRef, useState } from "react";

// 사진 전체보기(라이트박스)의 손짓 처리 — useSwipeSubtab과 같은 트랙-드래그 방식으로 사진도
// 손가락을 따라 옆 사진이 실제로 슬라이드해 들어오게 한다(서브탭 전환과 동일한 느낌).
// 확대 중(zoom>1)일 때는 한 손가락 드래그가 페이지 넘김 대신 확대된 사진 이동(pan)이 되고,
// 두 손가락은 핀치 확대, 짧게 두 번 탭하면 확대/해제를 토글한다.
const THRESHOLD_RATIO = 0.15;
const EDGE_RESISTANCE = 0.35;
const SETTLE_MS = 450;
const TRANSITION = "transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)";
const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 10;

export function usePhotoLightboxGestures(urlsLength, index, onIndexChange) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragPx, setDragPx] = useState(0);
  const [dir, setDir] = useState(0); // -1 이전 사진이 옆에 보이는 중 · 1 다음 사진이 보이는 중
  const [animating, setAnimating] = useState(false);
  const [pivotIndex, setPivotIndex] = useState(index);
  const containerRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const axisRef = useRef(null);
  const lastTapRef = useRef(0);
  const settleTimer = useRef(null);

  const idx = dir !== 0 || dragPx !== 0 ? pivotIndex : index;

  // 사진이 바뀌면(스와이프 커밋이든 화살표 탭이든) 확대·이동 상태를 초기화 — 이전 사진 확대 상태가
  // 다음 사진에 남아있으면 헷갈린다.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [index]);

  function toggleZoom() {
    setZoom((z) => (z > 1 ? 1 : 2.5));
    setPan({ x: 0, y: 0 });
  }
  function onWheel(e) {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.01)));
  }

  function beginSinglePointerGesture(e) {
    if (zoom > 1) {
      gestureRef.current = { type: "pan", startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    } else {
      clearTimeout(settleTimer.current);
      axisRef.current = null;
      setPivotIndex(index);
      setAnimating(false);
      gestureRef.current = { type: "page", startX: e.clientX, startY: e.clientY, startTime: Date.now() };
    }
  }

  function onPointerDown(e) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gestureRef.current = { type: "pinch", startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: zoom };
      setDragPx(0);
      setDir(0);
    } else if (pts.length === 1) {
      beginSinglePointerGesture(e);
    }
  }

  function onPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    if (g.type === "pinch") {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2 || g.startDist <= 0) return;
      const [a, b] = pts;
      setZoom(Math.min(4, Math.max(1, g.startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDist))));
    } else if (g.type === "pan") {
      setPan({ x: g.panX + (e.clientX - g.startX), y: g.panY + (e.clientY - g.startY) });
    } else if (g.type === "page") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (axisRef.current == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axisRef.current !== "x") return;
      const atStart = pivotIndex === 0 && dx > 0;
      const atEnd = pivotIndex === urlsLength - 1 && dx < 0;
      const eased = atStart || atEnd ? dx * EDGE_RESISTANCE : dx;
      setDragPx(eased);
      setDir(eased < 0 ? 1 : eased > 0 ? -1 : 0);
    }
  }

  function endGesture(e) {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    const width = containerRef.current?.clientWidth || 0;

    if (g?.type === "page") {
      let committed = false;
      let commitDir = 0;
      if (axisRef.current === "x" && width) {
        const ratio = dragPx / width;
        if (ratio <= -THRESHOLD_RATIO && pivotIndex < urlsLength - 1) {
          onIndexChange(pivotIndex + 1);
          committed = true;
          commitDir = 1;
        } else if (ratio >= THRESHOLD_RATIO && pivotIndex > 0) {
          onIndexChange(pivotIndex - 1);
          committed = true;
          commitDir = -1;
        }
      }
      if (committed || dragPx !== 0) {
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
      } else {
        // 거의 움직이지 않은 탭 — 더블탭이면 확대/해제 토글
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          toggleZoom();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    } else if (g?.type === "pan") {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && Date.now() - g.startTime < DOUBLE_TAP_MS + 200) {
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
          toggleZoom();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }
    }

    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      axisRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const [[, p]] = pointersRef.current;
      beginSinglePointerGesture({ clientX: p.x, clientY: p.y });
    }
  }

  const showPrev = dir === -1 && idx > 0;
  const showNext = dir === 1 && idx < urlsLength - 1;
  const slotOffset = showPrev ? 1 : 0;
  const trackStyle = {
    transform: `translateX(calc(${-slotOffset * 100}% + ${dragPx}px))`,
    transition: animating ? TRANSITION : "none",
  };

  return {
    containerRef,
    idx,
    showPrev,
    showNext,
    trackStyle,
    zoom,
    pan,
    isGesturing: () => !!gestureRef.current,
    handlers: { onDoubleClick: toggleZoom, onWheel, onPointerDown, onPointerMove, onPointerUp: endGesture, onPointerCancel: endGesture },
  };
}
