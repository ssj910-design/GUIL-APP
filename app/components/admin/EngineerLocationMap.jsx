"use client";

// 기사 위치 지도 — 고장접수 모달 왼쪽에 붙여 배정 판단을 돕는다.
// 지도·마커 구성(타일, 물방울 핀 모양)은 SiteMapModal(자체점검현황 현장지도)과 동일하게 맞추고,
// 색만 달리해 기사 위치와 고장 현장 위치를 구분한다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { pinIcon } from "@/app/components/admin/SiteMapModal";

const ENGINEER_COLOR = "#2563eb"; // 파랑 — 기사 위치
const SITE_COLOR = "#dc2626";     // 빨강 — 고장 현장 위치

export function EngineerLocationMap({ engineers, site }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [L, setL] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((Lmod) => {
      if (cancelled || !containerRef.current) return;
      const map = Lmod.map(containerRef.current).setView([37.5665, 126.978], 11);
      Lmod.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);
      mapObjRef.current = map;
      setL(Lmod);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 기사·현장 마커는 engineers/site가 바뀔 때마다(현장 선택 등) 다시 그린다.
  useEffect(() => {
    if (!L || !mapObjRef.current) return;
    const map = mapObjRef.current;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    const engPoints = engineers.filter((e) => e.last_lat != null && e.last_lng != null);
    engPoints.forEach((e) => {
      const marker = L.marker([e.last_lat, e.last_lng], { icon: pinIcon(L, ENGINEER_COLOR) })
        .addTo(map)
        .bindPopup(`<div style="font-size:12px;font-weight:700">${e.name}</div>`);
      markersRef.current.push(marker);
    });

    let sitePoint = null;
    if (site?.lat != null && site?.lng != null) {
      sitePoint = [site.lat, site.lng];
      const siteMarker = L.marker(sitePoint, { icon: pinIcon(L, SITE_COLOR) })
        .addTo(map)
        .bindPopup(`<div style="font-size:12px"><b>${site.name}</b><br/>${site.address ?? ""}</div>`)
        .openPopup();
      markersRef.current.push(siteMarker);
    }

    const allPoints = [...engPoints.map((e) => [e.last_lat, e.last_lng]), ...(sitePoint ? [sitePoint] : [])];
    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30], maxZoom: 15 });
    }
  }, [L, engineers, site]);

  return (
    <div className="relative w-full h-[480px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 flex items-center gap-3 shadow">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ENGINEER_COLOR }} />기사</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SITE_COLOR }} />고장현장</span>
      </div>
    </div>
  );
}
