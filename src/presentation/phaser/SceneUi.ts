import Phaser from 'phaser';

export const VIEWPORT = { width: 420, height: 760 } as const;
export const PALETTE = {
  paper: '#d6cba9', muted: '#8f8b78', panel: '#1a1a17', line: '#6c654d',
  red: '#9d352d', green: '#4c8a54', blue: '#477b9c',
} as const;

export function clearScene(scene: Phaser.Scene): void {
  scene.tweens.killAll();
  scene.input.enabled = false;
  // Remova as áreas de clique antes de destruir os objetos para evitar hitboxes
  // órfãs ao trocar de tela durante a atualização do InputPlugin do Phaser.
  scene.children.list.forEach((child) => child.disableInteractive());
  scene.children.removeAll(true);
  scene.input.enabled = true;
}

export function addText(
  scene: Phaser.Scene, x: number, y: number, value: string, size = 16,
  color: string = PALETTE.paper, originX = .5,
): Phaser.GameObjects.Text {
  const readableSize = Math.max(12, size);
  return scene.add.text(x, y, value, {
    fontFamily: 'Arial, sans-serif', fontSize: `${readableSize}px`, color, align: 'center',
    lineSpacing: 5, wordWrap: { width: 360 },
  }).setOrigin(originX, 0);
}

export function addPanel(
  scene: Phaser.Scene, x: number, y: number, width: number, height: number,
  color: string = PALETTE.panel,
): Phaser.GameObjects.Rectangle {
  const fill = Phaser.Display.Color.HexStringToColor(color).color;
  const stroke = Phaser.Display.Color.HexStringToColor(PALETTE.line).color;
  return scene.add.rectangle(x, y, width, height, fill).setStrokeStyle(2, stroke);
}

export function addButton(
  scene: Phaser.Scene,
  isBusy: () => boolean,
  x: number, y: number, width: number, height: number, label: string,
  action: () => void, color: string = PALETTE.panel, depth = 1,
  allowWhileBusy = false, enabled = true,
): void {
  const bg = addPanel(scene, x, y, width, height, color).setDepth(depth);
  const caption = addText(scene, x, y - 9, label, 17).setDepth(depth + 1);
  if (!enabled) { bg.setAlpha(0.5); caption.setAlpha(0.5); return; }
  let activationPending = false;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerdown', () => {
    if (activationPending || (!allowWhileBusy && isBusy())) return;
    activationPending = true;
    bg.disableInteractive();
    scene.input.enabled = false;
    scene.tweens.add({ targets: [bg, caption], scaleX: 0.96, scaleY: 0.96,
      duration: 65, yoyo: true, ease: 'Sine.Out', onComplete: () => {
        scene.input.enabled = true;
        action();
      } });
  });
  bg.on('pointerover', () => {
    scene.tweens.add({ targets: [bg, caption], scaleX: 1.025, scaleY: 1.025, duration: 90, ease: 'Sine.Out' });
    bg.setFillStyle(0x302e25);
  });
  bg.on('pointerout', () => {
    scene.tweens.add({ targets: [bg, caption], scaleX: 1, scaleY: 1, duration: 90, ease: 'Sine.Out' });
    bg.setFillStyle(Phaser.Display.Color.HexStringToColor(color).color);
  });
}

export function drawSewerBackground(scene: Phaser.Scene, showMenuFrame = false): {
  background: Phaser.GameObjects.Image;
  shade: Phaser.GameObjects.Rectangle;
} {
  scene.cameras.main.setBackgroundColor('#10100f');
  const background = scene.add.image(VIEWPORT.width / 2, 380, 'sewer-background')
    .setDisplaySize(507, VIEWPORT.height).setDepth(0);
  const shade = scene.add.rectangle(VIEWPORT.width / 2, 380, VIEWPORT.width, VIEWPORT.height, 0x080907, 0.36)
    .setDepth(1);
  if (showMenuFrame) {
    const frame = scene.add.graphics();
    frame.lineStyle(3, 0x645d46, 0.9).strokeRect(20, 18, 380, 724);
    frame.lineStyle(1, 0x9b8250, 0.24).strokeRect(26, 24, 368, 712);
  }
  return { background, shade };
}

export function drawBar(
  scene: Phaser.Scene, x: number, y: number, width: number, height: number,
  fraction: number, color: string, label: string, depth = 1,
): void {
  const filled = Math.max(0, Math.min(1, fraction));
  scene.add.rectangle(x + width / 2, y, width, height, 0x292820).setStrokeStyle(1, 0x6c654d).setDepth(depth);
  scene.add.rectangle(x + 2 + (width - 4) * filled / 2, y, (width - 4) * filled, height - 4,
    Phaser.Display.Color.HexStringToColor(color).color).setDepth(depth);
  addText(scene, x + width / 2, y - 8, label, 13, '#f0ebd4').setDepth(depth + 1);
}
