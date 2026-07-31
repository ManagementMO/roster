/**
 * Roster launch film — materials.
 *
 * Every translucent surface in the film is one of four materials. They differ in
 * how much light they hold, not in colour, so a frame with all four still reads
 * as one object family lit by one lamp.
 *
 * `optical` is the only material allowed to use `backdrop-filter`; it is
 * reserved for surfaces with real content behind them (the terminal, the hero
 * cards over the ribbon web, the core). Everything else fakes refraction with
 * layered gradients, which composites an order of magnitude faster over 3,480
 * frames and is visually indistinguishable over a smooth ground.
 */
import type { CSSProperties } from "react";
import { alpha, glass, ink } from "./colors";
import { bevel, dispersion, elevation } from "./lighting";
import { radius } from "./spacing";

export type MaterialName = "optical" | "solidGlass" | "lightGlass" | "vapor";

export interface MaterialOptions {
  /** Corner radius in px. */
  r?: number;
  /** How far the surface floats off the paper; drives the shadow stack. */
  lift?: number;
  /** 0 → invisible, 1 → full material. Used for entrances and recessions. */
  presence?: number;
  /** Spectral edge strength. */
  spectral?: number;
}

/**
 * Build the CSS for a glass surface. Returns the outer style; the bevel is
 * painted by `<GlassEdge>` as an absolutely-positioned sibling so it stays crisp
 * at any size and never scales the border with the box.
 */
export function material(name: MaterialName, opts: MaterialOptions = {}): CSSProperties {
  const r = opts.r ?? radius.card;
  const lift = opts.lift ?? 18;
  const p = opts.presence ?? 1;
  const spectral = opts.spectral ?? 1;

  const shared: CSSProperties = {
    borderRadius: r,
    boxShadow: elevation(lift * p),
    position: "relative",
  };

  switch (name) {
    case "optical":
      return {
        ...shared,
        background: [
          dispersion(0.9 * spectral * p),
          `linear-gradient(157deg, ${alpha("#FFFFFF", 0.9 * p)} 0%, ${alpha("#FFFFFF", 0.58 * p)} 46%, ${alpha("#F2F1F4", 0.7 * p)} 100%)`,
        ].join(", "),
        backdropFilter: `blur(${(26 * p).toFixed(1)}px) saturate(${(1 + 0.5 * p).toFixed(2)})`,
        WebkitBackdropFilter: `blur(${(26 * p).toFixed(1)}px) saturate(${(1 + 0.5 * p).toFixed(2)})`,
      };

    case "solidGlass":
      return {
        ...shared,
        background: [
          dispersion(0.75 * spectral * p),
          `linear-gradient(157deg, ${alpha("#FFFFFF", 0.97 * p)} 0%, ${alpha("#FCFBFA", 0.88 * p)} 42%, ${alpha("#EFEEF1", 0.86 * p)} 100%)`,
        ].join(", "),
      };

    case "lightGlass":
      return {
        ...shared,
        background: [
          dispersion(0.45 * spectral * p),
          `linear-gradient(157deg, ${alpha("#FFFFFF", 0.8 * p)} 0%, ${alpha("#FFFFFF", 0.5 * p)} 52%, ${alpha("#EDECEF", 0.56 * p)} 100%)`,
        ].join(", "),
      };

    case "vapor":
      return {
        borderRadius: r,
        position: "relative",
        background: `linear-gradient(157deg, ${alpha("#FFFFFF", 0.5 * p)} 0%, ${alpha("#F0EFF2", 0.3 * p)} 100%)`,
        boxShadow: `0px ${(4 + lift * 0.2).toFixed(1)}px ${(14 + lift).toFixed(1)}px ${alpha("#262830", 0.06 * p)}`,
      };
  }
}

/**
 * The bevel ring. Painted with a gradient-filled mask so the stroke is a true
 * 1.6px optical edge that is bright toward the key light and dim away from it.
 * Never thinner than 1.6px, which stays visible after the 0.5× preview scale.
 */
export function glassEdge(r: number, presence = 1, width = 1.6): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    borderRadius: r,
    padding: width,
    background: bevel(presence),
    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    maskComposite: "exclude",
    pointerEvents: "none",
  };
}

/**
 * The interior specular sheen: one soft diagonal band across the upper third.
 * This is the single detail that most separates "glass" from "white rectangle".
 */
export function sheen(r: number, presence = 1): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    borderRadius: r,
    background: `linear-gradient(151deg, ${alpha("#FFFFFF", 0.0)} 0%, ${alpha("#FFFFFF", 0.62 * presence)} 15%, ${alpha("#FFFFFF", 0.1 * presence)} 34%, ${alpha("#FFFFFF", 0)} 52%)`,
    pointerEvents: "none",
    mixBlendMode: "screen",
  };
}

/**
 * Wireframe skin — the material a rejected tool becomes before it fragments.
 * Same silhouette, no body: hairline geometry only.
 */
export function wireframe(r: number, presence = 1): CSSProperties {
  return {
    borderRadius: r,
    position: "relative",
    background: alpha("#FFFFFF", 0.1 * presence),
    boxShadow: `inset 0 0 0 2.4px ${alpha("#9AA0AA", 0.95 * presence)}`,
    backdropFilter: "none",
  };
}

/** A hairline rule used for editorial separators. Never below 2px total weight. */
export function hairline(width = 2): CSSProperties {
  return { height: width, background: alpha(ink.hair, 0.55), borderRadius: width };
}

/** Frosted inner well (terminal body, receipt area). */
export function well(r: number): CSSProperties {
  return {
    borderRadius: r,
    background: `linear-gradient(180deg, ${alpha("#FBFAF9", 0.72)} 0%, ${alpha("#F1F0F3", 0.6)} 100%)`,
    boxShadow: `inset 0 1.5px 0 ${glass.edgeLight}, inset 0 -1px 0 ${alpha("#FFFFFF", 0.5)}, inset 0 0 30px ${alpha("#8A8F99", 0.07)}`,
  };
}
