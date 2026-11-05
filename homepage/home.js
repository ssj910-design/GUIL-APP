(() => {
'use strict';
const root=document.documentElement;
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width: 720px)');
let motion=!preference.matches;
const hero=document.querySelector('.hm-hero-track');
const systemLayout=document.querySelector('.hm-system-layout');
const steps=[...document.querySelectorAll('.hm-system-step')];
const scenes=[...document.querySelectorAll('.hm-system-scene')];
const stepButtons=[...document.querySelectorAll('[data-step]')];
function setStage(index){
 scenes.forEach((scene,i)=>{scene.classList.toggle('active',i===index);scene.hidden=i!==index;scene.setAttribute('aria-hidden',String(i!==index));});
 steps.forEach((step,i)=>{step.classList.toggle('active',i===index);step.hidden=i!==index;});
 stepButtons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});
 systemLayout.setAttribute('aria-labelledby',`system-tab-${index}`);
 document.querySelector('.hm-system-stage').dataset.stage=String(index);
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
const stage=document.querySelector('.hm-system-stage');
function fitSystemPhone(){stage.style.setProperty('--phone-fit',String(Math.min(1.1,stage.clientWidth*.82/444)));}
if('ResizeObserver' in window)new ResizeObserver(fitSystemPhone).observe(stage);
else addEventListener('resize',fitSystemPhone);
fitSystemPhone();
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
function renderScroll(){
 const height=innerHeight;
 const y=scrollY;
 const frame=hero.querySelector('.hm-hero-frame');
 const travel=Math.max(1,hero.offsetHeight-frame.offsetHeight);
 const progress=motion?clamp(-hero.getBoundingClientRect().top/travel):0;
 hero.style.setProperty('--rise-scale',String(1.06+progress*(mobile.matches?.10:.18)));
 hero.style.setProperty('--rise-y',`${-progress*(mobile.matches?22:45)}px`);

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
