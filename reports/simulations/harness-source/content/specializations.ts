import type { ClassId } from '../types';
import type { ClassSkillId } from './classSkills';

export type SpecializationId = 'berserker' | 'knight' | 'assassin' | 'alchemist' | 'sorcerer' | 'sage';

export interface SpecializationDefinition {
  id: SpecializationId;
  classId: ClassId;
  name: string;
  description: string;
  passive: string;
  skillId: ClassSkillId;
}

export const SPECIALIZATIONS: Record<SpecializationId, SpecializationDefinition> = {
  berserker: { id: 'berserker', classId: 'warrior', name: 'Berserker',
    description: 'Golpes mais fortes quando a vida está baixa.',
    passive: 'Abaixo de 50% HP: +15% dano físico (escala até +30%).',
    skillId: 'warrior-crushing-blow' },
  knight: { id: 'knight', classId: 'warrior', name: 'Cavaleiro',
    description: 'Especialista em defesa e sobrevivência.',
    passive: 'Abaixo de 50% HP: soma FOR à VIT para resistência.',
    skillId: 'warrior-aegis' },
  assassin: { id: 'assassin', classId: 'rogue', name: 'Assassino',
    description: 'Foca em acertos críticos.',
    passive: 'Chance crítica +5 p.p. (escala até +15 p.p.).',
    skillId: 'rogue-deadly-thrust' },
  alchemist: { id: 'alchemist', classId: 'rogue', name: 'Alquimista',
    description: 'Envenena para causar dano ao longo do tempo.',
    passive: 'Ataques físicos têm 15% de chance de envenenar.',
    skillId: 'rogue-poison-blade' },
  sorcerer: { id: 'sorcerer', classId: 'mage', name: 'Feiticeiro',
    description: 'Amplifica ataques e magias diretas.',
    passive: '+10% dano mágico (escala até +20%).',
    skillId: 'mage-arcane-lance' },
  sage: { id: 'sage', classId: 'mage', name: 'Sábio',
    description: 'Especialista em recuperação gradual.',
    passive: 'Restauração Arcana cura 10% por turno.',
    skillId: 'mage-arcane-restoration' },
};

export const SPECIALIZATIONS_BY_CLASS: Record<ClassId, readonly [SpecializationId, SpecializationId]> = {
  warrior: ['berserker', 'knight'],
  rogue: ['assassin', 'alchemist'],
  mage: ['sorcerer', 'sage'],
};

export function skillRank(level: number): 0 | 1 | 2 | 3 {
  if (level < 5) return 0;
  if (level < 7) return 1;
  if (level < 9) return 2;
  return 3;
}

export function specializationSkill(id?: SpecializationId): ClassSkillId | undefined {
  return id ? SPECIALIZATIONS[id].skillId : undefined;
}
