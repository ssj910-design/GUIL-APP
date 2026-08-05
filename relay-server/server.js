// 알리고(Aligo) 카카오 알림톡 API는 발송 서버 IP 화이트리스트가 필수라
// Vercel(서버리스, 고정 IP 없음)에서 직접 호출할 수 없다. 이 서버는 고정 IP를
// 가진 호스트(오라클 클라우드 Always Free 등)에 올려서, Vercel이 이 서버를
// 거쳐 알리고를 호출하게 하는 중계용이다.
//
// 의도적으로 특정 클라우드에 종속된 코드/의존성이 없다 — 순수 Node.js만으로
// 동작해서 어떤 VPS로도 그대로 옮겨 돌릴 수 있다(README.md 참고).
//
// 보안: X-Relay-Secret 헤더가 RELAY_SECRET 환경변수와 정확히 일치할 때만
// 요청을 받아준다. 이 시크릿이 새어나가면 알리고 알림톡 발송에 남용될 수
// 있으니(다른 임의 주소로는 못 감 — 목적지가 알리고로 고정돼 있다) 노출되지
// 않게 관리할 것.
const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3001;
const RELAY_SECRET = process.env.RELAY_SECRET;
const ALIGO_HOST = "kakaoapi.aligo.in";
const ALIGO_PATH = "/akv10/alimtalk/send/";

if (!RELAY_SECRET) {
  console.error("RELAY_SECRET 환경변수가 없습니다 — 설정 후 다시 실행하세요.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/send") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (req.headers["x-relay-secret"] !== RELAY_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const proxyReq = https.request(
      {
        host: ALIGO_HOST,
        path: ALIGO_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": body.length,
        },
      },
      (aligoRes) => {
        const out = [];
        aligoRes.on("data", (c) => out.push(c));
        aligoRes.on("end", () => {
          res.writeHead(aligoRes.statusCode, { "Content-Type": "application/json" });
          res.end(Buffer.concat(out));
        });
      }
    );
    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "relay_fetch_failed", message: err.message }));
    });
    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => console.log(`알림톡 중계 서버 실행 중 :${PORT}`));
