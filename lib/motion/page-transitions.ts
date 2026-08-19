export const PAGE_TRANSITION_VARIANTS = [
  "fade",
  "wipe",
  "wipeup",
  "push",
  "cover",
  "zoom",
  "fan",
  "roll",
  "flip",
  "dissolve",
  "split",
  "bounce",
] as const;

export type PageTransitionVariant = (typeof PAGE_TRANSITION_VARIANTS)[number];

export function pageTransitionVariant(seed: string): PageTransitionVariant {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }
  return PAGE_TRANSITION_VARIANTS[hash % PAGE_TRANSITION_VARIANTS.length];
}

export function pageTransitionClass(seed: string): string {
  return `ppt-in ppt-${pageTransitionVariant(seed)}`;
}
