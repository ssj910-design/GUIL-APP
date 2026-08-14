"use client";

// 현장 엑셀 일괄 등록 — 온보딩용.
// 계약정보·현장담당자·승강기 제원까지 한 번에 담는 31개 컬럼 양식을 브라우저에서 파싱(JSZip, 이미
// 설치된 의존성)해 건물별로 묶어 sites + site_managers + units를 생성한다. 이미 등록된 승강기(gov_no)는 스킵.
import { useState } from "react";
import { Download } from "lucide-react";
import JSZip from "jszip";
import { supabase } from "@/lib/supabaseClient";
import { mapUnit, mapSite, mapSiteManager } from "@/lib/mappers";
import { Modal } from "@/app/components/admin/adminShared";

// toPlan()이 찾는 컬럼 그대로 샘플을 만든다 — 같은 건물명+소재지1이면 한 현장으로 묶이는 걸
// 보여주려고 호기 2개짜리 예시로 둔다. 현장·계약·담당자 정보는 건물당 첫 행 값만 읽으므로
// 두 행에 똑같이 채워 넣어 헷갈리지 않게 한다.
async function downloadSample() {
  const XLSX = await import("xlsx");
  const site = [
    "○○빌딩", "서울특별시 강남구 테헤란로 123", "1층",
    "POG(일반계약)", "500000", "20200101", "20251231",
    "김기사", "02-1234-5678", "02-1234-5679", "office@example.co.kr", "정문 경비실에 문의", "SKT/국선",
    "관리소장", "홍길동", "010-1111-2222", "manager@building.com", "",
  ];
  const wsData = [
    [
      "건물명", "소재지1", "소재지2", "계약구분", "보수료(VAT별도)", "계약일자", "계약종료일",
      "담당 기사", "전화번호", "팩스", "이메일", "비고(전달사항)", "EMCALL,통신사,국선/무선",
      "현장 담당자 역할", "현장 담당자 이름", "현장 담당자 전화번호", "현장 담당자 이메일", "현장 담당자 팩스",
      "승강기고유번호", "승강기상태", "호기", "승강기종류", "승강기형식", "승강기모델", "제조업체",
      "설치일자", "설치장소", "운행구간", "적재하중", "정원", "정격속도",
    ],
    [...site, "12345678", "운행중", "1", "승객용", "로프식", "OTIS Gen2", "오티스엘리베이터", "20200101", "본관-1", "B1~15F", "1000", "15", "1.0"],
    [...site, "12345679", "운행중", "2", "승객용", "로프식", "OTIS Gen2", "오티스엘리베이터", "20200101", "본관-2", "B1~15F", "1000", "15", "1.0"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "현장");
  XLSX.writeFile(wb, "현장등록_샘플양식.xlsx");
}

const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
const colIdx = (ref) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const toDate = (v) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : null);
const toNum = (v) => { const n = Number((v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

// 셀 참조(r="C5") 기준으로 읽는다 — 빈 셀이 XML에서 생략돼도 열이 밀리지 않도록.
export async function parseXlsx(file) {
  const zip = await JSZip.loadAsync(file);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string") ?? "";
  const shared = [...sharedXml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    unesc(m[1].replace(/<[^>]+>/g, ""))
  );
  const sheetName = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  const sheetXml = await zip.file(sheetName).async("string");
  return [...sheetXml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map((rm) => {
    const cells = [];
    // 셀을 통째로 잡은 뒤 속성(r, t)과 값을 따로 추출 — 속성 순서에 무관하게 동작
    for (const [cell] of rm[1].matchAll(/<c\b[^>]*(?:\/>|>.*?<\/c>)/gs)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell)?.[1];
      if (!ref) continue;
      const isShared = /\bt="s"/.test(cell);
      const raw = /<v>([^<]*)<\/v>/.exec(cell)?.[1] ?? "";
      cells[colIdx(ref)] = isShared ? shared[Number(raw)] ?? "" : unesc(raw);
    }
    return cells;
  });
}

// 파일 행들 → { 건물키: { name, address, ...계약·담당자 정보(건물당 첫 행만), units: [...] } }
function toPlan(rows, existingGovNos) {
  const header = rows[0].map((h) => (h ?? "").trim());
  const col = (name) => header.findIndex((h) => h.replace(/\s/g, "") === name.replace(/\s/g, ""));
  const C = {
    name: col("건물명"), addr1: col("소재지1"), addr2: col("소재지2"),
    contractType: col("계약구분"), cost: col("보수료(VAT별도)"), contractDate: col("계약일자"), contractEnd: col("계약종료일"),
    engineer: col("담당 기사"), phone: col("전화번호"), fax: col("팩스"), email: col("이메일"), notes: col("비고(전달사항)"),
    emergencyPhone: col("EMCALL,통신사,국선/무선"),
    mgrRole: col("현장 담당자 역할"), mgrName: col("현장 담당자 이름"), mgrPhone: col("현장 담당자 전화번호"),
    mgrEmail: col("현장 담당자 이메일"), mgrFax: col("현장 담당자 팩스"),
    govNo: col("승강기고유번호"), status: col("승강기상태"), seq: col("호기"),
    kind: col("승강기종류"), form: col("승강기형식"), model: col("승강기모델"), manufacturer: col("제조업체"),
    installed: col("설치일자"), place: col("설치장소"), runSection: col("운행구간"),
    load: col("적재하중"), capacity: col("정원"), speed: col("정격속도"),
  };
  if (C.name < 0 || C.govNo < 0) throw new Error("양식이 아닙니다 (건물명/승강기 고유번호 열 없음)");

  const buildings = new Map();
  const seen = new Set(); // 파일 내부 중복(같은 승강기가 두 줄) 방지
  let dup = 0, bad = 0;
  for (const r of rows.slice(1)) {
    const name = (r[C.name] ?? "").trim();
    const govNo = (r[C.govNo] ?? "").replace(/\D/g, "");
    if (!name || !govNo) { bad++; continue; }
    if (existingGovNos.has(govNo) || seen.has(govNo)) { dup++; continue; }
    seen.add(govNo);
    const key = name + "|" + (r[C.addr1] ?? "");
    if (!buildings.has(key)) {
      buildings.set(key, {
        name, address: `${r[C.addr1] ?? ""} ${r[C.addr2] ?? ""}`.trim(),
        contractType: (r[C.contractType] ?? "").trim() || "POG(일반계약)",
        maintenanceCost: toNum(r[C.cost]),
        contractDate: toDate((r[C.contractDate] ?? "").trim()),
        contractEnd: toDate((r[C.contractEnd] ?? "").trim()),
        assignedEngineer: (r[C.engineer] ?? "").trim() || null,
        phone: (r[C.phone] ?? "").trim() || null,
        fax: (r[C.fax] ?? "").trim() || null,
        email: (r[C.email] ?? "").trim() || null,
        notes: (r[C.notes] ?? "").trim() || null,
        emergencyPhone: (r[C.emergencyPhone] ?? "").trim() || null,
        managerRole: (r[C.mgrRole] ?? "").trim(),
        managerName: (r[C.mgrName] ?? "").trim(),
        managerPhone: (r[C.mgrPhone] ?? "").trim(),
        managerEmail: (r[C.mgrEmail] ?? "").trim(),
        managerFax: (r[C.mgrFax] ?? "").trim(),
        units: [],
      });
    }
    const b = buildings.get(key);
    // 파일에 호기 번호가 중복되면(데이터 오류) 다음 빈 번호로 민다
    let seq = Number(r[C.seq]) || b.units.length + 1;
    while (b.units.some((u) => u.seq === seq)) seq++;
    b.units.push({
      seq, govNo,
      kind: (r[C.kind] ?? "").trim() || null,
      form: (r[C.form] ?? "").trim() || null,
      model: (r[C.model] ?? "").trim() || null,
      manufacturer: (r[C.manufacturer] ?? "").trim() || null,
      installDate: toDate((r[C.installed] ?? "").trim()),
      installPlace: (r[C.place] ?? "").trim() || null,
      runSection: (r[C.runSection] ?? "").trim() || null,
      loadKg: toNum(r[C.load]),
      capacityPersons: toNum(r[C.capacity]),
      ratedSpeed: toNum(r[C.speed]),
      isActive: (r[C.status] ?? "운행중") === "운행중",
    });
  }
  return { buildings: [...buildings.values()], dup, bad };
}

export default function ImportSites({ data, setData, onClose }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const rows = await parseXlsx(file);
      const existing = new Set(data.units.map((u) => u.govNo).filter(Boolean));
      setPlan(toPlan(rows, existing));
    } catch (err) {
      alert("파일을 읽지 못했습니다: " + err.message);
    }
    setBusy(false);
  }

  async function run() {
    setBusy(true);
    const stamp = Date.now();
    const byName = new Map(data.sites.map((s) => [s.name + "|" + (s.address ?? "").split(" (")[0], s.id]));
    const siteRows = [];
    const unitRows = [];
    const managerRows = [];
    const assignmentRows = [];
    plan.buildings.forEach((b, i) => {
      // 같은 이름+주소 현장이 이미 있으면 그 현장에 호기·담당자만 추가
      let siteId = byName.get(b.name + "|" + b.address.split(" (")[0]);
      if (!siteId) {
        siteId = `site-${stamp}-${i}`;
        siteRows.push({
          id: siteId, name: b.name, address: b.address, contract_type: b.contractType,
          unit_count: b.units.length,
          gov_elevator_nos: b.units.sort((x, y) => x.seq - y.seq).map((u) => u.govNo),
          elevator_model: b.units[0]?.model ?? null,
          maintenance_cost: b.maintenanceCost, contract_date: b.contractDate, contract_end: b.contractEnd,
          assigned_engineer: b.assignedEngineer, phone: b.phone, fax: b.fax, email: b.email,
          notes: b.notes, emergency_phone: b.emergencyPhone,
        });
        // sites.assigned_engineer는 표시용 텍스트 듀얼라이트일 뿐, 자체점검 담당 배정 등
        // 실제 기준은 site_assignments(SitesAdmin.jsx의 changeAssignees와 동일 패턴) — 같이 안 넣으면
        // 자체점검현황 등에서 담당자로 안 잡힌다.
        const tech = data.profiles.find((p) => p.name === b.assignedEngineer);
        if (tech) assignmentRows.push({ site_id: siteId, tech_id: tech.id, is_lead: true });
      }
      for (const u of b.units) {
        unitRows.push({
          site_id: siteId, seq: u.seq, unit_no: `${u.seq}호기`,
          kind: u.kind, form: u.form, model: u.model, manufacturer: u.manufacturer,
          install_date: u.installDate, gov_no: u.govNo, is_active: u.isActive,
          install_place: u.installPlace, run_section: u.runSection,
          load_kg: u.loadKg, capacity_persons: u.capacityPersons, rated_speed: u.ratedSpeed,
        });
      }
      if (b.managerName) {
        managerRows.push({
          id: `sm-${stamp}-${i}`, site_id: siteId, name: b.managerName,
          phone: b.managerPhone || null, email: b.managerEmail || null, fax: b.managerFax || null,
          role: b.managerRole || "담당자", is_primary: false,
        });
      }
    });

    for (let i = 0; i < siteRows.length; i += 200) {
      const { error } = await supabase.from("sites").insert(siteRows.slice(i, i + 200));
      if (error) { alert("현장 등록 실패: " + error.message); setBusy(false); return; }
    }
    let inserted = 0;
    for (let i = 0; i < unitRows.length; i += 200) {
      const { data: created, error } = await supabase.from("units").insert(unitRows.slice(i, i + 200)).select();
      if (error) { alert(`호기 등록 실패(${inserted}개 성공 후): ` + error.message); break; }
      inserted += created.length;
    }
    for (let i = 0; i < managerRows.length; i += 200) {
      const { error } = await supabase.from("site_managers").insert(managerRows.slice(i, i + 200));
      if (error) { alert("현장 담당자 등록 실패: " + error.message); break; }
    }
    for (let i = 0; i < assignmentRows.length; i += 200) {
      const { error } = await supabase.from("site_assignments").insert(assignmentRows.slice(i, i + 200));
      if (error) { alert("담당 기사 배정 실패: " + error.message); break; }
    }
    // 새로고침이 가장 단순·정확 (일괄 등록은 드문 작업)
    const [sites, units, siteManagers] = await Promise.all([
      supabase.from("sites").select("*").order("name"),
      supabase.from("units").select("*").order("seq"),
      supabase.from("site_managers").select("*"),
    ]);
    setData((prev) => ({
      ...prev,
      sites: (sites.data ?? []).map(mapSite),
      units: (units.data ?? []).map(mapUnit),
      siteManagers: (siteManagers.data ?? []).map(mapSiteManager),
    }));
    setDone({ sites: siteRows.length, units: inserted, managers: managerRows.length });
    setBusy(false);
  }

  return (
    <Modal title="현장 엑셀 일괄 등록" onClose={onClose}>
      {done ? (
        <div className="text-center py-8">
          <p className="text-lg font-extrabold text-emerald-600 mb-1">등록 완료</p>
          <p className="text-sm text-slate-600">현장 {done.sites}개 · 호기 {done.units}대 · 담당자 {done.managers}명이 등록됐습니다.</p>
          <button onClick={onClose} className="mt-5 text-sm font-bold text-white bg-blue-700 rounded-xl px-5 py-2.5">닫기</button>
        </div>
      ) : !plan ? (
        <div className="py-4">
          <p className="text-sm text-slate-600 mb-3">
            아래 샘플 양식에 맞춰 엑셀(.xlsx)을 채운 뒤 선택하세요. 건물별로 현장·계약정보·현장담당자·호기(고유번호·모델·제원)가 자동 생성됩니다.
          </p>
          <button
            type="button"
            onClick={downloadSample}
            className="flex items-center justify-center gap-1.5 text-sm font-bold text-blue-700 bg-blue-50 rounded-xl px-4 py-2.5 w-full mb-3"
          >
            <Download size={15} /> 샘플 양식 다운로드
          </button>
          <input type="file" accept=".xlsx" onChange={pick} disabled={busy} className="text-sm" />
          {busy && <p className="text-xs text-slate-400 mt-2">파일 분석 중...</p>}
        </div>
      ) : (
        <div className="py-2">
          <div className="bg-blue-50 rounded-xl p-4 text-sm space-y-1 mb-4">
            <p><b>{plan.buildings.length}개 건물 · {plan.buildings.reduce((n, b) => n + b.units.length, 0)}대 승강기</b>를 등록합니다.</p>
            {plan.dup > 0 && <p className="text-slate-500">이미 등록된 승강기 {plan.dup}대는 건너뜁니다.</p>}
            {plan.bad > 0 && <p className="text-slate-500">건물명/고유번호가 없는 {plan.bad}행은 무시합니다.</p>}
          </div>
          <ul className="max-h-48 overflow-y-auto text-xs text-slate-500 border border-slate-100 rounded-lg p-3 mb-4">
            {plan.buildings.slice(0, 30).map((b) => (
              <li key={b.name + b.address}>{b.name} — {b.units.length}대</li>
            ))}
            {plan.buildings.length > 30 && <li>... 외 {plan.buildings.length - 30}개 건물</li>}
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setPlan(null)} className="text-sm font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2.5">다시 선택</button>
            <button onClick={run} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-5 py-2.5">
              {busy ? "등록 중..." : "일괄 등록 실행"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
