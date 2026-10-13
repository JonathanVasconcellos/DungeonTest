import Phaser from 'phaser';
import { initialStats } from '../../../game/rules/attributes';
import { CLASS_DEFINITIONS } from '../../../game/content/classes';
import type { ClassId, Stats } from '../../../game/types';
import { addPanel, addText, drawSewerBackground, VIEWPORT } from '../SceneUi';

export interface MenuActions {
  isBusy: () => boolean;
  onStart: (classId: ClassId, startingStats: Stats) => void;
}

export function renderMenuScreen(
  scene: Phaser.Scene,
  actions: MenuActions,
): void {
  drawSewerBackground(scene, true);
  addText(scene, VIEWPORT.width / 2, 90, 'CORREDOR\nSEM FIM', 30);
  addText(scene, VIEWPORT.width / 2, 205, 'Escolha sua classe', 16, '#8f8b78');
  const classes: ClassId[] = ['warrior', 'rogue', 'mage'];
  let classSelectionPending = false;
  classes.forEach((id, index) => {
    const definition = CLASS_DEFINITIONS[id];
    const y = 270 + index * 98;
    const stats = initialStats(id);
    addPanel(scene, VIEWPORT.width / 2, y + 20, 300, 76);
    addText(scene, VIEWPORT.width / 2, y, definition.name.toUpperCase(), 18);
    addText(scene, VIEWPORT.width / 2, y + 25,
      `${definition.focusLabel}  •  FOR ${stats.for} DES ${stats.dex} INT ${stats.int} VIT ${stats.vit}`,
      9, '#8f8b78');
    const hitArea = scene.add.rectangle(VIEWPORT.width / 2, y + 20, 300, 76, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => scene.tweens.add({ targets: hitArea, scaleX: 1.025, scaleY: 1.025, duration: 100, ease: 'Sine.Out' }));
    hitArea.on('pointerout', () => scene.tweens.add({ targets: hitArea, scaleX: 1, scaleY: 1, duration: 100, ease: 'Sine.Out' }));
    hitArea.on('pointerdown', () => {
      if (actions.isBusy() || classSelectionPending) return;
      classSelectionPending = true;
      scene.input.enabled = false;
      scene.tweens.add({ targets: hitArea, scaleX: 0.97, scaleY: 0.97, duration: 65, yoyo: true,
        onComplete: () => { scene.input.enabled = true; actions.onStart(id, stats); } });
    });
  });
}
