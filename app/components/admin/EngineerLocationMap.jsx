"use client";

// 기사 위치 지도 — 고장접수 모달 왼쪽에 붙여 배정 판단을 돕는다.
// 마커 모양(물방울 핀)·타일은 SiteMapModal(자체점검현황 현장지도)과 동일하게 맞춘다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { guOf } from "@/app/components/admin/SiteMapModal";

const ENGINEER_COLOR = "#f97316"; // 주황 — 기사 위치 (안전모 아이콘)
const SITE_COLOR = "#dc2626";     // 빨강 — 고장 현장 위치
const RADIUS_KM = 7;

// 물방울 핀 안에 아이콘을 얹은 마커. 바깥 모양·크기는 SiteMapModal의 pinIcon과 같게 유지해
// 앵커·팝업 위치가 어긋나지 않게 하고, 안쪽 아이콘만 마커 종류에 따라 다르게 그린다.
function makePin(L, color, glyphSvg) {
  return L.divIcon({
    className: "",
    html: `<div class="site-pin" style="width:26px;height:36px;transform-origin:13px 36px;transition:transform .15s ease;">
      <svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">
        <path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 23 13 23s13-13.5 13-23C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
        ${glyphSvg}
      </svg>
    </div>`,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}

// 고장현장 마커 — 위치 핀 아이콘.
function siteIcon(L) {
  return makePin(L, SITE_COLOR, `
    <path d="M13 5c-2.9 0-5.2 2.3-5.2 5.2 0 3.9 5.2 9.3 5.2 9.3s5.2-5.4 5.2-9.3C18.2 7.3 15.9 5 13 5z" fill="#fff"/>
    <circle cx="13" cy="10.2" r="2.1" fill="${SITE_COLOR}"/>
  `);
}

// 기사 마커 — 안전모(하드햇) 쓴 인물 아이콘.
function engineerIcon(L) {
  return makePin(L, ENGINEER_COLOR, `
    <g fill="#fff">
      <path d="M7 11.5c0-3.3 2.7-6 6-6s6 2.7 6 6v0.8H7v-0.8z"/>
      <rect x="6" y="12" width="14" height="1.7" rx="0.85"/>
      <circle cx="13" cy="17" r="3.2"/>
      <path d="M7.3 24.5c0-3.1 2.6-5.2 5.7-5.2s5.7 2.1 5.7 5.2v1H7.3v-1z"/>
    </g>
  `);
}

// 컨테이너 실제 픽셀 폭 기준으로 "반경 km가 화면 폭에 딱 맞는" 줌을 직접 계산한다.
// fitBounds는 여백(padding)까지 보수적으로 맞추다 보니 경계 근처에서 한 단계 더 축소돼버리는
// 경우가 있어(예: 7km도 15km와 같은 줌으로 끝남), 확대 정도가 반경마다 눈에 띄게 달라지도록
// 직접 계산해 setView로 지정한다.
function zoomForRadius(lat, km, widthPx) {
  const metersPerPixel = (km * 1000 * 2) / widthPx;
  const raw = Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPixel);
  return Math.max(1, Math.min(18, Math.round(raw)));
}

function namePopup(name, statusText) {
  const el = document.createElement("div");
  el.style.cssText = "font-size:12px;min-width:100px";
  const nameEl = document.createElement("div");
  nameEl.style.fontWeight = "700";
  nameEl.textContent = name;
  el.appendChild(nameEl);
  if (statusText) {
    const statusEl = document.createElement("div");
    statusEl.style.cssText = "color:#64748b;margin-top:2px";
    statusEl.textContent = statusText;
    el.appendChild(statusEl);
  }
  return el;
}

const fmtDuration = (sec) => {
  const min = Math.round(sec / 60);
  return min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`;
};
const fmtDistance = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

export function EngineerLocationMap({ engineers, site, onEngineerClick }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const routeLineRef = useRef(null);
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
    if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }

    // 기사 마커 — 호버하면 이름이 뜨고 커서를 옮기면 사라진다. 클릭하면 고정(터치 기기 대응).
    const engPoints = engineers.filter((e) => e.last_lat != null && e.last_lng != null);
    engPoints.forEach((e) => {
      let pinned = false;
      const marker = L.marker([e.last_lat, e.last_lng], { icon: engineerIcon(L) })
        .addTo(map)
        .bindPopup(namePopup(e.name));
      marker.off("click");
      marker.on("mouseover", function () {
        this.setZIndexOffset(2000);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1.35)";
        if (!pinned) this.setPopupContent(namePopup(e.name));
        this.openPopup();
      });
      marker.on("mouseout", function () {
        this.setZIndexOffset(0);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1)";
        if (!pinned) this.closePopup();
      });
      marker.on("click", async function () {
        pinned = true;
        onEngineerClick?.(e.name);
        this.setPopupContent(namePopup(e.name, site ? "경로 계산 중..." : undefined));
        this.openPopup();
        if (!site?.lat || !site?.lng) return;
        if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
        try {
          const res = await fetch("/api/tmap-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              startLat: e.last_lat, startLng: e.last_lng,
              endLat: site.lat, endLng: site.lng,
              startName: e.name, endName: site.name,
            }),
          });
          const data = await res.json();
          if (!data.ok) { this.setPopupContent(namePopup(e.name, data.reason || "경로를 찾을 수 없습니다")); return; }
          routeLineRef.current = L.polyline(data.coords, { color: ENGINEER_COLOR, weight: 4, opacity: 0.8 }).addTo(map);
          this.setPopupContent(namePopup(e.name, `예상 ${fmtDuration(data.totalTimeSec)} · ${fmtDistance(data.totalDistanceM)}`));
        } catch {
          this.setPopupContent(namePopup(e.name, "경로 조회 실패"));
        }
      });
      // 경로선은 여기서 지우지 않는다 — 다른 기사에 커서만 올려도 popupclose가 발생해
      // (Leaflet 팝업 autoClose) 경로가 사라지던 문제가 있었다. 경로는 다른 기사를
      // "클릭"할 때만(위 click 핸들러에서) 새로 그리며 지운다.
      marker.on("popupclose", () => { pinned = false; });
      markersRef.current.push(marker);
    });

    // 현장 마커 — 호버하면 이름/주소가 뜨고 커서를 옮기면 사라진다. 클릭하면 고정.
    if (site?.lat != null && site?.lng != null) {
      let sitePinned = false;
      const siteMarker = L.marker([site.lat, site.lng], { icon: siteIcon(L) })
        .addTo(map)
        .bindPopup(`<div style="font-size:12px"><b>${site.name}</b><br/>${site.address ?? ""}</div>`);
      siteMarker.off("click");
      siteMarker.on("mouseover", function () {
        this.setZIndexOffset(2000);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1.35)";
        this.openPopup();
      });
      siteMarker.on("mouseout", function () {
        this.setZIndexOffset(0);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1)";
        if (!sitePinned) this.closePopup();
      });
      siteMarker.on("click", function () { sitePinned = true; this.openPopup(); });
      siteMarker.on("popupclose", () => { sitePinned = false; });
      markersRef.current.push(siteMarker);

      // 구/시 이름표 — 타일 지도가 저배율·라벨 혼잡으로 구 이름을 안 띄우는 경우가 있어,
      // 우리 DB 주소(한글)에서 뽑은 구/군 이름을 마커 위에 직접 얹어 항상 보이게 한다.
      const gu = guOf(site.address);
      if (gu) {
        const guLabel = L.marker([site.lat, site.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:13px;font-weight:800;color:#334155;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px #fff,0 -1px 3px #fff,1px 0 3px #fff,-1px 0 3px #fff;transform:translateY(-30px)">${gu}</div>`,
            iconSize: [0, 0],
          }),
          interactive: false,
          zIndexOffset: 10000,
        }).addTo(map);
        markersRef.current.push(guLabel);
      }

      const width = containerRef.current?.clientWidth || 460;
      // animate:false — 애니메이션 줌이 진행 중에 취소되면서 원래 줌으로 되돌아가는 문제가 있어 끈다.
      map.setView([site.lat, site.lng], zoomForRadius(site.lat, RADIUS_KM, width), { animate: false });
    } else {
      const allPoints = engPoints.map((e) => [e.last_lat, e.last_lng]);
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30], maxZoom: 15 });
      }
    }
  }, [L, engineers, site]);

  return (
    <div className="relative w-full h-[760px] rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
      {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 flex items-center gap-3 shadow">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ENGINEER_COLOR }} />기사</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SITE_COLOR }} />고장현장</span>
      </div>
    </div>
  );
}
