/** Mulberry32: compact, explicit and fully deterministic across browsers. */
export class SeededRng {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  next(): number {
    let t = (this.value += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.value >>>= 0;
    return result;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  normal(mean = 0, deviation = 1): number {
    const u = Math.max(this.next(), Number.EPSILON);
    const v = this.next();
    return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  getState(): number {
    return this.value >>> 0;
  }
}

export function weightedIndex(weights: number[], rng: SeededRng): number {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return rng.integer(weights.length);
  let cursor = rng.next() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}
