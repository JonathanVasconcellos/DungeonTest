import { RULES } from './config';
import type { Entity } from '../types';
import type { ItemId } from '../content/items';

export type { ItemId } from '../content/items';
export type Inventory = Array<ItemId | null>;

export function emptyInventory(): Inventory { return Array.from({ length: RULES.inventorySlots }, () => null); }

export function useHealingPotion(player: Entity): Entity {
  const healing = Math.floor(player.maxHp * RULES.healingPotionFraction);
  return { ...player, hp: Math.min(player.maxHp, player.hp + healing) };
}
