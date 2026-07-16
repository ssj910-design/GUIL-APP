# Supabase 작업 규칙

- **실운영 DB** (RLS 꺼짐, anon key로 전 테이블 읽기·쓰기 가능) — 파괴적 작업 금지.
- 마이그레이션 도구 없음: DDL은 Supabase 대시보드 SQL Editor에서 직접 실행하고,
  실행한 SQL은 migrations/에 파일로 남긴다.
- **v2 스키마 전환 진행 중** — 절차·검증·리허설 결과는 MIGRATION.md.
  `007_cleanup_LATER.sql`은 앱 전환·검증 전 실행 금지 (파일명이 경고).
- 스키마의 현재 진실은 문서가 아니라 실DB다 — 컬럼이 의심되면 REST로 1행 조회해 확인:
  `GET {SUPABASE_URL}/rest/v1/{table}?limit=1` (apikey 헤더 = anon key).
