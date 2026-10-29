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
document.querySelector('#year').textContent = new Date().getFullYear();
// Contact form: retain entries on failure and show success only after SMTP accepts the email.
const inquiryForm = document.querySelector('#inquiry-form');
if (inquiryForm) {
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

}

// Count supplied company figures once when the section enters view.
const counters = document.querySelectorAll('[data-counter]');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      counterObserver.unobserve(entry.target);
      const target = Number(entry.target.dataset.target);
      const start = performance.now();
      const tick = now => {
        const progress = Math.min((now - start) / 2400, 1);
        entry.target.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))).toLocaleString('ko-KR');
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, {threshold:0.35});
  counters.forEach(counter => counterObserver.observe(counter));
}
document.querySelectorAll('#nav a, .business-tabs a').forEach(link => {
  if (link.pathname === location.pathname && !link.hash) link.setAttribute('aria-current','page');
});
