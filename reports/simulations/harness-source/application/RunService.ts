import { allocatePoint, statCap } from '../rules/attributes';
import { DERIVED_FORMULAS, RULES } from '../rules/config';
import { generateEnemy } from '../rules/enemies';
import { awardXp } from '../rules/progression';
import { generateRoomPlan } from '../state/run';
import type { Attribute, EventType, RunState } from '../types';
import { chooseEnemyIntent, enemyAbilityChance } from '../combat/CombatSystem';
import { HEALING_POTION_ID, ITEM_CONTENT, XP_POTION_ID } from '../content/items';
import { BOSS_ROOM_INDEX_FROM_END, chooseRoomEvent } from '../content/dungeon';
import { appendRunLog, beginCombatLog } from '../state/runLog';
import { randomInt } from '../rules/random';
import { createTurnScheduler } from '../rules/turns';

export type RoomEntryKind = 'combat' | 'room';

function addExperience(run: RunState, amount: number, source: string): string {
  const before = run.xp;
  const levelBefore = run.player.level;
  const progression = awardXp(run.player, run.xp, amount, run.pendingPoints);
  run.player = progression.player;
  run.xp = progression.xp;
  run.pendingPoints = progression.pendingPoints;
  if (levelBefore < RULES.specializationUnlockLevel && run.player.level >= RULES.specializationUnlockLevel
    && !run.player.specialization) run.pendingSpecializationSelection = true;
  appendRunLog(run, `${source}: +${amount} XP; saldo ${before}→${run.xp} (níveis ganhos: ${progression.gainedLevels}; pontos pendentes: ${run.pendingPoints}).`);
  return `+${amount} XP`;
}

function receivePotion(run: RunState, potion: typeof HEALING_POTION_ID | typeof XP_POTION_ID): string {
  if (potion === XP_POTION_ID) {
    const reward = addExperience(run, RULES.xpPotionXp, 'Poção de XP consumida automaticamente');
    return `Poção de XP consumida: ${reward}`;
  }
  const slot = run.inventory.findIndex((item) => item === null);
  if (slot >= 0) {
    run.inventory[slot] = HEALING_POTION_ID;
    appendRunLog(run, `Poção de cura adicionada ao espaço ${slot + 1}.`);
    return 'poção de cura guardada';
  }
  run.pendingLoot = HEALING_POTION_ID;
  appendRunLog(run, 'Poção de cura obtida, aguardando escolha de inventário.');
  return 'poção de cura obtida; inventário cheio';
}

function rollPotionReward(): typeof HEALING_POTION_ID | typeof XP_POTION_ID {
  return randomInt(0, 1) === 0 ? HEALING_POTION_ID : XP_POTION_ID;
}

/** Efeitos temporários pertencem ao combate em que foram aplicados. */
export function clearCombatEffects(run: RunState): void {
  const entities = [run.player, run.enemy, run.rooms[run.roomIndex]?.enemy];
  const affected = new Set(entities.filter((entity): entity is NonNullable<typeof entity> => entity !== undefined));
  let cleared = false;
  for (const entity of affected) {
    if (entity.burning || entity.poisoned || entity.healingOverTime || entity.magicShield) cleared = true;
    delete entity.burning;
    delete entity.poisoned;
    delete entity.healingOverTime;
    delete entity.magicShield;
    delete entity.magicShieldReduction;
  }
  run.defending = false;
  if (cleared) appendRunLog(run, 'Efeitos temporários encerrados ao fim do combate.');
}

export function enterRoom(run: RunState): RoomEntryKind {
  const room = run.rooms[run.roomIndex];
  if (!room) return 'room';
  const isCombat = room.event === 'combat' || room.event === 'boss';
  appendRunLog(run, `Andar ${run.dungeonLevel}, sala ${run.roomIndex + 1}: evento ${room.event}.`);
  run.status = isCombat ? 'combat' : 'room';
  run.playerTurn = true;
  run.defending = false;
  run.turnScheduler = createTurnScheduler('player');
  if (isCombat) {
    const rarityOffset = room.enemy?.rarity === 'elite' || room.enemy?.rarity === 'uncommon' ? 1 : 0;
    const enemyBaseLevel = room.enemy ? room.enemy.level - rarityOffset : -1;
    if (!room.enemy || enemyBaseLevel !== run.player.level) {
      room.enemy = generateEnemy(run.player.level, room.event === 'boss');
    }
    run.enemy = room.enemy;
    run.enemyIntent = chooseEnemyIntent(room.enemy, run.player);
    beginCombatLog(run, room.enemy.name);
    appendRunLog(run, `Intenção inicial: ${run.enemyIntent}; chance de habilidade ${Math.round(enemyAbilityChance(room.enemy, run.player) * 100)}%.`);
  } else {
    run.enemy = undefined;
    run.enemyIntent = undefined;
  }
  return isCombat ? 'combat' : 'room';
}

export function resolveNonCombatEvent(run: RunState, event: EventType): string | null {
  if (event === 'rest') {
    const hpBefore = run.player.hp;
    const mpBefore = run.player.mp;
    run.player.hp = run.player.maxHp;
    run.player.mp = run.player.maxMp;
    appendRunLog(run, `Descanso: HP ${hpBefore}→${run.player.hp} (+${run.player.hp - hpBefore}); MP ${mpBefore}→${run.player.mp} (+${run.player.mp - mpBefore}).`);
    run.status = 'room';
    return 'O descanso restaura vida e mana.';
  }
  if (event === 'chest') {
    const potion = rollPotionReward();
    appendRunLog(run, `Baú aberto: ${ITEM_CONTENT[potion].name} encontrada.`);
    const receipt = receivePotion(run, potion);
    run.pendingEventNote = potion === XP_POTION_ID ? `${receipt}.` : `Baú: ${receipt}.`;
    run.status = run.pendingLoot ? 'loot-choice' : 'room';
    return run.pendingLoot ? null : run.pendingEventNote;
  }
  run.status = 'room';
  return 'A sala está vazia.';
}

export function grantCombatRewards(run: RunState): boolean {
  if (!run.enemy) return false;
  const defeated = run.enemy;
  const xpReward = RULES.xpByRarity[defeated.rarity];
  addExperience(run, xpReward, `${defeated.name} derrotado`);

  const dropChance = RULES.itemDropChance[defeated.rarity];
  const dropRoll = randomInt(1, 100);
  const dropped = dropRoll <= Math.round(dropChance * 100);
  appendRunLog(run, `Chance de item: ${(dropChance * 100).toFixed(0)}%; rolagem inteira ${dropRoll}/100 — ${dropped ? 'dropou' : 'não dropou'}.`);
  const potion = dropped ? rollPotionReward() : null;
  const potionNote = potion ? receivePotion(run, potion) : null;
  run.pendingEventNote = `Vitória! +${xpReward} XP${potionNote ? ` • ${potionNote}` : ''}`;
  run.pendingCombatRecovery = true;
  run.status = 'room';
  return run.pendingPoints > 0;
}

export function allocatePendingPoint(run: RunState, attribute: Attribute): boolean {
  if (run.pendingPoints < 1 || run.player.stats[attribute] >= statCap(run.player.level, run.classId, attribute)) return false;
  const next = allocatePoint(run.player.stats, run.player.level, run.classId, attribute);
  if (next[attribute] === run.player.stats[attribute]) return false;
  const previousValue = run.player.stats[attribute];
  run.player.stats = next;
  run.pendingPoints -= 1;
  appendRunLog(run, `Ponto distribuído: ${attribute.toUpperCase()} ${previousValue}→${next[attribute]}; restam ${run.pendingPoints}.`);
  if (run.pendingPoints === 0) {
    run.player.maxHp = DERIVED_FORMULAS.maxHp(next, run.player.level);
    run.player.maxMp = DERIVED_FORMULAS.maxMp(next, run.player.level);
    run.pendingEventNote = `Nível ${run.player.level}! ${run.pendingEventNote ?? 'Evento concluído.'}`;
    return true;
  }
  return false;
}

export function choosePendingLoot(run: RunState, replaceSlot?: number): string | null {
  if (!run.pendingLoot) return null;
  const item = run.pendingLoot;
  const itemName = ITEM_CONTENT[item].name;
  if (replaceSlot !== undefined && replaceSlot >= 0 && replaceSlot < run.inventory.length) {
    const replacedItem = run.inventory[replaceSlot];
    run.inventory[replaceSlot] = item;
    appendRunLog(run, replacedItem
      ? `Item obtido: ${itemName}. Espaço ${replaceSlot + 1}: ${ITEM_CONTENT[replacedItem].name} substituído.`
      : `Item obtido: ${itemName} guardado no espaço ${replaceSlot + 1}.`);
  } else {
    appendRunLog(run, `Item descartado: ${itemName}.`);
  }
  let note = run.pendingEventNote ?? 'Item encontrado.';
  note += replaceSlot === undefined ? ' • item descartado' : ' • item substituído';
  run.pendingLoot = undefined;
  run.pendingEventNote = undefined;
  run.status = 'room';
  return note;
}

export function recoverAfterEvent(run: RunState): void {
  const hpBefore = run.player.hp;
  const mpBefore = run.player.mp;
  run.player.hp = Math.min(run.player.maxHp, run.player.hp + Math.floor(run.player.maxHp / 2));
  const mpRecovery = run.player.mp < run.player.maxMp ? Math.max(1, Math.floor(run.player.maxMp / 3)) : 0;
  run.player.mp = Math.min(run.player.maxMp, run.player.mp + mpRecovery);
  appendRunLog(run, `Recuperação pós-combate: HP ${hpBefore}→${run.player.hp} (+${run.player.hp - hpBefore}); MP ${mpBefore}→${run.player.mp} (+${run.player.mp - mpBefore}).`);
}

export function advanceRun(run: RunState): 'next-room' | 'victory' {
  run.roomIndex += 1;
  if (run.roomIndex >= run.rooms.length) {
    if (run.dungeonLevel >= RULES.dungeonLevels) {
      run.status = 'victory';
      return 'victory';
    }
    run.dungeonLevel += 1;
    run.roomIndex = 0;
    run.rooms = generateRoomPlan();
    return 'next-room';
  }
  const room = run.rooms[run.roomIndex];
  if (room && run.roomIndex !== RULES.roomsPerLevel - BOSS_ROOM_INDEX_FROM_END) {
    const inventoryCount = run.inventory.filter((item) => item !== null).length;
    const restAvailable = run.player.hp < run.player.maxHp || run.player.mp < run.player.maxMp;
    room.event = run.roomIndex === 0
      ? 'combat'
      : chooseRoomEvent(randomInt(0, 9999), inventoryCount, restAvailable);
    room.enemy = undefined;
    room.resolved = false;
  }
  return 'next-room';
}
