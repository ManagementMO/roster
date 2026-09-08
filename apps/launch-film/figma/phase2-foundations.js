// Figma Plugin API source for the editable launch-film system documentation.
const RUN = "roster-redesign-phase2-2026-07-22";

const systemPage = figma.root.children[0];
systemPage.name = "00 · SYSTEM";
let currentPage = figma.root.children.find((page) => page.name === "01 · CURRENT");
if (!currentPage) {
  currentPage = figma.createPage();
  currentPage.name = "01 · CURRENT";
}
let redesignPage = figma.root.children.find((page) => page.name === "02 · REDESIGN");
if (!redesignPage) {
  redesignPage = figma.createPage();
  redesignPage.name = "02 · REDESIGN";
}
await figma.setCurrentPageAsync(systemPage);

await Promise.all([
  figma.loadFontAsync({family: "Space Grotesk", style: "Bold"}),
  figma.loadFontAsync({family: "Space Grotesk", style: "Medium"}),
  figma.loadFontAsync({family: "Manrope", style: "Regular"}),
  figma.loadFontAsync({family: "JetBrains Mono", style: "Medium"}),
]);

for (const page of [systemPage, currentPage, redesignPage]) {
  for (const child of [...page.children]) child.remove();
}

const variables = await figma.variables.getLocalVariablesAsync();
const variableByName = new Map(variables.map((value) => [value.name, value]));
const getVariable = (name) => {
  const value = variableByName.get(name);
  if (!value) throw new Error(`Missing variable: ${name}`);
  return value;
};
const bound = (name) => figma.variables.setBoundVariableForPaint(
  {type: "SOLID", color: {r: 0.5, g: 0.5, b: 0.5}},
  "color",
  getVariable(name),
);
const rgba = (hex, alpha = 1) => {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
    a: alpha,
  };
};
const addText = ({parent, text, size, family = "Manrope", style = "Regular", color = "color/text/primary", x, y, width, align = "LEFT"}) => {
  const node = figma.createText();
  node.fontName = {family, style};
  node.characters = text;
  node.fontSize = size;
  node.fills = [bound(color)];
  node.textAlignHorizontal = align;
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  if (width) {
    node.resize(width, node.height);
    node.textAutoResize = "HEIGHT";
  }
  return node;
};
const glassEffects = [
  {type: "BACKGROUND_BLUR", radius: 28, visible: true},
  {type: "DROP_SHADOW", color: rgba("#17191E", 0.12), offset: {x: 0, y: 24}, radius: 48, spread: -12, visible: true, blendMode: "NORMAL"},
  {type: "INNER_SHADOW", color: rgba("#FFFFFF", 0.88), offset: {x: 0, y: 2}, radius: 1, spread: 0, visible: true, blendMode: "NORMAL"},
];
const addStage = ({page, name, width, height, x = 0, y = 0}) => {
  const stage = figma.createFrame();
  stage.name = name;
  stage.resize(width, height);
  stage.x = x;
  stage.y = y;
  stage.fills = [bound("color/background/luminous")];
  stage.clipsContent = false;
  stage.setSharedPluginData("roster", "run", RUN);
  page.appendChild(stage);
  return stage;
};
const addPrism = ({parent, centerX, centerY, size, name}) => {
  const shell = figma.createFrame();
  shell.name = name;
  shell.resize(size, size);
  shell.x = centerX - size / 2;
  shell.y = centerY - size / 2;
  shell.fills = [];
  shell.clipsContent = false;
  parent.appendChild(shell);
  const accents = ["#4F7CFF", "#8A63FF", "#5BCBFF", "#34C98D", "#FFFFFF"];
  for (let index = 0; index < 5; index++) {
    const aperture = figma.createRectangle();
    aperture.name = `Aperture ${index + 1}`;
    aperture.resize(size * 0.18, size * 0.52);
    aperture.cornerRadius = size * 0.09;
    aperture.x = size * 0.41;
    aperture.y = size * 0.24;
    aperture.rotation = index * 72;
    aperture.fills = [{
      type: "GRADIENT_LINEAR",
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
      gradientStops: [
        {position: 0, color: rgba(accents[index], 0.20)},
        {position: 0.48, color: rgba("#FFFFFF", 0.84)},
        {position: 1, color: rgba(accents[(index + 1) % 5], 0.30)},
      ],
    }];
    aperture.strokes = [{type: "SOLID", color: rgba("#FFFFFF", 0.88)}];
    aperture.strokeWeight = Math.max(2, size * 0.006);
    aperture.effects = [
      {type: "DROP_SHADOW", color: rgba(accents[index], 0.25), offset: {x: 0, y: 12}, radius: 32, spread: -8, visible: true, blendMode: "NORMAL"},
      {type: "BACKGROUND_BLUR", radius: 18, visible: true},
    ];
    shell.appendChild(aperture);
  }
  const optic = figma.createEllipse();
  optic.name = "Optical Core";
  optic.resize(size * 0.22, size * 0.22);
  optic.x = size * 0.39;
  optic.y = size * 0.39;
  optic.fills = [{
    type: "GRADIENT_RADIAL",
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
    gradientStops: [
      {position: 0, color: rgba("#FFFFFF")},
      {position: 0.55, color: rgba("#E8F0FF", 0.96)},
      {position: 1, color: rgba("#4F7CFF", 0.30)},
    ],
  }];
  optic.effects = [{type: "DROP_SHADOW", color: rgba("#4F7CFF", 0.30), offset: {x: 0, y: 12}, radius: 40, spread: 2, visible: true, blendMode: "NORMAL"}];
  shell.appendChild(optic);
  return shell;
};

const cover = addStage({page: systemPage, name: "Cover / Roster Launch Film", width: 1440, height: 900});
const wash = figma.createEllipse();
wash.name = "Spectrum Wash";
wash.resize(760, 760);
wash.x = 760;
wash.y = -220;
wash.fills = [{
  type: "GRADIENT_RADIAL",
  gradientTransform: [[1, 0, 0], [0, 1, 0]],
  gradientStops: [
    {position: 0, color: rgba("#8A63FF", 0.18)},
    {position: 0.42, color: rgba("#5BCBFF", 0.10)},
    {position: 1, color: rgba("#FFFFFF", 0)},
  ],
}];
wash.effects = [{type: "LAYER_BLUR", radius: 44, visible: true}];
cover.appendChild(wash);
const coverPrism = addPrism({parent: cover, centerX: 1070, centerY: 438, size: 390, name: "Roster Prism / Cover"});
addText({parent: cover, text: "ROSTER", size: 22, family: "Space Grotesk", style: "Medium", x: 96, y: 92, width: 400});
const coverTitle = addText({parent: cover, text: "Launch film,\nrecomposed.", size: 88, family: "Space Grotesk", style: "Bold", x: 96, y: 248, width: 690});
coverTitle.letterSpacing = {value: -3, unit: "PIXELS"};
addText({parent: cover, text: "Warm-white cinematic glass. One clear signal.\nFive capabilities brought forward with intent.", size: 24, color: "color/text/secondary", x: 104, y: 520, width: 600});
addText({parent: cover, text: "VISUAL REDESIGN · V1 · 22 JUL 2026", size: 14, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 104, y: 742, width: 520});

const foundations = addStage({page: systemPage, name: "Foundations / Luminous Glass", width: 1680, height: 3380, y: 1120});
addText({parent: foundations, text: "FOUNDATIONS", size: 24, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 96, y: 72, width: 600});
addText({parent: foundations, text: "Luminous glass,\nnot interface chrome.", size: 72, family: "Space Grotesk", style: "Bold", x: 96, y: 126, width: 1120});
addText({parent: foundations, text: "Warm mineral white creates space. Graphite type carries authority. Spectrum color appears only when Roster is resolving, routing or learning.", size: 24, color: "color/text/secondary", x: 100, y: 324, width: 1180});
addText({parent: foundations, text: "Colour", size: 38, family: "Space Grotesk", style: "Medium", x: 96, y: 500, width: 600});
const palette = [
  "color/background/luminous", "color/background/canvas", "color/surface/glass", "color/surface/glass-strong",
  "color/text/primary", "color/text/secondary", "color/focus/primary", "color/focus/secondary",
  "color/focus/flare", "color/signal/success", "color/signal/failure", "color/signal/warning",
];
for (let index = 0; index < palette.length; index++) {
  const name = palette[index];
  const swatch = figma.createFrame();
  swatch.name = `Swatch / ${name}`;
  swatch.resize(216, 160);
  swatch.x = 96 + (index % 6) * 244;
  swatch.y = 570 + Math.floor(index / 6) * 194;
  swatch.cornerRadius = 22;
  swatch.fills = [bound(name)];
  swatch.strokes = [bound("color/border/glass")];
  swatch.strokeWeight = 2;
  foundations.appendChild(swatch);
  const dark = ["color/text/primary", "color/focus/primary", "color/focus/secondary"].includes(name);
  addText({parent: swatch, text: name.replace("color/", ""), size: 13, family: "JetBrains Mono", style: "Medium", color: dark ? "color/background/luminous" : "color/text/secondary", x: 18, y: 118, width: 180});
}
addText({parent: foundations, text: "Typography", size: 38, family: "Space Grotesk", style: "Medium", x: 96, y: 1010, width: 600});
const typePanel = figma.createFrame();
typePanel.name = "Typography / Specimens";
typePanel.resize(1488, 720);
typePanel.x = 96;
typePanel.y = 1080;
typePanel.cornerRadius = 40;
typePanel.fills = [bound("color/surface/glass")];
typePanel.strokes = [bound("color/border/glass")];
typePanel.strokeWeight = 2;
typePanel.effects = glassEffects;
foundations.appendChild(typePanel);
addText({parent: typePanel, text: "200 TOOLS.", size: 112, family: "Space Grotesk", style: "Bold", x: 56, y: 54, width: 1320});
addText({parent: typePanel, text: "Only five get to start.", size: 72, family: "Space Grotesk", style: "Bold", x: 58, y: 210, width: 1200});
addText({parent: typePanel, text: "Repository access", size: 40, family: "Space Grotesk", style: "Medium", x: 60, y: 350, width: 780});
addText({parent: typePanel, text: "The strongest capability for this task.", size: 28, color: "color/text/secondary", x: 60, y: 420, width: 920});
addText({parent: typePanel, text: "node packages/cli/dist/bin.js init", size: 22, family: "JetBrains Mono", style: "Medium", color: "color/focus/primary", x: 60, y: 542, width: 900});
addText({parent: typePanel, text: "Space Grotesk / Manrope / JetBrains Mono", size: 14, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 60, y: 630, width: 880});
addText({parent: foundations, text: "Geometry & material", size: 38, family: "Space Grotesk", style: "Medium", x: 96, y: 1900, width: 700});
for (const [index, radius] of [18, 28, 40, 88].entries()) {
  const card = figma.createFrame();
  card.name = `Radius / ${radius}`;
  card.resize(270, 220);
  card.x = 96 + index * 310;
  card.y = 1980;
  card.cornerRadius = radius;
  card.fills = [bound(index === 3 ? "color/surface/glass-strong" : "color/surface/glass")];
  card.strokes = [bound(index === 3 ? "color/focus/primary" : "color/border/glass")];
  card.strokeWeight = index === 3 ? 3 : 2;
  card.effects = glassEffects;
  foundations.appendChild(card);
  addText({parent: card, text: `${String(radius).padStart(2, "0")} px`, size: 18, family: "JetBrains Mono", style: "Medium", color: "color/text/secondary", x: 24, y: 166, width: 180});
}
const principles = [
  ["01", "One focal plane", "Foreground, midground and atmosphere carry different weights."],
  ["02", "Material follows state", "Glass becomes substantial as a capability earns selection."],
  ["03", "Colour is a verb", "Spectrum searches. Mint confirms. Coral interrupts."],
  ["04", "Type carries hierarchy", "No metadata wallpaper. One reading priority per frame."],
];
for (const [index, item] of principles.entries()) {
  const card = figma.createFrame();
  card.name = `Principle / ${item[1]}`;
  card.resize(720, 210);
  card.x = 96 + (index % 2) * 768;
  card.y = 2290 + Math.floor(index / 2) * 242;
  card.cornerRadius = 28;
  card.fills = [bound("color/surface/glass")];
  card.strokes = [bound("color/border/glass")];
  card.strokeWeight = 2;
  foundations.appendChild(card);
  addText({parent: card, text: item[0], size: 16, family: "JetBrains Mono", style: "Medium", color: "color/focus/primary", x: 30, y: 28, width: 80});
  addText({parent: card, text: item[1], size: 28, family: "Space Grotesk", style: "Medium", x: 30, y: 70, width: 630});
  addText({parent: card, text: item[2], size: 18, color: "color/text/secondary", x: 30, y: 118, width: 640});
}
addText({parent: foundations, text: "Spacing rhythm", size: 38, family: "Space Grotesk", style: "Medium", x: 96, y: 2860, width: 700});
for (const [index, value] of [8, 12, 20, 32, 48, 72, 96].entries()) {
  const y = 2940 + index * 48;
  const bar = figma.createRectangle();
  bar.name = `Spacing / ${value}`;
  bar.resize(value * 7, 20);
  bar.x = 240;
  bar.y = y;
  bar.cornerRadius = 10;
  bar.fills = [bound(index > 4 ? "color/focus/secondary" : "color/focus/primary")];
  foundations.appendChild(bar);
  addText({parent: foundations, text: String(value), size: 14, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 96, y, width: 100});
}

const current = addStage({page: currentPage, name: "CURRENT / Full Film Reference", width: 2160, height: 1720});
addText({parent: current, text: "CURRENT", size: 24, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 120, y: 72, width: 600});
addText({parent: current, text: "Before-state evidence", size: 64, family: "Space Grotesk", style: "Bold", x: 120, y: 120, width: 1100});
addText({parent: current, text: "Entry, midpoint and exit frames for all eleven scenes. Preserved as rendered evidence; redesign work lives as native layers on its own page.", size: 22, color: "color/text/secondary", x: 124, y: 202, width: 1660});
const currentReference = figma.createFrame();
currentReference.name = "CURRENT / 33-frame QA sheet";
currentReference.resize(1920, 1320);
currentReference.x = 120;
currentReference.y = 310;
currentReference.cornerRadius = 24;
currentReference.clipsContent = true;
currentReference.fills = [bound("color/surface/frost")];
currentReference.strokes = [bound("color/border/glass")];
currentReference.strokeWeight = 2;
currentReference.effects = glassEffects;
current.appendChild(currentReference);

const redesignIndex = addStage({page: redesignPage, name: "REDESIGN / Index", width: 1920, height: 1080});
addText({parent: redesignIndex, text: "REDESIGN", size: 24, family: "JetBrains Mono", style: "Medium", color: "color/text/quiet", x: 112, y: 86, width: 600});
addText({parent: redesignIndex, text: "A spatial product film\nwith editorial restraint.", size: 76, family: "Space Grotesk", style: "Bold", x: 112, y: 182, width: 1120});
addText({parent: redesignIndex, text: "Component system ↓", size: 24, color: "color/text/secondary", x: 116, y: 850, width: 520});
const redesignPrism = addPrism({parent: redesignIndex, centerX: 1550, centerY: 460, size: 420, name: "Roster Prism / Redesign Index"});

for (const page of figma.root.children) page.setSharedPluginData("roster", "run", RUN);
return {
  pages: figma.root.children.map((page) => ({id: page.id, name: page.name, childCount: page.children.length})),
  coverId: cover.id,
  foundationsId: foundations.id,
  currentBoardId: current.id,
  currentImageId: currentReference.id,
  redesignIndexId: redesignIndex.id,
  coverPrismId: coverPrism.id,
  redesignPrismId: redesignPrism.id,
};
