"use client";

// 기사 위치 지도 — 고장접수 모달 왼쪽에 붙여 배정 판단을 돕는다.
// 마커 모양(물방울 핀)·타일은 SiteMapModal(자체점검현황 현장지도)과 동일하게 맞춘다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const ENGINEER_COLOR = "#2563eb"; // 파랑 — 기사 위치
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

// 고장현장 마커 — 스패너 두 개가 X자로 겹친 정비 아이콘.
function siteIcon(L) {
  const wrench = `
    <rect x="11.6" y="4.5" width="2.8" height="17" rx="1.4"/>
    <circle cx="13" cy="5" r="2.7" fill="none" stroke="#fff" stroke-width="1.7"/>
    <circle cx="13" cy="21" r="2.7" fill="none" stroke="#fff" stroke-width="1.7"/>
  `;
  return makePin(L, SITE_COLOR, `
    <g fill="#fff">
      <g transform="rotate(45 13 13)">${wrench}</g>
      <g transform="rotate(-45 13 13)">${wrench}</g>
    </g>
  `);
}

// 기사 마커 — 안전모(하드햇) 쓴 인물 아이콘.
function engineerIcon(L) {
  return makePin(L, ENGINEER_COLOR, `
    <g fill="#fff">
      <path d="M7.1 12.4a5.9 5.9 0 0 1 11.8 0z"/>
      <rect x="6.2" y="11.8" width="13.6" height="1.8" rx="0.9"/>
      <circle cx="13" cy="16.8" r="3.4"/>
      <path d="M6.7 25.3c0-3.5 2.8-5.9 6.3-5.9s6.3 2.4 6.3 5.9v1.2H6.7v-1.2z"/>
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

// name = 기사 이름(굵게), sideText = 이름 우측에 붙는 "현장 · 상태"(있으면), extraLine = 그 아래 줄(경로 계산 상태 등).
function namePopup(name, sideText, extraLine) {
  const el = document.createElement("div");
  el.style.cssText = "font-size:12px;min-width:100px";
  const row = document.createElement("div");
  row.style.whiteSpace = "nowrap";
  const nameEl = document.createElement("b");
  nameEl.textContent = name;
  row.appendChild(nameEl);
  if (sideText) {
    const sideEl = document.createElement("span");
    sideEl.style.cssText = "color:#64748b;margin-left:6px";
    sideEl.textContent = sideText;
    row.appendChild(sideEl);
  }
  el.appendChild(row);
  if (extraLine) {
    const extraEl = document.createElement("div");
    extraEl.style.cssText = "color:#64748b;margin-top:2px";
    extraEl.textContent = extraLine;
    el.appendChild(extraEl);
  }
  return el;
}

const fmtDuration = (sec) => {
  const min = Math.round(sec / 60);
  return min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`;
};
const fmtDistance = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

export function EngineerLocationMap({ engineers, site, engineerJobs, onEngineerClick, selectedEngineer, heightClass = "h-[760px]", alwaysShowLabels = false }) {
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const markersRef = useRef([]);
  const routeLineRef = useRef(null);
  // 기사를 연달아 클릭하면 먼저 보낸 경로 요청이 나중에 응답으로 와서 최신 경로를 덮어쓰는 경우가 있어,
  // 요청마다 번호를 매기고 "가장 최근 클릭"의 응답만 반영한다.
  const routeRequestIdRef = useRef(0);
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
    let autoSelectFn = null;
    engPoints.forEach((e) => {
      let pinned = false;
      const job = engineerJobs?.get(e.name);
      const sideText = job ? `${job.siteName} · ${job.label}` : undefined;
      const marker = L.marker([e.last_lat, e.last_lng], { icon: engineerIcon(L) })
        .addTo(map)
        .bindPopup(namePopup(e.name, sideText));
      if (alwaysShowLabels) {
        marker.bindTooltip(job ? `${e.name} · ${job.label}` : e.name, {
          permanent: true,
          direction: "top",
          offset: [0, -34],
          className: "engineer-label-tooltip",
        });
      }
      marker.off("click");
      marker.on("mouseover", function () {
        this.setZIndexOffset(2000);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1.35)";
        if (!pinned) this.setPopupContent(namePopup(e.name, sideText));
        this.openPopup();
      });
      marker.on("mouseout", function () {
        this.setZIndexOffset(0);
        const pin = this.getElement()?.querySelector(".site-pin");
        if (pin) pin.style.transform = "scale(1)";
        if (!pinned) this.closePopup();
      });
      // 마커 클릭과 "배정 기사" select 자동 선택(아래 selectedEngineer)이 공유하는 로직 — 경로 계산·표시.
      async function selectThis() {
        pinned = true;
        onEngineerClick?.(e.name);
        const myRequestId = ++routeRequestIdRef.current;
        marker.setPopupContent(namePopup(e.name, sideText, site ? "경로 계산 중..." : undefined));
        marker.openPopup();
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
          // 응답을 기다리는 동안 다른 기사를 클릭했으면(더 최신 요청이 있으면) 이 오래된 응답은 버린다.
          if (myRequestId !== routeRequestIdRef.current) return;
          if (!data.ok) { marker.setPopupContent(namePopup(e.name, sideText, data.reason || "경로를 찾을 수 없습니다")); return; }
          if (routeLineRef.current) { map.removeLayer(routeLineRef.current); routeLineRef.current = null; }
          routeLineRef.current = L.polyline(data.coords, { color: ENGINEER_COLOR, weight: 4, opacity: 0.8 }).addTo(map);
          marker.setPopupContent(namePopup(e.name, sideText, `예상 ${fmtDuration(data.totalTimeSec)} · ${fmtDistance(data.totalDistanceM)}`));
        } catch {
          if (myRequestId === routeRequestIdRef.current) marker.setPopupContent(namePopup(e.name, sideText, "경로 조회 실패"));
        }
      }
      marker.on("click", selectThis);
      // 경로선은 여기서 지우지 않는다 — 다른 기사에 커서만 올려도 popupclose가 발생해
      // (Leaflet 팝업 autoClose) 경로가 사라지던 문제가 있었다. 경로는 다른 기사를
      // "클릭"할 때만(위 click 핸들러에서) 새로 그리며 지운다.
      marker.on("popupclose", () => { pinned = false; });
      markersRef.current.push(marker);
      if (selectedEngineer === e.name) autoSelectFn = selectThis;
    });
    // 배정 기사 select에서 기사를 고르면, 지도에서 직접 클릭한 것과 동일하게 경로를 보여준다.
    if (autoSelectFn) autoSelectFn();

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

      const width = containerRef.current?.clientWidth || 460;
      // animate:false — 애니메이션 줌이 진행 중에 취소되면서 원래 줌으로 되돌아가는 문제가 있어 끈다.
      map.setView([site.lat, site.lng], zoomForRadius(site.lat, RADIUS_KM, width), { animate: false });
    } else {
      const allPoints = engPoints.map((e) => [e.last_lat, e.last_lng]);
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [30, 30], maxZoom: 15 });
      }
    }
  }, [L, engineers, site, selectedEngineer]);

  return (
    <div className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 bg-slate-50`}>
      {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 flex items-center gap-3 shadow">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ENGINEER_COLOR }} />기사</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SITE_COLOR }} />고장현장</span>
      </div>
    </div>
  );
}
