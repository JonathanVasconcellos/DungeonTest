import { DERIVED_FORMULAS, RULES } from './config';
import type { Entity } from '../types';
import { randomChance, randomDamage } from './random';
import { applyDefense, criticalChance, defenseValue, modifyAttackDamage } from './combat';

export interface FireArrowResult {
  target: Entity;
  dodged: boolean;
  critical: boolean;
  damage: number;
  burnApplied: boolean;
  baseDamage: number;
  rawDamage: number;
  defense: number;
  evasionChance: number;
  criticalChance: number;
}

export interface BurnTickResult {
  target: Entity;
  damage: number;
  continued: boolean;
  ended: boolean;
}

export function castFireArrow(caster: Entity, target: Entity, defending = false): FireArrowResult {
  const evasionChance = DERIVED_FORMULAS.evasionPercent(target.stats);
  if (randomChance(evasionChance)) {
    return { target, dodged: true, critical: false, damage: 0, burnApplied: false,
      baseDamage: 0, rawDamage: 0, defense: 0, evasionChance, criticalChance: criticalChance(caster) };
  }

  const range = DERIVED_FORMULAS.magicDamage(caster.stats, caster.level);
  const baseDamage = randomDamage(range.min, range.max);
  const rawDamage = modifyAttackDamage(caster, Math.floor(baseDamage * RULES.fireArrowDamageMultiplier), 'magical');
  const criticalPct = criticalChance(caster);
  const critical = randomChance(criticalPct);
  const criticalDamage = rawDamage * (critical ? RULES.criticalMultiplier : 1);
  const defense = defenseValue(target, 'magical');
  const shielded = target.magicShield === true;
  const damage = applyDefense(criticalDamage, defense, defending,
    shielded ? target.magicShieldReduction ?? 0.5 : false);
  const nextTarget: Entity = { ...target, hp: Math.max(0, target.hp - damage) };
  if (shielded) { delete nextTarget.magicShield; delete nextTarget.magicShieldReduction; }
  const burnApplied = nextTarget.hp > 0 && randomChance(RULES.fireArrowBurnChance * 100);

  if (burnApplied) {
    // Guarda 30% do dano realmente causado; os ticks não aplicam crítico nem VIT de novo.
    nextTarget.burning = {
      turnsRemaining: RULES.burnDurationTurns,
      damagePerTick: Math.max(1, Math.floor(damage * RULES.burnDamageMultiplier)),
    };
  }

  return { target: nextTarget, dodged: false, critical, damage, burnApplied,
    baseDamage, rawDamage, defense, evasionChance, criticalChance: criticalPct };
}

export function tickBurning(target: Entity): BurnTickResult {
  if (!target.burning) return { target, damage: 0, continued: false, ended: true };

  const damage = Math.max(1, Math.floor(target.burning.damagePerTick));
  const hp = Math.max(0, target.hp - damage);
  const nextTarget: Entity = { ...target, hp };
  if (hp <= 0) {
    delete nextTarget.burning;
    return { target: nextTarget, damage, continued: false, ended: true };
  }

  const continued = target.burning.turnsRemaining > 1
    && randomChance(RULES.burnContinueChance * 100);
  if (!continued) {
    delete nextTarget.burning;
    return { target: nextTarget, damage, continued: false, ended: true };
  }

  const turnsRemaining = target.burning.turnsRemaining - 1;
  nextTarget.burning = { ...target.burning, turnsRemaining };
  return { target: nextTarget, damage, continued: true, ended: false };
}
