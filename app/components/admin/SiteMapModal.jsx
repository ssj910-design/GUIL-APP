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

// Google 지도류의 물방울 핀 모양 — 기본 원형 마커보다 배경 지도 위에서 훨씬 잘 보인다.
function pinIcon(L, color) {
  return L.divIcon({
    className: "",
    html: `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
      <path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 23 13 23s13-13.5 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="13" cy="13" r="5" fill="#fff"/>
    </svg>`,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}

export function SiteMapModal({ sites, units = [], onClose }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const withCoords = sites.filter((s) => s.lat != null && s.lng != null);

      const map = L.map(containerRef.current).setView([37.5665, 126.978], 11);
      // CARTO Voyager — Google 지도처럼 옅고 깔끔해서 컬러 마커가 두드러진다 (키 발급 불필요).
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      withCoords.forEach((s) => {
        const siteUnits = units.filter((u) => u.siteId === s.id && u.isActive !== false);
        const kinds = [...new Set(siteUnits.map((u) => u.unitType).filter(Boolean))].join(", ") || "-";
        const color = colorForEngineer(s.assignedEngineer);
        L.marker([s.lat, s.lng], { icon: pinIcon(L, color) })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;line-height:1.7;min-width:170px">
              <div style="font-weight:700;font-size:13px;margin-bottom:2px">${s.name}</div>
              <div>${s.address || "-"}</div>
              <div>기종: ${kinds}</div>
              <div>댓수: ${siteUnits.length}대</div>
              <div>담당자: ${s.assignedEngineer || "미배정"}</div>
            </div>`
          );
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
