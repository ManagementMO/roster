import { CANDIDATES, COLOR, DURATION, ORBIT_COLORS, ORBIT_MARKS, SANS, TERMINAL, TIMELINE, WIDTH } from "./design.js";
import { bezierPoint, clamp, easeIn, easeInOut, easeOut, mix, softBack, span } from "./motion.js";
import {
  drawBlack,
  drawBrand,
  drawCursor,
  drawGate,
  drawInputBar,
  drawLogo,
  drawOrbitMark,
  drawRoutePath,
  drawTerminalFrame,
  mono,
  rgba,
  round,
  serif,
  text,
  tracked,
} from "./drawing.js";

const drawWarmTransition = (ctx, progress) => {
  const p = clamp(progress);
  if (!p) return;
  const radius = mix(16, 1500, easeOut(p));
  const gradient = ctx.createRadialGradient(960, 500, Math.max(2, radius * 0.15), 960, 500, radius);
  gradient.addColorStop(0, rgba(COLOR.warm, 0.24 * (1 - p)));
  gradient.addColorStop(0.46, rgba(COLOR.warmSoft, 0.09 * (1 - p)));
  gradient.addColorStop(1, rgba(COLOR.black, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
};

function drawHook(ctx, time) {
  drawBlack(ctx, time, 1);
  const mark = easeOut(span(time, 0.02, 0.32));
  const title = easeOut(span(time, 0.2, 0.64));
  const number = softBack(span(time, 0.4, 0.92));
  const exit = easeIn(span(time, 1.07, 1.35));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  drawLogo(ctx, 960, 260, 144 * mark, mark, 0.28);
  tracked(ctx, "ROSTER / LOCAL ROUTING", 960, 408, 16, 2.8, COLOR.warm, 700, "center");
  ctx.save();
  ctx.globalAlpha *= title;
  serif(ctx, "Your agent has", 960, 474, 52, COLOR.cream, 400, "center");
  text(ctx, "200", 960, 548, 178 * number, COLOR.white, 780, "center", SANS);
  tracked(ctx, "TOOLS", 960, 790, 22, 4.4, COLOR.warm, 700, "center");
  ctx.restore();
  ctx.strokeStyle = rgba(COLOR.warm, 0.38);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(520, 860);
  ctx.lineTo(1400, 860);
  ctx.stroke();
  ctx.restore();
  if (exit > 0) {
    ctx.save();
    ctx.globalAlpha = exit * 0.9;
    ctx.translate(-exit * 280, 0);
    ctx.fillStyle = COLOR.warm;
    ctx.fillRect(0, 0, 16, 1080);
    ctx.restore();
  }
}

function drawTerminalBeat(ctx, time) {
  drawBlack(ctx, time, 0.96);
  const local = time - TIMELINE.terminal[0];
  const intro = softBack(span(local, 0, 0.46));
  const typeEnd = easeOut(span(local, 0.1, 1.45));
  const exit = easeIn(span(local, 1.78, 2.1));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  tracked(ctx, "ROSTER ROUTE", 112, 94, 16, 2.6, COLOR.warm, 700);
  serif(ctx, "Intent in. Noise out.", 112, 142, 56, COLOR.cream, 400);
  drawTerminalFrame(ctx, 960, 548, 1480, 710, mix(0.78, 1.02, intro), 1, local);
  const marks = [
    ["github", 1450, 282, COLOR.cream],
    ["postgresql", 1620, 416, COLOR.blue],
    ["playwright", 1470, 772, COLOR.mint],
  ];
  marks.forEach(([id, x, y, color], index) => {
    const p = easeOut(span(local, 1.26 + index * 0.12, 1.72 + index * 0.12));
    ctx.save();
    ctx.globalAlpha = p * (1 - exit);
    const origin = [1260, 730];
    const point = bezierPoint(origin, [1320 + index * 50, 790], [x - 160, y + 120], [x, y], p);
    ctx.strokeStyle = rgba(color, 0.24);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.quadraticCurveTo(point[0] - 80, point[1] + 30, point[0], point[1]);
    ctx.stroke();
    drawBrand(ctx, id, point[0], point[1], 74, 0.92, color);
    ctx.restore();
  });
  if (typeEnd > 0.92) {
    ctx.save();
    ctx.globalAlpha = (typeEnd - 0.92) * 12;
    tracked(ctx, "THREE CANDIDATES SURFACE", 960, 930, 15, 2.3, COLOR.muted, 650, "center");
    ctx.restore();
  }
  ctx.restore();
  if (exit > 0) drawWarmTransition(ctx, exit);
}

function drawResolveBeat(ctx, time) {
  drawBlack(ctx, time, 0.72);
  const local = time - TIMELINE.resolve[0];
  const reveal = easeOut(span(local, 0, 0.28));
  const typedProgress = easeOut(span(local, 0.04, 0.64));
  const typed = "verify checkout flow".slice(0, Math.floor(typedProgress * "verify checkout flow".length));
  const button = easeOut(span(local, 0.46, 0.72));
  const click = easeInOut(span(local, 0.68, 0.93));
  const exit = easeIn(span(local, 1.03, 1.25));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  serif(ctx, "One intent. A clean decision.", 960, 204, 66, COLOR.cream, 400, "center");
  tracked(ctx, "ROSTER LISTENS BEFORE IT ROUTES", 960, 306, 16, 2.5, COLOR.muted, 700, "center");
  drawInputBar(ctx, 960, 510, 1220, 190, reveal, typed, button, 1);
  drawCursor(ctx, mix(1462, 1502, click), 515, clamp(span(local, 0.42, 0.91)), 0.92);
  const impact = easeOut(span(local, 0.74, 1.12));
  ctx.save();
  ctx.globalAlpha = impact * 0.5;
  ctx.strokeStyle = COLOR.warm;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(1500, 510, mix(70, 460, impact), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  tracked(ctx, "THE ROUTE IS ABOUT TO RESOLVE", 960, 812, 17, 2.4, COLOR.warm, 700, "center");
  ctx.restore();
  if (exit > 0) drawWarmTransition(ctx, exit);
}

function drawDiveBeat(ctx, time) {
  drawBlack(ctx, time, 0.9);
  const local = time - TIMELINE.dive[0];
  const intro = easeOut(span(local, 0, 0.25));
  const camera = easeInOut(span(local, 0.08, 1.35));
  const exit = easeIn(span(local, 1.28, 1.6));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  const scale = mix(0.88, 2.15, camera);
  ctx.translate(960, 516);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= intro;
  ctx.fillStyle = rgba(COLOR.warm, 0.11);
  ctx.fillRect(-2, -620, 4, 1240);
  const code = [
    "intent = verify_checkout_flow",
    "fit(playwright)  >  fit(postgres)",
    "route(local)     ->  call(tool)",
    "outcome           =  passed",
  ];
  code.forEach((lineValue, index) => {
    const y = (index - 1.5) * 100;
    const x = (index % 2 === 0 ? -1 : 1) * (index + 1) * 18 * (1 - camera);
    ctx.save();
    ctx.globalAlpha *= 0.96 - index * 0.1;
    mono(ctx, lineValue, x, y, 32, index === 2 ? COLOR.mint : index === 1 ? COLOR.warm : COLOR.cream, 560, "center");
    ctx.restore();
  });
  ctx.restore();
  const words = ["FIT", "ROUTE", "OUTCOME"];
  words.forEach((word, index) => {
    const p = easeOut(span(local, 0.36 + index * 0.12, 1.2 + index * 0.12));
    ctx.save();
    ctx.globalAlpha = p * 0.75;
    ctx.translate(280 + index * 690, 214 + (index % 2) * 612);
    ctx.rotate((-0.08 + index * 0.05) * (1 - p));
    tracked(ctx, word, 0, 0, 16, 3.2, index === 2 ? COLOR.mint : COLOR.muted, 700);
    ctx.restore();
  });
  if (exit > 0) drawWarmTransition(ctx, exit);
}

function drawRouteBeat(ctx, time) {
  drawBlack(ctx, time, 0.42);
  const local = time - TIMELINE.route[0];
  const reveal = easeOut(span(local, 0, 0.28));
  const gate = softBack(span(local, 0.08, 0.56));
  const rails = easeOut(span(local, 0.18, 0.9));
  const selected = easeOut(span(local, 0.72, 1.32));
  const exit = easeIn(span(local, 1.56, 1.85));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  tracked(ctx, "ROSTER / PRIORITY ROUTER", 112, 94, 16, 2.6, COLOR.warm, 700);
  serif(ctx, "Roster chooses.", 112, 142, 62, COLOR.cream, 400);
  drawGate(ctx, 690, 548, 292, gate, reveal);
  const intent = easeOut(span(local, 0.18, 0.64));
  ctx.save();
  ctx.globalAlpha = intent;
  round(ctx, 126, 480, 330, 132, 26, COLOR.cream, rgba(COLOR.cream, 0.3), 2);
  tracked(ctx, "AGENT INTENT", 158, 506, 12, 1.6, COLOR.dim, 700);
  mono(ctx, "verify checkout flow", 158, 543, 18, COLOR.ink, 600);
  ctx.restore();
  const targetYs = [326, 548, 770];
  CANDIDATES.forEach((candidate, index) => {
    const isSelected = candidate.id === "playwright";
    const points = [[824, 548], [1000, 548], [1120, targetYs[index]], [1266, targetYs[index]]];
    drawRoutePath(ctx, points, rails + index * 0.08, isSelected ? COLOR.mint : COLOR.cream, reveal * (isSelected ? 1 : 0.46), isSelected ? 21 : 13, isSelected ? selected : 0);
    const cardReveal = easeOut(span(local, 0.12 + index * 0.08, 0.54 + index * 0.08));
    ctx.save();
    ctx.globalAlpha = reveal * cardReveal * (isSelected ? 1 : 0.62);
    ctx.shadowColor = isSelected ? rgba(candidate.color, 0.25) : "rgba(0,0,0,0.32)";
    ctx.shadowBlur = isSelected ? 26 : 12;
    drawBrand(ctx, candidate.id, 1390, targetYs[index], 82, 0.96, candidate.color);
    ctx.shadowColor = "transparent";
    text(ctx, candidate.label, 1454, targetYs[index] - 32, 34, COLOR.cream, 760);
    mono(ctx, candidate.detail, 1454, targetYs[index] + 18, 18, COLOR.muted, 500);
    tracked(ctx, `FIT ${candidate.fit}`, 1796, targetYs[index] + 20, 13, 1.2, isSelected ? candidate.color : COLOR.dim, 700, "right");
    if (isSelected) {
      ctx.strokeStyle = rgba(candidate.color, 0.72);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(1328, targetYs[index] + 58);
      ctx.lineTo(1802, targetYs[index] + 58);
      ctx.stroke();
    }
    ctx.restore();
  });
  if (selected > 0.4) {
    ctx.save();
    ctx.globalAlpha = selected;
    tracked(ctx, "SELECTED FOR THIS TASK", 1484, 884, 15, 2.2, COLOR.mint, 700, "center");
    ctx.restore();
  }
  ctx.restore();
  if (exit > 0) drawWarmTransition(ctx, exit);
}

function drawMemoryBeat(ctx, time) {
  drawBlack(ctx, time, 0.56);
  const local = time - TIMELINE.memory[0];
  const reveal = easeOut(span(local, 0, 0.24));
  const pulse = easeInOut(span(local, 0.14, 0.9));
  const exit = easeIn(span(local, 1.01, 1.3));
  ctx.save();
  ctx.globalAlpha *= 1 - exit;
  drawLogo(ctx, 960, 278, 104 * reveal, reveal, 0.2);
  serif(ctx, "Outcome returned.", 960, 408, 62, COLOR.cream, 400, "center");
  text(ctx, "PASSED", 960, 492, 118 * reveal, COLOR.mint, 760, "center", SANS);
  tracked(ctx, "ROSTER REMEMBERS WHAT WORKED", 960, 660, 16, 2.5, COLOR.warm, 700, "center");
  tracked(ctx, "FIT 0.96", 620, 772, 15, 1.9, COLOR.mint, 700, "center");
  tracked(ctx, "RELIABILITY 0.99", 960, 772, 15, 1.9, COLOR.cream, 700, "center");
  tracked(ctx, "LOCAL OUTCOME", 1300, 772, 15, 1.9, COLOR.warm, 700, "center");
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = COLOR.mint;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(960, 860, 24 + pulse * 16, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  if (exit > 0) drawWarmTransition(ctx, exit);
}

function drawIdentityBeat(ctx, time) {
  drawBlack(ctx, time, 0.9);
  const local = time - TIMELINE.identity[0];
  const reveal = easeOut(span(local, 0, 0.3));
  const settle = easeOut(span(local, -0.1, 1.75));
  const spin = (local - 0.08) * (0.9 - 0.62 * settle);
  const cx = 960;
  const cy = 432;
  const radiusX = 408;
  const radiusY = 286;
  ctx.save();
  ctx.globalAlpha *= reveal;
  ctx.strokeStyle = rgba(COLOR.cream, 0.16);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radiusX + 18, radiusY + 14, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ORBIT_MARKS.forEach((mark, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / ORBIT_MARKS.length + spin;
    const x = cx + Math.cos(angle) * radiusX;
    const y = cy + Math.sin(angle) * radiusY;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = rgba(COLOR.cream, 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radiusX - 12), cy + Math.sin(angle) * (radiusY - 9));
    ctx.lineTo(cx + Math.cos(angle) * (radiusX - 44), cy + Math.sin(angle) * (radiusY - 28));
    ctx.stroke();
    ctx.restore();
    drawOrbitMark(ctx, mark.id, x, y, 64, Math.sin(angle) * 0.045, 0.98, ORBIT_COLORS[mark.id]);
  });
  drawLogo(ctx, cx, cy, 170 * reveal, reveal, 0.3);
  tracked(ctx, "ROSTER", cx, 716, 18, 3.5, COLOR.warm, 700, "center");
  serif(ctx, "The right tool. Right now.", cx, 764, 60, COLOR.cream, 400, "center");
  mono(ctx, "npx roster init", cx, 884, 20, COLOR.muted, 600, "center");
  ctx.restore();
}

export function drawFilm(ctx, time) {
  ctx.clearRect(0, 0, WIDTH, 1080);
  if (time < TIMELINE.terminal[0]) drawHook(ctx, time);
  else if (time < TIMELINE.resolve[0]) drawTerminalBeat(ctx, time);
  else if (time < TIMELINE.dive[0]) drawResolveBeat(ctx, time);
  else if (time < TIMELINE.route[0]) drawDiveBeat(ctx, time);
  else if (time < TIMELINE.memory[0]) drawRouteBeat(ctx, time);
  else if (time < TIMELINE.identity[0]) drawMemoryBeat(ctx, time);
  else drawIdentityBeat(ctx, time);
}

export const __INSPIRED_FILM_DIAGNOSTICS = {
  duration: DURATION,
  timeline: TIMELINE,
  candidateCount: CANDIDATES.length,
  orbitCount: ORBIT_MARKS.length,
  terminalCommand: TERMINAL.command,
};
