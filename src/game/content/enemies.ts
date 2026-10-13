import type { EnemyIntent } from '../types';

export const ENEMY_SPECIES = ['Goblin', 'Esqueleto', 'Slime'] as const;
export const BOSS_NAME = 'Chefe do Esgoto';

export const ENEMY_ABILITY_CONTENT: Partial<Record<EnemyIntent, { name: string; telegraph: string }>> = {
  'heavy-attack': { name: 'Ataque Pesado', telegraph: 'Reúne força' },
  'double-attack': { name: 'Ataque Duplo', telegraph: 'Prepara dois golpes' },
  'fire-arrow': { name: 'Míssil de Fogo', telegraph: 'Conjura fogo' },
  'warrior-class-skill': { name: 'Habilidade de classe', telegraph: 'Prepara golpe bruto' },
  'rogue-class-skill': { name: 'Habilidade de classe', telegraph: 'Prepara golpe veloz' },
  'mage-class-skill': { name: 'Habilidade de classe', telegraph: 'Conjura magia' },
};
