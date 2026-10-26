# 구일엘리베이터 홈페이지

이 폴더만 별도 Vercel 프로젝트 guil-app-homepage의 Root Directory로 지정합니다.
기존 Next.js 현장관리 앱의 파일·API·DB·Android·배포 설정은 사용하거나 수정하지 않습니다.

## 실행 및 배포

- 정적 HTML/CSS/JS이며 설치·빌드가 필요 없습니다.
- 로컬: 이 폴더에서 python3 -m http.server 4173
- Vercel: Framework Other, Root Directory homepage, Install/Build Command 비움, Output Directory .
- homepage 변경을 main에 push하면 홈페이지 프로젝트의 Git 연동으로 반영됩니다.
- 기존 앱 배포를 트리거하는 문자열은 커밋에 넣지 않습니다.
- guil.kr → www.guil.kr, 대표 주소 https://www.guil.kr

## 구현 범위

- 건축 이미지의 느린 이동/확대와 3개 문구 전환을 이용한 모션 KV. 동영상 파일은 아닙니다.
- 장면 선택·일시정지, 모바일 메뉴, 서비스 상세 dialog, FAQ, 전화·이메일·지도 링크.
- 실제 문의 전송 폼, 게시판 CMS, 관리자 기능은 없습니다. 이메일 링크는 방문자의 메일 앱을 엽니다.
- 실적·연혁·인증서 자료가 없어 수치나 가상의 고객 실적을 넣지 않았습니다.
- 회사 연락처·법인 정보는 기존 lib/company.js와 app/company/page.js 기준.
- /privacy는 privacy.html로 이동. 기존 앱 개인정보처리방침 본문을 유지하고 홈페이지 이용 안내를 추가했습니다.
- /company는 홈페이지 첫 화면으로 이동. Google 사이트 확인 메타 유지.
- Google Fonts를 쓰며 다운로드 실패 시 시스템 글꼴로 표시됩니다.

## 레퍼런스와 이미지

구성: https://www.yuil-e.co.kr/
영상 분위기: https://www.youtube.com/watch?v=deehk5Oz7Nw 및 https://www.youtube.com/watch?v=wk0j1wkUsCw
레퍼런스 영상 자체를 다운로드하거나 홈페이지에 재사용하지 않았습니다.

assets/architecture.jpg는 built-in image_gen으로 만든 브랜드용 이미지이며 실제 시공 현장 사진이 아닙니다.
최종 생성 프롬프트: Premium photoreal architectural advertising photograph, wide 16:9, low angle looking up between modern glass and brushed stainless steel skyscrapers in Seoul at blue hour. Strong vertical vanishing lines and illuminated warm white strips suggesting elevator shafts. Midnight teal and slate blue glass, silver reflections, warm amber window light. Architecture on the right, dark negative space on the left for HTML typography. Restrained cinematic contrast, subtle atmospheric haze. No people, text, logos or watermarks.

## 확인

PC/390px 모바일 레이아웃, 모바일 메뉴, 서비스 dialog, FAQ, JS 구문, 로컬 링크·파일 존재 확인.
기존 앱 npm run build는 실제 서비스에 연결되지 않는 임시 환경값으로 통과했습니다.
