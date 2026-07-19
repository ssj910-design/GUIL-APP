import { useState, useContext } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { TODAY_STR } from "@/lib/constants";
import { siteUnitList } from "@/lib/utils";
import { mapSelfCheck, mapSelfCheckItem, mapSelfCheckItemState } from "@/lib/mappers";
import { PrimaryButton, Sheet, Field, inputCls } from "@/app/components/ui";
import { MultiPhotoUpload } from "@/app/components/formWidgets";
import { SitesContext, UnitsContext, AuthContext } from "@/app/components/context";
import SELF_CHECK_ITEM_CODES from "@/lib/data/selfCheckItemCodes.json";

/* ------------------------------------------------------------------ */
/* CHECKUP (정기점검) — self_checks(자체점검 출석부) 실데이터 연동             */
/* 일정 등록 = 이번 달 출석부 행의 planned_date, 자체점검 등록 = 완료 처리 +      */
/* 점검항목 예외 기록(self_check_items, 기본 양호(A) · 예외만 저장).           */
/* 점검항목엔 1/3/6개월 주기가 있고(실제 리포트 5개월치로 실증), 주기가          */
/* 이번 달이 아니면 D(제외)로 자동 채워 제출한다 — self_check_item_states가      */
/* 호기별로 "마지막 실제 점검월"을 들고 있어야 계산되는데 처음엔 이력이 없어서    */
/* 최초 1회는 기사가 "이번 달 대상인지" 직접 확인해줘야 한다.                  */
/* 공단 제출 = 승강기민원24 RegistInspectionService로 실제 제출               */
/* ------------------------------------------------------------------ */

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const RESULT_OPTIONS = [
  { v: "A", label: "A 양호" },
  { v: "B", label: "B 주의관찰" },
  { v: "C", label: "C 긴급수리" },
  { v: "D", label: "D 제외" },
  { v: "E", label: "E 항목없음" },
];

export function CheckupTab({ selfChecks, setSelfChecks, siteManagers = [], profilesAll = [] }) {
  const sites = useContext(SitesContext);
  const units = useContext(UnitsContext);
  const { name: CURRENT_ENGINEER, selfId } = useContext(AuthContext);
  const [subTab, setSubTab] = useState("계획");
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  const [scheduleTarget, setScheduleTarget] = useState(null); // 일정 등록 대상 현장
  const [scheduleDate, setScheduleDate] = useState(TODAY_STR);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [checkupTarget, setCheckupTarget] = useState(null); // 자체점검 등록 대상 현장
  const [checkupUnitId, setCheckupUnitId] = useState(null);
  const [checkupDate, setCheckupDate] = useState(TODAY_STR);
  const [checkupNotes, setCheckupNotes] = useState("");
  const [checkupPhotos, setCheckupPhotos] = useState([]); // [{ url }]
  const [itemExceptions, setItemExceptions] = useState({}); // { [itemCd]: { result, remark } } — 이번 달 대상 항목 중 기본값(A)과 다른 것만
  const [itemQuery, setItemQuery] = useState("");
  const [itemStates, setItemStates] = useState({}); // { [itemCd]: { applicable, lastDoneYm } } — 호기별 점검주기 상태
  const [pendingResolutions, setPendingResolutions] = useState({}); // { [itemCd]: "done" | "notdue" | "na" } — 최초 확인
  const [pendingQuery, setPendingQuery] = useState("");
  const [savingCheckup, setSavingCheckup] = useState(false);

  const [submitTarget, setSubmitTarget] = useState(null); // 공단 제출 대상 self_check 행
  const [submitForm, setSubmitForm] = useState({ cnfirm: "", cnfirmTel: "", subUsid: "", startTime: "09:00", endTime: "09:30" });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const [dayPopup, setDayPopup] = useState(null); // 클릭한 날짜(iso)

  const ym = TODAY_STR.slice(0, 7);
  const unitById = new Map(units.map((u) => [u.id, u]));
  const siteById = new Map(sites.map((s) => [s.id, s]));

  // 디폴트는 내 담당현장만, "모든 현장보기" 체크 시 전체 현장. 계획 탭은 현장명·주소로 추가 검색.
  const scopedSites = sites.filter((s) => showAll || s.assignedEngineer === CURRENT_ENGINEER);
  const visibleUnitIds = new Set(units.filter((u) => scopedSites.some((s) => s.id === u.siteId)).map((u) => u.id));
  const q = query.trim();
  const planSites = scopedSites.filter((s) => !q || s.name.includes(q) || (s.address ?? "").includes(q));

  const checksThisMonth = selfChecks.filter((c) => c.ym === ym && visibleUnitIds.has(c.unitId));
  const plannedChecks = checksThisMonth.filter((c) => c.status === "예정");
  const doneChecks = checksThisMonth
    .filter((c) => c.status === "완료")
    .sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""));

  function locOfCheck(c) {
    const u = unitById.get(c.unitId);
    const s = u ? siteById.get(u.siteId) : null;
    return s ? `${s.name} · ${u.unitNo}` : "-";
  }

  function setItemResult(code, result, remark) {
    setItemExceptions((prev) => {
      if (result === "A") {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return { ...prev, [code]: { result, remark: remark ?? prev[code]?.remark ?? "" } };
    });
  }

  function resolvePending(code, choice) {
    setPendingResolutions((prev) => ({ ...prev, [code]: choice }));
  }

  // 점검주기(1/3/6개월) 기반 이번 달 대상 판정. 리포트 실데이터로 확인된 구조:
  // 1개월 주기는 매달 대상, 3·6개월 주기는 "마지막 실제 점검월"로부터 그 개월 수가
  // 지나야 대상(그 전엔 D/제외) — 근데 그 기준월은 승강기마다 달라서(전사 공통 캘린더 아님)
  // 처음엔 알 수가 없다. 그래서 아직 한 번도 기록이 없는(lastDoneYm null) 항목은
  // "최초 확인 필요"로 따로 빼서 기사가 한 번 확정해주면, 그다음부턴 자동 계산된다.
  function monthsBetween(fromYm, toYm) {
    const [fy, fm] = fromYm.split("-").map(Number);
    const [ty, tm] = toYm.split("-").map(Number);
    return (ty - fy) * 12 + (tm - fm);
  }
  const dueItemCodes = SELF_CHECK_ITEM_CODES.filter((item) => {
    const st = itemStates[item.code];
    if (st?.applicable === false) return false;
    if (item.cycle === 1) return true;
    if (!st?.lastDoneYm) return false;
    return monthsBetween(st.lastDoneYm, ym) >= item.cycle;
  });
  const pendingItemCodes = SELF_CHECK_ITEM_CODES.filter((item) => {
    const st = itemStates[item.code];
    if (st?.applicable === false) return false;
    if (item.cycle === 1) return false;
    return !st?.lastDoneYm;
  });
  const filteredItemCodes = dueItemCodes.filter(
    (it) => !itemQuery.trim() || it.name.includes(itemQuery.trim()) || it.no.includes(itemQuery.trim())
  );
  const filteredPendingCodes = pendingItemCodes.filter(
    (it) => !pendingQuery.trim() || it.name.includes(pendingQuery.trim()) || it.no.includes(pendingQuery.trim())
  );

  // 달력: 오늘이 속한 달을 기준으로 그린다.
  const today = new Date(`${TODAY_STR}T00:00:00`);
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = new Date(year, month, 1).getDay();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const isoOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  async function registerSchedule() {
    const targetUnits = siteUnitList(scheduleTarget, units).filter((u) => u.id);
    if (targetUnits.length === 0) { setScheduleTarget(null); return; }
    setSavingSchedule(true);
    const { error: genError } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (genError) { alert("일정 등록 실패: " + genError.message); setSavingSchedule(false); return; }
    const unitIds = targetUnits.map((u) => u.id);
    const { error } = await supabase.from("self_checks").update({ planned_date: scheduleDate }).eq("ym", ym).in("unit_id", unitIds);
    if (error) { alert("일정 등록 실패: " + error.message); setSavingSchedule(false); return; }
    const { data: fresh } = await supabase.from("self_checks").select("*").eq("ym", ym).in("unit_id", unitIds);
    setSelfChecks((prev) => [...prev.filter((c) => !(c.ym === ym && unitIds.includes(c.unitId))), ...(fresh ?? []).map(mapSelfCheck)]);
    setSavingSchedule(false);
    setScheduleTarget(null);
  }

  // 이미 이번 달 행이 있으면(등록된 결과·사진·특이사항·점검항목 예외) 불러와 폼에 채운다.
  async function loadCheckupForUnit(unitId) {
    setCheckupUnitId(unitId);
    setCheckupDate(TODAY_STR);
    setCheckupNotes("");
    setCheckupPhotos([]);
    setItemExceptions({});
    setItemQuery("");
    setPendingResolutions({});
    setPendingQuery("");

    const { data: stateRows } = await supabase.from("self_check_item_states").select("*").eq("unit_id", unitId);
    const stateMap = {};
    (stateRows ?? []).map(mapSelfCheckItemState).forEach((st) => { stateMap[st.itemCd] = { applicable: st.applicable, lastDoneYm: st.lastDoneYm }; });
    setItemStates(stateMap);

    const existing = selfChecks.find((c) => c.unitId === unitId && c.ym === ym);
    if (!existing) return;
    if (existing.doneDate) setCheckupDate(existing.doneDate);
    setCheckupNotes(existing.notes ?? "");
    setCheckupPhotos((existing.photos ?? []).map((url) => ({ url })));
    const { data } = await supabase.from("self_check_items").select("*").eq("self_check_id", existing.id);
    const map = {};
    (data ?? []).map(mapSelfCheckItem).forEach((it) => { map[it.itemCd] = { result: it.result, remark: it.remark ?? "" }; });
    setItemExceptions(map);
  }

  function openCheckup(s) {
    const targetUnits = siteUnitList(s, units).filter((u) => u.id);
    if (targetUnits.length === 0) return;
    setCheckupTarget(s);
    loadCheckupForUnit(targetUnits[0].id);
  }

  async function submitCheckup() {
    if (!checkupUnitId) return;
    setSavingCheckup(true);
    const { error: genError } = await supabase.rpc("generate_self_checks", { p_ym: ym });
    if (genError) { alert("자체점검 등록 실패: " + genError.message); setSavingCheckup(false); return; }
    const { error } = await supabase
      .from("self_checks")
      .update({
        status: "완료",
        done_date: checkupDate,
        photos: checkupPhotos.map((p) => p.url),
        notes: checkupNotes || null,
        assignee_id: selfId,
      })
      .eq("unit_id", checkupUnitId)
      .eq("ym", ym);
    if (error) { alert("자체점검 등록 실패: " + error.message); setSavingCheckup(false); return; }
    const { data: freshRow } = await supabase.from("self_checks").select("*").eq("unit_id", checkupUnitId).eq("ym", ym).single();
    const mapped = mapSelfCheck(freshRow);

    // 점검항목 예외를 통째로 다시 쓴다 (기존 행 삭제 후 현재 예외만 insert).
    await supabase.from("self_check_items").delete().eq("self_check_id", mapped.id);
    const exceptionRows = Object.entries(itemExceptions).map(([code, v]) => ({
      self_check_id: mapped.id, item_cd: code, result: v.result, remark: v.remark || null,
    }));
    if (exceptionRows.length > 0) {
      const { error: itemsError } = await supabase.from("self_check_items").insert(exceptionRows);
      if (itemsError) alert("점검항목 저장 실패: " + itemsError.message);
    }

    // 이번 달 대상이었던 항목(1개월 주기 전부 + 이번 달이 돌아온 3·6개월 주기 항목)은
    // "마지막 실제 점검월"을 이번 달로 갱신 — 다음 달부터 주기 계산이 이어지게 한다.
    const stateUpserts = dueItemCodes.map((item) => ({
      unit_id: checkupUnitId, item_cd: item.code, applicable: true, last_done_ym: ym,
    }));
    // 최초 확인한 항목(3·6개월 주기, 이력 없던 것)도 결과에 맞게 상태를 남긴다.
    for (const [code, choice] of Object.entries(pendingResolutions)) {
      if (choice === "done") stateUpserts.push({ unit_id: checkupUnitId, item_cd: code, applicable: true, last_done_ym: ym });
      else if (choice === "na") stateUpserts.push({ unit_id: checkupUnitId, item_cd: code, applicable: false, last_done_ym: null });
      // "notdue"는 아직 기준월을 모른다는 뜻이라 상태를 남기지 않는다 — 다음 달에 다시 확인 요청.
    }
    if (stateUpserts.length > 0) {
      const { error: stateError } = await supabase.from("self_check_item_states").upsert(stateUpserts, { onConflict: "unit_id,item_cd" });
      if (stateError) alert("점검주기 상태 저장 실패: " + stateError.message);
    }

    setSelfChecks((prev) => [...prev.filter((c) => !(c.unitId === checkupUnitId && c.ym === ym)), mapped]);
    setSavingCheckup(false);
    setCheckupTarget(null);
    setCheckupUnitId(null);
    setCheckupPhotos([]);
    setCheckupNotes("");
    setItemExceptions({});
    setItemStates({});
    setPendingResolutions({});
  }

  function openSubmit(c) {
    const u = unitById.get(c.unitId);
    const s = u ? siteById.get(u.siteId) : null;
    const manager = siteManagers.find((m) => m.siteId === s?.id && m.isPrimary) ?? siteManagers.find((m) => m.siteId === s?.id);
    setSubmitTarget(c);
    setSubmitForm({ cnfirm: manager?.name ?? "", cnfirmTel: manager?.phone ?? "", subUsid: "", startTime: "09:00", endTime: "09:30" });
    setSubmitResult(null);
  }

  // 승강기민원24(RegistInspectionService)에 실제로 제출한다 — 되돌릴 수 없는 외부 규제기관 신고이므로
  // 관리주체·시간·보조점검자 값을 사람이 확인한 뒤 눌러야 한다(자동 제출 아님).
  async function submitToGov() {
    if (!submitTarget) return;
    const c = submitTarget;
    const u = unitById.get(c.unitId);
    if (!u?.govNo) { alert("이 호기에 승강기고유번호가 등록돼 있지 않습니다"); return; }
    const assignee = profilesAll.find((p) => p.id === c.assigneeId);
    if (!assignee?.minwon_id) { alert("담당 기사의 민원24 점검자 ID가 등록돼 있지 않습니다 — 인사관리에서 먼저 등록해주세요"); return; }
    if (!assignee?.phone) { alert("담당 기사의 연락처가 등록돼 있지 않습니다 — 인사관리에서 먼저 등록해주세요"); return; }
    // CNFIRM/CNFIRM_TELNO(관리주체명·전화번호)는 공단 스펙상 필수(구분=1) — 비워서 보내면
    // 999(기타 오류)로 튕겨나온다. 이 현장에 담당자가 등록 안 돼 자동으로 못 채웠으면 직접 입력해야 한다.
    if (!submitForm.cnfirm.trim() || !submitForm.cnfirmTel.trim()) {
      alert("관리주체명/전화번호는 필수입니다 — 이 현장에 등록된 담당자가 없으면 직접 입력해주세요");
      return;
    }

    setSubmitting(true);
    // 실제 리포트(report.xls 등, 5개월치)로 확인한 구조: 184개 항목 전부를 매달 채워 보내야 하고,
    // 1개월 주기는 항상 A(예외만 self_check_items에 저장), 3·6개월 주기는 self_check_item_states의
    // "마지막 실제 점검월"로부터 그 개월수가 지났으면 A, 아니면 D(제외), 이 호기에 해당 없으면 E.
    const { data: items } = await supabase.from("self_check_items").select("*").eq("self_check_id", c.id);
    const exceptionMap = new Map((items ?? []).map((it) => [it.item_cd, it]));
    const { data: stateRows } = await supabase.from("self_check_item_states").select("*").eq("unit_id", c.unitId);
    const stateMap = new Map((stateRows ?? []).map((s) => [s.item_cd, s]));

    const resultList = SELF_CHECK_ITEM_CODES.map((item) => {
      const exc = exceptionMap.get(item.code);
      if (exc) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: exc.result, REMARK: exc.remark ?? "" };
      const st = stateMap.get(item.code);
      if (st?.applicable === false) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: "E", REMARK: "" };
      if (item.cycle === 1) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: "A", REMARK: "" };
      if (!st?.last_done_ym) return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: "D", REMARK: "" };
      const elapsed = monthsBetween(st.last_done_ym, c.ym);
      return { SEL_CHK_ITEM_CD: item.code, SEL_CHK_RESULT: elapsed >= item.cycle ? "A" : "D", REMARK: "" };
    });

    const ymCompact = c.ym.replace("-", "");
    const dateCompact = (c.doneDate ?? TODAY_STR).replace(/-/g, "");
    const companyUniqueNo = c.govCompanyUniqueNo || `GUIL_${c.id.slice(0, 8)}`;

    // 샘플 데이터(010123456784)가 숫자만 있는 형식이라 대시가 섞여 있으면 "필수입력 오류"로
    // 튕겨나온다(빈 값과 동일하게 취급되는 듯) — 숫자만 남기고 보낸다.
    const digitsOnly = (v) => (v ?? "").replace(/[^0-9]/g, "");

    const contents = {
      COMPANY_UNIQUE_NO: companyUniqueNo,
      ELEVATOR_NO: u.govNo,
      SEL_CHK_YM: ymCompact,
      SELCHK_USID: assignee.minwon_id,
      SEL_CHK_ST_DT: `${dateCompact}${submitForm.startTime.replace(":", "")}`,
      SEL_CHK_END_DT: `${dateCompact}${submitForm.endTime.replace(":", "")}`,
      SELCHK_USID_TELNO: digitsOnly(assignee.phone),
      SUB_SELCHK_USID: submitForm.subUsid || assignee.minwon_id,
      CNFIRM: submitForm.cnfirm,
      CNFIRM_TELNO: digitsOnly(submitForm.cnfirmTel),
      SELCHK_REASON_CD: "GD0001",
      PATICULS: c.notes || "",
      RESULT_LIST: resultList,
    };

    try {
      const res = await fetch("/api/self-check-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contents),
      });
      const data = await res.json();
      setSubmitResult(data);
      if (data.resultCode === "000") {
        const submittedAt = new Date().toISOString();
        await supabase.from("self_checks").update({
          gov_company_unique_no: companyUniqueNo,
          gov_submitted_at: submittedAt,
          gov_result_code: data.resultCode,
          gov_result_msg: data.resultMsg,
        }).eq("id", c.id);
        setSelfChecks((prev) => prev.map((x) => (x.id === c.id
          ? { ...x, govCompanyUniqueNo: companyUniqueNo, govSubmittedAt: submittedAt, govResultCode: data.resultCode, govResultMsg: data.resultMsg }
          : x)));
      }
    } catch (err) {
      setSubmitResult({ error: err.message });
    }
    setSubmitting(false);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex border-b border-slate-100 shrink-0">
        {["계획", "처리", "달력"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-3 text-sm font-bold ${subTab === t ? "text-blue-700 border-b-2 border-blue-700" : "text-slate-400"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-blue-700">진행상황</p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 계획 {plannedChecks.length}</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> 처리 {doneChecks.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "계획" && (
          <div className="px-5 pt-2 pb-4">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="현장명 또는 주소로 검색"
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 mb-3">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              모든 현장보기
            </label>
            <div className="space-y-2.5">
              {planSites.map((s) => {
                const hasUnits = siteUnitList(s, units).filter((u) => u.id).length > 0;
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm">{s.name} · {siteUnitList(s, units).length}대</p>
                      <p className="text-[11px] text-slate-400 truncate">{s.address}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {hasUnits ? (
                        <>
                          <button
                            onClick={() => { setScheduleTarget(s); setScheduleDate(TODAY_STR); }}
                            className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                          >
                            일정 등록
                          </button>
                          <button
                            onClick={() => openCheckup(s)}
                            className="text-xs font-bold text-white bg-blue-700 px-3 py-1.5 rounded-lg"
                          >
                            자체점검 등록
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400">호기 미등록</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {planSites.length === 0 && <p className="text-xs text-slate-400 text-center py-8">표시할 현장이 없습니다</p>}
            </div>
          </div>
        )}

        {subTab === "처리" && (
          <div className="px-5 pt-4 pb-4">
            {doneChecks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">해당 기간에 처리된 점검이 없습니다</p>
            ) : (
              <div className="space-y-2.5">
                {doneChecks.map((c) => (
                  <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm">{locOfCheck(c)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">완료일 {c.doneDate}</p>
                      </div>
                      {c.govSubmittedAt ? (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">공단 제출완료</span>
                      ) : (
                        <button
                          onClick={() => openSubmit(c)}
                          className="shrink-0 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                        >
                          공단 제출
                        </button>
                      )}
                    </div>
                    {c.notes && <p className="text-[11px] text-red-600 mt-1">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === "달력" && (
          <div className="pb-4">
            <div className="grid grid-cols-7 text-center text-sm font-bold px-2">
              {WEEK_LABELS.map((d, idx) => (
                <div key={d} className={`py-2.5 ${idx === 0 ? "text-red-400" : idx === 6 ? "text-sky-400" : "text-slate-500"}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-t border-slate-100">
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={"pad" + i} className="min-h-[84px] border-b border-r border-slate-50" />
              ))}
              {monthDays.map((d) => {
                const dow = (startDow + d - 1) % 7;
                const iso = isoOf(d);
                const isToday = iso === TODAY_STR;
                const daySchedules = checksThisMonth.filter((c) => c.plannedDate === iso);
                const numColorCls = dow === 0 ? "text-red-400" : dow === 6 ? "text-sky-400" : "text-slate-700";
                return (
                  <button
                    key={d}
                    onClick={() => setDayPopup(iso)}
                    className="min-h-[84px] border-b border-r border-slate-50 p-1.5 flex flex-col items-start text-left active:bg-slate-50"
                  >
                    <span className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-blue-500 text-white" : numColorCls}`}>
                      {d}
                    </span>
                    {daySchedules.length > 0 && (
                      <div className="mt-1 space-y-0.5 w-full">
                        {daySchedules.slice(0, 2).map((c) => (
                          <p key={c.id} className="text-[10px] text-blue-700 font-semibold truncate">{siteById.get(unitById.get(c.unitId)?.siteId)?.name ?? "-"}</p>
                        ))}
                        {daySchedules.length > 2 && (
                          <p className="text-[9px] text-slate-400">+{daySchedules.length - 2}건 더</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {scheduleTarget && (
        <Sheet title={`${scheduleTarget.name} 일정 등록`} onClose={() => setScheduleTarget(null)}>
          <Field label="점검 예정일">
            <input type="date" className={inputCls} value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
          </Field>
          <PrimaryButton disabled={savingSchedule} onClick={registerSchedule}>
            {savingSchedule ? "저장 중..." : "일정 저장"}
          </PrimaryButton>
        </Sheet>
      )}

      {checkupTarget && (
        <Sheet title={`${checkupTarget.name} 자체점검 등록`} onClose={() => setCheckupTarget(null)}>
          {siteUnitList(checkupTarget, units).filter((u) => u.id).length > 1 && (
            <Field label="호기">
              <select className={inputCls} value={checkupUnitId ?? ""} onChange={(e) => loadCheckupForUnit(e.target.value)}>
                {siteUnitList(checkupTarget, units).filter((u) => u.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.unitNo}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="점검일">
            <input type="date" className={inputCls} value={checkupDate} onChange={(e) => setCheckupDate(e.target.value)} />
          </Field>
          <Field label="점검 사진">
            <MultiPhotoUpload
              photos={checkupPhotos}
              uploadFolder={`self-checks/${checkupUnitId ?? "unknown"}/${ym}`}
              onUploaded={(url) => setCheckupPhotos((p) => [...p, { url }])}
              onRemove={(idx) => setCheckupPhotos((p) => p.filter((_, i) => i !== idx))}
            />
          </Field>
          {pendingItemCodes.length > 0 && (
            <Field label={`처음 확인 필요 (${pendingItemCodes.length}건) — 3·6개월 주기 항목은 이력이 없어 이번 달 대상인지 몰라요`}>
              <input
                value={pendingQuery}
                onChange={(e) => setPendingQuery(e.target.value)}
                placeholder="항목명·번호로 검색"
                className={inputCls}
              />
              <div className="mt-2 max-h-56 overflow-y-auto border border-amber-200 rounded-lg divide-y divide-amber-100">
                {filteredPendingCodes.map((item) => {
                  const choice = pendingResolutions[item.code];
                  return (
                    <div key={item.code} className="px-2.5 py-1.5">
                      <p className="text-[11px] text-slate-600 mb-1">{item.no} {item.name} <span className="text-slate-400">({item.cycle}개월 주기)</span></p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => resolvePending(item.code, "done")}
                          className={`text-[10px] font-bold px-2 py-1 rounded border ${choice === "done" ? "border-emerald-400 bg-emerald-100 text-emerald-800" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
                        >
                          이번달 점검함(양호)
                        </button>
                        <button
                          type="button"
                          onClick={() => resolvePending(item.code, "notdue")}
                          className={`text-[10px] font-bold px-2 py-1 rounded border ${choice === "notdue" ? "border-slate-400 bg-slate-200 text-slate-700" : "border-slate-300 text-slate-500"}`}
                        >
                          이번달 아님
                        </button>
                        <button
                          type="button"
                          onClick={() => resolvePending(item.code, "na")}
                          className={`text-[10px] font-bold px-2 py-1 rounded border ${choice === "na" ? "border-red-400 bg-red-100 text-red-800" : "border-red-300 bg-red-50 text-red-600"}`}
                        >
                          해당없음
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredPendingCodes.length === 0 && <p className="text-xs text-slate-400 text-center py-4">검색 결과가 없습니다</p>}
              </div>
              <p className="text-[10px] text-amber-600 mt-1">한 번 확인하면 다음 달부터는 자동으로 계산돼 여기 다시 안 뜹니다.</p>
            </Field>
          )}
          <Field label={`이번 달 점검항목 (기본 양호 · 예외 ${Object.keys(itemExceptions).length}건)`}>
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="항목명·번호로 검색"
              className={inputCls}
            />
            <div className="mt-2 max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {filteredItemCodes.map((item) => {
                const exc = itemExceptions[item.code];
                return (
                  <div key={item.code} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-600 truncate">{item.no} {item.name}</span>
                    <select
                      value={exc?.result ?? "A"}
                      onChange={(e) => setItemResult(item.code, e.target.value)}
                      className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-1 border ${exc ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-400"}`}
                    >
                      {RESULT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </div>
                );
              })}
              {filteredItemCodes.length === 0 && <p className="text-xs text-slate-400 text-center py-4">검색 결과가 없습니다</p>}
            </div>
            {Object.keys(itemExceptions).length > 0 && (
              <p className="text-[10px] text-amber-600 mt-1">예외 항목(B/C)이 있으면 아래 특이사항에 사유를 함께 적어주세요 — 공단 제출 시 필수입니다.</p>
            )}
          </Field>
          <Field label="특이사항">
            <textarea
              className={inputCls}
              rows={3}
              placeholder="예: 로프 장력 미세 저하, 다음 점검 시 재확인 필요"
              value={checkupNotes}
              onChange={(e) => setCheckupNotes(e.target.value)}
            />
          </Field>
          <PrimaryButton disabled={savingCheckup} onClick={submitCheckup}>
            {savingCheckup ? "저장 중..." : "자체점검 등록"}
          </PrimaryButton>
          <p className="text-[11px] text-slate-400 text-center mt-2">여기서는 사내 기록으로 저장됩니다. 승강기민원24 제출은 처리 탭에서 &quot;공단 제출&quot;로 별도 진행합니다.</p>
        </Sheet>
      )}

      {submitTarget && (
        <Sheet title={`${locOfCheck(submitTarget)} 자체점검 공단 제출`} onClose={() => setSubmitTarget(null)}>
          <p className="text-[11px] text-slate-400 mb-3">승강기민원24(RegistInspectionService)에 실제로 제출됩니다. 내용을 확인한 뒤 제출해주세요.</p>
          <Field label="관리주체명">
            <input className={inputCls} value={submitForm.cnfirm} onChange={(e) => setSubmitForm({ ...submitForm, cnfirm: e.target.value })} />
          </Field>
          <Field label="관리주체 전화번호">
            <input className={inputCls} value={submitForm.cnfirmTel} onChange={(e) => setSubmitForm({ ...submitForm, cnfirmTel: e.target.value })} />
          </Field>
          <Field label="보조점검자 민원24 ID (없으면 본인 ID로 제출)">
            <input className={inputCls} value={submitForm.subUsid} onChange={(e) => setSubmitForm({ ...submitForm, subUsid: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="점검 시작시각">
              <input type="time" className={inputCls} value={submitForm.startTime} onChange={(e) => setSubmitForm({ ...submitForm, startTime: e.target.value })} />
            </Field>
            <Field label="점검 종료시각">
              <input type="time" className={inputCls} value={submitForm.endTime} onChange={(e) => setSubmitForm({ ...submitForm, endTime: e.target.value })} />
            </Field>
          </div>
          {submitResult && (
            <div className="mt-2">
              <p className={`text-xs font-bold ${submitResult.resultCode === "000" ? "text-emerald-600" : "text-red-600"}`}>
                {submitResult.error ? submitResult.error : `${submitResult.resultCode} ${submitResult.resultMsg}`}
              </p>
              {submitResult.raw && (
                <p className="text-[10px] text-slate-400 mt-1 break-all">HTTP {submitResult.httpStatus} · {submitResult.raw}</p>
              )}
            </div>
          )}
          <PrimaryButton disabled={submitting} onClick={submitToGov}>
            {submitting ? "제출 중..." : "공단에 제출"}
          </PrimaryButton>
        </Sheet>
      )}

      {dayPopup && (
        <Sheet title={`${dayPopup} 점검일정`} onClose={() => setDayPopup(null)}>
          {checksThisMonth.filter((c) => c.plannedDate === dayPopup).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">등록된 점검 일정이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {checksThisMonth.filter((c) => c.plannedDate === dayPopup).map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2.5">
                  <p className="text-sm font-semibold text-slate-800">{locOfCheck(c)}</p>
                </div>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
