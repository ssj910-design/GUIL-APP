"use client";

// 현장 지도 — 담당자별로 색상을 다르게 해서 지도에 점으로 표시한다.
// Kakao/Naver/Google 지도는 API 키 발급(가입)이 필요해, 키 없이 바로 되는
// OpenStreetMap 타일 + Leaflet을 쓴다. Leaflet은 SSR에서 window를 참조해
// 터지므로 클라이언트에서만 동적 import한다.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Modal } from "@/app/components/admin/adminShared";

// 주소에서 "구/군"만 추출 — 예: "서울특별시 강남구 학동로 120" -> "강남구".
// 경기도는 도-시-구 3단 구조라 "안양시 만안구"처럼 구가 세 번째 토큰에 온다 — 두 번째·세 번째를 모두 확인한다.
function guOf(address) {
  const tokens = (address ?? "").trim().split(/\s+/);
  for (let i = 1; i <= 2 && i < tokens.length; i++) {
    if (/[구군]$/.test(tokens[i])) return tokens[i];
  }
  return null;
}

// 담당자 이름 전체를 색상환에 고르게 나눠 배정한다 — 이름 해시로 각자 따로 색을 뽑으면
// 사람 수가 적어도 우연히 색상값이 가까워(예: 색상각 10도 차이) 서로 구분이 안 되는 경우가
// 생긴다. 지금 화면에 등장하는 인원 전체를 한 번에 보고 360도를 균등 분할해야
// 최대한 서로 멀리 떨어진 색이 배정된다.
function buildEngineerColors(names) {
  const uniq = [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const map = new Map();
  uniq.forEach((name, i) => {
    const hue = Math.round((360 / uniq.length) * i);
    map.set(name, `hsl(${hue}, 70%, 45%)`);
  });
  return map;
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

const UNASSIGNED_KEY = "__unassigned__";

export function SiteMapModal({ sites, units = [], onClose }) {
  // 계약중지(isActive:false) 현장은 지도·검색·대수 집계 어디에도 안 나와야 한다.
  const activeSites = sites.filter((s) => s.isActive !== false);
  const containerRef = useRef(null);
  const mapObjRef = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef([]); // [{ marker, engineer, lat, lng, site }]
  const searchMarkerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [selectedEngineer, setSelectedEngineer] = useState(""); // "" = 전체, UNASSIGNED_KEY = 미배정만
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const engineerNames = [...new Set(activeSites.map((s) => s.assignedEngineer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const engineerColors = buildEngineerColors(engineerNames);
  const colorForEngineer = (name) => (name ? (engineerColors.get(name) ?? "#94a3b8") : "#94a3b8"); // 미배정 = 회색

  const trimmedQuery = query.trim();
  const suggestions = trimmedQuery
    ? activeSites.filter((s) => s.lat != null && s.lng != null && ((s.name || "").includes(trimmedQuery) || (s.address || "").includes(trimmedQuery))).slice(0, 8)
    : [];

  function toggleEngineer(key) {
    setSelectedEngineer((cur) => (cur === key ? "" : key));
  }

  // 목록에서 고르거나 검색어가 현장 하나와 정확히 걸렸을 때 — 마커 위치로 이동하고,
  // 실제 마커 클릭과 똑같이 동작시켜(fire) 정보 팝업도 그대로 띄운다.
  // 담당자 필터에 걸려 지금 안 보이는 마커일 수도 있으니, 필터 상태는 안 건드리고 그 마커만 임시로 얹는다.
  function selectSite(site) {
    const L = leafletRef.current;
    const map = mapObjRef.current;
    const entry = markersRef.current.find((m) => m.site === site);
    if (!L || !map || !entry) return;
    setQuery(site.name);
    setShowSuggestions(false);
    setSearchMsg("");
    if (searchMarkerRef.current) {
      map.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }
    if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
    map.setView([site.lat, site.lng], 17);
    entry.marker.fire("click");
  }

  async function runSearch() {
    const q = query.trim();
    const L = leafletRef.current;
    const map = mapObjRef.current;
    if (!q || !L || !map) return;
    setSearchMsg("");
    setShowSuggestions(false);
    setSearching(true);
    if (searchMarkerRef.current) {
      map.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }

    // 담당 현장 중 이름·주소가 일치하는 곳부터 찾는다 — 등록된 현장이면 이쪽이 더 정확하다.
    const localMatches = activeSites.filter(
      (s) => s.lat != null && s.lng != null && ((s.name || "").includes(q) || (s.address || "").includes(q))
    );
    if (localMatches.length === 1) {
      selectSite(localMatches[0]);
      setSearching(false);
      return;
    }
    if (localMatches.length > 1) {
      map.fitBounds(L.latLngBounds(localMatches.map((s) => [s.lat, s.lng])), { padding: [40, 40] });
      setSearching(false);
      return;
    }

    // 담당 현장이 아니어도 위치를 확인할 수 있어야 하므로, 못 찾으면 임의 주소로 지오코딩한다.
    try {
      const res = await fetch(`/api/geocode-address?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.ok) {
        const marker = L.marker([json.lat, json.lng], { icon: pinIcon(L, "#0f172a") })
          .addTo(map)
          .bindPopup(`<div style="font-size:12px;font-weight:700">${q}</div>`)
          .openPopup();
        searchMarkerRef.current = marker;
        map.setView([json.lat, json.lng], 17);
      } else {
        setSearchMsg("검색 결과가 없습니다");
      }
    } catch {
      setSearchMsg("검색 중 오류가 발생했습니다");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      const withCoords = activeSites.filter((s) => s.lat != null && s.lng != null);

      const map = L.map(containerRef.current).setView([37.5665, 126.978], 11);
      // CARTO Voyager — Google 지도처럼 옅고 깔끔해서 컬러 마커가 두드러진다 (키 발급 불필요).
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        maxZoom: 20,
        subdomains: "abcd",
      }).addTo(map);

      withCoords.forEach((s) => {
        const siteUnits = units.filter((u) => u.siteId === s.id && u.isActive !== false);
        const kinds = [...new Set(siteUnits.map((u) => u.kind).filter(Boolean))].join(", ") || "-";
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
        markersRef.current.push({ marker, engineer: s.assignedEngineer || null, lat: s.lat, lng: s.lng, site: s });
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

      leafletRef.current = L;
      mapObjRef.current = map;
      setLoading(false);
    });

    return () => {
      cancelled = true;
      markersRef.current = [];
      if (mapObjRef.current) {
        mapObjRef.current.remove();
        mapObjRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 담당자 필터 — 선택된 담당자 마커만 지도에 남기고 그 범위로 다시 맞춘다.
  // 초기 로딩 직후(loading→false)에도 한 번 돌아서, 마커 전체를 담는 최초 fitBounds 역할도 겸한다.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapObjRef.current;
    if (!L || !map) return;
    const visibleCoords = [];
    markersRef.current.forEach(({ marker, engineer, lat, lng }) => {
      const visible = !selectedEngineer || (selectedEngineer === UNASSIGNED_KEY ? !engineer : engineer === selectedEngineer);
      const onMap = map.hasLayer(marker);
      if (visible && !onMap) marker.addTo(map);
      if (!visible && onMap) map.removeLayer(marker);
      if (visible) visibleCoords.push([lat, lng]);
    });
    if (visibleCoords.length > 0) map.fitBounds(L.latLngBounds(visibleCoords), { padding: [24, 24] });
  }, [selectedEngineer, loading]);

  const withCoordsCount = activeSites.filter((s) => s.lat != null && s.lng != null).length;

  // 담당자별 관리 대수 — 배정 현장의 활성 호기 수를 합산.
  const unitCountByEngineer = new Map();
  activeSites.forEach((s) => {
    const key = s.assignedEngineer || null;
    const cnt = units.filter((u) => u.siteId === s.id && u.isActive !== false).length;
    unitCountByEngineer.set(key, (unitCountByEngineer.get(key) ?? 0) + cnt);
  });

  return (
    <Modal title={`현장 지도 (담당자별 색상 · ${withCoordsCount}곳)`} onClose={onClose} wide="2xl">
      {/* 모달 자체가 max-h-85vh인데 헤더+패딩(~89px)을 안 빼면 담당기사 목록이 모달 밖으로
          밀려 스크롤해야 보인다 — 그 여백만큼 뺀 높이를 써서 스크롤 없이 다 보이게 한다. */}
      <div className="h-[calc(85vh-6.5rem)] flex flex-col">
        <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          {loading && <p className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">지도 불러오는 중...</p>}
          <div ref={containerRef} className="w-full h-full" />
          <div className="absolute top-3 right-3 z-[1000] w-64">
            <div className="flex gap-1.5 bg-white rounded-lg shadow-md border border-slate-200 p-1.5">
              <div className="relative flex-1 min-w-0">
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setShowSuggestions(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder="현장명 또는 주소 검색"
                  className="w-full text-xs px-2 py-1.5 outline-none"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-md shadow-lg border border-slate-200 max-h-56 overflow-y-auto">
                    {suggestions.map((s) => (
                      <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); selectSite(s); }}
                        className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                        <div className="text-slate-400 truncate">{s.address || "-"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={runSearch} disabled={searching}
                className="text-xs font-bold px-3 py-1.5 rounded-md bg-blue-600 text-white disabled:opacity-50 shrink-0">
                검색
              </button>
            </div>
            {searchMsg && (
              <span className="block mt-1.5 text-xs font-semibold text-red-600 bg-white rounded-md shadow-md border border-red-200 px-2.5 py-1.5 w-fit ml-auto">
                {searchMsg}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 shrink-0">
          {engineerNames.map((name) => (
            <button key={name} type="button" onClick={() => toggleEngineer(name)}
              title="클릭: 이 담당자 마커만 보기"
              className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border transition ${
                selectedEngineer === name
                  ? "text-slate-900 bg-white border-slate-400 ring-2 ring-offset-1 ring-slate-300"
                  : selectedEngineer ? "text-slate-400 bg-slate-50 border-slate-200 opacity-60" : "text-slate-600 bg-slate-50 border-slate-200"
              }`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(name) }} />
              {name} ({unitCountByEngineer.get(name) ?? 0}대)
            </button>
          ))}
          <button type="button" onClick={() => toggleEngineer(UNASSIGNED_KEY)}
            title="클릭: 미배정 마커만 보기"
            className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 border transition ${
              selectedEngineer === UNASSIGNED_KEY
                ? "text-slate-900 bg-white border-slate-400 ring-2 ring-offset-1 ring-slate-300"
                : selectedEngineer ? "text-slate-400 bg-slate-50 border-slate-200 opacity-60" : "text-slate-600 bg-slate-50 border-slate-200"
            }`}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForEngineer(null) }} />
            미배정 ({unitCountByEngineer.get(null) ?? 0}대)
          </button>
        </div>
      </div>
    </Modal>
  );
}
