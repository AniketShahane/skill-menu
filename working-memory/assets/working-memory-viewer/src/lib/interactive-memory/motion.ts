export const MOTION = {
  ease: { standard: [0.22, 1, 0.36, 1] as const, out: "easeOut" as const },
  spring: { pop: { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const },
  duration: { micro: 0.14, card: 0.18, modal: 0.2, burst: 0.28, ring: 0.45 },
} as const;
