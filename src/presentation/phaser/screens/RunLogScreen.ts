import Phaser from 'phaser';
import type { RunState } from '../../../game/types';
import { addButton, addText, PALETTE as C, VIEWPORT } from '../SceneUi';
import { formatRunLogEntry } from '../../../game/state/runLog';

export function renderRunLogScreen(scene: Phaser.Scene, run: RunState, onClose: () => void): void {
  scene.add.rectangle(VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT.width, VIEWPORT.height, 0x080807, 0.72)
    .setInteractive().setDepth(30);
  scene.add.rectangle(VIEWPORT.width / 2, VIEWPORT.height / 2, 370, 690, 0xd1c49b)
    .setStrokeStyle(3, 0x756344).setDepth(31);
  addText(scene, VIEWPORT.width / 2, 67, 'LOG DA PARTIDA', 19, '#211e17').setDepth(32);
  addText(scene, VIEWPORT.width / 2, 97, `${run.combatLog?.length ?? 0} registros • role ou arraste para navegar`, 12, '#4b4537').setDepth(32);

  const view = { x: 34, y: 132, width: 352, height: 540 };
  const lines = run.combatLog?.length ? formatEntries([...run.combatLog].reverse()) : ['Ainda não há eventos registrados.'];
  const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#201d17', lineSpacing: 7,
    wordWrap: { width: view.width - 30, useAdvancedWrap: true },
  };
  const maskShape = scene.add.graphics().fillStyle(0xffffff).fillRect(view.x, view.y, view.width - 12, view.height).setVisible(false);
  const mask = maskShape.createGeometryMask();
  scene.add.rectangle(view.x + view.width / 2 - 4, view.y + view.height / 2, view.width - 12, view.height, 0xe6dab4)
    .setStrokeStyle(1, 0x8c7957).setDepth(32);

  // Measure each event independently so no single Canvas texture grows with the whole run log.
  const rowHeights = lines.map((line) => {
    const measurement = scene.make.text({ x: 0, y: 0, text: line, style: textStyle }, false);
    const height = measurement.height + 14;
    measurement.destroy();
    return height;
  });
  const rowOffsets: number[] = [0];
  for (const height of rowHeights) rowOffsets.push(rowOffsets[rowOffsets.length - 1] + height);
  const contentHeight = rowOffsets[rowOffsets.length - 1];

  const trackX = view.x + view.width - 6;
  scene.add.rectangle(trackX, view.y + view.height / 2, 5, view.height, 0x302e25).setDepth(34);
  const maxScroll = Math.max(0, contentHeight - view.height + 10);
  const thumbHeight = maxScroll > 0 ? Math.max(32, view.height * view.height / contentHeight) : view.height;
  const trackTop = view.y;
  const thumbTravel = view.height - thumbHeight;
  const thumb = scene.add.rectangle(trackX, trackTop + thumbHeight / 2, 5, thumbHeight, 0xb7a981).setDepth(35);
  let scroll = 0;
  let dragStartY = 0;
  let dragStartScroll = 0;
  let visibleTexts: Array<{ index: number; text: Phaser.GameObjects.Text }> = [];
  const firstRowAt = (offset: number): number => {
    let low = 0;
    let high = lines.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (rowOffsets[middle + 1] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, Math.max(0, lines.length - 1));
  };
  const renderWindow = (): void => {
    const first = firstRowAt(scroll);
    const last = firstRowAt(Math.min(contentHeight, scroll + view.height + 120));
    const wanted = Array.from({ length: Math.max(1, last - first + 1) }, (_unused, offset) => first + offset);
    if (wanted.length === visibleTexts.length && wanted.every((index, offset) => visibleTexts[offset].index === index)) {
      visibleTexts.forEach(({ index, text }) => text.setY(view.y + 5 + rowOffsets[index] - scroll));
      return;
    }
    visibleTexts.forEach(({ text }) => text.destroy());
    visibleTexts = wanted.map((index) => {
      const text = scene.add.text(view.x + 10, view.y + 5 + rowOffsets[index] - scroll, lines[index], textStyle)
        .setOrigin(0, 0).setDepth(33).setMask(mask);
      return { index, text };
    });
  };
  const applyScroll = (value: number): void => {
    scroll = Phaser.Math.Clamp(value, 0, maxScroll);
    thumb.y = trackTop + thumbHeight / 2 + (maxScroll ? thumbTravel * scroll / maxScroll : 0);
    renderWindow();
  };
  const scrollZone = scene.add.zone(view.x + (view.width - 12) / 2, view.y + view.height / 2, view.width - 12, view.height)
    .setInteractive().setDepth(34);
  scrollZone.on('wheel', (_pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
    applyScroll(scroll + dy * 0.8);
  });
  scrollZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    dragStartY = pointer.y;
    dragStartScroll = scroll;
  });
  scrollZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    if (pointer.isDown) applyScroll(dragStartScroll + dragStartY - pointer.y);
  });
  scrollZone.on('pointerup', () => { dragStartY = 0; });
  renderWindow();

  const copyStatus = addText(scene, VIEWPORT.width / 2, 681, '', 10, C.muted).setDepth(37);
  addButton(scene, () => false, 125, 721, 142, 40, 'COPIAR LOG', () => {
    const exportText = formatEntries(run.combatLog ?? []).join('\n\n');
    if (!navigator.clipboard) {
      copyStatus.setText('Cópia indisponível neste navegador.');
      return;
    }
    void navigator.clipboard.writeText(exportText)
      .then(() => copyStatus.setText('Log copiado para a área de transferência.'))
      .catch(() => copyStatus.setText('Não foi possível copiar; tente novamente no navegador.'));
  }, '#29251d', 36, true);
  addButton(scene, () => false, 295, 721, 166, 40, 'VOLTAR AO JOGO', onClose, '#29251d', 36, true);
}

function formatEntries(entries: NonNullable<RunState['combatLog']>): string[] {
  const seenStates = new Set<string>();
  return entries.map((entry) => {
    const key = entry.before ? `${entry.timestamp}|${JSON.stringify(entry.before)}|${JSON.stringify(entry.after)}` : '';
    const includeState = !key || !seenStates.has(key);
    if (key) seenStates.add(key);
    return formatRunLogEntry(entry, includeState);
  });
}
