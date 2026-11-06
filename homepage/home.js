(() => {
'use strict';
const root=document.documentElement;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width: 720px)');
let motion=!preference.matches;
const hero=document.querySelector('.hm-hero-track');
const systemPanel=document.querySelector('#system-panel');
const network=document.querySelector('.hm-network');
const nodeButtons=[...document.querySelectorAll('[data-system-node]')];
const stageConnections=[['office','field'],['field','app'],['app','records','office']];
const steps=[...document.querySelectorAll('.hm-system-step')];
const stepButtons=[...document.querySelectorAll('[data-step]')];
function setStage(index){
 steps.forEach((step,i)=>{step.hidden=false;step.classList.toggle('active',i===index);step.inert=i!==index;step.setAttribute('aria-hidden',String(i!==index));});
 stepButtons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
 systemPanel.setAttribute('aria-labelledby',`system-tab-${index}`);
 network.dataset.stage=String(index);
 const connected=stageConnections[index];
 network.querySelectorAll('[data-network-part],[data-network-wire],[data-network-flow]').forEach(el=>el.classList.toggle('is-lit',connected.includes(el.dataset.networkPart||el.dataset.networkWire||el.dataset.networkFlow)));
 nodeButtons.forEach(button=>button.setAttribute('aria-pressed',String(connected.includes(button.dataset.systemNode))));
}
stepButtons.forEach((button,i)=>{
 button.addEventListener('click',()=>setStage(i));
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
nodeButtons.forEach(button=>{
 const selectNode=()=>setStage(Number(button.dataset.nodeStep));
 button.addEventListener('click',selectNode);
 network.querySelector(`[data-network-part="${button.dataset.systemNode}"]`).addEventListener('click',selectNode);
});
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
}
preference.addEventListener('change',()=>{motion=!preference.matches;syncMotion();});
mobile.addEventListener('change',requestRender);
const slides=[...document.querySelectorAll('.hm-service-slide')];
const serviceTrack=document.querySelector('.hm-service-track');
const carousel=document.querySelector('.hm-service-carousel');
let serviceIndex=0;
function selectService(index){
 serviceIndex=(index+slides.length)%slides.length;
 serviceTrack.style.transform=`translate3d(${-serviceIndex*100}%,0,0)`;
 slides.forEach((slide,i)=>{slide.inert=i!==serviceIndex;slide.setAttribute('aria-hidden',String(i!==serviceIndex));});
 document.querySelector('#service-count').textContent=String(serviceIndex+1).padStart(2,'0');
 document.querySelector('#service-name').textContent=slides[serviceIndex].querySelector('h3').textContent;
 document.querySelector('.hm-carousel-progress span').style.transform=`translateX(${serviceIndex*100}%)`;
}
document.querySelector('#service-prev').addEventListener('click',()=>selectService(serviceIndex-1));
document.querySelector('#service-next').addEventListener('click',()=>selectService(serviceIndex+1));
carousel.addEventListener('keydown',event=>{
 if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
 event.preventDefault();selectService(serviceIndex+(event.key==='ArrowRight'?1:-1));
});
const swipeArea=document.querySelector('.hm-service-window');
let swipeStart=null,suppressClick=false;
swipeArea.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')swipeStart={x:event.clientX,y:event.clientY};});
swipeArea.addEventListener('pointerup',event=>{
 if(!swipeStart)return;
 const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
 swipeStart=null;
 if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){selectService(serviceIndex+(dx<0?1:-1));suppressClick=true;setTimeout(()=>{suppressClick=false;},400);}
});
swipeArea.addEventListener('pointercancel',()=>{swipeStart=null;});
swipeArea.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
selectService(0);setStage(0);syncMotion();

})();
