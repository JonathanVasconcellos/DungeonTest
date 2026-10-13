import { CLASS_SKILLS, type ClassSkillId } from '../content/classSkills';
import { skillRank } from '../content/specializations';
import { DERIVED_FORMULAS, RULES } from '../rules/config';
import { alchemistPoisonDamage, applyDefense, basicAttackRange, criticalChance, defenseValue, effectiveVitality, modifyAttackDamage } from '../rules/combat';
import { randomChance, randomDamage } from '../rules/random';
import type { Entity, PoisonStatus } from '../types';
import type { CombatOutcome, CombatVisualCue } from './CombatSystem';

export interface ClassSkillResult { target: Entity; outcome: CombatOutcome; messages: string[]; visual?: CombatVisualCue }

export function classSkillIsSupport(skillId: ClassSkillId): boolean {
  return ['restore-health', 'aegis'].includes(CLASS_SKILLS[skillId].effect ?? '');
}

export function canUseClassSkillSupport(caster: Entity, skillId: ClassSkillId): boolean {
  const skill = CLASS_SKILLS[skillId];
  if (skill.effect === 'restore-health') return caster.healingOverTime === undefined
    && (caster.hp < caster.maxHp || (skill.clearsBurning === true && caster.burning !== undefined));
  if (skill.effect === 'aegis') return !caster.magicShield;
  return false;
}

export function resolveClassSkillSupport(caster: Entity, skillId: ClassSkillId): string[] {
  const skill = CLASS_SKILLS[skillId];
  const rank = Math.max(1, skillRank(caster.level));
  if (skill.effect === 'restore-health') {
    const fraction = rank >= 3 ? 0.15 : rank >= 2 ? 0.12 : skill.healFractionPerTurn ?? 0.1;
    const duration = rank >= 3 ? 4 : skill.healDurationTurns ?? 3;
    const amount = Math.max(1, Math.floor(caster.maxHp * fraction));
    caster.healingOverTime = { turnsRemaining: duration, amountPerTick: amount };
    const removedBurn = skill.clearsBurning === true && caster.burning !== undefined;
    if (removedBurn) delete caster.burning;
    return [`${skill.name}: regenerará ${Math.round(fraction * 100)}% da vida máxima (${amount} HP) no início de cada turno, por ${duration} turnos${removedBurn ? '; queimadura removida' : ''}.`];
  }
  if (skill.effect === 'aegis') {
    const reduction = rank >= 3 ? 0.7 : rank >= 2 ? 0.6 : 0.5;
    caster.magicShield = true;
    caster.magicShieldReduction = reduction;
    return [`Postura do Baluarte: reduz em ${Math.round(reduction * 100)}% o próximo dano recebido.`];
  }
  return [];
}

export function tickHealingOverTime(entity: Entity): string | null {
  const status = entity.healingOverTime;
  if (!status) return null;
  const before = entity.hp;
  entity.hp = Math.min(entity.maxHp, entity.hp + status.amountPerTick);
  status.turnsRemaining -= 1;
  const healed = entity.hp - before;
  const remains = status.turnsRemaining > 0;
  if (!remains) delete entity.healingOverTime;
  return `Regeneração Arcana: HP ${before}→${entity.hp} (+${healed}); ${remains ? `restam ${status.turnsRemaining} turno(s)` : 'efeito encerrado'}.`;
}

export function applyAlchemistPoison(attacker: Entity, target: Entity, damage: number): string | null {
  const chance = attacker.specialization === 'alchemist'
    ? skillRank(attacker.level) >= 3 ? 25 : skillRank(attacker.level) >= 2 ? 20 : 15 : 0;
  if (!chance || target.hp <= 0 || !randomChance(chance)) return null;
  const rank = skillRank(attacker.level);
  const status: PoisonStatus = { turnsRemaining: rank >= 3 ? 3 : 2, damagePerTick: alchemistPoisonDamage(damage, attacker) };
  target.poisoned = status;
  return `Veneno aplicado: ${status.damagePerTick} dano no início dos próximos ${status.turnsRemaining} turnos.`;
}

export function tickPoison(entity: Entity): string | null {
  const poison = entity.poisoned;
  if (!poison) return null;
  const damage = Math.max(1, Math.floor(poison.damagePerTick));
  entity.hp = Math.max(0, entity.hp - damage);
  poison.turnsRemaining -= 1;
  const remains = poison.turnsRemaining > 0 && entity.hp > 0;
  if (!remains) delete entity.poisoned;
  return `Veneno: ${damage} dano${remains ? `; restam ${poison.turnsRemaining} turno(s)` : '; efeito encerrado'}.`;
}

export function resolveClassSkillAttack(
  attacker: Entity, target: Entity, skillId: ClassSkillId, defending = false,
  targetSide: 'player' | 'enemy' = 'enemy',
): ClassSkillResult {
  const skill = CLASS_SKILLS[skillId];
  if (skill.effect === 'poison') {
    const range = basicAttackRange(attacker, 'rogue');
    const evasion = DERIVED_FORMULAS.evasionPercent(target.stats);
    if (randomChance(evasion)) return { target, outcome: 'continue',
      messages: [`${skill.name}: ataque esquivado (${evasion}%).`],
      visual: { kind: 'dodge', target: targetSide, attackType: skill.attackType } };
    const base = randomDamage(range.min, range.max);
    const raw = modifyAttackDamage(attacker, Math.floor(base * skill.multiplier), 'physical');
    const critical = randomChance(criticalChance(attacker));
    const criticalDamage = Math.floor(raw * (critical ? RULES.criticalMultiplier : 1));
    const defense = defenseValue(target, 'physical');
    const shielded = target.magicShield ? target.magicShieldReduction ?? 0.5 : false;
    const damage = applyDefense(criticalDamage, defense, defending, shielded);
    target.hp = Math.max(0, target.hp - damage);
    if (shielded) { delete target.magicShield; delete target.magicShieldReduction; }
    const rank = skillRank(attacker.level);
    const poison: PoisonStatus = { turnsRemaining: rank >= 3 ? 3 : 2,
      damagePerTick: Math.max(1, Math.floor(damage * (rank >= 3 ? 0.35 : rank >= 2 ? 0.3 : 0.25))) };
    target.poisoned = target.hp > 0 ? poison : undefined;
    const detail = `${skill.name}: ${base} × ${skill.multiplier} = ${raw}; ${damage} dano após resistência; ${target.poisoned ? `veneno ${poison.damagePerTick} por ${poison.turnsRemaining} turnos` : 'alvo derrotado'}.`;
    return { target, outcome: target.hp <= 0 ? 'enemy-defeated' : 'continue', messages: [detail],
      visual: { kind: 'hit', target: targetSide, amount: damage, critical, attackType: skill.attackType } };
  }
  const rank = Math.max(1, skillRank(attacker.level));
  if (skill.effect === 'aegis' || skill.effect === 'restore-health') {
    return { target, outcome: 'continue', messages: ['Esta habilidade é de suporte.'] };
  }
  const type = skill.classId === 'mage' ? 'magical' : 'physical';
  const range = type === 'magical' ? DERIVED_FORMULAS.magicDamage(attacker.stats, attacker.level)
    : basicAttackRange(attacker, skill.classId);
  const rankMultiplier = rank >= 3 ? 1.3 : rank >= 2 ? 1.15 : 1;
  const hits = skill.hitCount ?? 1;
  let total = 0; let hitsLanded = 0; let evadedHits = 0; let anyCritical = false;
  const hitDetails: Array<{ amount: number; critical: boolean }> = [];
  const messages: string[] = [];
  for (let index = 0; index < hits && target.hp > 0; index += 1) {
    const evasion = DERIVED_FORMULAS.evasionPercent(target.stats);
    if (!skill.guaranteedHit && randomChance(evasion)) {
      evadedHits += 1; messages.push(`${skill.name}: golpe ${index + 1} esquivado (${evasion}%).`); continue;
    }
    const base = skill.usesMaximumDamage ? range.max : randomDamage(range.min, range.max);
    const rawDamage = modifyAttackDamage(attacker, Math.floor(base * skill.multiplier * rankMultiplier), type);
    const criticalPct = skill.canCritical === false ? 0 : criticalChance(attacker);
    const critical = criticalPct > 0 && randomChance(criticalPct);
    anyCritical ||= critical;
    const criticalDamage = Math.floor(rawDamage * (critical ? RULES.criticalMultiplier : 1));
    const defense = defenseValue(target, type);
    const shielded = target.magicShield ? target.magicShieldReduction ?? 0.5 : false;
    const damage = applyDefense(criticalDamage, defense, defending, shielded);
    if (shielded) { delete target.magicShield; delete target.magicShieldReduction; }
    target.hp = Math.max(0, target.hp - damage);
    total += damage; hitsLanded += 1; hitDetails.push({ amount: damage, critical });
    messages.push(`${skill.name}, golpe ${index + 1}: base ${base} × ${skill.multiplier * rankMultiplier} = ${rawDamage}; crítico ${critical ? 'sim' : 'não'} (${criticalPct}%); resistência ${defense.toFixed(1)}% (VIT efetiva ${effectiveVitality(target)}); dano final ${damage}.`);
  }
  const visual: CombatVisualCue = hitsLanded > 0
    ? { kind: 'hit', target: targetSide, amount: total, critical: anyCritical, attackType: skill.attackType, evadedHits, hitDetails }
    : { kind: 'dodge', target: targetSide, attackType: skill.attackType };
  messages.push(`${skill.name}: custo ${skill.manaCost} MP; ${hitsLanded}/${hits} golpes acertaram, ${total} dano total.`);
  return { target, outcome: target.hp <= 0 ? 'enemy-defeated' : 'continue', messages, visual };
}
