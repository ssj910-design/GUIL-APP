'use strict';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero');
const header = document.querySelector('.header');
const nav = document.querySelector('#nav');
const menu = document.querySelector('.menu-toggle');
const motionButton = document.querySelector('.motion-toggle');
let paused = reducedMotion.matches;
let sceneIndex = 0;
let changeTimeout;
const scenes = [
  ['일상의 이동을,', '더 안전하게.', '보이지 않는 곳의 세심함이<br>당신의 평범한 하루를 지킵니다.'],
  ['안전을 살피고,', '신뢰를 쌓습니다.', '정기적인 점검과 필요한 보수.<br>현장에 맞는 관리를 이어갑니다.'],
  ['건물과 사람을,', '가까이 잇습니다.', '유지관리부터 보수, 설치까지.<br>이동의 모든 순간에 구일이 함께합니다.']
];
function showScene(index) {
  sceneIndex = index;
  clearTimeout(changeTimeout);
  hero.classList.add('changing');
  changeTimeout = setTimeout(() => {
    hero.dataset.scene = String(index);
    document.querySelector('#hero-line1').textContent = scenes[index][0];
    document.querySelector('#hero-line2').textContent = scenes[index][1];
    document.querySelector('#hero-copy').innerHTML = scenes[index][2];
    document.querySelector('#scene-current').textContent = `0${index + 1}`;
    document.querySelectorAll('.scene').forEach((button, i) => {
      button.classList.toggle('active', i === index);
      button.setAttribute('aria-pressed', String(i === index));
    });
    hero.classList.remove('changing');
  }, reducedMotion.matches ? 0 : 350);
}
function updateMotion() {
  document.body.classList.toggle('paused', paused);
  motionButton.textContent = paused ? '▶' : 'Ⅱ';
  motionButton.setAttribute('aria-label', paused ? '첫 화면 움직임 재생' : '첫 화면 움직임 일시정지');
}
updateMotion();
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); });
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updateMotion(); });
document.querySelectorAll('.scene').forEach(button => button.addEventListener('click', () => showScene(Number(button.dataset.scene))));
setInterval(() => { if (!paused && !document.hidden && window.scrollY < hero.offsetHeight) showScene((sceneIndex + 1) % scenes.length); }, 8000);
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
