# 알림톡 중계 서버

알리고(Aligo) 카카오 알림톡 API는 발송 서버 IP를 화이트리스트에 등록해야만 호출을 받아준다.
Vercel은 서버리스라 고정 IP가 없어서 직접 호출이 막힌다 — 그래서 고정 IP를 가진 별도
서버(오라클 클라우드 Always Free 등) 위에 이 작은 중계 서버를 올려두고, Vercel은 알리고
대신 이 서버를 호출하게 한다.

`server.js`는 순수 Node.js만 쓰고 외부 패키지 의존성이 전혀 없다 — 어떤 VPS로 옮기든
`node server.js`만 실행하면 그대로 동작한다(오라클이 마음에 안 들면 다른 곳으로 그대로
이사 가능, 아래 "다른 서버로 옮기기" 참고).

## 1. 오라클 클라우드 Always Free 인스턴스 만들기

1. [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) 에서 가입 (카드 등록 필요하지만
   Always Free 범위 안에서는 과금되지 않는다)
2. 콘솔 로그인 → **Compute → Instances → Create Instance**
3. Image: **Ubuntu** (최신 LTS), Shape: **Always Free** 라벨이 붙은 것 선택
   (VM.Standard.E2.1.Micro 또는 Ampere A1 중 Always Free 표시된 것)
4. SSH 키는 생성 화면에서 자동으로 만들어주는 걸 선택하고, 개인키 파일(.key)을 다운로드해서
   잘 보관 — 나중에 접속할 때 필요하다
5. 생성 완료되면 인스턴스 상세 페이지에서 **Public IP Address**를 확인 — 이게 알리고에
   등록할 고정 IP다

## 2. 방화벽 열기 (오라클은 기본적으로 포트가 다 막혀 있다)

콘솔에서: 인스턴스 상세 → **Virtual Cloud Network** 클릭 → **Security Lists** →
Default Security List → **Add Ingress Rules**:
- Source CIDR: `0.0.0.0/0`
- Destination Port Range: `3001`
- Protocol: TCP

## 3. 서버에 접속해서 파일 올리기

로컬 터미널에서 (다운로드한 키 파일 경로, 인스턴스 Public IP로 바꿔서):

```bash
ssh -i /path/to/your-key.key ubuntu@<인스턴스_PUBLIC_IP>
```

접속되면 서버 안에서:

```bash
# Node.js 설치 (Ubuntu 기본 저장소 버전이면 충분)
sudo apt update && sudo apt install -y nodejs npm

# 서버가 재부팅돼도 자동으로 다시 실행되게 pm2 설치
sudo npm install -g pm2

mkdir -p ~/alimtalk-relay
```

그다음 로컬 컴퓨터에서 `relay-server/server.js`를 서버로 복사 (새 터미널에서):

```bash
scp -i /path/to/your-key.key relay-server/server.js ubuntu@<인스턴스_PUBLIC_IP>:~/alimtalk-relay/
```

## 4. 서버 실행

다시 SSH 접속한 터미널에서:

```bash
cd ~/alimtalk-relay
export RELAY_SECRET="<시크릿 — openssl rand -hex 32 로 새로 생성해서 양쪽에 동일하게 (저장소에 적지 말 것)>"
pm2 start server.js --name alimtalk-relay
pm2 save
pm2 startup   # 화면에 나오는 명령어를 그대로 한 번 더 복붙 실행 (재부팅 시 자동시작 등록)
```

`RELAY_SECRET`은 Vercel 쪽 `ALIMTALK_RELAY_SECRET` 환경변수와 **정확히 같은 값**이어야 한다.
매번 접속할 때마다 `export`하기 번거로우면 pm2에 환경변수로 등록해도 된다:

```bash
pm2 start server.js --name alimtalk-relay --env RELAY_SECRET=<시크릿 — openssl rand -hex 32 로 새로 생성해서 양쪽에 동일하게 (저장소에 적지 말 것)>
```

## 5. 방화벽(우분투 자체) 확인

```bash
sudo ufw allow 3001/tcp
sudo ufw status
```

(ufw가 비활성 상태면 이 단계는 안 해도 된다 — `sudo ufw status`로 확인)

## 6. 동작 확인

로컬 컴퓨터에서:

```bash
curl -X POST http://<인스턴스_PUBLIC_IP>:3001/send \
  -H "X-Relay-Secret: <시크릿 — openssl rand -hex 32 로 새로 생성해서 양쪽에 동일하게 (저장소에 적지 말 것)>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "test=1"
```

`{"error":...}` 형태든 알리고의 실제 에러 응답이든 뭔가 JSON이 돌아오면 중계서버 자체는
정상 동작하는 것이다(진짜 알림톡 발송 테스트는 Vercel 환경변수까지 다 설정한 뒤에 한다).

## 7. 알리고에 이 IP 등록

알리고 관리자 페이지 → 신청/인증 → 발송 서버 IP → 인스턴스의 Public IP 추가.

## 8. Vercel 환경변수 추가

- `ALIMTALK_RELAY_URL` = `http://<인스턴스_PUBLIC_IP>:3001`
- `ALIMTALK_RELAY_SECRET` = `<시크릿 — openssl rand -hex 32 로 새로 생성해서 양쪽에 동일하게 (저장소에 적지 말 것)>`

두 값 다 Production 환경에 추가하고 재배포.

---

## 다른 서버로 옮기기

나중에 오라클을 그만 쓰고 싶어지면:
1. 새 서버(VPS 등)에 위 1~6번을 그대로 반복 (서버 코드가 똑같으니 그대로 복사만 하면 됨)
2. 알리고에 등록된 IP를 새 서버 IP로 교체
3. Vercel의 `ALIMTALK_RELAY_URL`을 새 서버 주소로 변경 후 재배포

코드 수정은 전혀 필요 없다.
