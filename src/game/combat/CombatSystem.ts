import { DERIVED_FORMULAS, RULES } from '../rules/config';
import { applyDefense, basicAttackRange, criticalChance, defenseValue, effectiveVitality, formatMana, modifyAttackDamage, regenerateManaOnBasicAttackHit } from '../rules/combat';
import { castFireArrow, tickBurning } from '../rules/magic';
import { randomChance, randomDamage } from '../rules/random';
import type { EnemyIntent, RunState } from '../types';
import { CLASS_SKILLS } from '../content/classSkills';
import { applyAlchemistPoison, canUseClassSkillSupport, classSkillIsSupport, resolveClassSkillAttack, resolveClassSkillSupport, tickHealingOverTime, tickPoison } from './ClassSkillSystem';

export type CombatOutcome = 'continue' | 'enemy-defeated' | 'player-defeated';
export type CombatVisualCue =
  | { kind: 'hit'; target: 'player' | 'enemy'; amount: number; critical?: boolean; attackType: 'physical' | 'magical' | 'heavy' | 'double'; evadedHits?: number; hitDetails?: Array<{ amount: number; critical: boolean }>; interrupted?: boolean }
  | { kind: 'dodge'; target: 'player' | 'enemy'; attackType: 'physical' | 'magical' | 'heavy' | 'double'; interrupted?: boolean }
  | { kind: 'interrupted'; target: 'enemy'; attackType: 'physical' | 'magical'; interrupted: true };

export interface CombatResult {
  outcome: CombatOutcome;
  messages: string[];
  actionConsumed?: boolean;
  visual?: CombatVisualCue;
}

const result = (outcome: CombatOutcome, ...messages: string[]): CombatResult => ({ outcome, messages });

export function chooseEnemyIntent(
  enemy: NonNullable<RunState['enemy']>,
  player: RunState['player'],
): EnemyIntent {
  const classId = enemy.classId ?? 'warrior';
  const abilityManaCost = classId === 'mage' ? RULES.enemyAbilityManaCost[enemy.rarity] : 0;
  const abilityChance = enemyAbilityChance(enemy, player);
  if (!randomChance(abilityChance * 100)) return 'basic-attack';
  if (enemy.classSkill && enemy.level >= RULES.classSkillUnlockLevel
    && enemy.mp >= CLASS_SKILLS[enemy.classSkill].manaCost) {
    if (!classSkillIsSupport(enemy.classSkill) || (canUseClassSkillSupport(enemy, enemy.classSkill)
      && (enemy.hp <= enemy.maxHp * 0.7 || enemy.burning !== undefined))) {
      return `${classId}-class-skill` as EnemyIntent;
    }
  }
  if (classId === 'warrior' && enemy.mp >= RULES.heavyAttackManaCost) return 'heavy-attack';
  if (classId === 'rogue' && enemy.mp >= RULES.doubleAttackManaCost) return 'double-attack';
  if (classId === 'mage' && enemy.mp >= abilityManaCost) return 'fire-arrow';
  return 'basic-attack';
}

export function enemyAbilityChance(enemy: NonNullable<RunState['enemy']>, player: RunState['player']): number {
  const enemyHpRatio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  const playerHpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
  return RULES.enemyAbilityBaseChance
    + (RULES.enemyAbilityMaxChance - RULES.enemyAbilityBaseChance) * (1 - Math.min(enemyHpRatio, playerHpRatio));
}

function intentName(intent: EnemyIntent, skillId?: keyof typeof CLASS_SKILLS): string {
  if (intent === 'heavy-attack') return 'Ataque Pesado';
  if (intent === 'double-attack') return 'Ataque Duplo';
  if (intent === 'fire-arrow') return 'Míssil de Fogo';
  if (intent.endsWith('-class-skill')) return skillId ? CLASS_SKILLS[skillId].name : 'Habilidade de classe';
  return 'Ataque básico';
}

export function resolvePlayerAttack(run: RunState): CombatResult {
  const enemy = run.enemy;
  if (!enemy || !run.playerTurn) return result('continue');

  const range = basicAttackRange(run.player, run.classId);
  const evasionChance = DERIVED_FORMULAS.evasionPercent(enemy.stats);
  const dodged = randomChance(evasionChance);
  if (dodged) return { ...result('continue', `Ataque básico esquivado (chance de esquiva do inimigo: ${evasionChance}%).`), actionConsumed: true,
    visual: { kind: 'dodge', target: 'enemy', attackType: range.type } };

  const rawDamage = modifyAttackDamage(run.player, randomDamage(range.min, range.max), range.type);
  const critical = randomChance(criticalChance(run.player));
  const criticalDamage = rawDamage * (critical ? RULES.criticalMultiplier : 1);
  const defense = defenseValue(enemy, range.type);
  const targetVitality = effectiveVitality(enemy);
  const damage = applyDefense(criticalDamage, defense, false, enemy.magicShield ? enemy.magicShieldReduction ?? 0.5 : false);
  if (enemy.magicShield) { delete enemy.magicShield; delete enemy.magicShieldReduction; }
  enemy.hp = Math.max(0, enemy.hp - damage);
  const poisonNote = applyAlchemistPoison(run.player, enemy, damage);
  const manaRestored = regenerateManaOnBasicAttackHit(run.player, critical);

  const visual: CombatVisualCue = { kind: 'hit', target: 'enemy', amount: damage, critical, attackType: range.type };
  const manaNote = manaRestored ? ` +${formatMana(manaRestored)} MP` : '';
  const details = `Cálculo: faixa ${range.min}–${range.max}, sorteio inteiro ${rawDamage}, dano bruto ${criticalDamage}, crítico ${critical ? 'sim' : 'não'} (chance ${criticalChance(run.player)}%), resistência ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality}), redução aplicada ${Math.max(0, criticalDamage - damage)}, dano final ${damage}.${poisonNote ? ` ${poisonNote}` : ''}`;
  if (enemy.hp <= 0) return { ...result('enemy-defeated', details, `Você derrotou ${enemy.name} com ${damage} de dano${critical ? ' crítico' : ''}.${manaNote}`), actionConsumed: true, visual };
  return { ...result('continue', details, `Você causou ${damage} de dano${critical ? ' crítico' : ''}.${manaNote}`), actionConsumed: true, visual };
}

export function resolvePlayerHeavyAttack(run: RunState): CombatResult {
  const enemy = run.enemy;
  if (!enemy || !run.playerTurn || run.classId !== 'warrior') return result('continue');
  if (run.player.mp < RULES.heavyAttackManaCost) return result('continue', 'Mana insuficiente para Ataque Pesado.');
  run.player.mp -= RULES.heavyAttackManaCost;
  const rawDamage = modifyAttackDamage(run.player, DERIVED_FORMULAS.physicalDamage(run.player.stats, run.player.level).max, 'physical');
  const defense = defenseValue(enemy, 'physical');
  const targetVitality = effectiveVitality(enemy);
  const damage = applyDefense(rawDamage, defense, false, enemy.magicShield ? enemy.magicShieldReduction ?? 0.5 : false);
  if (enemy.magicShield) { delete enemy.magicShield; delete enemy.magicShieldReduction; }
  enemy.hp = Math.max(0, enemy.hp - damage);
  const visual: CombatVisualCue = { kind: 'hit', target: 'enemy', amount: damage, attackType: 'heavy' };
  const message = `Ataque Pesado: custo ${RULES.heavyAttackManaCost} MP; acerto garantido; dano bruto máximo ${rawDamage}; resistência ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality}); redução aplicada ${Math.max(0, rawDamage - damage)}; dano final ${damage}.`;
  return enemy.hp <= 0
    ? { ...result('enemy-defeated', `${message} Você derrotou ${enemy.name}.`), actionConsumed: true, visual }
    : { ...result('continue', message), actionConsumed: true, visual };
}

export function resolvePlayerDoubleAttack(run: RunState): CombatResult {
  const enemy = run.enemy;
  if (!enemy || !run.playerTurn || run.classId !== 'rogue') return result('continue');
  if (run.player.mp < RULES.doubleAttackManaCost) return result('continue', 'Mana insuficiente para Ataque Duplo.');
  run.player.mp -= RULES.doubleAttackManaCost;
  const range = basicAttackRange(run.player, 'rogue');
  let hits = 0;
  let total = 0;
  let evadedHits = 0;
  let criticalHit = false;
  const hitDetails: Array<{ amount: number; critical: boolean }> = [];
  const details: string[] = [];
  for (let strike = 0; strike < 2 && enemy.hp > 0; strike += 1) {
    const evasionChance = DERIVED_FORMULAS.evasionPercent(enemy.stats);
    if (randomChance(evasionChance)) {
      evadedHits += 1;
      details.push(`Golpe ${strike + 1}: esquivado (chance ${evasionChance}%).`);
      continue;
    }
    const rawDamage = modifyAttackDamage(run.player, randomDamage(range.min, range.max), range.type);
    const critical = randomChance(criticalChance(run.player));
    criticalHit ||= critical;
    const defense = defenseValue(enemy, range.type);
    const targetVitality = effectiveVitality(enemy);
    const damage = applyDefense(rawDamage * (critical ? RULES.criticalMultiplier : 1), defense, false, enemy.magicShield ? enemy.magicShieldReduction ?? 0.5 : false);
    if (enemy.magicShield) { delete enemy.magicShield; delete enemy.magicShieldReduction; }
    enemy.hp = Math.max(0, enemy.hp - damage);
    const poisonNote = applyAlchemistPoison(run.player, enemy, damage);
    total += damage;
    hits += 1;
    hitDetails.push({ amount: damage, critical });
    const criticalDamage = rawDamage * (critical ? RULES.criticalMultiplier : 1);
    details.push(`Golpe ${strike + 1}: faixa ${range.min}–${range.max}, sorteio inteiro ${rawDamage}, dano bruto ${criticalDamage}, crítico ${critical ? 'sim' : 'não'} (${criticalChance(run.player)}%), resistência ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality}), redução ${Math.max(0, criticalDamage - damage)}, final ${damage}.${poisonNote ? ` ${poisonNote}` : ''}`);
  }

  const visual: CombatVisualCue = hits > 0
    ? { kind: 'hit', target: 'enemy', amount: total, critical: criticalHit, attackType: 'double', evadedHits, hitDetails }
    : { kind: 'dodge', target: 'enemy', attackType: 'double' };
  const message = `Ataque Duplo: custo ${RULES.doubleAttackManaCost} MP; ${hits}/2 golpes acertaram, ${total} dano total${criticalHit ? ' (crítico)' : ''}.`;
  return enemy.hp <= 0
    ? { ...result('enemy-defeated', ...details, message, `Você derrotou ${enemy.name}.`), actionConsumed: true, visual }
    : { ...result('continue', ...details, message), actionConsumed: true, visual };
}

export function resolvePlayerFireArrow(run: RunState): CombatResult {
  const enemy = run.enemy;
  if (!enemy || !run.playerTurn) return result('continue');
  if (run.classId !== 'mage') return result('continue', 'Você ainda não conhece uma magia.');
  if (run.player.mp < RULES.fireArrowManaCost) return result('continue', 'Mana insuficiente para Míssil de Fogo.');

  run.player.mp -= RULES.fireArrowManaCost;
  const hit = castFireArrow(run.player, enemy);
  run.enemy = hit.target;
  if (hit.dodged) return { ...result('continue', `Míssil de Fogo: custo ${RULES.fireArrowManaCost} MP; esquivado (chance de esquiva ${hit.evasionChance}%).`), actionConsumed: true,
    visual: { kind: 'dodge', target: 'enemy', attackType: 'magical' } };
  const visual: CombatVisualCue = { kind: 'hit', target: 'enemy', amount: hit.damage, critical: hit.critical, attackType: 'magical' };
  const fireCriticalDamage = hit.rawDamage * (hit.critical ? RULES.criticalMultiplier : 1);
  const details = `Míssil de Fogo: custo ${RULES.fireArrowManaCost} MP. Cálculo mágico: base inteira ${hit.baseDamage} × ${RULES.fireArrowDamageMultiplier} = bruto ${hit.rawDamage}; crítico ${hit.critical ? 'sim' : 'não'} (${hit.criticalChance}%); resistência ${hit.defense.toFixed(1)}% (VIT efetiva do alvo ${effectiveVitality(enemy)}); redução aplicada ${Math.max(0, fireCriticalDamage - hit.damage)}; dano final ${hit.damage}.`;
  if (hit.target.hp <= 0) return { ...result('enemy-defeated', details, `Míssil de Fogo derrotou ${hit.target.name} (${hit.damage} dano).`), actionConsumed: true, visual };
  return { ...result('continue', details, `${hit.critical ? 'Crítico! ' : ''}Míssil causou ${hit.damage}${hit.burnApplied ? ` e aplicou queimadura (${Math.max(1, Math.floor(hit.damage * RULES.burnDamageMultiplier))} por ativação, até ${RULES.burnDurationTurns}).` : ' de dano.'}`), actionConsumed: true, visual };
}

export function prepareDefense(run: RunState): boolean {
  if (!run.enemy || !run.playerTurn) return false;
  run.defending = true;
  run.playerTurn = false;
  return true;
}

export function resolveEnemyTurn(run: RunState): CombatResult {
  const enemy = run.enemy;
  if (!enemy) return result('continue');

  const player = run.player;
  const defending = run.defending === true;
  run.defending = false;
  const interrupted = run.enemyActionInterrupted === true;
  const intent = interrupted
    ? run.enemyInterruptedIntent ?? 'basic-attack'
    : run.enemyIntent ?? 'basic-attack';
  run.enemyActionInterrupted = false;
  run.enemyInterruptedIntent = undefined;
  const enemyAbilityManaCost = intent === 'heavy-attack' ? RULES.heavyAttackManaCost
    : intent === 'double-attack' ? RULES.doubleAttackManaCost
    : intent === 'fire-arrow' ? RULES.enemyAbilityManaCost[enemy.rarity]
    : intent.endsWith('-class-skill') && enemy.classSkill ? CLASS_SKILLS[enemy.classSkill].manaCost : 0;
  run.enemyIntent = 'basic-attack';
  const messages: string[] = [];
  let visual: CombatVisualCue | undefined;
  if (interrupted) {
    enemy.mp = Math.max(0, enemy.mp - enemyAbilityManaCost);
    messages.push(`Interrupção bem-sucedida: ${intentName(intent)} erra automaticamente; 0 dano e gasta ${enemyAbilityManaCost} MP (${formatMana(enemy.mp)}/${formatMana(enemy.maxMp)} restantes).`);
    visual = { kind: 'interrupted', target: 'enemy',
      attackType: intent === 'fire-arrow' || intent === 'mage-class-skill' ? 'magical' : 'physical', interrupted: true };
  }

  const enemyPoison = tickPoison(enemy);
  if (enemyPoison) messages.push(`${enemy.name}: ${enemyPoison}`);
  // Efeitos de queimadura ativam no começo do próximo turno inimigo.
  if (enemy.burning) {
    const burn = tickBurning(enemy);
    Object.assign(enemy, burn.target);
    messages.push(`Queimadura no inimigo: ${burn.damage} dano; ${burn.continued ? 'continuará no próximo turno.' : 'efeito encerrado.'}`);
  }
  if (run.player.burning) {
    const burn = tickBurning(run.player);
    Object.assign(run.player, burn.target);
    messages.push(`Sua queimadura: ${burn.damage} dano; ${burn.continued ? 'continuará no próximo turno.' : 'efeito encerrado.'}`);
  }
  if (run.player.hp <= 0) return { outcome: 'player-defeated', messages, visual };
  if (!run.enemy || run.enemy.hp <= 0) return { outcome: 'enemy-defeated', messages };
  const enemyRegeneration = tickHealingOverTime(enemy);
  if (enemyRegeneration) messages.push(`${enemy.name}: ${enemyRegeneration}`);
  if (interrupted) {
    // The successful interruption consumes the prepared attack without rolling damage or spending mana.
  } else {
    messages.push(`Inimigo executa: ${intentName(intent, enemy.classSkill)}${intent === 'basic-attack' ? '' : ` (custo ${enemyAbilityManaCost} MP)`}.`);

  if (intent.endsWith('-class-skill') && enemy.classSkill && enemy.mp >= enemyAbilityManaCost) {
    enemy.mp -= enemyAbilityManaCost;
    if (classSkillIsSupport(enemy.classSkill)) {
      messages.push(...resolveClassSkillSupport(enemy, enemy.classSkill));
    } else {
      const skillResult = resolveClassSkillAttack(enemy, player, enemy.classSkill, defending, 'player');
      run.player = skillResult.target;
      messages.push(...skillResult.messages);
      visual = skillResult.visual;
    }
  } else 

  if (intent === 'heavy-attack' && enemy.mp >= RULES.heavyAttackManaCost) {
    enemy.mp -= enemyAbilityManaCost;
    const rawDamage = modifyAttackDamage(enemy, DERIVED_FORMULAS.physicalDamage(enemy.stats, enemy.level).max, 'physical');
    const defense = defenseValue(player, 'physical');
    const targetVitality = effectiveVitality(player);
    const shielded = player.magicShield ? player.magicShieldReduction ?? 0.5 : false;
    const damage = applyDefense(rawDamage, defense, defending, shielded);
    if (shielded) { delete player.magicShield; delete player.magicShieldReduction; }
    player.hp = Math.max(0, player.hp - damage);
    visual = { kind: 'hit', target: 'player', amount: damage, attackType: 'heavy' };
    messages.push(`Cálculo pesado: máximo ${rawDamage}; resistência passiva ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality})${defending ? '; Defender divide por 2 após a resistência' : ''}${shielded ? '; Escudo Mágico divide por 2' : ''}; redução total ${Math.max(0, rawDamage - damage)}; dano ${damage}.`);
  } else if (intent === 'double-attack' && enemy.mp >= RULES.doubleAttackManaCost) {
    enemy.mp -= enemyAbilityManaCost;
    let hits = 0;
    let total = 0;
    let evadedHits = 0;
    let criticalHit = false;
    const hitDetails: Array<{ amount: number; critical: boolean }> = [];
    const details: string[] = [];
    for (let strike = 0; strike < 2 && player.hp > 0; strike += 1) {
      const evasionChance = DERIVED_FORMULAS.evasionPercent(player.stats);
      if (randomChance(evasionChance)) { evadedHits += 1; details.push(`Golpe inimigo ${strike + 1} esquivado (chance ${evasionChance}%).`); continue; }
      const range = basicAttackRange(enemy, 'rogue');
      const rawDamage = modifyAttackDamage(enemy, randomDamage(range.min, range.max), range.type);
      const critical = randomChance(criticalChance(enemy));
      criticalHit ||= critical;
      const defense = defenseValue(player, range.type);
      const targetVitality = effectiveVitality(player);
      const shielded = player.magicShield ? player.magicShieldReduction ?? 0.5 : false;
      const damage = applyDefense(rawDamage * (critical ? RULES.criticalMultiplier : 1), defense,
        defending, shielded);
      if (shielded) { delete player.magicShield; delete player.magicShieldReduction; }
      player.hp = Math.max(0, player.hp - damage);
      const poisonNote = applyAlchemistPoison(enemy, player, damage);
      hits += 1;
      total += damage;
      hitDetails.push({ amount: damage, critical });
      const criticalDamage = rawDamage * (critical ? RULES.criticalMultiplier : 1);
      details.push(`Golpe inimigo ${strike + 1}: faixa ${range.min}–${range.max}, sorteio inteiro ${rawDamage}, dano bruto ${criticalDamage}, crítico ${critical ? 'sim' : 'não'} (${criticalChance(enemy)}%), resistência passiva ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality})${defending ? '; Defender divide por 2 após resistência' : ''}${shielded ? '; escudo reduz dano' : ''}, redução total ${Math.max(0, criticalDamage - damage)}, final ${damage}.${poisonNote ? ` ${poisonNote}` : ''}`);
    }
    visual = hits > 0
      ? { kind: 'hit', target: 'player', amount: total, critical: criticalHit, attackType: 'double', evadedHits, hitDetails }
      : { kind: 'dodge', target: 'player', attackType: 'double' };
    messages.push(...details, `Ataque duplo: ${hits}/2 golpes acertaram, ${total} dano total${defending ? ' • defesa ativa' : ''}.`);
  } else if (intent === 'fire-arrow' && enemy.mp >= enemyAbilityManaCost) {
    enemy.mp -= enemyAbilityManaCost;
    const shielded = player.magicShield ? player.magicShieldReduction ?? 0.5 : false;
    const hit = castFireArrow(enemy, player, defending);
    run.player = hit.target;
    visual = hit.dodged
      ? { kind: 'dodge', target: 'player', attackType: 'magical' }
      : { kind: 'hit', target: 'player', amount: hit.damage, critical: hit.critical, attackType: 'magical' };
    messages.push(hit.dodged
      ? `Você esquivou do Míssil de Fogo inimigo (chance ${hit.evasionChance}%).`
      : `Míssil inimigo: base inteira sorteada ${hit.baseDamage} × ${RULES.fireArrowDamageMultiplier} = ${hit.rawDamage}, crítico ${hit.critical ? 'sim' : 'não'} (${hit.criticalChance}%), resistência passiva ${hit.defense.toFixed(1)}% (VIT efetiva do alvo ${effectiveVitality(player)})${defending ? '; Defender divide por 2 após resistência' : ''}${shielded ? '; Escudo Mágico divide por 2' : ''}; redução total ${Math.max(0, hit.rawDamage * (hit.critical ? RULES.criticalMultiplier : 1) - hit.damage)}; dano ${hit.damage}${hit.burnApplied ? '; queimadura aplicada.' : '.'}`);
  } else {
    const evasionChance = DERIVED_FORMULAS.evasionPercent(player.stats);
    const dodged = randomChance(evasionChance);
    if (dodged) {
      visual = { kind: 'dodge', target: 'player', attackType: 'physical' };
      messages.push(`Você esquivou do ataque básico inimigo (chance ${evasionChance}%).`);
      if (defending) messages.push('A defesa expirou após o turno inimigo.');
    } else {
      const range = basicAttackRange(enemy, enemy.classId ?? 'warrior');
      const rawDamage = modifyAttackDamage(enemy, randomDamage(range.min, range.max), range.type);
      const critical = randomChance(criticalChance(enemy));
      const criticalDamage = rawDamage * (critical ? RULES.criticalMultiplier : 1);
      const defense = defenseValue(player, range.type);
      const targetVitality = effectiveVitality(player);
      const shielded = player.magicShield ? player.magicShieldReduction ?? 0.5 : false;
      const damage = applyDefense(criticalDamage, defense, defending, shielded);
      if (shielded) { delete player.magicShield; delete player.magicShieldReduction; }
      player.hp = Math.max(0, player.hp - damage);
      const poisonNote = applyAlchemistPoison(enemy, player, damage);
      const manaRestored = regenerateManaOnBasicAttackHit(enemy, critical);
      visual = { kind: 'hit', target: 'player', amount: damage, critical, attackType: range.type };
      messages.push(`Cálculo do ataque básico inimigo: faixa ${range.min}–${range.max}, sorteio inteiro ${rawDamage}, dano bruto ${criticalDamage}, crítico ${critical ? 'sim' : 'não'} (${criticalChance(enemy)}%), resistência passiva ${defense.toFixed(1)}% (VIT efetiva do alvo ${targetVitality})${defending ? '; Defender divide por 2 após resistência' : ''}${shielded ? '; escudo reduz dano' : ''}, redução total ${Math.max(0, criticalDamage - damage)}, dano ${damage}${manaRestored ? `, +${formatMana(manaRestored)} MP` : ''}.${poisonNote ? ` ${poisonNote}` : ''}`);
    }
  }
  }

  if (run.player.hp <= 0) return { outcome: 'player-defeated', messages, visual };
  if (!run.enemy || run.enemy.hp <= 0) return { outcome: 'enemy-defeated', messages, visual };
  const playerRegeneration = tickHealingOverTime(run.player);
  if (playerRegeneration) messages.push(`Você: ${playerRegeneration}`);
  const playerPoison = tickPoison(run.player);
  if (playerPoison) messages.push(`Você: ${playerPoison}`);
  if (run.player.hp <= 0) return { outcome: 'player-defeated', messages, visual };
  run.enemyIntent = chooseEnemyIntent(run.enemy, run.player);
  const abilityChance = enemyAbilityChance(run.enemy, run.player);
  messages.push(`Próxima intenção inimiga: ${intentName(run.enemyIntent)} • chance de habilidade ${Math.round(abilityChance * 100)}% (HP inimigo ${Math.round(run.enemy.hp / run.enemy.maxHp * 100)}%, HP jogador ${Math.round(run.player.hp / run.player.maxHp * 100)}%).`);
  run.playerTurn = true;
  return { outcome: 'continue', messages, visual };
}
