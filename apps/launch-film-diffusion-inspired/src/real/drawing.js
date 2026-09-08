import { BRAND_PATHS } from "./brandPaths.js";
import { COLOR, FONT, MONO } from "./design.js";
import { bezierPoint, clamp, ease, mix, span } from "../spectacle/motion.js";

const BRAND_PATH_CACHE = new Map();

// The current Roster mark is the user-supplied local asset. Diffusion Studio
// renders the composition in an Electron document context, so an explicit
// file URL keeps the logo deterministic and offline. The vector mark remains
// the safe fallback for the very first tick while the image decoder warms up.
const ROSTER_LOGO_SOURCE = "file:///Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/brands/roster-logo.png";
const ROSTER_LOGO_IMAGE = typeof Image === "function" ? new Image() : null;
if (ROSTER_LOGO_IMAGE) {
  ROSTER_LOGO_IMAGE.decoding = "sync";
  ROSTER_LOGO_IMAGE.src = ROSTER_LOGO_SOURCE;
}

// Miro's official full-colour square mark is kept as a local raster because
// the Simple Icons fallback is monochrome. The PNG is only used in the final
// orbit; all dynamic text and the rest of the logo system remain vector/CSS.
const MIRO_LOGO_SOURCE = "file:///Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/brands/miro.png";
const MIRO_LOGO_IMAGE = typeof Image === "function" ? new Image() : null;
if (MIRO_LOGO_IMAGE) {
  MIRO_LOGO_IMAGE.decoding = "sync";
  MIRO_LOGO_IMAGE.src = MIRO_LOGO_SOURCE;
}

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

export const strokeRoundRect = (ctx, x, y, width, height, radius, stroke, lineWidth = 2) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

export const drawPaper = (ctx) => {
  const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
  gradient.addColorStop(0, COLOR.white);
  gradient.addColorStop(0.58, COLOR.paper);
  gradient.addColorStop(1, "#ECE6DC");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
};

export const drawInk = (ctx) => {
  const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
  gradient.addColorStop(0, "#161718");
  gradient.addColorStop(0.5, COLOR.graphite);
  gradient.addColorStop(1, "#1D2020");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);
};

export const drawBrandMark = (ctx, key, x, y, size, alpha = 1, colorOverride = null) => {
  if (key === "miro" && MIRO_LOGO_IMAGE?.complete && MIRO_LOGO_IMAGE.naturalWidth) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(MIRO_LOGO_IMAGE, x - size / 2, y - size / 2, size, size);
    ctx.restore();
    return true;
  }
  const data = BRAND_PATHS[key];
  if (!data || typeof Path2D === "undefined") return false;
  const [minX, minY, viewWidth, viewHeight] = data.viewBox;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / viewWidth, size / viewHeight);
  ctx.translate(-minX, -minY);
  const cachedPaths = BRAND_PATH_CACHE.get(key) ?? data.paths.map((pathData) => {
    try {
      return { ...pathData, path: new Path2D(pathData.d) };
    } catch {
      return { ...pathData, path: null };
    }
  });
  BRAND_PATH_CACHE.set(key, cachedPaths);
  cachedPaths.forEach((pathData) => {
    if (!pathData.path) return;
    ctx.fillStyle = pathData.fill === "currentColor" ? colorOverride ?? COLOR.ink : pathData.fill;
    ctx.fill(pathData.path);
  });
  ctx.restore();
  return true;
};

/**
 * Small glass chip used by the final ecosystem orbit. The mark is the signal;
 * the surface only supplies enough contrast for a compressed social render.
 */
export const drawOrbitChip = (ctx, key, x, y, size, rotation = 0, alpha = 1, active = false) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  const width = size * 1.62;
  const height = size * 1.12;
  const radius = size * 0.24;
  ctx.shadowColor = "rgba(21,22,23,0.14)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, radius, rgba(COLOR.white, 0.86));
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -width / 2, -height / 2, width, height, radius, rgba(COLOR.brass, active ? 0.58 : 0.2), active ? 2.5 : 1.5);
  drawBrandMark(ctx, key, 0, 0, size * 0.56, 0.88);
  if (active) {
    ctx.strokeStyle = rgba(COLOR.brass, 0.52);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(width, height) * 0.68, -Math.PI * 0.76, -Math.PI * 0.18);
    ctx.stroke();
  }
  ctx.restore();
};

/** Direct SVG mark treatment for the identity orbit: no card, no badge, no UI chrome. */
export const drawOrbitMark = (ctx, key, x, y, size, rotation = 0, alpha = 1, colorOverride = null, active = false) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  if (active) {
    ctx.strokeStyle = rgba(COLOR.brass, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.62, -Math.PI * 0.72, Math.PI * 0.14);
    ctx.stroke();
  }
  ctx.shadowColor = "rgba(21,22,23,0.16)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  drawBrandMark(ctx, key, 0, 0, size, 0.96, colorOverride);
  ctx.restore();
};

export const drawFolderMark = (ctx, x, y, size, color, alpha = 1) => {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x - size / 2, y - size / 2);
  const radius = size * 0.14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size * 0.12, size * 0.24);
  ctx.lineTo(size * 0.42, size * 0.24);
  ctx.lineTo(size * 0.52, size * 0.36);
  ctx.lineTo(size * 0.84, size * 0.36);
  ctx.quadraticCurveTo(size * 0.9, size * 0.36, size * 0.9, size * 0.45);
  ctx.lineTo(size * 0.84, size * 0.78);
  ctx.quadraticCurveTo(size * 0.82, size * 0.84, size * 0.73, size * 0.84);
  ctx.lineTo(size * 0.16, size * 0.84);
  ctx.quadraticCurveTo(size * 0.08, size * 0.84, size * 0.1, size * 0.74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(COLOR.white, 0.22);
  ctx.beginPath();
  ctx.roundRect(size * 0.16, size * 0.4, size * 0.68, size * 0.12, radius);
  ctx.fill();
  ctx.restore();
};

const drawLogoStroke = (ctx, points, progress) => {
  const amount = clamp(progress);
  if (amount <= 0) return;
  const segments = points.length - 1;
  const scaled = amount * segments;
  const complete = Math.floor(scaled);
  const partial = scaled - complete;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index <= complete; index += 1) ctx.lineTo(points[index][0], points[index][1]);
  if (complete < segments) {
    const from = points[complete];
    const to = points[complete + 1];
    ctx.lineTo(from[0] + (to[0] - from[0]) * partial, from[1] + (to[1] - from[1]) * partial);
  }
  ctx.stroke();
};

const drawSuppliedRosterLogo = (ctx, x, y, size, alpha, progress, logoSurface = false, logoSurfaceScale = 1.3) => {
  if (!ROSTER_LOGO_IMAGE || !ROSTER_LOGO_IMAGE.complete || !ROSTER_LOGO_IMAGE.naturalWidth) return false;
  const amount = clamp(progress);
  if (amount <= 0) return true;
  const reveal = ease.out5(amount);
  const overshoot = 1 + Math.sin(Math.min(1, reveal) * Math.PI) * 0.024;
  // This mark is intentionally used edge-to-edge. Unlike the previous square
  // asset, it has a tall 395:512 aspect ratio and no presentation pedestal to
  // crop. Fit it inside the requested nominal size so every placement keeps
  // the same visual scale without stretching or clipping either pill.
  const sourceX = 0;
  const sourceY = 0;
  const sourceWidth = ROSTER_LOGO_IMAGE.naturalWidth;
  const sourceHeight = ROSTER_LOGO_IMAGE.naturalHeight;
  const maxDimension = size * 1.08;
  const sourceAspect = sourceWidth / sourceHeight;
  const drawWidth = sourceAspect >= 1 ? maxDimension : maxDimension * sourceAspect;
  const drawHeight = sourceAspect >= 1 ? maxDimension / sourceAspect : maxDimension;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha) * ease.out3(span(amount, 0.04, 0.52));
  ctx.translate(x, y);
  ctx.scale(overshoot, overshoot);
  if (logoSurface) {
    const plate = size * logoSurfaceScale;
    const radius = size * 0.2;
    ctx.shadowColor = "rgba(20,24,23,0.2)";
    ctx.shadowBlur = Math.max(12, size * 0.12);
    ctx.shadowOffsetY = Math.max(3, size * 0.04);
    fillRoundRect(ctx, -plate / 2, -plate / 2, plate, plate, radius, COLOR.white);
    ctx.shadowColor = "transparent";
    strokeRoundRect(ctx, -plate / 2, -plate / 2, plate, plate, radius, "rgba(20,24,23,0.16)", Math.max(2, size * 0.012));
  }
  // A restrained neutral shadow keeps the white mark legible on the paper
  // scenes without tinting the user-supplied artwork or turning it into a glow.
  ctx.shadowColor = "rgba(28,31,30,0.18)";
  ctx.shadowBlur = Math.max(5, size * 0.045);
  ctx.shadowOffsetY = Math.max(1, size * 0.012);
  // The source artwork is white; the active film uses a black mark so it stays
  // crisp on the paper identity scenes. Alpha remains untouched.
  ctx.filter = "brightness(0)";
  ctx.drawImage(
    ROSTER_LOGO_IMAGE,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  ctx.restore();
  return true;
};

/**
 * Roster's film mark. The supplied local PNG is the active source; the compact
 * vector construction below remains a deterministic first-tick fallback if the
 * browser has not finished decoding the local image yet.
 */
export const drawRosterLogo = (ctx, x, y, size, color = COLOR.roster, alpha = 1, progress = 1, tile = false, logoSurface = false, logoSurfaceScale = 1.3) => {
  const amount = clamp(progress);
  if (amount <= 0) return;
  if (drawSuppliedRosterLogo(ctx, x, y, size, alpha, amount, logoSurface, logoSurfaceScale)) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.shadowColor = rgba(color, 0.1);
  ctx.shadowBlur = size * 0.06;
  const unit = size / 100;
  if (tile) {
    const surface = ctx.createLinearGradient(-size * 0.48, -size * 0.48, size * 0.48, size * 0.48);
    surface.addColorStop(0, COLOR.white);
    surface.addColorStop(0.72, COLOR.paper);
    surface.addColorStop(1, COLOR.glassLight);
    fillRoundRect(ctx, -size * 0.48, -size * 0.48, size * 0.96, size * 0.96, size * 0.22, surface);
    strokeRoundRect(ctx, -size * 0.48, -size * 0.48, size * 0.96, size * 0.96, size * 0.22, rgba(color, 0.4), Math.max(2, unit * 1.4));
  }
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, unit * 10);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const rShape = [
    [-28 * unit, 31 * unit],
    [-28 * unit, -28 * unit],
    [4 * unit, -28 * unit],
    [23 * unit, -28 * unit],
    [23 * unit, -4 * unit],
    [4 * unit, -4 * unit],
    [-28 * unit, -4 * unit],
  ];
  drawLogoStroke(ctx, rShape, ease.out5(amount * 1.12));
  drawLogoStroke(ctx, [[-28 * unit, 31 * unit], [-28 * unit, -28 * unit]], ease.out5(amount * 1.12));
  drawLogoStroke(ctx, [[4 * unit, -4 * unit], [31 * unit, 31 * unit]], ease.out5(amount * 1.18 - 0.1));

  const slots = [-27, -13, 1, 15, 29];
  const slotProgress = ease.out3(span(amount, 0.32, 1));
  ctx.fillStyle = color;
  slots.forEach((offset, index) => {
    const local = clamp(slotProgress * 1.28 - index * 0.11);
    const slotSize = 3.5 * unit;
    const slotY = 40 * unit - index * 2.4 * unit;
    ctx.save();
    ctx.globalAlpha *= local;
    ctx.beginPath();
    ctx.arc(offset * unit, slotY, slotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.globalAlpha *= ease.out3(span(amount, 0.52, 0.92));
  ctx.strokeStyle = rgba(color, 0.36);
  ctx.lineWidth = Math.max(2, unit * 1.6);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.46, -Math.PI * 0.94, -Math.PI * 0.94 + Math.PI * 1.34 * ease.out3(span(amount, 0.5, 1)));
  ctx.stroke();
  ctx.restore();
};

export const drawRosterMark = (ctx, x, y, size, color = COLOR.roster, alpha = 1, progress = 1) => {
  drawRosterLogo(ctx, x, y, size, color, alpha, progress, false);
};

export const drawTransitionSweep = (ctx, progress, tone = COLOR.paper, accent = COLOR.blue) => {
  const amount = clamp(progress);
  if (amount <= 0 || amount >= 1.02) return;
  const center = mix(2140, -260, amount);
  const width = 390;
  ctx.save();
  ctx.globalAlpha *= Math.sin(Math.min(1, amount) * Math.PI) * 0.96;
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.moveTo(center - width, -100);
  ctx.lineTo(center + width * 0.28, -100);
  ctx.lineTo(center + width + 200, 1180);
  ctx.lineTo(center - width * 0.55, 1180);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha *= 0.8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(center + 72, -80);
  ctx.lineTo(center + width + 205, 1135);
  ctx.stroke();
  ctx.restore();
};

export const drawFitLens = (ctx, x, y, width, height, progress, color = COLOR.blue, alpha = 1) => {
  const amount = clamp(progress);
  if (amount <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  const surface = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  surface.addColorStop(0, rgba(color, 0.02));
  surface.addColorStop(0.48, rgba(color, 0.17));
  surface.addColorStop(0.52, rgba(COLOR.white, 0.16));
  surface.addColorStop(1, rgba(color, 0.02));
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, 38, surface);
  strokeRoundRect(ctx, -width / 2, -height / 2, width, height, 38, rgba(color, 0.5), 3);
  ctx.fillStyle = color;
  fillRoundRect(ctx, width * 0.28, -height / 2 - 34, 8, height + 68, 4, color);
  ctx.globalAlpha *= 0.7;
  fillRoundRect(ctx, width * 0.28 - 16, -height / 2 - 34, 40, height + 68, 20, rgba(color, 0.14));
  ctx.globalAlpha *= 0.9;
  trackedText(ctx, "FIT", -width / 2 + 28, -height / 2 + 22, 16, 1.6, COLOR.white, 800);
  ctx.restore();
};

export const drawRibbon = (ctx, start, control1, control2, end, color, width, progress = 1, alpha = 1, style = "route") => {
  const amount = clamp(progress);
  if (amount <= 0) return;
  const safeColor = typeof color === "string" && color.startsWith("#") ? color : COLOR.brass;
  const lightSurface = style === "light";
  const accent = style === "identity" || style === "route" ? safeColor : lightSurface ? COLOR.graphite : COLOR.glass;
  const steps = Math.max(4, Math.ceil(80 * amount));
  const drawPath = () => {
    ctx.beginPath();
    for (let index = 0; index <= steps; index += 1) {
      const point = bezierPoint(start, control1, control2, end, (index / 80) * amount);
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  };
  const gradient = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  gradient.addColorStop(0, style === "identity" || style === "route" ? rgba(accent, 0.58) : lightSurface ? rgba(COLOR.glassDim, 0.62) : rgba(COLOR.glassLight, 0.58));
  gradient.addColorStop(0.46, style === "identity" || style === "route" ? rgba(accent, 0.76) : lightSurface ? rgba(COLOR.graphite, 0.86) : rgba(COLOR.glass, 0.84));
  gradient.addColorStop(1, style === "identity" || style === "route" ? rgba(accent, 0.48) : lightSurface ? rgba(COLOR.graphite, 0.68) : rgba(COLOR.glassLight, 0.48));
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Route paths are graphic connectors, not neon tubes. The route branch is
  // deliberately just a flat saturated body plus a quiet graphite keyline;
  // the old white inner stroke is what created the light-saber appearance.
  if (style === "route") {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(11,13,14,0.58)";
    ctx.lineWidth = width + 5;
    drawPath();
    ctx.strokeStyle = rgba(accent, 0.96);
    ctx.lineWidth = width;
    drawPath();
  } else {
    ctx.shadowColor = "rgba(21,22,23,0.18)";
    ctx.shadowBlur = Math.max(4, width * 0.45);
    ctx.shadowOffsetY = Math.max(1, width * 0.14);
    ctx.strokeStyle = style === "identity" ? rgba(accent, 0.16) : lightSurface ? "rgba(21,22,23,0.12)" : rgba(COLOR.glassLight, 0.12);
    ctx.lineWidth = width * 2.1 + 7;
    drawPath();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = style === "identity" ? rgba(COLOR.white, 0.3) : lightSurface ? rgba(COLOR.white, 0.3) : rgba(COLOR.glassLight, 0.22);
    ctx.lineWidth = width * 1.34 + 3;
    drawPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    drawPath();
    ctx.strokeStyle = lightSurface ? "rgba(255,253,248,0.34)" : rgba(COLOR.white, 0.28);
    ctx.lineWidth = Math.max(1.5, width * 0.11);
    drawPath();
  }
  if (style === "route" && amount > 0.16) {
    // Keep the marker just before the receiving card so it reads clearly in
    // the frame instead of disappearing underneath the card shell.
    const arrowProgress = Math.max(0.16, amount * 0.82);
    const tip = bezierPoint(start, control1, control2, end, arrowProgress);
    const before = bezierPoint(start, control1, control2, end, Math.max(0, arrowProgress - 0.035));
    const angle = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
    const arrowSize = Math.max(11, width * 2.05);
    ctx.save();
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(11,13,14,0.74)";
    ctx.beginPath();
    ctx.moveTo(arrowSize + 3, 0);
    ctx.lineTo(-arrowSize * 0.56, arrowSize * 0.48);
    ctx.lineTo(-arrowSize * 0.56, -arrowSize * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(accent, 0.92);
    ctx.beginPath();
    ctx.moveTo(arrowSize, 0);
    ctx.lineTo(-arrowSize * 0.52, arrowSize * 0.44);
    ctx.lineTo(-arrowSize * 0.52, -arrowSize * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
};

/**
 * A material traversal for hero routing scenes. Unlike the utility ribbon,
 * this reads as a recessed glass tube: shadow, frosted edge, dark channel,
 * and a small animated signal reflection. `phase` keeps a completed route
 * alive with a slow, editorial sheen instead of leaving a dead marker stroke.
 */
export const drawTraversal = (ctx, start, control1, control2, end, progress = 1, signal = COLOR.glass, width = 12, alpha = 1, phase = 0) => {
  const amount = clamp(progress);
  if (amount <= 0) return;
  const steps = 84;
  const pointAt = (value) => bezierPoint(start, control1, control2, end, clamp(value));
  const drawRange = (from, to) => {
    const startValue = clamp(from);
    const endValue = clamp(to);
    if (endValue <= startValue) return;
    const count = Math.max(3, Math.ceil((endValue - startValue) * steps));
    ctx.beginPath();
    for (let index = 0; index <= count; index += 1) {
      const value = startValue + ((endValue - startValue) * index) / count;
      const point = pointAt(value);
      if (index === 0) ctx.moveTo(point[0], point[1]);
      else ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  };

  const bodyGradient = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  bodyGradient.addColorStop(0, rgba(COLOR.glassDim, 0.46));
  bodyGradient.addColorStop(0.44, rgba(COLOR.glass, 0.76));
  bodyGradient.addColorStop(0.72, rgba(COLOR.glassLight, 0.72));
  bodyGradient.addColorStop(1, rgba(COLOR.glassDim, 0.42));

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(21,22,23,0.16)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.strokeStyle = "rgba(21,22,23,0.16)";
  ctx.lineWidth = width + 15;
  drawRange(0, amount);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,253,248,0.42)";
  ctx.lineWidth = width + 7;
  drawRange(0, amount);
  ctx.strokeStyle = bodyGradient;
  ctx.lineWidth = width;
  drawRange(0, amount);
  ctx.strokeStyle = "rgba(21,22,23,0.42)";
  ctx.lineWidth = Math.max(3, width * 0.34);
  drawRange(0, amount);
  ctx.strokeStyle = "rgba(255,255,255,0.62)";
  ctx.lineWidth = Math.max(1.5, width * 0.11);
  drawRange(0, amount);

  const glintCenter = amount < 0.98
    ? Math.max(0.02, amount - 0.06)
    : 0.5 + Math.sin(phase * 0.9) * 0.34;
  const glintHalfWidth = amount < 0.98 ? 0.11 : 0.08;
  ctx.shadowColor = rgba(signal, 0.28);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = rgba(signal, 0.68);
  ctx.lineWidth = Math.max(2.4, width * 0.24);
  drawRange(glintCenter - glintHalfWidth, Math.min(amount, glintCenter + glintHalfWidth));
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = rgba(COLOR.white, 0.76);
  ctx.lineWidth = Math.max(1.2, width * 0.09);
  drawRange(glintCenter - glintHalfWidth * 0.72, Math.min(amount, glintCenter + glintHalfWidth * 0.72));
  ctx.restore();
};

export const drawPacket = (ctx, start, control1, control2, end, progress, color, size = 16, alpha = 1, style = "route") => {
  const point = bezierPoint(start, control1, control2, end, clamp(progress));
  const next = bezierPoint(start, control1, control2, end, clamp(progress + 0.015));
  const safeColor = typeof color === "string" && color.startsWith("#") ? color : COLOR.brass;
  const accent = style === "identity" ? safeColor : style === "light" ? COLOR.graphite : COLOR.glass;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(point[0], point[1]);
  ctx.rotate(Math.atan2(next[1] - point[1], next[0] - point[0]));
  ctx.shadowColor = "rgba(21,22,23,0.16)";
  ctx.shadowBlur = 8;
  fillRoundRect(ctx, -size * 1.55, -size * 0.52, size * 3.1, size * 1.04, size * 0.52, rgba(accent, style === "identity" ? 0.94 : 0.88));
  ctx.shadowColor = "transparent";
  fillRoundRect(ctx, -size * 0.72, -size * 0.18, size * 1.44, size * 0.36, size * 0.18, COLOR.white);
  strokeRoundRect(ctx, -size * 1.55, -size * 0.52, size * 3.1, size * 1.04, size * 0.52, rgba(COLOR.white, style === "light" ? 0.34 : 0.28), 1.4);
  ctx.restore();
};

export const drawImpact = (ctx, x, y, color, progress, size = 82, alpha = 0.28) => {
  const amount = clamp(progress);
  if (amount <= 0 || amount >= 1) return;
  const radius = size * (0.28 + amount * 0.72);
  ctx.save();
  ctx.globalAlpha *= (1 - amount) * alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.035 * (1 - amount));
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha *= 0.7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(3, size * 0.08 * (1 - ease.out3(amount))), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawTypedLine = (ctx, value, x, y, size, color, weight, family, rawProgress) => {
  const shown = Math.min(value.length, Math.floor(Math.max(0, rawProgress)));
  if (shown <= 0) return { visible: "", cursorX: x, complete: false };
  const visible = value.slice(0, shown);
  const last = visible.slice(-1);
  const prefix = visible.slice(0, -1);
  setFont(ctx, size, weight, family);
  const prefixWidth = ctx.measureText(prefix).width;
  const lastWidth = ctx.measureText(last).width;
  text(ctx, prefix, x, y, size, color, weight, "left", family);
  const characterAge = shown < value.length ? rawProgress - shown : 1;
  const settle = ease.out3(clamp(characterAge / 0.78));
  const pop = shown < value.length ? (1 - settle) * 0.14 : 0;
  ctx.save();
  ctx.globalAlpha *= 0.86 + settle * 0.14;
  ctx.translate(x + prefixWidth + lastWidth / 2, y + size * 0.48);
  ctx.scale(1 + pop, 1 + pop);
  text(ctx, last, -lastWidth / 2, -size * 0.48, size, color, weight, "left", family);
  ctx.restore();
  return { visible, cursorX: x + prefixWidth + lastWidth, complete: shown >= value.length };
};

export const drawTerminalWindow = (ctx, x, y, width, height, scale, skew, time, reveal = 1) => {
  ctx.save();
  ctx.globalAlpha *= reveal;
  ctx.translate(x, y);
  ctx.transform(1, skew, 0, 1, 0, 0);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 56;
  ctx.shadowOffsetY = 30;
  fillRoundRect(ctx, 0, 0, width, height, 28, "#151819");
  ctx.shadowColor = "transparent";
  fillRoundRect(ctx, 0, 0, width, 72, 28, "#252A29");
  ctx.fillStyle = "#252A29";
  ctx.fillRect(0, 36, width, 36);
  ["#F16A63", "#E5B454", "#5ABB77"].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(34 + index * 30, 36, 8, 0, Math.PI * 2);
    ctx.fill();
  });
  drawBrandMark(ctx, "claude", width - 46, 36, 28, 1, COLOR.claude);
  trackedText(ctx, "claude  ·  roster", 110, 25, 18, 0.5, COLOR.glassLight, 650);
  ctx.fillStyle = "#2A302F";
  ctx.fillRect(30, 98, 4, height - 130);
  ctx.fillStyle = COLOR.glassTrack;
  ctx.fillRect(30, 98, 4, (height - 130) * 0.44);

  const lines = [
    { text: "$ npx roster init", color: "#F7F8FA", at: 0.08, speed: 25 },
    { text: "✓ local router ready", color: "#83C59B", at: 0.58, speed: 42 },
    { text: "→ 200 capabilities discovered", color: COLOR.glass, at: 0.82, speed: 42 },
    { text: "$ roster sync --five", color: "#F7F8FA", at: 1.16, speed: 26 },
    { text: "✓ one endpoint · five starters", color: "#83C59B", at: 1.48, speed: 48 },
  ];
  lines.forEach((line, index) => {
    const local = Math.max(0, time - line.at);
    const typed = drawTypedLine(ctx, line.text, 70, 130 + index * 60, 26, line.color, 560, MONO, local * line.speed);
    if (!typed.complete && typed.visible && Math.floor(time * 4) % 2 === 0) {
      const cursorX = typed.cursorX + 2;
      ctx.fillStyle = COLOR.glassLight;
      ctx.fillRect(cursorX, 133 + index * 60, 12, 27);
    }
  });
  const shellLine = time > 2.08 ? "draft(need)  →  call(tool, args)" : "";
  text(ctx, shellLine, 70, 480, 21, COLOR.glassDim, 520, "left", MONO);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(70, height - 54, width - 140, 1);
  trackedText(ctx, "LOCAL  /  NO ACCOUNT  /  NO CLOUD", 70, height - 40, 14, 1.2, COLOR.glassDim, 600);
  ctx.restore();
};

export const drawToolObject = (ctx, tool, x, y, width, height, scale, rotation, progress, detail = 1, dark = false, hero = false, tintStrength = null) => {
  const amount = clamp(progress);
  ctx.save();
  ctx.globalAlpha *= amount;
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.scale(scale, scale);
  ctx.shadowColor = dark ? "rgba(0,0,0,0.34)" : "rgba(22,35,52,0.16)";
  ctx.shadowBlur = hero ? 44 : 26;
  ctx.shadowOffsetY = hero ? 24 : 14;
  const shell = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
  shell.addColorStop(0, dark ? "#303636" : COLOR.white);
  shell.addColorStop(0.74, dark ? "#191D1D" : "#F9FBFD");
  // Preserve each tool's hue, but keep the terminal/shortlist surfaces from
  // turning into a hard reflective gradient. The focus rail passes a smaller
  // value when it wants the tint to read as a quiet material cue.
  shell.addColorStop(1, rgba(tool.color, tintStrength ?? (dark ? 0.22 : 0.12)));
  fillRoundRect(ctx, -width / 2, -height / 2, width, height, hero ? 34 : 26, shell);
  ctx.shadowColor = "transparent";
  strokeRoundRect(ctx, -width / 2 + 1, -height / 2 + 1, width - 2, height - 2, hero ? 34 : 26, dark ? rgba(tool.color, 0.72) : "rgba(255,255,255,0.94)", 2);
  ctx.fillStyle = rgba(tool.color, dark ? 0.12 : 0.08);
  ctx.fillRect(-width / 2, height / 2 - 8, width, 8);
  const logoSize = hero ? 82 : 56;
  const logoX = -width / 2 + (hero ? 66 : 48);
  const logoY = -height / 2 + (hero ? 62 : 46);
  const markColor = dark ? COLOR.white : tool.color;
  let rendered = false;
  if (tool.id === "filesystem") {
    drawFolderMark(ctx, logoX, logoY, logoSize, tool.color, detail);
    rendered = true;
  } else {
    rendered = drawBrandMark(ctx, tool.id, logoX, logoY, logoSize, detail, markColor);
  }
  if (!rendered) drawFolderMark(ctx, logoX, logoY, logoSize, tool.color, detail);
  if (detail > 0) {
    const labelX = -width / 2 + (hero ? 126 : 94);
    const labelY = -height / 2 + (hero ? 39 : 29);
    const labelMaxWidth = width - (hero ? 150 : 112);
    const baseLabelSize = hero ? 34 : 25;
    setFont(ctx, baseLabelSize, 780);
    const measuredLabelWidth = ctx.measureText(tool.name).width;
    const labelSize = measuredLabelWidth > labelMaxWidth
      ? Math.max(hero ? 26 : 20, baseLabelSize * labelMaxWidth / measuredLabelWidth)
      : baseLabelSize;
    text(ctx, tool.name, labelX, labelY, labelSize, dark ? COLOR.white : COLOR.ink, 780);
    if (hero) text(ctx, tool.capability, -width / 2 + 34, height / 2 - 48, 20, dark ? COLOR.glass : COLOR.slate, 600);
    else text(ctx, tool.capability, -width / 2 + 28, height / 2 - 36, 16, dark ? COLOR.glass : COLOR.slate, 600);
  }
  ctx.restore();
};

export const drawAgentBadge = (ctx, x, y, scale = 1, progress = 1) => {
  ctx.save();
  ctx.globalAlpha *= clamp(progress);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  fillRoundRect(ctx, -128, -58, 256, 116, 28, COLOR.white);
  strokeRoundRect(ctx, -128, -58, 256, 116, 28, COLOR.line, 2);
  drawBrandMark(ctx, "claude", -76, 0, 46, 1, COLOR.claude);
  text(ctx, "Claude Code", -42, -28, 24, COLOR.ink, 760);
  text(ctx, "agent", -42, 8, 18, COLOR.slate, 600);
  ctx.restore();
};

export const drawCursor = (ctx, x, y, progress, color = COLOR.blue) => {
  const amount = clamp(progress);
  ctx.save();
  ctx.globalAlpha *= amount;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 26, y + 42);
  ctx.lineTo(x + 10, y + 38);
  ctx.lineTo(x + 2, y + 55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};
