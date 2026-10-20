import Phaser from 'phaser';
import type { RunState } from '../../../game/types';
import { addButton, addPanel, addText, drawSewerBackground, ensurePixelEffectTexture, PALETTE as C, VIEWPORT } from '../SceneUi';

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
  if (!canAdvance && !showCompletionPopup && eventTexture) {
    scene.add.ellipse(VIEWPORT.width / 2, 454, 94, 18, 0x070706, 0.55).setDepth(3);
    const sprite = scene.add.image(VIEWPORT.width / 2, 407, eventTexture)
      .setDisplaySize(event === 'chest' ? 104 : 94, event === 'chest' ? 76 : 92).setDepth(4)
      .setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', onInteract);
    const eventScaleX = sprite.scaleX;
    const eventScaleY = sprite.scaleY;
    scene.tweens.add({ targets: sprite, scaleX: eventScaleX * 1.04, scaleY: eventScaleY * 1.04,
      y: 404, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (event === 'chest') {
      addChestGlint(scene, VIEWPORT.width / 2, 402);
    } else {
      ensurePixelEffectTexture(scene);
      const bonfireParticleZone: Phaser.Types.GameObjects.Particles.RandomZoneSource = {
        getRandomPoint: (point) => {
          point.x = Phaser.Math.Between(-13, 13);
          point.y = Phaser.Math.Between(-8, 8);
        },
      };
      scene.add.particles(VIEWPORT.width / 2, 390, 'ui-pixel-effect', {
        frequency: 460,
        quantity: 1,
        maxParticles: 3,
        lifespan: { min: 520, max: 850 },
        speedX: { min: -7, max: 7 },
        speedY: { min: -32, max: -18 },
        scale: { start: 0.9, end: 0.1 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xffb742, 0xffe2a1],
        emitZone: { type: 'random', source: bonfireParticleZone },
      }).setDepth(5);
    }
    const prompt = note || (event === 'chest' ? 'TOQUE PARA ABRIR' : 'TOQUE PARA DESCANSAR');
    addText(scene, VIEWPORT.width / 2, 478, prompt, 13, C.paper);
  }

  if (showCompletionPopup) {
    scene.add.rectangle(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT.width, VIEWPORT.height,
      0x080807, 0.68).setDepth(20).setInteractive();
    addPanel(scene, VIEWPORT.width / 2, 355, 330, 190).setDepth(21);
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

function addChestGlint(scene: Phaser.Scene, x: number, y: number): void {
  const glint = scene.add.graphics().setPosition(x, y).setDepth(5);
  glint.fillStyle(0xffe7a8, 0.95);
  glint.fillRect(-1, -7, 2, 14);
  glint.fillRect(-6, -1, 12, 2);
  glint.fillRect(-3, -3, 2, 2);
  glint.fillRect(2, 2, 2, 2);
  scene.tweens.add({ targets: glint, alpha: 0, scale: 1.65, duration: 260, delay: 1250,
    repeat: -1, repeatDelay: 1700, onRepeat: () => glint.setAlpha(0.95),
  });
}
