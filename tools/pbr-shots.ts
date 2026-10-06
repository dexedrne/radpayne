// Fixed room cameras, paused simulation and frame-based settling; no timing benchmark on a busy host.
// RADPAYNE_CHROME_PROFILE=<throwaway> node tools/pbr-shots.ts <url> <output> before|after
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const [base, output, stage] = process.argv.slice(2);
const profile = process.env.RADPAYNE_CHROME_PROFILE;
if (!base || !output || !profile || !['before','after'].includes(stage)) throw new Error('Supply URL, output, before|after and RADPAYNE_CHROME_PROFILE');
const dest = path.join(output, stage); fs.mkdirSync(dest, {recursive:true});
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/usr/bin/chromium',headless:true,userDataDir:profile,protocolTimeout:600000,timeout:180000,
 args:[`--user-data-dir=${profile}`,'--use-angle=gl','--use-gl=angle','--enable-gpu','--ignore-gpu-blocklist','--mute-audio'],defaultViewport:{width:1280,height:720}});
console.log(`browser PID ${browser.process()?.pid}`);
const report=path.join(dest,'renderer.json');
const records: unknown[] = process.argv.includes('--resume') && fs.existsSync(report) ? JSON.parse(fs.readFileSync(report,'utf8')).records : [], errors: string[] = [];
try {
 const page = await browser.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()}: ${r.url()}`);});
 page.on('console',m=>{if(m.type()==='error') { if(errors.length<6) console.error(m.text()); errors.push(m.text()); } if(/renderer:|ready in|warm-up failed|still compiling/.test(m.text())) console.log(m.text());});
 await page.evaluateOnNewDocument(()=>{localStorage.clear(); let seed=1; Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296); Cache.prototype.keys=async()=>[];});
 const views = [['room1','cam-club','night'],['room2','cam-floor','party'],['room2','cam-floor','fight'],['room3','cam-hall','interior'],['room7','cam-garden','day'],['room10','cam-vault','sunrise']];
 const passes = (process.argv.find(a=>a.startsWith('--passes='))?.slice(9) ?? 'high,low,mobile').split(',');
 const selected = process.argv.find(a=>a.startsWith('--rooms='))?.slice(8).split(',');
 for(const [room,cam,light] of views.filter(v=>!selected || selected.includes(v[0]))) for(const preset of passes){
  if(preset!=="high" && !(room==="room1" && preset==="low") && !(room==="room2" && light==="fight"))continue;
  const url = new URL(base); url.search=`?skip&still&seed=1&webgl2&room=${room}&cam=${cam}&gfx=${preset==='mobile'?'low':preset}&mobile=${preset==='mobile'?1:0}${light==='fight'?'&look=fight':''}`;
  console.log(`loading ${room} ${preset} ${light}`);
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction('window.__rp && document.querySelector("[data-testid=hud]") && !window.__rp.gate',{timeout:600000,polling:500});
  await page.evaluate(()=>{(window as any).__rp.session.paused=true;});
  await page.evaluate(async()=>{
   const url=performance.getEntriesByType('resource').map(e=>e.name).find(u=>u.includes('/@react-three_fiber.js'));
   if(!url)throw new Error('Use a dev server');
   const fiber=await import(url);(window as any).__pbrState=[...fiber._roots.values()][0].store.getState();
  });
  await page.waitForFunction(()=>{const w=window as any;let ready=true;w.__scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.userData.rpPbr && (!m.roughnessMap?.image || (m.normalMap && !m.normalMap.image)))ready=false;});return ready;},{timeout:120000});
  await page.evaluate(()=>new Promise<void>(r=>{let n=0;const f=()=>++n===30?r():requestAnimationFrame(f);requestAnimationFrame(f);}));
  const stats=await page.evaluate(()=>{
   const w=window as any, gl=w.__gl, tex=new Map(), pbrTex=new Map(), mats=new Set<any>();
   w.__scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){mats.add(m);for(const v of Object.values(m) as any[])if(v?.isTexture){tex.set(v.source.uuid,v);if(v.name.startsWith('pbr:'))pbrTex.set(v.uuid,v);}}});
   const size=(t:any)=>t.image?.width?t.image.width*t.image.height*4*(t.generateMipmaps?4/3:1):0;
   let bytes=0,pbrBytes=0,allocated=0;for(const t of tex.values()){const b=size(t);bytes+=b;if(t.name.startsWith('pbr:'))pbrBytes+=b;}
   // The node renderer allocates per Texture, including clones with different tiling matrices.
   for(const t of pbrTex.values())allocated+=size(t);
   return {backend:gl.backend.constructor.name,rendererTextureBytes:gl.info.memory.texturesSize,textures:gl.info.memory.textures,materialTextureBytes:Math.round(bytes),pbrTextureBytes:Math.round(pbrBytes),pbrAllocatedTextureBytes:Math.round(allocated),draws:gl.info.render.drawCalls,triangles:gl.info.render.triangles,normals:[...mats].filter(m=>m.userData.rpPbr&&m.normalMap).length,pbrMaterials:[...mats].filter(m=>m.userData.rpPbr).length,camera:[w.__rp.cam.eye.x,w.__rp.cam.eye.y,w.__rp.cam.eye.z]};
  });
  if(stage==="after" && (!stats.pbrMaterials || (preset!=="high" && stats.normals)))throw new Error(`Unexpected surface maps in ${room}/${preset}: ${JSON.stringify(stats)}`);
  const file=`${room}-${preset}-${light}.png`;await page.screenshot({path:path.join(dest,file)});
  records.push({room,preset,light,file,...stats});fs.writeFileSync(path.join(dest,'renderer.json'),JSON.stringify({stage,viewport:[1280,720],records,errors},null,2)+'\n');
  console.log(`${file}: ${(stats.rendererTextureBytes/2**20).toFixed(2)} MiB GPU / ${(stats.materialTextureBytes/2**20).toFixed(2)} MiB material textures, ${stats.draws} draws`);
 }
}finally{const pid=browser.process()?.pid;await browser.close();if(pid)try{process.kill(pid,'SIGTERM');}catch{/* exited */}}
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exitCode=1;}
