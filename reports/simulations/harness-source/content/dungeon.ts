import type { EventType } from '../types';
import { randomInt } from '../rules/random';

export const BOSS_ROOM_INDEX_FROM_END = 1;

export function chooseRoomEvent(
  randomValue = randomInt(0, 9999),
  inventoryItemCount = 0,
  restAvailable = true,
): Exclude<EventType, 'boss'> {
  const chestChance = Math.max(.05, .10 - Math.max(0, inventoryItemCount) * .02);
  const restChance = restAvailable ? .20 : 0;
  const entries: ReadonlyArray<{ event: Exclude<EventType, 'boss'>; weight: number }> = [
    { event: 'combat', weight: .70 },
    { event: 'rest', weight: restChance },
    { event: 'chest', weight: chestChance },
    { event: 'empty', weight: 1 - .70 - restChance - chestChance },
  ];
  let remaining = randomValue;
  for (const entry of entries) {
    remaining -= entry.weight * 10000;
    if (remaining < 0) return entry.event;
  }
  return 'empty';
}
