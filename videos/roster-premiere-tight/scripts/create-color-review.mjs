import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "creative-review");
fs.mkdirSync(out, {recursive:true});
const scenes = [
  {id:"five", label:"Starting five", source:"02-five", at:1.175},
  {id:"draft", label:"Task → draft", source:"03-draft", at:3.1},
].map(scene => ({...scene, html:fs.readFileSync(path.join(root, "compositions/frames", scene.source+".html"),"utf8").replace(/^\s*<template>/," ").replace(/<\/template>\s*$/," ")}));

const palettes = [
  {id:"cobalt", name:"Pearl + cobalt", tag:"Recommended", accent:"#4963DF", canvas:"#F7F8FC", ink:"#172033", panel:"#151B29", pale:"#DFE7FB", syntax:"#AEBEFF",
   ground:"radial-gradient(ellipse at 88% 15%,#DCE6F9 0%,#EDF1FA 32%,#F7F8FC 72%)",
   description:"A pearl surface with a soft wash of blue. Cobalt gives FIVE its emphasis; the task and selected row use pale blue. Clean, bright and still energetic."},
  {id:"jade", name:"Ivory + jade", tag:"Warmer / calmer", accent:"#28745D", canvas:"#F4F3EB", ink:"#1A2822", panel:"#171F1C", pale:"#D8EBE1", syntax:"#A9D7C3",
   ground:"radial-gradient(ellipse at 87% 12%,#DDEBE1 0%,#EDF0E6 37%,#F4F3EB 76%)",
   description:"Warm ivory with a soft green undertone. Deep jade feels grounded and distinctive, while the original vendor and capability colors remain vivid."},
  {id:"apricot", name:"Soft apricot", tag:"Closest to the current film", accent:"#A9563C", canvas:"#F4E5DB", ink:"#312520", panel:"#211B18", pale:"#F1D4C2", syntax:"#EDB49A",
   ground:"radial-gradient(ellipse at 90% 8%,#F1CFBC 0%,#F3DCCB 36%,#F7EEE5 79%)",
   description:"A much softer version of the warm direction. The hue becomes a light surface rather than a full-strength orange field; accents shift toward terracotta."},
  {id:"current", name:"Current coral", tag:"Original for comparison", accent:"#FF6748", canvas:"#F4F1E9", ink:"#111210", panel:"#111210", pale:"#FF6748", syntax:"#FF6748", ground:"#FF6748",
   description:"The current exported film. Useful for comparing how much attention the large orange field and the two orange bars attract."},
];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Roster — Color directions</title>
<style>
@font-face{font-family:Manrope;src:url('../assets/Manrope-Variable.woff2')}@font-face{font-family:Space;src:url('../assets/SpaceGrotesk-Variable.woff2')}
*{box-sizing:border-box}body{margin:0;background:#ECEDEA;color:#18201D;font-family:Manrope,system-ui,sans-serif}main{max-width:1330px;margin:auto;padding:32px 42px 38px}.eyebrow{font-size:11px;font-weight:750;letter-spacing:1.6px;color:#727874;text-transform:uppercase}header{display:flex;justify-content:space-between;align-items:end;gap:20px}h1{font:600 38px/1.12 Space,sans-serif;letter-spacing:-1.4px;margin:9px 0 0}header p{font-size:12px;color:#6B736E;margin:0;text-align:right;line-height:1.7}nav{display:flex;gap:10px;margin:24px 0 18px;flex-wrap:wrap}a{color:inherit;text-decoration:none}.option{border:1px solid #CDD2CE;background:#F4F5F2;border-radius:13px;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700}.option[aria-current=true]{background:#FFFFFF;border-color:#66746B;box-shadow:0 3px 8px #14251c09}.swatch{width:16px;height:16px;border-radius:50%;border:1px solid #00000012}.viewer{background:#FCFDFB;border:1px solid #D3D8D2;border-radius:18px;overflow:hidden;box-shadow:0 10px 36px #18281b09}.toolbar{display:flex;align-items:center;justify-content:space-between;padding:12px 15px;border-bottom:1px solid #DEE2DC}.scene-tabs{display:flex;gap:6px}.scene-tabs a{padding:7px 12px;border-radius:7px;font-size:12px;font-weight:700;color:#67716B}.scene-tabs a[aria-current=true]{background:#E9EEE8;color:#203428}.note{font-size:11px;color:#80877F}.frame{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#F5F5F0}iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:top left}.caption{display:grid;grid-template-columns:270px 1fr;gap:20px;padding:18px 22px 21px}.caption h2{font:600 22px/1.2 Space,sans-serif;letter-spacing:-.4px;margin:0 0 6px}.caption p{font-size:13px;line-height:1.65;margin:0;color:#5D6860;max-width:770px}.tag{font-size:10px;letter-spacing:.4px;color:#687966;font-weight:700}footer{display:flex;justify-content:space-between;gap:16px;padding-top:13px;font-size:11px;color:#777E78}a:focus-visible{outline:3px solid #758EEC;outline-offset:3px}@media(max-width:760px){main{padding:22px 16px}h1{font-size:29px}header{display:block}header p{display:none}.caption{grid-template-columns:1fr;gap:10px}.option{padding:10px;font-size:11px}footer{display:block}.note{display:none}}
main{height:100dvh;display:flex;flex-direction:column;padding-top:24px;padding-bottom:20px}header,nav,footer{flex:0 0 auto}h1{font-size:32px}nav{margin:18px 0 14px}.viewer{flex:1;min-height:0;display:flex;flex-direction:column}.toolbar,.caption{flex:0 0 auto}.frame{flex:1;min-height:0;aspect-ratio:auto;background:#E7EAE6}.caption{padding:13px 20px 15px}.caption h2{font-size:20px}.caption p{font-size:12px}.caption .tag{font-size:10px}@media(max-width:760px){main{height:auto;min-height:100dvh}.frame{height:52vw;min-height:220px;flex:none}header p{display:none}}
</style></head><body><main>
<header><div><div class="eyebrow">Roster · Creative review</div><h1>Three directions for the next pass.</h1></div><p>Actual scene layouts and original icons.<br>Color studies; the exported video is preserved.</p></header>
<nav aria-label="Color direction" id="palette-nav"></nav>
<section class="viewer"><div class="toolbar"><div class="scene-tabs" id="scene-nav"></div><span class="note">Switch scenes to compare the background and product UI together</span></div><div class="frame"><iframe title="Roster color study" id="preview"></iframe></div><div class="caption"><div><h2 id="title"></h2><span class="tag" id="tag"></span></div><p id="description"></p></div></section>
<footer><span>Study scope: palette, tonal background, and task/selection surfaces.</span><span>The 15-second timing, score and brand artwork stay with the existing cut.</span></footer>
</main><script>
const scenes=${JSON.stringify(scenes).replaceAll("<","\\u003c")};
const palettes=${JSON.stringify(palettes)};
const preview=document.getElementById('preview');
function draw(){
 const [paletteId='cobalt',sceneId='five']=location.hash.slice(1).split('-');
 const p=palettes.find(x=>x.id===paletteId)||palettes[0];
 const scene=scenes.find(x=>x.id===sceneId)||scenes[0];
 document.getElementById('palette-nav').innerHTML=palettes.map(x=>'<a class="option" aria-current="'+(x.id===p.id)+'" href="#'+x.id+'-'+scene.id+'"><span class="swatch" style="background:'+x.accent+'"></span>'+x.name+'</a>').join('');
 document.getElementById('scene-nav').innerHTML=scenes.map(x=>'<a aria-current="'+(x.id===scene.id)+'" href="#'+p.id+'-'+x.id+'">'+x.label+'</a>').join('');
 document.getElementById('title').textContent=p.name;document.getElementById('tag').textContent=p.tag;document.getElementById('description').textContent=p.description;
 const override=p.id==='current'?'':
 '#s02-ground,#s03-ground{background:'+p.ground+'!important}'+
 '#s02-only,#s02-start{color:'+p.ink+'!important}#s02-five{color:'+p.accent+'!important}'+
 '#s02-roster{box-sizing:content-box;background:'+p.ink+';padding:13px;border-radius:17px;left:1719px;top:91px}'+
 '.s02-tile{background:#FDFDFC;border:2px solid '+p.accent+'25;box-shadow:0 8px 20px #1927470B}.s02-label{color:'+p.ink+'}'+
 '#s03-root{color:'+p.ink+'!important}#s03-panel-surface{background:'+p.panel+'!important;border:1.5px solid '+p.accent+'40;box-shadow:0 12px 42px #15274312}'+
 '#s03-task-chip,#s03-inspect-fill{background:'+p.pale+'!important}'+
 '.s03-task-char,#s03-submit{color:'+p.ink+'!important}'+
 '.s03-api-function{color:'+p.syntax+'!important}';
 const base=new URL('../',location.href).href;
 preview.srcdoc='<!doctype html><html><head><base href="'+base+'"><style>html,body{margin:0;padding:0;width:1920px;height:1080px;overflow:hidden}</style><script src="assets/gsap.min.js"><'+'/script></head><body>'+scene.html+'<style>'+override+'</style><script>document.fonts.ready.then(()=>{window.__timelines["'+scene.source+'"].seek('+scene.at+');});<'+'/script></body></html>';
 scale();
}
function scale(){const box=document.querySelector('.frame');const ratio=Math.min(box.clientWidth/1920,box.clientHeight/1080);preview.style.transform='scale('+ratio+')';preview.style.left=((box.clientWidth-1920*ratio)/2)+'px';preview.style.top=((box.clientHeight-1080*ratio)/2)+'px'}
new ResizeObserver(scale).observe(document.querySelector('.frame'));window.addEventListener('hashchange',draw);draw();
</script></body></html>`;

// .htm is a review page, deliberately outside HyperFrames' .html composition scan.
fs.writeFileSync(path.join(out,"palettes.htm"),html);
fs.writeFileSync(path.join(out,"palettes.json"),JSON.stringify(palettes,null,2)+"\n");
console.log("Created creative-review/palettes.htm with four palette choices and two actual scene layouts.");
