import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const soundtrack = JSON.parse(readFileSync("audio_meta.json", "utf8")).bgm.path;
mkdirSync("renders", { recursive:true });
mkdirSync("verification", { recursive:true });
const master = "renders/roster-tight-120fps.mp4";
const share = "renders/roster-tight-60fps.mp4";
const preview = "renders/roster-tight-preview.mp4";
const poster = "renders/roster-tight-poster.png";
const contact = "renders/roster-tight-contact-sheet.png";

function run(binary,args,logName) {
  const result=spawnSync(binary,args,{encoding:"utf8",maxBuffer:32*1024*1024});
  if(logName) writeFileSync("verification/"+logName,result.stderr ?? "");
  if(result.error || result.status!==0) throw new Error(binary+": "+(result.error?.message ?? result.stderr));
  return result;
}

console.log("Encoding 60fps delivery copies.");
for(const [file,filter,crf] of [[share,"fps=60","18"],[preview,"scale=1280:720:flags=lanczos,fps=60","22"]]){
  run("ffmpeg",["-hide_banner","-y","-i",master,"-vf",filter,"-c:v","libx264","-preset","medium","-crf",crf,"-pix_fmt","yuv420p","-c:a","copy","-movflags","+faststart",file],file===share?"share-encode.log":"preview-encode.log");
}
run("ffmpeg",["-hide_banner","-y","-ss","14.1","-i",master,"-frames:v","1","-update","1",poster],"poster-extract.log");
const frameIndices=[162,366,822,1170,1392,1692];
const select=frameIndices.map(frame=>`eq(n\\,${frame})`).join("+");
run("ffmpeg",["-hide_banner","-y","-i",master,"-vf",`select=${select},scale=640:360:flags=lanczos,tile=3x2:padding=8:margin=8:color=0x151B29`,"-frames:v","1","-update","1",contact],"contact-extract.log");

const probes={};
for(const file of [master,share,preview,soundtrack,"assets/audio/five-in-motion.m4a","assets/audio/roster-pocket-groove.m4a"]){
  probes[file]=JSON.parse(run("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file]).stdout);
}
writeFileSync("verification/media-probe.json",JSON.stringify(probes,null,2)+"\n");

const audit=run("ffmpeg",["-hide_banner","-i",master,"-vf","blackdetect=d=0.10:pix_th=0.08:pic_th=0.98","-af","silencedetect=noise=-50dB:d=0.3,ebur128=peak=true","-f","null","-"],"encoded-master-audit.log");
// Native-rate evidence: adjacent frames during an active opening movement must be distinct.
const hashes=run("ffmpeg",["-hide_banner","-ss","0.12","-i",master,"-t","0.2","-an","-f","framemd5","-"],"native-rate-audit.log").stdout;
writeFileSync("verification/native-rate.framemd5",hashes);
const sampled=hashes.split("\n").filter(line=>line.trim() && !line.startsWith("#")).map(line=>line.split(",").at(-1).trim());
const files=[master,share,preview,poster,contact,"assets/audio/five-in-motion.m4a","assets/audio/roster-pocket-groove.m4a"].map(path=>{
  // The size and digest describe the same bytes, even if the file is replaced.
  const content=readFileSync(path);
  return {path,bytes:content.length,sha256:createHash("sha256").update(content).digest("hex")};
});
const report={
  generatedAt:new Date().toISOString(),files,representativeSeconds:frameIndices.map(frame=>frame/120),
  nativeMotionSample:{start:.12,duration:.2,frames:sampled.length,distinctFrames:new Set(sampled).size},
  detectedBlackSpans:audit.stderr.split("\n").filter(line=>line.includes("black_start:")),
  detectedSilence:audit.stderr.split("\n").filter(line=>/silence_(start|end):/.test(line)),
  loudnessSummary:audit.stderr.slice(audit.stderr.lastIndexOf("Summary:")),
};
writeFileSync("verification/delivery.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
