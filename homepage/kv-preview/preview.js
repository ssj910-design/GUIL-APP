const $ = (s) => document.querySelector(s);
const ui = {
  host: $('#scene'), hotspot: $('#hotspot'), title: $('#stage-title'), label: $('#stage-label'),
  description: $('#stage-description'), index: $('#stage-index'), kicker: $('#hotspot-kicker'),
  action: $('#hotspot-title'), ending: $('.brand-ending'), hint: $('#interaction-hint'),
  steps: [...document.querySelectorAll('[data-go]')], reset: $('#reset'), replay: $('#ending-replay'),
};
const stages = [
  { label: '건물 전체', title: '건물의 중심으로.', description: '우리의 일상을 움직이는 승강기.\n그 안에서 구일을 만나보세요.', kicker: '건물 내부', action: '승강로 살펴보기' },
  { label: '승강로 최상층', title: '승강로를 따라.', description: '레일과 케이블, 그리고 움직이는 승강기.\n올라오는 승강기를 만나보세요.', kicker: '다음 공간', action: '승강기 안으로' },
  { label: '승강기 내부', title: '가까이에서 만나는 구일.', description: '승강기 안의 구일 로고를 눌러주세요.', kicker: '구일엘리베이터', action: '로고 가까이 보기' },
  { label: '구일엘리베이터', title: '', description: '', kicker: '', action: '' },
];
let stage = 0, busy = false, ready = false;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = reducedQuery.matches;
reducedQuery.addEventListener('change', (e) => { reduced = e.matches; });
const info = $('#preview-info');
$('#about-preview').addEventListener('click', () => info.showModal());
for (const s of ['#close-info', '#start-review']) $(s).addEventListener('click', () => info.close());
info.addEventListener('click', e => { if (e.target === info) { const r = info.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) info.close(); } });
$('#retry').addEventListener('click', () => location.reload());
function fallback(error) {
  console.error('KV preview unavailable:', error);
  ready = false;
  document.body.classList.remove('loading', 'transitioning');
  $('#fallback').hidden = false;
  ui.hotspot.hidden = true;
  ui.steps.forEach(b => b.disabled = true);
  ui.reset.disabled = true;
}
function setCopy() {
  const s = stages[stage];
  document.body.dataset.stage = String(stage);
  ui.index.textContent = `0${stage + 1}`;
  ui.label.textContent = s.label;
  ui.title.textContent = s.title || '구일엘리베이터';
  $('.scene-copy').setAttribute('aria-hidden', String(stage === 3));
  ui.description.replaceChildren(...s.description.split('\n').flatMap((line, i) => i ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
  ui.kicker.textContent = s.kicker;
  ui.action.textContent = s.action;
  ui.hotspot.setAttribute('aria-label', s.action || '다음 장면');
  ui.hotspot.hidden = stage === 3;
  ui.steps.forEach((b, i) => i === stage ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'));
  ui.ending.setAttribute('aria-hidden', String(stage !== 3));
  ui.replay.tabIndex = stage === 3 ? 0 : -1;
  ui.hint.textContent = stage === 3 ? '다시 보거나 아래 메뉴로 장면을 선택하세요' : '파란 표시를 눌러 다음 공간으로 이동하세요';
}

async function init() {
  const THREE = await import('./vendor/three.module.min.js');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 1.75));
  renderer.setClearColor(0xeaf1f7, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  ui.host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fallback(new Error('Graphics context lost')); });
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8eff6, 95, 200);
  const camera = new THREE.PerspectiveCamera(34, 1, .04, 250);
  const ambient = new THREE.HemisphereLight(0xf2f9ff, 0x718298, 2.4); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-20, 50, 40); scene.add(sun);
  const rim = new THREE.DirectionalLight(0x76b8ff, 2.1); rim.position.set(30, 24, -20); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffefdb, 1); fill.position.set(-25, 10, -15); scene.add(fill);
  // Studio reflections, generated locally; no third-party panorama request.
  const envCanvas = document.createElement('canvas'); envCanvas.width = 512; envCanvas.height = 256;
  const ec = envCanvas.getContext('2d'); const eg = ec.createLinearGradient(0, 0, 0, 256);
  eg.addColorStop(0, '#f7fbff'); eg.addColorStop(.48, '#c4dceb'); eg.addColorStop(.52, '#6c889f'); eg.addColorStop(1, '#eef3f6');
  ec.fillStyle = eg; ec.fillRect(0, 0, 512, 256); ec.fillStyle='#ffffff'; ec.fillRect(50, 24, 80, 120); ec.fillRect(310, 50, 28, 100);
  const envTexture = new THREE.CanvasTexture(envCanvas); envTexture.mapping = THREE.EquirectangularReflectionMapping; envTexture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromEquirectangular(envTexture); scene.environment = env.texture; envTexture.dispose(); pmrem.dispose();
  const logo = await new THREE.TextureLoader().loadAsync('../assets/guil-elevator-logo.webp'); logo.colorSpace = THREE.SRGBColorSpace; logo.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
  await document.fonts.ready;
  const materials = {};
  const makeMat = (name, color, roughness = .5, metalness = .1, more = {}) => materials[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...more });
  makeMat('white', 0xe7eff6, .3, .35); makeMat('edge', 0xa9bbcc, .3, .65); makeMat('dark', 0x25415b, .32, .45);
  makeMat('glass', 0x769cbd, .16, .65, { transparent: true, opacity: .83 });
  makeMat('glassLight', 0xb4cddf, .21, .4, { transparent: true, opacity: .78 });
  makeMat('concrete', 0xc9d4de, .85, .05); makeMat('rail', 0x7d94ab, .24, .8);
  makeMat('cab', 0xe0e6eb, .32, .58); makeMat('cabLight', 0xf0f3f7, .4, .3);
  makeMat('blue', 0x185fdd, .23, .45, {emissive:0x164ab2,emissiveIntensity:.2});
  makeMat('led', 0xe6f6ff, .2, .1, {emissive:0xc3e5ff,emissiveIntensity:2});
  makeMat('leaf', 0x688781, .9, 0); makeMat('trunk', 0x6b746f, .9, 0);
  const boxGeo = new THREE.BoxGeometry(1,1,1);
  const box = (parent, x,y,z, w,h,d, material) => { const m = new THREE.Mesh(boxGeo,material);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m; };
  const cylinder = (parent,x,y,z,r,h,material,segments=16) => { const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material);m.position.set(x,y,z);parent.add(m);return m; };
  const group = () => { const g = new THREE.Group();scene.add(g);return g; };
  const campus=group(), shell=group(), shaft=group(), cabin=group();
  const sceneModel = { shell:1, campus:1, shaft:1, roof:1, cabinY:5, fade:1 };
  const materialSets = new Map();
  // Each environment has its own material clones so fading never changes the cabin.
  function isolate(g) { const clones = new Map();g.traverse(o=>{if(o.isMesh){const mat=o.material;if(!clones.has(mat)){const c=mat.clone();c.transparent=true;c.userData.baseOpacity=mat.opacity;clones.set(mat,c);}o.material=clones.get(mat);}});materialSets.set(g,[...clones.values()]); }
  function fadeGroup(g, value) {g.visible=value>.004;for(const m of materialSets.get(g)||[]) {m.opacity=m.userData.baseOpacity*value;m.depthWrite=value>.9;}}

  // Site model, quiet surroundings and a raised architectural plinth.
  box(campus,0,-1.1,0,44,1.3,33,materials.white);
  box(campus,0,-.38,0,43,.12,32,materials.concrete);
  box(campus,0,-.2,0,24,.35,19,materials.white);
  box(campus,0,.04,8.6,17,.18,2,materials.edge);
  for(let i=0;i<3;i++)box(campus,0,-.04-i*.12,10+i*.65,17+i*.6,.15,.65,materials.white);
  const paving=[];
  for(let x=-20;x<=20;x+=4)paving.push(x,-.3,-15,x,-.3,15);
  for(let z=-15;z<=15;z+=3)paving.push(-21,-.3,z,21,-.3,z);
  const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(paving,3)),new THREE.LineBasicMaterial({color:0xa6bacb,transparent:true,opacity:.24}));campus.add(grid);
  for(const x of [-15,-11,11,15])for(const z of [-11,9]) {
    box(campus,x,.05,z,2.1,.45,2.1,materials.white); cylinder(campus,x,1.1,z,.1,2.2,materials.trunk);
    const tree=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,2),materials.leaf);tree.position.set(x,2.5,z);tree.scale.set(.9,1.5,.9);campus.add(tree);
  }
  const contextMat=new THREE.MeshStandardMaterial({color:0xd1dfe9,roughness:.7,transparent:true,opacity:.36});
  for(const [x,z,w,d,h] of [[-33,-28,12,12,17],[23,-30,12,10,23],[39,-16,9,11,12],[-28,22,8,8,9],[14,-55,16,11,16],[-20,-52,10,10,27]]) {
    box(campus,x,h/2-1,z,w,h,d,contextMat);
    for(let y=2;y<h;y+=3)box(campus,x,y,z+d/2+.01,w,.06,.06,materials.white);
  }
  // A soft baked contact shadow anchors the building without realtime shadow passes.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(64,64,12,64,64,64);sg.addColorStop(0,'rgba(32,65,91,.4)');sg.addColorStop(1,'rgba(32,65,91,0)');sc.fillStyle=sg;sc.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(39,30),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(2,-.29,1);campus.add(shadow);

  // Continuous glass facade. The centre bay corresponds to the real shaft in this model.
  for(let f=0;f<=13;f++) {
    const y=f*2.65+.4;
    box(shell,0,y,0,15,.22,11,materials.white);
    if(f===13)continue;
    for(let side of [-1,1]) {
      for(let i=0;i<5;i++) {
        const x=-6+i*3;
        box(shell,x,y+1.36,side*5.52,2.94,2.42,.07,(i+f)%3===0?materials.glassLight:materials.glass);
      }
      for(let i=0;i<4;i++)box(shell,side*7.52,y+1.36,-4.125+i*2.75,.07,2.42,2.69,(i+f)%3===0?materials.glassLight:materials.glass);
    }
  }
  for(let x=-7.5;x<=7.5;x+=1.5)for(let z of [-5.57,5.57])box(shell,x,17.6,z,.065,34.5,.09,materials.edge);
  for(let z=-5.5;z<=5.5;z+=1.375)for(let x of [-7.57,7.57])box(shell,x,17.6,z,.09,34.5,.065,materials.edge);
  box(shell,0,35.3,0,15.6,.45,11.6,materials.white);
  box(shell,0,36,0,8,1,6,materials.edge);
  box(shell,0,36.65,0,8.2,.12,6.2,materials.white);
  for(let x=-2.8;x<=2.8;x+=1.4){box(shell,x,37.1,-.8,1.05,.8,1.8,materials.dark);for(let i=0;i<4;i++)box(shell,x,37.51,-1.4+i*.4,.9,.03,.06,materials.edge);}
  box(shell,0,2.2,5.8,5,4.4,.18,materials.glassLight);
  box(shell,0,4.55,7,6.4,.15,3,materials.white);
  for(let x of [-2.5,2.5])box(shell,x,2.2,6.7,.12,4.4,.12,materials.edge);

  // Shaft: four structural columns, two guides, landing frames and traction machinery.
  box(shaft,0,.08,3.7,5.7,.3,5.9,materials.dark);
  for(let x of [-2.5,2.5])for(let z of [1,6.4])box(shaft,x,18.2,z,.22,36,.22,materials.edge);
  for(let x of [-1.98,1.98]) {
    box(shaft,x,18.1,3.7,.11,35.8,.22,materials.rail);
    box(shaft,x,18.1,3.7,.32,35.8,.065,materials.rail);
  }
  for(let f=0;f<14;f++) {
    const y=f*2.65+.6;
    for(let z of [1,6.4])box(shaft,0,y,z,5.2,.16,.16,materials.edge);
    for(let x of [-2.5,2.5])box(shaft,x,y,3.7,.16,.16,5.4,materials.edge);
    for(let x of [-2.15,2.15])box(shaft,x,y,3.7,.6,.1,.55,materials.dark);
  }
  box(shaft,0,35.2,3.7,5.5,.35,5.8,materials.white);
  box(shaft,.3,35.65,3.7,2,.6,1.8,materials.blue);
  const sheave=new THREE.Mesh(new THREE.TorusGeometry(.66,.16,12,36),materials.rail);sheave.position.set(0,36.2,3.95);shaft.add(sheave);
  for(let x of [-1.5,1.5])cylinder(shaft,x,.5,3.7,.23,.7,materials.dark);
  const ropes=new THREE.Group();shaft.add(ropes);
  for(let x of [-.35,-.12,.12,.35])cylinder(ropes,x,0,3.7,.018,1,materials.rail,6);
  const counterweight=new THREE.Group();shaft.add(counterweight);box(counterweight,2.15,0,2.8,.45,3.4,1.2,materials.dark);
  for(let i=0;i<8;i++)box(counterweight,2.15,-1.3+i*.35,2.8,.5,.27,1.25,materials.rail);
  const shaftGlow=new THREE.Group();scene.add(shaftGlow);
  const glowMaterial=new THREE.MeshBasicMaterial({color:0x2f83ff,transparent:true,opacity:0,depthWrite:false});
  for(let x of [-2.6,2.6])box(shaftGlow,x,17.9,6.52,.045,35.8,.045,glowMaterial);
  for(let y of [0,35.8])box(shaftGlow,0,y,6.52,5.25,.045,.045,glowMaterial);

  // Cabin. The same cabin rises in the shaft and becomes the interior view.
  cabin.position.set(0,5,3.7);
  box(cabin,0,.12,0,3.75,.22,4.25,materials.cab);
  box(cabin,0,.25,0,3.55,.08,4.05,materials.dark);
  for(let x of [-1.8,1.8])box(cabin,x,1.85,0,.1,3.3,4.2,materials.cab);
  box(cabin,0,1.85,-2.05,3.6,3.3,.14,materials.cabLight);
  for(let x of [-1.13,0,1.13])box(cabin,x,1.85,-1.966,.014,3.18,.018,materials.edge);
  for(let x of [-1.72,1.72])box(cabin,x,1.85,-1.92,.025,3.12,.03,materials.led);
  const ceiling=new THREE.Group();cabin.add(ceiling);
  box(ceiling,0,3.53,0,3.85,.16,4.25,materials.cab);
  box(ceiling,0,3.43,0,3.45,.04,3.9,materials.cabLight);
  for(let x of [-1.4,1.4])box(ceiling,x,3.38,0,.07,.03,3.8,materials.led);
  for(let x of [-1.72,1.72])box(cabin,x,1.25,-.2,.065,.065,3.2,materials.rail);
  box(cabin,0,1.25,-1.82,3.25,.065,.07,materials.rail);
  // Narrow stainless jambs leave the interior readable as the camera enters from above.
  for(let x of [-1.77,1.77])box(cabin,x,1.85,2.04,.18,3.4,.16,materials.dark);
  box(cabin,0,3.48,2.04,3.7,.14,.16,materials.rail);
  const controlPanel=box(cabin,1.735,1.8,.65,.035,1.3,.38,materials.dark);
  for(let i=0;i<7;i++) {
    const b=new THREE.Mesh(new THREE.SphereGeometry(.034,8,6),i===5?materials.blue:materials.white);b.position.set(1.708,1.32+i*.125,.65);cabin.add(b);
  }
  const plate=box(cabin,0,2.32,-1.94,2.55,.66,.03,materials.white);
  const logoMesh=new THREE.Mesh(new THREE.PlaneGeometry(.37,.425),new THREE.MeshBasicMaterial({map:logo,transparent:true,depthWrite:false}));logoMesh.position.set(-.88,2.32,-1.917);cabin.add(logoMesh);
  function textTexture(text,color,width=1024,height=192,fontSize=102) { const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font=`800 ${fontSize}px "Noto Sans KR", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t; }
  const nameMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.32),new THREE.MeshBasicMaterial({map:textTexture('구일엘리베이터','#162c45'),transparent:true,depthWrite:false}));nameMesh.position.set(.24,2.32,-1.916);cabin.add(nameMesh);
  const plateGlow=box(cabin,0,2.32,-1.95,2.61,.72,.03,new THREE.MeshBasicMaterial({color:0x256af6,transparent:true,opacity:0,depthWrite:false}));
  const interiorLight=new THREE.PointLight(0xf1f8ff,4,7,1.5);interiorLight.position.set(0,2.9,1);cabin.add(interiorLight);
  isolate(shell);isolate(campus);isolate(shaft);isolate(ceiling);
  const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
  const buildingHit=box(scene,0,18,0,15.5,36,11.5,hitMaterial);
  const shaftHit=box(scene,0,18,3.7,5.5,36,5.5,hitMaterial);
  const logoHit=box(cabin,0,2.32,-1.9,2.7,.8,.1,hitMaterial);
  const hits=[buildingHit,shaftHit,logoHit];
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2(),pointerTarget=new THREE.Vector2();
  const cameraBase=new THREE.Vector3(),lookBase=new THREE.Vector3();
  let hover=false,hoverStrength=0,hotspotHover=false,frame=0,lastTime=0,animation=null,active=true;
  let mobile = innerWidth < 700;
  function framing(index) {
    if(mobile) return [
      {p:[72,49,94],l:[0,29,0]},
      {p:[21,57,43],l:[0,29,3.7]},
      {p:[0,19.85,7.1],l:[0,20.3,1.7]},
      {p:[0,20.32,4.4],l:[0,20.32,1.76]},
    ][index];
    return [
      {p:[52,32,65],l:[-8,17,0]},
      {p:[21,52,45],l:[-5,24,3.7]},
      {p:[.08,19.85,5.64],l:[-.35,19.85,1.7]},
      {p:[0,20.32,4.4],l:[0,20.32,1.76]},
    ][index];
  }
  const values=[
    {shell:1,campus:1,shaft:1,roof:1,cabinY:5,fade:1},
    {shell:.025,campus:.12,shaft:1,roof:1,cabinY:5,fade:1},
    {shell:0,campus:0,shaft:0,roof:1,cabinY:18,fade:1},
    {shell:0,campus:0,shaft:0,roof:0,cabinY:18,fade:0},
  ];
  const stageFov = index => index === 2 ? (mobile ? 72 : 54) : index === 3 ? 38 : (mobile ? 39 : 34);
  const smooth = t => t*t*t*(t*(t*6-15)+10);
  const lerp=(a,b,t)=>a+(b-a)*t;
  function setControls(lock) { ui.hotspot.disabled=lock;ui.steps.forEach(b=>b.disabled=lock);ui.reset.disabled=lock;ui.replay.disabled=lock; }
  function wake() { if (!frame && active && ready) frame=requestAnimationFrame(render); }
  function applyModel() {
    fadeGroup(shell,sceneModel.shell);fadeGroup(campus,sceneModel.campus);fadeGroup(shaft,sceneModel.shaft);fadeGroup(ceiling,sceneModel.roof);
    cabin.position.y=sceneModel.cabinY;
    const cableLength=Math.max(.1,35.9-(sceneModel.cabinY+3.6));ropes.scale.y=cableLength;ropes.position.y=sceneModel.cabinY+3.6+cableLength/2;
    counterweight.position.y=30-(sceneModel.cabinY-5);
    ui.host.style.opacity=String(sceneModel.fade);
  }
  function hotspotPosition() {
    if(stage===3||busy)return;
    let point = stage===0 ? new THREE.Vector3(0,19.5,5.8) : stage===1 ? new THREE.Vector3(0,16,6.5) : new THREE.Vector3(.55,sceneModel.cabinY+1,1.85);
    point.project(camera);
    const w=ui.host.clientWidth,h=ui.host.clientHeight;
    // Keep the action label inside narrow viewports while its ring stays on the subject.
    const reserved=mobile?182:255;
    const x=Math.max(35,Math.min(w-reserved,(point.x*.5+.5)*w));
    const y=Math.max(mobile?280:150,Math.min(h-145,(-point.y*.5+.5)*h));
    ui.hotspot.style.left=`${x}px`;ui.hotspot.style.top=`${y}px`;
  }
  function render(now) {
    frame=0;if(!active||!ready)return;
    const dt=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;
    if(animation) {
      const t=Math.min(1,(now-animation.start)/animation.duration),e=smooth(t);
      camera.fov=lerp(animation.fromFov,animation.toFov,e);camera.updateProjectionMatrix();
      cameraBase.copy(animation.curve.getPoint(e));lookBase.lerpVectors(animation.fromLook,animation.toLook,e);
      for(const key of Object.keys(sceneModel))sceneModel[key]=lerp(animation.fromValues[key],animation.toValues[key],e);
      // Fade the outer structure before the descending camera crosses it.
      if(animation.destination===2) {
        sceneModel.shaft=animation.fromValues.shaft*(1-smooth(Math.min(1,t*2)));
        sceneModel.roof=t<.8 ? animation.fromValues.roof*(1-smooth(Math.max(0,Math.min(1,(t-.2)*2.2)))) : smooth((t-.8)/.2);
      }
      if(animation.destination===3)sceneModel.fade=1-smooth(Math.min(1,Math.max(0,(t-.35)/.65)));
      applyModel();
      if(t===1){stage=animation.destination;animation=null;busy=false;document.body.classList.remove('transitioning');setCopy();setControls(false);document.body.classList.toggle('ended',stage===3);$('.experience').setAttribute('aria-busy','false');}
    }
    pointer.lerp(pointerTarget,1-Math.exp(-dt*6));
    const wantedHover=(hover||hotspotHover)&&!busy&&stage<3?1:0;
    hoverStrength=lerp(hoverStrength,wantedHover,1-Math.exp(-dt*7));
    glowMaterial.opacity=(stage===0?.18:stage===1?.12:0)+hoverStrength*(stage<2?.7:0);
    shaftGlow.visible=stage<2&&!busy;plateGlow.material.opacity=stage===2?hoverStrength*.45:0;
    camera.position.copy(cameraBase);
    if(!reduced&&!busy&&stage<3){const magnitude=stage===0?1.1:stage===1?.5:.035;camera.position.x+=pointer.x*magnitude;camera.position.y+=pointer.y*magnitude*.45;}
    camera.lookAt(lookBase);
    renderer.render(scene,camera);hotspotPosition();
    if(animation||pointer.distanceTo(pointerTarget)>.002||Math.abs(hoverStrength-wantedHover)>.002)wake();
  }
  function moveTo(destination) {
    if(!ready||busy||destination===stage)return;
    busy=true;hover=false;hotspotHover=false;renderer.domElement.style.cursor='';
    document.body.classList.remove('ended');document.body.classList.add('transitioning');$('.experience').setAttribute('aria-busy','true');setControls(true);
    ui.replay.tabIndex=-1;ui.ending.setAttribute('aria-hidden','true');ui.hint.textContent='다음 공간으로 이동하고 있습니다';
    const to=framing(destination),end=new THREE.Vector3(...to.p),mid=cameraBase.clone().lerp(end,.5);
    if(destination===2&&stage===1){mid.set(mobile?3:2.8,31,12);}
    if(destination===1&&stage===0){mid.add(new THREE.Vector3(-2,4,0));}
    const curve=new THREE.CatmullRomCurve3([cameraBase.clone(),mid,end]);
    const normalDuration=destination===1?3900:destination===2?4300:destination===3?2400:1600;
    animation={start:performance.now(),duration:reduced?80:normalDuration,destination,curve,fromFov:camera.fov,toFov:stageFov(destination),fromLook:lookBase.clone(),toLook:new THREE.Vector3(...to.l),fromValues:{...sceneModel},toValues:values[destination]};
    wake();
  }
  ui.hotspot.addEventListener('click',()=>moveTo(stage+1));
  ui.steps.forEach(b=>b.addEventListener('click',()=>moveTo(Number(b.dataset.go))));
  [ui.reset,ui.replay].forEach(b=>b.addEventListener('click',()=>moveTo(0)));
  for(const e of ['pointerenter','focus'])ui.hotspot.addEventListener(e,()=>{hotspotHover=true;wake();});
  for(const e of ['pointerleave','blur'])ui.hotspot.addEventListener(e,()=>{hotspotHover=false;wake();});
  let pointerDown=null;
  renderer.domElement.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch'||busy||stage===3)return;
    const r=renderer.domElement.getBoundingClientRect();pointerTarget.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointerTarget,camera);hover=raycaster.intersectObject(hits[stage],false).length>0;renderer.domElement.style.cursor=hover?'pointer':'';wake();
  });
  renderer.domElement.addEventListener('pointerleave',()=>{pointerTarget.set(0,0);hover=false;wake();});
  renderer.domElement.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerDown||busy||stage===3||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>10){pointerDown=null;return;}
    pointerDown=null;const r=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(p,camera);if(raycaster.intersectObject(hits[stage],false).length)moveTo(stage+1);
  });
  function resize(){
    const w=ui.host.clientWidth,h=ui.host.clientHeight;mobile=w<700;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=stageFov(stage);camera.updateProjectionMatrix();
    if(animation){const destination=animation.destination;animation=null;busy=false;stage=destination;Object.assign(sceneModel,values[stage]);document.body.classList.remove('transitioning');document.body.classList.toggle('ended',stage===3);setCopy();setControls(false);$('.experience').setAttribute('aria-busy','false');}
    const f=framing(stage);cameraBase.set(...f.p);lookBase.set(...f.l);applyModel();wake();
  }
  const observer=new ResizeObserver(resize);observer.observe(ui.host);
  document.addEventListener('visibilitychange',()=>{active=!document.hidden;if(active){lastTime=0;wake();}else if(frame){cancelAnimationFrame(frame);frame=0;}});
  ready=true;setCopy();resize();setControls(false);document.body.classList.remove('loading');document.body.dataset.ready='true';wake();
  addEventListener('pagehide',(e)=>{if(e.persisted)return;if(frame)cancelAnimationFrame(frame);observer.disconnect();renderer.dispose();env.dispose();}, {once:true});
}
init().catch(fallback);
