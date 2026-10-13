import Phaser from 'phaser';
import type { RunState } from '../../../game/types';
import { ITEM_CONTENT } from '../../../game/content/items';
import { addButton, addPanel, addText, drawSewerBackground, PALETTE as C, VIEWPORT } from '../SceneUi';

export function renderLootChoiceScreen(
  scene: Phaser.Scene,
  run: RunState,
  onChoose: (replaceSlot?: number) => void,
): void {
  if (!run.pendingLoot) return;
  drawSewerBackground(scene);
  addPanel(scene, VIEWPORT.width / 2, 380, 356, 566);
  addText(scene, VIEWPORT.width / 2, 125, 'INVENTÁRIO CHEIO', 21).setDepth(2);
  addText(scene, VIEWPORT.width / 2, 169, 'Escolha um espaço para substituir\nou descarte o item encontrado.', 13, C.muted).setDepth(2);
  run.inventory.forEach((item, index) => {
    addButton(scene, () => false, VIEWPORT.width / 2, 270 + index * 88, 290, 54,
      `TROCAR ESPAÇO ${index + 1} • ${item ? ITEM_CONTENT[item].name.toUpperCase() : 'VAZIO'}`,
      () => onChoose(index), '#29251d', 3);
  });
  addButton(scene, () => false, VIEWPORT.width / 2, 570, 250, 48,
    'DESCARTAR ITEM NOVO', () => onChoose(), '#29251d', 3);
}
