# 구일엘리베이터 홈페이지

GUIL-APP 저장소 안에서 별도로 배포하는 회사 홈페이지입니다.
현재 화면은 배포 연결을 확인하기 위한 준비 화면이며, 최종 디자인은 아닙니다.

## 분리 원칙

- 기존 앱: 저장소 루트의 Next.js 앱. 기존 Vercel 프로젝트와 설정 유지.
- 새 홈페이지: 이 homepage 폴더. HTML/CSS 기반이며 별도 설치·빌드 및 환경변수가 필요 없습니다.
- 앱의 로그인, API, DB, Android, 루트 package.json 및 vercel.json은 수정하지 않습니다.
- 폴더 안에 독립 vercel.json을 두므로 앱의 cron과 배포 생략 명령을 복사하지 않습니다.

## 친구분 Vercel에서 새 프로젝트 연결

1. 기존 앱이 있는 Vercel 팀을 선택하고 Add New → Project를 누릅니다.
2. 기존 앱 프로젝트의 설정을 바꾸지 말고, ssj910-design/GUIL-APP 저장소로 새 프로젝트를 만듭니다.
3. Project Name: guil-homepage.
4. Root Directory: homepage.
5. Framework Preset: Other.
6. Install Command와 Build Command는 빈 값으로 설정합니다. 기존 앱 명령을 입력하지 않습니다.
7. Output Directory: . (현재 폴더).
8. 환경변수는 추가하지 않습니다. 앱의 비밀키를 복사하지 않습니다.
9. Ignored Build Step이 루트의 명령으로 설정되어 있지 않은지 확인합니다.
10. Production Branch는 홈페이지 변경이 합쳐진 main으로 설정합니다.
11. Deploy 후 생성된 vercel.app 주소에서 준비 화면을 확인합니다.

이 브랜치의 PR은 홈페이지 준비용입니다. 운영 앱 배포를 요청하는 [deploy] 커밋을 만들지 않습니다.

## guil.kr 도메인은 완성 후 전환

현재 next.config.mjs에는 guil.kr과 www.guil.kr의 /를 /company로 보내는
설정이 있습니다. 실제 Vercel 도메인 연결 상태는 별도로 확인해야 합니다.
준비 단계에서는 DNS, 기존 프로젝트의 도메인, rewrite를 변경하지 않습니다.

홈페이지 완성 후:
1. 새 Vercel 주소에서 PC·모바일, 연락처, 모든 링크를 확인합니다.
2. index.html의 robots noindex 메타와 vercel.json의 X-Robots-Tag를 제거합니다.
3. 기존 Google 사이트 확인 메타는 유지합니다.
4. /privacy 등 기존 공개 URL과 앱 링크를 확인하고, 필요한 공개 문서를 새 홈페이지에도 준비합니다.
5. 친구분이 guil.kr 및 www.guil.kr을 새 프로젝트에 연결합니다.
6. Vercel이 안내하는 실제 DNS 값을 도메인 관리 사이트에 적용합니다.
7. HTTPS, 대표 주소 전환, 기존 앱 주소 및 Google 사이트 인증을 확인합니다.

## 로컬 확인

이 폴더에서 Python이 있으면 python3 -m http.server 4173 으로 확인할 수 있습니다.
현재는 준비용 한 페이지이며 게시판·문의 폼·관리자 기능은 구현하지 않았습니다.
