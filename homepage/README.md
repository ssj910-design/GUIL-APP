# 구일엘리베이터 홈페이지

홈페이지 전용 폴더이며 기존 현장관리 앱의 파일·API·DB·배포 설정을 수정하지 않습니다.

## 설치·빌드·배포

- npm ci → npm run build. 화면 파일과 assets만 public/에 복사합니다.
- Vercel 프로젝트: guil-app-homepage. Root Directory: homepage.
- Framework: Other. Install Command: npm ci. Build Command: npm run build. Output Directory: public.
- 위 설정은 vercel.json에 명시했습니다. main push로 홈페이지만 갱신하며 앱 운영 배포 표시는 넣지 않습니다.
- 로컬 정적 화면: npm run build 후 python3 -m http.server 4173 --directory public.
- 상담 기능 로컬 실행: Vercel 개발 서버 이용. 단위 테스트: npm test.

## 구현

KV 슬라이드와 사진 이동 제거. 한 장면만 유지하며 전용 MP4는 아직 제작하지 않았습니다.
site.js의 videoSource에 최종 영상 경로를 지정하면 muted/playsinline/loop로 재생합니다.
자동재생 실패 또는 움직임 줄이기 설정 시 정지 이미지를 표시합니다.

앱 로고는 흰 배경이 없는 기존 public/guil-icon.png를 assets/guil-mark.png로 그대로 복사했습니다. 한글 회사명만 표시합니다. 본문·메뉴·버튼·보조 문구는 16px 이상을 기본으로 사용합니다. KV 격자선과 전화번호 옆 화살표는 제거했습니다.
관리 대상은 건물 이미지로, 유지관리 모형 애니메이션은 점검 이미지로 교체했습니다.
연락처 아이콘, 플로팅 전화·이메일·상담신청 링크, 상담 폼을 추가했습니다.
임직원 앱 이동 링크는 제거했습니다. 서비스 상세, FAQ, 지도 링크를 유지합니다.

## 상담 메일 활성화

친구분 Vercel의 guil-app-homepage → Settings → Environment Variables → Production에 등록:

- NAVER_SMTP_USER: 기존 앱에서 사용하는 네이버 발신 계정 이메일
- NAVER_SMTP_APP_PASSWORD: 해당 계정의 SMTP용 앱 비밀번호
- CONTACT_FORM_SECRET: 선택. 별도 임의 문자열을 등록하면 폼 토큰 서명에 사용합니다.

값은 채팅이나 저장소에 넣지 않습니다. 기존 앱 설정은 그대로 두고 홈페이지 프로젝트에만 등록합니다.
등록 후 홈페이지 프로젝트를 재배포합니다. /api/contact의 available이 true면 전송 설정이 준비된 상태입니다.
최종 수신은 구일 메일함에서 확인해야 합니다. 실제 메일 전송 테스트는 아직 하지 않았습니다.

메일 수신처는 guil2020@naver.com으로 서버에 고정했습니다. 사용자 입력으로 수신처를 바꿀 수 없습니다.
입력 검증·동의 확인·honeypot·서명 토큰·Origin 검사·전송 오류 처리·요청 제한을 적용했습니다.
설정 미완료 또는 전송 실패 시 접수 완료로 표시하지 않으며 입력 내용을 유지합니다.
요청 제한은 함수 인스턴스 메모리 기준이며 분산 환경 전체의 강한 제한은 아닙니다.
트래픽이 늘면 Vercel 방화벽에서 /api/contact의 요청 제한을 추가하는 것이 좋습니다.
SMTP 비밀번호와 다른 별도 토큰 서명값은 선택사항이며, 미설정 시 서버 내부에서 SMTP 비밀번호로 서명합니다.
서버 코드·node_modules·설정 파일은 정적 public 출력에 포함하지 않습니다.

## 콘텐츠와 이미지

회사 정보는 기존 lib/company.js 및 app/company/page.js 기준입니다. 실제 실적·인증·관리 대수는 꾸며 넣지 않았습니다.
기존 Google 사이트 확인 메타와 앱 개인정보처리방침 본문을 유지했습니다.
/회사소개 경로 /company는 /로, /privacy는 privacy.html로 연결됩니다.
상담 폼에 맞춰 개인정보 수집·이용 안내를 추가했습니다.
구성 참고: https://www.yuil-e.co.kr/
영상 분위기 참고: https://www.youtube.com/watch?v=deehk5Oz7Nw 및 https://www.youtube.com/watch?v=wk0j1wkUsCw
참고 영상 자체를 다운로드하거나 재사용하지 않았습니다.

모든 새 사진은 built-in image_gen으로 생성한 브랜드 이미지이며 실제 현장/직원 사진이 아닙니다.
생성 프롬프트:
- architecture.jpg: Premium photoreal architectural advertising photograph, wide 16:9, low angle modern Seoul glass and stainless steel skyscrapers at blue hour, strong vertical vanishing lines, midnight teal and silver, warm illuminated strips, dark left negative space, no text/logos/people/watermarks.
- residential.jpg: Photoreal architectural photography of a contemporary Korean apartment complex, elegant residential towers, landscaped trees and a calm pedestrian forecourt, clean pale stone and glass, natural morning light. Landscape 4:3. Realistic not futuristic. No text, logos, watermarks, signs, people. Premium quiet corporate editorial aesthetic.
- office.jpg: Photoreal architectural photography of a modern Seoul office tower, glass and silver facade seen from ground level, refined geometric vertical lines, landscaped entrance, natural daylight, understated corporate editorial aesthetic. Landscape 4:3. No text, logos, watermarks, people.
- commercial.jpg: Photoreal architectural photography of a contemporary Korean commercial building and shopping entrance, warm interior lights visible through floor to ceiling glass, modern stone cladding, welcoming pedestrian frontage, twilight blue hour. Landscape 4:3. No signs, text, logos, watermarks or people.
- maintenance.jpg: Photoreal cinematic commercial photograph, tight closeup of a professional elevator maintenance technician in dark navy workwear checking a clean brushed stainless steel elevator control cabinet using a handheld diagnostic device, only torso and gloved hands visible, warm focused work light, accurate believable wiring in background, careful professional gesture, premium dark teal and silver palette. Landscape 4:3. No logos, text, sparks, dramatic hazards, watermarks. This is a brand conceptual image, not a real company's employee portrait.

## 2026-10-26 색상·B2B 문구·SEO 보완

앱의 blue-950/blue-700 사용을 확인하고 홈페이지를 남색·파랑 계열로 맞췄습니다.
KV는 건물주·관리자를 대상으로 승강기 유지관리·보수·설치공사를 설명하며,
아래로 내려보기와 서비스 살펴보기 링크는 제거했습니다.
검색 제목/설명, 대표주소, 공유 메타데이터, Organization/WebSite/WebPage/Service 구조화 데이터를 보완했습니다.
robots.txt, noindex 부재, guil.kr → www.guil.kr 영구 이동, 사이트맵의 XML 응답을 확인했습니다.
원페이지 구성은 유지했습니다. 서비스별 고유 페이지 및 실제 실적 콘텐츠는 별도 작업입니다.
Google Search Console 및 네이버 서치어드바이저의 소유권/색인 상태는 계정 접근 권한이 없어 확인하지 않았습니다.
검색 노출이나 상위 순위를 보장하는 설정은 아닙니다.

## 2026-10-29 홍보물 기반 개편

- 회사소개 about.html: 서울·경기 전역 2,123대, 노출 시 카운팅. 숫자는 사용자 제공 현황이며 DB에서 실시간 집계하지 않습니다.
- 유지관리 maintenance.html: 24시간 고장 대응, 자체 개발 고장관리 시스템의 접수→기사배정→출동→조치→이력관리 흐름.
- 사업분야 services.html, 전면교체 replacement.html, 리모델링 remodeling.html, 안전장치 safety.html, 신규설치 installation.html 추가.
- 메인 사업분야 링크는 모달 대신 실제 상세 페이지로 연결합니다.
- 홈과 상세 페이지의 제목·설명·대표주소·BreadcrumbList/Service 구조화 데이터, 사이트맵 갱신.
- /company는 /about.html로 연결합니다. 기존 회사 대표자 표기는 사용자 요청대로 유지합니다.
- KV는 원본 건축 이미지를 움직이지 않고 두 개의 작은 빛 형상을 원근 방향으로 상승시키는 SVG 효과입니다. 현대엘리베이터 영상은 재사용하지 않았습니다.
- 일시정지, 탭 비활성/화면 밖 자동 정지, 움직임 줄이기 지원. 카운터도 움직임 줄이기/JS 미사용 시 최종값을 표시합니다.

참고 자료: 사용자 제공 ‘개정법적용대상 홍보물.pdf’, ‘신규설치대상 홍보물.pdf’.
홍보물 원본은 대표자·연락처 표기가 홈페이지와 달라 공개 다운로드로 올리지 않았습니다.
전면교체·리모델링·안전장치 설치의 선택지와 직영관리·책임 점검자·인증부품 내용을 참고했습니다.
일괄 적용 법령 문구, 고정 가격, 일괄 30분 도착, 리모델링과 전면교체의 수명 동일 보장은 게시하지 않았습니다.
검사 안내는 한국승강기안전공단 공식 자료와 대조했습니다:
https://cyber.koelsa.or.kr/portal/contents.do?mId=0101000000
