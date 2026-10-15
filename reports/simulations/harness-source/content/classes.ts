import type { Attribute, ClassId, Stats } from '../types';

export interface ClassDefinition {
  name: string;
  focusLabel: string;
  primary: Attribute;
  startingStats: Stats;
  weights: Record<Attribute, number>;
}

export const CLASS_DEFINITIONS: Record<ClassId, ClassDefinition> = {
  warrior: {
    name: 'Guerreiro', focusLabel: 'FORça', primary: 'for',
    startingStats: { for: 3, dex: 1, int: 1, vit: 2 },
    weights: { for: 0.55, dex: 0.1, int: 0.05, vit: 0.3 },
  },
  rogue: {
    name: 'Ladino', focusLabel: 'DEStreza', primary: 'dex',
    startingStats: { for: 2, dex: 3, int: 1, vit: 1 },
    weights: { for: 0.15, dex: 0.55, int: 0.05, vit: 0.25 },
  },
  mage: {
    name: 'Mago', focusLabel: 'INTeligência', primary: 'int',
    startingStats: { for: 1, dex: 2, int: 3, vit: 1 },
    weights: { for: 0.05, dex: 0.2, int: 0.6, vit: 0.15 },
  },
};
