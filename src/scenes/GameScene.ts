import Phaser from 'phaser';
import { GameController, type GameTransition } from '../game/application/GameController';
import type { ClassId, Entity, RunState, Stats } from '../game/types';
import type { CombatVisualCue } from '../game/combat/CombatSystem';
import { addText, clearScene, drawSewerBackground, isSceneInputGenerationCurrent, sceneInputGeneration,
  holdSceneInput, invalidateSceneActions, VIEWPORT } from '../presentation/phaser/SceneUi';
import { enemyTextureKey, loadEnemyVariant, loadGameAssets } from '../presentation/phaser/GameAssets';
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
  private transitionToken = 0;
  private enemyVariantLoading = false;

  constructor() { super('game'); }

  preload(): void { loadGameAssets(this); }

  create(): void { this.showMenu(); }

  private get run(): RunState | null { return this.controller.state; }
  private get inputBusy(): boolean { return this.busy || this.transitionPending; }

  private clear(): void {
    this.enemyVariantLoading = false;
    clearScene(this);
  }

  private showMenu(): void {
    this.transitionToken += 1;
    this.clear();
    this.controller.returnToMenu();
    this.busy = false;
    this.transitionPending = false;
    renderMenuScreen(this, {
      isBusy: () => this.inputBusy,
      onStart: (classId, stats) => this.startRun(classId, stats),
    });
  }

  private startRun(classId: ClassId, stats?: Stats): void {
    if (this.transitionPending) return;
    const transitionToken = ++this.transitionToken;
    this.transitionPending = true;
    this.busy = true;
    invalidateSceneActions(this);
    this.cameras.main.fadeOut(ROOM_ENTRY_FADE_MS, 0, 0, 0);
    this.time.delayedCall(ROOM_ENTRY_FADE_MS, () => {
      if (!this.sys.isActive() || transitionToken !== this.transitionToken) return;
      const next = this.controller.startRun(classId, stats);
      this.applyTransition(next);
      this.cameras.main.fadeIn(460, 0, 0, 0);
      // This cleanup belongs to the transition itself: a screen-generation change
      // while loading an enemy must not strand transitionPending in the busy state.
      this.time.delayedCall(460, () => {
        if (!this.sys.isActive() || transitionToken !== this.transitionToken) return;
        this.transitionPending = false;
        if (this.run?.enemy && !this.enemyVariantLoading) this.drawCombat();
      });
    });
  }

  private applyTransition(transition: GameTransition): void {
    if (transition.view === 'combat') {
      const run = this.run;
      if (!run?.enemy) return;
      const enemy = run.enemy;
      const isBoss = run.rooms[run.roomIndex]?.event === 'boss';
      const textureKey = enemyTextureKey(enemy, isBoss);
      let generation = sceneInputGeneration(this);
      const presentCombat = (): void => {
        if (!isSceneInputGenerationCurrent(this, generation) || !this.sys.isActive() || this.run?.enemy !== enemy) return;
        this.enemyVariantLoading = false;
        this.busy = transition.waitForEnemy === true;
        const feedback = transition.feedback ?? 'none';
        this.drawCombat(transition.note ?? '', feedback === 'enemy-turn'
          ? animationForIntent(this.run?.enemyIntent) : feedback, transition.visual);
        if (transition.waitForEnemy) this.scheduleForCurrentScreen(ENEMY_ACTION_DELAY_MS, () => this.enemyTurn());
      };

      if (this.textures.exists(textureKey)) {
        presentCombat();
        return;
      }

      this.busy = true;
      this.clear();
      this.enemyVariantLoading = true;
      generation = sceneInputGeneration(this);
      drawSewerBackground(this);
      addText(this, VIEWPORT.width / 2, VIEWPORT.height / 2, 'CARREGANDO INIMIGO…', 16);
      void loadEnemyVariant(this, textureKey).then(presentCombat).catch(() => {
        // CombatScreen falls back to the preloaded generic species sprite if this variant fails.
        presentCombat();
      });
      return;
    }
    if (transition.visual && this.run?.enemy) {
      this.busy = true;
      const animation = transition.feedback === 'enemy-turn' ? 'enemy-attack' : transition.feedback ?? 'none';
      this.drawCombat('', animation, transition.visual);
      this.scheduleForCurrentScreen(FINAL_ACTION_ANIMATION_MS, () => {
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
    renderCombatScreen(this, run, this.inputBusy, {
      isBusy: () => this.inputBusy,
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
    invalidateSceneActions(this);
    renderEntityInfoScreen(this, run, entity, title, onClose, () => this.inputBusy);
  }

  private showRunLog(onClose: () => void = () => this.drawCombat()): void {
    const run = this.run;
    if (!run) return;
    invalidateSceneActions(this);
    renderRunLogScreen(this, run, onClose);
  }

  private showMagicList(): void {
    const run = this.run;
    if (!run) return;
    invalidateSceneActions(this);
    renderMagicListScreen(this, run, () => this.inputBusy,
      () => this.playerFireArrow(), () => this.applyTransition(this.controller.magicShield()),
      () => this.drawCombat(), () => this.playerClassSkill());
  }

  private showClassAbility(): void {
    const run = this.run;
    if (!run) return;
    invalidateSceneActions(this);
    renderClassAbilityScreen(this, run, () => this.inputBusy,
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
    const transitionToken = ++this.transitionToken;
    this.transitionPending = true;
    this.applyTransition(transition);
    const releaseInput = holdSceneInput(this);
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.time.delayedCall(300, () => {
      // Always release this transition's own lock, even if a newer screen replaced it.
      releaseInput();
      if (!this.sys.isActive() || transitionToken !== this.transitionToken) return;
      this.transitionPending = false;
      // Combat was initially rendered while the transition lock was active, so its
      // controls were intentionally disabled. Rebuild it once that lock is released.
      if (transition.view === 'combat' && this.run?.enemy && !this.enemyVariantLoading) this.drawCombat();
    });
  }

  private scheduleForCurrentScreen(delay: number, action: () => void): void {
    const generation = sceneInputGeneration(this);
    this.time.delayedCall(delay, () => {
      if (!this.sys.isActive() || !isSceneInputGenerationCurrent(this, generation)) return;
      action();
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
