import Phaser from 'phaser';
import type { RunState } from '../../../game/types';
import { addButton, addText, drawSewerBackground, PALETTE as C, VIEWPORT } from '../SceneUi';

export function renderRoomScreen(
  scene: Phaser.Scene,
  run: RunState,
  note: string,
  canAdvance: boolean,
  showCompletionPopup: boolean,
  onAdvance: () => void,
  onInteract: () => void,
  onAcknowledge: () => void,
  onShowLog: () => void,
): void {
  const { background } = drawSewerBackground(scene);
  addText(scene, 96, 29, `ANDAR ${run.dungeonLevel}`, 12, C.paper);
  addText(scene, 263, 29, `SALA ${run.roomIndex + 1}`, 12, C.paper);
  addButton(scene, () => false, 377, 36, 38, 30, 'LOG', onShowLog, '#29251d', 15);
  const event = run.rooms[run.roomIndex]?.event;
  const eventTexture = event === 'chest' ? 'event-treasure-chest'
    : event === 'rest' ? 'event-rest-bonfire' : null;
  if (!canAdvance && eventTexture) {
    scene.add.ellipse(VIEWPORT.width / 2, 454, 94, 18, 0x070706, 0.55).setDepth(3);
    const sprite = scene.add.image(VIEWPORT.width / 2, 407, eventTexture)
      .setDisplaySize(event === 'chest' ? 104 : 94, event === 'chest' ? 76 : 92).setDepth(4)
      .setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', onInteract);
    const eventScaleX = sprite.scaleX;
    const eventScaleY = sprite.scaleY;
    scene.tweens.add({ targets: sprite, scaleX: eventScaleX * 1.04, scaleY: eventScaleY * 1.04,
      y: 404, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const prompt = note || (event === 'chest' ? 'TOQUE PARA ABRIR' : 'TOQUE PARA DESCANSAR');
    addText(scene, VIEWPORT.width / 2, 478, prompt, 13, C.paper);
  }

  if (showCompletionPopup) {
    scene.add.rectangle(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT.width, VIEWPORT.height,
      0x080807, 0.68).setDepth(20).setInteractive();
    scene.add.rectangle(VIEWPORT.width / 2, 355, 330, 190, 0x171713, 0.98)
      .setStrokeStyle(2, 0x9d8a61).setDepth(21);
    addText(scene, VIEWPORT.width / 2, 286, 'EVENTO CONCLUÍDO', 18, C.paper).setDepth(22);
    addText(scene, VIEWPORT.width / 2, 332, note, 16, C.paper).setDepth(22);
    addButton(scene, () => false, VIEWPORT.width / 2, 414, 190, 46, 'CONFIRMAR', onAcknowledge, '#29251d', 22);
  }

  if (canAdvance) {
    const arrow = scene.add.image(VIEWPORT.width / 2, 405, 'room-forward-arrow')
      .setDisplaySize(72, 72).setDepth(4).setInteractive({ useHandCursor: true });
    const arrowScaleX = arrow.scaleX;
    const arrowScaleY = arrow.scaleY;
    let advancing = false;
    arrow.on('pointerdown', () => {
      if (advancing) return;
      advancing = true;
      scene.input.enabled = false;
      arrow.disableInteractive();
      scene.tweens.add({
        targets: arrow,
        y: 248,
        scaleX: arrowScaleX * 0.12,
        scaleY: arrowScaleY * 0.12,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.In',
        onComplete: () => {
          scene.cameras.main.shake(500, 0.0018);
          const backgroundOriginY = 210 / VIEWPORT.height;
          background.setOrigin(0.5, backgroundOriginY).setPosition(VIEWPORT.width / 2, 210);
          const zoomScaleX = background.scaleX;
          const zoomScaleY = background.scaleY;
          scene.tweens.add({
            targets: background,
            scaleX: zoomScaleX * 1.1,
            scaleY: zoomScaleY * 1.14,
            duration: 520,
            ease: 'Sine.In',
            onComplete: () => {
              scene.cameras.main.once('camerafadeoutcomplete', onAdvance);
              scene.cameras.main.fadeOut(170, 0, 0, 0);
            },
          });
        },
      });
    });
    arrow.on('pointerover', () => arrow.setScale(arrowScaleX * 0.92, arrowScaleY * 0.92));
    arrow.on('pointerout', () => arrow.setScale(arrowScaleX, arrowScaleY));
    scene.tweens.add({ targets: arrow, y: 401, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
}
