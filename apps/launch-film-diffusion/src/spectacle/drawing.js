import { COLOR, FONT, MONO } from "./design.js";
import { bezierPoint, clamp, hash } from "./motion.js";

export const rgba = (hex, alpha) => {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};

export const setFont = (ctx, size, weight = 600, family = FONT) => {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "top";
};

export const text = (ctx, value, x, y, size, color = COLOR.ink, weight = 600, align = "left", family = FONT) => {
  setFont(ctx, size, weight, family);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
};

export const trackedText = (ctx, value, x, y, size, tracking, color = COLOR.ink, weight = 600, alpha = 1, family = FONT) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  setFont(ctx, size, weight, family);
  ctx.fillStyle = color;
  let cursor = x;
  for (const character of value) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
  ctx.restore();
};

export const roundRect = (ctx, x, y, width, height, radius) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
};

export const fillRoundRect = (ctx, x, y, width, height, radius, fill) => {
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
};

export const line = (ctx, start, end, color, width = 2, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.lineTo(end[0], end[1]);
  ctx.stroke();
  ctx.restore();
};

export const drawBackdrop = (ctx, time, mode = "light", energy = 0, accent = COLOR.blue) => {
  const dark = mode === "dark";
  ctx.fillStyle = dark ? COLOR.ink : COLOR.paper;
  ctx.fillRect(0, 0, 1920, 1080);

  const base = ctx.createLinearGradient(0, 0, 1920, 1080);
  if (dark) {
    base.addColorStop(0, "#080B11");
    base.addColorStop(0.5, "#121722");
    base.addColorStop(1, "#090D14");
  } else {
    base.addColorStop(0, "#FFFFFF");
    base.addColorStop(0.48, "#F8FAFC");
    base.addColorStop(1, "#EDF1F6");
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1920, 1080);

  const sources = [
    [220 + Math.sin(time * 0.18) * 120, 50 + Math.cos(time * 0.12) * 80, 680, accent, dark ? 0.22 : 0.12],
    [1650 + Math.cos(time * 0.14) * 100, 930 + Math.sin(time * 0.1) * 90, 720, COLOR.blue, dark ? 0.09 : 0.055],
  ];
  for (const [x, y, radius, color, opacity] of sources) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, rgba(color, opacity * (0.65 + energy * 0.35)));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1920, 1080);
  }

  if (energy > 0.05) {
    ctx.save();
    ctx.globalAlpha = energy * (dark ? 0.18 : 0.09);
    ctx.strokeStyle = dark ? COLOR.white : accent;
    ctx.lineWidth = 2;
    for (let index = 0; index < 7; index += 1) {
      const offset = (time * (90 + index * 12) + index * 310) % 2500 - 260;
      ctx.beginPath();
      ctx.moveTo(offset, -80);
      ctx.lineTo(offset + 760, 1160);
      ctx.stroke();
    }
    ctx.restore();
  }
};

export const drawSoftRibbon = (ctx, start, control1, control2, end, color, width, alpha, progress = 1, glow = 0) => {
  const steps = Math.max(4, Math.floor(56 * clamp(progress)));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const point = bezierPoint(start, control1, control2, end, (index / 56) * progress);
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.stroke();
  ctx.restore();
};

export const drawPulseOnRibbon = (ctx, start, control1, control2, end, amount, color, size = 16, stretch = 1) => {
  const point = bezierPoint(start, control1, control2, end, amount);
  const next = bezierPoint(start, control1, control2, end, clamp(amount + 0.01));
  const angle = Math.atan2(next[1] - point[1], next[0] - point[0]);
  ctx.save();
  ctx.translate(point[0], point[1]);
  ctx.rotate(angle);
  ctx.scale(stretch, 1);
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export const drawGlassLens = (ctx, x, y, width, height, radius, accent = COLOR.blue, alpha = 1, depth = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = "rgba(18,28,45,0.15)";
  ctx.shadowBlur = 30 * depth;
  ctx.shadowOffsetY = 15 * depth;
  const shell = ctx.createLinearGradient(x, y, x + width, y + height);
  shell.addColorStop(0, "rgba(255,255,255,0.96)");
  shell.addColorStop(0.36, "rgba(255,255,255,0.76)");
  shell.addColorStop(0.72, rgba(accent, 0.055));
  shell.addColorStop(1, "rgba(255,255,255,0.9)");
  fillRoundRect(ctx, x, y, width, height, radius, shell);
  ctx.shadowColor = "transparent";

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,255,255,0.98)";
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, radius - 1);
  ctx.stroke();

  const edge = ctx.createLinearGradient(x, y, x + width, y + height);
  edge.addColorStop(0, rgba(accent, 0.5));
  edge.addColorStop(0.22, "rgba(255,255,255,0)");
  edge.addColorStop(0.75, "rgba(255,255,255,0)");
  edge.addColorStop(1, rgba(accent, 0.2));
  ctx.lineWidth = 2;
  ctx.strokeStyle = edge;
  roundRect(ctx, x + 3, y + 3, width - 6, height - 6, radius - 3);
  ctx.stroke();

  const lens = ctx.createRadialGradient(x + width * 0.24, y + height * 0.08, 0, x + width * 0.24, y + height * 0.08, width * 0.72);
  lens.addColorStop(0, "rgba(255,255,255,0.78)");
  lens.addColorStop(0.35, "rgba(255,255,255,0.16)");
  lens.addColorStop(1, "rgba(255,255,255,0)");
  roundRect(ctx, x + 6, y + 6, width - 12, height - 12, radius - 6);
  ctx.fillStyle = lens;
  ctx.fill();

  ctx.save();
  roundRect(ctx, x + 8, y + 8, width - 16, height - 16, radius - 8);
  ctx.clip();
  ctx.translate(x + width * 0.64, y + height * 0.18);
  ctx.rotate(-0.28);
  const specular = ctx.createLinearGradient(-width * 0.22, 0, width * 0.22, 0);
  specular.addColorStop(0, "rgba(255,255,255,0)");
  specular.addColorStop(0.5, "rgba(255,255,255,0.62)");
  specular.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = specular;
  ctx.fillRect(-width * 0.28, -height, width * 0.18, height * 2);
  ctx.restore();
  ctx.restore();
};

export const drawDarkGlass = (ctx, x, y, width, height, radius, accent = COLOR.blue, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = rgba(accent, 0.16);
  ctx.shadowBlur = 34;
  const fill = ctx.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, "rgba(33,35,47,0.98)");
  fill.addColorStop(0.58, "rgba(15,17,25,0.95)");
  fill.addColorStop(1, rgba(accent, 0.11));
  fillRoundRect(ctx, x, y, width, height, radius, fill);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = rgba(accent, 0.42);
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, width - 2, height - 2, radius - 1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius * 0.65, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.restore();
};

export const drawGlyph = (ctx, x, y, size, color, kind = "source", alpha = 1, invert = false) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.shadowColor = rgba(color, 0.28);
  ctx.shadowBlur = 18;
  fillRoundRect(ctx, -size / 2, -size / 2, size, size, size * 0.3, color);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = invert ? COLOR.ink : COLOR.white;
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "source") {
    ctx.moveTo(-size * 0.23, size * 0.04);
    ctx.lineTo(-size * 0.07, size * 0.2);
    ctx.lineTo(size * 0.25, -size * 0.2);
  } else if (kind === "patch") {
    ctx.moveTo(-size * 0.23, -size * 0.16);
    ctx.lineTo(size * 0.23, -size * 0.16);
    ctx.moveTo(-size * 0.23, size * 0.16);
    ctx.lineTo(size * 0.23, size * 0.16);
  } else if (kind === "verify") {
    ctx.arc(0, 0, size * 0.23, 0, Math.PI * 2);
    ctx.moveTo(size * 0.16, size * 0.16);
    ctx.lineTo(size * 0.29, size * 0.29);
  } else if (kind === "issue") {
    ctx.moveTo(-size * 0.22, size * 0.19);
    ctx.lineTo(0, -size * 0.23);
    ctx.lineTo(size * 0.22, size * 0.19);
    ctx.closePath();
  } else if (kind === "inspect") {
    ctx.arc(-size * 0.05, -size * 0.05, size * 0.18, 0, Math.PI * 2);
    ctx.moveTo(size * 0.09, size * 0.09);
    ctx.lineTo(size * 0.27, size * 0.27);
  } else {
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.moveTo(-size * 0.2, 0);
    ctx.lineTo(size * 0.2, 0);
  }
  ctx.stroke();
  ctx.restore();
};

export const drawRosterMark = (ctx, x, y, size, color = COLOR.blue, time = 0, state = "idle", alpha = 1, rotation = 0) => {
  const energy = state === "search" ? 1 : state === "failure" ? 0.85 : state === "success" ? 0.72 : 0.4;
  const flex = Math.sin(time * (state === "search" ? 5.5 : 2.2)) * size * 0.018 * energy;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.shadowColor = rgba(color, 0.38);
  ctx.shadowBlur = 38 * energy;
  for (let index = -2; index <= 2; index += 1) {
    const barWidth = size * 0.115;
    const baseHeight = size * (0.44 + (2 - Math.abs(index)) * 0.095);
    const height = baseHeight + flex * (index % 2 === 0 ? 1 : -1);
    const spacing = size * (state === "search" ? 0.162 : 0.15);
    const offset = state === "failure" ? (index % 2 === 0 ? -6 : 8) : 0;
    fillRoundRect(ctx, index * spacing - barWidth / 2 + offset, -height / 2, barWidth, height, barWidth / 2, color);
  }
  ctx.shadowColor = "transparent";
  ctx.fillStyle = COLOR.white;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.066, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export const drawCandidate = (ctx, tool, x, y, width, height, rotation = 0, scale = 1, alpha = 1, focus = 0, dark = false) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  const compact = height <= 112;
  if (dark) drawDarkGlass(ctx, -width / 2, -height / 2, width, height, compact ? 22 : 28, tool.color, 0.98);
  else drawGlassLens(ctx, -width / 2, -height / 2, width, height, compact ? 22 : 28, tool.color, 0.98, 0.72 + focus * 0.4);
  if (compact) {
    drawGlyph(ctx, -width / 2 + 36, 0, 38, tool.color, tool.glyph);
    text(ctx, tool.name, -width / 2 + 68, -15, 20, dark ? COLOR.white : COLOR.ink, 740);
  } else {
    drawGlyph(ctx, -width / 2 + 48, -height / 2 + 46, 46, tool.color, tool.glyph);
    text(ctx, tool.name, -width / 2 + 28, height / 2 - 57, 27, dark ? COLOR.white : COLOR.ink, 760);
    text(ctx, tool.role, width / 2 - 26, -height / 2 + 28, 12, focus > 0.4 ? tool.color : dark ? "#AEB5C7" : COLOR.muted, 700, "right", MONO);
    if (focus > 0.3) {
      fillRoundRect(ctx, -width / 2 + 28, height / 2 - 22, (width - 56) * focus, 6, 3, tool.color);
    }
  }
  ctx.restore();
};

export const drawHeroTool = (ctx, tool, x, y, width, height, index, rotation = 0, scale = 1, alpha = 1, selected = true) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  const compact = width < 360 || height < 220;
  const large = width >= 440;
  const radius = compact ? 34 : 42;
  const railWidth = compact ? 64 : 78;
  const railInset = compact ? 14 : 18;
  const textX = -width / 2 + (compact ? 98 : 122);
  const roleY = -height / 2 + (compact ? 28 : 38);
  const titleY = -height / 2 + (compact ? 62 : 78);
  const titleSize = compact ? Math.min(32, width * 0.095) : large ? 48 : 40;
  drawGlassLens(ctx, -width / 2, -height / 2, width, height, radius, tool.color, 1, selected ? 1.2 : 0.8);
  fillRoundRect(ctx, -width / 2 + railInset, -height / 2 + railInset, railWidth, height - railInset * 2, compact ? 24 : 30, rgba(tool.color, 0.085));
  drawGlyph(ctx, -width / 2 + railInset + railWidth / 2, -height / 2 + railInset + railWidth / 2, compact ? 48 : 62, tool.color, tool.glyph);
  text(ctx, `0${index + 1}`, width / 2 - 28, -height / 2 + 22, compact ? 34 : 46, rgba(tool.color, 0.22), 820, "right");
  text(ctx, tool.role, textX, roleY, compact ? 11 : 13, tool.color, 720, "left", MONO);
  text(ctx, tool.name, textX, titleY, titleSize, COLOR.ink, 790);
  text(ctx, tool.capability, textX, height / 2 - (compact ? 42 : 58), compact ? 16 : 20, COLOR.slate, 560);
  fillRoundRect(ctx, width / 2 - (compact ? 82 : 118), height / 2 - 26, compact ? 50 : 82, 6, 3, tool.color);
  ctx.restore();
};

export const drawMotionStreaks = (ctx, time, amount, color = COLOR.violet, direction = 1) => {
  ctx.save();
  ctx.globalAlpha *= amount;
  ctx.lineCap = "round";
  for (let index = 0; index < 11; index += 1) {
    const y = 70 + index * 94 + hash(index * 3.2) * 38;
    const x = ((time * (280 + index * 17) + index * 181) % 2360) - 220;
    const length = 80 + hash(index * 9.4) * 190;
    const gradient = ctx.createLinearGradient(x, y, x + length * direction, y);
    gradient.addColorStop(0, rgba(color, 0));
    gradient.addColorStop(1, rgba(color, 0.52));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3 + (index % 3) * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length * direction, y);
    ctx.stroke();
  }
  ctx.restore();
};

export const drawWordCascade = (ctx, words, time, start, color, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  words.forEach((word, index) => {
    const local = clamp((time - start - index * 0.055) / 0.48);
    const x = 110 + (index % 5) * 360;
    const y = 130 + Math.floor(index / 5) * 170;
    text(ctx, word, x + (1 - local) * 100, y, 64, rgba(color, 0.09 + local * 0.16), 800);
  });
  ctx.restore();
};
