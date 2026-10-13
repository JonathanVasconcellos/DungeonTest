import type { EnemyIntent } from '../types';

export const ENEMY_SPECIES = ['Goblin', 'Esqueleto', 'Slime'] as const;
export const BOSS_NAME = 'Chefe do Esgoto';

export const ENEMY_ABILITY_CONTENT: Partial<Record<EnemyIntent, { name: string; telegraph: string }>> = {
  'heavy-attack': { name: 'Ataque Pesado', telegraph: 'PREPARA ATAQUE PESADO' },
  'double-attack': { name: 'Ataque Duplo', telegraph: 'PREPARA ATAQUE DUPLO' },
  'fire-arrow': { name: 'Míssil de Fogo', telegraph: 'PREPARA MÍSSIL DE FOGO' },
  'warrior-class-skill': { name: 'Habilidade de classe', telegraph: 'PREPARA GOLPE DE CLASSE' },
  'rogue-class-skill': { name: 'Habilidade de classe', telegraph: 'PREPARA GOLPE DE CLASSE' },
  'mage-class-skill': { name: 'Habilidade de classe', telegraph: 'PREPARA MAGIA DE CLASSE' },
};
