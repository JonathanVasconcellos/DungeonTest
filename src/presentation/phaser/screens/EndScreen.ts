import Phaser from 'phaser';
import { addButton, addText, drawSewerBackground, PALETTE as C, VIEWPORT } from '../SceneUi';

export function renderEndScreen(
  scene: Phaser.Scene,
  title: string,
  subtitle: string,
  onRestart: () => void,
  onMenu: () => void,
  onShowLog?: () => void,
  isBusy: () => boolean = () => false,
): void {
  drawSewerBackground(scene);
  const titleText = addText(scene, VIEWPORT.width / 2, 240, title, 28);
  if (title === 'VOCÊ MORREU') {
    scene.tweens.add({
      targets: titleText,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  } else if (subtitle) {
    addText(scene, VIEWPORT.width / 2, 305, subtitle, 14, C.muted);
  }
  addButton(scene, isBusy, VIEWPORT.width / 2, 430, 260, 54,
    'RECOMEÇAR', onRestart);
  addButton(scene, isBusy, VIEWPORT.width / 2, 500, 260, 50,
    'MENU INICIAL', onMenu, '#29251d');
  if (onShowLog) {
    addButton(scene, isBusy, VIEWPORT.width / 2, 570, 260, 48,
      'VER LOG DA PARTIDA', onShowLog, '#29251d');
  }
}
