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
  };
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
    photo_count: photoUrls.length, photo_urls: photoUrls.length ? photoUrls : null,
    ...(reassigned ? { reassign_requested: false, reassign_reason: null, reassign_to: null } : {}),
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
      photoCount: patch.photo_count, photoUrls,
      ...(reassigned ? { reassignRequested: false, reassignReason: null, reassignTo: null } : {}),
    },
  };
}

// 담당자 여러 명(그룹) 저장 — 공통 필드(제목·현장·호기·내용·배정일·기한·요청자)만 전원에게 동일하게
// 적용한다. 담당자 구성·완료 여부·첨부는 개별 처리(changeAssignees 등)로 따로 다룬다.
export async function saveGroupCommon(supabase, { group, form, profiles, units, sites }) {
  const unit = units.find((u) => u.id === form.unitId);
  const site = sites.find((s) => s.id === form.siteId);
  const requester = profiles.find((p) => p.id === form.requesterId);
  const ids = group.map((t) => t.id);
  const patch = {
    title: form.title.trim(), description: form.description || null,
    site_name: site?.name ?? null, elevator_no: unit?.unitNo ?? null, unit_id: form.unitId || null,
    requested_by_id: form.requesterId || null, requested_by_name: requester?.name ?? null,
    assigned_date: form.assignedDate || null, due_date: form.dueDate || null,
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
