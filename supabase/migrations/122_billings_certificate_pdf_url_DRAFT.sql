-- 122_billings_certificate_pdf_url_DRAFT.sql
-- 교체확인서 PDF를 "교체확인서 보기"를 누를 때마다 매번 새로 그리면(폰트 임베딩이 커서)
-- 몇 초씩 걸린다. 최초 1회 생성한 PDF를 Storage에 올려두고 그 URL을 여기 저장해뒀다가,
-- 다음부터는 이미 만들어진 파일을 그대로 열기만 하면 되게 한다(견적서 PDF와 동일한 방식).
-- 담당자·가격·무상여부가 바뀌면 이 값을 다시 null로 비워 다음에 열 때 새로 만들어지게 한다.

alter table billings
  add column if not exists certificate_pdf_url text;
