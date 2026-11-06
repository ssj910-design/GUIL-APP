(() => {
'use strict';
const root=document.documentElement;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width: 720px)');
let motion=!preference.matches;
const hero=document.querySelector('.hm-hero-track');
const system=document.querySelector('.hm-connected');
const nodeButtons=[...system.querySelectorAll('[data-system-node]')];
const steps=[...system.querySelectorAll('.cs-flow-panel')];
const stepButtons=[...system.querySelectorAll('[data-step]')];
function setStage(index){
 steps.forEach((step,i)=>{step.hidden=false;step.classList.toggle('active',i===index);step.inert=i!==index;step.setAttribute('aria-hidden',String(i!==index));});
 stepButtons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
 nodeButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
}
// Pointer hover on PC; touch activation and keyboard focus remain available.
function bindStageControl(button,index){
 button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')setStage(index);});
 button.addEventListener('focus',()=>setStage(index));
 button.addEventListener('click',()=>setStage(index));
}
stepButtons.forEach((button,i)=>{
 bindStageControl(button,i);
 button.addEventListener('keydown',event=>{
 let next=i;
 if(event.key==='ArrowRight')next=(i+1)%3;
 else if(event.key==='ArrowLeft')next=(i+2)%3;
 else if(event.key==='Home')next=0;
 else if(event.key==='End')next=2;
 else return;
 event.preventDefault();setStage(next);stepButtons[next].focus({preventScroll:true});
 });
});
nodeButtons.forEach((button,i)=>bindStageControl(button,i));
// Expand building categories without moving the section or forcing page scroll.
const spaceGrid=document.querySelector('#spaces .space-grid');
const spaceCards=[...spaceGrid.querySelectorAll('.space-card')];
const spaceButtons=spaceCards.map(card=>card.querySelector('.space-toggle'));
function selectSpace(index){
 spaceCards.forEach((card,i)=>{
  card.classList.toggle('is-expanded',i===index);
  spaceButtons[i].setAttribute('aria-expanded',String(i===index));
  card.querySelector('.space-description').setAttribute('aria-hidden',String(i!==index));
 });
}
spaceCards.forEach((card,i)=>{
 card.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')selectSpace(i);});
 card.addEventListener('click',()=>selectSpace(i));
 spaceButtons[i].addEventListener('focus',()=>selectSpace(i));
 spaceButtons[i].addEventListener('keydown',event=>{
  let next=i;
  if(event.key==='ArrowRight')next=(i+1)%spaceCards.length;
  else if(event.key==='ArrowLeft')next=(i+spaceCards.length-1)%spaceCards.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=spaceCards.length-1;
  else return;
  event.preventDefault();selectSpace(next);spaceButtons[next].focus({preventScroll:true});
 });
});
spaceGrid.classList.add('is-interactive');selectSpace(0);
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
function renderScroll(){
 const frame=hero.querySelector('.hm-hero-frame');
 const travel=Math.max(1,hero.offsetHeight-frame.offsetHeight);
 const progress=motion?clamp(-hero.getBoundingClientRect().top/travel):0;
 // Downward tilt: the city rises within the frame as the view approaches it.
 const tilt=progress*Math.min(frame.offsetHeight*.045,mobile.matches?32:50);
 hero.style.setProperty('--sky-scale',String(1+progress*.025));
 hero.style.setProperty('--sky-y',`${-tilt*.28}px`);
 hero.style.setProperty('--city-scale',String(1+progress*(mobile.matches?.09:.16)));
 hero.style.setProperty('--city-y',`${-tilt}px`);

 scheduled=false;
}
let scheduled=false;
function requestRender(){if(!scheduled){scheduled=true;requestAnimationFrame(renderScroll);}}
addEventListener('scroll',requestRender,{passive:true});
addEventListener('resize',requestRender);
function syncMotion(){
 root.classList.toggle('motion-off',!motion);
 document.body.classList.toggle('js-motion',motion);
 requestRender();
 scheduleService();
}
preference.addEventListener('change',()=>{motion=!preference.matches;syncMotion();});
mobile.addEventListener('change',requestRender);
const carousel=document.querySelector('.hm-service-carousel');
const slides=[...carousel.querySelectorAll('.hm-service-slide')];
const serviceTrack=carousel.querySelector('.hm-service-track');
const swipeArea=carousel.querySelector('.hm-service-window');
const serviceStatus=carousel.querySelector('.hm-carousel-status');
let serviceIndex=0,serviceTimer=null,carouselInView=false,hoverPaused=false,focusPaused=false;
let swipeStart=null,suppressClickUntil=0;
function scheduleService(){
 clearTimeout(serviceTimer);
 serviceTimer=null;
 if(!motion||!carouselInView||document.hidden||hoverPaused||focusPaused||swipeStart)return;
 serviceTimer=setTimeout(()=>selectService(serviceIndex+1),4000);
}
function selectService(index,announce=false){
 serviceIndex=(index+slides.length)%slides.length;
 slides.forEach((slide,i)=>{
  let offset=(i-serviceIndex+slides.length)%slides.length;
  if(offset>Math.floor(slides.length/2))offset-=slides.length;
  const visible=Math.abs(offset)<=1;
  slide.style.setProperty('--card-slot',String(offset));
  slide.classList.toggle('is-active',offset===0);
  slide.classList.toggle('is-neighbor',Math.abs(offset)===1);
  slide.classList.toggle('is-prev',offset===-1);
  slide.inert=!visible;
  slide.setAttribute('aria-hidden',String(!visible));
  slide.querySelector('.hm-card-select').disabled=offset===0;
 });
 serviceStatus.setAttribute('aria-live',announce?'polite':'off');
 document.querySelector('#service-count').textContent=String(serviceIndex+1).padStart(2,'0');
 document.querySelector('#service-name').textContent=slides[serviceIndex].querySelector('h3').textContent;
 document.querySelector('.hm-carousel-progress span').style.transform=`translateX(${serviceIndex*100}%)`;
 scheduleService();
}
slides.forEach((slide,i)=>slide.querySelector('.hm-card-select').addEventListener('click',()=>selectService(i,true)));
carousel.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hoverPaused=true;scheduleService();}});
carousel.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse'){hoverPaused=false;scheduleService();}});
carousel.addEventListener('focusin',event=>{focusPaused=event.target.matches(':focus-visible');scheduleService();});
carousel.addEventListener('focusout',()=>{queueMicrotask(()=>{focusPaused=carousel.contains(document.activeElement)&&document.activeElement.matches(':focus-visible');scheduleService();});});
carousel.addEventListener('keydown',event=>{
 if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
 event.preventDefault();selectService(serviceIndex+(event.key==='ArrowRight'?1:-1),true);
});
new IntersectionObserver(entries=>{carouselInView=entries[0].intersectionRatio>=.25;scheduleService();},{threshold:.25}).observe(carousel);
document.addEventListener('visibilitychange',scheduleService);
// Drag and touch swipe share a direction lock so vertical page scrolling stays native.
swipeArea.addEventListener('pointerdown',event=>{
 if(!event.isPrimary||event.button!==0)return;
 swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false};
 scheduleService();
});
swipeArea.addEventListener('pointermove',event=>{
 if(!swipeStart||event.pointerId!==swipeStart.id)return;
 const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
 if(!swipeStart.horizontal){
  if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy)*1.25)return;
  swipeStart.horizontal=true;swipeArea.setPointerCapture(event.pointerId);
  serviceTrack.classList.add('is-dragging');
 }
 event.preventDefault();
 serviceTrack.style.setProperty('--drag-x',`${Math.max(-swipeArea.clientWidth*.7,Math.min(swipeArea.clientWidth*.7,dx))}px`);
});
function finishSwipe(event,cancelled=false){
 if(!swipeStart||event.pointerId!==swipeStart.id)return;
 const start=swipeStart,dx=event.clientX-start.x;
 swipeStart=null;
 serviceTrack.classList.remove('is-dragging');serviceTrack.style.setProperty('--drag-x','0px');
 if(swipeArea.hasPointerCapture(event.pointerId))swipeArea.releasePointerCapture(event.pointerId);
 if(start.horizontal){
  suppressClickUntil=performance.now()+400;
  if(!cancelled&&Math.abs(dx)>Math.min(60,swipeArea.clientWidth*.14)){selectService(serviceIndex+(dx<0?1:-1),true);return;}
 }
 scheduleService();
}
swipeArea.addEventListener('pointerup',event=>finishSwipe(event));
swipeArea.addEventListener('pointercancel',event=>finishSwipe(event,true));
swipeArea.addEventListener('lostpointercapture',event=>finishSwipe(event,true));
swipeArea.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();}},true);
selectService(0);setStage(0);syncMotion();

})();
