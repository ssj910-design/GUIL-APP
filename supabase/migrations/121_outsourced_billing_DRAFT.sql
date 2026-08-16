-- 121_outsourced_billing_DRAFT.sql
-- 견적 연동 시공을 외주업체에 맡기는 경우를 지원한다. 담당자(assignee/engineer)는
-- 기존처럼 실제 로그인해서 청구를 대신 처리할 관리자/자재담당자로 두고, 실제 작업한
-- 업체명은 별도 컬럼(vendor_name)에 남긴다 — 기사 실적(engineer) 집계와 섞이지 않도록.
-- todos: 견적 지급완료(출하) 단계에서 표시. billings: 최종 청구 기록에 남겨 부품교체·공사
-- 내역 목록에서 "작업자" 대신 업체명이 보이게 한다.

alter table todos
  add column if not exists is_outsourced boolean,
  add column if not exists vendor_name text;

alter table billings
  add column if not exists is_outsourced boolean,
  add column if not exists vendor_name text;
