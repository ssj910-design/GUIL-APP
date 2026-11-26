import {createWorld} from './world.js?v=20261126-v13';
import {sceneAtScroll,scrollAtScene,advanceMotion,autoplayAtTime,AUTOPLAY_HOLD,AUTOPLAY_DURATION} from './motion.js?v=20261126-v13';
const $=s=>document.querySelector(s);
const ui={experience:$('.experience'),world:$('#world'),hotspot:$('#hotspot'),copy:$('.scene-copy'),title:$('#stage-title'),label:$('#stage-label'),description:$('#stage-description'),index:$('#stage-index'),kicker:$('#hotspot-kicker'),action:$('#hotspot-title'),ending:$('.brand-ending'),endingContent:$('.ending-content'),hint:$('#interaction-hint'),steps:[...document.querySelectorAll('[data-go]')],controls:$('.cabin-controls'),vignette:$('.scene-vignette')};
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),mix=(a,b,t)=>a+(b-a)*t;
const phase=(u,a,b)=>{const t=clamp((u-a)/(b-a));return t*t*(3-2*t);};
const MAX=4.2,STOPS=[0,1.34,2.6,4.2];
const stages=[
 {label:'건물 전체',title:'건물의 중심으로.',description:'승강로에 마우스를 올려보세요.\n외벽 너머의 공간이 드러납니다.',hint:'스크롤하여 건물 안으로 들어가세요'},
 {label:'승강로',title:'승강로를 따라.',description:'카메라는 아래로, 승강기는 위로.\n하나의 공간 안에서 이어집니다.',hint:'계속 스크롤하여 승강기 안으로'},
 {label:'승강기 내부',title:'안전한 이동의 안쪽.',description:'매일 마주하는 문 너머에,\n구일엘리베이터가 있습니다.',hint:'계속 스크롤하면 문이 열립니다'},
 {label:'구일엘리베이터',title:'구일엘리베이터',description:'',hint:'위로 스크롤하면 이전 공간으로 돌아갑니다'}
];
let world,ready=false,stage=-1,progress=0,target=0,velocity=0,brandTime=0,peek=0,hover=false,focused=false,pinned=false,door=0,manualDoor=null,frame=0,lastTime=0,width=0,height=0,mobile=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,view=null,selectedFloor=null,carFloor=7;
let playback='manual',autoplayTime=0,expectedScrollY=scrollY,interacted=false;
const autoActive=()=>playback==='waiting'||playback==='playing';
function setPlayback(mode){playback=mode;document.body.dataset.playback=mode;setHint();}
function setHint(){if(stage<0)return;ui.hint.textContent=autoActive()?(mobile?'자동재생 중 · 터치하면 직접 조작':'자동재생 중 · 스크롤하면 직접 조작'):stages[stage].hint;}
function syncScroll(){
 const top=Math.max(0,document.documentElement.scrollHeight-innerHeight)*scrollAtScene(progress);
 window.scrollTo({top,behavior:'instant'});expectedScrollY=scrollY;
}
function takeControl(){
 interacted=true;
 if(autoActive()||playback==='complete'){setPlayback('manual');velocity=0;target=scrollTarget();lastTime=0;wake();}
}
// Cancel before the browser applies wheel/touch/key scrolling. Programmatic
// scroll updates below already match the camera, so takeover needs no rewind.
addEventListener('wheel',takeControl,{passive:true,capture:true});
addEventListener('pointerdown',takeControl,{passive:true,capture:true});
addEventListener('touchstart',takeControl,{passive:true,capture:true});
addEventListener('keydown',e=>{if(['Tab','Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','Escape'].includes(e.key))takeControl();},{capture:true});
const info=$('#preview-info');$('#about-preview').addEventListener('click',()=>{takeControl();info.showModal();});
for(const s of['#close-info','#start-review'])$(s).addEventListener('click',()=>info.close());
info.addEventListener('click',e=>{if(e.target!==info)return;const r=info.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)info.close();});
$('#retry').addEventListener('click',()=>location.reload());
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;if(reduced)takeControl();wake();});
function fallback(error){console.error('KV preview unavailable:',error);ready=false;document.body.classList.remove('loading');document.body.classList.add('unavailable');$('#fallback').hidden=false;ui.hotspot.hidden=true;ui.steps.forEach(b=>b.disabled=true);}
function setCopy(next,force=false){if(next===stage&&!force)return;stage=next;const s={...stages[stage]};if(stage===0&&mobile)s.description='승강로 표시를 눌러보세요.\n외벽 너머의 공간이 드러납니다.';document.body.dataset.stage=stage;ui.index.textContent=`0${stage+1}`;ui.label.textContent=s.label;ui.title.textContent=s.title;ui.description.replaceChildren(...s.description.split('\n').flatMap((text,i)=>i?[document.createElement('br'),document.createTextNode(text)]:[document.createTextNode(text)]));ui.copy.setAttribute('aria-hidden',String(stage===3));setHint();ui.steps.forEach((b,i)=>i===stage?b.setAttribute('aria-current','step'):b.removeAttribute('aria-current'));ui.hotspot.hidden=stage!==0;ui.kicker.textContent=mobile?'눌러서 내부 보기':'마우스를 올려보세요';ui.ending.setAttribute('aria-hidden',String(stage!==3));$('#ending-replay').tabIndex=stage===3?0:-1;document.body.classList.toggle('ended',stage===3);}
function scrollTarget(){return sceneAtScroll(clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)));}
function jump(index){if(!ready)return;takeControl();pinned=false;manualDoor=null;$('#door-status').textContent='문이 닫혀 있습니다.';if(index===0){selectedFloor=null;showFloor(7);}window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*scrollAtScene(STOPS[index]),behavior:reduced?'instant':'smooth'});}
function replay(){
 if(!ready)return;
 progress=target=velocity=brandTime=peek=door=autoplayTime=0;hover=focused=pinned=false;manualDoor=selectedFloor=null;lastTime=0;
 document.activeElement?.blur();showFloor(7);$('#door-status').textContent='문이 닫혀 있습니다.';syncScroll();setCopy(0);setPlayback(reduced?'manual':'waiting');wake();
}
function wake(){if(!frame&&ready&&!document.hidden)frame=requestAnimationFrame(render);}
function changeDoor(open){takeControl();manualDoor=open?1:0;$('#door-status').textContent=open?'문이 열리며 구일 로고가 보입니다.':'문이 닫힙니다.';wake();}
function showFloor(n){carFloor=n;world?.setFloor(n);$('#floor-readout').textContent=`↑ ${String(n).padStart(2,'0')}`;document.body.dataset.floor=String(n);}
function action(name){takeControl();if(name==='open')changeDoor(true);else if(name==='close')changeDoor(false);else if(name.startsWith('floor:')){selectedFloor=Number(name.split(':')[1]);showFloor(selectedFloor);wake();}else $('#door-status').textContent='검토 시안으로 실제 비상 호출은 전송되지 않습니다.';}
$('#open-doors').addEventListener('click',()=>changeDoor(true));$('#close-doors').addEventListener('click',()=>changeDoor(false));
ui.hotspot.addEventListener('click',()=>{takeControl();pinned=!pinned;wake();});ui.hotspot.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){hover=true;wake();}});ui.hotspot.addEventListener('pointerleave',()=>{hover=false;wake();});ui.hotspot.addEventListener('focus',()=>{focused=ui.hotspot.matches(':focus-visible');wake();});ui.hotspot.addEventListener('blur',()=>{focused=false;wake();});
function inShaft(e){if(!view)return false;const r=ui.world.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,b=view.hoverBox;return x>b.left&&x<b.right&&y>b.top&&y<b.bottom;}
ui.world.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||progress>.45)return;hover=inShaft(e);ui.world.style.cursor=hover?'pointer':'';wake();});ui.world.addEventListener('pointerleave',()=>{hover=false;wake();});
let down=null;ui.world.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);ui.world.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<10&&progress<.45&&inShaft(e)){pinned=!pinned;wake();}down=null;});
for(const[i,b]of ui.steps.entries())b.addEventListener('click',()=>jump(i));for(const s of['#reset','#ending-replay'])$(s).addEventListener('click',replay);
addEventListener('scroll',()=>{if(autoActive()&&Math.abs(scrollY-expectedScrollY)>2)takeControl();target=scrollTarget();wake();},{passive:true});
function resize(){
 width=ui.experience.clientWidth;height=ui.experience.clientHeight;const prev=mobile;mobile=width<700;world?.resize(width,height);
 const lockup=$('.ending-lockup'),logo=$('.ending-lockup img');
 lockup.style.setProperty('--logo-center-offset',`${(lockup.offsetWidth-logo.offsetWidth)/2}px`);
 lockup.style.setProperty('--logo-center-offset-y',`${(ui.endingContent.offsetHeight-lockup.offsetHeight)/2}px`);
 if(autoActive())syncScroll();if(prev!==mobile&&stage>=0)setCopy(stage,true);wake();
}
function render(now){frame=0;if(!ready||document.hidden)return;const dt=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;
 if(autoActive()){
  autoplayTime=Math.min(AUTOPLAY_DURATION,autoplayTime+dt);progress=target=autoplayAtTime(autoplayTime);velocity=0;syncScroll();
  const next=autoplayTime>=AUTOPLAY_DURATION?'complete':autoplayTime>=AUTOPLAY_HOLD?'playing':'waiting';if(next!==playback)setPlayback(next);
 }else{target=scrollTarget();if(reduced){progress=target;velocity=0;}else{[progress,velocity]=advanceMotion(progress,velocity,target,dt);}}
 document.body.dataset.autoplayTime=autoplayTime.toFixed(2);const u=progress;setCopy(u<.88?0:u<2.32?1:u<3.98?2:3);
 const wantPeek=u<.45&&(hover||focused||pinned)?1:0;peek=mix(peek,wantPeek,1-Math.exp(-dt*(reduced?100:5)));const peeking=peek>.4;document.body.classList.toggle('is-peeking',peeking);ui.hotspot.setAttribute('aria-pressed',String(peeking));ui.action.textContent=peeking?'외벽 너머, 승강로':'승강로 투시 보기';
 const canControl=u>2.45&&u<2.88;if(u<2.2||u>3.6)manualDoor=null;const autoDoor=phase(u,2.92,3.55),wantDoor=canControl&&manualDoor!==null?manualDoor:manualDoor===1&&u>=2.88?1:autoDoor;door=mix(door,wantDoor,reduced?1:1-Math.exp(-dt*4.8));if(Math.abs(door-wantDoor)<.001)door=wantDoor;
 view=world.update(u,peek,door,reduced);
 const passage=phase(u,3.55,4.18);ui.ending.style.opacity=u>2.3?'1':'0';ui.endingContent.style.transform=`translateY(${mix(mobile?4:20,0,passage)}px) scale(${mix(mobile?.73:.64,1,passage)})`;
 const brandActive=u>2.45&&door>.12;brandTime=brandActive?(reduced?4.5:Math.min(4.5,brandTime+dt)):0;
 const logoReveal=phase(brandTime,0,.65),logoSettle=phase(brandTime,1.0,2.15),wordReveal=phase(brandTime,2.3,3.25);
 const logoScale=mix(mobile?2.3:2.5,1,logoSettle);
 ui.ending.style.setProperty('--logo-settle',logoSettle);ui.ending.style.setProperty('--logo-scale',logoScale);
 document.body.dataset.brandSettle=logoSettle.toFixed(3);document.body.dataset.brandScale=logoScale.toFixed(3);
 ui.ending.style.setProperty('--logo-reveal',logoReveal);ui.ending.style.setProperty('--word-reveal',wordReveal);
 document.body.dataset.brandLogo=logoReveal.toFixed(3);document.body.dataset.brandWord=wordReveal.toFixed(3);
 const promises=Math.min(phase(u,3.75,4.1),phase(brandTime,3.35,4.2));ui.ending.style.setProperty('--promises-opacity',promises);ui.ending.style.setProperty('--promises-shift',`${(1-promises)*10}px`);ui.ending.style.setProperty('--ending-details',Math.min(phase(u,3.9,4.15),phase(brandTime,3.45,4.5)));ui.ending.style.pointerEvents=stage===3?'auto':'none';
 ui.copy.style.opacity=String(stage===0?1-phase(u,.18,.62):stage===1?phase(u,.92,1.15)*(1-phase(u,1.72,2.22)):stage===2?phase(u,2.34,2.5)*(1-phase(u,2.75,3.05)):0);
 ui.vignette.style.opacity=String(1-phase(u,2.72,3.6)*.97);const chrome=1-phase(u,3.6,3.85)*(1-phase(u,4,4.2));$('.preview-header').style.opacity=String(chrome);$('.experience-footer').style.opacity=String(chrome);
 ui.hotspot.style.opacity=String(1-phase(u,.12,.48));ui.hotspot.style.pointerEvents=u<.42?'auto':'none';ui.hotspot.style.left=`${clamp(view.hotspot.x,40,width-(mobile?175:240))}px`;ui.hotspot.style.top=`${clamp(view.hotspot.y,mobile?300:180,height-170)}px`;
 ui.controls.hidden=!canControl;if(!canControl&&ui.controls.contains(document.activeElement))document.activeElement.blur();if(selectedFloor===null){const n=Math.round(mix(2,7,phase(u,.92,2.12)));if(n!==carFloor)showFloor(n);}
 document.body.dataset.progress=u.toFixed(3);document.body.dataset.peek=peek.toFixed(2);document.body.dataset.door=door>.95?'open':door<.01?'closed':'moving';document.body.dataset.camera=view.camera.map(n=>n.toFixed(2)).join(',');document.body.dataset.carY=view.carY.toFixed(2);document.body.dataset.roofOpacity=view.roofOpacity.toFixed(3);$('#journey-progress-bar').style.transform=`scaleX(${u/MAX})`;
 if(autoActive()||(brandActive&&brandTime<4.5)||Math.abs(progress-target)>.0006||Math.abs(velocity)>.003||Math.abs(peek-wantPeek)>.001||Math.abs(door-wantDoor)>.001)wake();
}
async function init(){world=await createWorld(ui.world,action);world.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback(new Error('Graphics context lost'));});ready=true;progress=target=scrollTarget();resize();setCopy(0);showFloor(7);setPlayback(!reduced&&!interacted&&scrollY<2?'waiting':'manual');ui.steps.forEach(b=>b.disabled=false);ui.hotspot.disabled=false;$('#reset').disabled=false;$('#ending-replay').disabled=false;document.body.dataset.ready='true';document.body.classList.remove('loading');wake();}
document.fonts.ready.then(()=>{resize();wake();});
const observer=new ResizeObserver(resize);observer.observe(ui.experience);document.addEventListener('visibilitychange',()=>{if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;}else{lastTime=0;wake();}});addEventListener('pagehide',e=>{if(e.persisted)return;if(frame)cancelAnimationFrame(frame);observer.disconnect();world?.dispose();},{once:true});init().catch(fallback);
