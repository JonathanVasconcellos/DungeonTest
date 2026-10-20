import type { ClassId } from '../types';

export type ClassSkillId = 'warrior-crushing-blow' | 'warrior-aegis'
  | 'rogue-deadly-thrust' | 'rogue-poison-blade'
  | 'mage-arcane-lance' | 'mage-arcane-restoration';

export interface ClassSkillDefinition {
  id: ClassSkillId;
  classId: ClassId;
  name: string;
  description: string;
  manaCost: number;
  attackType: 'physical' | 'magical' | 'heavy' | 'double';
  effect?: 'restore-health' | 'aegis' | 'poison';
  healFractionPerTurn?: number;
  healDurationTurns?: number;
  clearsBurning?: boolean;
  multiplier: number;
  hitCount?: number;
  usesMaximumDamage?: boolean;
  guaranteedHit?: boolean;
  canCritical?: boolean;
}

export const CLASS_SKILLS: Record<ClassSkillId, ClassSkillDefinition> = {
  'warrior-crushing-blow': {
    id: 'warrior-crushing-blow', classId: 'warrior', name: 'Golpe Demolidor',
    description: 'Causa dano físico máximo ampliado. Acerta sempre, mas não pode critar.',
    manaCost: 2, attackType: 'heavy', multiplier: 1.5, usesMaximumDamage: true, guaranteedHit: true, canCritical: false,
  },
  'warrior-aegis': {
    id: 'warrior-aegis', classId: 'warrior', name: 'Postura do Baluarte',
    description: 'Reduz o próximo ataque acertado. A redução melhora nos níveis 7 e 9.',
    manaCost: 2, attackType: 'physical', multiplier: 0, effect: 'aegis',
  },
  'rogue-deadly-thrust': {
    id: 'rogue-deadly-thrust', classId: 'rogue', name: 'Estocada Precisa',
    description: 'Causa dano físico máximo ampliado. Acerta sempre, mas não pode critar.',
    manaCost: 2, attackType: 'heavy', multiplier: 1.5, usesMaximumDamage: true, guaranteedHit: true, canCritical: false,
  },
  'rogue-poison-blade': {
    id: 'rogue-poison-blade', classId: 'rogue', name: 'Lâmina Tóxica',
    description: 'Ataca e aplica veneno. Dano e duração melhoram nos níveis 7 e 9.',
    manaCost: 2, attackType: 'physical', multiplier: 1, effect: 'poison',
  },
  'mage-arcane-lance': {
    id: 'mage-arcane-lance', classId: 'mage', name: 'Lança Arcana',
    description: 'Causa dano mágico máximo ampliado. Acerta sempre, mas não pode critar.',
    manaCost: 2, attackType: 'magical', multiplier: 1.5, usesMaximumDamage: true, guaranteedHit: true, canCritical: false,
  },
  'mage-arcane-restoration': {
    id: 'mage-arcane-restoration', classId: 'mage', name: 'Restauração Arcana',
    description: 'Regenera vida no início dos próximos turnos e remove queimadura. A cura melhora nos níveis 7 e 9.',
    manaCost: 3, attackType: 'magical', multiplier: 0, effect: 'restore-health',
    healFractionPerTurn: 0.1, healDurationTurns: 3, clearsBurning: true,
  },
};
