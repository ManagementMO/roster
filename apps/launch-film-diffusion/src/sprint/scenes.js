import { COLOR, HEIGHT, MONO, STARTERS, WIDTH } from "./design.js";
import { bezierPoint, clamp, ease, mix, span } from "../spectacle/motion.js";
import {
  drawCandidate,
  drawCore,
  drawCountBars,
  drawField,
  drawGlass,
  drawHero,
  drawPacket,
  drawRibbon,
  fillRoundRect,
  rgba,
  text,
  trackedText,
} from "./drawing.js";

const back = (time, start, duration) => ease.backOut(span(time, start, start + duration));

const kineticText = (ctx, value, x, y, size, time, start, color, weight = 820) => {
  const progress = back(time, start, 0.42);
  ctx.save();
  ctx.globalAlpha = clamp(progress);
  ctx.translate((1 - progress) * 120, 0);
  text(ctx, value, x, y, size, color, weight);
  ctx.restore();
};

const clipLeftward = (ctx, progress) => {
  const edge = mix(WIDTH + 180, -180, progress);
  ctx.beginPath();
  ctx.moveTo(edge + 180, -40);
  ctx.lineTo(WIDTH + 40, -40);
  ctx.lineTo(WIDTH + 40, HEIGHT + 40);
  ctx.lineTo(edge - 180, HEIGHT + 40);
  ctx.closePath();
  ctx.clip();
  return edge;
};

const drawSeam = (ctx, progress, color) => {
  const edge = mix(WIDTH + 180, -180, progress);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.shadowColor = rgba(color, 0.24);
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.moveTo(edge + 176, -40);
  ctx.lineTo(edge - 176, HEIGHT + 40);
  ctx.stroke();
  ctx.restore();
};

export function drawImpact(ctx, time) {
  drawField(ctx, false);
  const titleIn = back(time, -0.08, 0.36);
  const numberIn = back(time, -0.04, 0.48);
  const propositionIn = back(time, 0.3, 0.42);
  const travel = ease.in3(span(time, 0.9, 1.3));

  ctx.save();
  ctx.globalAlpha = clamp(titleIn) * (1 - travel);
  ctx.translate(-travel * 920, 0);
  trackedText(ctx, "YOUR AGENT HAS", 112, 106, 22, 2.2, COLOR.blue, 780);
  ctx.save();
  ctx.translate(100, 176);
  ctx.scale(mix(1.24, 1, numberIn), mix(0.7, 1, numberIn));
  text(ctx, "200", 0, 0, 330, COLOR.ink, 900);
  ctx.restore();
  text(ctx, "TOOLS.", 124, 532, 76, COLOR.ink, 840);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp(propositionIn) * (1 - travel);
  ctx.translate(-travel * 1380, 0);
  kineticText(ctx, "ONLY FIVE", 1130, 274, 86, time, 0.28, COLOR.ink);
  kineticText(ctx, "GET TO START.", 1130, 366, 86, time, 0.4, COLOR.ink);
  drawCountBars(ctx, 1140, 590, back(time, 0.5, 0.46));
  ctx.restore();

  const transition = ease.inOut(span(time, 1.08, 1.42));
  if (transition > 0) {
    ctx.save();
    clipLeftward(ctx, transition);
    drawField(ctx, true);
    ctx.globalAlpha = 0.055;
    text(ctx, "200", 1530, 150, 360, COLOR.white, 900, "center");
    ctx.restore();
    drawSeam(ctx, transition, COLOR.blue);
    drawCore(ctx, mix(1370, 960, transition), 540, mix(122, 154, transition), COLOR.blue, 1, 1, true);
    ctx.save();
    ctx.globalAlpha = transition;
    trackedText(ctx, "200 → 1", 960, 680, 16, 2.5, COLOR.white, 760, "center");
    ctx.restore();
  }
}

export function drawCompression(ctx, time) {
  drawField(ctx, true);
  kineticText(ctx, "200 CAPABILITIES.", 92, 78, 62, time, 1.42, COLOR.white);
  kineticText(ctx, "ONE CLEAN ROUTE.", 92, 146, 62, time, 1.52, COLOR.white);

  ctx.save();
  ctx.globalAlpha = 0.04;
  text(ctx, "200", 1540, 154, 420, COLOR.white, 900, "center");
  ctx.restore();

  const coreIn = back(time, 1.38, 0.42);
  drawCore(ctx, 1040, 560, 170, COLOR.blue, clamp(coreIn), 1, true);

  const taskIn = back(time, 1.64, 0.48);
  ctx.save();
  ctx.translate(300 + (1 - taskIn) * 130, 560);
  ctx.scale(taskIn, taskIn);
  drawGlass(ctx, -210, -92, 420, 184, 38, COLOR.blue, true, 1);
  text(ctx, "Trace checkout error", -166, -18, 30, COLOR.white, 760);
  ctx.restore();

  const route = ease.out5(span(time, 1.92, 2.7));
  const routeStart = [950, 560];
  const routeC1 = [760, 450];
  const routeC2 = [560, 670];
  const routeEnd = [510, 560];
  drawRibbon(ctx, routeStart, routeC1, routeC2, routeEnd, "rgba(255,255,255,0.14)", 28, 1, route);
  drawRibbon(ctx, routeStart, routeC1, routeC2, routeEnd, COLOR.blue, 11, route, 1);
  if (route > 0.08) drawPacket(ctx, routeStart, routeC1, routeC2, routeEnd, route, COLOR.blue, 16);

  STARTERS.forEach((tool, index) => {
    const start = [2050, 250 + index * 142];
    const c1 = [1740, 210 + index * 150];
    const c2 = [1370, 450 + (index - 2) * 34];
    const end = [1120, 560];
    const flight = ease.out5(span(time, 1.46 + index * 0.09, 2.32 + index * 0.09));
    const fade = 1 - ease.in3(span(flight, 0.66, 0.94));
    const point = bezierPoint(start, c1, c2, end, flight);
    drawRibbon(ctx, start, c1, c2, end, tool.color, 7, flight, 0.42 * fade);
    if (fade > 0.02) {
      drawCandidate(ctx, tool, point[0], point[1], 276, 116, mix(8, 0, flight), mix(0.98, 0.8, flight), fade, true);
    }
  });

  const lock = back(time, 2.48, 0.38);
  ctx.save();
  ctx.globalAlpha = clamp(lock);
  fillRoundRect(ctx, 884, 760, 312, 64, 32, COLOR.blue);
  trackedText(ctx, "200 → 1 LOCAL ENDPOINT", 1040, 779, 18, 1.3, COLOR.white, 800, "center");
  ctx.restore();
}

const selectionSlots = [
  [240, 666, -5],
  [575, 396, 4],
  [940, 606, -2],
  [1300, 386, 4],
  [1635, 666, -5],
];

export function drawSelection(ctx, time) {
  drawField(ctx, false);
  kineticText(ctx, "FIND THE RIGHT FIVE.", 88, 74, 66, time, 2.96, COLOR.ink);
  text(ctx, "One task. Five resolved capabilities.", 92, 156, 28, COLOR.slate, 600);
  text(ctx, "200 → 05", 1818, 82, 26, COLOR.blue, 820, "right", MONO);

  const scan = ease.out5(span(time, 3.04, 4.62));
  const pathStart = [1810, 666];
  const pathC1 = [1390, 220];
  const pathC2 = [700, 850];
  const pathEnd = [110, 506];
  drawRibbon(ctx, pathStart, pathC1, pathC2, pathEnd, COLOR.line, 28, 1, 0.78);
  drawRibbon(ctx, pathStart, pathC1, pathC2, pathEnd, COLOR.blue, 11, scan, 1);
  drawPacket(ctx, pathStart, pathC1, pathC2, pathEnd, scan, COLOR.blue, 18);

  selectionSlots.forEach(([x, y, rotation], index) => {
    const threshold = (4 - index) / 4;
    const focus = back(scan, threshold - 0.06, 0.22);
    const arrival = back(time, 3.0 + (4 - index) * 0.055, 0.42);
    ctx.save();
    ctx.globalAlpha = mix(0.26, 1, clamp(focus));
    drawCandidate(
      ctx,
      STARTERS[index],
      x + (1 - arrival) * 120,
      y - clamp(focus) * 22,
      index === 2 ? 290 : 260,
      index === 2 ? 136 : 122,
      rotation * (1 - clamp(focus) * 0.7),
      mix(0.92, 1.06, clamp(focus)),
      clamp(arrival),
      false,
    );
    ctx.restore();
    if (focus > 0.02) {
      fillRoundRect(ctx, x - 42, y + (index === 2 ? 96 : 88), 84 * clamp(focus), 8, 4, STARTERS[index].color);
    }
  });

  const resolve = back(time, 4.42, 0.44);
  ctx.save();
  ctx.globalAlpha = clamp(resolve);
  fillRoundRect(ctx, 720, 882, 480, 74, 37, COLOR.green);
  trackedText(ctx, "FIVE SELECTED  /  READY TO START", 960, 904, 18, 1.4, COLOR.white, 800, "center");
  ctx.restore();
}

const lineupSlots = [
  { toolIndex: 0, beat: 3, x: 202, y: 700, width: 246, height: 150, rotation: -6 },
  { toolIndex: 1, beat: 1, x: 545, y: 515, width: 320, height: 194, rotation: -4 },
  { toolIndex: 2, beat: 0, x: 960, y: 424, width: 410, height: 234, rotation: 0 },
  { toolIndex: 3, beat: 2, x: 1375, y: 515, width: 320, height: 194, rotation: 4 },
  { toolIndex: 4, beat: 4, x: 1718, y: 700, width: 246, height: 150, rotation: 6 },
];

export function drawLineup(ctx, time) {
  drawField(ctx, true);
  kineticText(ctx, "THE STARTING FIVE", 88, 72, 68, time, 4.98, COLOR.white);
  ctx.save();
  ctx.globalAlpha = 0.045;
  text(ctx, "FIVE", 960, 610, 330, COLOR.white, 900, "center");
  ctx.restore();

  lineupSlots.forEach((slot) => {
    const connection = ease.out5(span(time, 5.48 + slot.beat * 0.15, 6.1 + slot.beat * 0.15));
    if (connection > 0) {
      const start = [960, 842];
      const end = [slot.x, slot.y + slot.height * 0.32];
      drawRibbon(
        ctx,
        start,
        [mix(start[0], end[0], 0.32), 800],
        [mix(start[0], end[0], 0.72), end[1]],
        end,
        STARTERS[slot.toolIndex].color,
        8,
        connection,
        0.72,
      );
    }
  });

  const order = [2, 1, 3, 0, 4];
  order.forEach((slotIndex) => {
    const slot = lineupSlots[slotIndex];
    const startAt = 4.98 + slot.beat * 0.18;
    const flight = ease.out5(span(time, startAt, startAt + 0.56));
    const settle = back(time, startAt + 0.04, 0.62);
    const start = [2050 + slot.beat * 40, 270 + slot.beat * 128];
    const c1 = [1720, 190 + slot.beat * 110];
    const c2 = [slot.x + 170, slot.y - 130];
    const end = [slot.x, slot.y];
    const point = bezierPoint(start, c1, c2, end, flight);
    const blur = 7 * 4 * flight * (1 - flight);
    const detail = ease.out3(span(time, startAt + 0.22, startAt + 0.58));
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    drawHero(
      ctx,
      STARTERS[slot.toolIndex],
      point[0],
      point[1],
      slot.width,
      slot.height,
      mix(14, slot.rotation, settle),
      mix(0.72, 1, settle),
      clamp(settle),
      detail,
    );
    ctx.restore();
  });

  const coreIn = back(time, 5.92, 0.42);
  ctx.save();
  ctx.globalAlpha = clamp(coreIn);
  drawGlass(ctx, 884, 766, 152, 152, 46, COLOR.blue, true, 1);
  drawCore(ctx, 960, 842, 104, COLOR.blue, clamp(coreIn), 1, true);
  ctx.restore();

  const hold = ease.out3(span(time, 6.62, 6.92));
  ctx.save();
  ctx.globalAlpha = hold;
  trackedText(ctx, "LOCKED FOR THIS TASK", 960, 970, 20, 1.7, COLOR.white, 780, "center");
  ctx.restore();
}

export function drawIdentity(ctx, time) {
  drawField(ctx, false);
  const reveal = ease.out5(span(time, 7.14, 7.92));
  const markIn = back(time, 7.38, 0.54);
  const startPoints = [[120, 1110], [390, 1110], [660, 1110], [930, 1110], [1200, 1110]];
  const colors = [COLOR.blue, COLOR.blueDeep, COLOR.blue, COLOR.amber, COLOR.green];
  startPoints.forEach((start, index) => {
    const end = [1435 + (index - 2) * 13, 352];
    drawRibbon(
      ctx,
      start,
      [start[0] + 220, 770],
      [1250 + index * 24, 610],
      end,
      colors[index],
      16,
      clamp(reveal * 1.14 - index * 0.035),
      0.86,
    );
  });

  ctx.save();
  ctx.translate(1435, 352);
  ctx.scale(markIn, markIn);
  drawGlass(ctx, -108, -108, 216, 216, 62, COLOR.blue, false, 1);
  drawCore(ctx, 0, 0, 126, COLOR.blue, 1, 1, false);
  ctx.restore();

  const copyIn = back(time, 7.66, 0.46);
  ctx.save();
  ctx.globalAlpha = clamp(copyIn);
  ctx.translate((1 - copyIn) * 140, 0);
  text(ctx, "ROSTER", 92, 108, 126, COLOR.ink, 900);
  text(ctx, "YOUR AGENT HAS 200 TOOLS.", 96, 474, 34, COLOR.ink, 820);
  text(ctx, "ONLY FIVE GET TO START.", 96, 516, 34, COLOR.ink, 820);
  drawGlass(ctx, 92, 616, 390, 88, 30, COLOR.blue, false, 1);
  text(ctx, "npx roster init", 128, 642, 24, COLOR.blue, 760, "left", MONO);
  ctx.restore();

}

export function drawFilm(ctx, time) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (time < 1.42) {
    drawImpact(ctx, time);
    return;
  }
  if (time < 2.84) {
    drawCompression(ctx, time);
    return;
  }
  if (time < 3.22) {
    drawCompression(ctx, time);
    const progress = ease.inOut(span(time, 2.84, 3.22));
    ctx.save();
    clipLeftward(ctx, progress);
    drawSelection(ctx, time);
    ctx.restore();
    drawSeam(ctx, progress, COLOR.blue);
    return;
  }
  if (time < 4.86) {
    drawSelection(ctx, time);
    return;
  }
  if (time < 5.28) {
    drawSelection(ctx, time);
    const progress = ease.inOut(span(time, 4.86, 5.28));
    ctx.save();
    clipLeftward(ctx, progress);
    drawLineup(ctx, time);
    ctx.restore();
    drawSeam(ctx, progress, COLOR.blue);
    return;
  }
  if (time < 7.12) {
    drawLineup(ctx, time);
    return;
  }
  if (time < 7.46) {
    drawLineup(ctx, time);
    const progress = ease.inOut(span(time, 7.12, 7.46));
    ctx.save();
    clipLeftward(ctx, progress);
    drawIdentity(ctx, time);
    ctx.restore();
    drawSeam(ctx, progress, COLOR.blue);
    return;
  }
  drawIdentity(ctx, time);
}
