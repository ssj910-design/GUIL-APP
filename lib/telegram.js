// lib/telegram.js
// 텔레그램 Bot API 얇은 래퍼 — SDK 없이 REST 그대로 호출한다(공식 SDK 없는 플랫폼).
const API_BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function callTelegram(method, body, { multipart } = {}) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    ...(multipart
      ? { body }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(`텔레그램 ${method} 실패: ${json?.description || res.status}`);
  return json.result;
}

export async function sendTelegramMessage({ chatId, text, replyMarkup }) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

export async function sendTelegramDocument({ chatId, buffer, filename, caption, replyMarkup }) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption);
  if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
  form.set("document", new Blob([buffer], { type: "application/pdf" }), filename);
  return callTelegram("sendDocument", form, { multipart: true });
}

export async function answerTelegramCallback({ callbackQueryId, text }) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}
