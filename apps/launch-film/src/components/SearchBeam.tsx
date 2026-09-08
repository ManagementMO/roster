import { useCurrentFrame } from "remotion";
import { rangeProgress } from "../motion/timing";
import { SearchLens } from "./SearchLens";

export const SearchBeam = ({ from, to }: { readonly from: number; readonly to: number }) => {
  const frame = useCurrentFrame();
  return <SearchLens progress={rangeProgress(frame, from, to)} />;
};
