import type { ItemId } from './content/items';
import type { ClassSkillId } from './content/classSkills';
import type { SpecializationId } from './content/specializations';

export type Attribute = 'for' | 'dex' | 'int' | 'vit';
export type ClassId = 'warrior' | 'rogue' | 'mage';
export type Rarity = 'normal' | 'uncommon' | 'elite';
/** Stable identity for enemy archetypes; independent from the localized display name. */
export type EnemySpeciesId = 'goblin' | 'skeleton' | 'slime' | 'doll' | 'doppelganger' | 'ghost'
  | 'sorceress' | 'mermaid' | 'ratkin_group' | 'succubus' | 'valkyrie' | 'doom2' | 'sewer_boss';
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
  playerPoisonedTurns?: number; enemyPoisonedTurns?: number;
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
  name: string; level: number; rarity: Rarity; classId?: ClassId; speciesId?: EnemySpeciesId; stats: Stats;
  hp: number; maxHp: number; mp: number; maxMp: number; mutated: boolean;
  classSkill?: ClassSkillId;
  /** Whether the enemy used an ability on its previous turn. */
  abilityUsedLastTurn?: boolean;
  specialization?: SpecializationId;
  burning?: BurningStatus;
  poisoned?: PoisonStatus;
  healingOverTime?: HealingOverTimeStatus;
  /** Next successful basic physical hit ignores passive resistance only. */
  guardBroken?: boolean;
  magicShield?: boolean;
  magicShieldReduction?: number;
  magicShieldHitsRemaining?: number;
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
