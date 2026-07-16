
// Supabase 테이블의 snake_case 컬럼명을 화면 코드가 쓰던 camelCase 이름으로 바꿔줍니다.
export function mapSite(row) {
  return {
    id: row.id,
    siteCode: row.site_code,
    name: row.name,
    elevatorNo: row.elevator_no,
    address: row.address,
    region: row.region,
    contractType: row.contract_type,
    phone: row.phone,
    elevatorModel: row.elevator_model,
    unitCount: row.unit_count,
    manager: row.manager,
    managerPhone: row.manager_phone,
    overdueLong: row.overdue_long,
    overdueTotal: row.overdue_total,
    failures30d: row.failures_30d,
    assignedEngineer: row.assigned_engineer,
    notes: row.notes,
    govElevatorNos: row.gov_elevator_nos ?? [],
    managerId: row.manager_id,
    isActive: row.is_active,
  };
}


export function mapSiteManager(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    fax: row.fax,
    role: row.role,
    isPrimary: row.is_primary,
    profileId: row.profile_id,
  };
}


export function mapFailure(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    errorCode: row.error_code,
    status: row.status,
    reportedAt: row.reported_at,
    assignee: row.assignee,
    notFault: row.not_fault,
    reporterPhone: row.reporter_phone,
    arrivalTime: row.arrival_time,
    completeTime: row.complete_time,
    processResult: row.process_result,
    processNote: row.process_note,
    etaMinutes: row.eta_minutes,
    dispatchedAt: row.dispatched_at,
    escalation: row.escalation,
    faultSymptom: row.fault_symptom,
    faultErrorCode: row.fault_error_code,
    faultCause: row.fault_cause,
    processContent: row.process_content,
    photoCount: row.photo_count,
    photoUrls: row.photo_urls ?? [],
    unitId: row.unit_id,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
  };
}


export function mapInspection(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    type: row.type,
    org: row.org,
    dueDate: row.due_date,
    result: row.result,
    notes: row.notes,
    unitId: row.unit_id,
  };
}


export function mapMaterialRequest(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    part: row.part,
    urgency: row.urgency,
    note: row.note,
    photoCount: row.photo_count,
    photoUrls: row.photo_urls ?? [],
    engineer: row.engineer,
    requestedDate: row.requested_date,
    status: row.status,
    suppliedDate: row.supplied_date,
    rejectReason: row.reject_reason,
    rejectedDate: row.rejected_date,
    hasSupplyPhoto: row.has_supply_photo,
    supplyPhotoUrl: row.supply_photo_url,
    unitId: row.unit_id,
    requesterId: row.requester_id,
    supplyPhotoUrls: row.supply_photo_urls ?? (row.supply_photo_url ? [row.supply_photo_url] : []),
  };
}


export function mapTodo(row) {
  return {
    id: row.id,
    materialRequestId: row.material_request_id,
    quoteRequestId: row.quote_request_id,
    source: row.source,
    title: row.title,
    description: row.description ?? "",
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    part: row.part,
    assignee: row.assignee,
    assignedDate: row.assigned_date,
    dueDate: row.due_date,
    done: row.done,
    photoCount: row.photo_count,
    photoUrls: row.photo_urls ?? [],
    unitId: row.unit_id,
    assigneeId: row.assignee_id,
  };
}


export function mapQuoteRequest(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    constructionType: row.construction_type,
    contactPhone: row.contact_phone,
    note: row.note,
    photoCount: row.photo_count,
    photoUrls: row.photo_urls ?? [],
    engineer: row.engineer,
    requestedDate: row.requested_date,
    status: row.status,
    quoteIssuedDate: row.quote_issued_date,
    approvedDate: row.approved_date,
    suppliedDate: row.supplied_date,
    hasSupplyPhoto: row.has_supply_photo,
    supplyPhotoUrl: row.supply_photo_url,
    unitId: row.unit_id,
    requesterId: row.requester_id,
    supplyPhotoUrls: row.supply_photo_urls ?? (row.supply_photo_url ? [row.supply_photo_url] : []),
  };
}


export function mapBilling(row) {
  return {
    id: row.id,
    type: row.type,
    siteName: row.site_name,
    elevatorNo: row.elevator_no,
    part: row.part,
    cost: row.cost,
    replaceDate: row.replace_date,
    contactPhone: row.contact_phone,
    engineer: row.engineer,
    submittedAt: row.submitted_at,
    beforePhotoUrls: row.before_photo_urls ?? (row.before_photo_url ? [row.before_photo_url] : []),
    afterPhotoUrls: row.after_photo_urls ?? (row.after_photo_url ? [row.after_photo_url] : []),
    confirmPhotoUrl: row.confirm_photo_url,
    unitId: row.unit_id,
    engineerId: row.engineer_id,
    materialRequestId: row.material_request_id,
  };
}


export function mapRestockRequest(row) {
  return {
    id: row.id,
    engineer: row.engineer,
    part: row.part,
    siteName: row.site_name,
    requestedDate: row.requested_date,
    status: row.status,
    suppliedDate: row.supplied_date,
    hasSupplyPhoto: row.has_supply_photo,
    supplyPhotoUrl: row.supply_photo_url,
    supplyPhotoUrls: row.supply_photo_urls ?? (row.supply_photo_url ? [row.supply_photo_url] : []),
    engineerId: row.engineer_id,
  };
}


export function mapFeedPost(row) {
  return {
    id: row.id,
    author: row.author,
    time: new Date(row.created_at).toTimeString().slice(0, 5),
    text: row.body,
    authorId: row.author_id,
  };
}


// ---------- v2 신설 테이블 매퍼 ----------

export function mapUnit(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    seq: row.seq,
    unitNo: row.unit_no,
    unitType: row.unit_type,
    model: row.model,
    installDate: row.install_date,
    govNo: row.gov_no,
    isActive: row.is_active,
  };
}

export function mapSiteAssignment(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    techId: row.tech_id,
    isLead: row.is_lead,
  };
}

export function mapSelfCheck(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    ym: row.ym,
    assigneeId: row.assignee_id,
    plannedDate: row.planned_date,
    doneDate: row.done_date,
    status: row.status,
    photos: row.photos ?? [],
    notes: row.notes,
  };
}
