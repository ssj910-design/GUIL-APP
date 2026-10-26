'use strict';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero');
const header = document.querySelector('.header');
const nav = document.querySelector('#nav');
const menu = document.querySelector('.menu-toggle');
// One continuous KV; set a produced MP4 path when the final film is ready.
const heroVideo = document.querySelector('#hero-video');
const videoSource = null;
if (videoSource && !reducedMotion.matches) {
  heroVideo.src = videoSource;
  heroVideo.hidden = false;
  heroVideo.addEventListener('playing', () => hero.classList.add('video-ready'));
  heroVideo.addEventListener('error', () => hero.classList.remove('video-ready'));
  heroVideo.play().catch(() => hero.classList.remove('video-ready'));
}
function updateHeader() { header.classList.toggle('scrolled', window.scrollY > 80); }
window.addEventListener('scroll', updateHeader, {passive:true});
updateHeader();
function closeMenu() { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '메뉴 열기'); }
menu.addEventListener('click', () => { const open = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); });
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  document.body.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), {threshold:0.08});
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
}
const serviceDetails = {
  maintenance: { title:'유지관리', en:'MAINTENANCE', description:'승강기 운행 상태를 주기적으로 확인하고 필요한 조치를 이어가는 관리 서비스입니다.', items:['현장과 승강기 현황 확인', '정기적인 점검과 점검 기록 관리', '고장 접수와 필요한 현장 대응', '법정 검사 일정 관리 및 대행 상담'] },
  modernization: { title:'보수공사', en:'MODERNIZATION', description:'설비의 노후 상태와 운행 중 발생하는 문제를 살펴 필요한 보수 범위를 상담합니다.', items:['고장 증상과 부품 상태 확인', '교체가 필요한 부품과 작업 범위 협의', '공사 일정과 운행 중단 계획 안내', '보수 작업 후 운행 상태 확인'] },
  installation: { title:'설치공사', en:'INSTALLATION', description:'건물 구조와 이용 목적, 현장 여건을 바탕으로 승강기 설치를 상담합니다.', items:['건물 구조와 설치 공간 확인', '이용 목적과 승강기 사양 상담', '설치 범위와 공사 계획 협의', '설치 후 관리 방향 안내'] }
};
const dialog = document.querySelector('#service-dialog');
document.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => {
  const service = serviceDetails[button.dataset.service];
  document.querySelector('#dialog-title').textContent = service.title;
  document.querySelector('#dialog-en').textContent = service.en;
  document.querySelector('#dialog-description').textContent = service.description;
  document.querySelector('#dialog-list').replaceChildren(...service.items.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  dialog.showModal();
}));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.querySelector('#year').textContent = new Date().getFullYear();
// Contact form: retain entries on failure and show success only after SMTP accepts the email.
const inquiryForm = document.querySelector('#inquiry-form');
const formStatus = document.querySelector('#form-status');
const submitButton = inquiryForm.querySelector('[type="submit"]');
let formToken = '';
let formAvailable = false;
function showFormStatus(message, style='') { formStatus.textContent=message; formStatus.className=`form-status ${style}`; }
async function refreshFormToken() {
  try {
    const response=await fetch('/api/contact',{cache:'no-store'});
    if (!response.ok) throw new Error('unavailable');
    const result=await response.json();
    formAvailable=result.available===true;
    formToken=result.token || '';
    if (!formAvailable) showFormStatus('온라인 접수를 준비 중입니다. 전화 또는 이메일로 문의해 주세요.','error');
    return formAvailable;
  } catch { formAvailable=false; showFormStatus('온라인 접수에 연결할 수 없습니다. 전화 또는 이메일로 문의해 주세요.','error'); return false; }
}
refreshFormToken();
inquiryForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!inquiryForm.reportValidity()) return;
  if (!formAvailable || !formToken) { await refreshFormToken(); return; }
  const values=new FormData(inquiryForm);
  const payload=Object.fromEntries(values.entries());
  payload.consent=values.get('consent')==='on';
  payload.token=formToken;
  submitButton.disabled=true;
  submitButton.textContent='접수 중…';
  showFormStatus('문의 내용을 전송하고 있습니다.');
  try {
    const response=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await response.json();
    if (!response.ok || result.ok!==true) throw new Error(result.error || '전송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    inquiryForm.reset();
    await refreshFormToken();
    showFormStatus('상담신청이 접수되었습니다. 남겨주신 연락처로 안내드리겠습니다.','success');
  } catch (error) {
    await refreshFormToken();
    showFormStatus(error.message || '접수하지 못했습니다. 입력 내용은 유지됩니다.','error');
  } finally { submitButton.disabled=false; submitButton.innerHTML='상담 신청하기 <span>↗</span>'; }
});
