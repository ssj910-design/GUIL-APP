"use client";

// 기사 위치 지도 — 고장접수 모달 왼쪽에 붙여 배정 판단을 돕는다.
// 마커 모양(물방울 핀)은 SiteMapModal(자체점검현황 현장지도)과 동일하게 맞추되, 타일은
// 표준 OpenStreetMap 타일을 쓴다 — CARTO Voyager는 낮은 줌에서 도시명이 로마자로 나오는데
// 표준 OSM 타일은 같은 줌에서도 시/구 단위 지명이 이미 한글로 들어있어 확인됨.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { pinIcon } from "@/app/components/admin/SiteMapModal";

const ENGINEER_COLOR = "#2563eb"; // 파랑 — 기사 위치
const SITE_COLOR = "#dc2626";     // 빨강 — 고장 현장 위치
const RADIUS_KM = 15;

// 현장 좌표 기준 ±15km 사각 범위 (위도 1도≈111km, 경도는 위도에 따라 보정).
function radiusBounds(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]];
}

function openRoute(engineer, site, kind) {
  const fromName = encodeURIComponent(engineer.name || "기사");
  const toName = encodeURIComponent(site.name || "현장");
  if (kind === "tmap") {
    window.open(
      `tmap://route?startname=${fromName}&startx=${engineer.last_lng}&starty=${engineer.last_lat}&goalname=${toName}&goalx=${site.lng}&goaly=${site.lat}`,
      "_blank"
    );
  } else {
    window.open(
      `https://map.kakao.com/link/from/${fromName},${engineer.last_lat},${engineer.last_lng}/to/${toName},${site.lat},${site.lng}`,
      "_blank"
    );
  }
}

// 기사 마커 팝업 내용 — 이름만(호버) 또는 이름+길찾기 버튼(클릭, 현장이 정해졌을 때만) DOM을 직접 구성한다
// (Leaflet 팝업은 raw HTML/엘리먼트라 버튼에 실제 이벤트 리스너를 달려면 이 방식이 필요하다).
function buildEngineerPopup(engineer, site, withRoute) {
  const wrap = document.createElement("div");
  wrap.style.fontSize = "12px";
  wrap.style.minWidth = "120px";

  const nameEl = document.createElement("div");
  nameEl.style.fontWeight = "700";
  nameEl.textContent = engineer.name;
  wrap.appendChild(nameEl);

  if (withRoute && site?.lat != null && site?.lng != null) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px";

    const tmapBtn = document.createElement("button");
    tmapBtn.textContent = "티맵";
    tmapBtn.style.cssText = "font-size:11px;font-weight:700;color:#fff;background:#0067c0;border:none;border-radius:6px;padding:4px 8px;cursor:pointer";
    tmapBtn.onclick = () => openRoute(engineer, site, "tmap");

    const kakaoBtn = document.createElement("button");
    kakaoBtn.textContent = "카카오맵";
    kakaoBtn.style.cssText = "font-size:11px;font-weight:700;color:#191919;background:#fee500;border:none;border-radius:6px;padding:4px 8px;cursor:pointer";
    kakaoBtn.onclick = () => openRoute(engineer, site, "kakao");

    row.appendChild(tmapBtn);
    row.appendChild(kakaoBtn);
    wrap.appendChild(row);
  }
  return wrap;
}

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
      Lmod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
        subdomains: "abc",
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
      let pinned = false;
      const marker = L.marker([e.last_lat, e.last_lng], { icon: pinIcon(L, ENGINEER_COLOR) }).addTo(map);
      marker.bindPopup(buildEngineerPopup(e, site, false));
      marker.on("mouseover", function () {
        if (!pinned) this.setPopupContent(buildEngineerPopup(e, site, false));
        this.openPopup();
      });
      marker.on("mouseout", function () {
        if (!pinned) this.closePopup();
      });
      marker.on("click", function () {
        pinned = true;
        this.setPopupContent(buildEngineerPopup(e, site, true));
        this.openPopup();
      });
      marker.on("popupclose", () => { pinned = false; });
      markersRef.current.push(marker);
    });

    // 현장 마커 — 자동으로 열리지 않고, 클릭해야 이름/주소 팝업이 뜬다(기본 클릭 동작 그대로 사용).
    if (site?.lat != null && site?.lng != null) {
      const siteMarker = L.marker([site.lat, site.lng], { icon: pinIcon(L, SITE_COLOR) })
        .addTo(map)
        .bindPopup(`<div style="font-size:12px"><b>${site.name}</b><br/>${site.address ?? ""}</div>`);
      markersRef.current.push(siteMarker);
      map.fitBounds(radiusBounds(site.lat, site.lng, RADIUS_KM), { padding: [10, 10] });
    } else {
      const allPoints = engPoints.map((e) => [e.last_lat, e.last_lng]);
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30], maxZoom: 15 });
      }
    }
  }, [L, engineers, site]);

  return (
    <div className="relative w-full h-[600px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 flex items-center gap-3 shadow">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ENGINEER_COLOR }} />기사</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SITE_COLOR }} />고장현장</span>
      </div>
    </div>
  );
}
