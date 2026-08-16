
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
    officeNotes: row.office_notes, // 사무직 참고사항 — 관리자웹 전용, 마이그레이션 098 전이면 undefined
    govElevatorNos: row.gov_elevator_nos ?? [],
    managerId: row.manager_id,
    isActive: row.is_active,
    fax: row.fax,
    email: row.email,
    emergencyPhone: row.emergency_phone,
    contractDate: row.contract_date,
    contractEnd: row.contract_end,
    maintenanceCost: row.maintenance_cost,
    contractUrls: row.contract_urls ?? [],
    businessRegUrls: row.business_reg_urls ?? [],
    terminatedDate: row.terminated_date,
    terminationBasis: row.termination_basis,
    terminationReason: row.termination_reason,
    lat: row.lat,
    lng: row.lng,
    verifyLevel: row.verify_level,   // 엑셀 검증 상태 red|yellow|green (083, 없으면 undefined)
    verifiedAt: row.verified_at,     // 인증완료 시각
    verifyIssues: row.verify_issues, // 검증에서 잡힌 문제 목록 (084, 컬럼 없으면 undefined)
    accessInfo: row.access_info,     // 출입 정보(공동현관 비번·기계실 열쇠 위치) — 085
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
    reportedAt: row.reported_at,   // 표시용 "07/20 14:30" (연도 없음)
    createdAt: row.created_at,     // 집계용 실제 시각
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
    assignedAt: row.assigned_at,   // 배정 시각 — 출동 미응답(5분) 크론 판정용. 컬럼 없으면 undefined
    createdBy: row.created_by,
    reportNote: row.report_note,
    escalatedBy: row.escalated_by,
    escalatedById: row.escalated_by_id,
    escalatedAt: row.escalated_at,
    escalatedArrivalTime: row.escalated_arrival_time,
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
    dueTime: row.due_time,
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
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
  };
}


export function mapTodo(row) {
  return {
    id: row.id,
    materialRequestId: row.material_request_id,
    quoteRequestId: row.quote_request_id,
    selfCheckItemId: row.self_check_item_id,
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
    billingPart: row.billing_part,
    billingAmount: row.billing_amount,
    billingPartRows: row.billing_part_rows,
    reassignRequested: row.reassign_requested ?? false,
    reassignReason: row.reassign_reason,
    reassignTo: row.reassign_to,
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name,
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
    quoteItems: row.quote_items ?? [],
    transportCost: row.transport_cost,
    safetyCost: row.safety_cost,
    profit: row.profit,
    quoteNumber: row.quote_number,
    recipientName: row.recipient_name,
    quoteTitle: row.quote_title,
    quotePdfUrl: row.quote_pdf_url,
    discountAmount: row.discount_amount ?? 0,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    emailSentAt: row.email_sent_at,
    kakaoSentAt: row.kakao_sent_at,
    senderCcEmail: row.sender_cc_email,
    referenceEmail: row.reference_email,
    referencePhone: row.reference_phone,
    sendLog: row.send_log ?? [],
    noticeMessage: row.notice_message,
    attachmentUrls: row.attachment_urls ?? [],
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
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
    notes: row.notes,
    billingDate: row.billing_date,
    billingMethod: row.billing_method,
    isFree: row.is_free ?? false,
    signatureUrl: row.signature_url,
    approvalMethod: row.approval_method,
    approverName: row.approver_name,
    approverPhone: row.approver_phone,
    approvedAt: row.approved_at,
    partPhotos: row.part_photos,
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
    quantity: row.quantity ?? 1,
    receivedAt: row.received_at ?? null,
  };
}


export function mapKitStock(row) {
  return {
    id: row.id,
    engineerId: row.engineer_id,
    part: row.part,
    qty: row.qty,
  };
}


export function mapFeedPost(row) {
  return {
    id: row.id,
    author: row.author,
    time: new Date(row.created_at).toTimeString().slice(0, 5),
    createdAt: row.created_at, // 안읽음 비교용 원본 시각
    text: row.body,
    authorId: row.author_id,
    photoUrls: row.photo_urls ?? [],
    replyToId: row.reply_to_id,
    reactions: row.reactions ?? {},
    isNotice: row.is_notice,
  };
}


export function mapAttendance(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    workDate: row.work_date,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    status: row.status,
    lat: row.lat,
    lng: row.lng,
    outLat: row.out_lat,
    outLng: row.out_lng,
  };
}


export function mapDutySchedule(row) {
  return {
    id: row.id,
    dutyDate: row.duty_date,
    kind: row.kind, // 당직 | 숙직
    profileId: row.profile_id,
  };
}


export function mapDutySwap(row) {
  return {
    id: row.id,
    fromScheduleId: row.from_schedule_id,
    toScheduleId: row.to_schedule_id,
    requesterId: row.requester_id,
    targetId: row.target_id,
    status: row.status, // 대기 | 수락 | 거절 | 취소
    kind: row.kind ?? "교환", // 교환 | 넘기기 | 대신서기
    requesterSeen: row.requester_seen,
    targetSeen: row.target_seen,
    createdAt: row.created_at,
  };
}


// ---------- v2 신설 테이블 매퍼 ----------

export function mapUnit(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    seq: row.seq,
    unitNo: row.unit_no,
    contractType: row.contract_type, // 호기별 계약구분 — 마이그레이션 099 전이면 undefined
    model: row.model,
    installDate: row.install_date,
    govNo: row.gov_no,
    isActive: row.is_active,
    inspectionStart: row.inspection_start,
    inspectionEnd: row.inspection_end,
    inspectionResult: row.inspection_result,
    failItems: row.fail_items,
    failReason: row.fail_reason,
    failCheckedAt: row.fail_checked_at,
    priorFlaggedLabel: row.prior_flagged_label,
    priorFlaggedAnchorDate: row.prior_flagged_anchor_date,
    priorFlaggedCheckedAt: row.prior_flagged_checked_at,
    kind: row.kind,
    // 자체점검 자동생성 대상 여부 — 호이스트/주차기/턴테이블처럼 승강기 계약에 같이 딸려오지만
    // 법정 승강기가 아닌 설비는 여기를 꺼서 매달 출석부에 안 뜨게 한다. 마이그레이션 113 전이면
    // 컬럼이 없어 undefined인데, 기본값 true와 동일하게 취급한다.
    requiresSelfCheck: row.requires_self_check ?? true,
    form: row.form,
    manufacturer: row.manufacturer,
    installPlace: row.install_place,
    emergencyPhone: row.emergency_phone, // 호기별 비상통화장치 번호 (086)
    floors: row.floors,
    runSection: row.run_section,
    loadKg: row.load_kg,
    capacityPersons: row.capacity_persons,
    ratedSpeed: row.rated_speed,
    insurer: row.insurer,
    insuranceStart: row.insurance_start,
    insuranceEnd: row.insurance_end,
    maintenanceCost: row.maintenance_cost, // 호기별 보수료 — 마이그레이션 101 전이면 undefined
  };
}

export function mapErrorCode(row) {
  return {
    id: row.id,
    model: row.model,
    code: row.code,
    faultName: row.fault_name,
    meaning: row.meaning,
    standardAction: row.standard_action,
    createdAt: row.created_at,
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
    govCompanyUniqueNo: row.gov_company_unique_no,
    govSubmittedAt: row.gov_submitted_at,
    govResultCode: row.gov_result_code,
    govResultMsg: row.gov_result_msg,
  };
}

// 자체점검 항목별 결과 — 이번 달 점검 대상인데 기본값(양호 A)과 다르게 기록한 예외만 저장한다.
// 점검주기상 이번 달 대상이 아닌(D) 항목은 self_check_item_states로 계산하지 여기 저장하지 않는다.
export function mapSelfCheckItem(row) {
  return {
    id: row.id,
    selfCheckId: row.self_check_id,
    itemCd: row.item_cd,
    result: row.result,
    remark: row.remark,
  };
}

// 호기별 자체점검 항목의 점검주기 상태 — 마지막으로 실제 점검한 년월(주기 계산용),
// 이 호기에 해당 없음(E) 여부를 담는다.
export function mapSelfCheckItemState(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    itemCd: row.item_cd,
    applicable: row.applicable,
    lastDoneYm: row.last_done_ym,
  };
}

export function mapUnitPartPhoto(row) {
  return {
    id: row.id,
    unitId: row.unit_id,
    category: row.category,
    subcategory: row.subcategory,
    part: row.part,
    url: row.url,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export function mapInventoryProduct(row) {
  return {
    id: row.id,
    materialNo: row.material_no,
    name: row.name,
    photoUrls: row.photo_urls ?? [],
    spec: row.spec,
    memo: row.memo,
    location: row.location,
    vendor: row.vendor,
    priceDate: row.price_date,
    purchasePrice: row.purchase_price,
    salePrice: row.sale_price,
    active: row.active,
    createdAt: row.created_at,
  };
}

export function mapInventoryStockMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    type: row.type,
    qtyDelta: row.qty_delta,
    note: row.note,
    vendorText: row.vendor_text,
    siteText: row.site_text,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
