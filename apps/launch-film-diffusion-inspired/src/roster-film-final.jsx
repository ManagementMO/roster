import { useTicker } from "@diffusionstudio/jsx";
import { createEffect } from "solid-js";

const WIDTH = 1920;
const HEIGHT = 1080;
const DURATION = 57;
const AUDIO_PATH = "/Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/roster-launch-sound-design.wav";

const COLOR = {
  paper: "#F7F8FA",
  paperWarm: "#FBFAF7",
  white: "#FFFFFF",
  graphite: "#111318",
  ink: "#242A33",
  secondary: "#5E6878",
  muted: "#8D97A5",
  border: "#DCE2EA",
  blue: "#5577FF",
  violet: "#7A62FF",
  cyan: "#58C9F4",
  mint: "#38CFA0",
  coral: "#F2686C",
  amber: "#EAAF48",
};

const FONT = "Inter, Avenir Next, Helvetica Neue, Arial, sans-serif";
const MONO = "SFMono-Regular, Menlo, Consolas, monospace";

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * clamp(amount);
const easeOut = (amount) => 1 - (1 - clamp(amount)) ** 3;
const easeIn = (amount) => clamp(amount) ** 3;
const easeInOut = (amount) => {
  const value = clamp(amount);
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
};
const easeOutBack = (amount) => {
  const value = clamp(amount);
  const c1 = 1.32;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
};
const between = (time, start, end) => clamp((time - start) / (end - start));
const sceneOpacity = (time, start, end, fadeOut = 0.58) => {
  const enter = easeOut(between(time, start, start + 0.42));
  const exit = 1 - easeIn(between(time, end - fadeOut, end));
  return clamp(enter * exit);
};
const rgba = (hex, alpha) => {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};
const typed = (value, time, start, duration) => value.slice(0, Math.floor(value.length * between(time, start, start + duration)));

const TOOLS = [
  { id: "github", name: "github", capability: "source", color: COLOR.blue, score: "92", kind: "source" },
  { id: "filesystem", name: "filesystem", capability: "patch", color: COLOR.violet, score: "88", kind: "patch" },
  { id: "playwright", name: "playwright", capability: "verify", color: COLOR.cyan, score: "96", kind: "verify" },
  { id: "linear", name: "linear", capability: "issue", color: COLOR.amber, score: "84", kind: "issue" },
  { id: "postgres", name: "postgres", capability: "inspect", color: COLOR.mint, score: "73", kind: "inspect" },
  { id: "sentry", name: "sentry", capability: "observe", color: COLOR.coral, score: "51", kind: "observe" },
];

const CAPSULES = [
  [58, 146, 92, 10, COLOR.blue, -8], [216, 224, 58, 8, COLOR.violet, 10], [364, 136, 118, 9, COLOR.cyan, 4],
  [530, 200, 74, 9, COLOR.graphite, -12], [700, 132, 90, 10, COLOR.mint, 9], [858, 210, 122, 9, COLOR.violet, -5],
  [1046, 144, 62, 8, COLOR.blue, 11], [1196, 206, 104, 9, COLOR.cyan, -11], [1384, 138, 72, 8, COLOR.amber, 6],
  [1550, 212, 132, 10, COLOR.graphite, -8], [1770, 148, 72, 9, COLOR.violet, 10],
  [112, 430, 82, 9, COLOR.mint, 8], [274, 498, 126, 10, COLOR.blue, -6], [500, 414, 62, 8, COLOR.cyan, 10],
  [684, 496, 110, 9, COLOR.violet, -12], [868, 424, 86, 9, COLOR.graphite, 4], [1070, 492, 126, 10, COLOR.mint, 9],
  [1260, 422, 72, 8, COLOR.blue, -7], [1450, 488, 112, 9, COLOR.cyan, 8], [1650, 422, 82, 8, COLOR.amber, -10],
  [1820, 494, 62, 8, COLOR.graphite, 5], [180, 810, 112, 9, COLOR.violet, -6], [430, 900, 74, 8, COLOR.blue, 11],
  [660, 820, 128, 10, COLOR.cyan, -8], [920, 914, 92, 9, COLOR.mint, 6], [1160, 820, 70, 8, COLOR.violet, 12],
  [1390, 900, 128, 9, COLOR.graphite, -8], [1640, 812, 88, 9, COLOR.blue, 5], [1840, 910, 54, 8, COLOR.cyan, -11],
];

function setFont(ctx, size, weight = 500, family = FONT) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "top";
}

function drawText(ctx, value, x, y, size, color = COLOR.graphite, weight = 500, family = FONT, align = "left") {
  setFont(ctx, size, weight, family);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function strokeLine(ctx, x1, y1, x2, y2, color, width = 2, alpha = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawGlass(ctx, x, y, width, height, radius = 26, accent = COLOR.blue, opacity = 0.82) {
  ctx.save();
  ctx.shadowColor = "rgba(39,50,78,0.16)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = `rgba(255,255,255,${opacity})`;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.stroke();
  const wash = ctx.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, "rgba(255,255,255,0.32)");
  wash.addColorStop(0.55, "rgba(255,255,255,0.03)");
  wash.addColorStop(1, rgba(accent, 0.07));
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, Math.max(1, radius - 1));
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.restore();
}

function drawDarkSurface(ctx, x, y, width, height, radius = 26, accent = COLOR.violet) {
  ctx.save();
  ctx.shadowColor = "rgba(26,31,42,0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = "rgba(17,19,24,0.96)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(accent, 0.6);
  ctx.stroke();
  const wash = ctx.createLinearGradient(x, y, x + width, y + height);
  wash.addColorStop(0, "rgba(255,255,255,0.06)");
  wash.addColorStop(1, rgba(accent, 0.12));
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, Math.max(1, radius - 1));
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.restore();
}

function drawIcon(ctx, x, y, size, color, kind = "source", alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.27);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.86)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = Math.max(3, size * 0.075);
  ctx.lineCap = "round";
  if (kind === "source") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, 0);
    ctx.lineTo(-size * 0.04, size * 0.18);
    ctx.lineTo(size * 0.25, -size * 0.2);
    ctx.stroke();
  } else if (kind === "patch") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.22, -size * 0.16);
    ctx.lineTo(size * 0.22, -size * 0.16);
    ctx.moveTo(-size * 0.22, size * 0.16);
    ctx.lineTo(size * 0.22, size * 0.16);
    ctx.stroke();
  } else if (kind === "verify") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.21, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "issue") {
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, size * 0.19);
    ctx.lineTo(0, -size * 0.22);
    ctx.lineTo(size * 0.22, size * 0.19);
    ctx.stroke();
  } else if (kind === "inspect") {
    ctx.beginPath();
    ctx.arc(-size * 0.06, -size * 0.06, size * 0.16, 0, Math.PI * 2);
    ctx.moveTo(size * 0.08, size * 0.08);
    ctx.lineTo(size * 0.26, size * 0.26);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMark(ctx, x, y, size, state = "idle", time = 0, alpha = 1) {
  const color = state === "failure" ? COLOR.coral : state === "success" || state === "learning" ? COLOR.mint : state === "search" ? COLOR.violet : COLOR.blue;
  const pulse = 1 + Math.sin(time * 2.5) * 0.015;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = rgba(color, 0.2);
  ctx.shadowBlur = 26;
  roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.27);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = rgba(color, 0.42);
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let index = -2; index <= 2; index += 1) {
    const barWidth = size * 0.105;
    const barHeight = size * (0.4 + (2 - Math.abs(index)) * 0.08);
    roundRect(ctx, index * size * 0.145 - barWidth / 2, -barHeight / 2, barWidth, barHeight, barWidth / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBackground(ctx, time, accentShift = 0) {
  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const background = ctx.createRadialGradient(380 + Math.sin(time * 0.09) * 80, 30, 0, 950, 540, 1240);
  background.addColorStop(0, COLOR.white);
  background.addColorStop(0.57, accentShift ? COLOR.paperWarm : COLOR.paper);
  background.addColorStop(1, "#E9EDF2");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glows = [
    [260 + Math.sin(time * 0.12) * 90, -120, 520, COLOR.cyan, 0.06],
    [1500 + Math.cos(time * 0.1) * 110, 520 + Math.sin(time * 0.11) * 90, 610, COLOR.violet, 0.055],
  ];
  glows.forEach(([x, y, radius, color, opacity]) => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, rgba(color, opacity));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  });
}

function drawCapsuleField(ctx, time, alpha = 1, fadeAmount = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  CAPSULES.forEach(([x, y, width, height, color, angle], index) => {
    const driftX = Math.sin(time * 0.26 + index * 0.41) * 5;
    const driftY = Math.cos(time * 0.22 + index * 0.36) * 3;
    const opacity = (0.11 + (index % 4) * 0.018) * (1 - fadeAmount * (0.42 + (index % 3) * 0.12));
    ctx.save();
    ctx.translate(x + driftX, y + driftY);
    ctx.rotate(angle * Math.PI / 180);
    ctx.fillStyle = rgba(color, opacity);
    roundRect(ctx, -width / 2, -height / 2, width, height, height / 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function drawRibbon(ctx, start, control1, control2, end, color, width, alpha, time, dash = [24, 22], progress = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const path = new Path2D();
  path.moveTo(start[0], start[1]);
  path.bezierCurveTo(control1[0], control1[1], control2[0], control2[1], end[0], end[1]);
  ctx.setLineDash(dash);
  ctx.lineDashOffset = -(time * 110 % 1000);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke(path);
  ctx.setLineDash([]);
  if (progress > 0 && progress < 1) {
    const x = mix(start[0], end[0], progress);
    const y = mix(start[1], end[1], progress);
    ctx.fillStyle = color;
    ctx.shadowColor = rgba(color, 0.3);
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(8, width * 1.6), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCandidateCard(ctx, item, x, y, width, height, rotation, alpha, scale = 1, selected = false, mode = "candidate") {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  drawGlass(ctx, -width / 2, -height / 2, width, height, 24, selected ? item.color : COLOR.blue, selected ? 0.9 : 0.72);
  drawIcon(ctx, -width / 2 + 44, -height / 2 + 44, 48, item.color, item.kind);
  drawText(ctx, item.name, -width / 2 + 22, height / 2 - 46, 25, COLOR.graphite, 700);
  drawText(ctx, item.capability, width / 2 - 22, height / 2 - 42, 12, COLOR.secondary, 650, MONO, "right");
  if (mode === "search" && selected) {
    drawText(ctx, `TASK FIT  ${item.score}%`, -width / 2 + 22, 6, 12, item.color, 650, MONO);
  }
  if (mode === "rejected") {
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = rgba(COLOR.secondary, 0.55);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 24, -height / 2 + 24);
    ctx.lineTo(width / 2 - 24, height / 2 - 24);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeroCard(ctx, item, x, y, width, height, rotation, alpha, scale = 1, index = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  drawGlass(ctx, -width / 2, -height / 2, width, height, 30, item.color, 0.92);
  drawIcon(ctx, -width / 2 + (index === 2 ? 70 : 58), -height / 2 + (index === 2 ? 72 : 58), index === 2 ? 78 : 62, item.color, item.kind);
  drawText(ctx, `STARTER 0${index + 1}`, width / 2 - 26, -height / 2 + 26, 13, item.color, 650, MONO, "right");
  drawText(ctx, item.name, -width / 2 + 28, index === 2 ? -height / 2 + 148 : -height / 2 + 112, index === 2 ? 48 : 36, COLOR.graphite, 760);
  drawText(ctx, index === 2 ? "Prove the fix" : item.capability === "source" ? "Find the change" : item.capability === "patch" ? "Make it real" : item.capability === "issue" ? "Close the loop" : "Read the signal", -width / 2 + 30, height / 2 - 50, index === 2 ? 20 : 17, COLOR.secondary, 520);
  strokeLine(ctx, width / 2 - 100, height / 2 - 28, width / 2 - 26, height / 2 - 28, item.color, 6, 0.74);
  ctx.restore();
}

function drawHook(ctx, time) {
  const alpha = sceneOpacity(time, 0, 3.15, 0.62);
  if (!alpha) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const enter = easeOut(between(time, 0, 0.78));
  drawText(ctx, "ROSTER", 132, 100, 18, COLOR.secondary, 650, MONO);
  drawText(ctx, "YOUR AGENT HAS", 132, mix(174, 164, enter), 76, COLOR.graphite, 700);
  const numberGradient = ctx.createLinearGradient(130, 250, 720, 420);
  numberGradient.addColorStop(0, COLOR.graphite);
  numberGradient.addColorStop(0.58, COLOR.violet);
  numberGradient.addColorStop(1, COLOR.blue);
  ctx.fillStyle = numberGradient;
  setFont(ctx, 252, 800);
  ctx.fillText("200", 132, mix(250, 242, enter));
  drawText(ctx, "TOOLS.", 146, 452, 76, COLOR.graphite, 700);
  const second = easeOut(between(time, 1.12, 1.95));
  ctx.globalAlpha = alpha * second;
  drawText(ctx, "ONLY FIVE", 1128, 374, 86, COLOR.graphite, 760);
  drawText(ctx, "GET TO START.", 1128, 462, 86, COLOR.graphite, 760);
  strokeLine(ctx, 1130, 604, mix(1130, 1510, second), 604, COLOR.violet, 4, 0.74);
  ctx.globalAlpha = alpha * 0.72;
  drawText(ctx, "A LOCAL-FIRST ROUTING LAYER FOR YOUR AGENT", 132, 970, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawTerminal(ctx, time) {
  const alpha = sceneOpacity(time, 3.15, 9.7, 0.62);
  if (!alpha) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const enter = easeOut(between(time, 3.15, 3.95));
  const x = mix(250, 230, enter);
  const y = mix(250, 206, enter);
  drawGlass(ctx, x, y, 1460, 638, 32, COLOR.blue, 0.9);
  ctx.fillStyle = "rgba(248,249,252,0.78)";
  ctx.fillRect(x, y, 1460, 68);
  [COLOR.coral, COLOR.amber, COLOR.mint].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 34 + index * 24, y + 34, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  drawText(ctx, "local / capability index", x + 122, y + 24, 14, COLOR.muted, 600, MONO);
  const command = typed("$ npx roster init", time, 3.95, 1.15);
  drawText(ctx, command, x + 56, y + 136, 31, COLOR.graphite, 600, MONO);
  if (time < 5.3 && Math.floor(time * 2) % 2 === 0) {
    setFont(ctx, 31, 600, MONO);
    ctx.fillStyle = COLOR.violet;
    ctx.fillRect(x + 56 + ctx.measureText(command).width + 9, y + 140, 14, 31);
  }
  const lines = ["github", "filesystem", "postgres", "playwright", "linear", "sentry"];
  lines.forEach((line, index) => {
    const progress = easeOut(between(time, 5.15 + index * 0.1, 5.6 + index * 0.1));
    ctx.globalAlpha = alpha * progress;
    drawText(ctx, line, x + 56, y + 238 + index * 48, 22, index < 4 ? COLOR.graphite : COLOR.secondary, 600, MONO);
    drawText(ctx, "ready", x + 286, y + 238 + index * 48, 22, index < 4 ? COLOR.blue : COLOR.muted, 500, MONO);
  });
  ctx.globalAlpha = alpha;
  strokeLine(ctx, x + 840, y + 130, x + 840, y + 560, COLOR.graphite, 1, 0.12);
  drawText(ctx, "CAPABILITY FIELD", x + 910, y + 136, 14, COLOR.violet, 650, MONO);
  drawText(ctx, "200", x + 910, y + 190, 82, COLOR.ink, 760);
  drawText(ctx, "Every server is available.", x + 910, y + 304, 25, COLOR.secondary, 520);
  drawText(ctx, "Every definition competes for attention.", x + 910, y + 340, 25, COLOR.secondary, 520);
  strokeLine(ctx, x + 910, y + 420, x + 1334, y + 420, COLOR.graphite, 1, 0.13);
  drawText(ctx, "source / patch / verify", x + 910, y + 464, 14, COLOR.muted, 600, MONO);
  drawText(ctx, "issue / inspect / observe", x + 910, y + 500, 14, COLOR.muted, 600, MONO);
  // Only three chips escape: the terminal becomes the world, without cluttering it.
  const chips = [TOOLS[0], TOOLS[2], TOOLS[1]];
  const chipTargets = [[1450, 120], [1454, 868], [460, 868]];
  chips.forEach((tool, index) => {
    const p = easeOut(between(time, 7.0 + index * 0.16, 7.7 + index * 0.16));
    const chipX = mix(x + 590, chipTargets[index][0], p);
    const chipY = mix(y + 160, chipTargets[index][1], p);
    ctx.save();
    ctx.globalAlpha = alpha * p * 0.96;
    ctx.translate(chipX, chipY);
    ctx.rotate((index - 1) * 0.08 * p);
    drawGlass(ctx, -112, -31, 224, 62, 19, tool.color, 0.72);
    drawIcon(ctx, -77, 0, 34, tool.color, tool.kind);
    drawText(ctx, tool.name, -52, -10, 19, COLOR.graphite, 700);
    ctx.restore();
  });
  drawText(ctx, "A LOCAL COMMAND OPENS A MUCH LARGER SPACE", 250, 930, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawUniverse(ctx, time) {
  const alpha = sceneOpacity(time, 9.7, 16.6, 0.64);
  if (!alpha) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCapsuleField(ctx, time, 1, 0);
  drawText(ctx, "TOOL UNIVERSE", 132, 90, 16, COLOR.coral, 650, MONO);
  drawText(ctx, "One task.", 132, 140, 64, COLOR.graphite, 720);
  drawText(ctx, "Too many paths.", 132, 208, 64, COLOR.graphite, 720);
  const requestX = 780;
  const requestY = 430;
  drawDarkSurface(ctx, requestX, requestY, 360, 164, 28, COLOR.violet);
  drawText(ctx, "AGENT REQUEST", requestX + 34, requestY + 34, 14, COLOR.white, 650, MONO);
  drawText(ctx, "trace checkout error", requestX + 34, requestY + 78, 28, COLOR.white, 700);
  const positions = [
    [210, 288, -5], [510, 722, 5], [1326, 282, 4], [1438, 694, -5], [836, 164, -2], [88, 638, 5],
  ];
  positions.forEach(([x, y, rotation], index) => {
    const tool = TOOLS[index];
    const entrance = easeOut(between(time, 10.4 + index * 0.12, 11.25 + index * 0.12));
    const targetX = x;
    const targetY = y;
    const fromX = requestX + 78;
    const fromY = requestY + 46;
    const currentX = mix(fromX, targetX, entrance);
    const currentY = mix(fromY, targetY, entrance);
    drawRibbon(ctx, [currentX + 120, currentY + 62], [mix(currentX, requestX, 0.3), currentY - 70], [mix(currentX, requestX, 0.72), requestY + 220], [requestX + 180, requestY + 82], index < 5 ? COLOR.blue : COLOR.secondary, index < 5 ? 5 : 3, 0.36, time, index < 5 ? [18, 18] : [10, 26]);
    drawCandidateCard(ctx, tool, currentX, currentY, index === 4 ? 300 : 262, index === 4 ? 138 : 128, rotation, entrance * 0.96, 0.96, index < 5, "candidate");
  });
  drawText(ctx, "6 readable candidates  ·  hundreds implied", 1788, 956, 15, COLOR.secondary, 600, MONO, "right");
  ctx.restore();
}

function drawInitialize(ctx, time) {
  const alpha = sceneOpacity(time, 16.6, 21.8, 0.58);
  if (!alpha) return;
  const p = easeInOut(between(time, 17.1, 20.8));
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCapsuleField(ctx, time, 0.45 * (1 - p), p);
  drawText(ctx, "ROSTER INITIALIZES", 132, 92, 16, COLOR.violet, 650, MONO);
  drawText(ctx, "Many connections.", 132, 146, 62, COLOR.graphite, 720);
  drawText(ctx, "One local endpoint.", 132, 212, 62, COLOR.graphite, 720);
  const markX = 958;
  const markY = 558;
  // Six broad wires compress into one clean path. There are no permanent hairlines.
  const wireStarts = [[200, 340], [420, 760], [680, 270], [1220, 270], [1510, 420], [1400, 790]];
  wireStarts.forEach(([x, y], index) => {
    const strength = 1 - p * 0.78;
    drawRibbon(ctx, [x, y], [mix(x, markX, 0.34), mix(y, markY, 0.45)], [mix(x, markX, 0.72), mix(y, markY, 0.68)], [markX, markY], index < 5 ? COLOR.blue : COLOR.secondary, 4 + (index % 2), 0.28 * strength, time, [18, 25]);
  });
  drawMark(ctx, markX, markY, 150, "routing", time, 0.96);
  const clean = easeOut(between(time, 19.2, 21.15));
  drawRibbon(ctx, [markX + 110, markY], [1160, markY,], [1310, markY], [1538, markY], COLOR.mint, 10, 0.72 * clean, time, [32, 18], 0.38 + ((time * 0.55) % 0.4));
  drawGlass(ctx, 1430, 454, 320, 188, 28, COLOR.mint, 0.86);
  drawText(ctx, "AGENT", 1464, 488, 14, COLOR.mint, 650, MONO);
  drawText(ctx, "one clean path", 1464, 534, 27, COLOR.graphite, 700);
  const command = typed("$ npx roster init", time, 16.95, 1.1);
  drawGlass(ctx, 132, 370, 570, 118, 22, COLOR.violet, 0.8);
  drawText(ctx, command, 164, 414, 24, COLOR.graphite, 600, MONO);
  drawText(ctx, "MANY SERVERS  →  ONE LOCAL ENDPOINT", 132, 962, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawSearch(ctx, time) {
  const alpha = sceneOpacity(time, 21.8, 29.8, 0.58);
  if (!alpha) return;
  const scan = easeInOut(between(time, 22.2, 29.05));
  const beamX = mix(160, 1580, scan);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCapsuleField(ctx, time, 0.42, 0.15);
  drawText(ctx, "ROSTER / SEARCH", 132, 92, 16, COLOR.violet, 650, MONO);
  drawText(ctx, "Resolve the right", 132, 144, 62, COLOR.graphite, 720);
  drawText(ctx, "capability.", 132, 210, 62, COLOR.graphite, 720);
  const positions = [[160, 510, -4], [490, 710, 4], [760, 430, -2], [1118, 706, -4], [1438, 500, 5]];
  positions.forEach(([x, y, rotation], index) => {
    const tool = TOOLS[index];
    const distance = Math.abs((x + 130) - beamX);
    const focus = 1 - clamp(distance / 440);
    const selected = focus > 0.35;
    const scale = 0.94 + focus * 0.09;
    const yShift = -focus * 12;
    drawCandidateCard(ctx, tool, x, y + yShift, index === 2 ? 310 : 260, index === 2 ? 150 : 132, rotation, 0.54 + focus * 0.46, scale, selected, "search");
  });
  const beamGradient = ctx.createLinearGradient(beamX - 140, 0, beamX + 140, 0);
  beamGradient.addColorStop(0, rgba(COLOR.violet, 0));
  beamGradient.addColorStop(0.5, rgba(COLOR.violet, 0.2));
  beamGradient.addColorStop(1, rgba(COLOR.cyan, 0));
  ctx.fillStyle = beamGradient;
  ctx.fillRect(beamX - 140, 300, 280, 620);
  strokeLine(ctx, beamX, 300, beamX, 920, COLOR.violet, 5, 0.64);
  const evaluation = ["TASK FIT", "RELIABILITY", "LATENCY", "OUTCOME HISTORY"][Math.min(3, Math.floor(scan * 4.4))];
  const labelX = clamp(beamX + 40, 930, 1510);
  drawText(ctx, "EVALUATION", labelX, 286, 14, COLOR.violet, 650, MONO);
  drawText(ctx, evaluation, labelX, 324, 27, COLOR.graphite, 700);
  roundRect(ctx, labelX, 372, 240, 8, 4);
  ctx.fillStyle = rgba(COLOR.graphite, 0.09);
  ctx.fill();
  roundRect(ctx, labelX, 372, 240 * (0.4 + Math.min(3, Math.floor(scan * 4.4)) * 0.18), 8, 4);
  ctx.fillStyle = COLOR.violet;
  ctx.fill();
  drawText(ctx, "A SEARCH THAT NARROWS THE FIELD", 132, 962, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawClear(ctx, time) {
  const alpha = sceneOpacity(time, 29.8, 35.8, 0.56);
  if (!alpha) return;
  const wipe = easeInOut(between(time, 30.05, 34.95));
  const wipeX = mix(-260, 1880, wipe);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCapsuleField(ctx, time, 0.25, wipe);
  drawText(ctx, "INTELLIGENT FOCUS", 132, 92, 16, COLOR.violet, 650, MONO);
  drawText(ctx, "Signal stays.", 132, 146, 64, COLOR.graphite, 720);
  drawText(ctx, "Noise returns to the bench.", 132, 214, 58, COLOR.graphite, 720);
  const positions = [[170, 500, -4], [500, 704, 4], [784, 420, -2], [1130, 702, -4], [1445, 492, 5], [80, 760, 6]];
  positions.forEach(([x, y, rotation], index) => {
    const tool = TOOLS[index];
    const selected = index < 5;
    const passed = clamp((wipeX - (x + 120)) / 380);
    const rejected = !selected;
    const currentAlpha = rejected ? 1 - passed : 0.96;
    const currentY = y + (rejected ? passed * 90 : 0);
    drawCandidateCard(ctx, tool, x, currentY, index === 2 ? 310 : 260, index === 2 ? 150 : 132, rotation, currentAlpha, selected ? 1 + passed * 0.04 : 1 - passed * 0.08, selected, rejected ? "rejected" : "candidate");
    if (rejected && passed > 0.08) {
      for (let fragment = 0; fragment < 4; fragment += 1) {
        ctx.save();
        ctx.globalAlpha = alpha * passed * 0.55;
        ctx.translate(x + 38 + fragment * 46 + passed * 62, y + 34 + fragment * 18 - passed * (20 + fragment * 10));
        ctx.rotate((fragment * 16 + index * 9) * Math.PI / 180);
        ctx.fillStyle = tool.color;
        roundRect(ctx, 0, 0, 18 + fragment * 6, 7 + fragment * 2, 4);
        ctx.fill();
        ctx.restore();
      }
    }
  });
  const wipeGradient = ctx.createLinearGradient(wipeX - 200, 0, wipeX + 80, 0);
  wipeGradient.addColorStop(0, rgba(COLOR.violet, 0));
  wipeGradient.addColorStop(0.7, rgba(COLOR.violet, 0.19));
  wipeGradient.addColorStop(1, rgba(COLOR.cyan, 0));
  ctx.fillStyle = wipeGradient;
  ctx.beginPath();
  ctx.moveTo(wipeX - 260, 126);
  ctx.lineTo(wipeX + 36, 126);
  ctx.lineTo(wipeX - 220, 950);
  ctx.lineTo(wipeX - 516, 950);
  ctx.closePath();
  ctx.fill();
  strokeLine(ctx, wipeX, 126, wipeX - 240, 950, COLOR.violet, 5, 0.7);
  drawText(ctx, "CONNECTIONS RETRACT  ·  DEFINITIONS RETURN", 132, 962, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawStartingFive(ctx, time, final = false) {
  const start = final ? 53.45 : 35.8;
  const end = final ? 57 : 42.7;
  const alpha = sceneOpacity(time, start, end, final ? 0.38 : 0.52);
  if (!alpha) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const locations = [
    [110, 410, 332, 220, -7],
    [452, 732, 348, 222, 5],
    [738, 254, 444, 316, 0],
    [1120, 732, 348, 222, -5],
    [1480, 410, 332, 220, 7],
  ];
  if (!final) {
    drawText(ctx, "ROSTER / ROTATION", 132, 82, 16, COLOR.mint, 650, MONO);
    drawText(ctx, "THE STARTING FIVE", 132, 126, 58, COLOR.graphite, 720);
  }
  const convergence = final ? easeInOut(between(time, 53.82, 54.82)) : 0;
  locations.forEach(([x, y, width, height, rotation], index) => {
    const tool = TOOLS[index];
    const entrance = final ? 1 : easeOutBack(between(time, 36.15 + index * 0.24, 37.2 + index * 0.24));
    const cardX = final ? mix(x, 950 - width / 2, convergence) : x;
    const cardY = final ? mix(y, 550 - height / 2, convergence) : mix(y + 66, y, entrance);
    const cardScale = final ? mix(1, 0.72, convergence) : mix(0.9, 1, entrance);
    const cardAlpha = final ? 1 - convergence : entrance;
    const cardRotation = final ? mix(rotation, 0, convergence) : mix(rotation + (index % 2 ? 5 : -5), rotation, entrance);
    drawHeroCard(ctx, tool, cardX, cardY, width, height, cardRotation, cardAlpha, cardScale, index);
  });
  if (!final) {
    strokeLine(ctx, 260, 732, 960, 720, COLOR.blue, 3, 0.16);
    strokeLine(ctx, 960, 720, 1660, 732, COLOR.violet, 3, 0.16);
    drawMark(ctx, 960, 748, 132, "success", time, 0.92);
    drawText(ctx, "FIVE CAPABILITIES  /  ONE DELIBERATE ROTATION", 132, 962, 15, COLOR.muted, 600, MONO);
  }
  ctx.restore();
}

function drawCall(ctx, time) {
  const alpha = sceneOpacity(time, 42.7, 46.65, 0.52);
  if (!alpha) return;
  const packet = easeInOut(between(time, 43.2, 45.55));
  const returnPacket = easeOut(between(time, 45.52, 46.2));
  const packetX = packet < 0.62 ? mix(500, 960, packet / 0.62) : mix(960, 1420, (packet - 0.62) / 0.38);
  ctx.save();
  ctx.globalAlpha = alpha;
  drawText(ctx, "ROSTER / ROUTE", 132, 94, 16, COLOR.blue, 650, MONO);
  drawText(ctx, "One request.", 132, 146, 62, COLOR.graphite, 720);
  drawText(ctx, "One clean path.", 132, 212, 62, COLOR.graphite, 720);
  const boxes = [[170, "AGENT", "trace error", COLOR.graphite], [790, "ROSTER", "route locally", COLOR.violet], [1400, "PLAYWRIGHT", "verify fix", COLOR.cyan]];
  boxes.forEach(([x, label, body, color]) => {
    drawGlass(ctx, x, 470, 350, 190, 28, color, 0.88);
    drawText(ctx, label, x + 32, 506, 14, color, 650, MONO);
    drawText(ctx, body, x + 32, 552, 27, COLOR.graphite, 700);
  });
  drawRibbon(ctx, [520, 565], [650, 565], [710, 565], [790, 565], COLOR.blue, 9, 0.68, time, [32, 18], 1);
  drawRibbon(ctx, [1140, 565], [1230, 565], [1300, 565], [1400, 565], COLOR.mint, 9, 0.7, time, [32, 18], 1);
  ctx.fillStyle = packet < 0.62 ? COLOR.blue : COLOR.mint;
  ctx.shadowColor = rgba(packet < 0.62 ? COLOR.blue : COLOR.mint, 0.35);
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(packetX, 565, 18, 0, Math.PI * 2);
  ctx.fill();
  if (returnPacket) {
    ctx.fillStyle = COLOR.mint;
    ctx.beginPath();
    ctx.arc(mix(1410, 1000, returnPacket), 565, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = "transparent";
  drawText(ctx, "REQUEST  →  ROSTER  →  CAPABILITY  →  RESULT", 132, 962, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawSixthMan(ctx, time) {
  const alpha = sceneOpacity(time, 46.65, 49.95, 0.48);
  if (!alpha) return;
  const failure = easeInOut(between(time, 47.0, 47.72));
  const suggestion = easeOut(between(time, 47.95, 48.72));
  const accept = easeInOut(between(time, 49.0, 49.65));
  ctx.save();
  ctx.globalAlpha = alpha;
  drawText(ctx, "ROSTER / SIXTH MAN", 132, 94, 16, COLOR.coral, 650, MONO);
  drawText(ctx, "A failed route", 132, 146, 62, COLOR.graphite, 720);
  drawText(ctx, "doesn't end the task.", 132, 212, 62, COLOR.graphite, 720);
  ctx.globalAlpha = alpha * (1 - failure * 0.88);
  drawGlass(ctx, 178, 464, 356, 216, 28, COLOR.coral, 0.86);
  drawIcon(ctx, 234, 526, 56, COLOR.coral, "verify");
  drawText(ctx, "playwright", 214, 584, 32, COLOR.graphite, 700);
  drawText(ctx, "CONNECTION LOST", 214, 628, 12, COLOR.coral, 650, MONO);
  ctx.globalAlpha = alpha * (1 - failure);
  drawRibbon(ctx, [540, 572], [700, 572], [820, 572], [936, 572], COLOR.coral, 9, 0.7, time, [18, 18], 1);
  drawMark(ctx, 960, 572, 132, "failure", time, alpha);
  const optionX = mix(1240, 1310, suggestion);
  const optionY = mix(716, 464, suggestion);
  ctx.globalAlpha = alpha * suggestion;
  drawGlass(ctx, optionX, optionY, 390, 252, 28, COLOR.mint, 0.9);
  drawText(ctx, "NEXT BEST OPTION", optionX + 32, optionY + 32, 13, COLOR.mint, 650, MONO);
  drawIcon(ctx, optionX + 62, optionY + 98, 58, COLOR.mint, "observe");
  drawText(ctx, "sentry", optionX + 32, optionY + 154, 38, COLOR.graphite, 720);
  drawText(ctx, "SUGGESTED  ·  AWAITING AGENT", optionX + 32, optionY + 204, 12, COLOR.mint, 650, MONO);
  ctx.globalAlpha = alpha * accept;
  drawRibbon(ctx, [1084, 572], [1180, 572], [1270, 572], [1450, 572], COLOR.mint, 10, 0.74, time, [32, 18], 1);
  drawText(ctx, accept > 0.5 ? "AGENT ACCEPTED THE SUGGESTION" : "ROSTER SUGGESTS  ·  AGENT DECIDES", 1788, 962, 15, accept > 0.5 ? COLOR.mint : COLOR.muted, 600, MONO, "right");
  ctx.restore();
}

function drawCoachLeague(ctx, time) {
  const alpha = sceneOpacity(time, 49.95, 53.55, 0.46);
  if (!alpha) return;
  const learn = easeInOut(between(time, 50.35, 52.6));
  ctx.save();
  ctx.globalAlpha = alpha;
  drawText(ctx, "COACH / LEAGUE", 132, 94, 16, COLOR.violet, 650, MONO);
  drawText(ctx, "Use makes the route", 132, 146, 60, COLOR.graphite, 720);
  drawText(ctx, "more certain.", 132, 210, 60, COLOR.graphite, 720);
  drawGlass(ctx, 176, 402, 920, 352, 30, COLOR.violet, 0.88);
  drawText(ctx, "COACH  ·  LOCAL OUTCOMES", 214, 438, 14, COLOR.violet, 650, MONO);
  drawText(ctx, "successful routes accumulate preference", 214, 486, 26, COLOR.graphite, 700);
  ctx.strokeStyle = rgba(COLOR.violet, 0.16);
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(220, 690);
  ctx.bezierCurveTo(410, 672, 510, 682, 650, 624);
  ctx.bezierCurveTo(790, 564, 900, 568, 1030, 514);
  ctx.stroke();
  ctx.strokeStyle = COLOR.violet;
  ctx.lineWidth = 7;
  ctx.setLineDash([26, 18]);
  ctx.lineDashOffset = -(time * 80 % 1000);
  ctx.beginPath();
  ctx.moveTo(220, 690);
  ctx.bezierCurveTo(410, 672, 510, 682, 650, 624);
  ctx.bezierCurveTo(790, 564, 900, 568, 1030, 514);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLOR.violet;
  ctx.beginPath();
  ctx.arc(220 + learn * 810, 690 - learn * 176, 15, 0, Math.PI * 2);
  ctx.fill();
  drawGlass(ctx, 1194, 402, 546, 352, 30, COLOR.blue, 0.88);
  drawText(ctx, "LEAGUE  ·  PRE-SEASON", 1230, 438, 14, COLOR.blue, 650, MONO);
  drawText(ctx, "quality", 1230, 492, 44, COLOR.graphite, 720);
  drawText(ctx, "becomes visible.", 1230, 544, 44, COLOR.graphite, 720);
  drawText(ctx, "0 / 8 CERTIFIED  ·  NO RANK", 1230, 694, 14, COLOR.secondary, 650, MONO);
  drawText(ctx, "COACH LEARNS LOCALLY  /  LEAGUE STAYS HONEST", 132, 962, 15, COLOR.muted, 600, MONO);
  ctx.restore();
}

function drawFinal(ctx, time) {
  const alpha = sceneOpacity(time, 53.55, 57, 0.26);
  if (!alpha) return;
  const logo = easeOut(between(time, 54.25, 55.45));
  ctx.save();
  ctx.globalAlpha = alpha;
  drawCapsuleField(ctx, time, 0.1, 0);
  // Let the lineup leave the frame before the identity lockup holds. This
  // prevents the final wordmark from competing with miniature converged cards.
  if (time < 54.34) drawStartingFive(ctx, time, true);
  drawMark(ctx, 1320, 440, 214, "success", time, logo);
  ctx.globalAlpha = alpha * logo;
  drawText(ctx, "ROSTER", 132, 128, 170, COLOR.graphite, 800);
  drawText(ctx, "YOUR AGENT HAS 200 TOOLS.", 138, 804, 35, COLOR.graphite, 650);
  drawText(ctx, "ONLY FIVE GET TO START.", 138, 850, 35, COLOR.graphite, 650);
  drawText(ctx, "npx roster init", 138, 926, 16, COLOR.violet, 650, MONO);
  ctx.restore();
}

function drawFrame(ctx, time) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  drawBackground(ctx, time, time > 29.5 ? 1 : 0);
  drawHook(ctx, time);
  drawTerminal(ctx, time);
  drawUniverse(ctx, time);
  drawInitialize(ctx, time);
  drawSearch(ctx, time);
  drawClear(ctx, time);
  drawStartingFive(ctx, time);
  drawCall(ctx, time);
  drawSixthMan(ctx, time);
  drawCoachLeague(ctx, time);
  drawFinal(ctx, time);
  drawText(ctx, "ROSTER  ·  EDITORIAL LAUNCH FILM", 1788, 1018, 12, COLOR.muted, 600, MONO, "right");
}

export default function RosterLaunchFinal() {
  const { time } = useTicker();
  return (
    <rect scene="roster-launch-diffusion-final" name="Roster Launch Film · Final Diffusion Pass" width={WIDTH} height={HEIGHT} fill={COLOR.paper}>
      {/* biome-ignore lint/a11y/useMediaCaption: this is an instrumental sound-design bed with no spoken dialogue */}
      <audio src={AUDIO_PATH} start={0} end={DURATION} volume={-5} />
      <surface
        name="Roster Launch · Final Canvas"
        width={WIDTH}
        height={HEIGHT}
        end={DURATION}
        ref={(canvas) => {
          const context = canvas.getContext("2d");
          if (!context) return;
          createEffect(() => drawFrame(context, time()));
        }}
      />
    </rect>
  );
}
