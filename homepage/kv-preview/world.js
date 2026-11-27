import * as T from './vendor/three.module.min.js';
import {addShaftHardware,addRoofHardware,createShaftWallMaterial} from './hardware.js?v=20261127-v19';
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const phase=(u,a,b)=>smooth((u-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
const CX=2.16,CZ=3.7,PHOTO_W=72,PHOTO_H=72/(1672/941),CABIN_HEIGHT_SCALE=.72;
const exteriorEye=8.8,exteriorDistance=PHOTO_H/(2*Math.tan(T.MathUtils.degToRad(17)));
export async function createWorld(host,onAction){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.setClearColor(0x000000,0);host.appendChild(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.025,240);
 // Keep the entire interior in the building's oblique coordinate frame. The camera
 // joins this frame during entry; the shaft itself never spins inside the facade.
 const buildingAngle=-31*Math.PI/180,pivot=new T.Vector3(CX,0,CZ),buildingScale=new T.Vector3(.76,1,.76);
 const buildingFrame=new T.Group();buildingFrame.position.set(CX+3.13,0,CZ-3.1);buildingFrame.rotation.y=buildingAngle;buildingFrame.scale.copy(buildingScale);scene.add(buildingFrame);
 const interiorWorld=new T.Group();interiorWorld.position.copy(pivot).multiplyScalar(-1);buildingFrame.add(interiorWorld);
 const intoBuilding=p=>new T.Vector3(...p).sub(pivot).multiply(buildingScale).applyAxisAngle(new T.Vector3(0,1,0),buildingAngle).add(buildingFrame.position);
 const loader=new T.TextureLoader();
 const [exterior,interior,concreteTexture,concreteNormal,concreteRoughness,stainlessColor,stainlessNormal,stainlessRoughness,roofColor,roofNormal,roofRoughness]=await Promise.all([
  './assets/guil-elevator-building-photoreal.webp','./assets/guil-elevator-cabin-photoreal-v3.webp',
  ...['guil-hoistway-concrete','guil-brushed-stainless','guil-car-roof-steel'].flatMap(name=>['color','normal','roughness'].map(map=>`./assets/materials/${name}-${map}.webp`))
 ].map(p=>loader.loadAsync(p)));
 for(const t of [exterior,interior,concreteTexture,stainlessColor,roofColor]){t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);}
 const pbrTextures=[concreteTexture,concreteNormal,concreteRoughness,stainlessColor,stainlessNormal,stainlessRoughness,roofColor,roofNormal,roofRoughness];
 for(const t of pbrTextures){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);}
 // Rotate the rail maps together so machining follows the vertical running face.
 const railMaps=[stainlessColor,stainlessNormal,stainlessRoughness].map(t=>{const m=t.clone();m.center.set(.5,.5);m.rotation=Math.PI/2;m.needsUpdate=true;return m;});
 // Dark surroundings and feathered service lights keep steel reflections from
 // flattening into a uniformly gray surface or a clipped white stripe.
 const reflectionRoom=new T.Scene();reflectionRoom.background=new T.Color(0x151a20);
 const roomGeo=new T.BoxGeometry(10,12,10),roomMat=new T.MeshBasicMaterial({color:0x30353a,side:T.BackSide});reflectionRoom.add(new T.Mesh(roomGeo,roomMat));
 const softboxCanvas=document.createElement('canvas');softboxCanvas.width=64;softboxCanvas.height=256;const softboxCtx=softboxCanvas.getContext('2d'),softboxPixels=softboxCtx.createImageData(64,256);
 for(let y=0;y<256;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,a=Math.pow(Math.sin(Math.PI*(x+.5)/64),.7)*Math.pow(Math.sin(Math.PI*(y+.5)/256),.4);softboxPixels.data.set([255,255,255,Math.round(a*255)],i);}
 softboxCtx.putImageData(softboxPixels,0,0);const softboxTexture=new T.CanvasTexture(softboxCanvas);softboxTexture.colorSpace=T.SRGBColorSpace;
 const reflectors=[];
 for(const [x,y,z,ry,w,h,power]of[[-4.9,1,0,Math.PI/2,.8,9,5],[4.9,2,-1,-Math.PI/2,2.8,7,1.8],[0,4,-4.9,0,4,1.4,3]]){
  const g=new T.PlaneGeometry(w,h),m=new T.MeshBasicMaterial({map:softboxTexture,transparent:true,depthWrite:false,color:new T.Color(power,power*.99,power*.96),side:T.DoubleSide}),p=new T.Mesh(g,m);p.position.set(x,y,z);p.rotation.y=ry;reflectionRoom.add(p);reflectors.push(p);
 }
 // Diffuse light from lower landings remains visible in grazing reflections
 // when looking down the shaft; the narrow side lights supply the highlights.
 for(const [y,power]of[[-5.9,.25],[5.9,.4]]){
  const g=new T.PlaneGeometry(6,5),m=new T.MeshBasicMaterial({map:softboxTexture,transparent:true,depthWrite:false,color:new T.Color(power,power*.99,power*.97),side:T.DoubleSide}),p=new T.Mesh(g,m);p.position.set(0,y,0);p.rotation.x=Math.PI/2;reflectionRoom.add(p);reflectors.push(p);
 }
 const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(reflectionRoom,.018);scene.environment=environment.texture;pmrem.dispose();roomGeo.dispose();roomMat.dispose();softboxTexture.dispose();reflectors.forEach(p=>{p.geometry.dispose();p.material.dispose();});
 const ambient=new T.HemisphereLight(0xf0f3f5,0x595751,.78);scene.add(ambient);
 const key=new T.DirectionalLight(0xfff5e9,1.5);key.position.set(-10,43,24);key.target.position.copy(intoBuilding([CX,19,3.7]));scene.add(key,key.target);
 key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-15,right:15,top:25,bottom:-25,near:1,far:90});key.shadow.bias=-.00015;key.shadow.normalBias=.025;key.shadow.radius=3;
 const upperLight=new T.PointLight(0xf1f4f6,26,38,1.7);upperLight.position.set(CX,35,4.8);interiorWorld.add(upperLight);
 const texture=(kind)=>{const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');let seed=9217;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  ctx.fillStyle=kind==='metal'?'#a8acaf':'#8b8986';ctx.fillRect(0,0,512,512);
  if(kind==='metal'){for(let x=0;x<512;x++){const n=143+Math.floor(rnd()*24);ctx.strokeStyle=`rgba(${n},${n},${n},.13)`;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}}
  else{const data=ctx.getImageData(0,0,512,512);for(let i=0;i<data.data.length;i+=4){const n=148+rnd()*18;data.data[i]=n;data.data[i+1]=n*.99;data.data[i+2]=n*.95;}ctx.putImageData(data,0,0);for(let n=0;n<180;n++){ctx.fillStyle=`rgba(45,45,42,${rnd()*.025})`;ctx.beginPath();ctx.ellipse(rnd()*512,rnd()*512,4+rnd()*45,3+rnd()*18,rnd()*Math.PI,0,Math.PI*2);ctx.fill();}}
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);return t;
 };
 const metalTexture=texture('metal');
 // CC0 PBR sets provide correlated color, normal and roughness detail.
 // Normal maps use OpenGL orientation and linear color space; only color is sRGB.
 const material=(color,roughness=.5,metalness=0,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
 // Keep macro color variation restrained while retaining the fine-scale pores.
 function finishAlbedo(mat,base,detail){
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 diffuseColor.rgb=mix(vec3(${base}),diffuseColor.rgb,${detail});`);};
  mat.customProgramCacheKey=()=>`finish-${base}-${detail}`;return mat;
 }
 const concrete=finishAlbedo(material(new T.Color(1.55,1.54,1.49),1,0,{map:concreteTexture,normalMap:concreteNormal,normalScale:new T.Vector2(.34,.34),roughnessMap:concreteRoughness,envMapIntensity:.12}),'.42,.412,.39','.39');concrete.userData.tileSize=1.4;
 // Cast-concrete formwork follows metre-scaled wall UVs, independent of the
 // small PBR grain. Derivative filtering keeps thin joints stable at a distance.
 const concreteColorFinish=concrete.onBeforeCompile;
 concrete.onBeforeCompile=shader=>{
  concreteColorFinish(shader);
  shader.vertexShader='varying vec3 vFormNormal;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vFormNormal=normal;');
  shader.fragmentShader=`varying vec3 vFormNormal;
   float formHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
   vec2 wall=vMapUv*1.4,pitch=vec2(1.22,2.44);
   vec2 cell=floor(wall/pitch),local=mod(wall,pitch),fw=max(fwidth(wall),vec2(.0005));
   vec2 edge=min(local,pitch-local);
   vec2 joint=1.0-smoothstep(vec2(.003)-fw,vec2(.007)+fw,edge);
   float vertical=1.0-smoothstep(.3,.7,abs(vFormNormal.y));
   float jointMask=max(joint.x,joint.y)*vertical;
   float panelVariation=(formHash(cell)-.5)*.055;
   vec2 ties=vec2(.61,1.22),tieCell=floor(wall/ties);
   vec2 offset=vec2(formHash(tieCell),formHash(tieCell+31.7))-.5;
   vec2 tie=mod(wall,ties)-ties*.5-offset*.025;
   float radius=length(tie),aa=max(fw.x,fw.y);
   float holes=(1.0-smoothstep(.012-aa,.019+aa,radius))*step(.17,formHash(tieCell+7.1))*vertical;
   float rim=(1.0-smoothstep(.022-aa,.028+aa,radius))*(1.0-holes)*vertical;
   float drips=exp(-abs(tie.x)*75.0)*smoothstep(-.27,-.04,tie.y)*(1.0-smoothstep(-.035,.0,tie.y))*vertical;
   vec2 grainCell=floor(wall*42.0),grainLocal=fract(wall*42.0);
   vec2 grainCenter=.2+.6*vec2(formHash(grainCell+19.0),formHash(grainCell+47.0));
   float grainRadius=.06+.10*formHash(grainCell+8.0),grainAA=max(fw.x,fw.y)*42.0;
   float pores=(1.0-smoothstep(grainRadius-grainAA,grainRadius+grainAA,length(grainLocal-grainCenter)))*exp(-grainAA*grainAA*2.0)*step(.4,formHash(grainCell+63.0));
   diffuseColor.rgb*=1.0+panelVariation*vertical-jointMask*.17-holes*.38-rim*.045-drips*.035-pores*.18;
   #include <color_fragment>`);
 };
 concrete.customProgramCacheKey=()=> 'cast-concrete-reference-v17';
 const steel=new T.MeshPhysicalMaterial({color:0xf3f5f6,map:stainlessColor,roughness:.82,metalness:.96,normalMap:stainlessNormal,normalScale:new T.Vector2(.12,.12),roughnessMap:stainlessRoughness,anisotropy:.45,anisotropyRotation:Math.PI/2,envMapIntensity:.95});steel.userData.tileSize=.65;
 const railFace=finishAlbedo(new T.MeshPhysicalMaterial({color:0xffffff,map:railMaps[0],metalness:1,roughness:.48,roughnessMap:railMaps[2],normalMap:railMaps[1],normalScale:new T.Vector2(.10,.10),anisotropy:.58,anisotropyRotation:Math.PI/2,envMapIntensity:1.5}),'.72,.74,.76','.20');
 const railSide=finishAlbedo(material(0xced4da,.92,1,{map:railMaps[0],normalMap:railMaps[1],normalScale:new T.Vector2(.18,.18),roughnessMap:railMaps[2],envMapIntensity:1.2}),'.40,.43,.46','.25');
 const cableSteel=material(0x555d63,.62,.88,{roughnessMap:metalTexture,envMapIntensity:.3});
 const charcoal=material(0x353a3c,.72,.28,{roughnessMap:metalTexture,envMapIntensity:.3}),dark=material(0x1c2022,.88,.05),galvanized=material(0xb7bab8,.68,.82,{map:roofColor,normalMap:roofNormal,normalScale:new T.Vector2(.18,.18),roughnessMap:roofRoughness,envMapIntensity:.7});galvanized.userData.tileSize=1.2;
 const fittingZinc=finishAlbedo(material(0xd2d8d9,.82,.87,{map:roofColor,normalMap:roofNormal,normalScale:new T.Vector2(.06,.06),roughnessMap:roofRoughness,envMapIntensity:1.05}),'.48,.51,.52','.15');
 const framePaint=material(0x707e7e,.72,.5,{normalMap:roofNormal,normalScale:new T.Vector2(.04,.04),envMapIntensity:.75});
 const fittingBolt=material(0xb9c0c4,.36,.93,{envMapIntensity:1.25}),washer=material(0x50575b,.67,.82);
 const cableRubber=material(0x272d30,.9,.03),safetyYellow=material(0xc2a344,.73,.12),stopRed=material(0x9e3025,.55,.08),labelPlate=material(0xc8c9bd,.9,.05);
 const fittings={zinc:fittingZinc,frame:framePaint,bolt:fittingBolt,washer,cable:cableRubber,yellow:safetyYellow,red:stopRed,label:labelPlate};
 const joint=material(0x64635e,.96,0);
 const conduit=material(0x3a4144,.66,.5),rubber=material(0x11171b,.9,0),lightMat=new T.MeshBasicMaterial({color:0xe9f3ff,toneMapped:false});
 const boxGeometry=new T.BoxGeometry(1,1,1),cylGeometry=new T.CylinderGeometry(1,1,1,12);
 function box(parent,x,y,z,w,h,d,mat,shadow=false){
  let g=boxGeometry;
  if(mat.map||mat.bumpMap||mat.roughnessMap){
   g=boxGeometry.clone();const pos=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv,tile=mat.userData.tileSize||1;
   for(let i=0;i<pos.count;i++){
    const px=pos.getX(i)*w+x,py=pos.getY(i)*h+y,pz=pos.getZ(i)*d+z;
    uv.setXY(i,(Math.abs(norm.getX(i))>.5?pz:px)/tile,(Math.abs(norm.getY(i))>.5?pz:py)/tile);
   }
  }
  const m=new T.Mesh(g,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m;
 }
 function cyl(parent,x,y,z,r,h,mat){const m=new T.Mesh(cylGeometry,mat);m.position.set(x,y,z);m.scale.set(r,h,r);parent.add(m);return m;}
 // Millimetre-sized chamfers give the guide rail an actual reflective edge.
 // Broad running faces are machined steel; narrow returns retain a satin finish.
 function railBar(x,z,w,d,running=false){
  const r=Math.min(.0035,w*.1,d*.1),a=w/2,b=d/2,profile=[[-a+r,-b],[a-r,-b],[a,-b+r],[a,b-r],[a-r,b],[-a+r,b],[-a,b-r],[-a,-b+r]],positions=[],uvs=[],g=new T.BufferGeometry();
  function vertex(p,y,u){positions.push(p[0],y,p[1]);uvs.push(u,y/.65);}
  let distance=0;
  for(let i=0;i<8;i++){
   const p=profile[i],q=profile[(i+1)%8],next=distance+Math.hypot(q[0]-p[0],q[1]-p[1]),start=positions.length/3;
   vertex(p,-18.5,distance/.25);vertex(p,18.5,distance/.25);vertex(q,18.5,next/.25);vertex(p,-18.5,distance/.25);vertex(q,18.5,next/.25);vertex(q,-18.5,next/.25);
   g.addGroup(start,6,i%2===1||running?0:1);distance=next;
  }
  for(const y of[-18.5,18.5])for(let i=0;i<8;i++){
   const start=positions.length/3,p=profile[i],q=profile[(i+1)%8];vertex([0,0],y,0);vertex(y>0?q:p,y,0);vertex(y>0?p:q,y,0);g.addGroup(start,3,1);
  }
  g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.computeVertexNormals();const mesh=new T.Mesh(g,[railFace,railSide]);mesh.position.set(x,18.5,z);mesh.castShadow=mesh.receiveShadow=true;shaft.add(mesh);
 }
 // Trace the original photograph's glass grid. Opaque mullions, floor bands,
 // canopy and lobby stay in front during hover; only the individual panes reveal.
 const paneColumns=[[827,827],[853,853],[878,878.6],[904,904.6],[931,932.2]].map(p=>new T.Vector2(...p));
 // Each pair is the observed horizontal boundary at photo x=830 and x=932.
 const paneRows=[[103,79.5],[155,134.6],[208,188.6],[262,244.7],[316,300.7],[370,356.7],[425,413.8],[480,471.8],[536,529.9],[592,587.9],[648,646],[705,705]].map(p=>new T.Vector2(...p));
 const reveal={value:0},entry={value:0},openingCorners={value:Array.from({length:4},()=>new T.Vector2())};
 const exteriorMat=new T.MeshBasicMaterial({map:exterior,transparent:true,depthWrite:false,toneMapped:false,side:T.FrontSide});
 exteriorMat.onBeforeCompile=shader=>{
  shader.uniforms.uReveal=reveal;shader.uniforms.uEntry=entry;shader.uniforms.uOpening=openingCorners;shader.uniforms.uPaneColumns={value:paneColumns};shader.uniforms.uPaneRows={value:paneRows};
  shader.fragmentShader=`uniform float uReveal;
   uniform vec2 uOpening[4];
   uniform float uEntry;
   uniform vec2 uPaneColumns[5];
   uniform vec2 uPaneRows[12];
   float glassPane(vec2 p){
    float column=0.0,row=0.0;
    float v=clamp((p.y-100.0)/605.0,0.0,1.0),h=(p.x-830.0)/102.0;
    for(int i=0;i<4;i++){
     float a=mix(uPaneColumns[i].x,uPaneColumns[i].y,v),b=mix(uPaneColumns[i+1].x,uPaneColumns[i+1].y,v);
     column=max(column,smoothstep(1.4,2.4,p.x-a)*smoothstep(1.4,2.4,b-p.x));
    }
    for(int i=0;i<11;i++){
     float a=mix(uPaneRows[i].x,uPaneRows[i].y,h),b=mix(uPaneRows[i+1].x,uPaneRows[i+1].y,h);
     row=max(row,smoothstep(1.8,3.1,p.y-a)*smoothstep(1.8,3.1,b-p.y));
    }
    return column*row;
   }
   float insideEdge(vec2 a,vec2 b,vec2 p){vec2 edge=b-a;return (edge.x*(p.y-a.y)-edge.y*(p.x-a.x))/max(length(edge),.0001);}
   `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
   float edge=1.0;
   for(int i=0;i<4;i++){edge=min(edge,insideEdge(uOpening[i],uOpening[(i+1)%4],vMapUv));}
   float opening=smoothstep(-.001,.004,edge);
   vec2 photoPixel=vec2(vMapUv.x*1672.0,(1.0-vMapUv.y)*941.0);
   float aperture=mix(glassPane(photoPixel),opening,uEntry);
   diffuseColor.rgb*=1.0-.12*uEntry*opening*(1.0-smoothstep(.003,.019,edge));
   diffuseColor.a*=1.0-uReveal*aperture;
   #include <alphatest_fragment>`);
 };
 // Back-project the measured window edges and floor rows into the common
 // facade plane. Floor brackets, landing doors and reveal slabs use these levels.
 const fromBuilding=p=>new T.Vector3(...p).sub(buildingFrame.position).applyAxisAngle(new T.Vector3(0,1,0),-buildingAngle).divide(buildingScale).add(pivot);
 function photoToFacade(px,py,z=12){
  const origin=fromBuilding([0,exteriorEye,8+exteriorDistance]);
  const ray=fromBuilding([(px/1672-.5)*PHOTO_W,20+(.5-py/941)*PHOTO_H,8]).sub(origin);
  return origin.addScaledVector(ray,(z-origin.z)/ray.z);
 }
 const rowLevel=row=>photoToFacade(878,mix(row.x,row.y,(878-830)/102)).y;
 const floorLevels=[.4,photoToFacade(878,847.35).y,photoToFacade(878,752.47).y,...paneRows.map(rowLevel).reverse()];
 const openingBounds={left:photoToFacade(827,400).x,right:photoToFacade(932,400).x,bottom:floorLevels[1],top:rowLevel(paneRows[0]),front:12,back:8.03};
 const openingAt=z=>[[openingBounds.left,openingBounds.bottom,z],[openingBounds.right,openingBounds.bottom,z],[openingBounds.right,openingBounds.top,z],[openingBounds.left,openingBounds.top,z]].map(intoBuilding);
 const openingWorld=openingAt(openingBounds.front),innerOpening=openingAt(openingBounds.back);
 function updateOpening(){
  if(camera.position.z<=8.1)return;
  openingWorld.forEach((p,i)=>{const t=(8-camera.position.z)/(p.z-camera.position.z);const x=mix(camera.position.x,p.x,t),y=mix(camera.position.y,p.y,t);openingCorners.value[i].set(x/PHOTO_W+.5,(y-20)/PHOTO_H+.5);});
 }
 const cityPlane=new T.Mesh(new T.PlaneGeometry(PHOTO_W,PHOTO_H),exteriorMat);cityPlane.position.set(0,20,8);cityPlane.renderOrder=20;scene.add(cityPlane);
 // All four reveals are planar. The sill and head are horizontal; the jambs,
 // rail brackets and facade edges use the same axes and vanishing directions.
 const recess=new T.Group();scene.add(recess);
 const recessMaterial=concrete.clone();recessMaterial.onBeforeCompile=concrete.onBeforeCompile;recessMaterial.customProgramCacheKey=concrete.customProgramCacheKey;recessMaterial.side=T.DoubleSide;recessMaterial.vertexColors=true;
 for(let i=0;i<4;i++){
  const j=(i+1)%4,points=[openingWorld[i],openingWorld[j],innerOpening[j],innerOpening[i]];
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.setIndex([0,1,2,0,2,3]);
  const span=points[0].distanceTo(points[1])/1.8,depth=points[0].distanceTo(points[3])/1.8;g.setAttribute('uv',new T.Float32BufferAttribute([0,0,span,0,span,depth,0,depth],2));
  const near=i===1?.58:.76,far=.32;g.setAttribute('color',new T.Float32BufferAttribute([near,near,near,near,near,near,far,far,far,far,far,far],3));g.computeVertexNormals();recess.add(new T.Mesh(g,recessMaterial));
 }
 // Short floor returns stop at the core, leaving the shaft itself clear.
 // Original photographic transoms supply the front edge instead of a second grid.
 const floorReturns=new T.Group();interiorWorld.add(floorReturns);
 const slab=concrete;
 for(const y of floorLevels.slice(2,-1))box(floorReturns,(openingBounds.left+openingBounds.right)/2,y-.08,(openingBounds.front+openingBounds.back)/2,openingBounds.right-openingBounds.left,.16,openingBounds.front-openingBounds.back,slab);
 // A full-scale enclosed shaft: floor divisions, real rail profiles, brackets and service runs.
 const shaft=new T.Group();shaft.position.x=CX;interiorWorld.add(shaft);
 for(const side of[-1,1])box(shaft,side*3.2,18.3,3.7,.28,37,8.5,createShaftWallMaterial(concrete,side,floorLevels));
 const backWall=box(shaft,0,18.3,-.55,6.6,37,.3,concrete);const landingDoors=new T.Group();shaft.add(landingDoors);
 box(shaft,0,-.3,3.7,6.5,.3,8.6,concrete);
 for(let floor=0;floor<floorLevels.length-1;floor++){
  const y=floorLevels[floor],height=floorLevels[floor+1]-y,doorHeight=Math.min(2.45,height-.24);
  for(const x of [-3.04,3.04]){
   box(shaft,x,y,3.7,.012,.018,8.2,joint);
  }
  box(landingDoors,0,y,-.35,6.1,.06,.04,charcoal);
  // Back of landing door assembly and header, visible between rails.
  box(landingDoors,0,y+.12+doorHeight/2,-.28,2.5,doorHeight,.06,galvanized);box(landingDoors,0,y+.12+doorHeight/2,-.235,.035,doorHeight-.05,.015,dark);
  box(landingDoors,0,y+height-.12,-.12,2.9,.22,.28,charcoal);box(landingDoors,0,y+.05,-.1,2.9,.12,.35,steel);
  if(floor%2===0){box(shaft,-2.96,y+1.5,.15,.07,.68,.16,charcoal);box(shaft,-2.9,y+1.5,.15,.025,.57,.08,lightMat);}
 }
 for(const sign of[-1,1]){railBar(sign*2.43,3.7,.065,.3);railBar(sign*2.30,3.7,.24,.1,true);}
 addShaftHardware(shaft,landingDoors,floorLevels,fittings);
 const dummy=new T.Object3D();
 const machinery=new T.Group();machinery.position.set(0,36.5,3.7);shaft.add(machinery);
 for(const x of [-2.5,2.5])box(machinery,x,0,0,.28,.35,5.4,charcoal);
 box(machinery,0,.22,0,3.7,.16,2.1,galvanized);box(machinery,-.8,.55,0,1.2,.62,1.3,charcoal);
 const wheel=new T.Mesh(new T.CylinderGeometry(.63,.63,.4,40),steel);wheel.rotation.x=Math.PI/2;wheel.position.set(.15,.88,.28);machinery.add(wheel);
 for(let i=0;i<5;i++){const ring=new T.Mesh(new T.TorusGeometry(.62,.012,6,40),dark);ring.position.set(.15,.88,.11+i*.08);machinery.add(ring);}
 const ropes=new T.Group();shaft.add(ropes);for(let i=0;i<5;i++)cyl(ropes,-1.7+i*.09,0,3.85,.012,1,cableSteel);
 const weight=new T.Group();shaft.add(weight);box(weight,2.66,0,.6,.34,3.4,1.05,charcoal);for(let i=0;i<10;i++)box(weight,2.66,-1.45+i*.31,.6,.4,.25,1.1,galvanized);
 const lowLight=new T.PointLight(0xe9edf0,16,22,1.7);lowLight.position.set(CX-1.5,17,.4);interiorWorld.add(lowLight);
 // The cabin is a geometric space. Photographic projection supplies its brushed-metal detail.
 const cabin=new T.Group();cabin.scale.y=CABIN_HEIGHT_SCALE;cabin.position.set(CX,5,CZ);cabin.rotation.y=Math.PI;interiorWorld.add(cabin);
 const refCamera=new T.PerspectiveCamera(50,1672/941,.01,50);refCamera.position.set(0,1.9,-1.8);refCamera.lookAt(0,1.9,2.05);refCamera.updateMatrixWorld();
 const photoMatrix=new T.Matrix4().multiplyMatrices(refCamera.projectionMatrix,refCamera.matrixWorldInverse);
 const photoMaterial=new T.ShaderMaterial({uniforms:{photo:{value:interior},grain:{value:metalTexture},baseColor:{value:new T.Color(0x848682)},surfaceMetal:{value:1},surfaceKind:{value:0},pbrColor:{value:stainlessColor},pbrNormal:{value:stainlessNormal},pbrRoughness:{value:stainlessRoughness},reflectionMap:{value:null},layerOpacity:{value:1}},side:T.DoubleSide,toneMapped:false,
  defines:{ENVMAP_TYPE_CUBE_UV:'',CUBEUV_TEXEL_WIDTH:1/environment.texture.image.width,CUBEUV_TEXEL_HEIGHT:1/environment.texture.image.height,CUBEUV_MAX_MIP:(Math.log2(environment.texture.image.height)-2).toFixed(1)},
  vertexShader:'attribute vec4 photoCoord; varying vec4 vPhoto; varying vec3 vLocal; varying vec3 vLocalNormal; varying vec3 vSurfaceNormal; varying vec3 vView; void main(){ vPhoto=photoCoord; vLocal=position; vLocalNormal=normal; vSurfaceNormal=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vView=-mv.xyz; gl_Position=projectionMatrix*mv; }',
  fragmentShader:`#include <common>
   #include <cube_uv_reflection_fragment>
   varying vec4 vPhoto;
   varying vec3 vLocal;
   varying vec3 vLocalNormal;
   varying vec3 vSurfaceNormal;
   varying vec3 vView;
   uniform float surfaceMetal;
   uniform float surfaceKind;
   uniform sampler2D photo;
   uniform sampler2D grain;
   uniform sampler2D pbrColor;
   uniform sampler2D pbrNormal;
   uniform sampler2D pbrRoughness;
   uniform sampler2D reflectionMap;
   uniform vec3 baseColor;
   uniform float layerOpacity;
   mat3 materialFrame(vec3 eye,vec3 n,vec2 uv){
    vec3 q0=dFdx(eye),q1=dFdy(eye),q1p=cross(q1,n),q0p=cross(n,q0);
    vec2 s0=dFdx(uv),s1=dFdy(uv);
    vec3 t=q1p*s0.x+q0p*s1.x,b=q1p*s0.y+q0p*s1.y;
    float scale=inversesqrt(max(max(dot(t,t),dot(b,b)),.00000001));
    return mat3(t*scale,b*scale,n);
   }
   void main(){
    vec2 uv=vPhoto.xy/max(vPhoto.w,.001)*.5+.5;
    float valid=smoothstep(.15,.7,vPhoto.w)*smoothstep(0.0,.05,uv.x)*(1.0-smoothstep(.95,1.0,uv.x))*smoothstep(0.0,.05,uv.y)*(1.0-smoothstep(.95,1.0,uv.y));
    vec3 fallback=baseColor*(.96+.08*texture2D(grain,vLocal.xy*.4).r);
    // Portrait views see beyond the photograph. Continue the actual floor and
    // ceiling finishes there instead of stretching pixels or leaving flat bands.
    if(surfaceKind>0.5&&surfaceKind<1.5){
     float stone=texture2D(grain,vLocal.xz*.65).r;
     vec2 tile=abs(fract(vLocal.xz/.9)-.5);
     float grout=smoothstep(.489,.499,max(tile.x,tile.y));
     fallback=vec3(.065,.075,.082)*(0.8+stone*.85)*(1.0-grout*.23);
    }else if(surfaceKind>1.5){
     float brushed=texture2D(grain,vLocal.xz*.8).r;
     float seam=1.0-smoothstep(.004,.012,abs(abs(vLocal.x)-.72));
     float light=(1.0-smoothstep(.022,.038,abs(abs(vLocal.x)-1.72)))*smoothstep(-1.95,-1.8,vLocal.z)*(1.0-smoothstep(1.65,1.8,vLocal.z));
     fallback=vec3(.16,.175,.185)*(.88+brushed*.2)*(1.0-seam*.35)+vec3(.58,.6,.61)*light;
    }
    vec3 sampleColor=texture2D(photo,clamp(uv,vec2(.001),vec2(.999))).rgb;
    float indicator=step(770.0/1672.0,uv.x)*step(uv.x,902.0/1672.0)*step(1.0-110.0/941.0,uv.y)*step(uv.y,1.0-60.0/941.0);
    sampleColor=mix(sampleColor,vec3(.0025,.004,.006),indicator);
    sampleColor=mix(sampleColor,vec3(dot(sampleColor,vec3(.2126,.7152,.0722))),.025);
    float brush=texture2D(grain,vLocal.xy*1.4).r;
    sampleColor*=1.0+(brush-.66)*.045*surfaceMetal;
    vec3 n=normalize(vSurfaceNormal),v=normalize(vView);
    float grazing=pow(1.0-abs(dot(n,v)),3.0);
    float strip=smoothstep(.65,.98,abs(reflect(-v,n).x));
    vec3 finish=mix(fallback,sampleColor,valid)+vec3(.024,.023,.021)*strip*grazing*surfaceMetal;
    // Hairline direction, microscopic normal and varying roughness respond to
    // the same service-light environment as the real steel outside the cabin.
    vec2 metalUv=abs(vLocalNormal.y)>.5?vLocal.xz/.65:vec2(vLocal.y,abs(vLocalNormal.x)>.5?vLocal.z:vLocal.x)/.65;
    float rough=clamp(texture2D(pbrRoughness,metalUv).g*.7+.22,.3,.7);
    vec3 detail=texture2D(pbrNormal,metalUv).xyz*2.0-1.0;detail.xy*=.16;
    vec3 brushedNormal=normalize(materialFrame(-vView,n,metalUv)*detail);
    vec3 reflected=inverseTransformDirection(reflect(-v,brushedNormal),viewMatrix);
    vec3 reflectedLight=textureCubeUV(reflectionMap,reflected,rough).rgb;
    float panel=step(1168.0/1672.0,uv.x)*step(uv.x,1265.0/1672.0)*step(1.0-640.0/941.0,uv.y)*step(uv.y,1.0-300.0/941.0);
    float finishMask=surfaceMetal*(1.0-indicator)*(1.0-panel)*smoothstep(.015,.08,dot(finish,vec3(.2126,.7152,.0722)));
    vec3 tint=texture2D(pbrColor,metalUv).rgb;
    finish*=1.0+(tint-vec3(.42))*.14*finishMask;
    finish=mix(finish,reflectedLight*vec3(.84,.87,.89),(.11+.08*grazing)*finishMask);
    gl_FragColor=vec4(finish,layerOpacity);
    #include <colorspace_fragment>
   }`
 });
 // Render-target textures must be shared explicitly rather than cloned with uniforms.
 photoMaterial.uniforms.reflectionMap.value=environment.texture;
 function clonePhotoMaterial(){photoMaterial.uniforms.reflectionMap.value=null;const mat=photoMaterial.clone();photoMaterial.uniforms.reflectionMap.value=mat.uniforms.reflectionMap.value=environment.texture;return mat;}
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
 const floorPhoto=photoQuad([[-2.15,.1,-2.15],[2.15,.1,-2.15],[2.15,.1,2.05],[-2.15,.1,2.05]]);floorPhoto.material=clonePhotoMaterial();floorPhoto.material.uniforms.baseColor.value=new T.Color(0x343b40);floorPhoto.material.uniforms.grain.value=concreteTexture;floorPhoto.material.uniforms.surfaceMetal.value=0;floorPhoto.material.uniforms.surfaceKind.value=1;
 box(cabin,0,1.82,-2.24,4.4,3.65,.15,galvanized,true);
 for(const x of [-2.22,2.22])box(cabin,x,1.8,0,.13,3.6,4.45,galvanized,true);
 box(cabin,0,0,0,4.5,.18,4.5,charcoal);
 // The intact roof fades away as the camera approaches; no hatch or mechanical
 // opening. Only roof-specific materials fade, leaving walls and rails unchanged.
 const roof=new T.Group();cabin.add(roof);
 // A local maintenance light follows the car. Its tightly bounded shadow map
 // resolves the frame cavities, mounting feet and equipment cast shadows.
 const roofKey=new T.SpotLight(0xf5f3ed,38,11,.55,.8,2);
 roofKey.position.set(-2.5,8.2,-2.7);roofKey.target.position.set(.1,3.69,.15);roof.add(roofKey,roofKey.target);
 roofKey.castShadow=true;roofKey.shadow.mapSize.set(1024,1024);roofKey.shadow.camera.near=.3;roofKey.shadow.camera.far=11;
 roofKey.shadow.bias=-.00005;roofKey.shadow.normalBias=.004;roofKey.shadow.radius=2;
 // Dedicated satin steel maps retain the approved folded-sheet geometry.
 const roofSteel=finishAlbedo(new T.MeshPhysicalMaterial({color:0xf1f2f2,map:roofColor,metalness:.82,roughness:.88,roughnessMap:roofRoughness,normalMap:roofNormal,normalScale:new T.Vector2(.10,.10),anisotropy:.2,envMapIntensity:1.1}),'.38,.405,.42','.18');roofSteel.userData.tileSize=.9;
 // Restrained contact occlusion stays fixed to the deck and fades with it.
 // It complements the local cast shadows at narrow frame/foot intersections.
 const roofFinish=roofSteel.onBeforeCompile;
 roofSteel.onBeforeCompile=shader=>{
  roofFinish(shader);
  shader.fragmentShader=`float roofBoxDistance(vec2 p,vec2 center,vec2 halfSize){vec2 q=abs(p-center)-halfSize;return length(max(q,0.0))+min(max(q.x,q.y),0.0);}
   float roofContact(vec2 p,vec2 center,vec2 size,float softness){return 1.0-smoothstep(-.018,softness,roofBoxDistance(p,center,size));}
   `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
   vec2 deck=vMapUv*.9;
   float sideContact=max(roofContact(deck,vec2(-1.58,0.),vec2(.15,1.875),.09),roofContact(deck,vec2(1.58,0.),vec2(.15,1.875),.09));
   float crossShadow=max(roofContact(deck,vec2(.12,-.75),vec2(1.86,.14),.13),roofContact(deck,vec2(.12,1.01),vec2(1.86,.14),.13));
   float enclosureContact=roofContact(deck,vec2(-1.02,-1.39),vec2(.32,.37),.10);
   diffuseColor.rgb*=1.0-.32*max(sideContact,enclosureContact)-.18*crossShadow;
   #include <color_fragment>`);
 };
 roofSteel.customProgramCacheKey=()=> 'roof-depth-contact-v18';
 const foldedEdge=material(0xe0e5e8,.72,.96,{map:stainlessColor,normalMap:stainlessNormal,normalScale:new T.Vector2(.12,.12),roughnessMap:stainlessRoughness,envMapIntensity:1.0});foldedEdge.userData.tileSize=.7;
 box(roof,0,3.63,0,4.5,.1,4.5,foldedEdge,true);
 for(const x of[-1.48,0,1.48])box(roof,x,3.689,0,1.465,.018,4.42,roofSteel,true);
 for(const x of[-2.22,2.22])box(roof,x,3.70,0,.045,.065,4.5,foldedEdge,true);
 for(const z of[-2.22,2.22])box(roof,0,3.70,z,4.45,.065,.045,foldedEdge,true);
 // Flush inspection cover, inset gasket and small hex fixings.
 box(roof,.65,3.704,.42,1.18,.012,1.02,dark);
 box(roof,.65,3.716,.42,1.14,.016,.98,roofSteel,true);
 const roofFixings=[];for(const x of[-2.13,-.74,.74,2.13])for(const z of[-2.1,-.7,.7,2.1])roofFixings.push([x,3.708,z]);
 for(const x of[.15,1.15])for(const z of[.01,.83])roofFixings.push([x,3.733,z]);
 const roofBolts=new T.InstancedMesh(new T.CylinderGeometry(.026,.026,.012,6),steel,roofFixings.length);
 roofFixings.forEach((p,i)=>{dummy.position.set(...p);dummy.rotation.set(0,0,0);dummy.updateMatrix();roofBolts.setMatrixAt(i,dummy.matrix);});roof.add(roofBolts);
 addRoofHardware(roof,fittings);
 const roofMaterials=new Map();
 roof.traverse(o=>{if(!o.isMesh)return;const original=o.material;if(!roofMaterials.has(original)){const faded=original.clone();faded.onBeforeCompile=original.onBeforeCompile;faded.customProgramCacheKey=original.customProgramCacheKey;faded.transparent=false;faded.depthWrite=true;roofMaterials.set(original,faded);}o.material=roofMaterials.get(original);});
 const ceiling=photoQuad([[-2.15,3.52,-2.15],[2.15,3.52,-2.15],[2.15,3.52,2.05],[-2.15,3.52,2.05]]);
 ceiling.material=clonePhotoMaterial();ceiling.material.uniforms.surfaceKind.value=2;ceiling.material.transparent=true;ceiling.material.depthWrite=false;ceiling.material.side=T.FrontSide;
 // A shallow textured door recess and sill add true depth at the opening.
 for(const x of[left-.04,right+.04])box(cabin,x,(top+bottom)/2,2.12,.07,top-bottom+.1,.22,charcoal);
 box(cabin,mid,bottom-.03,2.15,right-left+.12,.07,.35,steel);
 for(const z of[2.01,2.09,2.17])box(cabin,mid,bottom+.01,z,right-left,.006,.012,dark);
 const frameTop=box(cabin,mid,top+.035,2.1,right-left+.12,.08,.2,charcoal);
 // Slim stainless returns catch the light around the photographed door frame.
 for(const x of[left-.012,right+.012])box(cabin,x,(top+bottom)/2,2.015,.022,top-bottom,.05,steel);
 box(cabin,mid,top+.012,2.015,right-left+.044,.024,.05,steel);
 // Floor display and control hotspots stay in the photographic control-panel positions.
 const displayCanvas=document.createElement('canvas');displayCanvas.width=512;displayCanvas.height=192;const displayTexture=new T.CanvasTexture(displayCanvas);displayTexture.colorSpace=T.SRGBColorSpace;displayTexture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 const d1=frontPoint(770,60,1.985),d2=frontPoint(902,110,1.985),displayMesh=new T.Mesh(new T.PlaneGeometry(Math.abs(d2.x-d1.x),Math.abs(d2.y-d1.y)),new T.MeshBasicMaterial({map:displayTexture,toneMapped:false}));
 const displayCenter=d1.clone().add(d2).multiplyScalar(.5);
 box(cabin,displayCenter.x,displayCenter.y,2.006,Math.abs(d2.x-d1.x)+.026,Math.abs(d2.y-d1.y)+.026,.027,charcoal);
 displayMesh.position.copy(displayCenter);displayMesh.rotation.y=Math.PI;cabin.add(displayMesh);
 function setFloor(n){const ctx=displayCanvas.getContext('2d');ctx.fillStyle='#080d13';ctx.fillRect(0,0,512,192);ctx.fillStyle='#edf6ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 112px Arial';ctx.fillText(String(n).padStart(2,'0'),310,103);ctx.lineWidth=12;ctx.lineCap='square';ctx.lineJoin='miter';ctx.strokeStyle='#c8e6f7';ctx.beginPath();ctx.moveTo(150,132);ctx.lineTo(150,62);ctx.moveTo(120,92);ctx.lineTo(150,62);ctx.lineTo(180,92);ctx.stroke();displayTexture.needsUpdate=true;}
 const hitMaterial=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:T.DoubleSide});const hits=[];
 function panelHit(px,py,action){const p=frontPoint(px,py,1.98),m=new T.Mesh(new T.CircleGeometry(.07,16),hitMaterial);m.position.copy(p);m.rotation.y=Math.PI;cabin.add(m);hits.push({mesh:m,action});}
 for(let row=0;row<6;row++)for(let col=0;col<2;col++)panelHit(col?1236:1199,365+row*30.6,`floor:${11-row*2+col}`);
 panelHit(1199,569,'open');panelHit(1236,569,'close');panelHit(1218,600,'alarm');
 const raycaster=new T.Raycaster();let canControl=false,pointerDown=null;
 function hitAt(e){const r=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);return raycaster.intersectObjects(hits.map(h=>h.mesh))[0];}
 renderer.domElement.addEventListener('pointermove',e=>{if(!canControl)return;renderer.domElement.style.cursor=hitAt(e)?'pointer':'';});
 renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDown)return;const moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);pointerDown=null;if(!canControl||moved>10)return;const hit=hitAt(e);if(hit)onAction(hits.find(h=>h.mesh===hit.object).action);});
 // Architectural photography uses a low eye line with an upward lens shift.
 // Keep that optical center fixed on every viewport; crop with the lens, not by
 // moving the camera, so the inset geometry and the photo retain the same view.
 let w=1,h=1,mobile=false,initial=[0,exteriorEye,8+exteriorDistance],startFov=34,lensX=0,lensY=0;
 function resize(width,height){w=width;h=height;mobile=w<700;renderer.setSize(w,h);camera.aspect=w/h;
  const halfHeight=Math.min(PHOTO_H/2,PHOTO_W/(2*camera.aspect)),halfWidth=halfHeight*camera.aspect;
  startFov=2*T.MathUtils.radToDeg(Math.atan(halfHeight/exteriorDistance));
  lensY=(20-exteriorEye)/halfHeight;lensX=mobile?(PHOTO_W-2*halfWidth)*.08/halfWidth:0;
 }
 // Continuous Hermite position/target tracks keep direction and velocity coherent across scene labels.
 function interpolate(keys,u,field){let i=0;while(i<keys.length-2&&u>keys[i+1].u)i++;const a=keys[i],b=keys[i+1],p=keys[Math.max(0,i-1)],n=keys[Math.min(keys.length-1,i+2)];const t=clamp((u-a.u)/(b.u-a.u)),dt=b.u-a.u;
  return a[field].map((v,j)=>{const d0=(a[field][j]-p[field][j])/Math.max(.01,a.u-p.u),d1=(b[field][j]-a[field][j])/dt,d2=(n[field][j]-b[field][j])/Math.max(.01,n.u-b.u);const tangent=(x,y)=>x*y<=0?0:Math.sign(x)*Math.min(Math.abs((x+y)/2),3*Math.min(Math.abs(x),Math.abs(y)));const m0=tangent(d0,d1)*dt,m1=tangent(d1,d2)*dt;return(2*t*t*t-3*t*t+1)*v+(t*t*t-2*t*t+t)*m0+(-2*t*t*t+3*t*t)*b[field][j]+(t*t*t-t*t)*m1;});
 }
 function update(u,peek,door,reduced){
  const interiorFov=2*T.MathUtils.radToDeg(Math.atan(Math.tan(T.MathUtils.degToRad(25))*Math.max(1,1.02/camera.aspect)*CABIN_HEIGHT_SCALE/buildingScale.z));
  const eyeY=18+1.9*CABIN_HEIGHT_SCALE;
  const poses=[
   {u:0,p:initial,l:[0,exteriorEye,8]},
   {u:.55,p:[CX,30.8,34],l:intoBuilding([CX,30,4]).toArray()},
   // Clear the landing slab at 32.42 m before tilting down into the shaft.
   {u:.9,p:[CX,33.35,13.5],l:[CX,33.35,3.7],local:true},
   {u:1.03,p:[CX,33.35,9.2],l:[CX,33.20,3.7],local:true},
   {u:1.15,p:[CX,33.2,6.5],l:[CX,30.4,3.7],local:true},
   {u:1.45,p:[CX,29,3.7],l:[CX,18,3.65],local:true},
   {u:1.85,p:[CX,24.4,3.7],l:[CX,18.5,3.5],local:true},
   {u:2.15,p:[CX,20.85,3.7],l:[CX,eyeY,1.8],local:true},
   {u:2.5,p:[CX,eyeY,5.5],l:[CX,eyeY,1.65],local:true},
   {u:2.85,p:[CX,eyeY,5.5],l:[CX,eyeY,1.65],local:true},
   {u:3.55,p:[CX,eyeY,5.5],l:[CX,eyeY,1.65],local:true},
   {u:4.2,p:[CX,eyeY,-6],l:[CX,eyeY,-12],local:true}
  ];
  for(const pose of poses){if(pose.local){pose.p=intoBuilding(pose.p).toArray();pose.l=intoBuilding(pose.l).toArray();}}
  const p=interpolate(poses,u,'p'),l=interpolate(poses,u,'l');
  camera.position.set(...p);const tilt=phase(u,.82,1.43)*(1-phase(u,1.78,2.48));camera.up.set(0,1-tilt,-tilt).normalize().applyAxisAngle(new T.Vector3(0,1,0),buildingAngle);camera.lookAt(new T.Vector3(...l));
  camera.fov=mix(startFov,mobile?65:51,phase(u,.5,1.45));camera.fov=mix(camera.fov,interiorFov,phase(u,1.85,2.5));camera.updateProjectionMatrix();
  const lens=1-phase(u,0,.85);camera.projectionMatrix.elements[8]=lensX*lens;camera.projectionMatrix.elements[9]=lensY*lens;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();camera.updateMatrixWorld();
  entry.value=phase(u,.08,.58);reveal.value=Math.max(peek*.64,phase(u,.04,.58));updateOpening();cityPlane.visible=camera.position.z>8.05;
 const interiorLight=phase(u,.18,.85);ambient.intensity=mix(.58,.78,interiorLight);key.intensity=mix(1.05,1.5,interiorLight);upperLight.intensity=mix(19,26,interiorLight);
  const rise=phase(u,.92,2.12);cabin.position.y=mix(5,18,rise);weight.position.y=31-(cabin.position.y-5);
  const cable=Math.max(.1,36.9-(cabin.position.y+4.45*CABIN_HEIGHT_SCALE));ropes.scale.y=cable;ropes.position.y=cabin.position.y+4.45*CABIN_HEIGHT_SCALE+cable*.5;
  const roofOpacity=1-phase(u,1.48,2.04)*(1-phase(u,2.32,2.58));
  roofKey.intensity=38*roofOpacity;
  for(const mat of roofMaterials.values()){
   const fading=roofOpacity<.999;if(mat.transparent!==fading){mat.transparent=fading;mat.depthWrite=!fading;mat.needsUpdate=true;}mat.opacity=roofOpacity;
  }ceiling.material.uniforms.layerOpacity.value=roofOpacity;roof.visible=ceiling.visible=roofOpacity>.002;
  // Rails and walls stay in the same world; the camera physically passes their foreground edges.
  leafLeft.position.x=-(right-left)*.51*door;leafRight.position.x=(right-left)*.51*door;
  backWall.visible=u<2.3;landingDoors.visible=u<2.3;canControl=u>2.3&&u<2.88;renderer.domElement.style.pointerEvents=u>.6?'auto':'none';
  renderer.render(scene,camera);
  const hotspot=openingWorld[0].clone().add(openingWorld[2]).multiplyScalar(.5).project(camera);
  const projected=openingWorld.map(p=>p.clone().project(camera));
  return {hotspot:{x:(hotspot.x*.5+.5)*w,y:(-.5*hotspot.y+.5)*h},hoverBox:{left:Math.min(...projected.map(p=>(p.x*.5+.5)*w)),right:Math.max(...projected.map(p=>(p.x*.5+.5)*w)),top:Math.min(...projected.map(p=>(-.5*p.y+.5)*h)),bottom:Math.max(...projected.map(p=>(-.5*p.y+.5)*h))},camera:p,carY:cabin.position.y,roofOpacity};
 }
 function dispose(){renderer.dispose();environment.dispose();pbrTextures.forEach(t=>t.dispose());railMaps.forEach(t=>t.dispose());scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();}});}
 setFloor(7);return {resize,update,setFloor,dispose,canvas:renderer.domElement};
}
