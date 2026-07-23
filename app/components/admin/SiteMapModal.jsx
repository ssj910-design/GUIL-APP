"use client";

// 현장 지도 — 담당자별로 색상을 다르게 해서 지도에 점으로 표시한다.
// Kakao/Naver/Google 지도는 API 키 발급(가입)이 필요해, 키 없이 바로 되는
// OpenStreetMap 타일 + Leaflet을 쓴다. Leaflet은 SSR에서 window를 참조해
// 터지므로 클라이언트에서만 동적 import한다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Modal } from "@/app/components/admin/adminShared";

// 담당자 이름을 해시로 돌려 고유한 색을 뽑는다 — 사람 수가 늘어도 팔레트를 따로 관리할 필요가 없다.
function colorForEngineer(name) {
  if (!name) return "#94a3b8"; // 미배정 = 회색
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${hash}, 70%, 45%)`;
}

export function SiteMapModal({ sites, onClose }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const withCoords = sites.filter((s) => s.lat != null && s.lng != null);

      const map = L.map(containerRef.current).setView([37.5665, 126.978], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      withCoords.forEach((s) => {
        const color = colorForEngineer(s.assignedEngineer);
        L.circleMarker([s.lat, s.lng], {
          radius: 6,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.85,
        })
          .addTo(map)
          .bindPopup(`<b>${s.name}</b><br/>담당: ${s.assignedEngineer || "미배정"}`);
      });

      if (withCoords.length > 0) {
        map.fitBounds(L.latLngBounds(withCoords.map((s) => [s.lat, s.lng])), { padding: [24, 24] });
      }

      mapObjRef.current = map;
      setLoading(false);
    });

    return () => {
      cancelled = true;
      if (mapObjRef.current) {
        mapObjRef.current.remove();
        mapObjRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withCoordsCount = sites.filter((s) => s.lat != null && s.lng != null).length;
  const engineerNames = [...new Set(sites.map((s) => s.assignedEngineer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <Modal title={`현장 지도 (담당자별 색상 · ${withCoordsCount}곳)`} onClose={onClose} wide="xl">
      <div className="relative w-full h-[65vh] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3 max-h-20 overflow-y-auto">
        {engineerNames.map((name) => (
          <span key={name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(name) }} />
            {name}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(null) }} />
          미배정
        </span>
      </div>
    </Modal>
  );
}
