import Phaser from 'phaser';
import { GameController, type GameTransition } from '../game/application/GameController';
import type { ClassId, Entity, RunState, Stats } from '../game/types';
import type { CombatVisualCue } from '../game/combat/CombatSystem';
import { clearScene } from '../presentation/phaser/SceneUi';
import { loadGameAssets } from '../presentation/phaser/GameAssets';
import { renderMenuScreen } from '../presentation/phaser/screens/MenuScreen';
import {
  animationForIntent, renderClassAbilityScreen, renderCombatScreen, renderEntityInfoScreen, renderMagicListScreen,
  type CombatAnimation,
} from '../presentation/phaser/screens/CombatScreen';
import { renderRoomScreen } from '../presentation/phaser/screens/RoomScreen';
import { renderLootChoiceScreen } from '../presentation/phaser/screens/LootChoiceScreen';
import { renderLevelUpScreen } from '../presentation/phaser/screens/LevelUpScreen';
import { renderEndScreen } from '../presentation/phaser/screens/EndScreen';
import { renderRunLogScreen } from '../presentation/phaser/screens/RunLogScreen';
import { renderClassSkillChoiceScreen } from '../presentation/phaser/screens/ClassSkillChoiceScreen';
import type { SpecializationId } from '../game/content/specializations';

const ENEMY_ACTION_DELAY_MS = 1200;
const FINAL_ACTION_ANIMATION_MS = 1050;
const ROOM_ENTRY_FADE_MS = 280;

/** Phaser adapter: translates input and controller transitions into screens and timed animations. */
export class GameScene extends Phaser.Scene {
  private readonly controller = new GameController();
  private busy = false;
  private transitionPending = false;

  constructor() { super('game'); }

  preload(): void { loadGameAssets(this); }

  create(): void { this.showMenu(); }

  private get run(): RunState | null { return this.controller.state; }

  private clear(): void { clearScene(this); }

  private showMenu(): void {
    this.clear();
    this.controller.returnToMenu();
    this.busy = false;
    renderMenuScreen(this, {
      isBusy: () => this.busy,
      onStart: (classId, stats) => this.startRun(classId, stats),
    });
  }

  private startRun(classId: ClassId, stats?: Stats): void {
    if (this.transitionPending) return;
    this.transitionPending = true;
    this.busy = true;
    this.cameras.main.fadeOut(ROOM_ENTRY_FADE_MS, 0, 0, 0);
    this.time.delayedCall(ROOM_ENTRY_FADE_MS, () => {
      const next = this.controller.startRun(classId, stats);
      this.applyTransition(next);
      this.cameras.main.fadeIn(460, 0, 0, 0);
      this.transitionPending = false;
    });
  }

  private applyTransition(transition: GameTransition): void {
    if (transition.view === 'combat') {
      this.busy = transition.waitForEnemy === true;
      const feedback = transition.feedback ?? 'none';
      this.drawCombat(transition.note ?? '', feedback === 'enemy-turn'
        ? animationForIntent(this.run?.enemyIntent) : feedback, transition.visual);
      if (transition.waitForEnemy) this.time.delayedCall(ENEMY_ACTION_DELAY_MS, () => this.enemyTurn());
      return;
    }
    if (transition.visual && this.run?.enemy) {
      this.busy = true;
      const animation = transition.feedback === 'enemy-turn' ? 'enemy-attack' : transition.feedback ?? 'none';
      this.drawCombat('', animation, transition.visual);
      this.time.delayedCall(FINAL_ACTION_ANIMATION_MS, () => {
        if (!this.run) return;
        this.busy = false;
        if (transition.view === 'game-over') {
          this.drawEnd('VOCÊ MORREU', transition.note ?? 'A tentativa chegou ao fim.');
          return;
        }
        this.applyTransition({ ...transition, visual: undefined, feedback: undefined });
      });
      return;
    }
    this.busy = false;
    if (transition.view === 'room') {
      const run = this.run;
      if (run) {
        this.clear();
        const currentRoom = run.rooms[run.roomIndex];
        const showCompletionPopup = currentRoom?.resolved === true && currentRoom.completionAcknowledged !== true;
        const canAdvance = currentRoom?.resolved === true && currentRoom.completionAcknowledged === true;
        renderRoomScreen(this, run, transition.note ?? currentRoom?.completionNote ?? '', canAdvance,
          showCompletionPopup, () => this.advanceRoom(), () => this.interactRoomEvent(),
          () => this.applyTransition(this.controller.acknowledgeRoomCompletion()),
          () => this.showRunLog(() => this.applyTransition({ view: 'room', note: currentRoom?.completionNote })));
      }
    } else if (transition.view === 'loot-choice') {
      const run = this.run;
      if (run) { this.clear(); renderLootChoiceScreen(this, run, (slot) => this.acceptLootChoice(slot)); }
    } else if (transition.view === 'level-up') {
      const run = this.run;
      if (run) {
        this.clear();
        renderLevelUpScreen(this, run, (attribute) => this.allocatePoint(attribute));
      }
    } else if (transition.view === 'skill-choice') {
      const run = this.run;
      if (run) {
        this.clear();
        renderClassSkillChoiceScreen(this, run, (specialization) => this.chooseSpecialization(specialization));
      }
    } else if (transition.view === 'game-over' || transition.view === 'victory') {
      this.drawEnd(transition.view === 'game-over' ? 'VOCÊ MORREU' : 'VITÓRIA', transition.note ?? '');
    }
  }

  private drawCombat(note = '', animation: CombatAnimation = 'none', visual?: CombatVisualCue): void {
    const run = this.run;
    if (!run?.enemy) return;
    if (note) this.controller.recordCombatMessage(note);
    this.clear();
    renderCombatScreen(this, run, this.busy, {
      isBusy: () => this.busy,
      onAttack: () => this.playerAttack(),
      onMagic: () => this.showMagicList(),
      onAbility: () => this.showClassAbility(),
      onDefend: () => this.defend(),
      onUsePotion: (slot) => this.usePotion(slot),
      onShowInfo: (entity, title) => this.showEntityInfo(entity, title),
      onShowLog: () => this.showRunLog(),
    }, animation, visual);
  }

  private showEntityInfo(entity: Entity, title: string, onClose: () => void = () => this.drawCombat()): void {
    const run = this.run;
    if (!run) return;
    renderEntityInfoScreen(this, run, entity, title, onClose, () => this.busy);
  }

  private showRunLog(onClose: () => void = () => this.drawCombat()): void {
    const run = this.run;
    if (!run) return;
    renderRunLogScreen(this, run, onClose);
  }

  private showMagicList(): void {
    const run = this.run;
    if (!run) return;
    renderMagicListScreen(this, run, () => this.busy,
      () => this.playerFireArrow(), () => this.applyTransition(this.controller.magicShield()),
      () => this.drawCombat(), () => this.playerClassSkill());
  }

  private showClassAbility(): void {
    const run = this.run;
    if (!run) return;
    renderClassAbilityScreen(this, run, () => this.busy,
      () => this.playerClassAbility(), () => this.drawCombat(), () => this.playerClassSkill());
  }

  private playerAttack(): void { this.applyTransition(this.controller.basicAttack()); }
  private playerFireArrow(): void { this.applyTransition(this.controller.fireArrow()); }
  private playerClassAbility(): void { this.applyTransition(this.controller.classAbility()); }
  private playerClassSkill(): void { this.applyTransition(this.controller.useClassSkill()); }
  private chooseSpecialization(specialization: SpecializationId): void { this.applyTransition(this.controller.chooseSpecialization(specialization)); }
  private defend(): void { this.applyTransition(this.controller.defend()); }

  private usePotion(slot: number): void {
    const transition = this.controller.usePotion(slot);
    if (transition) this.applyTransition(transition);
  }

  private enemyTurn(): void { this.applyTransition(this.controller.enemyTurn()); }
  private allocatePoint(attribute: Parameters<GameController['allocatePoint']>[0]): void {
    this.applyTransition(this.controller.allocatePoint(attribute));
  }
  private acceptLootChoice(slot?: number): void { this.applyTransition(this.controller.chooseLoot(slot)); }
  private interactRoomEvent(): void {
    const transition = this.controller.interactRoomEvent();
    if (transition) this.applyTransition(transition);
  }
  private advanceRoom(): void {
    const transition = this.controller.advanceRoom();
    if (!transition) return;
    this.transitionPending = true;
    this.applyTransition(transition);
    this.input.enabled = false;
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.time.delayedCall(300, () => {
      this.input.enabled = true;
      this.transitionPending = false;
    });
  }

  private drawEnd(title: string, subtitle: string): void {
    this.clear();
    renderEndScreen(this, title, subtitle, () => {
      const classId = this.run?.classId ?? 'warrior';
      this.startRun(classId);
    }, () => this.showMenu(), title === 'VOCÊ MORREU'
      ? () => this.showRunLog(() => this.drawEnd(title, subtitle)) : undefined,
    () => this.busy || this.transitionPending);
  }
}
