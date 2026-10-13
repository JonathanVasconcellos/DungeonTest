import Phaser from 'phaser';
import { SPECIALIZATIONS, SPECIALIZATIONS_BY_CLASS, specializationSkill } from '../../../game/content/specializations';
import { CLASS_SKILLS } from '../../../game/content/classSkills';
import { CLASS_DEFINITIONS } from '../../../game/content/classes';
import type { RunState } from '../../../game/types';
import type { SpecializationId } from '../../../game/content/specializations';
import { addButton, addText, drawSewerBackground, PALETTE as C, VIEWPORT } from '../SceneUi';

export function renderClassSkillChoiceScreen(
  scene: Phaser.Scene,
  run: RunState,
  onChoose: (specialization: SpecializationId) => void,
): void {
  drawSewerBackground(scene);
  addText(scene, VIEWPORT.width / 2, 62, 'ESCOLHA SUA ESPECIALIZAÇÃO', 20);
  addText(scene, VIEWPORT.width / 2, 101,
    `${CLASS_DEFINITIONS[run.classId].name} • disponível no nível 3`, 13, C.muted);
  addText(scene, VIEWPORT.width / 2, 132, 'Escolha um ramo para definir sua passiva e habilidade.', 11, C.paper);
  SPECIALIZATIONS_BY_CLASS[run.classId].forEach((id, index) => {
    const specialization = SPECIALIZATIONS[id];
    const skill = CLASS_SKILLS[specializationSkill(id)!];
    const y = 265 + index * 202;
    scene.add.rectangle(VIEWPORT.width / 2, y, 360, 178, 0x171713, 0.97)
      .setStrokeStyle(2, 0x9d8a61).setDepth(2);
    addText(scene, VIEWPORT.width / 2, y - 78, specialization.name.toUpperCase(), 16).setDepth(3);
    addText(scene, VIEWPORT.width / 2, y - 50, specialization.description, 11, C.paper).setDepth(3);
    addText(scene, VIEWPORT.width / 2, y - 22, specialization.passive, 10, C.muted).setDepth(3);
    addText(scene, VIEWPORT.width / 2, y + 7, `Nível 5: ${skill.name}`, 10, C.blue).setDepth(3);
    addText(scene, VIEWPORT.width / 2, y + 33, 'Aprimoramentos nos níveis 7 e 9', 10, C.blue).setDepth(3);
    addButton(scene, () => false, VIEWPORT.width / 2, y + 68, 144, 34, 'ESCOLHER',
      () => onChoose(id), C.panel, 2, false, true);
  });
}
