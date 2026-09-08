import { COLOR, HEIGHT, MONO, SEARCH_METRICS, TOOLS, WIDTH } from "./design.js";
import { bezierPoint, clamp, ease, enter, exit, mix, overshoot, span, velocityBlur } from "./motion.js";
import {
  drawBackdrop,
  drawCandidate,
  drawDarkGlass,
  drawGlyph,
  drawGlassLens,
  drawHeroTool,
  drawMotionStreaks,
  drawPulseOnRibbon,
  drawRosterMark,
  drawSoftRibbon,
  fillRoundRect,
  line,
  rgba,
  roundRect,
  setFont,
  text,
  trackedText,
} from "./drawing.js";

const typed = (value, time, start, duration) => value.slice(0, Math.floor(value.length * span(time, start, start + duration)));

const kineticLine = (ctx, value, x, y, size, time, start, color = COLOR.ink, weight = 800, direction = 1) => {
  const progress = ease.out5(span(time, start, start + 0.62));
  ctx.save();
  ctx.globalAlpha *= progress;
  ctx.translate(x + (1 - progress) * 130 * direction, y);
  ctx.filter = `blur(${(1 - progress) * 6}px)`;
  text(ctx, value, 0, 0, size, color, weight);
  ctx.restore();
  return progress;
};

const drawCountTicks = (ctx, time, start, x, y, color) => {
  const progress = ease.out3(span(time, start, start + 1));
  for (let index = 0; index < 5; index += 1) {
    const local = ease.backOut(clamp(progress * 1.45 - index * 0.11));
    ctx.save();
    ctx.translate(x + index * 38, y);
    ctx.scale(1, local);
    fillRoundRect(ctx, -9, -36, 18, 72, 9, color);
    ctx.restore();
  }
};

export function drawHook(ctx, time) {
  drawBackdrop(ctx, time, "light", 0.4 + span(time, 0, 2.7) * 0.5, COLOR.violet);
  drawMotionStreaks(ctx, time, exit(time, 0.85, 0.8) * 0.34, COLOR.blue, 1);

  const hookExit = exit(time, 2.38, 0.42, ease.inOut);
  ctx.save();
  ctx.globalAlpha *= hookExit;
  ctx.translate(mix(-78, 0, hookExit), 0);

  const header = enter(time, 0.02, 0.45);
  ctx.save();
  ctx.globalAlpha = header;
  trackedText(ctx, "ROSTER  /  LOCAL-FIRST MCP ROUTING", 118, 78, 15, 2.2, COLOR.blue, 720, 1, MONO);
  ctx.restore();

  kineticLine(ctx, "YOUR AGENT HAS", 118, 150, 68, time, 0.05, COLOR.ink, 790, -1);
  const number = ease.elasticOut(span(time, 0.16, 1.22));
  ctx.save();
  ctx.translate(116, 224);
  ctx.scale(mix(1.28, 1, number), mix(0.72, 1, number));
  ctx.filter = `blur(${(1 - clamp(number)) * 14}px)`;
  const numberGradient = ctx.createLinearGradient(0, 0, 720, 310);
  numberGradient.addColorStop(0, COLOR.ink);
  numberGradient.addColorStop(0.42, COLOR.violet);
  numberGradient.addColorStop(0.74, COLOR.blue);
  numberGradient.addColorStop(1, COLOR.cyan);
  setFont(ctx, 322, 860);
  ctx.fillStyle = numberGradient;
  ctx.fillText("200", 0, 0);
  ctx.restore();
  kineticLine(ctx, "TOOLS.", 138, 548, 76, time, 0.44, COLOR.ink, 820, 1);

  const rule = ease.out3(span(time, 0.7, 1.45));
  fillRoundRect(ctx, 130, 670, mix(0, 720, rule), 7, 3.5, COLOR.violet);

  kineticLine(ctx, "ONLY FIVE", 1110, 312, 88, time, 1.04, COLOR.ink, 830, 1);
  kineticLine(ctx, "GET TO START.", 1110, 408, 88, time, 1.2, COLOR.ink, 830, 1);
  drawCountTicks(ctx, time, 1.34, 1124, 596, COLOR.mint);

  const micro = enter(time, 1.54, 0.45);
  ctx.save();
  ctx.globalAlpha *= micro;
  text(ctx, "200 → 5", 1112, 682, 20, COLOR.violet, 740, "left", MONO);
  text(ctx, "The right capabilities for this task.", 1112, 726, 24, COLOR.slate, 560);
  ctx.restore();
  ctx.restore();

  // The second zero becomes the lens through which the terminal arrives.
  const portal = ease.inOut(span(time, 2.32, 3.34));
  ctx.save();
  ctx.globalAlpha = portal * 0.56;
  ctx.strokeStyle = COLOR.violet;
  ctx.lineWidth = mix(8, 56, portal);
  ctx.shadowColor = COLOR.violet;
  ctx.shadowBlur = 36 * portal;
  ctx.beginPath();
  ctx.arc(mix(602, 960, portal), mix(392, 540, portal), mix(112, 890, portal), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawTerminal(ctx, time) {
  drawBackdrop(ctx, time, "light", 0.34, COLOR.blue);
  const enterProgress = ease.backOut(span(time, 2.72, 3.62));
  const exitProgress = ease.inOut(span(time, 7.72, 8.84));
  const scale = mix(0.82, 1, enterProgress) * mix(1, 1.16, exitProgress);
  const rotation = mix(-4.8, -1.25, enterProgress) + exitProgress * 1.25;
  const x = 960 + Math.sin(time * 0.35) * 6;
  const y = 550 - (1 - enterProgress) * 92;

  // Tool trajectories pass behind the terminal shell, emerging cleanly at its edge.
  const streams = enter(time, 6.62, 0.78);
  const ribbonAlpha = streams * exit(time, 8.18, 0.6);
  for (let index = 0; index < 5; index += 1) {
    const start = [570, 440 + index * 32];
    const end = [1750, 170 + index * 180];
    const control1 = [940, 390 + index * 30];
    const control2 = [1320, 150 + index * 180];
    drawSoftRibbon(ctx, start, control1, control2, end, TOOLS[index].color, 5 + index * 0.8, ribbonAlpha * 0.58, streams, 12);
    if (streams > 0.3) drawPulseOnRibbon(ctx, start, control1, control2, end, (time * 0.34 + index * 0.16) % 1, TOOLS[index].color, 9, 1.8);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  drawDarkGlass(ctx, -720, -340, 1440, 680, 42, COLOR.violet, 1);
  const screen = ctx.createLinearGradient(-680, -280, 680, 300);
  screen.addColorStop(0, "rgba(8,10,16,0.96)");
  screen.addColorStop(0.7, "rgba(18,19,29,0.96)");
  screen.addColorStop(1, rgba(COLOR.violet, 0.16));
  fillRoundRect(ctx, -682, -282, 1364, 566, 28, screen);

  [COLOR.coral, COLOR.amber, COLOR.mint].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-665 + index * 25, -313, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  text(ctx, "LOCAL / ROSTER", -558, -323, 13, "#8F98AC", 680, "left", MONO);

  const command = typed("$ npx roster init", time, 3.42, 1.02);
  text(ctx, command, -630, -226, 34, COLOR.white, 650, "left", MONO);
  if (time < 4.78 && Math.floor(time * 3.4) % 2 === 0) {
    setFont(ctx, 34, 650, MONO);
    fillRoundRect(ctx, -626 + ctx.measureText(command).width + 10, -220, 13, 33, 2, COLOR.violet);
  }

  const rows = ["github", "filesystem", "postgres", "playwright", "linear", "sentry"];
  rows.forEach((name, index) => {
    const reveal = ease.out3(span(time, 4.55 + index * 0.11, 5.12 + index * 0.11));
    ctx.save();
    ctx.globalAlpha *= reveal;
    const rowY = -128 + index * 58;
    fillRoundRect(ctx, -626, rowY + 7, 8, 32, 4, index < 5 ? TOOLS[index].color : COLOR.coral);
    text(ctx, name, -594, rowY, 24, COLOR.white, 650, "left", MONO);
    text(ctx, index < 5 ? "ready" : "available", -250, rowY + 3, 17, index < 5 ? COLOR.mint : "#8F98AC", 650, "left", MONO);
    ctx.restore();
  });

  line(ctx, [80, -220], [80, 222], "rgba(255,255,255,0.13)", 2);
  const count = Math.floor(mix(0, 200, ease.out3(span(time, 4.32, 6.28))));
  text(ctx, "CAPABILITY UNIVERSE", 142, -218, 13, COLOR.cyan, 720, "left", MONO);
  text(ctx, String(count).padStart(3, "0"), 142, -164, 128, COLOR.white, 820);
  text(ctx, "Every tool is available.", 142, 6, 28, "#DDE2EC", 620);
  text(ctx, "The task still needs focus.", 142, 48, 28, "#949CAF", 560);
  fillRoundRect(ctx, 142, 126, 430, 9, 4.5, "rgba(255,255,255,0.1)");
  fillRoundRect(ctx, 142, 126, 430 * ease.out3(span(time, 5.2, 7.15)), 9, 4.5, COLOR.violet);
  trackedText(ctx, "INDEXING LOCAL MCP SCHEMAS", 142, 170, 12, 1.7, "#8992A5", 700, 1, MONO);
  ctx.restore();

}

export function drawUniverse(ctx, time) {
  const local = time - 8.08;
  const tension = ease.inOut(span(time, 9.1, 15.15));
  const titleAlpha = enter(time, 8.35, 0.5) * exit(time, 14.82, 0.46, ease.inOut);
  const cameraScale = mix(0.94, 1.035, ease.inOut(span(time, 9.2, 15.05)));
  const cameraX = Math.sin(local * 0.32) * 14;
  const cameraY = Math.cos(local * 0.26) * 9;
  drawBackdrop(ctx, time, "dark", 0.5 + tension * 0.18, COLOR.blue);

  ctx.save();
  ctx.translate(960 + cameraX, 540 + cameraY);
  ctx.scale(cameraScale, cameraScale);
  ctx.translate(-960, -540);

  ctx.save();
  ctx.globalAlpha = 0.035 + tension * 0.02;
  text(ctx, "200", 960, 228, 430, COLOR.white, 900, "center");
  ctx.restore();

  const backgroundTokens = [
    [690, 270, 70, 0], [1110, 260, 60, 1], [735, 900, 64, 2], [1240, 870, 74, 3],
    [1780, 210, 54, 4], [1800, 930, 60, 0], [130, 300, 56, 1], [110, 900, 66, 2],
    [910, 150, 48, 3], [1010, 965, 52, 4],
  ];
  backgroundTokens.forEach(([x, y, size, colorIndex], index) => {
    const tokenIn = enter(time, 8.45 + index * 0.045, 0.6);
    const driftX = Math.sin(time * 0.4 + index * 1.7) * 10;
    const driftY = Math.cos(time * 0.34 + index * 1.3) * 8;
    ctx.save();
    ctx.globalAlpha = tokenIn * 0.18;
    ctx.filter = "blur(1px)";
    drawDarkGlass(ctx, x + driftX - size / 2, y + driftY - size / 2, size, size, size * 0.3, TOOLS[colorIndex].color, 1);
    drawGlyph(ctx, x + driftX, y + driftY, size * 0.54, TOOLS[colorIndex].color, TOOLS[colorIndex].glyph, 0.72);
    ctx.restore();
  });

  const center = [960, 548];
  const candidates = [
    { toolIndex: 0, x: 350, y: 350, width: 292, height: 150, rotation: -5 },
    { toolIndex: 2, x: 1535, y: 330, width: 320, height: 158, rotation: 5 },
    { toolIndex: 1, x: 355, y: 765, width: 300, height: 150, rotation: 5 },
    { toolIndex: 3, x: 1510, y: 770, width: 294, height: 150, rotation: -5 },
    { toolIndex: 4, x: 1020, y: 882, width: 290, height: 148, rotation: 2 },
  ];

  // A handful of strong routes communicates overload more clearly than dozens of tiny wires.
  candidates.forEach((candidate, index) => {
    const cardIn = overshoot(time, 8.45 + index * 0.13, 0.9);
    const routeProgress = enter(time, 8.62 + index * 0.12, 0.72);
    const targetX = mix(center[0], candidate.x, cardIn);
    const targetY = mix(center[1], candidate.y, cardIn);
    const control1 = [mix(center[0], targetX, 0.34), center[1] + (index % 2 ? -120 : 120)];
    const control2 = [mix(center[0], targetX, 0.72), targetY + (index % 2 ? 80 : -80)];
    drawSoftRibbon(ctx, center, control1, control2, [targetX, targetY], TOOLS[candidate.toolIndex].color, 8 + index % 2 * 2, 0.34 + tension * 0.08, routeProgress, 10);
    if (routeProgress > 0.2) {
      drawPulseOnRibbon(ctx, center, control1, control2, [targetX, targetY], (time * 0.28 + index * 0.17) % 1, TOOLS[candidate.toolIndex].color, 11, 2.2);
    }
  });

  candidates.forEach((candidate, index) => {
    const cardInMotion = overshoot(time, 8.45 + index * 0.13, 0.9);
    const cardIn = clamp(cardInMotion);
    const crowd = tension * 0.055;
    const targetX = mix(candidate.x, center[0], crowd);
    const targetY = mix(candidate.y, center[1], crowd);
    const float = Math.sin(time * 0.7 + index * 1.3) * 7;
    drawCandidate(
      ctx,
      TOOLS[candidate.toolIndex],
      mix(center[0], targetX, cardInMotion),
      mix(center[1], targetY, cardInMotion) + float * cardIn,
      candidate.width,
      candidate.height,
      mix(candidate.rotation + (index % 2 ? 14 : -14), candidate.rotation, cardInMotion),
      mix(0.58, 1, cardInMotion),
      cardIn,
      0.58,
      true,
    );
  });

  const taskIn = overshoot(time, 8.22, 0.92);
  ctx.save();
  ctx.translate(center[0], center[1]);
  ctx.scale(taskIn * (1 + Math.sin(local * 1.25) * 0.01), taskIn * (1 + Math.sin(local * 1.25) * 0.01));
  drawDarkGlass(ctx, -270, -112, 540, 224, 44, COLOR.blue, 1);
  drawRosterMark(ctx, -196, 0, 82, COLOR.blue, time, "search", 1);
  text(ctx, "ONE TASK", -126, -58, 13, COLOR.blue, 760, "left", MONO);
  text(ctx, "Trace the checkout error", -126, -10, 31, COLOR.white, 760);
  text(ctx, "200 possible capabilities", -126, 42, 18, "#AEB7C6", 560);
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = titleAlpha;
  trackedText(ctx, "ONE TASK / TOO MANY PATHS", 112, 88, 16, 2, COLOR.coral, 760, 1, MONO);
  kineticLine(ctx, "200 CAPABILITIES", 112, 136, 66, time, 8.32, COLOR.white, 800, -1);
  text(ctx, `${Math.round(mix(18, 100, tension))}% CONTEXT PRESSURE`, 1802, 946, 16, COLOR.white, 720, "right", MONO);
  fillRoundRect(ctx, 1220, 982, 582, 8, 4, "rgba(255,255,255,0.12)");
  fillRoundRect(ctx, 1220, 982, 582 * mix(0.18, 1, tension), 8, 4, COLOR.coral);
  ctx.restore();
}

export function drawInitialize(ctx, time, alpha = 1) {
  const p = ease.inOut(span(time, 15.28, 20.62));
  const compress = ease.out5(span(time, 16.2, 18.42));
  const clean = ease.out5(span(time, 18.0, 20.05));
  drawBackdrop(ctx, time, "dark", 0.62 - p * 0.2, COLOR.blue);
  ctx.save();
  ctx.globalAlpha *= alpha;

  trackedText(ctx, "ROSTER / INITIALIZE", 112, 82, 16, 2.2, COLOR.blue, 760, 1, MONO);
  kineticLine(ctx, "MANY CONNECTIONS.", 112, 138, 58, time, 15.35, COLOR.white, 790, -1);
  kineticLine(ctx, "ONE LOCAL ENDPOINT.", 112, 202, 58, time, 15.5, COLOR.white, 790, -1);

  const commandIn = overshoot(time, 15.34, 0.78);
  ctx.save();
  ctx.translate(112, 366);
  ctx.scale(commandIn, commandIn);
  drawDarkGlass(ctx, 0, 0, 500, 106, 26, COLOR.blue, 1);
  text(ctx, typed("$ npx roster init", time, 15.45, 0.92), 36, 38, 25, COLOR.white, 620, "left", MONO);
  ctx.restore();

  const center = [1010, 604];
  const starts = [[-120, 190], [-90, 510], [100, 970], [560, 1160], [1040, -110], [1540, -70], [2040, 240], [2060, 830], [1580, 1160]];
  starts.forEach((start, index) => {
    const local = ease.out3(clamp(compress * 1.2 - index * 0.035));
    const end = [mix(start[0], center[0], local), mix(start[1], center[1], local)];
    const control1 = [mix(start[0], center[0], 0.34), start[1] + Math.sin(index * 1.7) * 80];
    const control2 = [mix(start[0], center[0], 0.76), center[1] + Math.cos(index * 1.4) * 70];
    drawSoftRibbon(ctx, start, control1, control2, end, TOOLS[index % 5].color, mix(14, 5, local), 0.3, 1, 12);
    if (local < 0.92) drawPulseOnRibbon(ctx, start, control1, control2, end, (time * 0.34 + index * 0.12) % 1, TOOLS[index % 5].color, 9, 2);
  });

  ctx.save();
  ctx.globalAlpha = enter(time, 15.72, 0.55);
  trackedText(ctx, "200 INPUT PATHS", 112, 560, 13, 1.7, COLOR.muted, 730, 1, MONO);
  text(ctx, String(Math.max(1, Math.round(mix(200, 1, compress)))).padStart(3, "0"), 108, 592, 112, COLOR.white, 840);
  fillRoundRect(ctx, 112, 742, 370, 8, 4, "rgba(255,255,255,0.12)");
  fillRoundRect(ctx, 112, 742, 370 * compress, 8, 4, COLOR.blue);
  ctx.restore();

  const endpointIn = overshoot(time, 15.82, 1.02);
  const endpointLight = ease.inOut(span(time, 16.24, 17.18));
  ctx.save();
  ctx.translate(center[0], center[1]);
  ctx.rotate(mix(-0.1, 0, endpointIn));
  ctx.scale(endpointIn, endpointIn);
  const halo = ctx.createRadialGradient(0, 0, 20, 0, 0, 260);
  halo.addColorStop(0, rgba(COLOR.blue, 0.2));
  halo.addColorStop(1, rgba(COLOR.blue, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 260, 0, Math.PI * 2);
  ctx.fill();
  drawDarkGlass(ctx, -150, -150, 300, 300, 72, COLOR.blue, 1 - endpointLight);
  drawGlassLens(ctx, -150, -150, 300, 300, 72, COLOR.blue, endpointLight, 1.35);
  drawRosterMark(ctx, 0, -22, 160, COLOR.blue, time, compress > 0.75 ? "success" : "search", 1);
  trackedText(ctx, "LOCAL ROUTER", -70, 94, 12, 1.4, endpointLight > 0.5 ? COLOR.blue : COLOR.white, 780, 1, MONO);
  ctx.restore();

  const agentIn = overshoot(time, 17.92, 0.86);
  const pathStart = [1160, 604];
  const pathEnd = [1600, 604];
  drawSoftRibbon(ctx, pathStart, [1290, 604], [1450, 604], pathEnd, COLOR.line, 24, 0.5 * clean, 1);
  drawSoftRibbon(ctx, pathStart, [1290, 604], [1450, 604], pathEnd, COLOR.blue, 11, 0.9 * clean, clean, 22);
  if (clean > 0.12) drawPulseOnRibbon(ctx, pathStart, [1290, 604], [1450, 604], pathEnd, (time * 0.62) % 1, COLOR.white, 12, 2.4);
  ctx.save();
  ctx.translate(1640, 604);
  ctx.scale(agentIn, agentIn);
  drawGlassLens(ctx, -166, -106, 332, 212, 40, COLOR.blue, clean, 1.05);
  trackedText(ctx, "AGENT", -124, -66, 13, 1.7, COLOR.blue, 760, 1, MONO);
  text(ctx, "one clean", -124, -14, 34, COLOR.ink, 790);
  text(ctx, "connection", -124, 28, 34, COLOR.ink, 790);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = enter(time, 18.7, 0.42);
  trackedText(ctx, "LOCAL  /  PRIVATE  /  ONE ENDPOINT", 113, 920, 14, 1.8, COLOR.white, 720, 1, MONO);
  ctx.restore();
  ctx.restore();
}

export function drawSearch(ctx, time) {
  const scanRaw = span(time, 20.95, 28.88);
  const scan = scanRaw < 0.2
    ? ease.out5(scanRaw / 0.2) * 0.24
    : 0.24 + ease.inOut((scanRaw - 0.2) / 0.8) * 0.76;
  drawBackdrop(ctx, time, "light", 0.58, COLOR.blue);
  drawMotionStreaks(ctx, time, 0.1 + Math.sin(scan * Math.PI) * 0.14, COLOR.blue, 1);
  trackedText(ctx, "ROSTER / SEARCH", 108, 76, 16, 2.1, COLOR.blue, 760, 1, MONO);
  kineticLine(ctx, "RESOLVE THE RIGHT", 108, 126, 62, time, 21.05, COLOR.ink, 800, -1);
  kineticLine(ctx, "CAPABILITY.", 108, 192, 62, time, 21.18, COLOR.ink, 800, -1);

  const pathStart = [170, 680];
  const pathC1 = [560, 260];
  const pathC2 = [1250, 860];
  const pathEnd = [1760, 360];
  drawSoftRibbon(ctx, pathStart, pathC1, pathC2, pathEnd, COLOR.line, 24, 0.58, 1, 0);
  drawSoftRibbon(ctx, pathStart, pathC1, pathC2, pathEnd, COLOR.blue, 10, 0.88, scan, 20);
  drawPulseOnRibbon(ctx, pathStart, pathC1, pathC2, pathEnd, scan, COLOR.blue, 19, 2.5);

  const positions = [
    [250, 676, -7], [540, 420, 6], [908, 572, -2], [1260, 676, 6], [1592, 396, -5],
  ];
  positions.forEach(([x, y, rotation], index) => {
    const centerProgress = index / 4;
    const distance = Math.abs(scan - centerProgress);
    const focus = ease.out3(clamp(1 - distance / 0.24));
    const arrivalMotion = overshoot(time, 21.04 + index * 0.12, 0.72);
    const arrival = clamp(arrivalMotion);
    const lock = overshoot(time, 21.08 + centerProgress * 7.5, 0.48);
    ctx.save();
    ctx.filter = focus < 0.06 ? "blur(1px)" : "none";
    drawCandidate(
      ctx,
      TOOLS[index],
      x,
      y + (1 - arrivalMotion) * 120 - focus * 32,
      index === 2 ? 334 : 290,
      index === 2 ? 166 : 148,
      mix(rotation + (index % 2 ? 10 : -10), rotation * (1 - focus * 0.72), arrivalMotion),
      mix(0.78, mix(0.94, 1.08, focus), arrivalMotion),
      arrival * mix(0.5, 1, focus),
      focus,
      false,
    );
    ctx.restore();
    if (lock > 0 && scan > centerProgress + 0.02) {
      ctx.save();
      ctx.translate(x + (index === 2 ? 138 : 116), y - (index === 2 ? 104 : 92));
      ctx.scale(lock, lock);
      fillRoundRect(ctx, -50, -20, 100, 40, 20, TOOLS[index].color);
      text(ctx, "FIT", 0, -10, 14, COLOR.white, 800, "center", MONO);
      ctx.restore();
    }
  });

  const metricIndex = Math.min(3, Math.floor(scan * 4.18));
  const metric = SEARCH_METRICS[metricIndex];
  const metricPhase = scan * 4.18;
  const metricPhaseProgress = metricIndex === 3 ? 1 : metricPhase - Math.floor(metricPhase);
  const metricPop = ease.backOut(clamp(metricPhaseProgress / 0.28));
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.filter = "blur(1.2px)";
  text(ctx, metric, 960, 782, metric.length > 12 ? 142 : 176, COLOR.blue, 870, "center");
  ctx.restore();
  const evaluatorIn = overshoot(time, 21.22, 0.66);
  ctx.save();
  ctx.translate(1559, 138);
  ctx.scale(evaluatorIn * mix(0.94, 1, metricPop), evaluatorIn * mix(0.94, 1, metricPop));
  drawGlassLens(ctx, -239, -56, 478, 112, 28, COLOR.blue, 1, 0.65);
  trackedText(ctx, "EVALUATING", -203, -28, 12, 1.5, COLOR.blue, 760, 1, MONO);
  ctx.save();
  ctx.globalAlpha = clamp(metricPop);
  ctx.translate(0, (1 - metricPop) * 16);
  text(ctx, metric, -203, 2, 25, COLOR.ink, 760);
  ctx.restore();
  fillRoundRect(ctx, -203, 39, 400, 6, 3, COLOR.line);
  fillRoundRect(ctx, -203, 39, 400 * (0.3 + scan * 0.7), 6, 3, COLOR.blue);
  ctx.restore();

  drawRosterMark(ctx, 116, 964, 68, COLOR.blue, time, "search", 1);
  trackedText(ctx, "TASK FIT  /  RELIABILITY  /  LATENCY  /  OUTCOME HISTORY", 172, 948, 13, 1.3, COLOR.slate, 700, 1, MONO);
}

export function drawClear(ctx, time) {
  const wipeRaw = span(time, 28.62, 34.72);
  const wipe = wipeRaw < 0.24
    ? ease.out5(wipeRaw / 0.24) * 0.34
    : wipeRaw < 0.76
      ? 0.34 + ease.inOut((wipeRaw - 0.24) / 0.52) * 0.42
      : 0.76 + ease.in3((wipeRaw - 0.76) / 0.24) * 0.24;
  drawBackdrop(ctx, time, "light", 0.46, COLOR.blue);
  trackedText(ctx, "ROSTER / FOCUS", 108, 78, 16, 2.1, COLOR.blue, 760, 1, MONO);
  kineticLine(ctx, "SIGNAL STAYS.", 108, 130, 64, time, 28.76, COLOR.ink, 820, -1);
  kineticLine(ctx, "NOISE RETURNS TO THE BENCH.", 108, 198, 54, time, 28.9, COLOR.ink, 790, -1);

  ctx.save();
  ctx.globalAlpha = 0.055;
  text(ctx, "FOCUS", 950, 650, 310, COLOR.blue, 900, "center");
  ctx.restore();

  const sourcePositions = [[250, 676, -7], [540, 420, 6], [908, 572, -2], [1260, 676, 6], [1592, 396, -5]];
  const selectedPositions = [[230, 590, -5], [570, 650, 4], [930, 500, -1], [1290, 650, -4], [1630, 590, 5]];
  selectedPositions.forEach(([targetX, targetY, targetRotation], index) => {
    const settleMotion = overshoot(time, 29.05 + index * 0.2, 0.9);
    const settle = clamp(settleMotion);
    const [sourceX, sourceY, sourceRotation] = sourcePositions[index];
    const width = index === 2 ? 320 : index === 0 || index === 4 ? 260 : 276;
    const height = index === 2 ? 166 : 144;
    drawCandidate(
      ctx,
      TOOLS[index],
      mix(sourceX, targetX, settleMotion),
      mix(sourceY, targetY, settleMotion) - Math.sin(settle * Math.PI) * 24,
      width,
      height,
      mix(sourceRotation, targetRotation, settleMotion),
      mix(0.94, index === 2 ? 1.05 : 1, settleMotion),
      0.76 + settle * 0.24,
      settle,
      false,
    );
    const lock = overshoot(time, 29.66 + index * 0.2, 0.5);
    if (lock > 0.02) {
      ctx.save();
      ctx.translate(targetX, targetY + height / 2 + 34);
      ctx.scale(lock, lock);
      fillRoundRect(ctx, -34, -7, 68, 14, 7, TOOLS[index].color);
      ctx.restore();
    }
  });

  const rejected = TOOLS[5];
  const reject = ease.inOut(span(time, 30.0, 32.55));
  ctx.save();
  ctx.globalAlpha = 1 - reject * 0.82;
  ctx.filter = `blur(${reject * 3}px)`;
  drawCandidate(ctx, rejected, 1670 + reject * 170, 820 + reject * 130, 276, 144, 7 + reject * 20, 1 - reject * 0.14, 1, 0, false);
  ctx.restore();

  // The rejected surface resolves into orderly schema fragments, then exits.
  for (let index = 0; index < 18; index += 1) {
    const local = ease.out3(clamp(reject * 1.35 - index * 0.028));
    if (local <= 0) continue;
    const row = index % 6;
    const column = Math.floor(index / 6);
    const startX = 1570 + row * 42;
    const startY = 782 + column * 38;
    const x = mix(startX, 2070 + row * 22, local);
    const y = mix(startY, 910 + column * 22, local) + Math.sin(index * 1.7) * 12 * local;
    ctx.save();
    ctx.globalAlpha = local * (1 - ease.in3(clamp((local - 0.7) / 0.3)));
    ctx.translate(x, y);
    ctx.rotate((index % 3 - 1) * 0.18 * local);
    fillRoundRect(ctx, 0, 0, 18 + (index % 4) * 14, 7 + (index % 2) * 4, 5, rejected.color);
    ctx.restore();
  }

  const planeX = mix(-460, 2160, wipe);
  const plane = ctx.createLinearGradient(planeX - 260, 0, planeX + 120, 0);
  plane.addColorStop(0, rgba(COLOR.blue, 0));
  plane.addColorStop(0.62, rgba(COLOR.blue, 0.18));
  plane.addColorStop(0.82, rgba(COLOR.white, 0.3));
  plane.addColorStop(1, rgba(COLOR.blue, 0));
  ctx.fillStyle = plane;
  ctx.beginPath();
  ctx.moveTo(planeX - 240, 270);
  ctx.lineTo(planeX + 120, 270);
  ctx.lineTo(planeX - 180, 1000);
  ctx.lineTo(planeX - 540, 1000);
  ctx.closePath();
  ctx.fill();
  line(ctx, [planeX + 40, 270], [planeX - 260, 1000], COLOR.blue, 6, 0.62);

  const statusIn = overshoot(time, 30.2, 0.72);
  ctx.save();
  ctx.translate(108, 902);
  ctx.scale(statusIn, statusIn);
  drawGlassLens(ctx, 0, 0, 664, 92, 25, COLOR.blue, 1, 0.5);
  trackedText(ctx, "FIVE SOLID SIGNALS  /  EVERYTHING ELSE RECEDES", 36, 34, 13, 1.4, COLOR.blue, 740, 1, MONO);
  ctx.restore();
}

export function drawStartingFive(ctx, time) {
  const camera = ease.inOut(span(time, 38.8, 41.5));
  drawBackdrop(ctx, time, "dark", 0.56, COLOR.blue);

  const spotlight = ctx.createRadialGradient(960, 520, 0, 960, 580, 900);
  spotlight.addColorStop(0, rgba(COLOR.blue, 0.18));
  spotlight.addColorStop(0.45, rgba(COLOR.blue, 0.06));
  spotlight.addColorStop(1, rgba(COLOR.ink, 0));
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  ctx.globalAlpha = 0.08;
  text(ctx, "STARTING", 960, 84, 198, COLOR.white, 900, "center");
  text(ctx, "FIVE", 960, 788, 240, COLOR.white, 900, "center");
  ctx.restore();

  trackedText(ctx, "ROSTER / ROTATION", 108, 72, 16, 2.1, COLOR.blue, 760, 1, MONO);
  kineticLine(ctx, "THE STARTING FIVE", 108, 118, 64, time, 34.5, COLOR.white, 820, -1);

  const slots = [
    { toolIndex: 0, beat: 3, x: 180, y: 730, width: 260, height: 184, rotation: -6 },
    { toolIndex: 1, beat: 1, x: 510, y: 540, width: 350, height: 220, rotation: -4 },
    { toolIndex: 2, beat: 0, x: 960, y: 450, width: 480, height: 280, rotation: 0 },
    { toolIndex: 3, beat: 2, x: 1410, y: 540, width: 350, height: 220, rotation: 4 },
    { toolIndex: 4, beat: 4, x: 1740, y: 730, width: 260, height: 184, rotation: 6 },
  ];

  // Connections draw first, so the glass cards always remain optically crisp and on top.
  slots.forEach((slot) => {
    const connection = enter(time, 35.45 + slot.beat * 0.3, 0.5);
    if (connection > 0.02) {
      const from = [960, 820];
      const to = [slot.x, slot.y + slot.height * 0.32];
      drawSoftRibbon(ctx, from, [mix(from[0], to[0], 0.34), 804], [mix(from[0], to[0], 0.72), to[1]], to, TOOLS[slot.toolIndex].color, 7, 0.5, connection, 12);
    }
  });

  const drawOrder = [0, 4, 1, 3, 2];
  drawOrder.forEach((slotIndex) => {
    const slot = slots[slotIndex];
    const arrivalStart = 34.52 + slot.beat * 0.3;
    const flight = ease.out5(span(time, arrivalStart, arrivalStart + 0.72));
    const settle = overshoot(time, arrivalStart + 0.08, 0.9);
    const start = [960 + (slot.toolIndex - 2) * 12, 850 + slot.beat * 8];
    const target = [slot.x + (slot.x - 960) * camera * 0.025, slot.y - camera * Math.abs(slot.x - 960) * 0.018];
    const control1 = [start[0] + (target[0] - start[0]) * 0.18, 790 - slot.beat * 35];
    const control2 = [target[0] - (target[0] - start[0]) * 0.18, target[1] - 100];
    const point = bezierPoint(start, control1, control2, target, flight);
    const rotation = mix(slot.rotation + (slot.toolIndex % 2 === 0 ? -18 : 18), slot.rotation * (1 - camera * 0.2), settle);
    const blur = velocityBlur(span(time, arrivalStart, arrivalStart + 0.72), 7);
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    drawHeroTool(
      ctx,
      TOOLS[slot.toolIndex],
      point[0],
      point[1],
      slot.width,
      slot.height,
      slot.toolIndex,
      rotation,
      mix(0.64, 1, settle),
      clamp(settle),
    );
    ctx.restore();
  });

  const markIn = overshoot(time, 36.2, 0.86);
  ctx.save();
  ctx.translate(960, 820);
  ctx.scale(markIn, markIn);
  drawGlassLens(ctx, -78, -78, 156, 156, 50, COLOR.blue, 1, 1.1);
  drawRosterMark(ctx, 0, 0, 104, COLOR.blue, time, "success", 1);
  ctx.restore();

  const hold = enter(time, 38.8, 0.4);
  ctx.save();
  ctx.globalAlpha *= hold;
  trackedText(ctx, "FIVE CAPABILITIES. ONE DELIBERATE ROTATION.", 960, 972, 14, 2, COLOR.white, 720, 1, MONO);
  ctx.restore();
}

export function drawCall(ctx, time) {
  const requestRaw = span(time, 41.78, 44.2);
  const request = requestRaw < 0.28
    ? ease.out5(requestRaw / 0.28) * 0.34
    : 0.34 + ease.inOut((requestRaw - 0.28) / 0.72) * 0.66;
  const result = ease.out5(span(time, 44.1, 45.55));
  drawBackdrop(ctx, time, "light", 0.36 + request * 0.18, COLOR.blue);
  trackedText(ctx, "ROSTER / ROUTE", 108, 76, 16, 2.1, COLOR.blue, 760, 1, MONO);
  kineticLine(ctx, result > 0.35 ? "RESULT RETURNED." : "ONE REQUEST.", 108, 126, 68, time, 41.66, COLOR.ink, 830, -1);
  text(ctx, "One clean path through the selected rotation.", 112, 214, 28, COLOR.slate, 560);

  const start = [220, 626];
  const c1 = [620, 258];
  const c2 = [1260, 928];
  const end = [1710, 408];
  drawSoftRibbon(ctx, start, c1, c2, end, COLOR.line, 34, 0.72, 1);
  drawSoftRibbon(ctx, start, c1, c2, end, COLOR.blue, 14, 0.9, request, 24);
  drawPulseOnRibbon(ctx, start, c1, c2, end, request, request > 0.58 ? COLOR.mint : COLOR.blue, 23, 2.8);

  const nodes = [
    [220, 626, "AGENT", "trace error", COLOR.ink],
    [952, 590, "ROSTER", "route locally", COLOR.violet],
    [1710, 408, "PLAYWRIGHT", "verify fix", COLOR.cyan],
  ];
  nodes.forEach(([x, y, label, body, color], index) => {
    const revealMotion = overshoot(time, 41.58 + index * 0.18, 0.68);
    const reveal = clamp(revealMotion);
    ctx.save();
    ctx.translate(x, y + (1 - revealMotion) * 92);
    ctx.rotate(mix(index % 2 ? 0.06 : -0.06, 0, revealMotion));
    ctx.scale(mix(0.72, 1, revealMotion), mix(0.72, 1, revealMotion));
    drawGlassLens(ctx, -174, -88, 348, 176, 34, color, reveal, 0.9);
    trackedText(ctx, label, -136, -50, 12, 1.5, color, 760, 1, MONO);
    if (index === 2) {
      ctx.shadowColor = rgba(COLOR.ink, 0.28);
      ctx.shadowBlur = 4;
    }
    text(ctx, body, -136, -8, 28, COLOR.ink, 760);
    ctx.shadowColor = "transparent";
    if (index === 1) drawRosterMark(ctx, 112, 0, 58, color, time, "search", 1);
    ctx.restore();
  });

  if (result > 0) {
    const successIn = overshoot(time, 44.12, 0.64);
    ctx.save();
    ctx.translate(1533, 838);
    ctx.scale(successIn, successIn);
    fillRoundRect(ctx, -243, -44, 486, 88, 28, COLOR.mint);
    trackedText(ctx, "SUCCESS  /  438 MS  /  STORED LOCALLY", -201, -12, 14, 1.5, COLOR.white, 780, 1, MONO);
    ctx.restore();
    const reverse = mix(1, 0.1, result);
    drawPulseOnRibbon(ctx, start, c1, c2, end, reverse, COLOR.mint, 13, 2.2);
  }
}

export function drawSixthMan(ctx, time) {
  const failure = ease.out3(span(time, 45.55, 46.28));
  const suggestionMotion = ease.elasticOut(span(time, 46.3, 47.62));
  const suggestion = clamp(suggestionMotion);
  const accept = ease.inOut(span(time, 48.12, 49.25));
  drawBackdrop(ctx, time, "dark", 0.62, failure < 0.8 ? COLOR.coral : COLOR.mint);

  const redWash = ctx.createLinearGradient(0, 0, 1920, 1080);
  redWash.addColorStop(0, rgba(COLOR.coral, 0.18 * failure));
  redWash.addColorStop(0.55, rgba(COLOR.coral, 0));
  redWash.addColorStop(1, rgba(COLOR.mint, 0.08 * suggestion));
  ctx.fillStyle = redWash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  trackedText(ctx, "ROSTER / SIXTH MAN", 108, 76, 16, 2.1, COLOR.coral, 760, 1, MONO);
  kineticLine(ctx, "A FAILED ROUTE", 108, 126, 66, time, 45.6, COLOR.white, 820, -1);
  kineticLine(ctx, "DOESN'T END THE TASK.", 108, 198, 58, time, 45.72, COLOR.white, 790, -1);

  ctx.save();
  ctx.translate(390 - failure * 28, 594 + failure * 84);
  ctx.rotate((-4 - failure * 13) * Math.PI / 180);
  ctx.globalAlpha *= 1 - failure * 0.48;
  drawHeroTool(ctx, TOOLS[2], 0, 0, 420, 256, 2, 0, 1 - failure * 0.08, 1);
  ctx.strokeStyle = COLOR.coral;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-166, -92);
  ctx.lineTo(166, 92);
  ctx.stroke();
  ctx.restore();

  drawDarkGlass(ctx, 854, 480, 212, 212, 58, failure < 0.92 ? COLOR.coral : COLOR.blue, 1);
  drawRosterMark(ctx, 960, 586, 142, failure < 0.92 ? COLOR.coral : COLOR.blue, time, "failure", 1);
  drawSoftRibbon(ctx, [620, 586], [720, 586], [820, 586], [870, 586], COLOR.coral, 10, 0.62 * (1 - failure), 1, 18);

  ctx.save();
  const sentryX = mix(1840, 1470, suggestionMotion);
  const sentryY = mix(1030, 590, suggestionMotion) - Math.sin(suggestion * Math.PI) * 54;
  ctx.translate(sentryX, sentryY);
  ctx.rotate(mix(18, 3, suggestionMotion) * Math.PI / 180);
  drawHeroTool(ctx, TOOLS[5], 0, 0, 430, 270, 5, 0, mix(0.66, 1, suggestionMotion), suggestion);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha *= suggestion;
  const suggestionLabel = overshoot(time, 46.68, 0.58);
  ctx.translate(1460, 340);
  ctx.scale(suggestionLabel, suggestionLabel);
  drawGlassLens(ctx, -286, -59, 572, 118, 34, COLOR.mint, 1, 0.8);
  trackedText(ctx, "NEXT BEST OPTION", -246, -30, 13, 1.6, COLOR.mint, 780, 1, MONO);
  text(ctx, "SUGGESTED  ·  AWAITING AGENT", -246, 10, 24, COLOR.ink, 760);
  ctx.restore();

  if (accept > 0) {
    drawSoftRibbon(ctx, [1066, 586], [1170, 586], [1300, 586], [1250 + accept * 220, 586], COLOR.mint, 13, accept * 0.86, accept, 22);
    ctx.save();
    const acceptIn = overshoot(time, 48.08, 0.6);
    ctx.translate(960, 920);
    ctx.scale(acceptIn, acceptIn);
    fillRoundRect(ctx, -244, -42, 488, 84, 28, COLOR.mint);
    trackedText(ctx, "AGENT ACCEPTS  →  CONNECTION READY", -204, -13, 14, 1.6, COLOR.white, 800, 1, MONO);
    ctx.restore();
  } else {
    trackedText(ctx, "ROSTER SUGGESTS  /  THE AGENT DECIDES", 960, 928, 14, 1.6, COLOR.white, 720, 1, MONO);
  }
}

export function drawCoach(ctx, time) {
  const learnRaw = span(time, 49.05, 52.82);
  const learn = learnRaw < 0.38
    ? ease.out5(learnRaw / 0.38) * 0.58
    : 0.58 + ease.inOut((learnRaw - 0.38) / 0.62) * 0.42;
  drawBackdrop(ctx, time, "light", 0.38, COLOR.blue);
  ctx.save();
  ctx.globalAlpha *= enter(time, 49.32, 0.24);
  trackedText(ctx, "COACH / LEAGUE", 108, 76, 16, 2.1, COLOR.blue, 760, 1, MONO);
  ctx.restore();
  kineticLine(ctx, "WHAT WORKS", 108, 126, 68, time, 49.38, COLOR.ink, 830, -1);
  kineticLine(ctx, "GETS SMARTER.", 108, 198, 68, time, 49.5, COLOR.ink, 830, -1);

  drawGlassLens(ctx, 110, 350, 1080, 494, 46, COLOR.blue, 1, 1.05);
  trackedText(ctx, "COACH  /  LOCAL OUTCOME MEMORY", 160, 396, 14, 1.7, COLOR.blue, 780, 1, MONO);
  const outcomes = [
    ["SUCCESS", COLOR.mint], ["STACK FIT", COLOR.amber], ["PREFERENCE +", COLOR.blue],
  ];
  outcomes.forEach(([label, color], index) => {
    const arrival = overshoot(time, 49.42 + index * 0.16, 0.66);
    const x = 176 + index * 280;
    const y = mix(632, 494 + Math.sin(index * 1.7) * 12, arrival);
    ctx.save();
    ctx.globalAlpha = clamp(arrival);
    ctx.translate(x + 120, y + 31);
    ctx.scale(mix(0.72, 1, arrival), mix(0.72, 1, arrival));
    fillRoundRect(ctx, -120, -31, 240, 62, 24, rgba(color, 0.11));
    trackedText(ctx, label, -94, -10, 14, 1.25, color, 780, 1, MONO);
    ctx.restore();
  });

  const curveStart = [170, 756];
  const curveC1 = [430, 760];
  const curveC2 = [730, 498];
  const curveEnd = [1110, 526];
  drawSoftRibbon(ctx, curveStart, curveC1, curveC2, curveEnd, COLOR.line, 24, 0.7, 1);
  drawSoftRibbon(ctx, curveStart, curveC1, curveC2, curveEnd, COLOR.blue, 9, 0.9, learn, 20);
  drawPulseOnRibbon(ctx, curveStart, curveC1, curveC2, curveEnd, learn, COLOR.blue, 15, 2.2);

  const leagueIn = overshoot(time, 49.65, 0.92);
  ctx.save();
  ctx.translate(1510, 588);
  ctx.rotate(mix(8, -2, leagueIn) * Math.PI / 180);
  ctx.scale(leagueIn, leagueIn);
  drawGlassLens(ctx, -264, -238, 528, 476, 44, COLOR.blue, 1, 1.25);
  trackedText(ctx, "LEAGUE  /  PRE-SEASON", -216, -190, 14, 1.6, COLOR.blue, 780, 1, MONO);
  text(ctx, "Quality", -216, -118, 52, COLOR.ink, 800);
  text(ctx, "becomes visible.", -216, -56, 42, COLOR.ink, 760);
  line(ctx, [-216, 40], [214, 40], COLOR.line, 2);
  trackedText(ctx, "0 / 8 CERTIFIED", -216, 82, 14, 1.4, COLOR.slate, 740, 1, MONO);
  trackedText(ctx, "NO PUBLIC RANK", -216, 124, 14, 1.4, COLOR.coral, 740, 1, MONO);
  fillRoundRect(ctx, -216, 180, 430, 9, 4.5, COLOR.line);
  fillRoundRect(ctx, -216, 180, 430 * learn * 0.28, 9, 4.5, COLOR.blue);
  ctx.restore();

  trackedText(ctx, "LOCAL LEARNING  /  HONEST PUBLIC QUALITY", 108, 944, 14, 1.8, COLOR.slate, 720, 1, MONO);
}

export function drawFinal(ctx, time) {
  const reveal = ease.out5(span(time, 52.65, 54.18));
  const lock = ease.backOut(span(time, 53.16, 54.55));
  drawBackdrop(ctx, time, "light", 0.22, COLOR.blue);

  const colors = [COLOR.blue, COLOR.violet, COLOR.cyan, COLOR.amber, COLOR.mint];
  for (let index = 0; index < 5; index += 1) {
    const startX = 190 + index * 385;
    const targetX = 1378 + (index - 2) * 32;
    const targetY = 420;
    const p = ease.inOut(clamp(reveal * 1.28 - index * 0.055));
    drawSoftRibbon(ctx, [startX, 1160], [startX, 860], [targetX, 690], [targetX, targetY], colors[index], mix(54, 26, p), 0.38 + p * 0.32, p, 32);
  }

  ctx.save();
  ctx.translate(1378, 420);
  ctx.scale(lock, lock);
  drawGlassLens(ctx, -122, -122, 244, 244, 70, COLOR.blue, 1, 1.25);
  drawRosterMark(ctx, 0, 0, 164, COLOR.blue, time, "success", 1);
  ctx.restore();

  const word = ease.out5(span(time, 53.32, 54.4));
  ctx.save();
  ctx.globalAlpha = word;
  ctx.beginPath();
  ctx.rect(108, 110, mix(0, 980, word), 260);
  ctx.clip();
  trackedText(ctx, "ROSTER", 108, 104, 178, mix(18, -2, word), COLOR.ink, 850, 1);
  ctx.restore();

  const copy = enter(time, 54.15, 0.62);
  ctx.save();
  ctx.globalAlpha = copy;
  text(ctx, "YOUR AGENT HAS 200 TOOLS.", 118, 700, 38, COLOR.ink, 720);
  text(ctx, "ONLY FIVE GET TO START.", 118, 752, 38, COLOR.ink, 720);
  drawGlassLens(ctx, 112, 846, 514, 104, 32, COLOR.blue, 1, 0.72);
  trackedText(ctx, "npx roster init", 160, 882, 20, 1.1, COLOR.blue, 760, 1, MONO);
  ctx.restore();

  const kicker = enter(time, 54.62, 0.52);
  ctx.save();
  ctx.globalAlpha = kicker;
  text(ctx, "ONE ROSTER. EVERY AGENT. THE RIGHT FIVE.", 1780, 918, 16, COLOR.slate, 740, "right", MONO);
  ctx.restore();
}

const clipCircle = (ctx, x, y, radius) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, radius), 0, Math.PI * 2);
  ctx.clip();
};

const clipRoundedTransition = (ctx, progress, startBox) => {
  const x = mix(startBox[0], -30, progress);
  const y = mix(startBox[1], -30, progress);
  const width = mix(startBox[2], WIDTH + 60, progress);
  const height = mix(startBox[3], HEIGHT + 60, progress);
  const radius = mix(startBox[4], 0, progress);
  roundRect(ctx, x, y, width, height, radius);
  ctx.clip();
};

const clipDiagonal = (ctx, progress, reverse = false) => {
  const edge = mix(-420, WIDTH + 420, progress);
  ctx.beginPath();
  if (!reverse) {
    ctx.moveTo(-100, -100);
    ctx.lineTo(edge + 360, -100);
    ctx.lineTo(edge - 160, HEIGHT + 100);
    ctx.lineTo(-100, HEIGHT + 100);
  } else {
    ctx.moveTo(WIDTH + 100, -100);
    ctx.lineTo(edge - 360, -100);
    ctx.lineTo(edge + 160, HEIGHT + 100);
    ctx.lineTo(WIDTH + 100, HEIGHT + 100);
  }
  ctx.closePath();
  ctx.clip();
};

const drawDiagonalBand = (ctx, progress, color = COLOR.blue) => {
  const edge = mix(-420, WIDTH + 420, progress);
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.56);
  ctx.lineWidth = 34;
  ctx.lineCap = "round";
  ctx.shadowColor = rgba(color, 0.5);
  ctx.shadowBlur = 42;
  ctx.beginPath();
  ctx.moveTo(edge + 360, -100);
  ctx.lineTo(edge - 160, HEIGHT + 100);
  ctx.stroke();
  ctx.restore();
};

export function drawFilm(ctx, time) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (time < 2.72) {
    drawHook(ctx, time);
    return;
  }

  if (time < 3.4) {
    drawHook(ctx, time);
    const progress = ease.inOut(span(time, 2.72, 3.4));
    ctx.save();
    clipCircle(ctx, mix(602, 960, progress), mix(392, 540, progress), mix(4, 1320, progress));
    drawTerminal(ctx, time);
    ctx.restore();
    return;
  }

  if (time < 8.08) {
    drawTerminal(ctx, time);
    return;
  }

  if (time < 8.9) {
    drawTerminal(ctx, time);
    const progress = ease.inOut(span(time, 8.08, 8.9));
    ctx.save();
    clipRoundedTransition(ctx, progress, [280, 240, 1360, 600, 34]);
    drawUniverse(ctx, time);
    ctx.restore();
    return;
  }

  if (time < 15.28) {
    drawUniverse(ctx, time);
    return;
  }

  if (time < 16.0) {
    drawUniverse(ctx, time);
    const progress = ease.in3(span(time, 15.28, 16));
    ctx.save();
    ctx.globalAlpha = progress;
    drawInitialize(ctx, time, progress);
    ctx.restore();
    return;
  }

  if (time < 20.25) {
    drawInitialize(ctx, time);
    return;
  }

  if (time < 21.25) {
    drawInitialize(ctx, time);
    const progress = ease.inOut(span(time, 20.25, 21.25));
    const cover = ease.out5(clamp(progress / 0.52));
    const contentIn = ease.out3(clamp((progress - 0.58) / 0.42));

    // The endpoint blooms into a quiet full-frame breath. Keeping this as one
    // continuous field prevents old labels and new cards from sharing pixels.
    ctx.save();
    ctx.globalAlpha = cover;
    drawBackdrop(ctx, time, "light", 0.2, COLOR.blue);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = Math.sin(progress * Math.PI) * (1 - contentIn);
    drawRosterMark(
      ctx,
      960,
      540,
      mix(116, 82, progress),
      COLOR.blue,
      time,
      "success",
      1,
    );
    ctx.restore();
    if (contentIn > 0) {
      ctx.save();
      ctx.globalAlpha = contentIn;
      drawSearch(ctx, time);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.13;
    const sweepX = mix(240, 1680, progress);
    const sweep = ctx.createLinearGradient(sweepX - 260, 0, sweepX + 260, 0);
    sweep.addColorStop(0, rgba(COLOR.blue, 0));
    sweep.addColorStop(0.5, rgba(COLOR.blue, 0.22));
    sweep.addColorStop(1, rgba(COLOR.blue, 0));
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
    return;
  }

  if (time < 28.62) {
    drawSearch(ctx, time);
    return;
  }

  if (time < 29.35) {
    drawSearch(ctx, time);
    const progress = ease.inOut(span(time, 28.62, 29.35));
    ctx.save();
    clipDiagonal(ctx, progress);
    drawClear(ctx, time);
    ctx.restore();
    drawDiagonalBand(ctx, progress, COLOR.blue);
    return;
  }

  if (time < 34.38) {
    drawClear(ctx, time);
    return;
  }

  if (time < 35.1) {
    drawClear(ctx, time);
    const progress = ease.inOut(span(time, 34.3, 35.1));
    ctx.save();
    clipDiagonal(ctx, progress);
    drawStartingFive(ctx, time);
    ctx.restore();
    drawDiagonalBand(ctx, progress, COLOR.blue);
    return;
  }

  if (time < 41.5) {
    drawStartingFive(ctx, time);
    return;
  }

  if (time < 42.05) {
    drawStartingFive(ctx, time);
    const progress = ease.out5(span(time, 41.5, 42.05));
    ctx.save();
    clipRoundedTransition(ctx, progress, [710, 280, 500, 310, 42]);
    drawCall(ctx, time);
    ctx.restore();
    return;
  }

  if (time < 45.55) {
    drawCall(ctx, time);
    return;
  }

  if (time < 46.05) {
    drawCall(ctx, time);
    const progress = ease.out5(span(time, 45.55, 46.05));
    ctx.save();
    clipDiagonal(ctx, progress);
    drawSixthMan(ctx, time);
    ctx.restore();
    drawDiagonalBand(ctx, progress, COLOR.coral);
    return;
  }

  if (time < 49.05) {
    drawSixthMan(ctx, time);
    return;
  }

  if (time < 49.58) {
    drawSixthMan(ctx, time);
    const progress = ease.inOut(span(time, 49.05, 49.58));
    ctx.save();
    clipDiagonal(ctx, progress);
    drawCoach(ctx, time);
    ctx.restore();
    drawDiagonalBand(ctx, progress, COLOR.blue);
    return;
  }

  if (time < 52.65) {
    drawCoach(ctx, time);
    return;
  }

  if (time < 53.55) {
    drawCoach(ctx, time);
    const progress = ease.inOut(span(time, 52.65, 53.55));
    ctx.save();
    clipCircle(ctx, 1510, 588, mix(1, 1540, progress));
    drawFinal(ctx, time);
    ctx.restore();
    return;
  }

  drawFinal(ctx, time);
}
