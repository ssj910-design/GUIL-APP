"use client";

// 자체점검 출석부 (v2 신설) — 법정 월 1회 점검을 "출석부" 방식으로 관리.
// 매월 1일 generate_self_checks(ym) 호출로 활성 호기 전체에 줄이 생기고,
// 기사가 완료 처리하면 남은 줄이 곧 누락 후보다. (DESIGN-v2 §7-3)
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { mapSelfCheck } from "@/lib/mappers";
import { TODAY_STR } from "@/lib/constants";
import { locOf, personOf, StatusBadge, AdminTable, Modal, PhotoGrid } from "@/app/components/admin/adminShared";

// 주소에서 "구/군"만 추출 — 예: "서울특별시 강남구 학동로 120" -> "강남구". region 컬럼은 항상 비어있어 주소로 대신한다.
function guOf(address) {
  const m = (address ?? "").trim().match(/^\S+\s+(\S+?[구군])(\s|$)/);
  return m ? m[1] : null;
}

function GovBadge({ code, msg }) {
  return (
    <span title={msg ?? ""}>
      {code === "000" ? (
        <StatusBadge tone="green">제출완료</StatusBadge>
      ) : code ? (
        <StatusBadge tone="red">실패 {code}</StatusBadge>
      ) : (
        <StatusBadge tone="slate">미제출</StatusBadge>
      )}
    </span>
  );
}

// 담당자 한 명의 담당 현장 목록 — 현장호기·주소·완료일·공단제출·점검사진.
function EngineerDetailModal({ name, rows, onClose }) {
  const [photoRow, setPhotoRow] = useState(null);
  return (
    <>
      <Modal title={`${name} · 담당 현장 (${rows.length}건)`} onClose={onClose} wide>
        <AdminTable head={["현장 · 호기", "주소", "점검완료일", "공단 제출", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-50">
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{r.loc}</td>
              <td className="px-3 py-2.5 text-slate-500">{r.address ?? "-"}</td>
              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.doneDate ?? "-"}</td>
              <td className="px-3 py-2.5"><GovBadge code={r.govResultCode} msg={r.govResultMsg} /></td>
              <td className="px-3 py-2.5 text-right pr-4">
                <button onClick={() => setPhotoRow(r)} className="text-xs font-bold text-blue-700 border border-blue-100 bg-blue-50 rounded-lg px-2.5 py-1.5">
                  사진 보기
                </button>
              </td>
            </tr>
          ))}
        </AdminTable>
      </Modal>
      {photoRow && (
        <Modal title={`${photoRow.loc} · 점검사진`} onClose={() => setPhotoRow(null)}>
          <PhotoGrid urls={photoRow.photos ?? []} emptyText="등록된 점검사진이 없습니다" />
        </Modal>
      )}
    </>
  );
}

export default function SelfChecksAdmin({ data, setData }) {
  const { selfChecks } = data;
  const [ym, setYm] = useState(TODAY_STR.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [engineerKey, setEngineerKey] = useState(null);

  const rows = selfChecks
    .filter((c) => c.ym === ym)
    .map((c) => {
      const u = data.units.find((x) => x.id === c.unitId);
      const s = u ? data.sites.find((x) => x.id === u.siteId) : null;
      return { ...c, loc: locOf(data, c.unitId), address: s?.address ?? null, gu: guOf(s?.address) };
    })
    .sort((a, b) => a.loc.localeCompare(b.loc, "ko"));
  const done = rows.filter((c) => c.status === "완료");

  const groups = new Map();
  for (const r of rows) {
    const key = r.assigneeId ?? "__unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const summaryRows = [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: key === "__unassigned" ? "미배정" : personOf(data, key),
      gus: [...new Set(list.map((r) => r.gu).filter(Boolean))],
      total: list.length,
      doneCount: list.filter((r) => r.status === "완료").length,
      rows: list,
    }))
    .sort((a, b) => (a.key === "__unassigned" ? 1 : b.key === "__unassigned" ? -1 : a.name.localeCompare(b.name, "ko")));

  async function generate() {
    setBusy(true);
    const { error } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (error) { alert("생성 실패: " + error.message); setBusy(false); return; }
    const { data: fresh } = await supabase.from("self_checks").select("*");
    setData((prev) => ({ ...prev, selfChecks: (fresh ?? []).map(mapSelfCheck) }));
    setBusy(false);
  }

  const detail = summaryRows.find((g) => g.key === engineerKey);

  return (
    <div className="max-w-5xl">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-extrabold">자체점검 출석부</h1>
          <p className="text-xs text-slate-500 mt-0.5">법정 월 1회 · 호기 단위 · 출석부에 남은 줄 = 누락 후보</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white" value={ym} onChange={(e) => setYm(e.target.value)} />
          {rows.length === 0 && (
            <button onClick={generate} disabled={busy} className="text-sm font-bold text-white bg-blue-700 disabled:bg-slate-300 rounded-xl px-4 py-2">
              {busy ? "생성 중..." : `${ym} 출석부 생성`}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-bold">{ym} 진행률</span>
            <span className="text-slate-500">완료 {done.length} / {rows.length} · 공단 제출 {rows.filter((c) => c.govResultCode === "000").length}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${rows.length ? (done.length / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center text-sm text-slate-400">
          {ym} 출석부가 아직 없습니다 — 위 버튼으로 생성하세요 (활성 호기 전체에 1줄씩)
        </div>
      ) : (
        <AdminTable head={["담당자", "담당 지역", "담당대수", "점검완료대수"]}>
          {summaryRows.map((g) => (
            <tr key={g.key} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => setEngineerKey(g.key)}>
              <td className="pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{g.name}</td>
              <td className="px-3 py-2.5 text-slate-500">{g.gus.length ? g.gus.join(", ") : "-"}</td>
              <td className="px-3 py-2.5">{g.total}</td>
              <td className="px-3 py-2.5">{g.doneCount}</td>
            </tr>
          ))}
        </AdminTable>
      )}
      <p className="text-[10px] text-slate-400 mt-2">
        * 기사용 모바일 점검 화면(사진·특이사항 입력)은 다음 단계. 매월 1일 자동 생성은 pg_cron 설정으로 가능 (supabase/migrations/004 참고).
      </p>

      {detail && <EngineerDetailModal name={detail.name} rows={detail.rows} onClose={() => setEngineerKey(null)} />}
    </div>
  );
}
