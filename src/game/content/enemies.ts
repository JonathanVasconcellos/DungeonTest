import type { ClassId, EnemySpeciesId, EnemyIntent, Rarity } from '../types';

export interface EnemySpeciesDefinition {
  id: EnemySpeciesId;
  name: string;
  classId?: ClassId;
  rarity: Rarity;
}

export const NORMAL_ENEMY_SPECIES: readonly EnemySpeciesDefinition[] = [
  { id: 'goblin', name: 'Goblin', rarity: 'normal' },
  { id: 'skeleton', name: 'Esqueleto', rarity: 'normal' },
  { id: 'slime', name: 'Slime', rarity: 'normal' },
];

export const UNCOMMON_ENEMY_SPECIES: readonly EnemySpeciesDefinition[] = [
  { id: 'doll', name: 'Boneca', classId: 'warrior', rarity: 'uncommon' },
  { id: 'doppelganger', name: 'Doppelganger', classId: 'warrior', rarity: 'uncommon' },
  { id: 'ghost', name: 'Fantasma', classId: 'mage', rarity: 'uncommon' },
  { id: 'sorceress', name: 'Feiticeira', classId: 'mage', rarity: 'uncommon' },
  { id: 'mermaid', name: 'Sereia', classId: 'warrior', rarity: 'uncommon' },
  { id: 'ratkin_group', name: 'Ratinha - Grupo', classId: 'rogue', rarity: 'uncommon' },
];

export const ELITE_ENEMY_SPECIES: readonly EnemySpeciesDefinition[] = [
  { id: 'succubus', name: 'Succubus', classId: 'mage', rarity: 'elite' },
  { id: 'valkyrie', name: 'Valquíria', classId: 'warrior', rarity: 'elite' },
  { id: 'doom2', name: 'Doom 2', classId: 'rogue', rarity: 'elite' },
];

/** The sewer boss is kept out of rarity pools to preserve the existing boss encounter. */
export const SEWER_BOSS: EnemySpeciesDefinition = {
  id: 'sewer_boss', name: 'Chefe do Esgoto', classId: 'warrior', rarity: 'elite',
};

/** Doom 2 is an easter egg: 1% of elite selections; other elites split the remaining 99%. */
export const DOOM2_ELITE_WEIGHT_PER_1000 = 10;

export const ENEMY_ABILITY_CONTENT: Partial<Record<EnemyIntent, { name: string; telegraph: string }>> = {
  'heavy-attack': { name: 'Ataque Pesado', telegraph: 'Reúne força' },
  'double-attack': { name: 'Ataque Duplo', telegraph: 'Prepara dois golpes' },
  'fire-arrow': { name: 'Míssil de Fogo', telegraph: 'Conjura fogo' },
  'warrior-class-skill': { name: 'Habilidade de classe', telegraph: 'Prepara golpe bruto' },
  'rogue-class-skill': { name: 'Habilidade de classe', telegraph: 'Prepara golpe veloz' },
  'mage-class-skill': { name: 'Habilidade de classe', telegraph: 'Conjura magia' },
};
