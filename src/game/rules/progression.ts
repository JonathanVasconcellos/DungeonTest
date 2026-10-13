import { DERIVED_FORMULAS, RULES } from './config';
import type { Entity } from '../types';

export interface ProgressResult { player: Entity; xp: number; gainedLevels: number; pendingPoints: number }

export function awardXp(player: Entity, currentXp: number, amount: number, pendingPoints: number): ProgressResult {
  let xp = currentXp + amount;
  let level = player.level;
  let gainedLevels = 0;
  let requestedPoints = 0;
  while (xp >= RULES.xpToNextLevel(level)) {
    xp -= RULES.xpToNextLevel(level);
    level += 1;
    gainedLevels += 1;
    requestedPoints += RULES.pointsAtLevel(level);
  }
  const leveledPlayer = {
    ...player,
    level,
    maxHp: DERIVED_FORMULAS.maxHp(player.stats, level),
    maxMp: DERIVED_FORMULAS.maxMp(player.stats, level),
  };
  return {
    player: leveledPlayer, xp, gainedLevels,
    pendingPoints: pendingPoints + requestedPoints,
  };
}
