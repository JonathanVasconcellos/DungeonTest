import { DERIVED_FORMULAS, RULES } from './config';
import type { ClassId, Entity } from '../types';
import { skillRank } from '../content/specializations';

export type DamageType = 'physical' | 'magical';
export interface DamageRange { min: number; max: number; type: DamageType }

/** Ataque básico de cada classe; os multiplicadores ficam centralizados em RULES. */
export function basicAttackRange(entity: Entity, classId: ClassId): DamageRange {
  const physical = DERIVED_FORMULAS.physicalDamage(entity.stats, entity.level);
  if (classId === 'rogue') {
    const effectiveStats = {
      ...entity.stats,
      for: entity.stats.for + Math.ceil(entity.stats.dex / 2) * RULES.rogueDexterityDamageMultiplier,
    };
    const roguePhysical = DERIVED_FORMULAS.physicalDamage(effectiveStats, entity.level);
    return { ...roguePhysical, type: 'physical' };
  }
  return { ...physical, type: 'physical' };
}

export function defenseValue(entity: Entity, type: DamageType): number {
  return type === 'magical' || type === 'physical'
    ? DERIVED_FORMULAS.damageResistancePercent({
      ...entity.stats,
      vit: effectiveVitality(entity),
    }) : 0;
}

export function criticalChance(entity: Entity): number {
  const base = DERIVED_FORMULAS.criticalPercent(entity.stats);
  if (entity.specialization !== 'assassin') return base;
  const bonus = skillRank(entity.level) >= 3 ? 15 : skillRank(entity.level) >= 2 ? 10 : 5;
  return Math.min(RULES.maxCriticalPercent, base + bonus);
}

/** Applies branch damage passives after the integer damage roll. */
export function modifyAttackDamage(entity: Entity, damage: number, type: DamageType): number {
  const rank = skillRank(entity.level);
  if (type === 'physical' && entity.specialization === 'berserker' && entity.hp < entity.maxHp * 0.5) {
    const bonus = rank >= 3 ? 0.3 : rank >= 2 ? 0.22 : 0.15;
    return Math.floor(damage * (1 + bonus));
  }
  if (type === 'magical' && entity.specialization === 'sorcerer') {
    const bonus = rank >= 3 ? 0.2 : rank >= 2 ? 0.15 : 0.1;
    return Math.floor(damage * (1 + bonus));
  }
  return Math.floor(damage);
}

export function alchemistPoisonChance(entity: Entity): number {
  const rank = skillRank(entity.level);
  return entity.specialization === 'alchemist' ? (rank >= 3 ? 25 : rank >= 2 ? 20 : 15) : 0;
}

export function alchemistPoisonDamage(damage: number, entity: Entity): number {
  const rank = skillRank(entity.level);
  return Math.max(1, Math.floor(damage * (rank >= 3 ? 0.35 : rank >= 2 ? 0.3 : 0.25)));
}

/** Guerreiro ganha resistência adicional abaixo de metade da vida, inclusive inimigos. */
export function effectiveVitality(entity: Entity): number {
  return entity.stats.vit + (entity.specialization === 'knight' && entity.hp < entity.maxHp * 0.5 ? entity.stats.for : 0);
}

/** Redução efetiva exibida no log e usada no cálculo do dano. */
export function effectiveResistancePercent(resistancePercent: number): number {
  return Math.max(0, Math.min(100, resistancePercent));
}

/** Aplica primeiro a resistência de VIT e depois cada efeito de redução pela metade. */
export function applyDefense(damage: number, resistancePercent: number, defending = false, magicShield: boolean | number = false): number {
  const passiveResistance = effectiveResistancePercent(resistancePercent);
  if (passiveResistance >= 100) return 0;
  let finalDamage = Math.max(1, Math.floor(damage * (1 - passiveResistance / 100)));
  const shieldReduction = typeof magicShield === 'number' ? magicShield : magicShield ? 0.5 : 0;
  if (shieldReduction > 0) finalDamage = Math.max(1, Math.floor(finalDamage * (1 - Math.min(1, shieldReduction))));
  if (defending) finalDamage = Math.max(1, Math.floor(finalDamage / 2));
  return finalDamage;
}

/** Regenera apenas após acerto básico; crítico não altera a recuperação. */
export function regenerateManaOnBasicAttackHit(entity: Entity, _critical = false): number {
  const amount = entity.classId === 'mage' ? 0.5 : 0.25;
  const restored = Math.min(amount, Math.max(0, entity.maxMp - entity.mp));
  entity.mp += restored;
  return restored;
}

export function formatMana(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
