export const HEALING_POTION_ID = 'healing-potion' as const;
export const XP_POTION_ID = 'xp-potion' as const;

export const ITEM_CONTENT = {
  [HEALING_POTION_ID]: { name: 'Poção de Cura', texture: 'item-healing-potion' },
  [XP_POTION_ID]: { name: 'Poção de XP', texture: 'item-xp-potion' },
} as const;

export type ItemId = keyof typeof ITEM_CONTENT;
