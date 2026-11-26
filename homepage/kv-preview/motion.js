// Allocate more scroll distance to the two entries, without slowing the ending.
// x is native scroll progress; y is the existing scene timeline.
const keys = [[0, 0], [.35, 1.34], [.45, 1.72], [.69, 2.6], [1, 4.2]];
const slopes = keys.slice(1).map((p, i) => (p[1] - keys[i][1]) / (p[0] - keys[i][0]));
const tangents = keys.map((_, i) => {
  if (i === 0) return slopes[0];
  if (i === keys.length - 1) return slopes.at(-1);
  return 2 / (1 / slopes[i - 1] + 1 / slopes[i]);
});

export function sceneAtScroll(fraction) {
  const x = Math.min(1, Math.max(0, fraction));
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
  const width = x1 - x0, t = (x - x0) / width;
  return (2*t*t*t - 3*t*t + 1)*y0 + (t*t*t - 2*t*t + t)*width*tangents[i]
    + (-2*t*t*t + 3*t*t)*y1 + (t*t*t - t*t)*width*tangents[i + 1];
}

// Chapter links use the inverse map, so each link still reaches its exact scene.
export function scrollAtScene(scene) {
  let low = 0, high = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (sceneAtScroll(mid) < scene) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

// Reserve 7.2 seconds for the building entry instead of speeding every scene up.
export const AUTOPLAY_HOLD = 1;
export const AUTOPLAY_DURATION = 20;
const autoKeys = [[1,0],[8.2,1.34],[9.8,1.72],[13.5,2.6],[16.5,3.55],[20,4.2]];
const autoSlopes = autoKeys.slice(1).map((p,i)=>(p[1]-autoKeys[i][1])/(p[0]-autoKeys[i][0]));
const autoTangents = autoKeys.map((_,i)=>i===0||i===autoKeys.length-1?0:2/(1/autoSlopes[i-1]+1/autoSlopes[i]));
export function autoplayAtTime(seconds) {
  if(seconds<=AUTOPLAY_HOLD)return 0;
  if(seconds>=AUTOPLAY_DURATION)return 4.2;
  let i=0;while(i<autoKeys.length-2&&seconds>autoKeys[i+1][0])i++;
  const [t0,u0]=autoKeys[i],[t1,u1]=autoKeys[i+1],width=t1-t0,t=(seconds-t0)/width;
  return (2*t*t*t-3*t*t+1)*u0+(t*t*t-2*t*t+t)*width*autoTangents[i]
    +(-2*t*t*t+3*t*t)*u1+(t*t*t-t*t)*width*autoTangents[i+1];
}

// Critically damped progress plus a speed cap prevents a large wheel gesture or
// chapter jump from rushing through a doorway. Native scrolling is never trapped.
export function advanceMotion(position, velocity, target, seconds) {
  const dt = Math.min(.05, Math.max(0, seconds)), omega = 5;
  const error = position - target, c = velocity + omega * error;
  const decay = Math.exp(-omega * dt);
  let next = target + (error + c * dt) * decay;
  let nextVelocity = (velocity - omega * c * dt) * decay;
  const window = (a, b, c, d) => {
    const ease = x => { const t = Math.min(1, Math.max(0, x)); return t*t*(3-2*t); };
    return ease((position-a)/(b-a)) * (1-ease((position-c)/(d-c)));
  };
  const entry = Math.max(window(.1, .45, 1.18, 1.5), window(1.5, 1.72, 2.5, 2.72));
  const speed = 1.2 - .55 * entry, limit = speed * dt;
  if (Math.abs(next - position) > limit) {
    next = position + Math.sign(next - position) * limit;
    nextVelocity = Math.sign(nextVelocity) * speed;
  }
  if ((target - position) * (target - next) < 0) return [target, 0];
  if (Math.abs(target - next) < .0006 && Math.abs(nextVelocity) < .003) return [target, 0];
  return [next, nextVelocity];
}
