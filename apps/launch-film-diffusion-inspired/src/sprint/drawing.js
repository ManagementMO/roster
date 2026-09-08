import { COLOR, FONT, MONO } from "./design.js";
import { bezierPoint, clamp, mix } from "../spectacle/motion.js";

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

export const trackedText = (ctx, value, x, y, size, tracking, color, weight = 700, align = "left") => {
  ctx.save();
  setFont(ctx, size, weight, MONO);
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  const widths = [...value].map((character) => ctx.measureText(character).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, value.length - 1) * tracking;
  let cursor = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  [...value].forEach((character, index) => {
    ctx.fillText(character, cursor, y);
    cursor += widths[index] + tracking;
  });
  ctx.restore();
};

export const fillRoundRect = (ctx, x, y, width, height, radius, fill) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
};

export const drawField = (ctx, dark = false) => {
  const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
  if (dark) {
    gradient.addColorStop(0, "#070A10");
    gradient.addColorStop(0.56, "#101722");
    gradient.addColorStop(1, "#080D14");
  } else {
    gradient.addColorStop(0, COLOR.white);
    gradient.addColorStop(0.62, COLOR.paper);
    gradient.addColorStop(1, "#EEF2F6");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
};

export const drawCore = (ctx, x, y, size, color, progress = 1, spread = 1, dark = false) => {
  const heights = [0.48, 0.72, 0.9, 0.72, 0.48];
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = rgba(color, dark ? 0.34 : 0.22);
  ctx.shadowBlur = 28 * progress;
  heights.forEach((height, index) => {
    const delayed = clamp(progress * 1.52 - index * 0.13);
    const barWidth = size * 0.105;
    const barHeight = size * height * delayed;
    const offset = (index - 2) * size * 0.155 * spread;
    fillRoundRect(ctx, offset - barWidth / 2, -barHeight / 2, barWidth, barHeight, barWidth / 2, color);
  });
  ctx.shadowColor = "transparent";
  ctx.fillStyle = dark ? COLOR.ink : COLOR.white;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.055 * progress, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export const drawIcon = (ctx, x, y, size, color, kind, progress = 1) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(progress, progress);
  fillRoundRect(ctx, -size / 2, -size / 2, size, size, size * 0.28, color);
  ctx.strokeStyle = COLOR.white;
  ctx.lineWidth = Math.max(3, size * 0.065);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "source") {
    ctx.moveTo(-size * 0.23, size * 0.02);
    ctx.lineTo(-size * 0.06, size * 0.19);
    ctx.lineTo(size * 0.25, -size * 0.2);
  } else if (kind === "patch") {
    ctx.moveTo(-size * 0.23, -size * 0.14);
    ctx.lineTo(size * 0.23, -size * 0.14);
    ctx.moveTo(-size * 0.23, size * 0.14);
    ctx.lineTo(size * 0.23, size * 0.14);
  } else if (kind === "verify") {
    ctx.arc(-size * 0.04, -size * 0.04, size * 0.2, 0, Math.PI * 2);
    ctx.moveTo(size * 0.1, size * 0.1);
    ctx.lineTo(size * 0.28, size * 0.28);
  } else if (kind === "issue") {
    ctx.moveTo(-size * 0.22, size * 0.18);
    ctx.lineTo(0, -size * 0.22);
    ctx.lineTo(size * 0.22, size * 0.18);
    ctx.closePath();
  } else {
    ctx.arc(-size * 0.05, -size * 0.05, size * 0.18, 0, Math.PI * 2);
    ctx.moveTo(size * 0.08, size * 0.08);
    ctx.lineTo(size * 0.27, size * 0.27);
  }
  ctx.stroke();
  ctx.restore();
};

export const drawGlass = (ctx, x, y, width, height, radius, accent, dark = false, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = dark ? "rgba(0,0,0,0.34)" : "rgba(17,29,48,0.14)";
  ctx.shadowBlur = dark ? 32 : 26;
  ctx.shadowOffsetY = dark ? 18 : 14;
  const fill = ctx.createLinearGradient(x, y, x + width, y + height);
  if (dark) {
    fill.addColorStop(0, "rgba(31,39,53,0.96)");
    fill.addColorStop(0.72, "rgba(10,14,22,0.94)");
    fill.addColorStop(1, rgba(accent, 0.14));
  } else {
    fill.addColorStop(0, "rgba(255,255,255,0.98)");
    fill.addColorStop(0.55, "rgba(255,255,255,0.86)");
    fill.addColorStop(1, rgba(accent, 0.08));
  }
  fillRoundRect(ctx, x, y, width, height, radius, fill);
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, width - 2, height - 2, radius - 1);
  ctx.strokeStyle = dark ? rgba(accent, 0.5) : "rgba(255,255,255,0.96)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 3, width - 6, height - 6, radius - 3);
  ctx.strokeStyle = rgba(accent, dark ? 0.4 : 0.34);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
};

export const drawCandidate = (ctx, tool, x, y, width, height, rotation, scale, progress, dark = false) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  drawGlass(ctx, -width / 2, -height / 2, width, height, 30, tool.color, dark, progress);
  const iconIn = clamp(progress * 1.8 - 0.22);
  drawIcon(ctx, -width / 2 + 52, 0, 54, tool.color, tool.glyph, iconIn);
  ctx.save();
  ctx.globalAlpha = clamp(progress * 1.6 - 0.42);
  text(ctx, tool.name, -width / 2 + 94, -25, 28, dark ? COLOR.white : COLOR.ink, 780);
  ctx.restore();
  ctx.restore();
};

export const drawHero = (ctx, tool, x, y, width, height, rotation, scale, shellProgress, detailProgress) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  drawGlass(ctx, -width / 2, -height / 2, width, height, Math.min(42, height * 0.2), tool.color, false, shellProgress);
  drawIcon(ctx, -width / 2 + 58, -height / 2 + 58, 64, tool.color, tool.glyph, detailProgress);
  ctx.save();
  ctx.globalAlpha = detailProgress;
  text(ctx, tool.name, -width / 2 + 106, -height / 2 + 34, Math.min(38, width * 0.1), COLOR.ink, 800);
  text(ctx, tool.capability, -width / 2 + 30, height / 2 - 48, 18, COLOR.slate, 600);
  fillRoundRect(ctx, width / 2 - 88, height / 2 - 24, 56, 7, 4, tool.color);
  ctx.restore();
  ctx.restore();
};

export const drawRibbon = (ctx, start, c1, c2, end, color, width, progress = 1, alpha = 1) => {
  const steps = Math.max(2, Math.ceil(48 * clamp(progress)));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let index = 0; index <= steps; index += 1) {
    const amount = (index / 48) * clamp(progress);
    const point = bezierPoint(start, c1, c2, end, amount);
    if (index === 0) ctx.moveTo(point[0], point[1]);
    else ctx.lineTo(point[0], point[1]);
  }
  ctx.stroke();
  ctx.restore();
};

export const drawPacket = (ctx, start, c1, c2, end, progress, color, size = 18) => {
  const point = bezierPoint(start, c1, c2, end, clamp(progress));
  const next = bezierPoint(start, c1, c2, end, clamp(progress + 0.015));
  ctx.save();
  ctx.translate(point[0], point[1]);
  ctx.rotate(Math.atan2(next[1] - point[1], next[0] - point[0]));
  ctx.shadowColor = rgba(color, 0.44);
  ctx.shadowBlur = 20;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 1.8, size * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

export const drawCountBars = (ctx, x, y, progress, dark = false) => {
  const colors = [COLOR.blue, COLOR.blueDeep, COLOR.blue, COLOR.amber, COLOR.green];
  colors.forEach((color, index) => {
    const local = clamp(progress * 1.7 - index * 0.14);
    const height = mix(14, 82, local);
    fillRoundRect(ctx, x + index * 34, y - height / 2, 18, height, 9, color);
  });
  if (dark) {
    ctx.fillStyle = COLOR.ink;
    ctx.beginPath();
    ctx.arc(x + 77, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
};
