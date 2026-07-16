import { useEffect } from "react";


export const RESULT_LABEL = { pass: "합격", conditional: "조건부합격", fail: "불합격" };


export const TODAY_STR = "2026-07-10";


export const FAULT_TYPES = ["갇힘사고", "운행정지", "문닫힘 이상", "소음/진동", "기타"];

export const KIT_PARTS = ["도어 롤러", "리미트 스위치", "인터폰 배터리", "비상통화장치 배터리", "컨트롤러 퓨즈", "브레이크 패드", "기타"];


// 자재 신청, 할일 관련 안내:
// m1은 아직 '승인대기'(관리자가 지급완료 처리 전), m2는 이미 지급완료되어
// 할일이 생성된 상태를 시연하기 위한 샘플입니다 — 이제 이 데이터들은 이
// 파일이 아니라 Supabase의 failures / inspections / material_requests /
// todos 테이블에서 불러옵니다 (App 컴포넌트의 useEffect 참고).

// 견적요청 진행 단계: 요청접수 → 견적발행 → 승인 → 자재지급완료(할일 자동생성)
export const QUOTE_STAGES = ["요청접수", "견적발행", "승인", "자재지급완료"];
