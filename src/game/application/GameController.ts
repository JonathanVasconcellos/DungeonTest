import { prepareDefense, resolveEnemyTurn, resolvePlayerAttack, resolvePlayerDoubleAttack, resolvePlayerFireArrow, resolvePlayerHeavyAttack } from '../combat/CombatSystem';
import type { CombatVisualCue } from '../combat/CombatSystem';
import { useHealingPotion } from '../rules/inventory';
import { createRun } from '../state/run';
import type { Attribute, ClassId, RunState, Stats } from '../types';
import { advanceRun, allocatePendingPoint, choosePendingLoot, clearCombatEffects, enterRoom, grantCombatRewards, recoverAfterEvent, resolveNonCombatEvent } from './RunService';
import { HEALING_POTION_ID } from '../content/items';
import { RULES } from '../rules/config';
import { appendRunLog, appendRunLogWithContext, appendTurnExtraLog, captureRunLogSnapshot, finishCombatLog, recordCombatAction } from '../state/runLog';
import { randomChance } from '../rules/random';
import { completeTurnAction, ensureTurnScheduler } from '../rules/turns';
import { CLASS_SKILLS } from '../content/classSkills';
import { SPECIALIZATIONS, SPECIALIZATIONS_BY_CLASS, specializationSkill, type SpecializationId } from '../content/specializations';
import { canUseClassSkillSupport, classSkillIsSupport, resolveClassSkillAttack, resolveClassSkillSupport } from '../combat/ClassSkillSystem';

export type GameView = 'combat' | 'room' | 'loot-choice' | 'level-up' | 'skill-choice' | 'game-over' | 'victory';
export type GameFeedback = 'none' | 'player-attack' | 'fire' | 'defend' | 'enemy-turn'
  | 'enemy-attack' | 'enemy-dodge' | 'player-dodge' | 'heavy-attack' | 'double-attack';

export interface GameTransition {
  view: GameView;
  note?: string;
  feedback?: GameFeedback;
  waitForEnemy?: boolean;
  visual?: CombatVisualCue;
}

const transition = (view: GameView, options: Omit<GameTransition, 'view'> = {}): GameTransition => ({ view, ...options });

/** Coordinates game rules. Phaser scenes only render transitions and schedule animation delays. */
export class GameController {
  private run: RunState | null = null;
  private roomReady = false;

  constructor() {}

  get state(): RunState | null { return this.run; }

  recordCombatMessage(message: string): void { this.pushCombatMessages([message]); }

  returnToMenu(): void {
    this.run = null;
    this.roomReady = false;
  }

  startRun(classId: ClassId, startingStats?: Stats): GameTransition {
    this.run = createRun(classId, startingStats);
    appendRunLog(this.run, `Tentativa iniciada: classe ${classId}.`);
    this.roomReady = false;
    return this.enterCurrentRoom();
  }

  basicAttack(): GameTransition {
    if (!this.run?.enemy || !this.run.playerTurn) return transition('combat');
    const before = captureRunLogSnapshot(this.run);
    const result = resolvePlayerAttack(this.run);
    this.pushCombatMessages(result.messages, before);
    if (!result.actionConsumed) return transition('combat');
    recordCombatAction(this.run, 'player', 'Ataque básico', before, result.visual);
    if (result.outcome === 'enemy-defeated') return this.finishCombat(result.visual, 'player-attack');
    return this.advanceAfterTurnAction('player', result.visual?.kind === 'dodge' ? 'enemy-dodge' : 'player-attack', result.visual);
  }

  fireArrow(): GameTransition {
    if (!this.run?.enemy || !this.run.playerTurn) return transition('combat');
    const before = captureRunLogSnapshot(this.run);
    const result = resolvePlayerFireArrow(this.run);
    this.pushCombatMessages(result.messages, before);
    if (!result.actionConsumed) return transition('combat');
    recordCombatAction(this.run, 'player', 'Míssil de Fogo', before, result.visual);
    if (result.outcome === 'enemy-defeated') return this.finishCombat(result.visual, 'fire');
    const interrupted = this.cancelPreparedEnemyAbility();
    return this.advanceAfterTurnAction('player', result.visual?.kind === 'dodge' ? 'enemy-dodge' : 'fire',
      interrupted && result.visual ? { ...result.visual, interrupted: true } : result.visual);
  }

  magicShield(): GameTransition {
    const run = this.run;
    if (!run?.enemy || !run.playerTurn || run.classId !== 'mage' || run.player.magicShield) return transition('combat');
    if (run.player.mp < RULES.magicShieldManaCost) return transition('combat', { note: 'Mana insuficiente para Escudo Mágico.' });
    const before = captureRunLogSnapshot(run);
    run.defending = false;
    run.player.mp -= RULES.magicShieldManaCost;
    run.player.magicShield = true;
    run.player.magicShieldHitsRemaining = 2;
    this.pushCombatMessages([`Escudo Mágico: custo ${RULES.magicShieldManaCost} MP; reduzirá em 50% os próximos 2 ataques acertados.`], before);
    recordCombatAction(run, 'player', 'Defesa: Escudo Mágico', before);
    this.cancelPreparedEnemyAbility();
    return this.advanceAfterTurnAction('player', 'defend');
  }

  classAbility(): GameTransition {
    const run = this.run;
    if (!run?.enemy || !run.playerTurn) return transition('combat');
    const before = captureRunLogSnapshot(run);
    const result = run.classId === 'warrior'
      ? resolvePlayerHeavyAttack(run)
      : run.classId === 'rogue' ? resolvePlayerDoubleAttack(run) : null;
    if (!result) return transition('combat');
    this.pushCombatMessages(result.messages, before);
    if (!result.actionConsumed) return transition('combat');
    recordCombatAction(run, 'player', run.classId === 'warrior' ? 'Habilidade: Ataque Pesado' : 'Habilidade: Ataque Duplo', before, result.visual);
    if (result.outcome === 'enemy-defeated') return this.finishCombat(result.visual,
      run.classId === 'warrior' ? 'heavy-attack' : 'double-attack');
    const interrupted = this.cancelPreparedEnemyAbility();
    return this.advanceAfterTurnAction('player', run.classId === 'warrior' ? 'heavy-attack' : 'double-attack',
      interrupted && result.visual ? { ...result.visual, interrupted: true } : result.visual);
  }

  useClassSkill(): GameTransition {
    const run = this.run;
    const skillId = run?.player.classSkill;
    if (!run?.enemy || !run.playerTurn || !skillId || run.player.level < RULES.classSkillUnlockLevel) return transition('combat');
    const skill = CLASS_SKILLS[skillId];
    if (run.player.mp < skill.manaCost) return transition('combat', { note: `Mana insuficiente para ${skill.name}.` });
    if (classSkillIsSupport(skillId) && !canUseClassSkillSupport(run.player, skillId)) return transition('combat');
    const before = captureRunLogSnapshot(run);
    run.player.mp -= skill.manaCost;
    if (classSkillIsSupport(skillId)) {
      if (skill.effect === 'aegis') run.defending = false;
      const messages = resolveClassSkillSupport(run.player, skillId);
      this.pushCombatMessages(messages, before);
      recordCombatAction(run, 'player', `Habilidade: ${skill.name}`, before);
      this.cancelPreparedEnemyAbility();
      return this.advanceAfterTurnAction('player', 'defend');
    }
    const result = resolveClassSkillAttack(run.player, run.enemy, skillId);
    run.enemy = result.target;
    this.pushCombatMessages(result.messages, before);
    recordCombatAction(run, 'player', `Habilidade: ${skill.name}`, before, result.visual);
    if (result.outcome === 'enemy-defeated') return this.finishCombat(result.visual,
      skill.attackType === 'magical' ? 'fire' : skill.attackType === 'double' ? 'double-attack' : 'heavy-attack');
    const interrupted = this.cancelPreparedEnemyAbility();
    const feedback: GameFeedback = skill.attackType === 'magical' ? 'fire'
      : skill.attackType === 'double' ? 'double-attack' : 'heavy-attack';
    return this.advanceAfterTurnAction('player', feedback,
      interrupted && result.visual ? { ...result.visual, interrupted: true } : result.visual);
  }

  chooseSpecialization(specializationId: SpecializationId): GameTransition {
    const run = this.run;
    if (!run?.pendingSpecializationSelection || !SPECIALIZATIONS_BY_CLASS[run.classId].includes(specializationId)) {
      return transition('skill-choice');
    }
    run.player.specialization = specializationId;
    run.player.classSkill = specializationSkill(specializationId);
    run.pendingSpecializationSelection = false;
    appendRunLog(run, `Especialização escolhida no nível ${RULES.specializationUnlockLevel}: ${SPECIALIZATIONS[specializationId].name}. A habilidade ${run.player.classSkill ? CLASS_SKILLS[run.player.classSkill].name : ''} será liberada no nível ${RULES.classSkillUnlockLevel}.`);
    return this.continueAfterRoomCompletion();
  }

  defend(): GameTransition {
    if (!this.run || this.run.classId === 'mage' || !this.run.enemy || !this.run.playerTurn) return transition('combat');
    const before = captureRunLogSnapshot(this.run);
    if (!prepareDefense(this.run)) return transition('combat');
    const manaRestored = this.run.player.mp - before.playerMp;
    this.pushCombatMessages([`Ação do jogador: Defender; o dano será dividido por 2 após a resistência passiva no próximo turno inimigo; +${manaRestored} MP.`], before);
    recordCombatAction(this.run, 'player', 'Defender', before);
    return this.advanceAfterTurnAction('player', 'defend');
  }

  usePotion(slot: number): GameTransition | null {
    const run = this.run;
    if (!run || !run.playerTurn || slot < 0 || run.inventory[slot] !== HEALING_POTION_ID
      || run.player.hp >= run.player.maxHp) return null;
    const before = captureRunLogSnapshot(run);
    const hpBefore = run.player.hp;
    run.player = useHealingPotion(run.player);
    run.inventory[slot] = null;
    const healed = run.player.hp - hpBefore;
    appendRunLogWithContext(run, 'player-action', before,
      `Poção de Cura do espaço ${slot + 1}: HP ${hpBefore}→${run.player.hp} (+${healed}); mana ${before.playerMp}→${run.player.mp}.`);
    recordCombatAction(run, 'player', 'Usou Poção de Cura (ação livre)', before, undefined, false);
    return transition('combat', { note: `Poção de Cura do espaço ${slot + 1}: +${healed} HP (${hpBefore}→${run.player.hp}).` });
  }

  enemyTurn(): GameTransition {
    if (!this.run?.enemy) return transition('combat');
    const executedIntent = this.run.enemyInterruptedIntent ?? this.run.enemyIntent ?? 'basic-attack';
    const before = captureRunLogSnapshot(this.run);
    const result = resolveEnemyTurn(this.run);
    this.pushCombatMessages(result.messages, before);
    const enemySkillName = executedIntent.endsWith('-class-skill') && this.run.enemy?.classSkill
      ? CLASS_SKILLS[this.run.enemy.classSkill].name : executedIntent;
    recordCombatAction(this.run, 'enemy', executedIntent === 'basic-attack' ? 'Ataque básico inimigo' : `Habilidade inimiga: ${enemySkillName}`, before, result.visual);
    if (result.outcome === 'player-defeated') {
      clearCombatEffects(this.run);
      this.run.status = 'game-over';
      this.pushCombatMessages(['Fim da tentativa: jogador derrotado.']);
      finishCombatLog(this.run, 'derrota');
      return transition('game-over', { note: 'A tentativa chegou ao fim.', feedback: 'enemy-attack', visual: result.visual });
    }
    if (result.outcome === 'enemy-defeated') return this.finishCombat(result.visual, 'enemy-attack');
    return this.advanceAfterTurnAction('enemy', result.visual?.kind === 'interrupted' ? 'enemy-dodge'
      : result.visual?.kind === 'dodge' ? result.visual.target === 'enemy' ? 'enemy-dodge' : 'player-dodge'
      : result.visual?.kind === 'hit' ? 'enemy-attack' : 'enemy-turn', result.visual);
  }

  allocatePoint(attribute: Attribute): GameTransition {
    if (!this.run) return transition('level-up');
    const complete = allocatePendingPoint(this.run, attribute);
    if (complete) {
      const room = this.run.rooms[this.run.roomIndex];
      if (room?.resolved && room.completionAcknowledged) return this.continueAfterRoomCompletion();
      return this.settlePostLevelUp();
    }
    return transition('level-up');
  }

  chooseLoot(replaceSlot?: number): GameTransition {
    if (!this.run) return transition('loot-choice');
    const note = choosePendingLoot(this.run, replaceSlot);
    if (note === null) return transition('loot-choice');
    const room = this.run.rooms[this.run.roomIndex];
    if (room?.resolved && room.completionAcknowledged) return this.continueAfterRoomCompletion();
    return this.completeRoom(note);
  }

  interactRoomEvent(): GameTransition | null {
    const run = this.run;
    if (!run || this.roomReady) return null;
    const event = run.rooms[run.roomIndex]?.event;
    if (event !== 'rest' && event !== 'chest') return null;
    const note = resolveNonCombatEvent(run, event);
    if (note === null) {
      return transition('loot-choice');
    }
    return this.completeRoom(note);
  }

  advanceRoom(): GameTransition | null {
    const room = this.run?.rooms[this.run.roomIndex];
    if (!this.run || !this.roomReady || !room?.resolved || room.completionAcknowledged !== true) return null;
    this.roomReady = false;
    if (advanceRun(this.run) === 'victory') {
      this.pushCombatMessages(['Vitória: todos os andares foram concluídos.']);
      return transition('victory', { note: 'Você concluiu o calabouço.' });
    }
    return this.enterCurrentRoom();
  }

  private enterCurrentRoom(): GameTransition {
    if (!this.run) return transition('room');
    const kind = enterRoom(this.run);
    this.roomReady = false;
    if (kind === 'combat') return transition('combat');
    const event = this.run.rooms[this.run.roomIndex]?.event ?? 'empty';
    if (event === 'rest' || event === 'chest') {
      const note = event === 'rest' ? 'Toque na fogueira para recuperar vida e mana.' : 'Toque no baú para abri-lo.';
      return transition('room', { note });
    }
    const note = resolveNonCombatEvent(this.run, event);
    if (note === null) {
      return transition('loot-choice');
    }
    return this.completeRoom(note);
  }

  private finishCombat(visual?: CombatVisualCue, feedback?: GameFeedback): GameTransition {
    if (!this.run?.enemy) return transition('combat');
    finishCombatLog(this.run, 'vitória');
    clearCombatEffects(this.run);
    grantCombatRewards(this.run);
    const note = this.run.pendingEventNote ?? 'Vitória! Combate concluído.';
    return { ...this.completeRoom(note), visual, feedback };
  }

  private advanceAfterTurnAction(
    actor: 'player' | 'enemy',
    feedback: GameFeedback = 'enemy-turn',
    visual?: CombatVisualCue,
  ): GameTransition {
    if (!this.run) return transition('combat');
    const nextActor = completeTurnAction(this.run, actor);
    const scheduler = ensureTurnScheduler(this.run);
    if (scheduler.activeExtra) {
      appendTurnExtraLog(this.run, scheduler.activeExtra);
    }
    return transition('combat', { feedback, visual, waitForEnemy: nextActor === 'enemy' });
  }

  private settlePostLevelUp(): GameTransition {
    if (!this.run) return transition('room');
    const room = this.run.rooms[this.run.roomIndex];
    if (room?.resolved && room.completionAcknowledged) return this.continueAfterRoomCompletion();
    return this.completeRoom(this.run.pendingEventNote ?? 'Evento concluído.');
  }

  private continueAfterRoomCompletion(): GameTransition {
    const run = this.run;
    if (!run) return transition('room');
    if (run.pendingPoints > 0) {
      run.status = 'level-up';
      return transition('level-up');
    }
    if (run.pendingSpecializationSelection) {
      run.status = 'level-up';
      return transition('skill-choice');
    }
    if (run.pendingLoot) {
      run.status = 'loot-choice';
      return transition('loot-choice');
    }
    if (run.pendingCombatRecovery) {
      recoverAfterEvent(run);
      run.pendingCombatRecovery = false;
    }
    run.pendingEventNote = undefined;
    run.status = 'room';
    return transition('room', { note: run.rooms[run.roomIndex]?.completionNote });
  }

  private completeRoom(note: string): GameTransition {
    if (!this.run) return transition('room');
    this.run.status = 'room';
    this.pushCombatMessages([`Sala concluída: ${note}`]);
    const room = this.run.rooms[this.run.roomIndex];
    if (room) {
      room.resolved = true;
      room.completionAcknowledged = false;
      room.completionNote = note;
    }
    this.roomReady = true;
    return transition('room', { note });
  }

  acknowledgeRoomCompletion(): GameTransition {
    const run = this.run;
    const room = run?.rooms[run.roomIndex];
    if (!run || !room?.resolved) return transition('room');
    room.completionAcknowledged = true;
    return this.continueAfterRoomCompletion();
  }

  private pushCombatMessages(messages: string[], before?: ReturnType<typeof captureRunLogSnapshot>): void {
    if (!this.run) return;
    appendRunLogWithContext(this.run, undefined, before, ...messages);
  }

  private cancelPreparedEnemyAbility(): boolean {
    if (!this.run || !this.run.enemyIntent || this.run.enemyIntent === 'basic-attack') return false;
    const prepared = this.run.enemyIntent;
    const canceled = randomChance(RULES.playerAbilityCancelChance * 100);
    this.pushCombatMessages([`Interrupção de ${prepared}: chance ${(RULES.playerAbilityCancelChance * 100).toFixed(0)}% — ${canceled ? 'sucesso; o inimigo errará automaticamente, sem causar dano.' : 'falhou; habilidade permanece.'}`]);
    if (canceled) {
      this.run.enemyActionInterrupted = true;
      this.run.enemyInterruptedIntent = prepared;
      this.run.enemyIntent = 'basic-attack';
    }
    return canceled;
  }
}
