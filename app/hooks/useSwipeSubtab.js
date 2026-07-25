import { useRef, useState } from "react";

// 서브탭 화면 좌우 스와이프 전환 — 드래그 중엔 손가락을 따라 화면이 움직이고,
// 손을 떼면 임계값을 넘긴 경우 다음/이전 탭으로 바뀌면서 슬라이드로 이어진다.
// 순수 React 합성 이벤트만 써서 파일마다 ref/useEffect 없이 컨테이너에 그대로 붙일 수 있게 했다.
const THRESHOLD = 60; // 이만큼 끌면 손을 뗐을 때 탭 전환
const MAX_DRAG = 120; // 드래그 중 시각적 이동량 상한

export function useSwipeSubtab(tabs, active, onChange) {
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const start = useRef(null);
  const axis = useRef(null); // "x" | "y" | null — 첫 이동으로 방향을 확정한다

  const index = tabs.indexOf(active);

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axis.current = null;
    setAnimating(false);
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
    // 맨 앞/뒤 탭에서는 더 넘어갈 곳이 없으니 절반만 따라오는 저항감을 준다.
    const atStart = index === 0 && dx > 0;
    const atEnd = index === tabs.length - 1 && dx < 0;
    const eased = atStart || atEnd ? dx * 0.35 : dx;
    setDragX(Math.max(-MAX_DRAG, Math.min(MAX_DRAG, eased)));
  }

  function onTouchEnd() {
    if (axis.current === "x") {
      if (dragX <= -THRESHOLD && index < tabs.length - 1) {
        onChange(tabs[index + 1]);
      } else if (dragX >= THRESHOLD && index > 0) {
        onChange(tabs[index - 1]);
      }
    }
    // dragX를 다음 프레임에 0으로 되돌려야(동기적으로 바로 0을 주면 같은 렌더에 합쳐져
    // 애니메이션 없이 순간 이동해버린다) 탭이 바뀐 화면이 마지막 드래그 위치에서
    // 제자리로 슬라이드해 들어오는 게 눈에 보인다.
    setAnimating(true);
    requestAnimationFrame(() => setDragX(0));
    start.current = null;
    axis.current = null;
  }

  return {
    swipeStyle: {
      transform: `translateX(${dragX}px)`,
      transition: animating ? "transform 0.22s ease" : "none",
    },
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
