import Phaser from 'phaser';
import { ATTRIBUTE_LABELS, ATTRIBUTES } from '../../../game/rules/attributes';
import { DERIVED_FORMULAS, RULES } from '../../../game/rules/config';
import { CLASS_DEFINITIONS } from '../../../game/content/classes';
import { CLASS_SKILLS } from '../../../game/content/classSkills';
import { ENEMY_ABILITY_CONTENT } from '../../../game/content/enemies';
import { HEALING_POTION_ID, ITEM_CONTENT } from '../../../game/content/items';
import { SPELL_CONTENT } from '../../../game/content/spells';
import type { CombatVisualCue } from '../../../game/combat/CombatSystem';
import { canUseClassSkillSupport, classSkillIsSupport } from '../../../game/combat/ClassSkillSystem';
import { criticalChance, defenseValue, effectiveVitality, formatMana } from '../../../game/rules/combat';
import { SPECIALIZATIONS } from '../../../game/content/specializations';
import type { ClassId, EnemyIntent, Entity, RunState } from '../../../game/types';
import { CLASS_SKILL_TEXTURES, enemyTextureKey, STATUS_TEXTURES } from '../GameAssets';
import { addButton, addPanel, addText, drawBar, drawSewerBackground, showManpu, PALETTE as C, VIEWPORT } from '../SceneUi';

export type CombatAnimation = 'player-attack' | 'heavy-attack' | 'double-attack' | 'fire' | 'enemy-attack' | 'defend' | 'none'
  | 'heavy-prepare' | 'double-prepare' | 'fire-prepare' | 'enemy-dodge' | 'player-dodge';

export interface CombatScreenActions {
  isBusy: () => boolean;
  onAttack: () => void;
  onMagic: () => void;
  onAbility: () => void;
  onDefend: () => void;
  onUsePotion: (slot: number) => void;
  onShowInfo: (entity: Entity, title: string) => void;
  onShowLog: () => void;
}

interface StatusHudEntry {
  texture: string;
  label: string;
}

function drawStatusHud(scene: Phaser.Scene, entries: StatusHudEntry[], y: number, depth: number, fontSize: number): void {
  if (!entries.length) return;
  const widths = entries.map((entry) => 20 + Math.max(24, entry.label.length * (fontSize * 0.58)));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + (entries.length - 1) * 5;
  let x = (VIEWPORT.width - totalWidth) / 2;
  entries.forEach((entry, index) => {
    scene.add.image(x + 8, y + 8, entry.texture).setDisplaySize(16, 16).setDepth(depth);
    scene.add.text(x + 19, y + 2, entry.label, {
      fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`, color: C.paper,
      stroke: '#11100d', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(depth);
    x += widths[index]! + 5;
  });
}

export function animationForIntent(intent?: EnemyIntent): CombatAnimation {
  if (intent === 'heavy-attack') return 'heavy-prepare';
  if (intent === 'double-attack') return 'double-prepare';
  if (intent === 'fire-arrow') return 'fire-prepare';
  if (intent === 'warrior-class-skill') return 'heavy-prepare';
  if (intent === 'rogue-class-skill') return 'double-prepare';
  if (intent === 'mage-class-skill') return 'fire-prepare';
  return 'none';
}

export function renderCombatScreen(
  scene: Phaser.Scene,
  run: RunState,
  busy: boolean,
  actions: CombatScreenActions,
  animation: CombatAnimation = 'none',
  visual?: CombatVisualCue,
): void {
  if (!run.enemy) return;
  drawSewerBackground(scene);
  addText(scene, 96, 29, `ANDAR ${run.dungeonLevel}`, 12, C.paper);
  addButton(scene, actions.isBusy, 377, 36, 38, 30, 'LOG', actions.onShowLog, '#29251d', 15);

  const enemy = run.enemy;
  addText(scene, 263, 29, `SALA ${run.roomIndex + 1}/${RULES.roomsPerLevel}`, 12, C.paper);
  addText(scene, VIEWPORT.width / 2, 57, `${enemy.name}  Nv ${enemy.level}`, 13);
  drawBar(scene, 95, 84, 230, 15, enemy.hp / enemy.maxHp, C.red, `HP ${enemy.hp}/${enemy.maxHp}`);
  addText(scene, VIEWPORT.width / 2, 105, `MANA ${formatMana(enemy.mp)}/${formatMana(enemy.maxMp)}`, 10, C.blue);
  const enemyStatuses: StatusHudEntry[] = [
    ...(enemy.burning ? [{ texture: STATUS_TEXTURES.burning, label: `FOGO ${enemy.burning.turnsRemaining}` }] : []),
    ...(enemy.poisoned ? [{ texture: STATUS_TEXTURES.poisoned, label: `VENENO ${enemy.poisoned.turnsRemaining}` }] : []),
    ...(enemy.healingOverTime ? [{ texture: STATUS_TEXTURES.healingOverTime, label: `CURA ${enemy.healingOverTime.turnsRemaining}` }] : []),
    ...(enemy.magicShield ? [{ texture: STATUS_TEXTURES.magicShield, label: 'ESCUDO' }] : []),
  ];
  drawStatusHud(scene, enemyStatuses, 126, 13, 10);
  const intentLabels = ENEMY_ABILITY_CONTENT;
  if (run.playerTurn && run.enemyIntent && intentLabels[run.enemyIntent]) {
    const skillTelegraph = run.enemyIntent.endsWith('-class-skill') && enemy.classSkill
      ? `PREPARA ${CLASS_SKILLS[enemy.classSkill].name.toUpperCase()}` : intentLabels[run.enemyIntent]!.telegraph;
    addText(scene, VIEWPORT.width / 2, enemyStatuses.length ? 151 : 145, skillTelegraph, 10,
      run.enemyIntent === 'fire-arrow' ? '#ff6358' : '#e4c780');
  }
  if (enemy.burning) {
    const flameAura = scene.add.ellipse(VIEWPORT.width / 2, 307, 122, 222, 0xff6b22, 0.1)
      .setStrokeStyle(2, 0xff9138, 0.6).setDepth(2);
    scene.tweens.add({ targets: flameAura, alpha: 0.24, scaleX: 1.06, scaleY: 1.03, duration: 420, yoyo: true, repeat: -1 });
  }

  const isBoss = run.rooms[run.roomIndex]?.event === 'boss';
  const selectedEnemyTexture = enemyTextureKey(enemy, isBoss);
  const fallbackEnemyTexture = isBoss ? 'enemy-boss'
    : enemy.name.includes('Esqueleto') ? 'enemy-skeleton'
    : enemy.name.includes('Slime') ? 'enemy-slime' : 'enemy-goblin';
  const enemyTexture = scene.textures.exists(selectedEnemyTexture) ? selectedEnemyTexture : fallbackEnemyTexture;
  const enemyWidth = isBoss ? 205 : 154;
  const enemyHeight = isBoss ? 252 : 205;
  const enemySprite = scene.add.image(VIEWPORT.width / 2, 320, enemyTexture).setDepth(3);
  const rarityScale = enemy.rarity === 'elite' ? 1.2 : 1;
  const fitScale = Math.min(enemyWidth / enemySprite.width, enemyHeight / enemySprite.height) * rarityScale;
  enemySprite.setScale(fitScale);
  enemySprite.setData('baseTint', null);
  if (enemy.rarity === 'uncommon') {
    ensureLightParticleTexture(scene);
    scene.add.particles(VIEWPORT.width / 2, 320, 'uncommon-light-particle', {
      lifespan: { min: 360, max: 760 },
      frequency: 105,
      quantity: 1,
      maxParticles: 8,
      emitZone: { type: 'random', source: { getRandomPoint: (point) => {
        point.x = Phaser.Math.Between(-enemySprite.displayWidth * 0.34, enemySprite.displayWidth * 0.34);
        point.y = Phaser.Math.Between(-enemySprite.displayHeight * 0.36, enemySprite.displayHeight * 0.32);
      } } },
      speedX: { min: -24, max: 24 },
      speedY: { min: -58, max: -20 },
      scale: { start: 0.38, end: 0.05 },
      alpha: { start: 0.92, end: 0 },
      tint: [0x91caff, 0xd7edff, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(4);
  }
  enemySprite.setInteractive(scene.input.makePixelPerfect(1))
    .on('pointerdown', () => { if (!actions.isBusy()) actions.onShowInfo(enemy, 'INIMIGO'); });

  const player = run.player;
  const playerTexture: Record<ClassId, string> = {
    warrior: 'pov-warrior-sword', rogue: 'pov-rogue-dagger', mage: 'pov-mage-wand',
  };
  const weaponPositionX: Record<ClassId, number> = { warrior: 300, rogue: 265, mage: 220 };
  const weaponSprite = scene.add.image(weaponPositionX[run.classId], 460, playerTexture[run.classId])
    .setDisplaySize(440, 440).setDepth(5);
  weaponSprite.setInteractive(scene.input.makePixelPerfect(1))
    .on('pointerdown', () => { if (!actions.isBusy()) actions.onShowInfo(player, 'JOGADOR'); });
  const leftPropTexture = run.classId === 'mage' ? 'pov-mage-grimoire' : 'pov-defense-shield';
  const leftPropSprite = scene.add.image(52, 566, leftPropTexture).setDisplaySize(194, 194).setDepth(7);

  const playerTitle = addText(scene, VIEWPORT.width / 2, 462,
    `${player.name} Nv ${player.level} • XP ${run.xp}/${RULES.xpToNextLevel(player.level)}`, 10, C.paper);
  playerTitle.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => { if (!actions.isBusy()) actions.onShowInfo(player, 'JOGADOR'); });

  run.inventory.forEach((item, slot) => {
    const x = 168 + slot * 42;
    scene.add.circle(x, 518, 18, 0x171713).setStrokeStyle(2, 0x9d8a61).setDepth(9);
    if (!item) return;
    const itemSprite = scene.add.image(x, 518, ITEM_CONTENT[item].texture).setDisplaySize(29, 29).setDepth(11);
    if (item === HEALING_POTION_ID && player.hp < player.maxHp) {
      itemSprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (!actions.isBusy()) actions.onUsePotion(slot);
      });
    }
  });

  drawBar(scene, 139, 568, 142, 19, player.hp / player.maxHp, C.green, `VIDA ${player.hp}/${player.maxHp}`, 10);
  drawBar(scene, 139, 601, 142, 19, player.mp / Math.max(1, player.maxMp), C.blue,
    `MANA ${formatMana(player.mp)}/${formatMana(player.maxMp)}`, 10);
  const playerStatuses: StatusHudEntry[] = [
    ...(player.burning ? [{ texture: STATUS_TEXTURES.burning, label: `FOGO ${player.burning.turnsRemaining}` }] : []),
    ...(player.poisoned ? [{ texture: STATUS_TEXTURES.poisoned, label: `VENENO ${player.poisoned.turnsRemaining}` }] : []),
    ...(player.healingOverTime ? [{ texture: STATUS_TEXTURES.healingOverTime, label: `CURA ${player.healingOverTime.turnsRemaining}` }] : []),
    ...(player.magicShield ? [{ texture: STATUS_TEXTURES.magicShield, label: 'MÁG.' }] : []),
    ...(run.defending ? [{ texture: STATUS_TEXTURES.physicalDefense, label: 'DEF.' }] : []),
  ];
  drawStatusHud(scene, playerStatuses, 622, 10, 10);
  const extraActor = run.turnScheduler?.activeExtra;
  const turnStatus = extraActor === 'player' ? 'TURNO EXTRA DO JOGADOR'
    : extraActor === 'enemy' ? 'TURNO EXTRA DO INIMIGO'
    : busy ? 'O inimigo prepara-se…' : run.playerTurn ? 'Seu turno' : 'Turno do inimigo…';
  addText(scene, VIEWPORT.width / 2, 650, turnStatus, 9, C.muted);

  const leftAction = run.classId === 'mage'
    ? { label: 'MAGIA', action: actions.onMagic }
    : { label: 'DEFENDER', action: actions.onDefend };
  addButton(scene, actions.isBusy, 72, 710, 112, 42, leftAction.label, leftAction.action, '#29251d', 12);
  if (run.classId !== 'mage') {
    const skillCost = run.classId === 'warrior' ? RULES.heavyAttackManaCost : RULES.doubleAttackManaCost;
    addButton(scene, actions.isBusy, VIEWPORT.width / 2, 710, 112, 42, 'HABILIDADE', actions.onAbility,
      '#29251d', 12, false, run.player.mp >= skillCost);
  }
  addButton(scene, actions.isBusy, 348, 710, 112, 42, 'ATACAR', actions.onAttack, '#29251d', 12);

  const visibleAnimation = animation === 'none' && run.playerTurn ? animationForIntent(run.enemyIntent) : animation;
  if (visibleAnimation !== 'none' || visual) {
    const animationToPlay = visual?.kind === 'interrupted' ? 'enemy-dodge'
      : visibleAnimation !== 'none' ? visibleAnimation
      : visual?.kind === 'dodge' ? visual.target === 'enemy' ? 'enemy-dodge' : 'player-dodge'
      : visual?.target === 'player' ? 'enemy-attack' : 'player-attack';
    animateCombat(scene, weaponSprite, enemySprite, leftPropSprite, animationToPlay, visual);
  }
  const startIdleMotion = (): void => {
    if (!scene.sys.isActive() || !enemySprite.active || !weaponSprite.active || !leftPropSprite.active) return;
    scene.tweens.add({ targets: enemySprite, y: enemySprite.y - 4, duration: 980,
      yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: weaponSprite, y: weaponSprite.y - 3, angle: weaponSprite.angle + 1.2,
      duration: 1150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: leftPropSprite, y: leftPropSprite.y - 2, duration: 1200,
      yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  };
  const screenIsTerminal = run.status === 'game-over' || run.status === 'room'
    || run.status === 'level-up' || run.status === 'loot-choice' || run.status === 'victory';
  if (!screenIsTerminal) {
    if (visibleAnimation === 'none' && !visual) startIdleMotion();
    else if (visual) scene.time.delayedCall(900, startIdleMotion);
  }
}

function ensureLightParticleTexture(scene: Phaser.Scene): void {
  const key = 'uncommon-light-particle';
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0xffffff, 0.12).fillCircle(8, 8, 8);
  graphics.fillStyle(0xffffff, 0.22).fillCircle(8, 8, 5);
  graphics.fillStyle(0xffffff, 0.75).fillCircle(8, 8, 2);
  graphics.generateTexture(key, 16, 16);
  graphics.destroy();
}

function restoreEnemyAppearance(enemy: Phaser.GameObjects.Image): void {
  const baseTint: unknown = enemy.getData('baseTint');
  if (typeof baseTint === 'number') enemy.setTint(baseTint);
  else enemy.clearTint();
  enemy.setAlpha(1);
}

function animateCombat(
  scene: Phaser.Scene,
  weapon: Phaser.GameObjects.Image,
  enemy: Phaser.GameObjects.Image,
  leftProp: Phaser.GameObjects.Image,
  animation: Exclude<CombatAnimation, 'none'>,
  visual?: CombatVisualCue,
): void {
  if (visual) showCombatVisual(scene, enemy, visual);
  if (animation === 'player-attack') {
    showManpu(scene, enemy.x - 2, enemy.y - 76, 'swing');
    scene.tweens.add({ targets: weapon, x: weapon.x - 34, y: weapon.y - 18, angle: 5,
      duration: 120, yoyo: true, ease: 'Sine.InOut' });
    enemy.setTint(0xffdca0);
    scene.tweens.add({ targets: enemy, alpha: 0.5, duration: 70, yoyo: true, repeat: 1,
      onComplete: () => { if (enemy.active) restoreEnemyAppearance(enemy); },
    });
  } else if (animation === 'heavy-attack') {
    showManpu(scene, enemy.x + enemy.displayWidth * 0.36, enemy.y - 38, 'impact');
    scene.tweens.add({ targets: weapon, x: weapon.x - 42, y: weapon.y - 44, angle: 9,
      duration: 210, yoyo: true, ease: 'Cubic.Out' });
    enemy.setTint(0xffd28b);
    scene.tweens.add({ targets: enemy, alpha: 0.45, duration: 80, yoyo: true, repeat: 2,
      onComplete: () => { if (enemy.active) restoreEnemyAppearance(enemy); },
    });
    scene.cameras.main.shake(150, 0.004);
  } else if (animation === 'double-attack') {
    showManpu(scene, enemy.x + 1, enemy.y - 72, 'swing');
    scene.tweens.add({ targets: weapon, x: weapon.x - 32, y: weapon.y - 10, angle: -8,
      duration: 105, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: enemy, x: enemy.x + 9, duration: 80, yoyo: true, repeat: 1,
      ease: 'Sine.InOut' });
  } else if (animation === 'fire') {
    showManpu(scene, enemy.x + enemy.displayWidth * 0.36, enemy.y - 38, 'impact');
    const ember = scene.add.circle(344, 430, 7, 0xff8b2a).setStrokeStyle(2, 0xffdf9a).setDepth(9);
    scene.tweens.add({ targets: ember, x: enemy.x, y: enemy.y + 28, scale: 1.9, alpha: 0.25, duration: 300, ease: 'Sine.In',
      onComplete: () => {
        ember.destroy();
        scene.tweens.add({ targets: enemy, alpha: 0.35, yoyo: true, repeat: 1, duration: 75,
          onComplete: () => { if (enemy.active) restoreEnemyAppearance(enemy); } });
      },
    });
  } else if (animation === 'enemy-attack') {
    showManpu(scene, enemy.x, enemy.y - 80, 'swing');
    const attackType = visual?.kind === 'hit' ? visual.attackType : 'physical';
    if (attackType === 'magical') {
      const projectile = scene.add.circle(enemy.x, enemy.y + 10, 8, 0xff6828)
        .setStrokeStyle(2, 0xffd188).setDepth(16);
      scene.tweens.add({ targets: projectile, x: 355, y: 530, scale: 2.2, alpha: 0.25, duration: 280,
        onComplete: () => projectile.destroy(),
      });
      enemy.setTint(0xff5148);
      scene.time.delayedCall(240, () => { if (enemy.active) restoreEnemyAppearance(enemy); });
    } else if (attackType === 'double') {
      scene.tweens.add({ targets: enemy, x: enemy.x - 20, y: enemy.y + 32, duration: 90,
        yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    } else {
      const multiplier = attackType === 'heavy' ? 1.34 : 1.16;
      const distance = attackType === 'heavy' ? 66 : 43;
      scene.tweens.add({ targets: enemy, y: enemy.y + distance,
        scaleX: enemy.scaleX * multiplier, scaleY: enemy.scaleY * multiplier,
        duration: attackType === 'heavy' ? 230 : 170, yoyo: true, ease: 'Sine.InOut' });
    }
    weapon.setTint(0xb64a35);
    scene.tweens.add({ targets: weapon, alpha: 0.5, duration: 75, yoyo: true, repeat: 1,
      onComplete: () => { weapon.clearTint(); weapon.setAlpha(1); },
    });
    scene.cameras.main.shake(attackType === 'heavy' ? 180 : 110, attackType === 'heavy' ? 0.006 : 0.003);
  } else if (animation === 'enemy-dodge') {
    showManpu(scene, enemy.x - 52, enemy.y, 'dodge');
    const originalX = enemy.x;
    scene.tweens.add({ targets: enemy, x: originalX + 24, y: enemy.y - 10, angle: 3,
      duration: 110, yoyo: true, ease: 'Sine.InOut', onComplete: () => enemy.setAngle(0) });
    enemy.setAlpha(0.72);
    scene.tweens.add({ targets: enemy, alpha: 1, duration: 260 });
    weapon.angle = -3;
    scene.tweens.add({ targets: weapon, angle: 0, duration: 180, ease: 'Sine.Out' });
  } else if (animation === 'player-dodge') {
    showManpu(scene, 320, 476, 'dodge');
    const originalX = weapon.x;
    scene.tweens.add({ targets: weapon, x: originalX + 34, angle: 4, duration: 110,
      yoyo: true, ease: 'Sine.InOut', onComplete: () => { if (weapon.active) weapon.setAngle(0); } });
    scene.tweens.add({ targets: enemy, x: enemy.x - 10, duration: 110, yoyo: true, ease: 'Sine.InOut' });
    scene.cameras.main.shake(120, 0.0025);
  } else if (animation === 'defend') {
    showManpu(scene, leftProp.x + 55, leftProp.y - 50, 'prepare');
    scene.tweens.add({ targets: leftProp, x: leftProp.x + 18, y: leftProp.y - 30,
      scaleX: leftProp.scaleX * 1.42, scaleY: leftProp.scaleY * 1.42,
      duration: 290, ease: 'Cubic.Out' });
  } else if (animation === 'heavy-prepare') {
    showManpu(scene, enemy.x, enemy.y - 86, 'prepare');
    scene.tweens.add({ targets: enemy, scaleX: enemy.scaleX * 1.13, scaleY: enemy.scaleY * 1.13, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  } else if (animation === 'double-prepare') {
    showManpu(scene, enemy.x, enemy.y - 86, 'prepare');
    const x = enemy.x, y = enemy.y;
    scene.tweens.add({ targets: enemy, x: x - 12, y: y - 5, duration: 150, yoyo: true, repeat: 5, ease: 'Sine.InOut',
      onComplete: () => { if (enemy.active) enemy.setPosition(x, y); },
    });
  } else if (animation === 'fire-prepare') {
    showManpu(scene, enemy.x, enemy.y - 86, 'prepare');
    enemy.setTint(0xff5148);
    const aura = scene.add.ellipse(enemy.x, enemy.y, 145, 190, 0xff2118, 0.14).setStrokeStyle(3, 0xff5148, 0.85).setDepth(2);
    scene.tweens.add({ targets: [aura, enemy], alpha: 0.5, duration: 280, yoyo: true, repeat: 3,
      onComplete: () => { aura.destroy(); if (enemy.active) restoreEnemyAppearance(enemy); },
    });
  }
}

function showCombatVisual(scene: Phaser.Scene, enemy: Phaser.GameObjects.Image, visual: CombatVisualCue): void {
  const dodged = visual.kind === 'dodge';
  const interrupted = visual.kind === 'interrupted';
  const targetEnemy = visual.target === 'enemy';
  const x = targetEnemy ? enemy.x : 355;
  const y = targetEnemy ? enemy.y - enemy.displayHeight * 0.48 : 530;
  if (!dodged && visual.kind === 'hit' && visual.attackType === 'double' && visual.hitDetails?.length) {
    visual.hitDetails.forEach((hit, index) => {
      scene.time.delayedCall(index * 170, () => {
        if (!scene.sys.isActive()) return;
        const label = `${hit.critical ? 'CRÍTICO ' : ''}−${hit.amount}`;
        const number = scene.add.text(x + (index === 0 ? -18 : 18), y, label, {
          fontFamily: 'monospace', fontSize: hit.critical ? '18px' : '16px',
          color: hit.critical ? '#ffd36a' : '#fff0ca', fontStyle: 'bold', stroke: '#11100d', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(18);
        scene.tweens.add({ targets: number, y: y - 42, alpha: 0, duration: 820, ease: 'Cubic.Out',
          onComplete: () => number.destroy(),
        });
      });
    });
  } else {
  const label = interrupted ? 'ERRO!' : dodged ? 'ESQUIVA!'
    : `${visual.kind === 'hit' && visual.critical ? 'CRÍTICO ' : ''}−${visual.kind === 'hit' ? visual.amount : 0}`;
  const color = interrupted ? '#ffd36a' : dodged ? '#b7f4ff'
    : visual.kind === 'hit' && visual.critical ? '#ffd36a' : targetEnemy ? '#fff0ca' : '#ff9b8d';
  const number = scene.add.text(x, y, label, {
    fontFamily: 'monospace', fontSize: visual.kind === 'hit' && visual.critical ? '20px' : '18px',
    color, fontStyle: 'bold', stroke: '#11100d', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(18);
  scene.tweens.add({ targets: number, y: y - 42, alpha: 0, duration: 820, ease: 'Cubic.Out',
    onComplete: () => number.destroy(),
  });
  }
  if (visual.interrupted && !interrupted) {
    const notice = scene.add.text(enemy.x, enemy.y + enemy.displayHeight * 0.47, 'HABILIDADE CANCELADA!', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#ffd36a', fontStyle: 'bold',
      stroke: '#11100d', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(19);
    scene.tweens.add({ targets: notice, y: notice.y - 20, alpha: 0, delay: 250, duration: 760,
      onComplete: () => notice.destroy(),
    });
  }
  if (visual.kind === 'hit' && visual.evadedHits) {
    const note = scene.add.text(355, 558, `${visual.evadedHits} golpe esquivado`, {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#b7f4ff', stroke: '#11100d', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(18);
    scene.tweens.add({ targets: note, y: 539, alpha: 0, duration: 820,
      onComplete: () => note.destroy(),
    });
  }
}

export function renderEntityInfoScreen(
  scene: Phaser.Scene,
  run: RunState,
  entity: Entity,
  title: string,
  onClose: () => void,
  isBusy: () => boolean,
): void {
  scene.add.rectangle(VIEWPORT.width / 2, 380, VIEWPORT.width, VIEWPORT.height, 0x080807, 0.9).setInteractive().setDepth(20);
  addPanel(scene, VIEWPORT.width / 2, 380, 346, 562).setDepth(21);
  addText(scene, VIEWPORT.width / 2, 117, title, 21).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 157, `${entity.name}  •  Nível ${entity.level}`, 14, C.muted).setDepth(22);
  const isPlayer = entity === run.player;
  const status = entity.hp <= entity.maxHp * 0.25 ? 'Ferido gravemente' : entity.hp < entity.maxHp ? 'Ferido' : 'Saudável';
  const entityClass = entity.classId ? CLASS_DEFINITIONS[entity.classId].name : entity.rarity.toUpperCase();
  addText(scene, VIEWPORT.width / 2, 192,
    `${isPlayer ? CLASS_DEFINITIONS[run.classId].name : entityClass}${!isPlayer ? ` • ${entity.rarity.toUpperCase()}` : ''}${entity.mutated ? '  •  MUTANTE' : ''}  •  ${status}`,
    12, C.paper).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 224,
    `HP ${entity.hp}/${entity.maxHp}     MANA ${formatMana(entity.mp)}/${formatMana(entity.maxMp)}`, 12).setDepth(22);
  if (isPlayer) addText(scene, VIEWPORT.width / 2, 248, `XP ${run.xp}/${RULES.xpToNextLevel(entity.level)}`, 12, C.muted).setDepth(22);
  const activeEffects = [
    entity.burning ? `QUEIMANDO • ${entity.burning.turnsRemaining} turno(s)` : '',
    entity.poisoned ? `ENVENENADO • ${entity.poisoned.turnsRemaining} turno(s)` : '',
    entity.healingOverTime ? `REGENERAÇÃO • ${entity.healingOverTime.turnsRemaining} turno(s)` : '',
  ].filter(Boolean);
  if (activeEffects.length) addText(scene, VIEWPORT.width / 2, isPlayer ? 270 : 248,
    activeEffects.join('  |  '), 11, entity.burning ? '#ff9a52' : '#91e0a1').setDepth(22);
  addText(scene, VIEWPORT.width / 2, 289, 'ATRIBUTOS', 13, C.muted).setDepth(22);
  ATTRIBUTES.forEach((attribute, index) => {
    const col = index % 2, row = Math.floor(index / 2);
    addText(scene, 112 + col * 170, 319 + row * 33, `${ATTRIBUTE_LABELS[attribute]}   ${entity.stats[attribute]}`, 14).setDepth(22);
  });
  const physical = DERIVED_FORMULAS.physicalDamage(entity.stats, entity.level);
  const magical = DERIVED_FORMULAS.magicDamage(entity.stats, entity.level);
  addText(scene, VIEWPORT.width / 2, 430, 'STATUS E VALORES DERIVADOS', 12, C.muted).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 458, `Dano físico ${physical.min}–${physical.max}   •   mágico ${magical.min}–${magical.max}`, 11).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 485, `Esquiva ${DERIVED_FORMULAS.evasionPercent(entity.stats)}%   •   crítico ${criticalChance(entity)}%`, 11).setDepth(22);
  const lowHealthWarrior = entity.specialization === 'knight' && entity.hp < entity.maxHp * 0.5;
  const vitalityNote = lowHealthWarrior ? ` • VIT efetiva ${effectiveVitality(entity)}` : '';
  addText(scene, VIEWPORT.width / 2, 512,
    `Redução de dano ${defenseValue(entity, 'physical').toFixed(1)}%${vitalityNote}`, 11).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 539, `Velocidade ${DERIVED_FORMULAS.extraTurnSpeed(entity.stats)}   •   mutação ${entity.mutated ? 'ativa' : 'não'}`, 11).setDepth(22);
  if (entity.specialization) addText(scene, VIEWPORT.width / 2, 565,
    `${SPECIALIZATIONS[entity.specialization].name} • ${entity.level < RULES.classSkillUnlockLevel
      ? `habilidade no nível ${RULES.classSkillUnlockLevel}`
      : `Habilidade: ${entity.classSkill ? CLASS_SKILLS[entity.classSkill].name : '—'}`}`, 10, C.paper).setDepth(22);
  addButton(scene, isBusy, VIEWPORT.width / 2, 611, 190, 46, 'VOLTAR', onClose, '#29251d', 23, true);
}

export function renderMagicListScreen(
  scene: Phaser.Scene,
  run: RunState,
  isBusy: () => boolean,
  onCastFireArrow: () => void,
  onCastMagicShield: () => void,
  onClose: () => void,
  onCastClassSkill: () => void,
): void {
  scene.add.rectangle(VIEWPORT.width / 2, 380, VIEWPORT.width, VIEWPORT.height, 0x080807, 0.9).setInteractive().setDepth(20);
  addPanel(scene, VIEWPORT.width / 2, 380, 346, 540).setDepth(21);
  addText(scene, VIEWPORT.width / 2, 202, 'MAGIAS', 21).setDepth(22);
  if (run.classId === 'mage') {
    addText(scene, VIEWPORT.width / 2, 246,
      `Mana disponível: ${formatMana(run.player.mp)}/${formatMana(run.player.maxMp)}`, 12, C.muted).setDepth(22);
    addButton(scene, isBusy, VIEWPORT.width / 2, 306, 270, 50,
      `${SPELL_CONTENT.fireArrow.name.toUpperCase()} • ${RULES.fireArrowManaCost} MP`, onCastFireArrow, '#29251d', 23,
      false, run.player.mp >= RULES.fireArrowManaCost);
    scene.add.image(80, 306, SPELL_CONTENT.fireArrow.texture).setDisplaySize(48, 48).setDepth(24);
    addText(scene, VIEWPORT.width / 2, 346,
      `Dano mágico integral • ${Math.round(RULES.fireArrowBurnChance * 100)}% de queimar`, 10).setDepth(22);
    addText(scene, VIEWPORT.width / 2, 365,
      `Queima ${Math.round(RULES.burnDamageMultiplier * 100)}% do dano • até ${RULES.burnDurationTurns} ativações`, 10, C.muted).setDepth(22);
    addButton(scene, isBusy, VIEWPORT.width / 2, 420, 270, 50,
      `${SPELL_CONTENT.magicShield.name.toUpperCase()} • ${RULES.magicShieldManaCost} MP`, onCastMagicShield,
      '#29251d', 23, false, run.player.mp >= RULES.magicShieldManaCost && !run.player.magicShield);
    addText(scene, VIEWPORT.width / 2, 460,
      'Reduz em 50% o próximo dano recebido.', 10, C.muted).setDepth(22);
    if (run.player.classSkill && run.player.level >= RULES.classSkillUnlockLevel) {
      const skill = CLASS_SKILLS[run.player.classSkill];
      const skillUsable = !classSkillIsSupport(run.player.classSkill)
        || canUseClassSkillSupport(run.player, run.player.classSkill);
      addButton(scene, isBusy, VIEWPORT.width / 2, 516, 270, 48,
        `${skill.name.toUpperCase()} • ${skill.manaCost} MP`, onCastClassSkill, '#29251d', 23,
        false, run.player.mp >= skill.manaCost && skillUsable);
      scene.add.image(56, 516, CLASS_SKILL_TEXTURES[skill.id]).setDisplaySize(26, 26).setDepth(24);
      addText(scene, VIEWPORT.width / 2, 550, skill.description, 10, C.muted).setDepth(22);
    }
  } else addText(scene, VIEWPORT.width / 2, 327, 'Você ainda não conhece magias.', 13, C.muted).setDepth(22);
  addButton(scene, isBusy, VIEWPORT.width / 2, 610, 190, 44, 'VOLTAR', onClose, '#29251d', 23, true);
}

export function renderClassAbilityScreen(
  scene: Phaser.Scene,
  run: RunState,
  isBusy: () => boolean,
  onUse: () => void,
  onClose: () => void,
  onUseClassSkill: () => void,
): void {
  if (run.classId === 'mage') return;
  const warrior = run.classId === 'warrior';
  const cost = warrior ? RULES.heavyAttackManaCost : RULES.doubleAttackManaCost;
  scene.add.rectangle(VIEWPORT.width / 2, 380, VIEWPORT.width, VIEWPORT.height, 0x080807, 0.9).setInteractive().setDepth(20);
  addPanel(scene, VIEWPORT.width / 2, 380, 346, 420).setDepth(21);
  addText(scene, VIEWPORT.width / 2, 238, 'HABILIDADE', 21).setDepth(22);
  addText(scene, VIEWPORT.width / 2, 291,
    `Mana disponível: ${formatMana(run.player.mp)}/${formatMana(run.player.maxMp)}`, 12, C.muted).setDepth(22);
  addButton(scene, isBusy, VIEWPORT.width / 2, 333, 286, 50,
    `${warrior ? 'ATAQUE PESADO' : 'ATAQUE DUPLO'} • ${cost} MP`, onUse, '#29251d', 23, false, run.player.mp >= cost);
  addText(scene, VIEWPORT.width / 2, 375,
    warrior
      ? 'Acerto garantido e dano físico máximo. A defesa física do inimigo continua valendo.'
      : 'Dois golpes seguidos. Cada golpe pode ser esquivado e pode causar crítico.',
    11, C.muted).setDepth(22);
  if (run.player.classSkill && run.player.level >= RULES.classSkillUnlockLevel) {
    const skill = CLASS_SKILLS[run.player.classSkill];
    addButton(scene, isBusy, VIEWPORT.width / 2, 448, 286, 48,
      `${skill.name.toUpperCase()} • ${skill.manaCost} MP`, onUseClassSkill, '#29251d', 23,
      false, run.player.mp >= skill.manaCost);
    scene.add.image(51, 448, CLASS_SKILL_TEXTURES[skill.id]).setDisplaySize(24, 24).setDepth(24);
    addText(scene, VIEWPORT.width / 2, 484, skill.description, 10, C.muted).setDepth(22);
  }
  addButton(scene, isBusy, VIEWPORT.width / 2, 542, 190, 44, 'VOLTAR', onClose, '#29251d', 23, true);
}
