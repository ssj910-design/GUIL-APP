-- 073: 견적 발송 안내메시지/첨부파일 (2026-07-28)
-- 안내메시지는 이메일 본문에만 반영(카카오는 승인된 템플릿 고정 텍스트라 반영 못 함 —
-- docs/HANDOFF.md에 템플릿 재승인 대기 항목 있음). 첨부파일은 { name, url } 객체 배열.
alter table public.quote_requests add column if not exists notice_message text;
alter table public.quote_requests add column if not exists attachment_urls jsonb not null default '[]'::jsonb;

-- 검증
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_requests'
  and column_name in ('notice_message', 'attachment_urls')
order by column_name;
