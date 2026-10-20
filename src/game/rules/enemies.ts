import { DERIVED_FORMULAS, RULES } from './config';
import { ATTRIBUTES, distributeWeightedPoints, initialStats } from './attributes';
import type { Attribute, ClassId, Entity, Rarity, Stats } from '../types';
import { CLASS_DEFINITIONS } from '../content/classes';
import { SPECIALIZATIONS_BY_CLASS, specializationSkill } from '../content/specializations';
import {
  DOOM2_ELITE_WEIGHT_PER_1000, ELITE_ENEMY_SPECIES, NORMAL_ENEMY_SPECIES,
  SEWER_BOSS, UNCOMMON_ENEMY_SPECIES,
} from '../content/enemies';
import { randomChance, randomInt } from './random';

const pick = <T,>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

function pickSpecies(rarity: Rarity) {
  if (rarity === 'normal') return pick(NORMAL_ENEMY_SPECIES);
  if (rarity === 'uncommon') return pick(UNCOMMON_ENEMY_SPECIES);

  // Use 1000 slots so the Doom 2 easter egg is exactly 1% within the elite pool.
  const eliteRoll = randomInt(1, 1000);
  if (eliteRoll <= DOOM2_ELITE_WEIGHT_PER_1000) {
    return ELITE_ENEMY_SPECIES.find((species) => species.id === 'doom2')!;
  }
  return pick(ELITE_ENEMY_SPECIES.filter((species) => species.id !== 'doom2'));
}

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
  const species = forceElite ? SEWER_BOSS : pickSpecies(rarity);
  // Normal archetypes retain the previous random class roll. New rarity pools
  // use the class assigned to each species. The sewer boss keeps its old roll.
  const classId: ClassId = forceElite || rarity === 'normal'
    ? pick(['warrior', 'rogue', 'mage'])
    : species.classId!;
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

  // Mutations currently apply only to normal enemies; the sewer boss stays as-is.
  const mutated = !forceElite && rarity === 'normal' && randomChance(RULES.mutationChance * 100);
  if (mutated) {
    const key = CLASS_DEFINITIONS[classId].primary;
    stats[key] += Math.max(1, Math.round(stats[key] * RULES.mutationBonus)); // Após distribuir; pode ultrapassar teto.
  }
  const maxHp = DERIVED_FORMULAS.maxHp(stats, level);
  const maxMp = enemyMaxMp(stats, level);
  const specialization = level >= RULES.specializationUnlockLevel
    ? pick(SPECIALIZATIONS_BY_CLASS[classId]) : undefined;
  const classSkill = level >= RULES.classSkillUnlockLevel ? specializationSkill(specialization) : undefined;
  return {
    name: `${mutated ? 'Mutante ' : ''}${species.name}`, level, rarity, classId,
    speciesId: species.id, stats, classSkill, specialization,
    hp: maxHp, maxHp, mp: maxMp, maxMp, mutated,
  };
}
