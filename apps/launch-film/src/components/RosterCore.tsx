import { RosterPrism, type PrismState } from "./RosterPrism";

type RosterCoreProps = {
  readonly size?: number;
  readonly active?: boolean;
  readonly label?: string;
  readonly progress?: number;
  readonly warning?: boolean;
  readonly state?: PrismState;
};

export const RosterCore = ({ size, label, progress, warning, state, active = true }: RosterCoreProps) => (
  <RosterPrism
    size={size}
    label={label}
    progress={progress}
    state={warning ? "failure" : state ?? (active ? "routing" : "idle")}
    showLabel={Boolean(label)}
  />
);
