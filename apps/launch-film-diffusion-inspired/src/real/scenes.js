import { BRAND_PATHS } from "./brandPaths.js";
import { COLOR, DURATION, HEIGHT, MONO, ORBIT_COLORS, ORBIT_MARKS, STARTERS, TERMINAL_LINES, TERMINAL_ROUTE_COLORS, TIMELINE, WIDTH } from "./design.js";
import {
  drawBrandMark,
  drawCursor,
  drawFolderMark,
  drawInk,
  drawImpact,
  drawPaper,
  drawPacket,
  drawRibbon,
  drawRosterLogo,
  drawOrbitMark,
  drawTerminalWindow,
  drawToolObject,
  drawTransitionSweep,
  fillRoundRect,
  rgba,
  strokeRoundRect,
  text,
  trackedText,
} from "./drawing.js";
import { bezierPoint, clamp, ease, mix, span } from "../spectacle/motion.js";

const back = (time, start, duration) => ease.softBack(span(time, start, start + duration));
const out = (time, start, duration) => ease.out5(span(time, start, start + duration));
const smooth = (time, start, duration) => {
  const value = span(time, start, start + duration);
  return value * value * (3 - 2 * value);
};
function kinetic(ctx, value, x, y, size, time, start, color, weight = 800, align = "left") {
  const progress = back(time, start, 0.34);
  ctx.save();
  ctx.globalAlpha *= clamp(progress);
  ctx.translate((1 - progress) * 70, 0);
  text(ctx, value, x, y, size, color, weight, align);
  ctx.restore();
}

function drawHook(ctx, time) {
  drawPaper(ctx);
  // Give the first claim a readable breath before the handoff. The previous
  // 0.76s exit left only a few tenths of a second at full opacity, which made
  // the headline feel like it was playing at double speed on social feeds.
  const exit = ease.in3(span(time, 0.96, 1.31));
  ctx.save();
  ctx.globalAlpha = 1 - exit;
  ctx.translate(-exit * 220, 0);
  trackedText(ctx, "ROSTER  /  LOCAL TOOL ROUTING", 108, 92, 17, 1.4, COLOR.roster, 760);
  kinetic(ctx, "YOUR AGENT HAS", 108, 168, 30, time, -0.18, COLOR.glassDim, 760);
  kinetic(ctx, "200", 96, 270, 270, time, -0.2, COLOR.ink, 900);
  kinetic(ctx, "TOOLS.", 108, 570, 96, time, -0.16, COLOR.ink, 860);
  ctx.restore();

  const bars = back(time, 0.28, 0.46);
  drawRosterLogo(ctx, 1490, 430, 252 * clamp(bars), COLOR.roster, (1 - exit) * clamp(bars), bars, true, true);
  kinetic(ctx, "AND THEY'RE POLLUTING YOUR CONTEXT.", 108, 714, 36, time, 0.34, COLOR.ink, 780);
}

function drawTerminalBeat(ctx, time) {
  drawInk(ctx);
  const localTime = Math.max(0, time - TIMELINE.terminal[0]);
  const intro = back(localTime, 0, 0.64);
  const camera = ease.inOut(span(localTime, 0.86, 2.24));
  const transitionFade = ease.in3(span(localTime, 2.76, 3.2));
  const scale = mix(0.72, 1.08, intro) + camera * 0.16;
  const x = mix(1130, 934, camera);
  const y = mix(540, 574, camera);
  const skew = mix(-0.04, -0.12, camera);
  ctx.save();
  ctx.globalAlpha *= 1 - transitionFade * 0.92;
  drawTerminalWindow(ctx, x, y, 1260, 690, scale, skew, localTime, intro);

  const escapeProgress = smooth(localTime, 1.95, 1.0);
  const routes = [
    { tool: STARTERS[0], start: [1370, 720], control1: [1470, 850], control2: [1610, 290], end: [1665, 248] },
    { tool: STARTERS[2], start: [1470, 770], control1: [1590, 900], control2: [1720, 530], end: [1800, 470] },
    { tool: STARTERS[3], start: [1210, 760], control1: [1120, 950], control2: [1420, 870], end: [1480, 900] },
  ];
  routes.forEach(({ tool, start, control1, control2, end }, index) => {
    const local = clamp(escapeProgress * 1.18 - index * 0.18);
    const point = bezierPoint(start, control1, control2, end, local);
    drawRibbon(ctx, start, control1, control2, end, TERMINAL_ROUTE_COLORS[index], 7, local, 0.82);
    if (local > 0.01) {
      const cardScale = mix(0.44, 0.92, back(localTime, 1.84 + index * 0.08, 0.74));
      drawToolObject(ctx, tool, point[0], point[1], 238, 128, cardScale, 8 * (1 - local), local, clamp(local * 1.8), true);
    }
  });
  if (escapeProgress > 0.02) {
    drawCursor(ctx, 1710, 830, clamp(escapeProgress * 1.4), COLOR.blue);
  }
  ctx.restore();
  if (transitionFade > 0) drawTransitionSweep(ctx, mix(0.12, 0.84, transitionFade), COLOR.paper, COLOR.glassDim);
}

function drawFocusBeat(ctx, time) {
  drawInk(ctx);
  const localTime = Math.max(0, time - TIMELINE.focus[0]);
  const rise = out(localTime, 0, 0.28);
  const transition = ease.out3(span(localTime, 0, 0.32));
  if (localTime < 0.34) drawTransitionSweep(ctx, mix(0.84, 1.04, transition), COLOR.paper, COLOR.glassDim);
  kinetic(ctx, "ROSTER", 112, 104, 30, localTime, 0.03, COLOR.glassLight, 820);
  kinetic(ctx, "FINDS THE FIT.", 112, 158, 78, localTime, 0.08, COLOR.white, 880);
  text(ctx, "ONE TASK. A SHORTLIST WITH SIGNAL.", 116, 270, 22, COLOR.glassDim, 620);

  const boardIn = out(localTime, 0.1, 0.34);
  ctx.save();
  ctx.globalAlpha = boardIn * 0.96;
  fillRoundRect(ctx, 96, 334, 1728, 610, 40, "rgba(9,10,10,0.62)");
  strokeRoundRect(ctx, 96, 334, 1728, 610, 40, rgba(COLOR.glassLight, 0.2), 2);
  ctx.globalAlpha *= 0.65;
  ctx.strokeStyle = "rgba(255,253,248,0.13)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(148, 510);
  ctx.lineTo(1772, 510);
  ctx.moveTo(148, 786);
  ctx.lineTo(1772, 786);
  ctx.stroke();
  ctx.restore();

  const scan = ease.inOut(span(localTime, 0.2, 2.14));
  const lensX = mix(294, 1660, scan);
  const railStart = [250, 790];
  const railEnd = [1670, 790];
  ctx.save();
  ctx.globalAlpha = boardIn;
  ctx.strokeStyle = "rgba(255,253,248,0.14)";
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(...railStart);
  ctx.lineTo(...railEnd);
  ctx.stroke();
  ctx.strokeStyle = rgba(COLOR.glass, 0.8);
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(...railStart);
  ctx.lineTo(mix(railStart[0], railEnd[0], scan), railStart[1]);
  ctx.stroke();
  ctx.restore();
  drawPacket(ctx, railStart, [730, 790], [1160, 790], railEnd, scan, COLOR.glass, 18, boardIn);

  ctx.save();
  ctx.globalAlpha = boardIn;
  fillRoundRect(ctx, 154, 390, 328, 82, 26, COLOR.paper);
  trackedText(ctx, "TASK", 182, 408, 14, 1.6, COLOR.glassDim, 800);
  text(ctx, "verify checkout flow", 182, 432, 20, COLOR.ink, 760);
  fillRoundRect(ctx, 1436, 390, 286, 82, 26, "rgba(255,253,248,0.1)");
  trackedText(ctx, "FIT SIGNAL", 1466, 408, 14, 1.6, COLOR.glass, 800);
  text(ctx, "94 / 100", 1466, 432, 24, COLOR.white, 780);
  ctx.restore();

  const positions = [
    [294, 624, -4],
    [636, 592, -2],
    [978, 580, 0],
    [1320, 592, 2],
    [1662, 624, 4],
  ];
  positions.forEach(([x, y, rotation], index) => {
    const cardIn = back(localTime, 0.3 + index * 0.09, 0.42);
    const proximity = clamp(1 - Math.abs(lensX - x) / 270);
    const lock = back(localTime, 0.54 + index * 0.16, 0.48);
    const tool = STARTERS[index];
    const cardY = y - proximity * 22;
    const cardScale = mix(0.8, 1, cardIn) + proximity * 0.06;
    const cardAlpha = mix(0.46, 1, Math.max(proximity, lock * 0.48));
    const cardRotation = rotation * (1 - proximity * 0.8);
    ctx.save();
    ctx.globalAlpha = boardIn * cardAlpha;
    if (proximity > 0.08) {
      ctx.shadowColor = rgba(COLOR.glass, 0.28);
      ctx.shadowBlur = 22;
      ctx.fillStyle = rgba(COLOR.glassLight, 0.07);
      ctx.beginPath();
      ctx.ellipse(x, cardY + 96, 116 + proximity * 38, 18 + proximity * 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = boardIn * cardAlpha;
    // Keep the card and its focus frame on one shared transform. This avoids
    // the subtle drift that made the old white outline read as a separate UI.
    drawToolObject(ctx, tool, x, cardY, 282, 158, cardScale, cardRotation, cardIn, clamp(cardIn * 1.8), true, false, 0.12);
    ctx.restore();
    if (proximity > 0.18) {
      ctx.save();
      // The focus frame is the same object geometry as the card beneath it.
      // Matching dimensions, radius, scale, and rotation removes the drifting
      // white rectangle that previously made the rail feel misregistered.
      ctx.globalAlpha = boardIn * proximity * 0.92;
      ctx.translate(x, cardY);
      ctx.rotate(cardRotation * Math.PI / 180);
      ctx.scale(cardScale, cardScale);
      ctx.shadowColor = "rgba(255,253,248,0.16)";
      ctx.shadowBlur = 12 / Math.max(0.5, cardScale);
      strokeRoundRect(ctx, -141, -79, 282, 158, 26, rgba(COLOR.glassLight, 0.78), 3 / Math.max(0.5, cardScale));
      fillRoundRect(ctx, -70, -116, 140, 30, 15, rgba(COLOR.glassLight, 0.14));
      strokeRoundRect(ctx, -70, -116, 140, 30, 15, rgba(COLOR.glassLight, 0.56), 2 / Math.max(0.5, cardScale));
      trackedText(ctx, "RIGHT FIT", 0, -108, 11, 1.15, COLOR.glassLight, 820, "center");
      ctx.restore();
    }
    drawImpact(ctx, x, cardY, COLOR.glass, span(localTime, 0.64 + index * 0.18, 0.92 + index * 0.18), 92, 0.12 * boardIn);
  });

  const ready = out(localTime, 2.1, 0.36);
  ctx.save();
  ctx.globalAlpha = ready * boardIn;
  const readySurface = ctx.createLinearGradient(760, 852, 1160, 908);
  readySurface.addColorStop(0, rgba(COLOR.white, 0.16));
  readySurface.addColorStop(1, rgba(COLOR.glass, 0.08));
  fillRoundRect(ctx, 760, 852, 400, 56, 28, readySurface);
  strokeRoundRect(ctx, 760, 852, 400, 56, 28, rgba(COLOR.glassLight, 0.34), 2);
  trackedText(ctx, "5 OF 200  /  READY", 960, 870, 15, 1.2, COLOR.glassLight, 820, "center");
  ctx.restore();
  if (rise < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - rise;
    ctx.fillStyle = rgba(COLOR.ink, 0.72);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
}

function drawRequestCarrier(ctx, x, y, scale, alpha, rotation = 0, request = "verify checkout flow") {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(21,22,23,0.16)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  const surface = ctx.createLinearGradient(-210, -64, 210, 64);
  surface.addColorStop(0, COLOR.white);
  // Keep the request carrier neutral. Claude's warm mark is the identity
  // signal; a tinted shell made the card read like a cheap status badge.
  surface.addColorStop(0.76, COLOR.paper);
  surface.addColorStop(1, COLOR.paper);
  fillRoundRect(ctx, -210, -64, 420, 128, 32, surface);
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -210, -64, 420, 128, 32, rgba(COLOR.ink, 0.12), 2);
  drawBrandMark(ctx, "claude", -158, 0, 52, 1, COLOR.claude);
  trackedText(ctx, "CLAUDE CODE  /  AGENT INTENT", -116, -39, 13, 0.95, COLOR.slate, 760);
  // Fit the agent intent to the carrier before drawing it. The request can be
  // swapped from data without allowing a long string to bleed through the
  // rounded edge or collide with the Claude mark.
  const maxRequestWidth = 284;
  const baseRequestSize = 23;
  ctx.font = `720 ${baseRequestSize}px ${MONO}`;
  const measuredRequest = ctx.measureText(request).width;
  const requestSize = Math.min(baseRequestSize, Math.max(17, baseRequestSize * maxRequestWidth / Math.max(1, measuredRequest)));
  text(ctx, request, -116, -4, requestSize, COLOR.ink, 720, "left", MONO);
  ctx.restore();
}

function drawCapabilityMark(ctx, tool, x, y, size, alpha, scale = 1, colorOverride = null) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (tool.id === "filesystem") drawFolderMark(ctx, 0, 0, size, tool.color, 1);
  else drawBrandMark(ctx, tool.id, 0, 0, size, 1, colorOverride ?? tool.color);
  ctx.restore();
}

function _drawRosterAperture(ctx, x, y, scale, alpha, localTime) {
  const search = ease.inOut(span(localTime, 0.56, 1.02));
  const lock = back(localTime, 0.98, 0.34);
  const resolved = out(localTime, 1.16, 0.28);
  const impact = Math.sin(clamp(span(localTime, 0.66, 0.88)) * Math.PI);
  const width = 570;
  const height = 430;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.scale(scale * (1 + impact * 0.024), scale * (1 - impact * 0.018));
  ctx.shadowColor = "rgba(21,22,23,0.28)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 22;
  const shell = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  shell.addColorStop(0, "#303735");
  shell.addColorStop(0.52, "#171C1B");
  shell.addColorStop(1, "#0D1111");
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, 66, shell);
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -width / 2, -height / 2, width, height, 66, rgba(COLOR.white, 0.54), 2.5);
  strokeRoundRect(ctx, -width / 2 + 18, -height / 2 + 18, width - 36, height - 36, 52, rgba(COLOR.rosterLight, 0.24 + impact * 0.3), 2);

  const apertureStatus = resolved > 0.5 ? "ROSTER  /  LOCKED" : localTime < 0.66 ? "ROSTER  /  READY" : "ROSTER  /  RESOLVING";
  trackedText(ctx, apertureStatus, -224, -182, 14, 1.35, resolved > 0.5 ? COLOR.green : COLOR.glassLight, 760);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-244, -104, 488, 244, 44);
  ctx.clip();
  const viewport = ctx.createLinearGradient(-244, -104, 244, 140);
  viewport.addColorStop(0, "rgba(255,255,255,0.07)");
  viewport.addColorStop(0.5, "rgba(255,255,255,0.02)");
  viewport.addColorStop(1, rgba(COLOR.roster, 0.12));
  fillRoundRect(ctx, -244, -104, 488, 244, 44, viewport);

  const spacing = 138;
  // The strip begins with Postgres under the optical center and advances one
  // real starter at a time until GitHub is the final locked capability.
  const stripOffset = mix(-spacing * (STARTERS.length - 1), 0, search);
  const candidatesIn = ease.out3(span(localTime, 0.66, 0.8));
  const focusSurface = ctx.createLinearGradient(-82, 0, 82, 0);
  focusSurface.addColorStop(0, "rgba(255,255,255,0)");
  focusSurface.addColorStop(0.5, "rgba(255,255,255,0.08)");
  focusSurface.addColorStop(1, "rgba(255,255,255,0)");
  fillRoundRect(ctx, -82, -92, 164, 220, 40, focusSurface);
  STARTERS.forEach((tool, index) => {
    const targetIndex = 0;
    const markX = (index - targetIndex) * spacing + stripOffset;
    const distance = Math.abs(markX);
    const inView = clamp(1 - Math.max(0, distance - 135) / 150);
    const isGitHub = index === targetIndex;
    const fadeOthers = isGitHub ? 1 : 1 - ease.out3(span(localTime, 0.94, 1.2));
    const markScale = isGitHub ? mix(0.86, 1.4, lock) : mix(0.74, 0.94, inView) * fadeOthers;
    ctx.save();
    ctx.filter = `blur(${Math.max(0, distance - 80) * 0.018}px)`;
    const markColor = tool.id === "github" ? COLOR.white : tool.color;
    drawCapabilityMark(ctx, tool, markX, 4, isGitHub ? 88 : 68, inView * fadeOthers * candidatesIn, markScale, markColor);
    ctx.restore();
  });

  const shutter = ease.in3(span(localTime, 0.52, 0.78)) * (1 - ease.out3(span(localTime, 0.82, 1.06)));
  ctx.fillStyle = rgba(COLOR.rosterLight, 0.15 * shutter);
  ctx.fillRect(-244, -104, 488, 244);
  const glossX = mix(-460, 420, ease.inOut(span(localTime, 0.62, 1.28)));
  const gloss = ctx.createLinearGradient(glossX - 120, 0, glossX + 120, 0);
  gloss.addColorStop(0, "rgba(255,255,255,0)");
  gloss.addColorStop(0.5, "rgba(255,255,255,0.28)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(glossX - 150, -120, 300, 280);
  ctx.restore();
  strokeRoundRect(ctx, -244, -104, 488, 244, 44, rgba(COLOR.glassLight, 0.3), 2);

  ctx.save();
  ctx.globalAlpha *= clamp(lock);
  text(ctx, "GitHub", 0, 148, 32, COLOR.white, 780, "center");
  text(ctx, "search code", 0, 188, 20, COLOR.glass, 600, "center");
  ctx.restore();
  ctx.restore();
}

function drawResultReceipt(
  ctx,
  x,
  y,
  scale,
  alpha,
  sheen = 0,
  title = "Playwright selected",
  detail = "best fit for this request",
  eyebrow = "ROUTE RESOLVED",
  status = "FIT 96",
) {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const width = 440;
  const height = 148;
  ctx.shadowColor = "rgba(21,22,23,0.14)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 12;
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, 28, COLOR.white);
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -width / 2, -height / 2, width, height, 28, rgba(COLOR.ink, 0.16), 2);
  fillRoundRect(ctx, -width / 2, -height / 2, 6, height, 3, COLOR.success);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-width / 2, -height / 2, width, height, 28);
  ctx.clip();
  const sheenX = mix(-320, 320, clamp(sheen));
  const sheenGradient = ctx.createLinearGradient(sheenX - 70, -110, sheenX + 70, 110);
  sheenGradient.addColorStop(0, "rgba(255,255,255,0)");
  sheenGradient.addColorStop(0.5, "rgba(255,255,255,0.16)");
  sheenGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheenGradient;
  ctx.fillRect(sheenX - 90, -100, 180, 200);
  ctx.restore();
  trackedText(ctx, eyebrow, -186, -48, 13, 1.05, COLOR.slate, 760);
  trackedText(ctx, status, 186, -48, 13, 1.2, COLOR.success, 820, "right");
  text(ctx, title, -186, -12, 25, COLOR.ink, 760);
  trackedText(ctx, detail, -186, 30, 13, 0.7, COLOR.slate, 680);
  ctx.strokeStyle = rgba(COLOR.ink, 0.13);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-186, 57);
  ctx.lineTo(186, 57);
  ctx.stroke();
  ctx.restore();
}

function drawRoutingCore(ctx, x, y, scale, alpha, localTime) {
  const reveal = back(localTime, 0.24, 0.42);
  const pulse = Math.sin(clamp(span(localTime, 1.08, 1.48)) * Math.PI);
  const width = 390;
  const height = 360;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha) * clamp(reveal);
  ctx.translate(x, y);
  ctx.scale(scale * (1 + pulse * 0.018), scale * (1 - pulse * 0.012));
  ctx.shadowColor = "rgba(21,22,23,0.24)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 18;
  const shell = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  shell.addColorStop(0, "#282E2B");
  shell.addColorStop(0.54, "#171B1A");
  shell.addColorStop(1, "#101313");
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, 52, shell);
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -width / 2, -height / 2, width, height, 52, rgba(COLOR.white, 0.58), 2.5);
  strokeRoundRect(ctx, -width / 2 + 16, -height / 2 + 16, width - 32, height - 32, 38, rgba(COLOR.rosterLight, 0.22 + pulse * 0.12), 2);
  drawRosterLogo(ctx, 0, 0, 188, COLOR.rosterLight, ease.out5(reveal), reveal, true, true);
  ctx.restore();
}

function drawRankedCandidate(ctx, tool, x, y, scale, alpha, rotation, rank, fit, selected, localTime, index) {
  // Candidate cards should settle once, without the repeated spring wobble
  // that made the shortlist feel loose and under-designed.
  const revealStart = 0.24 + index * 0.08;
  const reveal = ease.out5(span(localTime, revealStart, revealStart + 0.36));
  const focus = selected ? ease.out3(span(localTime, 1.12, 1.58)) : 0;
  const cardScale = scale * (1 + focus * 0.035);
  const cardAlpha = clamp(alpha) * clamp(reveal) * (selected ? 1 : 0.58 + (1 - focus) * 0.22);
  const cardY = y - focus * 6;
  drawToolObject(ctx, tool, x, cardY, 330, 148, cardScale, rotation * (1 - focus), cardAlpha, selected ? 1 : 0.82, true, false, 0.1);

  ctx.save();
  ctx.globalAlpha *= cardAlpha;
  ctx.translate(x, cardY);
  ctx.scale(cardScale, cardScale);
  strokeRoundRect(ctx, -165, -74, 330, 148, 30, selected ? rgba(COLOR.success, 0.92) : rgba(tool.color, 0.52), selected ? 3.2 : 1.8);
  fillRoundRect(ctx, 86, -60, 58, 24, 12, selected ? rgba(COLOR.success, 0.18) : "rgba(255,253,248,0.09)");
  trackedText(ctx, `#${String(rank).padStart(2, "0")}`, 115, -53, 10, 0.65, selected ? COLOR.success : COLOR.glassLight, 780, "center");
  trackedText(ctx, `FIT ${fit}`, 112, 48, 10, 0.6, selected ? COLOR.success : COLOR.glass, 740, "center");
  ctx.restore();
}

function drawIntentTokens(ctx, startX, endX, y, progress) {
  const amount = clamp(progress);
  // These are discrete request units, not a persistent wire. They arrive at
  // the router in a quick stagger then resolve, leaving the settled frame calm.
  [0, 0.14, 0.28].forEach((delay, index) => {
    const token = clamp((amount - delay) / 0.62);
    if (token <= 0 || token >= 1) return;
    const enter = ease.out5(span(token, 0, 0.18));
    const exit = 1 - ease.inOut(span(token, 0.76, 1));
    const alpha = Math.min(enter, exit);
    const x = mix(startX, endX, ease.inOut(token));
    const size = 16 + index * 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.shadowColor = rgba(COLOR.ink, 0.13);
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    fillRoundRect(ctx, x - size / 2, y - size / 2, size, size, size / 2, rgba(COLOR.paper, 0.96));
    ctx.shadowColor = "transparent";
    strokeRoundRect(ctx, x - size / 2, y - size / 2, size, size, size / 2, rgba(COLOR.roster, 0.66), 1.5);
    fillRoundRect(ctx, x - 3.5, y - 3.5, 7, 7, 3.5, COLOR.roster);
    ctx.restore();
  });
}

function drawBezierRoute(ctx, start, controlOne, controlTwo, end, progress) {
  const amount = clamp(progress);
  if (amount <= 0) return;
  const steps = Math.max(4, Math.ceil(72 * amount));
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const point = bezierPoint(start, controlOne, controlTwo, end, (index / 72) * amount);
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.stroke();
}

function drawBezierSegment(ctx, start, controlOne, controlTwo, end, from, to) {
  const startAmount = clamp(from);
  const endAmount = clamp(to);
  if (endAmount <= startAmount) return;
  const steps = Math.max(4, Math.ceil(58 * (endAmount - startAmount)));
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const amount = mix(startAmount, endAmount, index / steps);
    const point = bezierPoint(start, controlOne, controlTwo, end, amount);
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.stroke();
}

function drawSmokeRoute(ctx, start, controlOne, controlTwo, end, progress, color, alpha = 1, active = false) {
  const amount = clamp(progress);
  if (amount <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // The guide is intentionally almost invisible: it gives the eye a route to
  // follow without turning the scene into a wiring diagram.
  ctx.strokeStyle = rgba(COLOR.ink, 0.11);
  ctx.lineWidth = 2.2;
  drawBezierRoute(ctx, start, controlOne, controlTwo, end, 1);

  // A soft plume grows in the direction of travel. The blurred under-stroke,
  // short saturated core and feathered tail read as smoke, not a tube.
  const tail = active ? 0.2 : 0.16;
  const plumeStart = Math.max(0, amount - tail);
  ctx.shadowColor = rgba(color, active ? 0.2 : 0.12);
  ctx.shadowBlur = active ? 24 : 18;
  ctx.strokeStyle = rgba(color, active ? 0.18 : 0.13);
  ctx.lineWidth = active ? 20 : 16;
  drawBezierSegment(ctx, start, controlOne, controlTwo, end, plumeStart, amount);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = rgba(color, active ? 0.46 : 0.28);
  ctx.lineWidth = active ? 8 : 6;
  drawBezierSegment(ctx, start, controlOne, controlTwo, end, plumeStart + 0.03, amount);
  ctx.strokeStyle = rgba(COLOR.white, active ? 0.36 : 0.18);
  ctx.lineWidth = active ? 2.1 : 1.5;
  drawBezierSegment(ctx, start, controlOne, controlTwo, end, plumeStart + 0.07, amount);

  const puffCount = 6;
  for (let puff = 0; puff < puffCount; puff += 1) {
    const puffAmount = mix(plumeStart, amount, puff / Math.max(1, puffCount - 1));
    const puffPoint = bezierPoint(start, controlOne, controlTwo, end, puffAmount);
    const radius = (active ? 24 : 19) * (0.68 + (1 - puff / puffCount) * 0.32);
    ctx.save();
    ctx.globalAlpha *= (active ? 0.1 : 0.065) * (1 - puff / (puffCount + 1));
    ctx.shadowColor = color;
    ctx.shadowBlur = active ? 22 : 17;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(puffPoint[0], puffPoint[1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const point = bezierPoint(start, controlOne, controlTwo, end, amount);
  const next = bezierPoint(start, controlOne, controlTwo, end, Math.min(1, amount + 0.018));
  ctx.save();
  ctx.translate(point[0], point[1]);
  ctx.rotate(Math.atan2(next[1] - point[1], next[0] - point[0]));
  ctx.globalAlpha *= active ? 0.86 : 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, active ? 5 : 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha *= 0.6;
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(0, 0, active ? 1.7 : 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawCallBeat(ctx, time) {
  const localTime = Math.max(0, time - TIMELINE.call[0]);
  const wash = ease.inOut(span(localTime, 0, 0.38));
  drawInk(ctx);
  ctx.save();
  ctx.globalAlpha = wash;
  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  kinetic(ctx, "ROSTER RANKS THE ROUTE.", 112, 118, 62, localTime, 0.04, COLOR.ink, 860);
  kinetic(ctx, "THE BEST TOOL GOES FIRST.", 112, 188, 62, localTime, 0.1, COLOR.ink, 860);
  text(ctx, "Fit, reliability, and outcomes decide locally.", 116, 278, 25, COLOR.slate, 620);
  trackedText(ctx, "AGENT INTENT", 112, 426, 13, 1.2, COLOR.glassDim, 760);
  trackedText(ctx, "RANKED CANDIDATES", 1368, 292, 13, 1.2, COLOR.glassDim, 760);

  const requestIn = back(localTime, 0.12, 0.34);
  // The request remains legible while a small signal travels the lane. The
  // old implementation shrank and rotated the whole card into the route,
  // which made the intent look squashed before the decision was readable.
  drawRequestCarrier(ctx, 318, 624, 0.72, requestIn, 0, "verify checkout flow");

  const coreX = 930;
  const coreY = 624;
  const candidateData = [
    { tool: STARTERS[0], x: 1530, y: 400, rank: 2, fit: 88, color: TERMINAL_ROUTE_COLORS[0] },
    { tool: STARTERS[4], x: 1530, y: 600, rank: 3, fit: 61, color: TERMINAL_ROUTE_COLORS[2] },
    { tool: STARTERS[2], x: 1530, y: 800, rank: 1, fit: 96, color: COLOR.success },
  ];
  const requestTransit = ease.inOut(span(localTime, 0.42, 1.02));
  drawIntentTokens(ctx, 510, 736, 624, requestTransit);

  // Fresh route language: quiet smoke trails rather than rails or pipes. The
  // first neutral pulse carries the request into Roster, then three restrained
  // pulses test the candidates. Only the Playwright plume resolves in green.
  const selectedTransit = ease.inOut(span(localTime, 1.06, 1.94));
  const coreHalfWidth = 390 * 0.86 / 2;
  const coreLeft = coreX - coreHalfWidth;
  const coreRight = coreX + coreHalfWidth;
  const cardLeft = (candidate) => candidate.x - 165 * 0.82;
  const leftLane = {
    start: [510, coreY],
    c1: [600, coreY - 18],
    c2: [676, coreY + 18],
    end: [coreLeft - 2, coreY],
  };
  const lanes = [
    {
      start: [coreRight + 2, coreY - 86],
      c1: [1180, coreY - 86],
      c2: [1264, 400],
      end: [cardLeft(candidateData[0]) + 10, candidateData[0].y],
    },
    {
      start: [coreRight + 2, coreY],
      c1: [1180, coreY],
      c2: [1272, 600],
      end: [cardLeft(candidateData[1]) + 10, candidateData[1].y],
    },
    {
      start: [coreRight + 2, coreY + 86],
      c1: [1180, coreY + 86],
      c2: [1264, 800],
      end: [cardLeft(candidateData[2]) + 10, candidateData[2].y],
    },
  ];
  drawSmokeRoute(ctx, leftLane.start, leftLane.c1, leftLane.c2, leftLane.end, requestTransit, COLOR.glassDim, 0.78, false);
  lanes.forEach((lane, index) => {
    const pulse = ease.inOut(span(localTime, 1.0 + index * 0.12, 1.72 + index * 0.12));
    drawSmokeRoute(ctx, lane.start, lane.c1, lane.c2, lane.end, pulse, COLOR.glassDim, 0.62, false);
  });
  drawSmokeRoute(ctx, lanes[2].start, lanes[2].c1, lanes[2].c2, lanes[2].end, selectedTransit, COLOR.success, 0.98, true);

  drawRoutingCore(ctx, coreX, coreY, 0.86, 1, localTime);
  candidateData.forEach((candidate, index) => {
    drawRankedCandidate(ctx, candidate.tool, candidate.x, candidate.y, 0.82, 1, index === 2 ? 0 : index === 0 ? -0.4 : 0.4, candidate.rank, candidate.fit, index === 2, localTime, index);
  });

  const resultFlight = ease.out5(span(localTime, 1.84, 2.16));
  const resultPoint = [1510, 950];
  const resultScale = mix(0.48, 0.74, back(localTime, 1.82, 0.42));
  const resultSheen = ease.inOut(span(localTime, 2.0, 2.42));
  drawResultReceipt(
    ctx,
    resultPoint[0],
    resultPoint[1],
    resultScale,
    resultFlight,
    resultSheen,
    "Playwright selected",
    "best fit for this request",
    "ROUTE RESOLVED",
    "FIT 96",
  );
}

function drawIdentityBeat(ctx, time) {
  drawPaper(ctx);
  const localTime = Math.max(0, time - TIMELINE.identity[0]);
  const stage = { x: 1350, y: 522 };
  // The scene cuts in while the orbit is already coasting. A single ease-out
  // phase gives a readable standard-speed turn and a graceful, predictable stop.
  const settle = ease.out3(span(localTime, -0.12, 1.86));
  const spin = Math.PI * 0.54 * ease.out2(span(localTime, -0.12, 1.86));
  const outerRadius = mix(420, 390, ease.out3(span(localTime, 0.0, 1.72)));
  const verticalRadius = mix(304, 282, ease.out3(span(localTime, 0.0, 1.72)));
  ctx.save();
  ctx.globalAlpha *= 0.78;
  ctx.strokeStyle = rgba(COLOR.glassDim, 0.18);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(stage.x, stage.y, outerRadius + 22, verticalRadius + 16, -0.14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha *= 0.72;
  ctx.beginPath();
  ctx.ellipse(stage.x, stage.y, outerRadius - 34, verticalRadius - 28, -0.14, -Math.PI * 0.92, Math.PI * 0.16);
  ctx.stroke();
  ctx.restore();
  ORBIT_MARKS.forEach((mark, index) => {
    const endAngle = -Math.PI / 2 + (Math.PI * 2 * index) / ORBIT_MARKS.length;
    const angle = endAngle + spin;
    const x = stage.x + Math.cos(angle) * outerRadius;
    const y = stage.y + Math.sin(angle) * verticalRadius;
    const active = index < 5 && settle > 0.74;
    ctx.save();
    ctx.globalAlpha *= 0.34;
    ctx.strokeStyle = rgba(COLOR.glassDim, active ? 0.3 : 0.14);
    ctx.lineWidth = active ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(
      stage.x + Math.cos(angle) * (outerRadius - 16),
      stage.y + Math.sin(angle) * (verticalRadius - 12),
    );
    ctx.lineTo(
      stage.x + Math.cos(angle) * (outerRadius - 36),
      stage.y + Math.sin(angle) * (verticalRadius - 26),
    );
    ctx.stroke();
    ctx.restore();
    const markRotation = Math.sin(angle + spin * 0.34) * 0.07;
    drawOrbitMark(ctx, mark.id, x, y, active ? 86 : 78, markRotation, 1, ORBIT_COLORS[mark.id], active);
  });
  const mark = back(localTime, -0.06, 0.36);
  drawRosterLogo(ctx, stage.x, stage.y, 270 * mark, COLOR.roster, mark, mark, true, true, 1.15);
  const copy = back(localTime, 0.08, 0.44);
  ctx.save();
  ctx.globalAlpha = clamp(copy);
  ctx.translate((1 - copy) * 120, 0);
  text(ctx, "ROSTER", 108, 154, 132, COLOR.ink, 900);
  trackedText(ctx, "THE LOCAL TOOL ROUTER", 112, 322, 16, 1.5, COLOR.glassDim, 760);
  text(ctx, "YOUR AGENT HAS 200 TOOLS.", 112, 374, 34, COLOR.ink, 780);
  text(ctx, "ONLY THE ONES THAT MATTER START.", 112, 422, 34, COLOR.ink, 780);
  fillRoundRect(ctx, 112, 544, 420, 74, 37, COLOR.ink);
  text(ctx, "npx roster init", 322, 567, 25, COLOR.white, 620, "center", MONO);
  trackedText(ctx, "LOCAL-FIRST  /  OPEN SOURCE  /  MCP", 112, 674, 16, 1.4, COLOR.glassDim, 760);
  ctx.restore();
  const hold = out(localTime, 1.24, 0.42);
  ctx.save();
  ctx.globalAlpha = hold;
  strokeRoundRect(ctx, 108, 736, 590, 2, 1, rgba(COLOR.glass, 0.44), 1);
  trackedText(ctx, "ROSTER  /  LOCAL ROUTING  /  FIT FIRST", 112, 764, 15, 1.25, COLOR.slate, 700);
  ctx.restore();
  if (localTime > DURATION - TIMELINE.identity[0] - 0.24) {
    const fade = ease.in3(span(localTime, DURATION - TIMELINE.identity[0] - 0.24, DURATION - TIMELINE.identity[0]));
    ctx.fillStyle = rgba(COLOR.white, fade * 0.35);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

export function drawFilm(ctx, time) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (time < TIMELINE.terminal[0]) drawHook(ctx, time);
  else if (time < TIMELINE.focus[0]) drawTerminalBeat(ctx, time);
  else if (time < TIMELINE.call[0]) drawFocusBeat(ctx, time);
  else if (time < TIMELINE.identity[0]) drawCallBeat(ctx, time);
  else drawIdentityBeat(ctx, time);
}

export const __REAL_FILM_DIAGNOSTICS = {
  duration: DURATION,
  timelines: TIMELINE,
  starterCount: STARTERS.length,
  terminalLineCount: TERMINAL_LINES.length,
  localBrandCount: Object.keys(BRAND_PATHS).length,
};
