import { DERIVED_FORMULAS, RULES } from '../rules/config';
import { initialStats } from '../rules/attributes';
import { emptyInventory } from '../rules/inventory';
import type { ClassId, Entity, EventType, RoomPlan, RunState, Stats } from '../types';
import { BOSS_ROOM_INDEX_FROM_END } from '../content/dungeon';
import { createTurnScheduler } from '../rules/turns';

export function generateRoomPlan(): RoomPlan[] {
  return Array.from({ length: RULES.roomsPerLevel }, (_, index) => {
    const isBossRoom = index === RULES.roomsPerLevel - BOSS_ROOM_INDEX_FROM_END;
    const event: EventType = isBossRoom ? 'boss' : index === 0 ? 'combat' : 'empty';
    return { event, resolved: false };
  });
}

function createEntity(name: string, classId: ClassId, startingStats?: Stats): Entity {
  const stats = startingStats ?? initialStats(classId);
  const maxHp = DERIVED_FORMULAS.maxHp(stats, 1);
  const maxMp = DERIVED_FORMULAS.maxMp(stats, 1);
  return { name, level: 1, rarity: 'normal', classId, stats, hp: maxHp, maxHp, mp: maxMp, maxMp, mutated: false };
}

export function createRun(classId: ClassId, startingStats?: Stats): RunState {
  const player = createEntity('Aventureiro', classId, startingStats);
  const rooms: RoomPlan[] = generateRoomPlan();
  return {
    classId, player, dungeonLevel: 1, roomIndex: 0, rooms,
    status: 'room', xp: 0, pendingPoints: 0, inventory: emptyInventory(), playerTurn: true,
    turnScheduler: createTurnScheduler('player'),
  };
}
