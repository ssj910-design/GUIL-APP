import * as T from './vendor/three.module.min.js';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const phase=(u,a,b)=>smooth((u-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
const CX=2.16,CZ=3.7,PHOTO_W=72,PHOTO_H=72/(1672/941);
export async function createWorld(host,onAction){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.setClearColor(0x000000,0);host.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.025,240);
 // Keep the entire interior in the building's oblique coordinate frame. The camera
 // joins this frame during entry; the shaft itself never spins inside the facade.
 const buildingAngle=-34*Math.PI/180,pivot=new T.Vector3(CX,0,CZ);
 const buildingFrame=new T.Group();buildingFrame.position.set(CX+2.5,0,CZ-3);buildingFrame.rotation.y=buildingAngle;scene.add(buildingFrame);
 const interiorWorld=new T.Group();interiorWorld.position.copy(pivot).multiplyScalar(-1);buildingFrame.add(interiorWorld);
 const intoBuilding=p=>new T.Vector3(...p).sub(pivot).applyAxisAngle(new T.Vector3(0,1,0),buildingAngle).add(buildingFrame.position);
 const loader=new T.TextureLoader();
 const [exterior,interior,environmentPhoto]=await Promise.all([
  './assets/guil-elevator-building-photoreal.webp','./assets/guil-elevator-cabin-photoreal-v3.webp','../assets/guil-seoul-city-skyline.webp'
 ].map(p=>loader.loadAsync(p)));
 for(const t of [exterior,interior,environmentPhoto])t.colorSpace=T.SRGBColorSpace;
 environmentPhoto.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromEquirectangular(environmentPhoto);scene.environment=environment.texture;pmrem.dispose();
 scene.add(new T.HemisphereLight(0xc4d4e6,0x33383b,.6));
 const key=new T.DirectionalLight(0xe6edf5,2.2);key.position.set(-10,43,24);scene.add(key);
 const upperLight=new T.PointLight(0xd5e5f4,40,38,1.7);upperLight.position.set(CX,35,4.8);interiorWorld.add(upperLight);
 const texture=(kind)=>{const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');let seed=9217;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  ctx.fillStyle=kind==='metal'?'#a8acaf':'#8b8986';ctx.fillRect(0,0,512,512);
  if(kind==='metal'){for(let x=0;x<512;x++){const n=105+Math.floor(rnd()*85);ctx.strokeStyle=`rgba(${n},${n},${n},.25)`;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}}
  else{const data=ctx.getImageData(0,0,512,512);for(let i=0;i<data.data.length;i+=4){const n=110+rnd()*65;data.data[i]=n;data.data[i+1]=n*.99;data.data[i+2]=n*.95;}ctx.putImageData(data,0,0);for(let n=0;n<180;n++){ctx.fillStyle=`rgba(45,45,42,${rnd()*.08})`;ctx.beginPath();ctx.ellipse(rnd()*512,rnd()*512,4+rnd()*45,3+rnd()*18,rnd()*Math.PI,0,Math.PI*2);ctx.fill();}}
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);return t;
 };
 const concreteTexture=texture('concrete'),metalTexture=texture('metal');concreteTexture.repeat.set(2,7);
 const material=(color,roughness=.5,metalness=0,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 const concrete=material(0x646b6e,.97,.02,{map:concreteTexture,bumpMap:concreteTexture,bumpScale:.035});
 const steel=material(0x8b989e,.32,.85,{roughnessMap:metalTexture,envMapIntensity:.6});
 const charcoal=material(0x29323a,.6,.6),dark=material(0x141b20,.8,.2),galvanized=material(0x929a9b,.6,.65,{map:metalTexture});
 const conduit=material(0x3a4144,.66,.5),rubber=material(0x11171b,.9,0),lightMat=new T.MeshBasicMaterial({color:0xe9f3ff,toneMapped:false});
 const boxGeometry=new T.BoxGeometry(1,1,1),cylGeometry=new T.CylinderGeometry(1,1,1,12);
 function box(parent,x,y,z,w,h,d,mat,shadow=false){const m=new T.Mesh(boxGeometry,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=shadow;m.receiveShadow=shadow;parent.add(m);return m;}
 function cyl(parent,x,y,z,r,h,mat){const m=new T.Mesh(cylGeometry,mat);m.position.set(x,y,z);m.scale.set(r,h,r);parent.add(m);return m;}
 // The exterior stays a perspective plane. A real opening exposes the shaft behind it.
 const reveal={value:0},openingCorners={value:Array.from({length:4},()=>new T.Vector2())};
 const exteriorMat=new T.MeshBasicMaterial({map:exterior,transparent:true,depthWrite:false,toneMapped:false,side:T.FrontSide});
 exteriorMat.onBeforeCompile=shader=>{
  shader.uniforms.uReveal=reveal;shader.uniforms.uOpening=openingCorners;
  shader.fragmentShader=`uniform float uReveal;
   uniform vec2 uOpening[4];
   float insideEdge(vec2 a,vec2 b,vec2 p){vec2 edge=b-a;return (edge.x*(p.y-a.y)-edge.y*(p.x-a.x))/max(length(edge),.0001);}
   `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
   float opening=1.0;
   for(int i=0;i<4;i++){opening*=smoothstep(-.0015,.003,insideEdge(uOpening[i],uOpening[(i+1)%4],vMapUv));}
   diffuseColor.a*=1.0-uReveal*opening;
   #include <alphatest_fragment>`);
 };
 // Cutout corners are projected from the same rotated shaft, rather than using a
 // screen-aligned rectangular window that contradicts the building's perspective.
 const openingWorld=[[-3.05,4.2],[3.05,4.2],[3.05,36.4],[-3.05,36.4]].map(([x,y])=>intoBuilding([CX+x,y,7.98]));
 function updateOpening(){
  if(camera.position.z<=8.1)return;
  openingWorld.forEach((p,i)=>{const t=(8-camera.position.z)/(p.z-camera.position.z);const x=mix(camera.position.x,p.x,t),y=mix(camera.position.y,p.y,t);openingCorners.value[i].set(x/PHOTO_W+.5,(y-20)/PHOTO_H+.5);});
 }
 const cityPlane=new T.Mesh(new T.PlaneGeometry(PHOTO_W,PHOTO_H),exteriorMat);cityPlane.position.set(0,20,8);cityPlane.renderOrder=20;scene.add(cityPlane);
 // A full-scale enclosed shaft: floor divisions, real rail profiles, brackets and service runs.
 const shaft=new T.Group();shaft.position.x=CX;interiorWorld.add(shaft);
 box(shaft,-3.2,18.3,3.7,.28,37,8.5,concrete);box(shaft,3.2,18.3,3.7,.28,37,8.5,concrete);const backWall=box(shaft,0,18.3,-.55,6.6,37,.3,concrete);const landingDoors=new T.Group();shaft.add(landingDoors);
 box(shaft,0,-.3,3.7,6.5,.3,8.6,concrete);
 const bolts=[];
 for(let floor=0;floor<14;floor++){
  const y=.4+floor*2.65;
  for(const x of [-3.04,3.04]){
   box(shaft,x,y,3.7,.09,.05,8.2,charcoal);
   for(const z of [.2,3.7,7]){box(shaft,x,y+.35,z,.14,.32,.25,galvanized);bolts.push([x+(x<0?.1:-.1),y+.35,z]);}
  }
  box(landingDoors,0,y,-.35,6.1,.06,.04,charcoal);
  // Back of landing door assembly and header, visible between rails.
  box(landingDoors,0,y+1.36,-.28,2.5,2.45,.06,galvanized);box(landingDoors,0,y+1.36,-.235,.035,2.4,.015,dark);
  box(landingDoors,0,y+2.59,-.12,2.9,.22,.28,charcoal);box(landingDoors,0,y+.05,-.1,2.9,.12,.35,steel);
  for(const x of [-2.38,2.38]){box(shaft,x,y+.28,3.7,.5,.12,.45,charcoal);box(shaft,x,y+.37,3.7,.32,.06,.35,steel);}
  if(floor%2===0){box(shaft,-2.96,y+1.5,.15,.07,.68,.16,charcoal);box(shaft,-2.9,y+1.5,.15,.025,.57,.08,lightMat);}
 }
 for(const x of [-2.34,2.34]){box(shaft,x,18.5,3.7,.1,37,.28,steel);box(shaft,x,18.5,3.7,.3,37,.065,steel);}
 for(let i=0;i<5;i++)cyl(shaft,-2.92+i*.09,18.4,.2,.025,36.8,conduit);
 box(shaft,2.95,18.4,1,.09,36.8,.38,charcoal);
 for(let n=0;n<76;n++)box(shaft,2.87,.5+n*.48,1,.06,.035,.38,galvanized);
 // Instanced fixings avoid hundreds of individual draw calls.
 const fasteners=new T.InstancedMesh(new T.CylinderGeometry(.044,.044,.025,6),steel,bolts.length),dummy=new T.Object3D();
 bolts.forEach((p,i)=>{dummy.position.set(...p);dummy.rotation.z=Math.PI/2;dummy.updateMatrix();fasteners.setMatrixAt(i,dummy.matrix);});shaft.add(fasteners);
 const machinery=new T.Group();machinery.position.set(0,36.5,3.7);shaft.add(machinery);
 for(const x of [-2.5,2.5])box(machinery,x,0,0,.28,.35,5.4,charcoal);
 box(machinery,0,.22,0,3.7,.16,2.1,galvanized);box(machinery,-.8,.55,0,1.2,.62,1.3,charcoal);
 const wheel=new T.Mesh(new T.CylinderGeometry(.63,.63,.4,40),steel);wheel.rotation.x=Math.PI/2;wheel.position.set(.15,.88,.28);machinery.add(wheel);
 for(let i=0;i<5;i++){const ring=new T.Mesh(new T.TorusGeometry(.62,.012,6,40),dark);ring.position.set(.15,.88,.11+i*.08);machinery.add(ring);}
 const ropes=new T.Group();shaft.add(ropes);for(let i=0;i<5;i++)cyl(ropes,-1.7+i*.09,0,3.85,.012,1,steel);
 const weight=new T.Group();shaft.add(weight);box(weight,2.66,0,.6,.34,3.4,1.05,charcoal);for(let i=0;i<10;i++)box(weight,2.66,-1.45+i*.31,.6,.4,.25,1.1,galvanized);
 const lowLight=new T.PointLight(0xd7e5f2,22,22,1.7);lowLight.position.set(CX-1.5,17,.4);interiorWorld.add(lowLight);
 // The cabin is a geometric space. Photographic projection supplies its brushed-metal detail.
 const cabin=new T.Group();cabin.position.set(CX,5,CZ);cabin.rotation.y=Math.PI;interiorWorld.add(cabin);
 const refCamera=new T.PerspectiveCamera(56,1672/941,.01,50);refCamera.position.set(0,1.9,-1.8);refCamera.lookAt(0,1.9,2.05);refCamera.updateMatrixWorld();
 const photoMatrix=new T.Matrix4().multiplyMatrices(refCamera.projectionMatrix,refCamera.matrixWorldInverse);
 const photoMaterial=new T.ShaderMaterial({uniforms:{photo:{value:interior},grain:{value:metalTexture},baseColor:{value:new T.Color(0x727b82)},layerOpacity:{value:1}},side:T.DoubleSide,toneMapped:false,
  vertexShader:'attribute vec4 photoCoord; varying vec4 vPhoto; varying vec3 vLocal; void main(){ vPhoto=photoCoord; vLocal=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:'#include <common>\n varying vec4 vPhoto; varying vec3 vLocal; uniform sampler2D photo; uniform sampler2D grain; uniform vec3 baseColor; uniform float layerOpacity; void main(){vec2 uv=vPhoto.xy/max(vPhoto.w,.001)*.5+.5;float valid=smoothstep(.15,.7,vPhoto.w)*smoothstep(0.0,.05,uv.x)*(1.0-smoothstep(.95,1.0,uv.x))*smoothstep(0.0,.05,uv.y)*(1.0-smoothstep(.95,1.0,uv.y));vec3 metal=baseColor*(.85+.3*texture2D(grain,vLocal.xy*.4).r);gl_FragColor=vec4(mix(metal,texture2D(photo,clamp(uv,vec2(.001),vec2(.999))).rgb,valid),layerOpacity);\n#include <colorspace_fragment>\n}'
 });
 function photoQuad(points){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();const coords=[];for(const p of points){const q=new T.Vector4(...p,1).applyMatrix4(photoMatrix);coords.push(q.x,q.y,q.z,q.w);}g.setAttribute('photoCoord',new T.Float32BufferAttribute(coords,4));const mesh=new T.Mesh(g,photoMaterial);cabin.add(mesh);return mesh;}
 // Closed reference front dimensions derived from the photograph's door edges.
 function frontPoint(px,py,z=2.05){const v=new T.Vector3(px/1672*2-1,1-py/941*2,.5).unproject(refCamera);const dir=v.sub(refCamera.position).normalize();return refCamera.position.clone().addScaledVector(dir,(z-refCamera.position.z)/dir.z);}
 const corner1=frontPoint(561,153),corner2=frontPoint(1106,876);
 const left=Math.min(corner1.x,corner2.x),right=Math.max(corner1.x,corner2.x),bottom=corner2.y,top=corner1.y,mid=(left+right)/2;
 const front=(x1,y1,x2,y2)=>photoQuad([[x1,y1,2.05],[x2,y1,2.05],[x2,y2,2.05],[x1,y2,2.05]]);
 const frontFrame=[front(-2.15,.1,left,3.55),front(right,.1,2.15,3.55),front(left,top,right,3.55),front(left,.1,right,bottom)];frontFrame.forEach(m=>m.position.z=-.025);
 const leafLeft=front(left,bottom,mid,top),leafRight=front(mid,bottom,right,top);
 photoQuad([[-2.15,.1,-2.15],[-2.15,.1,2.05],[-2.15,3.55,2.05],[-2.15,3.55,-2.15]]);
 photoQuad([[2.15,.1,2.05],[2.15,.1,-2.15],[2.15,3.55,-2.15],[2.15,3.55,2.05]]);
 const floorPhoto=photoQuad([[-2.15,.1,-2.15],[2.15,.1,-2.15],[2.15,.1,2.05],[-2.15,.1,2.05]]);floorPhoto.material=photoMaterial.clone();floorPhoto.material.uniforms.baseColor.value=new T.Color(0x343b40);floorPhoto.material.uniforms.grain.value=concreteTexture;
 box(cabin,0,1.82,-2.24,4.4,3.65,.15,galvanized);
 for(const x of [-2.22,2.22])box(cabin,x,1.8,0,.13,3.6,4.45,galvanized);
 box(cabin,0,0,0,4.5,.18,4.5,charcoal);
 // The intact roof fades away as the camera approaches; no hatch or mechanical
 // opening. Only roof-specific materials fade, leaving walls and rails unchanged.
 const roof=new T.Group();cabin.add(roof);
 box(roof,0,3.63,0,4.5,.16,4.5,galvanized);
 for(const x of[-1.9,1.9]){box(roof,x,4.03,-1.7,.035,.7,.035,steel);box(roof,x,4.03,1.7,.035,.7,.035,steel);box(roof,x,4.39,0,.035,.035,3.4,steel);}
 box(roof,0,3.82,-1.65,1.3,.25,.5,charcoal);for(let i=0;i<4;i++)box(roof,-.45+i*.3,3.97,-1.65,.02,.02,.4,steel);
 const roofMaterials=new Map();
 roof.traverse(o=>{if(!o.isMesh)return;const original=o.material;if(!roofMaterials.has(original)){const faded=original.clone();faded.transparent=true;faded.depthWrite=false;roofMaterials.set(original,faded);}o.material=roofMaterials.get(original);});
 const ceiling=photoQuad([[-2.15,3.52,-2.15],[2.15,3.52,-2.15],[2.15,3.52,2.05],[-2.15,3.52,2.05]]);
 ceiling.material=photoMaterial.clone();ceiling.material.transparent=true;ceiling.material.depthWrite=false;ceiling.material.side=T.FrontSide;
 // A shallow textured door recess and sill add true depth at the opening.
 for(const x of[left-.04,right+.04])box(cabin,x,(top+bottom)/2,2.12,.07,top-bottom+.1,.22,charcoal);
 box(cabin,mid,bottom-.03,2.15,right-left+.12,.07,.35,steel);
 for(const z of[2.01,2.09,2.17])box(cabin,mid,bottom+.01,z,right-left,.006,.012,dark);
 const frameTop=box(cabin,mid,top+.035,2.1,right-left+.12,.08,.2,charcoal);
 // Floor display and control hotspots stay in the photographic control-panel positions.
 const displayCanvas=document.createElement('canvas');displayCanvas.width=512;displayCanvas.height=192;const displayTexture=new T.CanvasTexture(displayCanvas);displayTexture.colorSpace=T.SRGBColorSpace;
 const d1=frontPoint(772,62,2.042),d2=frontPoint(900,108,2.042),displayMesh=new T.Mesh(new T.PlaneGeometry(Math.abs(d2.x-d1.x),Math.abs(d2.y-d1.y)),new T.MeshBasicMaterial({map:displayTexture,toneMapped:false}));
 displayMesh.position.copy(d1).add(d2).multiplyScalar(.5);displayMesh.rotation.y=Math.PI;cabin.add(displayMesh);
 function setFloor(n){const ctx=displayCanvas.getContext('2d');ctx.fillStyle='#080d13';ctx.fillRect(0,0,512,192);ctx.fillStyle='#edf6ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='100px Arial';ctx.fillText(`↑ ${String(n).padStart(2,'0')}`,256,103);displayTexture.needsUpdate=true;}
 const hitMaterial=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:T.DoubleSide});const hits=[];
 function panelHit(px,py,action){const p=frontPoint(px,py,2.035),m=new T.Mesh(new T.CircleGeometry(.07,16),hitMaterial);m.position.copy(p);m.rotation.y=Math.PI;cabin.add(m);hits.push({mesh:m,action});}
 for(let row=0;row<6;row++)for(let col=0;col<2;col++)panelHit(col?1236:1199,365+row*30.6,`floor:${11-row*2+col}`);
 panelHit(1199,569,'open');panelHit(1236,569,'close');panelHit(1218,600,'alarm');
 const raycaster=new T.Raycaster();let canControl=false,pointerDown=null;
 function hitAt(e){const r=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);return raycaster.intersectObjects(hits.map(h=>h.mesh))[0];}
 renderer.domElement.addEventListener('pointermove',e=>{if(!canControl)return;renderer.domElement.style.cursor=hitAt(e)?'pointer':'';});
 renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);pointerDown=null;if(!canControl||moved>10)return;const hit=hitAt(e);if(hit)onAction(hits.find(h=>h.mesh===hit.object).action);});
 let w=1,h=1,mobile=false,initial=[0,20,74];
 function resize(width,height){w=width;h=height;mobile=w<700;renderer.setSize(w,h);camera.aspect=w/h;
  const fov=34,half=Math.tan(T.MathUtils.degToRad(fov/2)),distance=Math.min(PHOTO_H/(2*half),PHOTO_W/(2*half*camera.aspect));
  const visibleWidth=distance*2*half*camera.aspect,x=mobile?(PHOTO_W-visibleWidth)*.08:0;initial=[x,20,8+distance];
 }
 // Continuous Hermite position/target tracks keep direction and velocity coherent across scene labels.
 function interpolate(keys,u,field){let i=0;while(i<keys.length-2&&u>keys[i+1].u)i++;const a=keys[i],b=keys[i+1],p=keys[Math.max(0,i-1)],n=keys[Math.min(keys.length-1,i+2)];const t=clamp((u-a.u)/(b.u-a.u)),dt=b.u-a.u;
  return a[field].map((v,j)=>{const d0=(a[field][j]-p[field][j])/Math.max(.01,a.u-p.u),d1=(b[field][j]-a[field][j])/dt,d2=(n[field][j]-b[field][j])/Math.max(.01,n.u-b.u);const tangent=(x,y)=>x*y<=0?0:Math.sign(x)*Math.min(Math.abs((x+y)/2),3*Math.min(Math.abs(x),Math.abs(y)));const m0=tangent(d0,d1)*dt,m1=tangent(d1,d2)*dt;return(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*b[field][j]+(t*t*t-t*t)*m1;});
 }
 function update(u,peek,door,reduced){
  const interiorFov=mobile?100:56;
  const poses=[
   {u:0,p:initial,l:[initial[0],20,8]},
   {u:.55,p:[CX,31,32],l:intoBuilding([CX,30,4]).toArray()},
   {u:1.05,p:[CX,33.3,6.5],l:[CX,24.5,3.7]},
   {u:1.45,p:[CX,29,3.7],l:[CX,18,3.65]},
   {u:1.85,p:[CX,25,3.7],l:[CX,18.5,3.5]},
   {u:2.15,p:[CX,21.75,3.7],l:[CX,19.9,1.8]},
   {u:2.5,p:[CX,19.9,5.5],l:[CX,19.9,1.65]},
   {u:2.85,p:[CX,19.9,5.5],l:[CX,19.9,1.65]},
   {u:3.55,p:[CX,19.9,5.5],l:[CX,19.9,1.65]},
   {u:4.2,p:[CX,19.9,-6],l:[CX,19.9,-12]}
  ];
  for(const pose of poses){if(pose.u>=1.05){pose.p=intoBuilding(pose.p).toArray();pose.l=intoBuilding(pose.l).toArray();}}
  const p=interpolate(poses,u,'p'),l=interpolate(poses,u,'l');
  camera.position.set(...p);const tilt=phase(u,.85,1.35)*(1-phase(u,1.85,2.45));camera.up.set(0,1-tilt,-tilt).normalize().applyAxisAngle(new T.Vector3(0,1,0),buildingAngle);camera.lookAt(new T.Vector3(...l));
  camera.fov=mix(34,mobile?65:51,phase(u,.5,1.45));camera.fov=mix(camera.fov,interiorFov,phase(u,1.85,2.5));camera.updateProjectionMatrix();camera.updateMatrixWorld();
  reveal.value=Math.max(peek*.98,phase(u,.04,.58));updateOpening();cityPlane.visible=camera.position.z>8.05;
  const rise=phase(u,.92,2.12);cabin.position.y=mix(5,18,rise);weight.position.y=31-(cabin.position.y-5);
  const cable=Math.max(.1,36.9-(cabin.position.y+4.45));ropes.scale.y=cable;ropes.position.y=cabin.position.y+4.45+cable*.5;
  const roofOpacity=1-phase(u,1.48,2.04)*(1-phase(u,2.32,2.58));
  for(const mat of roofMaterials.values())mat.opacity=roofOpacity;ceiling.material.uniforms.layerOpacity.value=roofOpacity;roof.visible=ceiling.visible=roofOpacity>.002;
  // Rails and walls stay in the same world; the camera physically passes their foreground edges.
  leafLeft.position.x=-(right-left)*.51*door;leafRight.position.x=(right-left)*.51*door;
  backWall.visible=u<2.3;landingDoors.visible=u<2.3;canControl=u>2.3&&u<2.88;renderer.domElement.style.pointerEvents=u>.6?'auto':'none';
  renderer.render(scene,camera);
  const hotspot=intoBuilding([CX,20,7.98]).project(camera);
  const projected=openingWorld.map(p=>p.clone().project(camera));
  return {hotspot:{x:(hotspot.x*.5+.5)*w,y:(-.5*hotspot.y+.5)*h},hoverBox:{left:Math.min(...projected.map(p=>(p.x*.5+.5)*w)),right:Math.max(...projected.map(p=>(p.x*.5+.5)*w)),top:Math.min(...projected.map(p=>(-.5*p.y+.5)*h)),bottom:Math.max(...projected.map(p=>(-.5*p.y+.5)*h))},camera:p,carY:cabin.position.y,roofOpacity};
 }
 function dispose(){renderer.dispose();environment.dispose();scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});}
 setFloor(7);return {resize,update,setFloor,dispose,canvas:renderer.domElement};
}
