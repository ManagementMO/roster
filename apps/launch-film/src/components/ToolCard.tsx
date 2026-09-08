import type { CSSProperties } from "react";
import type { ToolCardData } from "../data/tools";
import { ToolObject } from "./ToolObject";

type ToolCardProps = {
  readonly tool: ToolCardData;
  readonly width?: number;
  readonly progress?: number;
  readonly emphasis?: number;
  readonly selected?: boolean;
  readonly warning?: boolean;
  readonly compact?: boolean;
  readonly showMetrics?: boolean;
  readonly rank?: number;
  readonly motionFrame?: number;
  readonly style?: CSSProperties;
};

export const ToolCard = ({
  tool,
  width,
  progress,
  emphasis,
  selected,
  warning,
  compact,
  rank,
  motionFrame,
  style,
}: ToolCardProps) => (
  <ToolObject
    tool={tool}
    width={width}
    progress={progress}
    focus={emphasis}
    starterNumber={rank}
    motionFrame={motionFrame}
    style={style}
    variant={warning ? "failed" : selected ? (compact ? "selected" : "hero") : compact ? "candidate" : "candidate"}
  />
);
