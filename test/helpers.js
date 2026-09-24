// Deterministic rng (mulberry32) so generation tests are reproducible.
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SETTINGS = Object.freeze({
  count: 5, vHi: 9, vLo: 1, dist: 'linear', harmony: 'random', temp: 'none',
  sat: 55, jit: 30, mute: false, bw: false,
});
