import type { Attribute, ClassId, Stats } from '../types';
import { CLASS_DEFINITIONS } from '../content/classes';
import { randomInt } from './random';

export const ATTRIBUTES: Attribute[] = ['for', 'dex', 'int', 'vit'];
export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  for: 'FOR', dex: 'DES', int: 'INT', vit: 'VIT',
};

export function weightedAttribute(weights: Record<Attribute, number>, candidates: Attribute[]): Attribute {
  const total = candidates.reduce((sum, attribute) => sum + weights[attribute], 0);
  let roll = (randomInt(1, 1_000_000) / 1_000_000) * total;
  for (const attribute of candidates) {
    roll -= weights[attribute];
    if (roll < 0) return attribute;
  }
  return candidates[candidates.length - 1];
}

export function initialStats(classId: ClassId): Stats {
  return { ...CLASS_DEFINITIONS[classId].startingStats };
}

/** A progressão não impõe teto geral aos atributos. */
export function statCap(_level: number, _classId: ClassId, _attribute: Attribute): number {
  return Number.POSITIVE_INFINITY;
}

export function availablePointCapacity(_stats: Stats, _level: number, _classId: ClassId): number {
  return Number.POSITIVE_INFINITY;
}

export function distributeWeightedPoints(
  startingStats: Stats,
  points: number,
  _level: number,
  _classId: ClassId,
  weights: Record<Attribute, number> = CLASS_DEFINITIONS[_classId].weights,
): Stats {
  const stats = { ...startingStats };
  for (let point = 0; point < points; point += 1) {
    const attribute = weightedAttribute(weights, ATTRIBUTES);
    stats[attribute] += 1;
  }
  return stats;
}

export function allocatePoint(stats: Stats, _level: number, _classId: ClassId, attribute: Attribute): Stats {
  return { ...stats, [attribute]: stats[attribute] + 1 };
}
