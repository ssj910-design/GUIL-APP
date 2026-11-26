const $ = s => document.querySelector(s);
const ui={host:$('#scene'),hotspot:$('#hotspot'),title:$('#stage-title'),label:$('#stage-label'),description:$('#stage-description'),index:$('#stage-index'),kicker:$('#hotspot-kicker'),action:$('#hotspot-title'),ending:$('.brand-ending'),hint:$('#interaction-hint'),steps:[...document.querySelectorAll('[data-go]')],reset:$('#reset'),replay:$('#ending-replay'),cabin:$('.cabin-controls')};
const stages=[
 {label:'건물 전체',title:'건물의 중심으로.',description:'승강로에 마우스를 올려보세요.\n외벽 너머의 구조가 드러납니다.',hint:'스크롤하여 건물 안으로 들어가세요'},
 {label:'승강로 최상층',title:'승강로를 따라.',description:'카메라는 아래로, 승강기는 위로.\n스크롤하면 실내로 이어집니다.',hint:'계속 스크롤하여 승강기 안으로'},
 {label:'승강기 내부',title:'승강기 안으로.',description:'문, 층수 표시기, 조작반.\n실내의 디테일을 살펴보세요.',hint:'문과 버튼을 살펴보고, 계속 스크롤하세요'},
 {label:'구일엘리베이터',title:'구일엘리베이터',description:'',hint:'위로 스크롤하면 이전 공간으로 돌아갑니다'},
];
let stage=-1,ready=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>reduced=e.matches);
const info=$('#preview-info');$('#about-preview').addEventListener('click',()=>info.showModal());
for(const selector of ['#close-info','#start-review'])$(selector).addEventListener('click',()=>info.close());
info.addEventListener('click',e=>{if(e.target===info){const r=info.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)info.close();}});
$('#retry').addEventListener('click',()=>location.reload());
function fallback(error){console.error('KV preview unavailable:',error);ready=false;document.body.classList.remove('loading');$('#fallback').hidden=false;ui.hotspot.hidden=true;ui.steps.forEach(b=>b.disabled=true);document.body.classList.add('unavailable');}
function setCopy(next){
 if(next===stage)return;stage=next;const s={...stages[stage]};if(stage===0&&innerWidth<700)s.description='승강로 표시를 눌러보세요.\n외벽 너머의 구조가 드러납니다.';document.body.dataset.stage=stage;
 ui.index.textContent=`0${stage+1}`;ui.label.textContent=s.label;ui.title.textContent=s.title;
 ui.description.replaceChildren(...s.description.split('\n').flatMap((t,i)=>i?[document.createElement('br'),document.createTextNode(t)]:[document.createTextNode(t)]));
 $('.scene-copy').setAttribute('aria-hidden',String(stage===3));ui.hint.textContent=s.hint;
 ui.steps.forEach((b,i)=>i===stage?b.setAttribute('aria-current','step'):b.removeAttribute('aria-current'));
 ui.hotspot.hidden=stage>1;ui.hotspot.setAttribute('aria-label',stage===0?'승강로 투시 보기':'승강기 실내로 이동');
 ui.kicker.textContent=stage===0?(innerWidth<700?'눌러서 내부 보기':'마우스를 올려보세요'):'아래로 스크롤';ui.action.textContent=stage===0?'승강로 투시 보기':'승강기 안으로';
 ui.ending.setAttribute('aria-hidden',String(stage!==3));ui.replay.tabIndex=stage===3?0:-1;
 document.body.classList.toggle('ended',stage===3);
}

async function init(){
 const T=await import('./vendor/three.module.min.js');
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:1.65));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;ui.host.appendChild(renderer.domElement);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback(new Error('Graphics context lost'));});
 const scene=new T.Scene();scene.fog=new T.Fog(0x9dabb6,100,230);
 const camera=new T.PerspectiveCamera(36,1,.035,280);
 const textureLoader=new T.TextureLoader();
 const photo=$('.exterior-photo');await photo.decode();
 const [sky,city,logo]=await Promise.all(['../assets/guil-city-sky-background.webp','../assets/guil-seoul-city-skyline.webp','../assets/guil-elevator-logo.webp'].map(src=>textureLoader.loadAsync(src)));
 for(const t of [sky,city,logo])t.colorSpace=T.SRGBColorSpace;
 scene.background=sky;
 // The existing photographic city provides cloud/building detail in the glass reflections.
 city.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer);const environment=pmrem.fromEquirectangular(city);scene.environment=environment.texture;pmrem.dispose();
 scene.add(new T.HemisphereLight(0xc6dcf4,0x41454b,1.2));
 const sun=new T.DirectionalLight(0xfff0dc,2.45);sun.position.set(-32,58,30);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=52;sun.shadow.camera.bottom=-40;sun.shadow.camera.near=1;sun.shadow.camera.far=160;sun.shadow.normalBias=.045;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
 const fill=new T.DirectionalLight(0x86b6ed,.65);fill.position.set(30,20,-15);scene.add(fill);
 await document.fonts.ready;
 const materials={};
 const mat=(name,color,roughness=.5,metalness=.1,extra={})=>materials[name]=new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 const anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
 // Fine-scale physical surface textures, generated for this model rather than flat colours.
 function surfaceTexture(kind){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle=kind==='metal'?'#bfc1c3':'#7c7d7d';ctx.fillRect(0,0,512,512);let seed=1337;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  if(kind==='metal'){for(let x=0;x<512;x++){const b=170+Math.floor(rnd()*50);ctx.strokeStyle=`rgba(${b},${b},${b},.35)`;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}}
  else{for(let i=0;i<19000;i++){const b=65+Math.floor(rnd()*110);ctx.fillStyle=`rgba(${b},${b},${b},.2)`;ctx.fillRect(rnd()*512,rnd()*512,rnd()*2+1,rnd()*2+1);}if(kind==='tile'){ctx.strokeStyle='#46484a';ctx.lineWidth=3;ctx.strokeRect(1,1,510,510);}}
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=anisotropy;return t;}
 const brushed=surfaceTexture('metal'),paving=surfaceTexture('tile'),asphalt=surfaceTexture('stone');paving.repeat.set(16,16);asphalt.repeat.set(9,9);
 mat('stone',0x858784,.92,.02,{map:paving,bumpMap:paving,bumpScale:.024});mat('asphalt',0x535960,.98,0,{map:asphalt,bumpMap:asphalt,bumpScale:.016});
 mat('frame',0x33414b,.28,.82);mat('edge',0x89949b,.27,.78);mat('concrete',0x686e72,.92,.04);mat('dark',0x17212a,.38,.6);
 mat('glass',0x7796a6,.12,.88,{envMapIntensity:1.35});mat('glass2',0x415b6c,.16,.84,{envMapIntensity:1.2});mat('glass3',0xa1afb1,.2,.8,{envMapIntensity:1.25});
 mat('rail',0x929da5,.22,.9,{roughnessMap:brushed});mat('cab',0xa4a5a2,.36,.88,{map:brushed,bumpMap:brushed,bumpScale:.001,envMapIntensity:.72});
 mat('cabDark',0x454e52,.33,.88,{map:brushed,envMapIntensity:.7});mat('wall',0x8c8c83,.64,.25);mat('ceiling',0xc7c6be,.72,.12);
 mat('blue',0x3876e9,.25,.5,{emissive:0x2861c4,emissiveIntensity:.3});mat('led',0xfff2d7,.2,.1,{emissive:0xffe2b2,emissiveIntensity:3});
 mat('rubber',0x13181c,.9,0);mat('floor',0x656966,.34,.3,{map:surfaceTexture('tile'),bumpMap:asphalt,bumpScale:.012});mat('plant',0x32473a,.9,0);
 const boxGeo=new T.BoxGeometry(1,1,1),box=(parent,x,y,z,w,h,d,material,cast=false)=>{const m=new T.Mesh(boxGeo,material);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=cast;m.receiveShadow=cast;parent.add(m);return m;};
 const cylinder=(parent,x,y,z,r,h,material,segments=18)=>{const m=new T.Mesh(new T.CylinderGeometry(r,r,h,segments),material);m.position.set(x,y,z);parent.add(m);return m;};
 const newGroup=()=>{const g=new T.Group();scene.add(g);return g;};
 const campus=newGroup(),shell=newGroup(),shaft=newGroup(),cabin=newGroup();cabin.position.set(0,5,3.7);
 const sets=new Map();function isolate(g){const clones=new Map();g.traverse(o=>{if(o.isMesh){const base=o.material;if(!clones.has(base)){const c=base.clone();c.transparent=true;c.userData.base=base.opacity;clones.set(base,c);}o.material=clones.get(base);}});sets.set(g,[...clones.values()]);}
 function fade(g,v){g.visible=v>.003;for(const m of sets.get(g)||[]){m.opacity=m.userData.base*v;m.depthWrite=v>.96;}}
 // A continuous street replaces the presentation plinth and toy-like landscaping.
 const ground=box(campus,0,-.38,0,180,.3,150,materials.asphalt);ground.receiveShadow=true;
 const sidewalk=box(campus,0,-.15,0,47,.16,37,materials.stone);sidewalk.receiveShadow=true;
 box(campus,0,-.03,0,20,.16,15,materials.concrete,true);
 for(const z of [21.5,25.5])for(let x=-70;x<70;x+=7)box(campus,x,-.21,z,3,.012,.12,materials.ceiling);
 for(const x of [-18,18]){box(campus,x,.35,-3,1.2,.9,8,materials.dark,true);box(campus,x,.85,-3,1.1,.15,7.8,materials.plant);for(let i=0;i<14;i++){const bush=new T.Mesh(new T.IcosahedronGeometry(.48,2),materials.plant);bush.position.set(x,1.15,-6.4+i*.5);bush.scale.set(1,.8,1);campus.add(bush);}}
 for(const x of [-22,22]){cylinder(campus,x,3.8,17,.065,7.6,materials.frame);box(campus,x,7.65,16.5,.3,.1,1.25,materials.frame);box(campus,x,7.57,16.5,.21,.025,1,materials.led);}
 // Context buildings use opaque glazing with fine floor divisions, never floating miniatures.
 const contextMat=mat('context',0x687d8b,.32,.65);
 for(const [x,z,w,d,h]of[[-38,-30,15,18,24],[29,-32,16,14,32],[46,-6,14,16,21],[-41,15,14,13,19],[-21,-56,16,14,40],[13,-61,22,15,26]]){
  box(campus,x,h/2-.3,z,w,h,d,contextMat,true);
  for(let y=2;y<h;y+=2.8)box(campus,x,y,z+d/2+.02,w,.06,.05,materials.frame);
  for(let xx=x-w/2;xx<=x+w/2;xx+=2.6)box(campus,xx,h/2,z+d/2+.05,.05,h,.08,materials.frame);
 }
 // Slim graphite mullions, recessed slabs, and nonuniform reflective glass.
 for(let f=0;f<14;f++){
  const y=f*2.65+.35;box(shell,0,y,0,14.6,.18,10.6,materials.concrete,true);
  for(let side of [-1,1]){
   for(let i=0;i<10;i++)box(shell,-6.75+i*1.5,y+1.34,side*5.52,1.455,2.57,.075,[materials.glass,materials.glass2,materials.glass3][(i*3+f*5)%7===0?1:(i+f)%5===0?2:0]);
   for(let i=0;i<8;i++)box(shell,side*7.52,y+1.34,-4.8125+i*1.375,.075,2.57,1.33,(i+f)%4===0?materials.glass2:materials.glass);
  }
  for(let z of [-5.58,5.58])box(shell,0,y,z,15.08,.048,.08,materials.frame);
  for(let x of [-7.58,7.58])box(shell,x,y,0,.08,.048,11.08,materials.frame);
 }
 for(let x=-7.5;x<=7.5;x+=1.5)for(let z of [-5.58,5.58])box(shell,x,18.05,z,.045,35.65,.075,materials.frame);
 for(let z=-5.5;z<=5.5;z+=1.375)for(let x of[-7.58,7.58])box(shell,x,18.05,z,.075,35.65,.045,materials.frame);
 box(shell,0,37.65,0,15.4,.24,11.4,materials.frame,true);
 box(shell,0,37.87,0,13.8,.16,9.8,materials.concrete);
 for(let x of[-4.5,0,4.5]){box(shell,x,38.35,-1,2.8,.8,2.2,materials.edge,true);for(let n=0;n<12;n++)box(shell,x,38.77,-1.95+n*.17,2.6,.015,.04,materials.dark);}
 // Ground-floor entrance with smoked glass, doors and deep steel canopy.
 box(shell,0,1.6,5.61,5.5,3.15,.1,materials.glass2);for(let x of[-2.75,0,2.75])box(shell,x,1.6,5.7,.08,3.2,.12,materials.frame);
 for(let x of[-.16,.16])box(shell,x,1.5,5.82,.025,.65,.08,materials.edge);
 box(shell,0,3.5,6.6,7,.15,2.6,materials.frame,true);
 box(shell,0,3.41,6.6,6.7,.025,2.35,materials.cab);

 // Shaft: guide rails, landing frames, hoist ropes, counterweight and traction machine.
 box(shaft,0,.1,3.7,5.7,.3,5.8,materials.dark);
 for(let x of[-2.45,2.45])for(let z of[1,6.3])box(shaft,x,18.25,z,.15,36.5,.15,materials.rail);
 for(let x of[-1.98,1.98]){box(shaft,x,18.25,3.7,.12,36.5,.26,materials.rail);box(shaft,x,18.25,3.7,.28,36.5,.06,materials.rail);}
 for(let f=0;f<14;f++){
  const y=f*2.65+.55;for(let z of[1,6.3])box(shaft,0,y,z,5.1,.11,.12,materials.edge);for(let x of[-2.45,2.45])box(shaft,x,y,3.7,.12,.11,5.3,materials.edge);
  for(let x of[-2.15,2.15])box(shaft,x,y,3.7,.55,.09,.5,materials.frame);
 }
 box(shaft,0,36.1,3.7,5.3,.25,5.65,materials.frame);box(shaft,.1,36.55,3.6,1.8,.65,1.6,materials.dark);
 const sheave=new T.Mesh(new T.TorusGeometry(.68,.14,12,36),materials.rail);sheave.position.set(0,37.1,3.95);shaft.add(sheave);
 const ropes=new T.Group();shaft.add(ropes);for(let x of[-.3,-.1,.1,.3])cylinder(ropes,x,0,3.7,.016,1,materials.rail,6);
 const counterweight=new T.Group();shaft.add(counterweight);box(counterweight,2.15,0,2.8,.4,3.3,1.2,materials.frame);for(let i=0;i<9;i++)box(counterweight,2.15,-1.35+i*.32,2.8,.44,.25,1.25,materials.edge);
 const glowMaterial=new T.MeshBasicMaterial({color:0x5ba9ff,transparent:true,opacity:0,depthWrite:false});const shaftGlow=newGroup();
 for(let x of[-2.52,2.52])box(shaftGlow,x,18.1,6.4,.022,36.2,.022,glowMaterial);
 for(let y of[0,36.2])box(shaftGlow,0,y,6.4,5.08,.022,.022,glowMaterial);

 // Human-scale stainless interior. Entry view looks toward the doors, not the branding.
 box(cabin,0,.12,0,3.75,.22,4.25,materials.frame);
 const cabinFloor=box(cabin,0,.25,0,3.55,.07,4.05,materials.floor);cabinFloor.receiveShadow=true;
 for(let x of[-1.8,1.8])box(cabin,x,1.85,0,.1,3.3,4.2,materials.cabDark);
 box(cabin,0,1.85,-2.05,3.6,3.3,.14,materials.cab);
 for(let x of[-1.15,0,1.15])box(cabin,x,1.8,-1.971,.009,3.03,.012,materials.rubber);
 for(let x of[-1.74,1.74])for(let z of[-1.05,.15,1.35])box(cabin,x,1.8,z,.012,3.03,.008,materials.rubber);
 for(let x of[-1.73,1.73]){box(cabin,x,1.12,-.15,.055,.055,3.25,materials.rail);box(cabin,x,.39,0,.025,.18,3.96,materials.cabDark);}
 box(cabin,0,1.12,-1.87,3.36,.055,.06,materials.rail);
 const ceiling=new T.Group();cabin.add(ceiling);box(ceiling,0,3.5,0,3.8,.17,4.25,materials.frame);box(ceiling,0,3.38,0,3.5,.04,3.95,materials.ceiling);
 for(let x of[-1.52,1.52])box(ceiling,x,3.32,0,.075,.025,3.8,materials.led);
 for(let z of[-1.6,1.6])box(ceiling,0,3.32,z,3.1,.025,.055,materials.led);
 const interiorLight=new T.PointLight(0xffecd3,8,8,2);interiorLight.position.set(0,3.15,0);cabin.add(interiorLight);
 const frontLight=new T.PointLight(0xdbe8f7,2.4,6,2);frontLight.position.set(0,2,0);cabin.add(frontLight);
 // Two centre-opening door leaves, recessed frame, sill and opening mechanism.
 box(cabin,0,3.08,2.045,3.65,.65,.16,materials.cab);
 box(cabin,-1.55,1.62,2.045,.5,2.46,.16,materials.cabDark);box(cabin,1.55,1.62,2.045,.5,2.46,.16,materials.cab);
 for(let x of[-1.275,1.275])box(cabin,x,1.67,2.01,.09,2.82,.16,materials.dark);
 box(cabin,0,2.99,2.01,2.62,.08,.16,materials.dark);box(cabin,0,.31,2.05,2.62,.06,.35,materials.edge);
 for(let z of[1.94,2.02,2.1])box(cabin,0,.347,z,2.5,.007,.012,materials.rubber);
 const doorLeft=box(cabin,-.615,1.64,2.07,1.225,2.58,.07,materials.cab),doorRight=box(cabin,.615,1.64,2.07,1.225,2.58,.07,materials.cab);
 // A restrained landing beyond the opening instead of a blank void.
 const hall=new T.Group();cabin.add(hall);box(hall,0,1.8,6,7,3.6,.18,materials.wall);box(hall,0,.2,4,7,.12,4.4,materials.floor);box(hall,0,3.55,4,7,.15,4.4,materials.ceiling);
 for(let x of[-3.4,3.4])box(hall,x,1.8,4,.12,3.6,4,materials.wall);
 box(hall,0,3.4,4.7,1.6,.03,.3,materials.led);const hallLight=new T.PointLight(0xffecd0,7,9,2);hallLight.position.set(0,2.9,4.8);hall.add(hallLight);
 // Texture labels are true plane details in the cabin, not a flat UI screenshot.
 function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=anisotropy;return t;}
 function labelTexture(text,color='#dce6ed',size=110){return canvasTexture(256,192,(c,w,h)=>{c.fillStyle=color;c.font=`500 ${size}px Arial, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2+2);});}
 function frontPlane(x,y,z,w,h,texture,parent=cabin){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));m.rotation.y=Math.PI;m.position.set(x,y,z);parent.add(m);return m;}
 const displayCanvas=document.createElement('canvas');displayCanvas.width=640;displayCanvas.height=192;const displayTexture=new T.CanvasTexture(displayCanvas);displayTexture.colorSpace=T.SRGBColorSpace;
 function drawFloor(n){const c=displayCanvas.getContext('2d');c.fillStyle='#061019';c.fillRect(0,0,640,192);c.fillStyle='#bde7ff';c.font='500 135px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(`↑ ${String(n).padStart(2,'0')}`,320,105);displayTexture.needsUpdate=true;$('#floor-readout').textContent=`↑ ${String(n).padStart(2,'0')}`;document.body.dataset.floor=String(n);}
 box(cabin,0,3.08,1.94,.8,.29,.035,materials.dark);frontPlane(0,3.08,1.914,.73,.22,displayTexture);
 // Front-facing control panel: 14 numbered buttons, braille, open/close and alarm.
 box(cabin,1.54,1.67,1.94,.38,1.78,.045,materials.frame);
 const buttonActions=[],floorRings=[];
 function roundButton(x,y,action,label){
  const m=new T.Mesh(new T.CylinderGeometry(.058,.058,.027,24),materials.rail);m.rotation.x=Math.PI/2;m.position.set(x,y,1.90);cabin.add(m);buttonActions.push({mesh:m,action});
  const ring=new T.Mesh(new T.TorusGeometry(.046,.0035,6,24),new T.MeshBasicMaterial({color:0xa5b6bc}));ring.position.set(x,y,1.881);cabin.add(ring);
  frontPlane(x,y,1.879,.074,.055,labelTexture(label,'#17232e',95));
  for(let d=0;d<4;d++){const dot=new T.Mesh(new T.SphereGeometry(.0035,6,4),materials.edge);dot.position.set(x-.012+(d%2)*.009,y-.078-Math.floor(d/2)*.009,1.887);cabin.add(dot);}
  return ring;
 }
 for(let i=1;i<=14;i++){const x=1.45+((i-1)%2)*.18,y=2.32-Math.floor((i-1)/2)*.18;floorRings.push({n:i,mesh:roundButton(x,y,`floor:${i}`,String(i))});}
 roundButton(1.45,.95,'open','◀');roundButton(1.63,.95,'close','▶');
 frontPlane(1.45,.81,1.88,.12,.04,labelTexture('OPEN','#f0f3f5',47));frontPlane(1.63,.81,1.88,.12,.04,labelTexture('CLOSE','#f0f3f5',41));
 const alarm=roundButton(1.54,.65,'alarm','!');alarm.material.color.set(0xd6b363);
 // Small maintenance badge on the side wall; outside the first interior camera view.
 box(cabin,-1.738,2.28,-.62,.025,.27,.91,materials.cab);
 const mark=new T.Mesh(new T.PlaneGeometry(.14,.16),new T.MeshBasicMaterial({map:logo,transparent:true,depthWrite:false}));mark.rotation.y=Math.PI/2;mark.position.set(-1.72,2.28,-.31);cabin.add(mark);
 const nameTexture=canvasTexture(1024,192,(c,w,h)=>{c.font='700 95px "Noto Sans KR",sans-serif';c.fillStyle='#17232f';c.textAlign='center';c.textBaseline='middle';c.fillText('구일엘리베이터',w/2,h/2);});
 const nameMesh=new T.Mesh(new T.PlaneGeometry(.58,.11),new T.MeshBasicMaterial({map:nameTexture,transparent:true,depthWrite:false}));nameMesh.rotation.y=Math.PI/2;nameMesh.position.set(-1.72,2.28,-.77);cabin.add(nameMesh);
 isolate(campus);isolate(shell);isolate(shaft);isolate(ceiling);
 const hitMaterial=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
 const shaftHit=box(scene,0,18,5.7,5.5,36,.2,hitMaterial);
 const raycaster=new T.Raycaster(),pointer=new T.Vector2(),pointerTarget=new T.Vector2();
 const cameraPosition=new T.Vector3(),look=new T.Vector3();
 let mobile=innerWidth<700,progress=0,target=0,peek=0,peekHover=false,peekFocus=false,peekPinned=false,frame=0,lastTime=0,active=!document.hidden;
 let door=0,doorTarget=0,selectedFloor=7,lastFloor=-1,lastPeekFlag=false;
 const stops=[0,1,2.15,3.3];
 const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n)),lerp=(a,b,t)=>a+(b-a)*t,smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
 const vec=a=>new T.Vector3(...a);
 function poses(){return mobile?[
  {u:0,p:[36,10,64],l:[0,18.5,0],f:34},
  {u:1,p:[15,50,35],l:[0,29,3.7],f:42},
  {u:1.52,p:[2.6,32,10],l:[0,23,4],f:52},
  {u:2,p:[0,19.75,1.85],l:[.2,19.9,5.75],f:90},
  {u:2.35,p:[0,19.75,1.85],l:[.2,19.9,5.75],f:90},
  {u:2.85,p:[-.05,20.28,3.1],l:[-1.72,20.28,3.08],f:56},
  {u:3.3,p:[-.48,20.28,3.1],l:[-1.72,20.28,3.08],f:52},
 ]:[
  {u:0,p:[36,10,64],l:[-7,18,0],f:36},
  {u:1,p:[17,47,34],l:[-4,25,3.7],f:38},
  {u:1.52,p:[3,32,10],l:[0,23,4],f:52},
  {u:2,p:[-.25,19.75,2.85],l:[.18,19.85,5.75],f:70},
  {u:2.35,p:[-.25,19.75,2.85],l:[.18,19.85,5.75],f:70},
  {u:2.85,p:[.2,20.28,3.1],l:[-1.72,20.28,3.08],f:42},
  {u:3.3,p:[-.5,20.28,3.1],l:[-1.72,20.28,3.08],f:38},
 ];}
 function getScrollTarget(){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);return clamp(scrollY/max)*3.3;}
 function jump(index){if(!ready)return;peekPinned=false;const max=document.documentElement.scrollHeight-innerHeight;window.scrollTo({top:max*stops[index]/3.3,behavior:reduced?'instant':'smooth'});}
 function wake(){if(!frame&&active&&ready)frame=requestAnimationFrame(render);}
 function setDoor(open){doorTarget=open?1:0;$('#door-status').textContent=open?'문이 열립니다.':'문이 닫힙니다.';document.body.dataset.door=open?'open':'closed';wake();}
 function chooseFloor(n){selectedFloor=n;lastFloor=-1;wake();}
 $('#open-doors').addEventListener('click',()=>setDoor(true));$('#close-doors').addEventListener('click',()=>setDoor(false));
 function perform(action){if(action==='open')setDoor(true);else if(action==='close')setDoor(false);else if(action.startsWith('floor:'))chooseFloor(Number(action.split(':')[1]));else{$('#door-status').textContent='비상 호출 버튼입니다. 이 시안에서는 실제 호출되지 않습니다.';}}
 function render(now){
  frame=0;if(!ready||!active)return;const dt=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;
  target=getScrollTarget();const damping=reduced?1:1-Math.exp(-dt*9);progress=lerp(progress,target,damping);if(Math.abs(progress-target)<.0007)progress=target;
  const u=progress,ps=poses();hall.visible=u>1.82;cabin.visible=peek>.03||u>.16;let n=0;while(n<ps.length-2&&u>ps[n+1].u)n++;
  const a=ps[n],b=ps[n+1],t=smooth((u-a.u)/(b.u-a.u));cameraPosition.lerpVectors(vec(a.p),vec(b.p),t);look.lerpVectors(vec(a.l),vec(b.l),t);camera.fov=lerp(a.f,b.f,t);camera.updateProjectionMatrix();
  const nextStage=u<.63?0:u<1.72?1:u<3.06?2:3;setCopy(nextStage);
  const canPeek=u<.46,wantsPeek=canPeek&&(peekHover||peekFocus||peekPinned)?1:0;peek=lerp(peek,wantsPeek,1-Math.exp(-dt*(reduced?100:5)));
  if(lastPeekFlag!==(peek>.35)){lastPeekFlag=peek>.35;document.body.classList.toggle('is-peeking',lastPeekFlag);ui.hotspot.setAttribute('aria-pressed',String(lastPeekFlag));ui.action.textContent=stage===0?(lastPeekFlag?'외벽 너머, 승강로':'승강로 투시 보기'):'승강기 안으로';}
  const ext=1-smooth((u-.04)/.88);fade(shell,Math.max(.018,ext)*(1-peek*.955)*(1-smooth((u-1.05)/.25)));
  fade(campus,1-smooth((u-.7)/.75));fade(shaft,1-smooth((u-1.5)/.4));
  const travel=smooth((u-1)/1);cabin.position.y=lerp(5,18,travel);
  const roof=u<1.25?1:u<1.84?1-smooth((u-1.25)/.35):smooth((u-1.84)/.16);fade(ceiling,roof);
  const cableLength=Math.max(.1,36.4-(cabin.position.y+3.6));ropes.scale.y=cableLength;ropes.position.y=cabin.position.y+3.6+cableLength/2;counterweight.position.y=31-(cabin.position.y-5);
  glowMaterial.opacity=(.12+peek*.72)*(1-smooth((u-.9)/.6));shaftGlow.visible=u<1.5;
  const cabinActive=u>1.9&&u<2.4;ui.cabin.hidden=!cabinActive;
  if(!cabinActive){doorTarget=0;document.body.dataset.door='closed';$('#door-status').textContent='문이 닫혀 있습니다.';}door=lerp(door,doorTarget,1-Math.exp(-dt*4));doorLeft.position.x=-.615-door*1.24;doorRight.position.x=.615+door*1.24;
  const displayFloor=u<1.98?Math.round(lerp(2,7,travel)):selectedFloor;
  if(displayFloor!==lastFloor){drawFloor(displayFloor);lastFloor=displayFloor;for(const r of floorRings)r.mesh.material.color.set(r.n===displayFloor?0x65b5ff:0xa5b6bc);}
  pointer.lerp(pointerTarget,1-Math.exp(-dt*6));camera.position.copy(cameraPosition);

  camera.lookAt(look);camera.updateMatrixWorld();
  // Photograph and live model share the same framing; the mask exposes only the shaft.
  const photoFade=1-smooth(u/.5);photo.style.opacity=String(photoFade);
  if(photoFade>.001){
   const top=vec([0,36.7,5.8]).project(camera),bottom=vec([0,.6,5.8]).project(camera),w=ui.host.clientWidth,h=ui.host.clientHeight;
   const cx=(top.x+bottom.x)*.25*w+w*.5,cy=-(top.y+bottom.y)*.25*h+h*.5;
   const ry=Math.abs(top.y-bottom.y)*.28*h,rx=mobile?w*.23:w*.076;
   const mask=`radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px,rgba(0,0,0,${1-peek*.99}) 68%,#000 100%)`;
   photo.style.maskImage=mask;photo.style.webkitMaskImage=mask;
   photo.style.transform=`scale(${1+u*.22})`;
  }

  const fadeOut=smooth((u-2.88)/.22);ui.host.style.opacity=String(1-fadeOut);$('.scene-vignette').style.opacity=String(1-fadeOut);
  $('.scene-copy').style.opacity=String(stage===3?0:stage===0?1-smooth((u-.24)/.34):stage===1?smooth((u-.65)/.2)*(1-smooth((u-1.25)/.32)):smooth((u-1.8)/.18)*(1-smooth((u-2.35)/.24)));
  ui.hotspot.style.opacity=String(stage===0?1-smooth((u-.2)/.3):stage===1?smooth((u-.75)/.16)*(1-smooth((u-1.3)/.3)):0);
  ui.hotspot.style.pointerEvents=u<.4||u>.8&&u<1.4?'auto':'none';
  if(stage<2){const p=vec(stage===0?[0,19,5.8]:[0,21,6.3]).project(camera),w=ui.host.clientWidth,h=ui.host.clientHeight;ui.hotspot.style.left=`${clamp((p.x*.5+.5)*w,32,w-(mobile?178:235))}px`;ui.hotspot.style.top=`${clamp((-p.y*.5+.5)*h,mobile?280:160,h-170)}px`;}
  $('#journey-progress-bar').style.transform=`scaleX(${u/3.3})`;
  document.body.dataset.progress=u.toFixed(3);document.body.dataset.peek=peek.toFixed(2);
  renderer.render(scene,camera);
  if(Math.abs(progress-target)>.0007||Math.abs(peek-wantsPeek)>.001||Math.abs(door-doorTarget)>.001||pointer.distanceTo(pointerTarget)>.001)wake();
 }
 ui.steps.forEach((b,i)=>{b.disabled=false;b.addEventListener('click',()=>jump(i));});[ui.reset,ui.replay].forEach(b=>{b.disabled=false;b.addEventListener('click',()=>jump(0));});
 ui.hotspot.disabled=false;ui.hotspot.addEventListener('click',()=>{if(stage===0){peekPinned=!peekPinned;wake();}else jump(2);});
 ui.hotspot.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){peekHover=true;wake();}});ui.hotspot.addEventListener('pointerleave',()=>{peekHover=false;wake();});
 ui.hotspot.addEventListener('focus',()=>{peekFocus=ui.hotspot.matches(':focus-visible');wake();});ui.hotspot.addEventListener('blur',()=>{peekFocus=false;wake();});
 function rayAt(e){const r=renderer.domElement.getBoundingClientRect();const p=new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(p,camera);return p;}
 let pointerDown=null;
 renderer.domElement.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;pointerTarget.copy(rayAt(e));peekHover=progress<.46&&raycaster.intersectObject(shaftHit).length>0;const buttonHit=progress>1.9&&progress<2.4&&raycaster.intersectObjects(buttonActions.map(b=>b.mesh)).length>0;renderer.domElement.style.cursor=peekHover||buttonHit?'pointer':'';wake();});
 renderer.domElement.addEventListener('pointerleave',()=>{pointerTarget.set(0,0);peekHover=false;wake();});
 renderer.domElement.addEventListener('pointerdown',e=>pointerDown={x:e.clientX,y:e.clientY});
 renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDown||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>10){pointerDown=null;return;}pointerDown=null;rayAt(e);if(progress<.46&&raycaster.intersectObject(shaftHit).length){peekPinned=!peekPinned;wake();}if(progress>1.9&&progress<2.4){const hit=raycaster.intersectObjects(buttonActions.map(b=>b.mesh))[0];if(hit)perform(buttonActions.find(b=>b.mesh===hit.object).action);}});
 addEventListener('scroll',()=>{target=getScrollTarget();wake();},{passive:true});
 function resize(){const w=ui.host.clientWidth,h=ui.host.clientHeight;mobile=w<700;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();wake();}
 const observer=new ResizeObserver(resize);observer.observe(ui.host);
 document.addEventListener('visibilitychange',()=>{active=!document.hidden;if(active){lastTime=0;wake();}else if(frame){cancelAnimationFrame(frame);frame=0;}});
 ready=true;progress=target=getScrollTarget();resize();setCopy(0);drawFloor(7);document.body.dataset.ready='true';document.body.classList.remove('loading');wake();
 addEventListener('pagehide',e=>{if(e.persisted)return;if(frame)cancelAnimationFrame(frame);observer.disconnect();renderer.dispose();environment.dispose();},{once:true});
}
init().catch(fallback);
