"use client";

// 현장 지도 — 담당자별로 색상을 다르게 해서 지도에 점으로 표시한다.
// Kakao/Naver/Google 지도는 API 키 발급(가입)이 필요해, 키 없이 바로 되는
// OpenStreetMap 타일 + Leaflet을 쓴다. Leaflet은 SSR에서 window를 참조해
// 터지므로 클라이언트에서만 동적 import한다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Modal } from "@/app/components/admin/adminShared";

// 주소에서 "구/군"만 추출 — 예: "서울특별시 강남구 학동로 120" -> "강남구".
function guOf(address) {
  const m = (address ?? "").trim().match(/^\S+\s+(\S+?[구군])(\s|$)/);
  return m ? m[1] : null;
}

// 담당자 이름을 해시로 돌려 고유한 색을 뽑는다 — 사람 수가 늘어도 팔레트를 따로 관리할 필요가 없다.
function colorForEngineer(name) {
  if (!name) return "#94a3b8"; // 미배정 = 회색
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${hash}, 70%, 45%)`;
}

// Google 지도류의 물방울 핀 모양 — 기본 원형 마커보다 배경 지도 위에서 훨씬 잘 보인다.
// 안쪽 .site-pin에만 hover 확대를 걸어서, Leaflet이 바깥 div에 직접 쓰는
// translate3d(위치 이동) 트랜스폼과 충돌하지 않게 한다.
export function pinIcon(L, color) {
  return L.divIcon({
    className: "",
    html: `<div class="site-pin" style="width:26px;height:36px;transform-origin:13px 36px;transition:transform .15s ease;">
      <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
        <path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 23 13 23s13-13.5 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        <circle cx="13" cy="13" r="5" fill="#fff"/>
      </svg>
    </div>`,
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
        const kinds = [...new Set(siteUnits.map((u) => u.kind || u.unitType).filter(Boolean))].join(", ") || "-";
        const models = [...new Set(siteUnits.map((u) => u.model).filter(Boolean))].join(", ") || "-";
        const color = colorForEngineer(s.assignedEngineer);
        const marker = L.marker([s.lat, s.lng], { icon: pinIcon(L, color) })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px;line-height:1.7;min-width:170px">
              <div style="font-weight:700;font-size:13px;margin-bottom:2px">${s.name}</div>
              <div>${s.address || "-"}</div>
              <div>종류: ${kinds}</div>
              <div>모델: ${models}</div>
              <div>대수: ${siteUnits.length}대</div>
              <div>담당자: ${s.assignedEngineer || "미배정"}</div>
            </div>`
          );
        // 기본 클릭-토글 동작을 떼고, 아래에서 호버=미리보기 / 클릭=고정 동작으로 새로 붙인다.
        marker.off("click");
        let pinned = false;
        // 커서를 올리면 핀이 커지면서 맨 앞으로, 현장정보 미리보기도 뜬다.
        marker.on("mouseover", function () {
          this.setZIndexOffset(2000);
          const pin = this.getElement()?.querySelector(".site-pin");
          if (pin) pin.style.transform = "scale(1.35)";
          this.openPopup();
        });
        // 커서를 옮기면 사라진다 — 단, 클릭으로 고정해둔 상태라면 유지.
        marker.on("mouseout", function () {
          this.setZIndexOffset(0);
          const pin = this.getElement()?.querySelector(".site-pin");
          if (pin) pin.style.transform = "scale(1)";
          if (!pinned) this.closePopup();
        });
        // 클릭하면 현장정보가 고정되어 뜬다 (커서를 옮겨도 유지, × 버튼이나 지도 빈 곳 클릭으로 닫기 전까지).
        marker.on("click", function () {
          pinned = true;
          this.openPopup();
        });
        marker.on("popupclose", function () {
          pinned = false;
        });
      });

      // 구/군 이름표 — 해당 구에 속한 현장들의 중심 좌표에 텍스트만 표시 (클릭 불가, 마커보다 위에 표시).
      const guGroups = new Map();
      withCoords.forEach((s) => {
        const gu = guOf(s.address);
        if (!gu) return;
        if (!guGroups.has(gu)) guGroups.set(gu, []);
        guGroups.get(gu).push(s);
      });
      guGroups.forEach((guSites, gu) => {
        const lat = guSites.reduce((sum, s) => sum + s.lat, 0) / guSites.length;
        const lng = guSites.reduce((sum, s) => sum + s.lng, 0) / guSites.length;
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:13px;font-weight:800;color:#334155;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px #fff,0 -1px 3px #fff,1px 0 3px #fff,-1px 0 3px #fff">${gu}</div>`,
            iconSize: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 10000,
        }).addTo(map);
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

  // 담당자별 관리 대수 — 배정 현장의 활성 호기 수를 합산.
  const unitCountByEngineer = new Map();
  sites.forEach((s) => {
    const key = s.assignedEngineer || null;
    const cnt = units.filter((u) => u.siteId === s.id && u.isActive !== false).length;
    unitCountByEngineer.set(key, (unitCountByEngineer.get(key) ?? 0) + cnt);
  });

  return (
    <Modal title={`현장 지도 (담당자별 색상 · ${withCoordsCount}곳)`} onClose={onClose} wide="2xl">
      <div className="relative w-full h-[78vh] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3 max-h-20 overflow-y-auto">
        {engineerNames.map((name) => (
          <span key={name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(name) }} />
            {name} ({unitCountByEngineer.get(name) ?? 0}대)
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(null) }} />
          미배정 ({unitCountByEngineer.get(null) ?? 0}대)
        </span>
      </div>
    </Modal>
  );
}
