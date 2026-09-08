import { BRAND_PATHS } from "../real/brandPaths.js";
import { COLOR, FONT, HEIGHT, MONO, SANS, WIDTH } from "./design.js";
import { clamp, easeOut, mix, span } from "./motion.js";

const BRAND_PATH_CACHE = new Map();
const ROSTER_LOGO_SOURCE = "file:///Users/mo/Downloads/roster/apps/launch-film-diffusion-inspired/assets/brands/roster-logo.png";
const ROSTER_LOGO = typeof Image === "function" ? new Image() : null;
if (ROSTER_LOGO) {
  ROSTER_LOGO.decoding = "sync";
  ROSTER_LOGO.src = ROSTER_LOGO_SOURCE;
}

export const rgba = (hex, alpha) => {
  const raw = hex.replace("#", "");
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
};

export const font = (ctx, size, weight = 600, family = SANS) => {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = "top";
};

export const text = (ctx, value, x, y, size, color = COLOR.cream, weight = 600, align = "left", family = SANS) => {
  font(ctx, size, weight, family);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
};

export const serif = (ctx, value, x, y, size, color = COLOR.cream, weight = 400, align = "left") => {
  text(ctx, value, x, y, size, color, weight, align, FONT);
};

export const mono = (ctx, value, x, y, size, color = COLOR.cream, weight = 500, align = "left") => {
  text(ctx, value, x, y, size, color, weight, align, MONO);
};

export const tracked = (ctx, value, x, y, size, tracking, color = COLOR.muted, weight = 600, align = "left") => {
  ctx.save();
  font(ctx, size, weight, MONO);
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

export const round = (ctx, x, y, width, height, radius, fill, stroke = null, strokeWidth = 1) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
};

export const line = (ctx, x1, y1, x2, y2, color, width = 2, alpha = 1, cap = "round") => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
};

export const drawBlack = (ctx, time = 0, warmth = 0.45) => {
  ctx.fillStyle = COLOR.black;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(950, 824, 20, 950, 824, 840);
  glow.addColorStop(0, rgba(COLOR.warm, 0.12 * warmth));
  glow.addColorStop(0.32, rgba(COLOR.warmSoft, 0.055 * warmth));
  glow.addColorStop(1, rgba(COLOR.black, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const haze = ctx.createLinearGradient(0, 700, 0, HEIGHT);
  haze.addColorStop(0, "rgba(5,5,6,0)");
  haze.addColorStop(1, "rgba(5,5,6,0.32)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const drift = (time * 0.15) % 1;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = rgba(COLOR.warm, 0.18);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-100, 874 + drift * 8);
  ctx.quadraticCurveTo(670, 822, 1280, 884);
  ctx.quadraticCurveTo(1560, 910, 2020, 850);
  ctx.stroke();
  ctx.restore();
};

export const drawLogo = (ctx, x, y, size, alpha = 1, glow = 0.2, rotation = 0) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (glow > 0) {
    ctx.shadowColor = rgba(COLOR.warm, glow);
    ctx.shadowBlur = size * 0.34;
  }
  if (ROSTER_LOGO?.complete && ROSTER_LOGO.naturalWidth) {
    ctx.drawImage(ROSTER_LOGO, -size / 2, -size / 2, size, size * (ROSTER_LOGO.naturalHeight / ROSTER_LOGO.naturalWidth));
  } else {
    ctx.fillStyle = COLOR.cream;
    ctx.beginPath();
    ctx.roundRect(-size * 0.36, -size * 0.45, size * 0.72, size * 0.25, size * 0.12);
    ctx.roundRect(-size * 0.36, size * 0.18, size * 0.72, size * 0.25, size * 0.12);
    ctx.fill();
  }
  ctx.restore();
};

export const drawBrand = (ctx, key, x, y, size, alpha = 1, colorOverride = null, rotation = 0) => {
  const data = BRAND_PATHS[key];
  if (!data || typeof Path2D === "undefined") return false;
  const [minX, minY, viewWidth, viewHeight] = data.viewBox;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.translate(-size / 2, -size / 2);
  ctx.scale(size / viewWidth, size / viewHeight);
  ctx.translate(-minX, -minY);
  const cached = BRAND_PATH_CACHE.get(key) ?? data.paths.map((pathData) => {
    try {
      return { ...pathData, path: new Path2D(pathData.d) };
    } catch {
      return { ...pathData, path: null };
    }
  });
  BRAND_PATH_CACHE.set(key, cached);
  cached.forEach((pathData) => {
    if (!pathData.path) return;
    ctx.fillStyle = pathData.fill === "currentColor" ? colorOverride ?? COLOR.cream : pathData.fill;
    ctx.fill(pathData.path);
  });
  ctx.restore();
  return true;
};

export const drawTerminalFrame = (ctx, x, y, width, height, scale, alpha, localTime) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(0,0,0,0.48)";
  ctx.shadowBlur = 56;
  ctx.shadowOffsetY = 26;
  round(ctx, -width / 2, -height / 2, width, height, 34, COLOR.panel, rgba(COLOR.cream, 0.16), 2);
  ctx.shadowColor = "transparent";
  const header = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, -height / 2 + 92);
  header.addColorStop(0, "rgba(255,255,255,0.065)");
  header.addColorStop(1, "rgba(255,255,255,0.01)");
  round(ctx, -width / 2, -height / 2, width, 92, 34, header);
  ctx.fillStyle = COLOR.warm;
  [0, 1, 2].forEach((index) => {
    ctx.beginPath();
    ctx.arc(-width / 2 + 36 + index * 26, -height / 2 + 46, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  mono(ctx, "roster  /  local route", -width / 2 + 126, -height / 2 + 31, 20, COLOR.muted, 600);
  const left = -width / 2 + 92;
  const top = -height / 2 + 156;
  const command = "$ roster route \"verify checkout flow\"";
  const typed = Math.floor(clamp((localTime - 0.25) / 1.04) * command.length);
  mono(ctx, `${command.slice(0, typed)}${Math.floor(localTime * 2) % 2 === 0 ? "▌" : " "}`, left, top, 36, COLOR.cream, 600);
  const lines = [
    ["intent received", COLOR.muted, 1.45],
    ["local router online", COLOR.mint, 1.72],
    ["200 capabilities in scope", COLOR.muted, 1.99],
    ["ranking by fit · reliability · outcome", COLOR.cream, 2.26],
  ];
  lines.forEach(([value, color, at], index) => {
    const progress = easeOut(span(localTime, at, at + 0.24));
    ctx.save();
    ctx.globalAlpha *= progress;
    mono(ctx, index === 0 ? "·" : index === 1 ? "✓" : index === 2 ? "→" : "#", left, top + 96 + index * 62, 26, color, 700);
    mono(ctx, value, left + 40, top + 96 + index * 62, 26, color, 500);
    ctx.restore();
  });
  tracked(ctx, "LOCAL / NO ACCOUNT / NO CLOUD", left, height / 2 - 30, 14, 1.9, COLOR.dim, 600);
  ctx.restore();
};

export const drawInputBar = (ctx, x, y, width, height, progress, typed, buttonProgress, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  const scale = mix(0.92, 1, easeOut(progress));
  ctx.scale(scale, scale);
  ctx.shadowColor = rgba(COLOR.warm, 0.12);
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 18;
  round(ctx, -width / 2, -height / 2, width, height, 30, rgba(COLOR.panel2, 0.96), rgba(COLOR.cream, 0.16), 2);
  ctx.shadowColor = "transparent";
  mono(ctx, ">", -width / 2 + 34, -8, 24, COLOR.warm, 700);
  mono(ctx, typed, -width / 2 + 72, -8, 26, COLOR.cream, 520);
  tracked(ctx, "LOCAL ROUTE", -width / 2 + 72, 31, 12, 1.4, COLOR.muted, 600);
  const buttonX = width / 2 - 78;
  ctx.save();
  ctx.globalAlpha *= easeOut(buttonProgress);
  ctx.shadowColor = rgba(COLOR.warm, 0.32);
  ctx.shadowBlur = 26;
  round(ctx, buttonX - 32, -28, 64, 56, 18, COLOR.warm);
  ctx.shadowColor = "transparent";
  mono(ctx, "↗", buttonX, -13, 26, COLOR.ink, 700, "center");
  ctx.restore();
  ctx.restore();
};

export const drawRoutePath = (ctx, points, progress, color, alpha = 1, width = 18, pulseAt = 0) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => {
    ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.075)";
  ctx.lineWidth = width + 14;
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.24);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.92);
  ctx.lineWidth = Math.max(3, width * 0.22);
  ctx.setLineDash([18, 28]);
  ctx.lineDashOffset = -progress * 520;
  ctx.stroke();
  ctx.setLineDash([]);
  if (pulseAt > 0) {
    const segment = clamp(pulseAt);
    const last = points[points.length - 1];
    const first = points[0];
    const px = mix(first[0], last[0], segment);
    const py = mix(first[1], last[1], segment);
    ctx.shadowColor = rgba(color, 0.36);
    ctx.shadowBlur = 24;
    ctx.fillStyle = COLOR.cream;
    ctx.beginPath();
    ctx.arc(px, py, width * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawGate = (ctx, x, y, size, progress, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  const scale = mix(0.82, 1, easeOut(progress));
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = rgba(COLOR.warm, 0.18);
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  round(ctx, -size / 2, -size / 2, size, size, 42, COLOR.panel, rgba(COLOR.cream, 0.2), 2);
  ctx.shadowColor = "transparent";
  round(ctx, -size / 2 + 20, -size / 2 + 20, size - 40, size - 40, 30, "rgba(255,255,255,0.025)", rgba(COLOR.cream, 0.11), 1);
  drawLogo(ctx, 0, -8, size * 0.45, 1, 0.1);
  tracked(ctx, "ROSTER / ROUTE", 0, size * 0.28, 12, 1.8, COLOR.muted, 600, "center");
  ctx.restore();
};

export const drawCandidate = (ctx, candidate, x, y, width, height, alpha, selected = false, progress = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  const lift = (1 - easeOut(progress)) * 24;
  ctx.translate(x, y + lift);
  ctx.shadowColor = selected ? rgba(candidate.color, 0.24) : "rgba(0,0,0,0.3)";
  ctx.shadowBlur = selected ? 34 : 24;
  ctx.shadowOffsetY = 12;
  round(ctx, -width / 2, -height / 2, width, height, 24, selected ? rgba(candidate.color, 0.16) : COLOR.panel2, selected ? rgba(candidate.color, 0.72) : rgba(COLOR.cream, 0.14), selected ? 3 : 2);
  ctx.shadowColor = "transparent";
  drawBrand(ctx, candidate.id, -width / 2 + 42, -10, 44, 1, candidate.color);
  text(ctx, candidate.label, -width / 2 + 86, -43, 34, COLOR.cream, 760);
  mono(ctx, candidate.detail, -width / 2 + 86, 16, 19, COLOR.muted, 500);
  tracked(ctx, `FIT ${candidate.fit}`, width / 2 - 30, 25, 13, 1.2, selected ? candidate.color : COLOR.dim, 700, "right");
  if (selected) {
    ctx.fillStyle = candidate.color;
    ctx.beginPath();
    ctx.arc(width / 2 - 27, -height / 2 + 26, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawOutcome = (ctx, x, y, progress, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha) * easeOut(progress);
  ctx.translate(x, y + (1 - easeOut(progress)) * 22);
  ctx.shadowColor = rgba(COLOR.mint, 0.14);
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  round(ctx, -228, -62, 456, 124, 28, COLOR.cream, rgba(COLOR.cream, 0.5), 2);
  ctx.shadowColor = "transparent";
  tracked(ctx, "ROUTE RESOLVED", -190, -34, 13, 1.5, COLOR.dim, 700);
  text(ctx, "Playwright selected", -190, -3, 24, COLOR.ink, 760);
  mono(ctx, "verify checkout flow  ·  passed", -190, 34, 15, "#5B7568", 600);
  ctx.fillStyle = COLOR.mint;
  ctx.fillRect(184, -36, 4, 74);
  ctx.restore();
};

export const drawOrbitMark = (ctx, id, x, y, size, rotation, alpha, color) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.shadowColor = rgba(color, 0.18);
  ctx.shadowBlur = 18;
  drawBrand(ctx, id, 0, 0, size, 0.96, color);
  ctx.restore();
};

export const drawCursor = (ctx, x, y, progress, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(alpha) * easeOut(progress);
  ctx.translate(x, y);
  ctx.fillStyle = COLOR.cream;
  ctx.strokeStyle = COLOR.black;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-8, -30);
  ctx.lineTo(18, 16);
  ctx.lineTo(1, 12);
  ctx.lineTo(-8, 28);
  ctx.lineTo(-18, 20);
  ctx.lineTo(-7, 5);
  ctx.lineTo(-24, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};
