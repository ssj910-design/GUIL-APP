import * as T from './vendor/three.module.min.js';

// Small, repeated fittings share geometry and draw calls. Dimensions are visual
// references for this KV, not a manufacturer-specific installation drawing.
function hardwareBatch(parent) {
 const geometries=new Map(),batches=new Map(),pose=new T.Object3D();
 function geometry(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
 function put(g,mat,position,rotation=[0,0,0],scale=[1,1,1]){
  const key=`${g.uuid}:${mat.uuid}`;
  if(!batches.has(key))batches.set(key,{g,mat,matrices:[]});
  pose.position.set(...position);pose.rotation.set(...rotation);pose.scale.set(...scale);pose.updateMatrix();
  batches.get(key).matrices.push(pose.matrix.clone());
 }
 function plate(w,h,d,holes=[]){
  return geometry(`plate:${w}:${h}:${d}:${JSON.stringify(holes)}`,()=>{
   const s=new T.Shape(),x=-w/2,y=-h/2,r=Math.min(.012,w*.08,h*.08);
   s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
   s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
   s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
   s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
   for(const [hx,hy,hr] of holes){const hole=new T.Path();hole.absellipse(hx,hy,hr,hr,0,Math.PI*2,true);s.holes.push(hole);}
   const bevel=Math.min(.0015,d*.14),g=new T.ExtrudeGeometry(s,{depth:d-2*bevel,steps:1,curveSegments:4,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1});
   g.translate(0,0,-(d-2*bevel)/2);return g;
  });
 }
 function channel(length,width,height,thickness){
  return geometry(`channel:${length}:${width}:${height}:${thickness}`,()=>{
   const a=width/2,b=height/2,t=thickness,s=new T.Shape();
   [[-a,-b],[a,-b],[a,b],[a-t,b],[a-t,-b+t],[-a+t,-b+t],[-a+t,b],[-a,b]].forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();
   const g=new T.ExtrudeGeometry(s,{depth:length,steps:1,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:1});g.translate(0,0,-length/2);return g;
  });
 }
 function box(size,mat,position,rotation=[0,0,0]){
  put(geometry('box',()=>new T.BoxGeometry(1,1,1)),mat,position,rotation,size);
 }
 function cylinder(radius,height,mat,position,rotation=[0,0,0],segments=12){
  put(geometry(`cylinder:${segments}`,()=>new T.CylinderGeometry(1,1,1,segments)),mat,position,rotation,[radius,height,radius]);
 }
 function bar(a,b,radius,mat){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start);
  const euler=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize()));
  cylinder(radius,direction.length(),mat,start.add(end).multiplyScalar(.5).toArray(),[euler.x,euler.y,euler.z]);
 }
 function bolt(position,normal,mat,washerMat,radius=.025){
  const n=new T.Vector3(...normal).normalize(),base=new T.Vector3(...position);
  const e=new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),n)),rotation=[e.x,e.y,e.z];
  cylinder(radius*1.5,.006,washerMat,base.clone().addScaledVector(n,.003).toArray(),rotation);
  cylinder(radius,.018,mat,base.clone().addScaledVector(n,.014).toArray(),rotation,6);
  cylinder(radius*.53,.008,mat,base.clone().addScaledVector(n,.026).toArray(),rotation,8);
 }
 function cable(points,radius,mat){
  const g=new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal'),Math.max(16,points.length*5),radius,6,false);
  put(g,mat,[0,0,0]);
 }
 function flush(){
  for(const {g,mat,matrices} of batches.values()){
   const mesh=new T.InstancedMesh(g,mat,matrices.length);matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));
   mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);
  }
 }
 return {put,plate,channel,box,cylinder,bar,bolt,cable,flush};
}

export function addShaftHardware(shaft,landingDoors,levels,m){
 const h=hardwareBatch(shaft),doors=hardwareBatch(landingDoors);
 const anchorPlate=h.plate(.46,.32,.014,[[0,.105,.022],[0,-.105,.022]]);
 const arm=h.channel(.65,.28,.13,.012),clip=h.plate(.14,.07,.012);
 const servicePlate=h.plate(.62,.10,.012),trayPlate=h.plate(.48,.12,.012);
 for(let f=0;f<levels.length-1;f++){
  const y=levels[f]+.35;
  for(const sign of [-1,1]){
   // Anchored wall plate → open folded arm → thin rail clips; no solid blocks.
   h.put(anchorPlate,m.zinc,[sign*3.045,y,3.7],[0,Math.PI/2,0]);
   for(const dy of [-.095,.095])for(const z of [3.56,3.84])h.bolt([sign*3.032,y+dy,z],[-sign,0,0],m.bolt,m.washer);
   h.put(arm,m.zinc,[sign*2.70,y-.055,3.7],[0,Math.PI/2,0]);
   h.box([.38,.012,.42],m.zinc,[sign*2.38,y+.016,3.7]);
   for(const z of [3.55,3.85]){
    h.put(clip,m.bolt,[sign*2.35,y+.036,z],[-Math.PI/2,0,0]);
    h.box([.025,.032,.07],m.bolt,[sign*2.29,y+.047,z]);
    h.bolt([sign*2.40,y+.043,z],[0,1,0],m.bolt,m.washer,.021);
   }
  }
  h.put(servicePlate,m.zinc,[-3.045,y,.28],[0,Math.PI/2,0]);
  for(const z of [.03,.53])h.bolt([-3.03,y,z],[1,0,0],m.bolt,m.washer,.018);
  for(const z of [.16,.28,.40]){
   h.box([.036,.016,.065],m.zinc,[-3.01,y,z]);
   h.cylinder(.022,.032,m.zinc,[-2.99,y,z]);
  }
  h.put(trayPlate,m.zinc,[3.045,y,1],[0,Math.PI/2,0]);
  for(const z of [.83,1.17])h.bolt([3.03,y,z],[-1,0,0],m.bolt,m.washer,.018);
  // Shallow stiffening ribs on the back of each landing door.
  const height=Math.min(2.45,levels[f+1]-levels[f]-.24);
  for(const x of [-.87,0,.87])doors.put(doors.channel(height-.16,.075,.045,.009),m.zinc,[x,levels[f]+.12+height/2,-.232],[Math.PI/2,0,0]);
 }
 // Service risers lie against the wall, held by the small saddles above.
 for(const z of [.16,.28,.40])h.cylinder(.015,36.8,m.cable,[-2.99,18.4,z]);
 // Open ladder tray: thin folded edges, rungs, then three retained cable runs.
 for(const z of [.78,1.22]){
  h.box([.13,36.8,.012],m.zinc,[2.975,18.4,z]);
  h.box([.018,36.8,.035],m.zinc,[2.90,18.4,z]);
 }
 for(let y=.5;y<36.8;y+=.62)h.box([.018,.023,.44],m.zinc,[2.985,y,1]);
 for(const z of [.88,1,1.12])h.cylinder(.014,36.8,m.cable,[2.947,18.4,z]);
 h.flush();doors.flush();
}

export function addRoofHardware(roof,m){
 const h=hardwareBatch(roof),frame=h.channel(3.75,.22,.26,.016),cross=h.channel(3.72,.20,.28,.016);
 // Open channels make the depth and folded plate edges visible from above.
 for(const x of [-1.58,1.58])h.put(frame,m.frame,[x,3.85,0]);
 for(const z of [-.88,.88]){
  h.put(cross,m.frame,[0,3.99,z],[0,Math.PI/2,0]);
  for(const x of [-1.58,1.58]){
   h.put(h.plate(.34,.32,.018),m.zinc,[x,4.14,z],[-Math.PI/2,0,0]);
   for(const dx of [-.10,.10])for(const dz of [-.095,.095])h.bolt([x+dx,4.15,z+dz],[0,1,0],m.bolt,m.washer,.026);
  }
 }
 // Low inspection enclosure with a separate lid, pushbuttons, stop and glands.
 const control=h.plate(.64,.74,.25),lid=h.plate(.66,.76,.016);
 h.put(control,m.frame,[-1.05,3.84,-1.42],[-Math.PI/2,0,0]);
 h.put(lid,m.zinc,[-1.05,3.98,-1.42],[-Math.PI/2,0,0]);
 for(const dx of [-.265,.265])for(const dz of [-.315,.315])h.bolt([-1.05+dx,3.994,-1.42+dz],[0,1,0],m.bolt,m.washer,.012);
 h.cylinder(.075,.014,m.yellow,[-1.17,4.005,-1.5]);
 h.cylinder(.041,.032,m.cable,[-1.17,4.026,-1.5]);
 h.cylinder(.058,.037,m.red,[-1.17,4.057,-1.5]);
 for(const z of [-1.29,-1.12]){h.cylinder(.036,.012,m.bolt,[-.96,4.006,z]);h.cylinder(.027,.018,m.cable,[-.96,4.02,z]);}
 h.put(h.plate(.21,.08,.003),m.label,[-1.07,4.004,-1.70],[-Math.PI/2,0,0]);
 for(const x of [-1.19,-.94])h.cylinder(.03,.07,m.cable,[x,3.84,-1.02],[Math.PI/2,0,0]);
 // Compact door operator, motor and belt above the doorway; no free-floating parts.
 h.put(h.channel(3.48,.23,.18,.014),m.zinc,[0,3.92,1.82],[0,Math.PI/2,0]);
 h.cylinder(.14,.43,m.frame,[-1.16,4.13,1.82],[0,0,Math.PI/2],20);
 for(const x of [-1.34,-1.27,-1.20,-1.13,-1.06])h.cylinder(.145,.016,m.zinc,[x,4.13,1.82],[0,0,Math.PI/2],16);
 for(const x of [-.88,1.30]){
  h.cylinder(.108,.052,m.bolt,[x,4.13,1.82],[Math.PI/2,0,0],24);
  h.cylinder(.042,.068,m.cable,[x,4.13,1.82],[Math.PI/2,0,0]);
 }
 h.cable([[-.88,4.23,1.82],[.25,4.23,1.82],[1.30,4.23,1.82],[1.4,4.13,1.82],[1.30,4.03,1.82],[.25,4.03,1.82],[-.88,4.03,1.82],[-.98,4.13,1.82],[-.88,4.23,1.82]],.014,m.cable);
 // Routed cable loops rest on the deck and turn around the structural members.
 h.cable([[-1.19,3.84,-.99],[-1.22,3.77,-.78],[-1.26,3.77,-.48],[-1.30,3.77,.35],[-1.27,3.77,1.30],[-1.16,3.88,1.62]],.021,m.cable);
 h.cable([[-.94,3.84,-.99],[-.87,3.77,-.75],[-.72,3.77,-.42],[.25,3.77,-.34],[.8,3.77,-.46],[1.24,3.77,-.44],[1.30,3.77,.25],[1.27,3.89,.73]],.018,m.cable);
 h.cable([[-1.36,3.84,-1.32],[-1.48,3.76,-1.24],[-1.70,3.76,-1.13],[-1.73,3.86,-.9]],.009,m.yellow);
 for(const z of [-.5,.1,.6,1.2])h.put(h.plate(.12,.05,.009),m.zinc,[-1.29,3.797,z],[-Math.PI/2,0,0]);
 // Tubular perimeter guard, with base shoes instead of rectangular sticks.
 for(const x of [-1.98,1.98]){
  for(const z of [-1.7,1.7]){
   h.put(h.plate(.17,.16,.016),m.zinc,[x,3.72,z],[-Math.PI/2,0,0]);
   h.bar([x,3.73,z],[x,4.38,z],.024,m.zinc);
  }
  h.bar([x,4.38,-1.7],[x,4.38,1.7],.024,m.zinc);
  h.bar([x,4.04,-1.7],[x,4.04,1.7],.018,m.zinc);
 }
 h.flush();
}
