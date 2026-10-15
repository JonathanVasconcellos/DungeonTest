import Phaser from 'phaser';
import type { Entity } from '../../game/types';
import type { ClassSkillId } from '../../game/content/classSkills';
import povWarriorSword from '../../assets/pov-warrior-sword.png';
import povRogueDagger from '../../assets/pov-rogue-dagger.png';
import povMageWand from '../../assets/pov-mage-wand.png';
import povMageGrimoire from '../../assets/pov-mage-grimoire.png';
import povDefenseShield from '../../assets/pov-defense-shield.png';
import enemyGoblin from '../../assets/enemy-goblin.png';
import enemySkeleton from '../../assets/enemy-skeleton.png';
import enemySlime from '../../assets/enemy-slime.png';
import enemyBoss from '../../assets/enemy-boss.png';
import enemyGoblinWarrior from '../../assets/enemy-goblin-warrior.png';
import enemyGoblinRogue from '../../assets/enemy-goblin-rogue.png';
import enemyGoblinMage from '../../assets/enemy-goblin-mage.png';
import enemySkeletonWarrior from '../../assets/enemy-skeleton-warrior.png';
import enemySkeletonRogue from '../../assets/enemy-skeleton-rogue.png';
import enemySkeletonMage from '../../assets/enemy-skeleton-mage.png';
import enemySlimeWarrior from '../../assets/enemy-slime-warrior.png';
import enemySlimeRogue from '../../assets/enemy-slime-rogue.png';
import enemySlimeMage from '../../assets/enemy-slime-mage.png';
import enemyBossWarrior from '../../assets/enemy-boss-warrior.png';
import enemyBossRogue from '../../assets/enemy-boss-rogue.png';
import enemyBossMage from '../../assets/enemy-boss-mage.png';
import mutantGoblinWarrior from '../../assets/mutant-goblin-warrior.png';
import mutantGoblinRogue from '../../assets/mutant-goblin-rogue.png';
import mutantGoblinMage from '../../assets/mutant-goblin-mage.png';
import mutantSlimeWarrior from '../../assets/mutant-slime-warrior.png';
import mutantSlimeRogue from '../../assets/mutant-slime-rogue.png';
import mutantSlimeMage from '../../assets/mutant-slime-mage.png';
import mutantSkeletonWarrior from '../../assets/mutant-skeleton-warrior.png';
import mutantSkeletonRogue from '../../assets/mutant-skeleton-rogue.png';
import mutantSkeletonMage from '../../assets/mutant-skeleton-mage.png';
import healingPotionIcon from '../../assets/item-healing-potion.png';
import xpPotionIcon from '../../assets/item-xp-potion.png';
import fireArrowIcon from '../../assets/spell-fire-arrow.png';
import sewerBackground from '../../assets/dungeon-corridor-perspective.png';
import treasureChest from '../../assets/event-treasure-chest.png';
import restBonfire from '../../assets/event-rest-bonfire.png';
import roomForwardArrow from '../../assets/room-forward-arrow.png';
import warriorCrushingBlowIcon from '../../assets/skill-warrior-crushing-blow.png';
import warriorAegisIcon from '../../assets/skill-warrior-aegis.png';
import rogueDeadlyThrustIcon from '../../assets/skill-rogue-deadly-thrust.png';
import roguePoisonBladeIcon from '../../assets/skill-rogue-poison-blade.png';
import mageArcaneLanceIcon from '../../assets/skill-mage-arcane-lance.png';
import mageArcaneRestorationIcon from '../../assets/skill-mage-arcane-restoration.png';
import statusBurningIcon from '../../assets/status/status-burning.png';
import statusPoisonedIcon from '../../assets/status/status-poisoned.png';
import statusHealingOverTimeIcon from '../../assets/status/status-healing-over-time.png';
import statusMagicShieldIcon from '../../assets/status/status-magic-shield.png';
import statusPhysicalDefenseIcon from '../../assets/status/status-physical-defense.png';

const ENEMY_VARIANT_URLS: Record<string, string> = {
  'enemy-goblin-warrior': enemyGoblinWarrior,
  'enemy-goblin-rogue': enemyGoblinRogue,
  'enemy-goblin-mage': enemyGoblinMage,
  'enemy-skeleton-warrior': enemySkeletonWarrior,
  'enemy-skeleton-rogue': enemySkeletonRogue,
  'enemy-skeleton-mage': enemySkeletonMage,
  'enemy-slime-warrior': enemySlimeWarrior,
  'enemy-slime-rogue': enemySlimeRogue,
  'enemy-slime-mage': enemySlimeMage,
  'enemy-boss-warrior': enemyBossWarrior,
  'enemy-boss-rogue': enemyBossRogue,
  'enemy-boss-mage': enemyBossMage,
  'enemy-mutant-goblin-warrior': mutantGoblinWarrior,
  'enemy-mutant-goblin-rogue': mutantGoblinRogue,
  'enemy-mutant-goblin-mage': mutantGoblinMage,
  'enemy-mutant-slime-warrior': mutantSlimeWarrior,
  'enemy-mutant-slime-rogue': mutantSlimeRogue,
  'enemy-mutant-slime-mage': mutantSlimeMage,
  'enemy-mutant-skeleton-warrior': mutantSkeletonWarrior,
  'enemy-mutant-skeleton-rogue': mutantSkeletonRogue,
  'enemy-mutant-skeleton-mage': mutantSkeletonMage,
};

export const CLASS_SKILL_TEXTURES: Record<ClassSkillId, string> = {
  'warrior-crushing-blow': 'skill-warrior-crushing-blow',
  'warrior-aegis': 'skill-warrior-aegis',
  'rogue-deadly-thrust': 'skill-rogue-deadly-thrust',
  'rogue-poison-blade': 'skill-rogue-poison-blade',
  'mage-arcane-lance': 'skill-mage-arcane-lance',
  'mage-arcane-restoration': 'skill-mage-arcane-restoration',
};

export const STATUS_TEXTURES = {
  burning: 'status-burning',
  poisoned: 'status-poisoned',
  healingOverTime: 'status-healing-over-time',
  magicShield: 'status-magic-shield',
  physicalDefense: 'status-physical-defense',
} as const;

const pendingEnemyLoads = new WeakMap<Phaser.Scene, Map<string, Promise<void>>>();

export function enemyTextureKey(enemy: Entity, isBoss: boolean): string {
  const species = isBoss ? 'boss'
    : enemy.name.includes('Esqueleto') ? 'skeleton'
    : enemy.name.includes('Slime') ? 'slime' : 'goblin';
  const enemyClass = enemy.classId ?? 'warrior';
  return enemy.mutated && !isBoss
    ? `enemy-mutant-${species}-${enemyClass}`
    : `enemy-${species}-${enemyClass}`;
}

/** Load one selected enemy variant on first use; Phaser retains it in its texture cache. */
export function loadEnemyVariant(scene: Phaser.Scene, key: string): Promise<void> {
  if (scene.textures.exists(key)) return Promise.resolve();

  const url = ENEMY_VARIANT_URLS[key];
  if (!url) return Promise.reject(new Error(`Textura de inimigo desconhecida: ${key}`));

  let sceneLoads = pendingEnemyLoads.get(scene);
  if (!sceneLoads) {
    sceneLoads = new Map<string, Promise<void>>();
    pendingEnemyLoads.set(scene, sceneLoads);
  }
  const pending = sceneLoads.get(key);
  if (pending) return pending;

  const load = new Promise<void>((resolve, reject) => {
    const completeEvent = `${Phaser.Loader.Events.FILE_KEY_COMPLETE}-image-${key}`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onComplete = (): void => {
      cleanup();
      resolve();
    };
    const onLoaderComplete = (): void => {
      cleanup();
      if (scene.textures.exists(key)) resolve();
      else reject(new Error(`Textura de inimigo não foi registrada: ${key}`));
    };
    const onError = (file: Phaser.Loader.File): void => {
      if (file.key !== key) return;
      cleanup();
      reject(new Error(`Falha ao carregar textura de inimigo: ${key}`));
    };
    const cleanup = (): void => {
      if (timeout !== undefined) clearTimeout(timeout);
      scene.load.off(completeEvent, onComplete);
      scene.load.off(Phaser.Loader.Events.COMPLETE, onLoaderComplete);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    };

    scene.load.once(completeEvent, onComplete);
    scene.load.once(Phaser.Loader.Events.COMPLETE, onLoaderComplete);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.load.image(key, url);
    // Never leave the scene on a loading screen if the browser fails to emit a loader event.
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Tempo esgotado ao carregar textura de inimigo: ${key}`));
    }, 5000);
    scene.load.start();
  });

  sceneLoads.set(key, load);
  void load.catch(() => sceneLoads?.delete(key));
  return load;
}

export function loadGameAssets(scene: Phaser.Scene): void {
  scene.load.image('pov-warrior-sword', povWarriorSword);
  scene.load.image('pov-rogue-dagger', povRogueDagger);
  scene.load.image('pov-mage-wand', povMageWand);
  scene.load.image('pov-mage-grimoire', povMageGrimoire);
  scene.load.image('pov-defense-shield', povDefenseShield);
  scene.load.image('enemy-goblin', enemyGoblin);
  scene.load.image('enemy-skeleton', enemySkeleton);
  scene.load.image('enemy-slime', enemySlime);
  scene.load.image('enemy-boss', enemyBoss);
  scene.load.image('item-healing-potion', healingPotionIcon);
  scene.load.image('item-xp-potion', xpPotionIcon);
  scene.load.image('spell-fire-arrow', fireArrowIcon);
  scene.load.image('sewer-background', sewerBackground);
  scene.load.image('event-treasure-chest', treasureChest);
  scene.load.image('event-rest-bonfire', restBonfire);
  scene.load.image('room-forward-arrow', roomForwardArrow);
  scene.load.image('skill-warrior-crushing-blow', warriorCrushingBlowIcon);
  scene.load.image('skill-warrior-aegis', warriorAegisIcon);
  scene.load.image('skill-rogue-deadly-thrust', rogueDeadlyThrustIcon);
  scene.load.image('skill-rogue-poison-blade', roguePoisonBladeIcon);
  scene.load.image('skill-mage-arcane-lance', mageArcaneLanceIcon);
  scene.load.image('skill-mage-arcane-restoration', mageArcaneRestorationIcon);
  scene.load.image(STATUS_TEXTURES.burning, statusBurningIcon);
  scene.load.image(STATUS_TEXTURES.poisoned, statusPoisonedIcon);
  scene.load.image(STATUS_TEXTURES.healingOverTime, statusHealingOverTimeIcon);
  scene.load.image(STATUS_TEXTURES.magicShield, statusMagicShieldIcon);
  scene.load.image(STATUS_TEXTURES.physicalDefense, statusPhysicalDefenseIcon);
}
