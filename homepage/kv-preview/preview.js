const $=selector=>document.querySelector(selector);
const ui={experience:$('.experience'),exterior:$('.exterior-scene'),exteriorArt:$('.exterior-art'),shaft:$('.shaft-scene'),shaftArt:$('.shaft-art'),cabin:$('.cabin-scene'),cabinArt:$('.cabin-art'),ambient:$('.cabin-ambient'),hotspot:$('#hotspot'),xray:$('.xray-window'),copy:$('.scene-copy'),title:$('#stage-title'),label:$('#stage-label'),description:$('#stage-description'),index:$('#stage-index'),kicker:$('#hotspot-kicker'),action:$('#hotspot-title'),ending:$('.brand-ending'),endingContent:$('.ending-content'),hint:$('#interaction-hint'),steps:[...document.querySelectorAll('[data-go]')],controls:$('.cabin-controls'),panel:$('.photo-panel'),display:$('.floor-display'),doorLeft:$('#door-left'),doorRight:$('#door-right'),vignette:$('.scene-vignette')};
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=v=>{const t=clamp(v);return t*t*(3-2*t);};
const phase=(u,start,end)=>ease((u-start)/(end-start));
const MAX=4.2,STOPS=[0,1.36,2.55,4.2],ASPECT=1672/941;
const stages=[
 {label:'건물 전체',title:'건물의 중심으로.',description:'승강로에 마우스를 올려보세요.\n외벽 너머의 공간이 드러납니다.',hint:'스크롤하여 건물 안으로 들어가세요'},
 {label:'승강로',title:'보이지 않는 곳까지.',description:'레일과 로프, 그리고 승강기.\n그 안으로 조금 더 가까이.',hint:'계속 스크롤하여 승강기 안으로'},
 {label:'승강기 내부',title:'안전한 이동의 안쪽.',description:'매일 마주하는 문 너머에,\n구일엘리베이터가 있습니다.',hint:'계속 스크롤하면 문이 열립니다'},
 {label:'구일엘리베이터',title:'구일엘리베이터',description:'',hint:'위로 스크롤하면 이전 공간으로 돌아갑니다'}
];
let ready=false,stage=-1,progress=0,target=0,peek=0,hover=false,focused=false,pinned=false,door=0,manualDoor=null,frame=0,lastTime=0,width=0,height=0,mobile=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let exteriorSize={w:0,h:0},cabinSize={w:0,h:0},carFloor=7,selectedFloor=null;
const info=$('#preview-info');
$('#about-preview').addEventListener('click',()=>info.showModal());
for(const selector of ['#close-info','#start-review'])$(selector).addEventListener('click',()=>info.close());
info.addEventListener('click',event=>{if(event.target!==info)return;const r=info.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)info.close();});
$('#retry').addEventListener('click',()=>location.reload());
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;wake();});
function fallback(error){console.error('KV preview unavailable:',error);ready=false;document.body.classList.remove('loading');document.body.classList.add('unavailable');$('#fallback').hidden=false;ui.hotspot.hidden=true;ui.steps.forEach(b=>b.disabled=true);}
function setCopy(next,force=false){
 if(next===stage&&!force)return;stage=next;const s={...stages[stage]};
 if(stage===0&&mobile)s.description='승강로 표시를 눌러보세요.\n외벽 너머의 공간이 드러납니다.';
 document.body.dataset.stage=stage;ui.index.textContent=`0${stage+1}`;ui.label.textContent=s.label;ui.title.textContent=s.title;
 ui.description.replaceChildren(...s.description.split('\n').flatMap((text,i)=>i?[document.createElement('br'),document.createTextNode(text)]:[document.createTextNode(text)]));
 ui.copy.setAttribute('aria-hidden',String(stage===3));ui.hint.textContent=s.hint;
 ui.steps.forEach((b,i)=>i===stage?b.setAttribute('aria-current','step'):b.removeAttribute('aria-current'));
 ui.hotspot.hidden=stage!==0;ui.kicker.textContent=mobile?'눌러서 내부 보기':'마우스를 올려보세요';
 ui.ending.setAttribute('aria-hidden',String(stage!==3));$('#ending-replay').tabIndex=stage===3?0:-1;
 document.body.classList.toggle('ended',stage===3);
}
function scrollTarget(){return clamp(scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight))*MAX;}
function jump(index){if(!ready)return;pinned=false;manualDoor=null;if(index===0){selectedFloor=null;showFloor(7);}window.scrollTo({top:(document.documentElement.scrollHeight-innerHeight)*STOPS[index]/MAX,behavior:reduced?'instant':'smooth'});}
function wake(){if(!frame&&ready&&!document.hidden)frame=requestAnimationFrame(render);}
function changeDoor(open){manualDoor=open?1:0;$('#door-status').textContent=open?'문이 열리며 구일 로고가 보입니다.':'문이 닫힙니다.';wake();}
function showFloor(n){carFloor=n;ui.display.querySelector('span').textContent=String(n).padStart(2,'0');$('#floor-readout').textContent=`↑ ${String(n).padStart(2,'0')}`;document.body.dataset.floor=String(n);for(const b of ui.panel.querySelectorAll('[data-floor]'))b.classList.toggle('selected',Number(b.dataset.floor)===n);}
$('#open-doors').addEventListener('click',()=>changeDoor(true));$('#close-doors').addEventListener('click',()=>changeDoor(false));
function panelButton(label,x,y,action,n){const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.className='panel-hit';b.style.left=`${x/1672*100}%`;b.style.top=`${y/941*100}%`;if(n)b.dataset.floor=n;b.addEventListener('click',action);ui.panel.appendChild(b);}
for(let row=0;row<6;row++)for(let column=0;column<2;column++){const n=11-row*2+column;panelButton(`${n}층 선택`,column?1236:1199,365+row*30.6,()=>{selectedFloor=n;showFloor(n);wake();},n);}
panelButton('조작반 문 열림',1199,569,()=>changeDoor(true));panelButton('조작반 문 닫힘',1236,569,()=>changeDoor(false));
panelButton('비상 호출 체험 안내',1218,600,()=>{$('#door-status').textContent='검토 시안으로, 실제 비상 호출은 전송되지 않습니다.';});
ui.hotspot.addEventListener('click',()=>{pinned=!pinned;wake();});
ui.hotspot.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){hover=true;wake();}});
ui.hotspot.addEventListener('pointerleave',()=>{hover=false;wake();});
ui.hotspot.addEventListener('focus',()=>{focused=ui.hotspot.matches(':focus-visible');wake();});
ui.hotspot.addEventListener('blur',()=>{focused=false;wake();});
ui.exterior.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||progress>.45)return;
 const r=ui.exteriorArt.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
 hover=x>.47&&x<.59&&y>.07&&y<.91;ui.exterior.style.cursor=hover?'pointer':'';wake();
});
ui.exterior.addEventListener('pointerleave',()=>{hover=false;wake();});
ui.exterior.addEventListener('click',e=>{if(progress>.45)return;const r=ui.exteriorArt.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;if(x>.47&&x<.59&&y>.07&&y<.91){pinned=!pinned;wake();}});
for(const [i,b] of ui.steps.entries())b.addEventListener('click',()=>jump(i));
for(const selector of ['#reset','#ending-replay'])$(selector).addEventListener('click',()=>jump(0));
addEventListener('scroll',()=>{target=scrollTarget();wake();},{passive:true});
function sizeArt(element,w,h){element.style.width=`${w}px`;element.style.height=`${h}px`;}
function resize(){
 width=ui.experience.clientWidth;height=ui.experience.clientHeight;const wasMobile=mobile;mobile=width<700;
 const h=Math.max(height,width/ASPECT),w=h*ASPECT;exteriorSize={w,h};
 sizeArt(ui.exteriorArt,w,h);sizeArt(ui.shaftArt,w,h);
 cabinSize=mobile?{w:width*2.05,h:width*2.05/ASPECT}:{w,h};
 sizeArt(ui.cabinArt,cabinSize.w,cabinSize.h);
 if(wasMobile!==mobile&&stage>=0)setCopy(stage,true);wake();
}
function render(now){
 frame=0;if(!ready||document.hidden)return;
 const dt=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;target=scrollTarget();
 progress=mix(progress,target,reduced?1:1-Math.exp(-dt*8));if(Math.abs(progress-target)<.0006)progress=target;
 const u=progress,next=u<.89?0:u<2.07?1:u<3.98?2:3;setCopy(next);
 const wantPeek=u<.45&&(hover||focused||pinned)?1:0;peek=mix(peek,wantPeek,1-Math.exp(-dt*(reduced?100:5)));
 const peeking=peek>.4;document.body.classList.toggle('is-peeking',peeking);ui.hotspot.setAttribute('aria-pressed',String(peeking));ui.action.textContent=peeking?'외벽 너머, 승강로':'승강로 투시 보기';
 // Match the full-bleed exterior photograph, then move through overlapping photographic layers.
 const enter=phase(u,.06,1.14),shaftIn=phase(u,.54,1.02),cabinIn=phase(u,1.73,2.22);
 const exteriorZoom=reduced?1:1+enter*.78,shaftZoom=reduced?1:1.02+phase(u,.8,2.22)*.34;
 ui.exterior.style.opacity=String(1-phase(u,.95,1.13));ui.exterior.style.pointerEvents=u<.45?'auto':'none';
 ui.exteriorArt.style.transform=`translate(-50%,-50%) scale(${exteriorZoom})`;
 ui.xray.style.opacity=String(peek*.97);ui.xray.style.filter=`brightness(${.85+peek*.15})`;
 ui.shaft.style.opacity=String(shaftIn*(1-phase(u,2.18,2.35)));
 ui.shaftArt.style.transform=`translate(-50%,-50%) scale(${shaftZoom})`;
 ui.cabin.style.opacity=String(cabinIn);
 ui.cabin.style.visibility=u>1.7?'visible':'hidden';
 // Both leaves move behind the fixed jamb. The real logo is behind the opening, never on a wall.
 const canControl=u>2.22&&u<2.88;if(u<2.18||u>3.6)manualDoor=null;
 const autoDoor=phase(u,2.9,3.58),wantDoor=canControl&&manualDoor!==null?manualDoor:manualDoor===1&&u>=2.88?1:autoDoor;
 door=mix(door,wantDoor,reduced?1:1-Math.exp(-dt*4.8));if(Math.abs(door-wantDoor)<.001)door=wantDoor;
 ui.doorLeft.setAttribute('transform',`translate(${-275*door} 0)`);ui.doorRight.setAttribute('transform',`translate(${275*door} 0)`);
 $('#door-shadow').setAttribute('opacity',String(door*.75));
 const passage=phase(u,3.55,4.16),cabinZoom=mix(1,reduced?1:mobile?2.1:3.45,passage);
 ui.cabinArt.style.transform=`translate(-50%,-50%) scale(${cabinZoom})`;
 ui.cabin.style.opacity=String(cabinIn*(1-phase(u,4.02,4.18)));
 ui.ambient.style.opacity=String((1-passage)*cabinIn);
 if(mobile){const top=height*.5-cabinSize.h*.5+cabinSize.h*.547*(1-cabinZoom),bottom=top+cabinSize.h*cabinZoom;
  ui.ambient.style.maskImage=`linear-gradient(180deg,#000 ${top}px,transparent ${top+24}px,transparent ${bottom-24}px,#000 ${bottom}px)`;
 }
 const chromeOpacity=1-phase(u,3.6,3.85)*(1-phase(u,4,4.2));
 $('.preview-header').style.opacity=String(chromeOpacity);$('.experience-footer').style.opacity=String(chromeOpacity);

 // Settle the logo at the centre of the door opening before moving through it.
 const smallScale=mobile?.73:.64;ui.ending.style.opacity=u>1.7?'1':'0';
 ui.endingContent.style.transform=`translateY(${mix(mobile?4:20,0,passage)}px) scale(${mix(smallScale,1,passage)})`;
 const promises=phase(u,3.74,4.08);ui.ending.style.setProperty('--promises-opacity',promises);ui.ending.style.setProperty('--promises-shift',`${(1-promises)*10}px`);
 ui.ending.style.pointerEvents=stage===3?'auto':'none';
 ui.ending.style.setProperty('--ending-details',phase(u,3.9,4.15));
 ui.copy.style.opacity=String(stage===0?1-phase(u,.24,.72):stage===1?phase(u,.86,1.1)*(1-phase(u,1.65,2.02)):stage===2?phase(u,2.08,2.3)*(1-phase(u,2.74,3.05)):0);
 const vignetteOpacity=1-phase(u,2.7,3.6)*.97;ui.vignette.style.opacity=String(vignetteOpacity);
 ui.hotspot.style.opacity=String(1-phase(u,.13,.49));ui.hotspot.style.pointerEvents=u<.42?'auto':'none';
 // The external locator follows the same object-fit framing as the photograph.
 const ex=mobile?.58:.5,photoLeft=(width-exteriorSize.w)*ex;
 ui.exteriorArt.style.left=`${photoLeft+exteriorSize.w*.5}px`;
 ui.hotspot.style.left=`${clamp(photoLeft+exteriorSize.w*.53,40,width-(mobile?175:240))}px`;
 ui.hotspot.style.top=`${clamp(height*.5+exteriorSize.h*(.46-.5),mobile?300:200,height-170)}px`;
 ui.controls.hidden=!canControl;ui.panel.hidden=!canControl;
 ui.panel.inert=!canControl;
 if(!canControl&&ui.controls.contains(document.activeElement))document.activeElement.blur();
 if(selectedFloor===null){const n=Math.round(mix(2,7,phase(u,1.02,2.18)));if(n!==carFloor)showFloor(n);}
 ui.display.style.opacity=u>2.15?'1':'0';
 document.body.dataset.progress=u.toFixed(3);document.body.dataset.peek=peek.toFixed(2);document.body.dataset.door=door>.95?'open':door<.01?'closed':'moving';
 $('#journey-progress-bar').style.transform=`scaleX(${u/MAX})`;
 if(Math.abs(progress-target)>.0006||Math.abs(peek-wantPeek)>.001||Math.abs(door-wantDoor)>.001)wake();
}
async function init(){
 // Decode all three scenes before enabling the journey to avoid mid-transition image flashes.
 const sources=['./assets/guil-elevator-building-photoreal.webp','./assets/guil-elevator-hoistway-photoreal-v3.webp','./assets/guil-elevator-cabin-photoreal-v3.webp','../assets/guil-elevator-logo.webp'];
 await Promise.all(sources.map(src=>{const image=new Image();image.src=src;return image.decode();}));
 ready=true;progress=target=scrollTarget();resize();setCopy(0);showFloor(7);
 ui.steps.forEach(b=>b.disabled=false);ui.hotspot.disabled=false;$('#reset').disabled=false;$('#ending-replay').disabled=false;
 document.body.dataset.ready='true';document.body.classList.remove('loading');wake();
}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(ui.experience);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;}else{lastTime=0;wake();}});
addEventListener('pagehide',event=>{if(event.persisted)return;if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();},{once:true});
init().catch(fallback);
