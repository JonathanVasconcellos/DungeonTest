import type { CombatLogStats, RunLogCategory, RunLogEntry, RunLogSnapshot, RunState, TurnActor } from '../types';
import type { CombatVisualCue } from '../combat/CombatSystem';
import { ensureTurnScheduler } from '../rules/turns';

export function captureRunLogSnapshot(run: RunState): RunLogSnapshot {
  const flow = ensureTurnScheduler(run);
  return {
    playerHp: run.player.hp, playerMaxHp: run.player.maxHp, playerMp: run.player.mp, playerMaxMp: run.player.maxMp,
    enemyName: run.enemy?.name, enemyHp: run.enemy?.hp, enemyMaxHp: run.enemy?.maxHp,
    enemyMp: run.enemy?.mp, enemyMaxMp: run.enemy?.maxMp,
    playerSpeed: flow.playerSpeed, enemySpeed: flow.enemySpeed,
    playerExtraPending: flow.playerExtraPending, enemyExtraPending: flow.enemyExtraPending,
    playerBurningTurns: run.player.burning?.turnsRemaining, enemyBurningTurns: run.enemy?.burning?.turnsRemaining,
    playerHealingTurns: run.player.healingOverTime?.turnsRemaining, enemyHealingTurns: run.enemy?.healingOverTime?.turnsRemaining,
    playerMagicShield: run.player.magicShield, enemyMagicShield: run.enemy?.magicShield,
    defending: run.defending, enemyIntent: run.enemyIntent,
  };
}

export function appendRunLog(
  run: RunState,
  ...entries: string[]
): void {
  appendRunLogWithContext(run, undefined, undefined, ...entries);
}

export function appendRunLogWithContext(
  run: RunState,
  category: RunLogCategory | undefined,
  before: RunLogSnapshot | undefined,
  ...entries: string[]
): void {
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const after = captureRunLogSnapshot(run);
  const additions: RunLogEntry[] = entries.map((text) => ({
    timestamp,
    combatId: run.combatId,
    turn: run.combatTurn,
    category: category ?? inferCategory(text),
    text: text.replace(/\s+/g, ' ').trim(),
    before,
    after,
  })).filter((entry) => entry.text.length > 0);
  run.combatLog = [...(run.combatLog ?? []), ...additions];
}

export function beginCombatLog(run: RunState, enemyName: string): void {
  run.combatId = (run.combatId ?? 0) + 1;
  run.combatTurn = 0;
  run.combatStats = createCombatLogStats();
  appendRunLogWithContext(run, 'combat-start', undefined,
    `COMBATE #${run.combatId} — Andar ${run.dungeonLevel}, sala ${run.roomIndex + 1}.`,
    `Jogador: ${run.classId}, nível ${run.player.level}; inimigo: ${enemyName}, nível ${run.enemy?.level ?? '?'}, ${run.enemy?.rarity ?? '—'}, classe ${run.enemy?.classId ?? 'Guerreiro'}${run.enemy?.mutated ? ', mutante' : ''}.`);
}

export function recordCombatAction(
  run: RunState,
  actor: TurnActor,
  action: string,
  before: RunLogSnapshot,
  visual?: CombatVisualCue,
  consumesTurn = true,
): void {
  if (!run.combatStats) run.combatStats = createCombatLogStats();
  const stats = run.combatStats;
  const after = captureRunLogSnapshot(run);
  if (consumesTurn) run.combatTurn = (run.combatTurn ?? 0) + 1;
  stats.actions += 1;
  const dealt = actor === 'player'
    ? Math.max(0, (before.enemyHp ?? 0) - (after.enemyHp ?? 0))
    : Math.max(0, before.playerHp - after.playerHp);
  if (actor === 'player') stats.playerDamage += dealt;
  else stats.enemyDamage += dealt;
  if (visual?.kind === 'dodge') stats.misses += 1;
  else if (visual?.kind === 'hit') stats.hits += visual.hitDetails?.length ?? 1;
  if (visual?.kind === 'hit') stats.criticals += visual.hitDetails
    ? visual.hitDetails.filter((hit) => hit.critical).length : visual.critical ? 1 : 0;
  if (/habilidade|magia|flecha|míssil|ataque pesado|ataque duplo/i.test(action)) stats.abilities += 1;
  const mpBefore = actor === 'player' ? before.playerMp : before.enemyMp ?? 0;
  const mpAfter = actor === 'player' ? after.playerMp : after.enemyMp ?? 0;
  if (mpAfter < mpBefore) stats.manaSpent += mpBefore - mpAfter;
  if (mpAfter > mpBefore) stats.manaRecovered += mpAfter - mpBefore;
  const effectApplied = (after.playerBurningTurns ?? 0) > (before.playerBurningTurns ?? 0)
    || (after.enemyBurningTurns ?? 0) > (before.enemyBurningTurns ?? 0)
    || (!before.playerMagicShield && after.playerMagicShield === true)
    || (!before.enemyMagicShield && after.enemyMagicShield === true);
  const healingApplied = before.playerHealingTurns !== after.playerHealingTurns
    || before.enemyHealingTurns !== after.enemyHealingTurns;
  if (effectApplied || healingApplied) stats.effectsApplied += 1;
  if (run.turnScheduler?.activeExtra === actor) {
    appendRunLogWithContext(run, 'turn-extra', before,
      `TURNO EXTRA CONSUMIDO: ${actor === 'player' ? run.player.name : after.enemyName ?? 'Inimigo'} executou ${action}.`);
  }
  // CombatSystem/Controller logs the detailed calculation already; don't repeat the same action as a generic row.
}

export function finishCombatLog(run: RunState, outcome: 'vitória' | 'derrota'): void {
  const stats = run.combatStats ?? createCombatLogStats();
  const end = outcome === 'vitória' ? 'Inimigo derrotado' : 'Jogador derrotado';
  appendRunLogWithContext(run, 'combat-end', undefined,
    `FIM DO COMBATE #${run.combatId ?? 1}: ${outcome.toUpperCase()} (${end}).`,
    `Resumo: ${stats.actions} ações registradas (${run.combatTurn ?? 0} ações com turno); dano ao inimigo ${stats.playerDamage}; dano ao jogador ${stats.enemyDamage}; ${stats.hits} acertos; ${stats.misses} esquivas/falhas; ${stats.criticals} críticos; ${stats.abilities} habilidades; ${stats.manaSpent} MP gastos; ${stats.manaRecovered} MP recuperados; ${stats.effectsApplied} efeitos aplicados.`);
}

export function createCombatLogStats(): CombatLogStats {
  return { actions: 0, playerDamage: 0, enemyDamage: 0, hits: 0, misses: 0, criticals: 0,
    abilities: 0, manaSpent: 0, manaRecovered: 0, effectsApplied: 0 };
}

export function appendTurnExtraLog(run: RunState, actor: TurnActor): void {
  const speed = actor === 'player' ? run.turnScheduler?.playerSpeed : run.turnScheduler?.enemySpeed;
  appendRunLogWithContext(run, 'turn-extra', undefined,
    `TURNO EXTRA LIBERADO: ${actor === 'player' ? run.player.name : run.enemy?.name ?? 'Inimigo'} encheu a barra (${Math.round(speed ?? 0)}/100); a ação adicional foi agendada.`);
}

export function formatRunLogEntry(entry: RunLogEntry, includeState = true): string {
  const delta = includeState && entry.before ? formatChanges(entry.before, entry.after) : '';
  return `${entry.timestamp}  ${categoryName(entry.category).toUpperCase()}\n${entry.text}${delta ? `\n${delta}` : ''}`;
}

function formatChanges(before: RunLogSnapshot, after: RunLogSnapshot): string {
  const changes: string[] = [];
  addResourceChange(changes, 'Jogador', before.playerHp, after.playerHp, 'HP');
  addResourceChange(changes, 'Jogador', before.playerMp, after.playerMp, 'MP');
  if (before.enemyName && after.enemyName) {
    addResourceChange(changes, after.enemyName, before.enemyHp, after.enemyHp, 'HP');
    addResourceChange(changes, after.enemyName, before.enemyMp, after.enemyMp, 'MP');
  }
  if (before.playerBurningTurns !== after.playerBurningTurns)
    changes.push(`Queimadura no jogador: ${after.playerBurningTurns ?? 0} turno(s)`);
  if (before.enemyBurningTurns !== after.enemyBurningTurns)
    changes.push(`Queimadura em ${after.enemyName ?? 'inimigo'}: ${after.enemyBurningTurns ?? 0} turno(s)`);
  if (before.playerHealingTurns !== after.playerHealingTurns)
    changes.push(`Regeneração no jogador: ${after.playerHealingTurns ?? 0} turno(s)`);
  if (before.enemyHealingTurns !== after.enemyHealingTurns)
    changes.push(`Regeneração em ${after.enemyName ?? 'inimigo'}: ${after.enemyHealingTurns ?? 0} turno(s)`);
  if (before.playerMagicShield !== after.playerMagicShield && after.playerMagicShield)
    changes.push('Escudo mágico do jogador ativado');
  if (before.enemyMagicShield !== after.enemyMagicShield && after.enemyMagicShield)
    changes.push('Escudo mágico do inimigo ativado');
  return changes.length ? `Estado: ${changes.join(' • ')}` : '';
}

function addResourceChange(changes: string[], name: string, before: number | undefined, after: number | undefined, resource: string): void {
  if (before === undefined || after === undefined || before === after) return;
  changes.push(`${name} ${resource} ${before}→${after}`);
}

function categoryName(category: RunLogCategory): string {
  return ({ system: 'Sistema', 'combat-start': 'Combate', 'player-action': 'Ação jogador', 'enemy-action': 'Ação inimigo',
    damage: 'Dano', dodge: 'Esquiva', defense: 'Defesa', 'turn-extra': 'Turno extra', effect: 'Efeito',
    reward: 'Recompensa', 'combat-end': 'Resumo', room: 'Sala' })[category];
}

function inferCategory(text: string): RunLogCategory {
  const lower = text.toLowerCase();
  if (lower.includes('turno extra')) return 'turn-extra';
  if (lower.includes('esquiv')) return 'dodge';
  if (lower.includes('defesa') || lower.includes('defender')) return 'defense';
  if (lower.includes('queimad') || lower.includes('regenera') || lower.includes('efeito')) return 'effect';
  if (lower.includes('xp') || lower.includes('poção') || lower.includes('item')) return 'reward';
  if (lower.includes('sala ')) return 'room';
  if (lower.includes('inimigo executa') || lower.includes('cálculo do ataque básico inimigo') || lower.includes('cálculo pesado')) return 'enemy-action';
  if (lower.startsWith('você ') || lower.startsWith('ataque') || lower.startsWith('míssil') || lower.startsWith('cálculo:')) return 'player-action';
  return 'system';
}
