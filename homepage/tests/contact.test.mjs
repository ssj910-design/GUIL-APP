import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {GET,POST,validateForm,issueToken,validToken} from '../api/contact.mjs';
const fixture={name:'상담 테스트',phone:'02-588-2384',email:'visitor@example.com',building:'테스트 건물',service:'유지관리',message:'점검 상담을 요청합니다.',consent:true};
const request=(data,origin='https://www.guil.kr',ip='test')=>new Request('https://www.guil.kr/api/contact',{method:'POST',headers:{origin,'content-type':'application/json','x-real-ip':ip},body:JSON.stringify(data)});
test('validates inquiry and rejects missing consent, bad email, header injection and oversize content',()=>{
 assert.ok(validateForm(fixture));
 for(const changes of [{consent:false},{name:'A\r\nB'},{email:'a@example.com,other@example.com'},{phone:'bad'},{message:'a'.repeat(3001)},{service:'unknown'}]) assert.equal(validateForm({...fixture,...changes}),null);
});
test('signed token rejects immediate, expired and tampered submissions',()=>{
 process.env.CONTACT_FORM_SECRET='local-test-secret';
 const now=Date.now(),token=issueToken(now-5000);
 assert.equal(validToken(token,now),true);
 assert.equal(validToken(issueToken(now),now),false);
 assert.equal(validToken(token,now+3600000),false);
 assert.equal(validToken(token.slice(0,-1)+(token.endsWith('a')?'b':'a'),now),false);
});
test('unconfigured form does not claim a successful delivery',async()=>{
 delete process.env.NAVER_SMTP_USER;delete process.env.NAVER_SMTP_APP_PASSWORD;
 assert.deepEqual(await (await GET()).json(),{available:false});
 const response=await POST(request(fixture));assert.equal(response.status,503);assert.equal((await response.json()).ok,undefined);
});
test('mail endpoint rejects third-party origin and honeypot',async()=>{
 assert.equal((await POST(request(fixture,'https://attacker.example'))).status,403);
 assert.equal((await POST(request({...fixture,website:'bot'}))).status,400);
});
test('sends only to the company inbox, reports SMTP failure honestly and limits repeated requests',async t=>{
 process.env.NAVER_SMTP_USER='sender@example.com';process.env.NAVER_SMTP_APP_PASSWORD='local-test-only';
 let sent,fail=false;
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async mail=>{sent=mail;if(fail)throw Object.assign(new Error('private mail details'),{code:'ETIMEDOUT'});return {accepted:['guil2020@naver.com']};},close(){}}));
 const payload={...fixture,to:'attacker@example.com',token:issueToken(Date.now()-5000)};
 let response=await POST(request(payload));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(sent.to,'guil2020@naver.com');assert.equal(sent.replyTo,fixture.email);assert.ok(sent.text.includes(fixture.message));
 fail=true;response=await POST(request(payload));assert.equal(response.status,502);assert.equal(JSON.stringify(await response.json()).includes('private mail details'),false);
 fail=false;assert.equal((await POST(request(payload))).status,200);assert.equal((await POST(request(payload))).status,429);
 delete process.env.NAVER_SMTP_USER;delete process.env.NAVER_SMTP_APP_PASSWORD;delete process.env.CONTACT_FORM_SECRET;
});
