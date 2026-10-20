// 할 일 수정 공용 로직 — 관리자웹(TodosAdmin)과 앱 할일 상세(TodoTab) 수정 모드가 같은 규칙으로
// 저장하도록 한 곳에 뒀다. 화면마다 따로 구현하면 한쪽만 고쳐져 어긋난다(담당자 변경 때 이름만
// 바뀌고 assignee_id가 옛 값으로 남던 버그가 그 사례). 화면 상태(setData/setTodos)·알림·alert는
// 호출한 쪽이 맡고, 여기서는 DB 쓰기와 규칙만 처리해 결과를 돌려준다. 실패는 { error } 문자열.
import { mapTodo } from "./mappers.js";

// 자재/견적 연동 할일은 담당자 수만큼 각자 별도 행으로 저장돼 있다 — 같은 요청을 공유하는 행을
// 한 건으로 묶는 키. 요청 연결이 없는(수동·검사보완 등) 할일은 원래도 1건뿐이라 그대로 둔다.
export function groupKeyOf(t) {
  if (t.source === "quote" && t.quoteRequestId) return `quote:${t.quoteRequestId}`;
  if (t.source === "material" && t.materialRequestId) return `material:${t.materialRequestId}`;
  // 관리자 직접 할일부여(복수 담당자)도 담당자 수만큼 행이 생기는데 요청 id가 없다 — id가
  // "todo-manual-<생성시각>-<순번>" 형태로 배정 배치마다 같은 시각을 공유하므로 순번만 떼어 배치 키로 쓴다.
  if (t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id)) {
    // 생성시각(ms)이 우연히 겹친 다른 배정까지 한 건으로 묶이지 않게 제목·현장도 키에 넣는다.
    return `${t.id.replace(/-\d+$/, "")}|${t.title ?? ""}|${t.siteName ?? ""}`;
  }
  return `solo:${t.id}`;
}

// 담당자를 여러 명으로 늘릴 수 있는 할일 — 새로 만든 담당자 행이 groupKeyOf로 같은 건에 계속
// 묶여야 한다. 요청 연결이 없는 검사보완·자체점검지적·반납 등(1건짜리)은 담당자 교체만 된다.
export function canHaveMultipleAssignees(t) {
  return (t.source === "quote" && !!t.quoteRequestId)
    || (t.source === "material" && !!t.materialRequestId)
    || (t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id));
}

// 한 명이 완료/완료취소하면 같이 바뀌는 행들 — 관리자 배정(manual) 묶음과 자체점검 지적사항은 담당자 전원이
// 한 건을 같이 끝내므로 완료도 취소도 전원에게 적용한다. 한쪽만 풀면 "일부만 완료"된 어정쩡한 상태가 남는다.
// 자재·견적 연동은 비용청구가 완료 경로라 여기서 묶지 않는다(담당자별로 따로 처리).
export function completionGroupIds(todos, t) {
  if (t.selfCheckItemId) return todos.filter((x) => x.selfCheckItemId === t.selfCheckItemId).map((x) => x.id);
  if (t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id)) {
    const key = groupKeyOf(t);
    return todos.filter((x) => groupKeyOf(x) === key).map((x) => x.id);
  }
  return [t.id];
}

// 수정 폼 초기값 — group은 같은 건으로 묶인 행들(1건짜리는 길이 1).
export function todoFormFrom(group, { units, sites }) {
  const t = group[0];
  const currentUnit = units.find((u) => u.id === t.unitId);
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    siteId: currentUnit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "",
    unitId: t.unitId ?? "",
    assigneeIds: group.map((m) => m.assigneeId).filter(Boolean),
    requesterId: t.requestedById ?? "",
    assignedDate: t.assignedDate ?? "",
    dueDate: t.dueDate ?? "",
    photoUrls: t.photoUrls ?? [],
    ...billingFormFrom(t, { units, sites }),
  };
}

// ---------------------------------------------------------------- 비용청구 후 완료 설정
// 관리자가 직접 배정한(manual) 부품 교체 할일을 자재지급건처럼 "비용청구를 제출해야 완료"되게 만드는 설정.
// 설정 화면(BillingSetupFields)의 폼 값 ↔ DB 컬럼(billing_required·billing_part·billing_amount·
// billing_part_rows·part·elevator_nos) 변환. 컬럼 구성은 자재 지급 확정(handleSupplyComplete)과 같다.
export function canSetBilling(t) {
  return t.source === "manual";
}

// 부품 금액 칸에 "-"를 쓰면 금액 미정(견적서 참조) — 0원(무상)과 다르다. 구조화 행에는 amount: null로
// 저장하고, 청구금액(billing_amount)도 비워 둔다(일부만 "-"여도 총액이 확정되지 않았으니 비움).
// 기사 청구 화면은 이런 건을 "견적서 참조"로 기본 선택하고, 관리자웹 부품교체·공사내역에서 관리자가
// 나중에 금액을 입력해 청구한다.
export const isQuoteRefInput = (v) => String(v ?? "").trim() === "-";
export const rowAmountOf = (v) => (isQuoteRefInput(v) ? null : Number(v) || 0);
export const amountTextOf = (amount) => (amount == null ? "견적서 참조" : `₩${Number(amount).toLocaleString("ko-KR")}`);
export const sumAmounts = (amounts) => (amounts.some((a) => a == null) ? null : amounts.reduce((s, a) => s + a, 0) || null);
// 이 할일의 청구 부품 중 금액이 견적서 참조인 게 있는가
export const billingQuoteRef = (t) => (t?.billingPartRows ?? []).some((r) => r.amount == null);

export function billingFormFrom(t, { units, sites }) {
  const unit = units.find((u) => u.id === t.unitId);
  const siteId = unit?.siteId ?? sites.find((s) => s.name === t.siteName)?.id ?? "";
  const labels = t.elevatorNos?.length ? t.elevatorNos : t.elevatorNo ? [t.elevatorNo] : [];
  const siteUnits = units.filter((u) => u.siteId === siteId);
  const unitIds = labels.length
    ? siteUnits.filter((u) => labels.includes(u.unitNo)).map((u) => u.id)
    : (t.unitId ? [t.unitId] : []);
  return {
    billingRequired: !!t.billingRequired,
    unitIds: t.billingRequired ? unitIds : [],
    billingRows: (t.billingPartRows ?? []).map((r) => ({
      name: r.name ?? "", qty: r.qty ? String(r.qty).replace(/\D/g, "") : "", amount: r.amount != null ? String(r.amount) : "-",
    })),
  };
}

// 켜면 billing_* 컬럼과 (고른 호기로) unit_id·elevator_no(s)를 채우고, 끄면 billing_required만 내린다.
export function billingPatchOf(form, units) {
  if (!form.billingRequired) return { billing_required: false };
  const rows = (form.billingRows ?? [])
    .filter((r) => r.name?.trim())
    .map((r) => ({ name: r.name.trim(), qty: r.qty ? `${String(r.qty).replace(/\D/g, "")}개` : null, amount: rowAmountOf(r.amount) }));
  const label = (r) => (r.qty ? `${r.name} ${r.qty}` : r.name);
  const picked = (form.unitIds ?? []).map((id) => units.find((u) => u.id === id)).filter(Boolean);
  const labels = picked.map((u) => u.unitNo);
  return {
    billing_required: true,
    part: rows.map(label).join(", ") || null,
    billing_part: rows.map((r) => `${label(r)}(${amountTextOf(r.amount)})`).join(", ") || null,
    billing_amount: sumAmounts(rows.map((r) => r.amount)),
    billing_part_rows: rows.length ? rows : null,
    ...(picked.length ? { unit_id: picked[0].id, elevator_no: labels[0], elevator_nos: labels.length > 1 ? labels : null } : {}),
  };
}

// billingPatchOf 결과(DB 컬럼) → 화면 상태(todos 배열)에 반영할 camelCase.
export function billingLocalOf(p) {
  const o = {};
  if ("billing_required" in p) o.billingRequired = p.billing_required;
  if ("part" in p) o.part = p.part;
  if ("billing_part" in p) o.billingPart = p.billing_part;
  if ("billing_amount" in p) o.billingAmount = p.billing_amount;
  if ("billing_part_rows" in p) o.billingPartRows = p.billing_part_rows;
  if ("unit_id" in p) o.unitId = p.unit_id;
  if ("elevator_no" in p) o.elevatorNo = p.elevator_no;
  if ("elevator_nos" in p) o.elevatorNos = p.elevator_nos;
  return o;
}

// 청구(billings.todo_id)가 가리키는 키 — 관리자 배정 묶음(todo-manual-<배치>-<순번>)은 한 묶음에 청구 1건이라
// "<배치>"까지만, 나머지는 할일 id 그대로.
export function billingKeyOf(t) {
  return t.source === "manual" && typeof t.id === "string" && /^todo-manual-\d+-\d+$/.test(t.id)
    ? t.id.replace(/-\d+$/, "")
    : t.id;
}

// 단건 저장 — 제목·현장·호기·내용·요청자·담당자·배정일·기한·첨부 전부.
export async function saveSingleTodo(supabase, { todo: t, form, profiles, units, sites }) {
  const unit = units.find((u) => u.id === form.unitId);
  const site = sites.find((s) => s.id === form.siteId);
  const assigneeId = form.assigneeIds[0] ?? "";
  const engineer = profiles.find((p) => p.id === assigneeId);
  const requester = profiles.find((p) => p.id === form.requesterId);
  const photoUrls = form.photoUrls ?? [];
  // 재배정 요청 중인 할일의 담당자를 바꾸면 요청은 처리된 것이므로 자동 해제한다.
  const reassigned = assigneeId !== (t.assigneeId ?? "");
  const patch = {
    title: form.title.trim(), description: form.description || null,
    site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
    assignee: engineer?.name ?? null, assignee_id: assigneeId || null,
    requested_by_id: form.requesterId || null, requested_by_name: requester?.name ?? null,
    assigned_date: form.assignedDate || null, due_date: form.dueDate || null,
    // 관리자웹 수정 폼의 "상태(진행/완료)" — 앱 수정 모드는 상태를 폼으로 받지 않는다(완료는 별도 버튼).
    ...(form.done !== undefined ? { done: form.done } : {}),
    photo_count: photoUrls.length, photo_urls: photoUrls.length ? photoUrls : null,
    ...(reassigned ? { reassign_requested: false, reassign_reason: null, reassign_to: null } : {}),
    ...(canSetBilling(t) && t.billingRequired !== undefined && form.billingRequired !== undefined ? billingPatchOf(form, units) : {}),
  };
  const { error } = await supabase.from("todos").update(patch).eq("id", t.id);
  if (error) return { error: "저장 실패: " + error.message };
  return {
    ids: [t.id],
    local: {
      title: patch.title, description: patch.description ?? "",
      siteName: patch.site_name, elevatorNo: patch.elevator_no, unitId: patch.unit_id,
      assignee: patch.assignee, assigneeId: patch.assignee_id,
      requestedById: patch.requested_by_id, requestedByName: patch.requested_by_name,
      assignedDate: patch.assigned_date, dueDate: patch.due_date,
      ...("done" in patch ? { done: patch.done } : {}),
      photoCount: patch.photo_count, photoUrls,
      ...(reassigned ? { reassignRequested: false, reassignReason: null, reassignTo: null } : {}),
      ...billingLocalOf(patch),
    },
  };
}

// 담당자 여러 명(그룹) 저장 — 공통 필드(제목·현장·호기·내용·배정일·기한·요청자)만 전원에게 동일하게
// 적용한다. 담당자 구성·완료 여부·첨부는 개별 처리(changeAssignees 등)로 따로 다룬다.
export async function saveGroupCommon(supabase, { group, form, profiles, units, sites }) {
  // 첨부는 한 건으로 묶인 담당자 전원이 같이 보는 값이라 바뀌었을 때만 모든 행에 쓴다 — 안 바뀐 저장이
  // 행마다 다를 수 있는 기존 첨부를 첫 행 값으로 덮어쓰지 않게.
  const cur = group[0].photoUrls ?? [];
  const attachChanged = form.photoUrls !== undefined && (form.photoUrls.length !== cur.length || form.photoUrls.some((u, i) => u !== cur[i]));
  const unit = units.find((u) => u.id === form.unitId);
  const site = sites.find((s) => s.id === form.siteId);
  const requester = profiles.find((p) => p.id === form.requesterId);
  const ids = group.map((t) => t.id);
  const patch = {
    title: form.title.trim(), description: form.description || null,
    site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
    requested_by_id: form.requesterId || null, requested_by_name: requester?.name ?? null,
    assigned_date: form.assignedDate || null, due_date: form.dueDate || null,
    ...(attachChanged ? { photo_count: form.photoUrls.length, photo_urls: form.photoUrls.length ? form.photoUrls : null } : {}),
    ...(canSetBilling(group[0]) && group[0].billingRequired !== undefined && form.billingRequired !== undefined ? billingPatchOf(form, units) : {}),
  };
  const { error } = await supabase.from("todos").update(patch).in("id", ids);
  if (error) return { error: "저장 실패: " + error.message };
  return {
    ids,
    local: {
      title: patch.title, description: patch.description ?? "",
      siteName: patch.site_name, elevatorNo: patch.elevator_no, unitId: patch.unit_id,
      requestedById: patch.requested_by_id, requestedByName: patch.requested_by_name,
      assignedDate: patch.assigned_date, dueDate: patch.due_date,
      ...(attachChanged ? { photoCount: patch.photo_count, photoUrls: form.photoUrls } : {}),
      ...billingLocalOf(patch),
    },
  };
}

// 담당자 구성 변경(추가·제외·교체) — 빠진 사람과 새 사람을 짝지어 기존 행의 담당자만 바꾸고,
// 남는 빠진 사람 행은 삭제, 남는 새 사람은 기존 행을 복제해 새로 만든다. 새 행 id는 목록에서
// 같은 건으로 계속 묶이도록(groupKeyOf) 출처별 규칙을 따른다.
// 반환: { changed:false } | { error } | { changed:true, insertedRows(mapTodo 완료), swapTo(Map id→담당자 id),
//        deletedIds(Set), newlyAssigned([{id, assigneeId}]) } — 화면 상태 반영·알림은 호출한 쪽이 한다.
export async function changeTodoAssignees(supabase, { group, assigneeIds, profiles }) {
  const removed = group.filter((m) => m.assigneeId && !assigneeIds.includes(m.assigneeId));
  const addedIds = assigneeIds.filter((id) => !group.some((m) => m.assigneeId === id));
  if (!removed.length && !addedIds.length) return { changed: false };
  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? null;
  const clearReassign = { reassign_requested: false, reassign_reason: null, reassign_to: null };
  const swaps = removed.slice(0, addedIds.length).map((m, i) => ({ m, assigneeId: addedIds[i] }));
  const toDelete = removed.slice(addedIds.length);
  const toAdd = addedIds.slice(removed.length);

  for (const { m, assigneeId } of swaps) {
    const { error } = await supabase.from("todos").update({ assignee: nameOf(assigneeId), assignee_id: assigneeId, ...clearReassign }).eq("id", m.id);
    if (error) return { error: "담당자 변경 실패: " + error.message };
  }
  if (toDelete.length) {
    const { error } = await supabase.from("todos").delete().in("id", toDelete.map((m) => m.id));
    if (error) return { error: "담당자 제외 실패: " + error.message };
  }
  let insertedRows = [];
  if (toAdd.length) {
    // 사람별 값(완료·청구금액·재고확인·재배정 요청)은 비우고 나머지(제목·현장·기한·내용·첨부 등)는 그대로 복제.
    const base = group.find((m) => !m.done) ?? group[0];
    const { data: baseRow, error: baseError } = await supabase.from("todos").select("*").eq("id", base.id).single();
    if (baseError) return { error: "담당자 추가 실패: " + baseError.message };
    const { created_at: _createdAt, ...copy } = baseRow;
    const manualPrefix = base.id.replace(/-\d+$/, "");
    let nextIdx = Math.max(...group.map((m) => Number(m.id.match(/-(\d+)$/)?.[1] ?? 0))) + 1;
    const rows = toAdd.map((assigneeId) => ({
      ...copy,
      id: base.source === "manual"
        ? `${manualPrefix}-${nextIdx++}`
        : `todo-${base.source}-${base.quoteRequestId ?? base.materialRequestId}-${crypto.randomUUID()}`,
      assignee: nameOf(assigneeId), assignee_id: assigneeId,
      done: false, billing_amount: null, billing_part: null, billing_part_rows: null, stock_confirmed_at: null,
      ...clearReassign,
    }));
    const { data: inserted, error } = await supabase.from("todos").insert(rows).select();
    if (error) return { error: "담당자 추가 실패: " + error.message };
    insertedRows = (inserted ?? []).map(mapTodo);
  }

  return {
    changed: true,
    insertedRows,
    swapTo: new Map(swaps.map(({ m, assigneeId }) => [m.id, assigneeId])),
    deletedIds: new Set(toDelete.map((m) => m.id)),
    newlyAssigned: [
      ...swaps.map(({ m, assigneeId }) => ({ id: m.id, assigneeId })),
      ...insertedRows.map((r) => ({ id: r.id, assigneeId: r.assigneeId })),
    ],
  };
}

// changeTodoAssignees 결과를 화면 상태(todos 배열)에 반영 — 관리자웹(data.todos)과 앱(todos) 공용.
export function applyAssigneeChange(todos, result, profiles) {
  const nameOf = (id) => profiles.find((p) => p.id === id)?.name ?? null;
  return [
    ...result.insertedRows,
    ...todos.filter((x) => !result.deletedIds.has(x.id)).map((x) => (result.swapTo.has(x.id)
      ? { ...x, assignee: nameOf(result.swapTo.get(x.id)), assigneeId: result.swapTo.get(x.id), reassignRequested: false, reassignReason: null, reassignTo: null }
      : x)),
  ];
}

// 같은 요청을 공유하는 행 전체 삭제.
export async function deleteTodoRows(supabase, ids) {
  const { error } = await supabase.from("todos").delete().in("id", ids);
  return error ? { error: "삭제 실패: " + error.message } : { ids };
}
