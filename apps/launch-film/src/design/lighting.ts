export const LIGHTING = {
  background: [
    "radial-gradient(circle at 16% 14%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 34%)",
    "radial-gradient(circle at 77% 20%, rgba(91,203,255,0.14) 0%, rgba(91,203,255,0) 31%)",
    "radial-gradient(circle at 62% 76%, rgba(138,99,255,0.10) 0%, rgba(138,99,255,0) 34%)",
    "linear-gradient(135deg, #F9F8F5 0%, #F2F4F8 52%, #F7F4F8 100%)",
  ].join(","),
  horizon: "linear-gradient(90deg, transparent, rgba(79,124,255,0.18), rgba(138,99,255,0.14), transparent)",
  focusWash: "radial-gradient(circle, rgba(79,124,255,0.18), rgba(91,203,255,0.07) 42%, transparent 72%)",
  failureWash: "radial-gradient(circle, rgba(247,101,104,0.16), transparent 70%)",
} as const;
