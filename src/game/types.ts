import type { ItemId } from './content/items';
import type { ClassSkillId } from './content/classSkills';
import type { SpecializationId } from './content/specializations';

export type Attribute = 'for' | 'dex' | 'int' | 'vit';
export type ClassId = 'warrior' | 'rogue' | 'mage';
export type Rarity = 'normal' | 'uncommon' | 'elite';
export type EventType = 'combat' | 'empty' | 'rest' | 'chest' | 'boss';
export type RunStatus = 'menu' | 'room' | 'combat' | 'level-up' | 'loot-choice' | 'game-over' | 'victory';
export type EnemyIntent = 'basic-attack' | 'heavy-attack' | 'double-attack' | 'fire-arrow'
  | 'warrior-class-skill' | 'rogue-class-skill' | 'mage-class-skill';
export type RunLogCategory = 'system' | 'combat-start' | 'player-action' | 'enemy-action' | 'damage'
  | 'dodge' | 'defense' | 'turn-extra' | 'effect' | 'reward' | 'combat-end' | 'room';

export interface RunLogSnapshot {
  playerHp: number; playerMaxHp: number; playerMp: number; playerMaxMp: number;
  enemyName?: string; enemyHp?: number; enemyMaxHp?: number; enemyMp?: number; enemyMaxMp?: number;
  playerSpeed?: number; enemySpeed?: number;
  playerExtraPending?: boolean; enemyExtraPending?: boolean;
  playerBurningTurns?: number; enemyBurningTurns?: number; playerMagicShield?: boolean; enemyMagicShield?: boolean;
  playerHealingTurns?: number; enemyHealingTurns?: number;
  defending?: boolean; enemyIntent?: EnemyIntent;
}
export interface RunLogEntry {
  timestamp: string; combatId?: number; turn?: number; category: RunLogCategory; text: string;
  before?: RunLogSnapshot; after: RunLogSnapshot;
}

export interface Stats { for: number; dex: number; int: number; vit: number }
export interface BurningStatus { turnsRemaining: number; damagePerTick: number }
export interface HealingOverTimeStatus { turnsRemaining: number; amountPerTick: number }
export interface PoisonStatus { turnsRemaining: number; damagePerTick: number }
export type TurnActor = 'player' | 'enemy';
export interface TurnSchedulerState {
  playerSpeed: number; enemySpeed: number;
  playerExtraPending: boolean; enemyExtraPending: boolean;
  playerExtraEligible: boolean; enemyExtraEligible: boolean;
  nextNormalActor: TurnActor; activeExtra?: TurnActor; tieBreakNext: TurnActor;
  simultaneousPending: boolean; extraQueue: TurnActor[];
}
export interface Entity {
  name: string; level: number; rarity: Rarity; classId?: ClassId; stats: Stats;
  hp: number; maxHp: number; mp: number; maxMp: number; mutated: boolean;
  classSkill?: ClassSkillId;
  specialization?: SpecializationId;
  burning?: BurningStatus;
  poisoned?: PoisonStatus;
  healingOverTime?: HealingOverTimeStatus;
  magicShield?: boolean;
  magicShieldReduction?: number;
}
export interface RoomPlan {
  event: EventType; enemy?: Entity; resolved?: boolean; completionAcknowledged?: boolean; completionNote?: string;
}
export interface RunState {
  classId: ClassId; player: Entity; dungeonLevel: number; roomIndex: number;
  rooms: RoomPlan[]; status: RunStatus; xp: number; pendingPoints: number;
  inventory: Array<ItemId | null>; enemy?: Entity; playerTurn: boolean; combatLog?: RunLogEntry[];
  combatId?: number; combatTurn?: number; combatStats?: CombatLogStats;
  defending?: boolean; pendingLoot?: ItemId; pendingEventNote?: string;
  pendingCombatRecovery?: boolean;
  pendingSpecializationSelection?: boolean;
  enemyIntent?: EnemyIntent;
  enemyActionInterrupted?: boolean; enemyInterruptedIntent?: EnemyIntent;
  turnScheduler?: TurnSchedulerState;
}

export interface CombatLogStats {
  actions: number; playerDamage: number; enemyDamage: number; hits: number; misses: number;
  criticals: number; abilities: number; manaSpent: number; manaRecovered: number; effectsApplied: number;
}
