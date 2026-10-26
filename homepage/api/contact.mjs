import nodemailer from 'nodemailer';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
const recipient = 'guil2020@naver.com';
const allowedOrigins = new Set(['https://www.guil.kr','https://guil.kr','https://guil-app-homepage.vercel.app']);
const attempts = new Map();
const windowMs = 10 * 60 * 1000;
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const configured = () => Boolean(process.env.NAVER_SMTP_USER && process.env.NAVER_SMTP_APP_PASSWORD);
function signature(payload) { return createHmac('sha256', process.env.CONTACT_FORM_SECRET || process.env.NAVER_SMTP_APP_PASSWORD || '').update(`guil-contact:${payload}`).digest('hex'); }
export function issueToken(now=Date.now()) { const payload = `${now}.${randomBytes(12).toString('hex')}`; return `${payload}.${signature(payload)}`; }
export function validToken(token, now=Date.now()) {
  if (typeof token !== 'string' || token.length > 160) return false;
  const [timestamp, nonce, sig, extra] = token.split('.');
  if (extra || !/^\d{13}$/.test(timestamp || '') || !/^[a-f0-9]{24}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return false;
  const age = now - Number(timestamp);
  if (age < 2500 || age > 60 * 60 * 1000) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(`${timestamp}.${nonce}`)));
}
export function validateForm(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const clean = (key, max) => typeof data[key] === 'string' && data[key].trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(data[key]) ? data[key].trim() : '';
  const name = clean('name',60), phone = clean('phone',30), email = clean('email',180), building = clean('building',150), message = clean('message',3000), service = clean('service',30);
  if (!name || /[\r\n]/.test(name+phone+email+building) || !/^[0-9+()\s-]{8,30}$/.test(phone) || phone.replace(/\D/g,'').length < 8 || (email && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[,;:\"()\[\]\\]/.test(email))) || !message || !['유지관리','보수공사','설치공사','기타'].includes(service) || data.consent !== true) return null;
  return {name,phone,email,building,message,service};
}
function allowed(request) { return allowedOrigins.has(request.headers.get('origin')); }
export async function GET(request) {
  if (!configured()) return json({available:false});
  return json({available:true, token:issueToken()});
}
export async function POST(request) {
  if (!allowed(request)) return json({error:'허용되지 않은 요청입니다.'},403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({error:'요청 형식을 확인해 주세요.'},415);
  if (Number(request.headers.get('content-length') || 0) > 16000) return json({error:'문의 내용이 너무 깁니다.'},413);
  let data;
  try { const raw = await request.text(); if (Buffer.byteLength(raw)>16000) return json({error:'문의 내용이 너무 깁니다.'},413); data=JSON.parse(raw); } catch { return json({error:'입력 내용을 확인해 주세요.'},400); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({error:'입력 내용을 확인해 주세요.'},400);
  if (data.website) return json({error:'요청을 확인할 수 없습니다.'},400);
  if (!configured()) return json({error:'온라인 접수를 준비 중입니다. 전화 02-588-2384 또는 이메일 guil2020@naver.com으로 문의해 주세요.'},503);
  if (!validToken(data.token)) return json({error:'접수 화면을 새로고침한 뒤 다시 시도해 주세요.'},400);
  const form=validateForm(data);
  if (!form) return json({error:'필수 항목과 개인정보 수집·이용 동의를 확인해 주세요.'},400);
  const now=Date.now();
  for (const [key, value] of attempts) if (now-value.started>windowMs) attempts.delete(key);
  if (attempts.size>2000) attempts.delete(attempts.keys().next().value);
  const ip=request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const entry=attempts.get(ip) || {started:now,count:0};
  if (entry.count>=3) return json({error:'잠시 후 다시 문의해 주세요. 전화 상담도 가능합니다.'},429);
  entry.count++; attempts.set(ip,entry);
  const transport=nodemailer.createTransport({host:'smtp.naver.com',port:465,secure:true,auth:{user:process.env.NAVER_SMTP_USER,pass:process.env.NAVER_SMTP_APP_PASSWORD},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,disableFileAccess:true,disableUrlAccess:true});
  try {
    const info=await transport.sendMail({from:{name:'구일엘리베이터 홈페이지',address:process.env.NAVER_SMTP_USER},to:recipient,...(form.email?{replyTo:form.email}:{}),subject:'[구일 홈페이지] 새로운 상담신청',text:`홈페이지 상담신청\n\n성함: ${form.name}\n연락처: ${form.phone}\n이메일: ${form.email || '미입력'}\n문의분야: ${form.service}\n건물명/주소: ${form.building || '미입력'}\n\n문의내용\n${form.message}\n\n개인정보 수집·이용 동의: 확인\n접수시각: ${new Date().toISOString()}`});
    if (!info.accepted?.length) throw new Error('mail_not_accepted');
    return json({ok:true});
  } catch (error) { console.error('contact_mail_failed', typeof error.code==='string' ? error.code : 'send_failed'); return json({error:'메일을 전송하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요.'},502); }
  finally { transport.close(); }
}
