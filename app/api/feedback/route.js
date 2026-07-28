// 앱 피드백/건의 발송 — 마이페이지에서 보낸 내용을 운영자 메일로 보낸다.
// 견적 이메일과 같은 네이버 SMTP(회사 계정)를 재사용한다. SMTP 미설정(로컬)이면 조용히 안내만 반환.
import nodemailer from "nodemailer";

const FEEDBACK_TO = process.env.FEEDBACK_TO || "non.expert.cha.ssi@gmail.com";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const message = (body?.message ?? "").toString().trim();
  if (!message) return Response.json({ ok: false, reason: "내용을 입력해주세요" }, { status: 200 });

  const user = process.env.NAVER_SMTP_USER;
  const pass = process.env.NAVER_SMTP_APP_PASSWORD;
  if (!user || !pass) return Response.json({ ok: false, reason: "메일 설정이 없어 발송할 수 없습니다(SMTP 미설정)" }, { status: 200 });

  const name = (body?.name ?? "익명").toString().slice(0, 40);
  const role = (body?.role ?? "").toString().slice(0, 20);
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.naver.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"현장관리 앱 피드백" <${user}>`,
      to: FEEDBACK_TO,
      subject: `[앱 피드백] ${name}${role ? ` (${role})` : ""}`,
      text: `보낸 사람: ${name}${role ? ` · ${role}` : ""}\n보낸 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n\n${message}`,
    });
    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    return Response.json({ ok: false, reason: err.message }, { status: 200 });
  }
}
