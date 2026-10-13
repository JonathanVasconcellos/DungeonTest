import Phaser from 'phaser';
import { ATTRIBUTE_LABELS, ATTRIBUTES, statCap } from '../../../game/rules/attributes';
import type { Attribute, RunState } from '../../../game/types';
import { addButton, addText, drawSewerBackground, PALETTE as C, VIEWPORT } from '../SceneUi';

export function renderLevelUpScreen(
  scene: Phaser.Scene,
  run: RunState,
  onAllocate: (attribute: Attribute) => void,
): void {
  drawSewerBackground(scene);
  addText(scene, VIEWPORT.width / 2, 80, 'NÍVEL AUMENTOU!', 22);
  addText(scene, VIEWPORT.width / 2, 132,
    `Nível ${run.player.level} • pontos a distribuir: ${run.pendingPoints}`, 13, C.muted);
  ATTRIBUTES.forEach((attribute, index) => {
    const y = 207 + index * 51;
    addText(scene, 116, y, `${ATTRIBUTE_LABELS[attribute]}  ${run.player.stats[attribute]}`, 15);
    const hasRoom = run.player.stats[attribute] < statCap(run.player.level, run.classId, attribute);
    addButton(scene, () => false, 300, y + 4, 52, 38, '+', () => onAllocate(attribute), C.panel, 1, false, hasRoom);
  });
  addText(scene, VIEWPORT.width / 2, 550, 'Distribua todos os pontos para continuar.', 12, C.muted);
}
