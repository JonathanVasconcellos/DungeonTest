import { DERIVED_FORMULAS, RULES } from './config';
import type { RunState, TurnActor, TurnSchedulerState } from '../types';
import { randomInt } from './random';

export function createTurnScheduler(nextNormalActor: TurnActor = 'player'): TurnSchedulerState {
  return {
    playerSpeed: 0, enemySpeed: 0,
    playerExtraPending: false, enemyExtraPending: false,
    playerExtraEligible: false, enemyExtraEligible: false,
    nextNormalActor, tieBreakNext: 'player', simultaneousPending: false, extraQueue: [],
  };
}

export function ensureTurnScheduler(run: RunState): TurnSchedulerState {
  if (!run.turnScheduler) {
    run.turnScheduler = createTurnScheduler(run.playerTurn ? 'player' : 'enemy');
  }
  return run.turnScheduler;
}

/** Completes a normal or extra action, advances unfilled gauges, then schedules the next slot. */
export function completeTurnAction(run: RunState, actor: TurnActor): TurnActor {
  const flow = ensureTurnScheduler(run);
  const wasExtra = flow.activeExtra === actor;
  const other: TurnActor = actor === 'player' ? 'enemy' : 'player';
  if (wasExtra) {
    flow.activeExtra = undefined;
    resetExtraGauge(flow, actor);
  } else {
    flow.nextNormalActor = other;
    // A pending extra becomes eligible after its owner has received the opponent's next normal turn.
    if (other === 'player' && flow.playerExtraPending) flow.playerExtraEligible = true;
    if (other === 'enemy' && flow.enemyExtraPending) flow.enemyExtraEligible = true;
  }
  advanceTurnGauges(run, wasExtra ? actor : undefined);

  return scheduleNextTurn(run);
}

/** Each completed turn advances both non-full gauges by a random 50–100% of that entity's speed. */
function advanceTurnGauges(run: RunState, justConsumedExtra?: TurnActor): void {
  const flow = ensureTurnScheduler(run);
  advanceOneGauge(run, 'player', justConsumedExtra !== 'player');
  if (run.enemy) advanceOneGauge(run, 'enemy', justConsumedExtra !== 'enemy');
  if (flow.playerExtraPending && flow.enemyExtraPending) flow.simultaneousPending = true;
}

function advanceOneGauge(run: RunState, actor: TurnActor, mayAdvance: boolean): void {
  if (!mayAdvance || !run.enemy) return;
  const flow = ensureTurnScheduler(run);
  const pending = actor === 'player' ? flow.playerExtraPending : flow.enemyExtraPending;
  if (pending) return;

  const stats = actor === 'player' ? run.player.stats : run.enemy!.stats;
  const speed = DERIVED_FORMULAS.extraTurnSpeed(stats);
  const minGain = Math.ceil(speed * RULES.extraTurnGaugeGainMinPercent / 100);
  const maxGain = Math.floor(speed * RULES.extraTurnGaugeGainMaxPercent / 100);
  const current = actor === 'player' ? flow.playerSpeed : flow.enemySpeed;
  const next = Math.min(RULES.extraTurnGaugeMax, current + randomInt(minGain, maxGain));
  if (actor === 'player') flow.playerSpeed = next;
  else flow.enemySpeed = next;

  if (next >= RULES.extraTurnGaugeMax) {
    if (actor === 'player') {
      flow.playerExtraPending = true;
      flow.playerExtraEligible = false;
    } else {
      flow.enemyExtraPending = true;
      flow.enemyExtraEligible = false;
    }
  }
}

function resetExtraGauge(flow: TurnSchedulerState, actor: TurnActor): void {
  if (actor === 'player') {
    flow.playerSpeed = 0;
    flow.playerExtraPending = false;
    flow.playerExtraEligible = false;
  } else {
    flow.enemySpeed = 0;
    flow.enemyExtraPending = false;
    flow.enemyExtraEligible = false;
  }
}

function scheduleNextTurn(run: RunState): TurnActor {
  const flow = ensureTurnScheduler(run);
  const playerReady = flow.playerExtraPending && flow.playerExtraEligible;
  const enemyReady = flow.enemyExtraPending && flow.enemyExtraEligible;

  if (flow.simultaneousPending && playerReady && enemyReady) {
    const first = flow.tieBreakNext;
    flow.extraQueue = [first, first === 'player' ? 'enemy' : 'player'];
    flow.tieBreakNext = first === 'player' ? 'enemy' : 'player';
    flow.simultaneousPending = false;
  }

  let actor: TurnActor;
  if (flow.extraQueue.length > 0) {
    actor = flow.extraQueue.shift()!;
  } else if (flow.simultaneousPending) {
    // Let both normal turns occur before resolving simultaneous extras.
    actor = flow.nextNormalActor;
  } else if (playerReady && enemyReady) {
    actor = flow.tieBreakNext;
    flow.tieBreakNext = actor === 'player' ? 'enemy' : 'player';
  } else if (playerReady) actor = 'player';
  else if (enemyReady) actor = 'enemy';
  else actor = flow.nextNormalActor;

  const isExtra = actor !== flow.nextNormalActor || (actor === 'player' ? playerReady : enemyReady);
  if (isExtra) {
    flow.activeExtra = actor;
  } else {
    flow.activeExtra = undefined;
  }

  run.playerTurn = actor === 'player';
  return actor;
}
