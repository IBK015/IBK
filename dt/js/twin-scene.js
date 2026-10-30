/* Scan-to-twin scene (point-cloud scan -> blueprint model -> heat -> priority -> explore).
   Built from REAL building footprints/heights. Used by the Digital Twin page (scroll story) and the portfolio card (loop). */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const z=(x,a,b)=>clamp((x-a)/(b-a),0,1);
const e3=t=>1-Math.pow(1-t,3);
const sm=t=>t*t*(3-2*t);
const HEAT=['#2563eb','#2dd4bf','#fde047','#fb923c','#ef4444'];
const lerpHex=(stops,t)=>{t=clamp(t,0,.9999)*(stops.length-1);const i=Math.floor(t);return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i+1]),t-i)};
export const CLASSES=[{k:'green_buffered',l:'Green-buffered',c:'#2dd4bf'},{k:'moderate_buffer',l:'Moderate buffer',c:'#fde047'},{k:'limited_buffer',l:'Limited buffer',c:'#fb923c'},{k:'high_heat_exposure',l:'High heat exposure',c:'#ef4444'}];
/* camera keyframes along story progress (multiples of R) */
const KEYS=[[0,.3,1.95,.95],[.2,.55,1.9,.9],[.4,1.05,1.8,.84],[.6,1.8,1.76,.8],[.8,2.35,2.35,1.02],[1,2.45,2.45,1.08]];
function camAt(t){let i=0;while(i<KEYS.length-2&&t>KEYS[i+1][0])i++;const A=KEYS[i],B=KEYS[i+1],f=sm(clamp((t-A[0])/(B[0]-A[0]),0,1));return{a:A[1]+(B[1]-A[1])*f,r:A[2]+(B[2]-A[2])*f,h:A[3]+(B[3]-A[3])*f}}

function inPoly(x,y,r){let c=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){const xi=r[i],yi=r[i+1],xj=r[j],yj=r[j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c}

const RISE_GLSL=`
  attribute float aDelay; uniform float uRise;
`;
function riseMaterial(mat){
  mat.onBeforeCompile=sh=>{
    sh.uniforms.uRise=mat.userData.uRise;
    sh.vertexShader=RISE_GLSL+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float rr=clamp((uRise-aDelay*0.6)/0.4,0.,1.); rr=1.-pow(1.-rr,3.); transformed.y*=max(rr,0.0005);');
  };
  return mat;
}

export function createTwin(opts){
  const canvas=opts.canvas,mode=opts.mode||'story',reduce=!!opts.reduce;
  const BG=0x030b17;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mode==='card'?1.5:2));renderer.setClearColor(BG);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(36,1,1,5000);
  const controls=new OrbitControls(camera,canvas);
  controls.enabled=false;controls.enableZoom=false;controls.enablePan=false;controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.35;
  controls.autoRotate=!reduce;controls.autoRotateSpeed=.5;
  scene.add(new THREE.HemisphereLight(0x9bc4ff,0x050b16,1.15));
  const sun=new THREE.DirectionalLight(0xcfe6ff,2);scene.add(sun);

  const S={p:0,B:0,step:0,layer:'neutral',user:null,exploring:false,R:600,visible:true,tgtMode:'neutral',pts:0,t0:performance.now(),last:performance.now(),cs:{a:.3,r:1.3,h:.66},data:null};
  let W=1,H=1,world=null,labels=[],hoverMesh=null,hoverIdx=-1,selIdx=-1,colorAnim=0,pending=null;
  const uni={uRise:{value:0},uScanX:{value:-1e6},uSize:{value:2.4},uScale:{value:500},uOpacity:{value:1},uR:{value:600}};

  function dispose(){
    if(!world)return;scene.remove(world.group);
    world.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())}});
    labels.forEach(l=>l.el.remove());labels=[];world=null;hoverMesh=null;
  }

  function build(data){
    dispose();S.data=data;const bs=data.b;
    let ext=0;bs.forEach(b=>{for(let i=0;i<b.r.length;i++)ext=Math.max(ext,Math.abs(b.r[i]))});
    const R=S.R=ext*1.08;uni.uR.value=R;
    scene.fog=new THREE.Fog(BG,R*2.4,R*6.5);camera.far=R*12;camera.near=R*.02;camera.updateProjectionMatrix();
    sun.position.set(R*.9,R*1.3,R*.5);
    controls.minDistance=R*.5;controls.maxDistance=R*3;
    const group=new THREE.Group();scene.add(group);

    /* buildings + edges + points */
    const bp=[],bn=[],bd=[],ranges=[],ep=[],ed=[],pts=[];let tv=0;
    const rnd=(()=>{let s=11;return()=>(s=(s*16807)%2147483647)/2147483647})();
    bs.forEach((b,idx)=>{
      const r=b.r,P=[];for(let i=0;i<r.length;i+=2)P.push(new THREE.Vector2(r[i],r[i+1]));
      let g;try{g=new THREE.ExtrudeGeometry(new THREE.Shape(P),{depth:Math.max(2.5,b.h),bevelEnabled:false})}catch(e){ranges.push([tv,tv]);return}
      g.rotateX(-Math.PI/2);
      let cx=0,cy=0;for(let i=0;i<r.length;i+=2){cx+=r[i];cy+=r[i+1]}cx/=r.length/2;cy/=r.length/2;b._cx=cx;b._cy=cy;
      const delay=clamp((cx+R)/(2*R),0,1)*.85+rnd()*.15;
      const pa=g.attributes.position.array,na=g.attributes.normal.array;bp.push(pa);bn.push(na);
      const nv=pa.length/3;ranges.push([tv,tv+nv]);for(let k=0;k<nv;k++)bd.push(delay);tv+=nv;
      const eg=new THREE.EdgesGeometry(g,25).attributes.position.array;ep.push(eg);for(let k=0;k<eg.length/3;k++)ed.push(delay);
      g.dispose();
      // point samples: roof + walls
      const h=Math.max(2.5,b.h);let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
      for(let i=0;i<r.length;i+=2){minx=Math.min(minx,r[i]);maxx=Math.max(maxx,r[i]);miny=Math.min(miny,r[i+1]);maxy=Math.max(maxy,r[i+1])}
      const area=(maxx-minx)*(maxy-miny),nr=clamp(Math.round(area*.06),5,48);
      for(let k=0,tries=0;k<nr&&tries<nr*6;tries++){const x=minx+rnd()*(maxx-minx),y=miny+rnd()*(maxy-miny);if(inPoly(x,y,r)){pts.push([x,h,-y]);k++}}
      for(let i=0;i<r.length;i+=2){const j=(i+2)%r.length,x0=r[i],y0=r[i+1],x1=r[j],y1=r[j+1],len=Math.hypot(x1-x0,y1-y0),n=Math.round(len*h*.05);
        for(let k=0;k<n;k++){const t=rnd();pts.push([x0+(x1-x0)*t,rnd()*h,-(y0+(y1-y0)*t)])}}
    });
    for(let i=0;i<3200;i++){pts.push([(rnd()-.5)*2*R,.1,(rnd()-.5)*2*R])}
    pts.sort((a,b)=>a[0]-b[0]);
    const flat=(arrs,total)=>{const o=new Float32Array(total);let k=0;arrs.forEach(a=>{o.set(a,k);k+=a.length});return o};
    const pos=flat(bp,tv*3),nor=flat(bn,tv*3);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    geo.setAttribute('aDelay',new THREE.BufferAttribute(new Float32Array(bd),1));
    const cur=new Float32Array(tv*3),tgt=new Float32Array(tv*3);const shade=new Float32Array(tv);for(let v=0;v<tv;v++)shade[v]=nor[v*3+1]>.5?1.15:.72;
    geo.setAttribute('color',new THREE.BufferAttribute(cur,3));geo.computeBoundingSphere();
    const bmat=riseMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.2}));bmat.userData.uRise=uni.uRise;
    const mesh=new THREE.Mesh(geo,bmat);mesh.frustumCulled=false;group.add(mesh);
    const eN=ep.reduce((s,a)=>s+a.length,0),eGeo=new THREE.BufferGeometry();eGeo.setAttribute('position',new THREE.BufferAttribute(flat(ep,eN),3));eGeo.setAttribute('aDelay',new THREE.BufferAttribute(new Float32Array(ed),1));
    const emat=riseMaterial(new THREE.LineBasicMaterial({color:0x7fc3ff,transparent:true,opacity:.42,depthWrite:false}));emat.userData.uRise=uni.uRise;
    const edges=new THREE.LineSegments(eGeo,emat);edges.frustumCulled=false;edges.renderOrder=2;group.add(edges);

    /* point cloud (sorted by x so the scan line can reveal a prefix) */
    const N=pts.length,pp=new Float32Array(N*3),px=new Float32Array(N);pts.forEach((p,i)=>{pp.set(p,i*3);px[i]=p[0]});
    const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(pp,3));
    const pm=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:uni,
      vertexShader:`uniform float uScanX,uSize,uScale,uR;varying float vH,vA;
        void main(){vec3 p=position;float behind=uScanX-p.x;float d=clamp(behind/(uR*.16),0.,1.);float e=1.-pow(1.-d,3.);p.y+=(1.-e)*uR*.08;
          vH=clamp(position.y/(uR*.035),0.,1.);vA=behind>0.?(.4+.6*e)+(1.-d)*1.6:0.;vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_PointSize=behind>0.?uSize*uScale/-mv.z*(1.+(1.-d)*.9):0.;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`uniform float uOpacity;varying float vH,vA;
        void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;vec3 c=mix(vec3(.16,.39,.77),vec3(.91,.96,1.),vH);gl_FragColor=vec4(c*vA,uOpacity*(1.-smoothstep(.25,.5,r))*clamp(vA,0.,1.));}`});
    const points=new THREE.Points(pg,pm);points.frustumCulled=false;group.add(points);

    /* ground, grid, rings, scan plane */
    const grid=new THREE.GridHelper(R*3.2,64,0x16407a,0x0b2142);grid.material.transparent=true;grid.material.opacity=.55;grid.position.y=-.2;group.add(grid);
    for(const f of [.5,1,1.5]){const c=[];for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;c.push(new THREE.Vector3(Math.cos(a)*R*f,0,Math.sin(a)*R*f))}group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c),new THREE.LineBasicMaterial({color:0x2f7fe0,transparent:true,opacity:.22})))}
    const scanMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uA:{value:1}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float uA;varying vec2 vUv;void main(){float g=pow(1.-vUv.y,2.2);float e=smoothstep(0.,.12,vUv.x)*smoothstep(1.,.88,vUv.x);gl_FragColor=vec4(.42,.7,1.,g*e*.34*uA);}'});
    const scanFlip=new THREE.Group();
    const scanPlane=new THREE.Mesh(new THREE.PlaneGeometry(R*2.3,R*.34).translate(0,R*.17,0),scanMat);scanPlane.rotation.y=Math.PI/2;scanFlip.add(scanPlane);scanFlip.visible=false;group.add(scanFlip);
    const rings=[0,1,2].map(i=>{const m=new THREE.Mesh(new THREE.RingGeometry(.9,1,64),new THREE.MeshBasicMaterial({color:0x6bb3ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.5;scanFlip.add(m);return{m,ph:i/3}});

    /* highlight edges for hover/select */
    hoverMesh=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffffff}));hoverMesh.visible=false;hoverMesh.renderOrder=5;group.add(hoverMesh);

    /* real extremes -> labels & priority pins */
    const real=bs.map((b,i)=>({b,i})).filter(o=>o.b.l>0);
    const hot=real.slice().sort((a,b)=>b.b.l-a.b.l)[0],cool=real.slice().sort((a,b)=>a.b.l-b.b.l)[0],tall=bs.map((b,i)=>({b,i})).sort((a,b)=>b.b.h-a.b.h)[0];
    const class3=real.filter(o=>o.b.c===3).sort((a,b)=>b.b.l-a.b.l),pins=[];
    for(const o of class3){if(pins.length>=3)break;if(pins.every(p=>Math.hypot(p.b._cx-o.b._cx,p.b._cy-o.b._cy)>R*.28))pins.push(o)}
    const pinGroup=new THREE.Group();pinGroup.visible=false;group.add(pinGroup);const pinRings=[];
    pins.forEach(o=>{const h=R*.16,l=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,h,6),new THREE.MeshBasicMaterial({color:0xff6a4d,transparent:true,opacity:.85}));l.position.set(o.b._cx,h/2,-o.b._cy);pinGroup.add(l);
      for(let k=0;k<2;k++){const rg=new THREE.Mesh(new THREE.RingGeometry(.85,1,48),new THREE.MeshBasicMaterial({color:0xff6a4d,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));rg.rotation.x=-Math.PI/2;rg.position.set(o.b._cx,.6,-o.b._cy);pinGroup.add(rg);pinRings.push({m:rg,ph:k/2})}});
    const mk=(tag,label,value,pos,steps,side)=>{const el=document.createElement('div');el.className='tl tl-'+(side||'right');el.innerHTML=`<span class="tl-dot"></span><span class="tl-box"><span class="tl-tag">${tag}</span><span class="tl-label">${label}</span><b class="tl-value">${value}</b></span>`;(opts.labelsEl||canvas.parentElement).appendChild(el);const o={el,pos,steps,v:el.querySelector('.tl-value'),a:0};labels.push(o);return o};
    const topOf=o=>new THREE.Vector3(o.b._cx,Math.max(2.5,o.b.h),-o.b._cy);
    const scanLabel=mk('SCAN','BAG footprints + heights','0 pts',new THREE.Vector3(0,R*.05,0),[0],'right');
    mk('MODEL','Tallest building',tall.b.h.toFixed(0)+' m',topOf(tall),[1],'left');
    mk('HEAT','Hottest building',hot.b.l.toFixed(1)+' °C',topOf(hot),[2],'right');
    mk('HEAT','Coolest building',cool.b.l.toFixed(1)+' °C',topOf(cool),[2],'left');
    pins.forEach((o,i)=>{const L=mk('PRIORITY','Hot spot '+(i+1),o.b.l.toFixed(1)+' °C',new THREE.Vector3(o.b._cx,R*.16,-o.b._cy),[3],i%2?'left':'right');L.pin=i});

    world={group,mesh,geo,ranges,shade,cur,tgt,edges,points,px,N,scanFlip,scanMat,rings,pinGroup,pinRings,scanLabel,bs,tv};
    S.layer='';applyLayer('neutral',true);
  }

  function colorFor(b,m,out){
    switch(m){
      case 'heat':return out.copy(lerpHex(HEAT,(b.l-36)/(43-36)));
      case 'ndvi':return out.copy(lerpHex(['#10241d','#2f6b3e','#7ee08a','#d6ffd9'],b.n/.6));
      case 'height':return out.copy(lerpHex(['#16335c','#3d78c4','#6bb3ff','#ffffff'],b.h/22));
      case 'priority':return b.c===3?out.set('#ff4d3d'):out.copy(lerpHex(['#0e2447','#1b3b6b'],(b.l-36)/7));
      default:return out.set('#10294f');
    }
  }
  function applyLayer(m,instant){
    if(!world||S.layer===m)return;S.layer=m;const tmp=new THREE.Color(),{bs,ranges,shade,tgt,cur}=world;
    bs.forEach((b,i)=>{colorFor(b,m,tmp);const[a,zz]=ranges[i];for(let v=a;v<zz;v++){const k=shade[v];tgt[v*3]=tmp.r*k;tgt[v*3+1]=tmp.g*k;tgt[v*3+2]=tmp.b*k}});
    if(instant)cur.set(tgt);colorAnim=instant?0:1.4;world.geo.attributes.color.needsUpdate=true;
    if(opts.onLayer)opts.onLayer(m);
  }

  function resize(){
    const r=canvas.parentElement.getBoundingClientRect();if(!r.width||!r.height)return;W=r.width;H=r.height;
    renderer.setSize(W,H,false);camera.aspect=W/H;
    if(mode==='story'&&W>=900){S.off=-W*.16;camera.setViewOffset(W,H,S.off,0,W,H)}else if(mode==='card')camera.setViewOffset(W,H,0,-H*.02,W,H);else camera.clearViewOffset();
    camera.updateProjectionMatrix();uni.uScale.value=H*.5;
  }
  new ResizeObserver(resize).observe(canvas.parentElement);resize();
  new IntersectionObserver(e=>{S.visible=e[0].isIntersecting}).observe(opts.observe||canvas);

  /* pointer inspect (explore only) */
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  function buildingAt(f){const v=f*3,r=world.ranges;let lo=0,hi=r.length-1;while(lo<hi){const m=(lo+hi)>>1;if(r[m][1]<=v)lo=m+1;else hi=m}return lo}
  function pick(e){const r=canvas.getBoundingClientRect();ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);const h=ray.intersectObject(world.mesh,false)[0];return h?buildingAt(h.faceIndex):-1}
  function outline(i){
    if(i<0){hoverMesh.visible=false;return}
    const b=world.bs[i],P=[];for(let k=0;k<b.r.length;k+=2)P.push(new THREE.Vector2(b.r[k],b.r[k+1]));
    const g=new THREE.ExtrudeGeometry(new THREE.Shape(P),{depth:Math.max(2.5,b.h)+.2,bevelEnabled:false});g.rotateX(-Math.PI/2);
    hoverMesh.geometry.dispose();hoverMesh.geometry=new THREE.EdgesGeometry(g,25);g.dispose();hoverMesh.visible=true;
  }
  canvas.addEventListener('pointermove',e=>{pending=e});
  canvas.addEventListener('pointerleave',()=>{pending=null;if(selIdx<0)outline(-1);if(opts.onHover)opts.onHover(null)});
  let down=null;canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];controls.autoRotate=false});
  canvas.addEventListener('pointerup',e=>{
    if(!S.exploring||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const i=pick(e);selIdx=i;outline(i);
    if(opts.onSelect)opts.onSelect(i>=0?world.bs[i]:null,i);
    if(i>=0){const b=world.bs[i];fly={t0:performance.now(),dur:1000,fromT:controls.target.clone(),toT:new THREE.Vector3(b._cx,b.h/2,-b._cy),fromP:camera.position.clone(),toP:null,dist:S.R*.42}}
  });
  let fly=null;
  function stepFly(now){if(!fly)return;if(!fly.toP){const dir=camera.position.clone().sub(controls.target).normalize();dir.y=Math.max(dir.y,.45);dir.normalize();fly.toP=fly.toT.clone().add(dir.multiplyScalar(fly.dist))}
    let t=e3(clamp((now-fly.t0)/fly.dur,0,1));controls.target.lerpVectors(fly.fromT,fly.toT,t);camera.position.lerpVectors(fly.fromP,fly.toP,t);if(t>=1)fly=null}

  const v3=new THREE.Vector3();
  function frame(now){
    const dt=Math.min((now-S.last)/1000,.1);S.last=now;
    if(!world||!S.visible)return;
    const R=S.R;let p;
    if(mode==='card'){const T=(now-S.t0)/1000,L=17;p=reduce?.9:clamp((T%L)/12.5,0,1)*.78+.0;S.B=p}
    else{S.B+=(S.p-S.B)*Math.min(dt*5,1);if(Math.abs(S.p-S.B)<5e-4)S.B=S.p;p=S.B}
    if(mode==='story'&&W>=900){const off=-W*.16*(1-z(p,.76,.82));if(Math.abs(off-(S.off||0))>.5){S.off=off;camera.setViewOffset(W,H,off,0,W,H);camera.updateProjectionMatrix()}}
    const explore=mode==='story'&&p>=.795;
    if(explore!==S.exploring){S.exploring=explore;controls.enabled=explore;
      if(explore){controls.target.set(0,R*.02,0);controls.autoRotate=!reduce;canvas.style.cursor='grab'}
      else{const o=camera.position.clone().sub(new THREE.Vector3(0,R*.02,0));S.cs={a:Math.atan2(o.x,o.z),r:Math.hypot(o.x,o.z)/R,h:o.y/R};canvas.style.cursor='';outline(-1);selIdx=-1;hoverIdx=-1;fly=null;if(opts.onHover)opts.onHover(null);if(opts.onExplore)opts.onExplore(false)}
      if(explore&&opts.onExplore)opts.onExplore(true)}
    const step=explore?4:clamp(Math.floor(p/.2),0,3);
    if(step!==S.step){S.step=step;if(opts.onStep)opts.onStep(step)}
    /* layer by step */
    const want=mode==='card'?(p<.4?'neutral':p<.6?'heat':'priority'):step<=1?'neutral':step===2?'heat':step===3?'priority':(S.user||'heat');
    if(want!==S.layer)applyLayer(want);
    if(colorAnim>0){colorAnim=Math.max(0,colorAnim-dt);const k=1-Math.exp(-dt*7),c=world.cur,t=world.tgt;for(let i=0;i<c.length;i++)c[i]+=(t[i]-c[i])*k;if(colorAnim===0)c.set(t);world.geo.attributes.color.needsUpdate=true}
    /* scan */
    const idle=(mode==='story'&&!reduce&&p<.02)?clamp((((now-S.t0)/1000)%9)/7,0,1)*(1-z(p,0,.02)):0,s=Math.max(z(p,0,.19),idle),scanX=-R*1.04+s*R*2.08;uni.uScanX.value=p>.19?1e9:scanX;
    uni.uRise.value=z(p,.2,.34)*1.0;uni.uOpacity.value=1-z(p,.24,.36)*.9;
    uni.uSize.value=mode==='card'?1.5:2.3;
    world.edges.material.opacity=.42*z(p,.22,.34);
    world.scanFlip.visible=(p>0||idle>0)&&p<.215;world.scanFlip.position.x=scanX;world.scanMat.uniforms.uA.value=1-z(p,.17,.2);
    world.rings.forEach(o=>{const f=(now/1000*.7+o.ph)%1;o.m.scale.setScalar(R*.02+f*R*.16);o.m.material.opacity=(1-f)*.5*(1-z(p,.17,.2))});
    /* points drawn count for HUD */
    let lo=0,hi=world.N;const X=Math.min(scanX,1e8);while(lo<hi){const m=(lo+hi)>>1;if(world.px[m]<X)lo=m+1;else hi=m}
    S.pts=p>.19?world.N:lo;
    world.pinGroup.visible=(step>=3)&&p>.58||explore&&S.layer==='priority';
    world.pinRings.forEach(o=>{const f=(now/1000*.6+o.ph)%1;o.m.scale.setScalar(R*.012+f*R*.07);o.m.material.opacity=(1-f)*.55});
    /* camera */
    if(!S.exploring){
      const k=camAt(p);if(mode==='card'){k.r*=.66;k.h*=1.5}
      const sm1=1-Math.exp(-dt*(mode==='card'?3:6));S.cs.a+=(k.a-S.cs.a)*sm1;S.cs.r+=(k.r-S.cs.r)*sm1;S.cs.h+=(k.h-S.cs.h)*sm1;
      let a=S.cs.a+(mode==='card'?now/1000*.07:0);
      if(mode==='card'&&opts.pointer)a+=(opts.pointer.x-.5)*.5;
      camera.position.set(Math.sin(a)*S.cs.r*R,S.cs.h*R,Math.cos(a)*S.cs.r*R);camera.lookAt(0,R*.02,0);
    }else{
      stepFly(now);controls.update();
      if(pending){const e=pending;pending=null;const i=pick(e);if(i!==hoverIdx){hoverIdx=i;if(selIdx<0)outline(i)}if(opts.onHover)opts.onHover(i>=0?world.bs[i]:null,e,i)}
    }
    /* labels */
    labels.forEach(l=>{
      const on=mode==='card'?(l.steps[0]===clamp(Math.floor(p/.2),0,3)&&(l.steps[0]===0||l.steps[0]===2||l.steps[0]===3)):l.steps.includes(step);
      const hide=mode==='card'&&l.pin>0;
      l.a+=((on&&!explore&&!hide?1:0)-l.a)*Math.min(dt*8,1);
      if(l===world.scanLabel){l.pos.set(scanX,R*.04,0);l.v.textContent=Math.round(S.pts*2.6).toLocaleString('en-GB')+' pts'}
      v3.copy(l.pos).project(camera);const vis=l.a>.02&&v3.z<1;
      l.el.style.opacity=vis?l.a.toFixed(3):0;l.el.style.visibility=vis?'visible':'hidden';
      if(vis){const sx=(v3.x*.5+.5)*W,sy=(-v3.y*.5+.5)*H;
        if(mode==='story'&&W>=900&&sx<W*.46){l.el.style.visibility='hidden'}
        else{l.el.classList.toggle('tl-left',sx>W*.64);l.el.classList.toggle('tl-right',sx<=W*.64);l.el.style.transform=`translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`}}
    });
    renderer.render(scene,camera);
    if(opts.onFrame)opts.onFrame({p,step,pts:Math.round(S.pts*2.6),explore});
  }
  let raf;const loop=t=>{raf=requestAnimationFrame(loop);frame(t)};raf=requestAnimationFrame(loop);

  return{
    setData:build,setProgress:p=>{S.p=clamp(p,0,1)},
    setLayer:m=>{S.user=m;if(S.exploring)applyLayer(m)},
    get state(){return S},
    selectBuilding:i=>{selIdx=i;outline(i)},
    destroy:()=>{cancelAnimationFrame(raf);dispose();renderer.dispose()}
  };
}
