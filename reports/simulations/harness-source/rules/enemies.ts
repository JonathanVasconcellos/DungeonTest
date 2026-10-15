import { DERIVED_FORMULAS, RULES } from './config';
import { ATTRIBUTES, distributeWeightedPoints, initialStats } from './attributes';
import type { Attribute, ClassId, Entity, Rarity, Stats } from '../types';
import { CLASS_DEFINITIONS } from '../content/classes';
import { SPECIALIZATIONS_BY_CLASS, specializationSkill } from '../content/specializations';
import { BOSS_NAME, ENEMY_SPECIES } from '../content/enemies';
import { randomChance, randomInt } from './random';

const pick = <T,>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

/** Mana máxima inimiga segue a fórmula padrão, sem ajuste por raridade. */
export function enemyMaxMp(stats: Stats, level: number): number {
  return DERIVED_FORMULAS.maxMp(stats, level);
}

function rollRarity(): Rarity {
  const roll = randomInt(1, 100);
  if (roll <= RULES.enemyRarityChance.elite * 100) return 'elite';
  if (roll <= (RULES.enemyRarityChance.elite + RULES.enemyRarityChance.uncommon) * 100) return 'uncommon';
  return 'normal';
}

export function generateEnemy(playerLevel: number, forceElite = false): Entity {
  const rarity = forceElite ? 'elite' : rollRarity();
  const classId: ClassId = pick(['warrior', 'rogue', 'mage']);
  const level = playerLevel + (rarity === 'normal' ? 0 : 1);
  const weights = CLASS_DEFINITIONS[classId].weights;
  const varied = Object.fromEntries(ATTRIBUTES.map((attribute) => [
    attribute, Math.max(0.001, weights[attribute] * (1 + randomInt(-100, 100) / 100 * RULES.enemyWeightVariation)),
  ])) as Record<Attribute, number>;
  let stats: Stats = initialStats(classId);
  for (let reachedLevel = 2; reachedLevel <= level; reachedLevel += 1) {
    const requestedPoints = RULES.pointsAtLevel(reachedLevel);
    stats = distributeWeightedPoints(stats, requestedPoints, reachedLevel, classId, varied);
  }

  const mutated = randomChance(RULES.mutationChance * 100);
  if (mutated) {
    const key = CLASS_DEFINITIONS[classId].primary;
    stats[key] += Math.max(1, Math.round(stats[key] * RULES.mutationBonus)); // Após distribuir; pode ultrapassar teto.
  }
  const maxHp = DERIVED_FORMULAS.maxHp(stats, level);
  const maxMp = enemyMaxMp(stats, level);
  const species = forceElite ? BOSS_NAME : pick(ENEMY_SPECIES);
  const specialization = level >= RULES.specializationUnlockLevel
    ? pick(SPECIALIZATIONS_BY_CLASS[classId]) : undefined;
  const classSkill = level >= RULES.classSkillUnlockLevel ? specializationSkill(specialization) : undefined;
  return {
    name: `${mutated ? 'Mutante ' : ''}${species}`, level, rarity, classId, stats, classSkill, specialization,
    hp: maxHp, maxHp, mp: maxMp, maxMp, mutated,
  };
}
