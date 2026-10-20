import Phaser from 'phaser';

export const VIEWPORT = { width: 420, height: 760 } as const;
export const PALETTE = {
  paper: '#d6cba9', muted: '#8f8b78', panel: '#1a1a17', line: '#6c654d',
  red: '#9d352d', green: '#4c8a54', blue: '#477b9c',
} as const;

interface SceneInputGate {
  generation: number;
  gestureLocked: boolean;
  pointerDown: boolean;
  pointerId: number;
  actionPending: boolean;
  dispatching: boolean;
  heldLocks: Set<number>;
  nextLockId: number;
}

const inputGates = new WeakMap<Phaser.Scene, SceneInputGate>();

function inputGate(scene: Phaser.Scene): SceneInputGate {
  let gate = inputGates.get(scene);
  if (gate) return gate;
  gate = { generation: 0, gestureLocked: false, pointerDown: false, pointerId: -1,
    actionPending: false, dispatching: false, heldLocks: new Set<number>(), nextLockId: 1 };
  inputGates.set(scene, gate);
  scene.input.topOnly = true;
  const releasePointer = (pointer: Phaser.Input.Pointer): void => {
    if (!gate!.gestureLocked || pointer.id !== gate!.pointerId) return;
    gate!.pointerDown = false;
    releaseGateIfReady(gate!);
  };
  scene.input.on('pointerup', releasePointer);
  scene.input.on('pointerupoutside', releasePointer);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    gate!.generation += 1;
    gate!.gestureLocked = false;
    gate!.actionPending = false;
    gate!.heldLocks.clear();
  });
  return gate;
}

function releaseGateIfReady(gate: SceneInputGate): void {
  if (!gate.pointerDown && !gate.actionPending && gate.heldLocks.size === 0) gate.gestureLocked = false;
}

export function sceneInputGeneration(scene: Phaser.Scene): number {
  return inputGate(scene).generation;
}

export function isSceneInputGenerationCurrent(scene: Phaser.Scene, generation: number): boolean {
  return inputGate(scene).generation === generation;
}

/** Keeps input locked across an asynchronous visual transition. */
export function holdSceneInput(scene: Phaser.Scene): () => void {
  const gate = inputGate(scene);
  const lockId = gate.nextLockId++;
  gate.heldLocks.add(lockId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.heldLocks.delete(lockId);
    releaseGateIfReady(gate);
  };
}

/** Binds a single accepted pointer gesture to an action, ignoring stale/hidden controls and click-through. */
export function bindUIAction(
  scene: Phaser.Scene,
  object: Phaser.GameObjects.GameObject,
  action: () => void,
  enabled: () => boolean = () => true,
  beforeAction?: (complete: () => void) => void,
): void {
  const gate = inputGate(scene);
  const generation = gate.generation;
  object.setData('uiInputGeneration', generation);
  object.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (gate.gestureLocked || gate.heldLocks.size > 0 || !enabled() || !object.active
      || !scene.sys.isActive() || object.getData('uiInputGeneration') !== gate.generation) return;
    gate.gestureLocked = true;
    gate.pointerDown = true;
    gate.pointerId = pointer.id;
    gate.actionPending = true;
    const complete = (): void => {
      if (!gate.actionPending) return;
      const visibility = object as Phaser.GameObjects.GameObject & { visible?: boolean };
      if (generation !== gate.generation || !object.active || visibility.visible === false) {
        gate.actionPending = false;
        releaseGateIfReady(gate);
        return;
      }
      gate.dispatching = true;
      try { action(); }
      finally {
        gate.dispatching = false;
        gate.actionPending = false;
        releaseGateIfReady(gate);
      }
    };
    try {
      if (beforeAction) beforeAction(complete);
      else complete();
    } catch (error) {
      gate.actionPending = false;
      releaseGateIfReady(gate);
      throw error;
    }
  });
}

export function clearScene(scene: Phaser.Scene): void {
  const gate = inputGate(scene);
  gate.generation += 1;
  if (gate.actionPending && !gate.dispatching) gate.actionPending = false;
  gate.heldLocks.clear();
  releaseGateIfReady(gate);
  scene.tweens.killAll();
  disableSceneTreeInput(scene);
  scene.children.removeAll(true);
}

/** Invalidates current controls while keeping their visuals, for modal screens and transitions. */
export function invalidateSceneActions(scene: Phaser.Scene): number {
  const gate = inputGate(scene);
  gate.generation += 1;
  if (gate.actionPending && !gate.dispatching) gate.actionPending = false;
  disableSceneTreeInput(scene);
  releaseGateIfReady(gate);
  return gate.generation;
}

function disableSceneTreeInput(scene: Phaser.Scene): void {
  // Containers own their children, so invalidate hit areas throughout the full tree.
  const disableTree = (child: Phaser.GameObjects.GameObject): void => {
    const interactive = child as Phaser.GameObjects.GameObject & { disableInteractive?: () => void; list?: Phaser.GameObjects.GameObject[] };
    interactive.disableInteractive?.();
    interactive.list?.forEach(disableTree);
  };
  scene.children.list.forEach(disableTree);
}

const PANEL_BODY_DATA_KEY = 'panelBody';
const AMBIENT_PARTICLE_TEXTURE_KEY = 'corridor-ambient-pixel';
const UI_PARTICLE_TEXTURE_KEY = 'ui-pixel-effect';

export function ensurePixelEffectTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(UI_PARTICLE_TEXTURE_KEY)) return;
  const pixel = scene.make.graphics({ x: 0, y: 0 }, false);
  pixel.fillStyle(0xffffff, 1).fillRect(2, 0, 2, 2);
  pixel.fillStyle(0xffffff, 0.65).fillRect(0, 2, 4, 2);
  pixel.generateTexture(UI_PARTICLE_TEXTURE_KEY, 6, 6);
  pixel.destroy();
}

export function showManpu(
  scene: Phaser.Scene, x: number, y: number, kind: 'swing' | 'impact' | 'dodge' | 'prepare',
): void {
  const ink = scene.add.graphics().setPosition(x, y).setDepth(17);
  const color = kind === 'impact' ? 0xffdf9a : kind === 'dodge' ? 0xb7eaff : 0xd6cba9;
  ink.lineStyle(3, color, 0.95);
  if (kind === 'swing') {
    ink.beginPath().moveTo(-22, 12).lineTo(-8, -10).lineTo(3, 4).lineTo(19, -17).strokePath();
    ink.lineBetween(-24, 20, -12, 14);
  } else if (kind === 'impact') {
    ink.lineBetween(-18, -14, -8, -4); ink.lineBetween(18, -14, 8, -4);
    ink.lineBetween(-20, 10, -9, 5); ink.lineBetween(20, 10, 9, 5);
    ink.lineBetween(0, -24, 0, -12);
  } else if (kind === 'dodge') {
    ink.lineBetween(-20, -12, -7, -12); ink.lineBetween(-17, 0, -4, 0);
    ink.lineBetween(-14, 12, -2, 12);
  } else {
    ink.lineBetween(-18, -10, -8, -18); ink.lineBetween(18, -10, 8, -18);
    ink.lineBetween(-20, 8, -10, 15); ink.lineBetween(20, 8, 10, 15);
  }
  scene.tweens.add({ targets: ink, alpha: 0, scale: 1.35, duration: kind === 'prepare' ? 220 : 160,
    ease: 'Quad.Out', onComplete: () => ink.destroy() });
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
): Phaser.GameObjects.Container {
  const fill = Phaser.Display.Color.HexStringToColor(color).color;
  const panel = scene.add.container(x, y);
  const body = scene.add.rectangle(0, 0, width, height, fill).setStrokeStyle(2, 0x6c654d);
  const detail = scene.add.graphics();
  const inset = Math.min(4, Math.floor(Math.min(width, height) / 4));
  detail.lineStyle(1, 0xd6cba9, 0.2).strokeRect(-width / 2 + inset, -height / 2 + inset,
    width - inset * 2, height - inset * 2);
  detail.fillStyle(0xd6cba9, 0.4);
  detail.fillRect(-width / 2 + 2, -height / 2 + 2, 5, 2);
  detail.fillRect(width / 2 - 7, -height / 2 + 2, 5, 2);
  detail.fillStyle(0x080807, 0.5);
  detail.fillRect(-width / 2 + 3, height / 2 - 4, width - 6, 2);
  panel.add([body, detail]);
  panel.setData(PANEL_BODY_DATA_KEY, body);
  return panel;
}

export function addButton(
  scene: Phaser.Scene,
  isBusy: () => boolean,
  x: number, y: number, width: number, height: number, label: string,
  action: () => void, color: string = PALETTE.panel, depth = 1,
  allowWhileBusy = false, enabled = true,
): void {
  const panel = addPanel(scene, x, y, width, height, color).setDepth(depth);
  const bg = panel.getData(PANEL_BODY_DATA_KEY) as Phaser.GameObjects.Rectangle;
  const caption = addText(scene, x, y - 9, label, 17).setDepth(depth + 1);
  const canActivate = (): boolean => enabled && (allowWhileBusy || !isBusy());
  if (!canActivate()) { panel.setAlpha(0.5); caption.setAlpha(0.5); return; }
  bg.setInteractive({ useHandCursor: true });
  bindUIAction(scene, bg, action, canActivate, (complete) => {
    scene.tweens.add({ targets: [panel, caption], scaleX: 0.96, scaleY: 0.96,
      duration: 65, yoyo: true, ease: 'Sine.Out', onComplete: complete });
  });
  bg.on('pointerover', () => {
    scene.tweens.add({ targets: [panel, caption], scaleX: 1.025, scaleY: 1.025, duration: 90, ease: 'Sine.Out' });
    bg.setFillStyle(0x302e25);
  });
  bg.on('pointerout', () => {
    scene.tweens.add({ targets: [panel, caption], scaleX: 1, scaleY: 1, duration: 90, ease: 'Sine.Out' });
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
  addCorridorAmbient(scene);
  if (showMenuFrame) {
    const frame = scene.add.graphics();
    frame.lineStyle(3, 0x645d46, 0.9).strokeRect(20, 18, 380, 724);
    frame.lineStyle(1, 0x9b8250, 0.24).strokeRect(26, 24, 368, 712);
  }
  return { background, shade };
}

function addCorridorAmbient(scene: Phaser.Scene): void {
  if (!scene.textures.exists(AMBIENT_PARTICLE_TEXTURE_KEY)) {
    const pixel = scene.make.graphics({ x: 0, y: 0 }, false);
    pixel.fillStyle(0xffcf81, 0.38).fillRect(1, 0, 2, 1);
    pixel.fillStyle(0xffe4ae, 0.75).fillRect(1, 1, 2, 2);
    pixel.generateTexture(AMBIENT_PARTICLE_TEXTURE_KEY, 4, 4);
    pixel.destroy();
  }
  scene.add.particles(0, 0, AMBIENT_PARTICLE_TEXTURE_KEY, {
    frequency: 780,
    quantity: 1,
    maxParticles: 6,
    lifespan: { min: 900, max: 1500 },
    speedX: { min: -2, max: 2 },
    speedY: { min: -13, max: -5 },
    scale: { start: 0.8, end: 0.15 },
    alpha: { start: 0.42, end: 0 },
    blendMode: Phaser.BlendModes.ADD,
    emitZone: { type: 'random', source: { getRandomPoint: (point) => {
      const leftSide = Phaser.Math.Between(0, 1) === 0;
      point.x = leftSide ? Phaser.Math.Between(8, 38) : Phaser.Math.Between(VIEWPORT.width - 38, VIEWPORT.width - 8);
      point.y = Phaser.Math.Between(110, 510);
    } } },
  }).setDepth(2);
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
