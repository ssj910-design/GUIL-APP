// 교체확인서 입력값 지문 — 저장해둔 PDF가 "지금 내용"으로 만든 것인지 가리는 데 쓴다.
// 예전엔 billings.certificate_pdf_url이 비어있지 않으면 무조건 최신으로 믿었는데, 다른 창에서
// 옛 데이터로 뷰어를 열어 다시 만든 PDF가 그 URL을 덮어쓰면(수정 직후 저장 캐시 비우기를
// 무력화) 고친 사진·금액이 확인서에 안 나왔다. 지문이 경로에 박혀 있으면 어떤 경로로 캐시가
// 남았든, 지금 내용과 지문이 다르면 뷰어가 다시 만든다.
// issuedDate(발급일)는 날마다 바뀌어 내용이 같아도 지문이 달라지므로 뺀다.
export function certFingerprint(cert) {
  // eslint-disable-next-line no-unused-vars
  const { issuedDate, ...rest } = cert ?? {};
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
