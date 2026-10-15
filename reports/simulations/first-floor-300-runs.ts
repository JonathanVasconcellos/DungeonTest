import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GameController } from '../../src/game/application/GameController.ts';
import { RULES, DERIVED_FORMULAS } from '../../src/game/rules/config.ts';
import { basicAttackRange } from '../../src/game/rules/combat.ts';
import { CLASS_DEFINITIONS } from '../../src/game/content/classes.ts';
import { CLASS_SKILLS } from '../../src/game/content/classSkills.ts';
import { SPECIALIZATIONS_BY_CLASS } from '../../src/game/content/specializations.ts';
import { HEALING_POTION_ID } from '../../src/game/content/items.ts';

const OUT = join(process.cwd(), 'reports', 'simulations');
const EVENT_FILE = join(OUT, 'first-floor-300-runs.jsonl');
const SUMMARY_FILE = join(OUT, 'first-floor-300-summary.json');
const CLASSES = ['warrior', 'rogue', 'mage'] as const;
const CLASS_LABEL = { warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago' };
const RUNS_PER_CLASS = 100;
const SEED_BASE = 202610130000;
const rows: any[] = [];
const summaries: Record<string, any> = {};

function seedRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function int(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function snapshot(run: any): any {
  return { playerHp: run.player.hp, playerMaxHp: run.player.maxHp, playerMp: run.player.mp, playerMaxMp: run.player.maxMp,
    enemyHp: run.enemy?.hp ?? null, enemyMaxHp: run.enemy?.maxHp ?? null, enemyMp: run.enemy?.mp ?? null, enemyMaxMp: run.enemy?.maxMp ?? null,
    playerLevel: run.player.level, playerStats: { ...run.player.stats }, enemyIntent: run.enemyInterruptedIntent ?? run.enemyIntent ?? null,
    defending: run.defending === true, inventory: [...run.inventory] };
}
function push(runId: string, seed: number, classId: string, type: string, fields: any = {}): void {
  rows.push({ runId, seed, playerClass: classId, eventType: type, ...fields });
}
function isEnemyAttackIntent(run: any): boolean {
  const intent = run.enemyInterruptedIntent ?? run.enemyIntent;
  if (!intent || intent === 'basic-attack') return false;
  if (intent.endsWith('-class-skill') && run.enemy?.classSkill) {
    const effect = CLASS_SKILLS[run.enemy.classSkill].effect;
    return effect !== 'aegis' && effect !== 'restore-health';
  }
  return true;
}
function expectedHitDamage(run: any): number {
  const enemy = run.enemy;
  if (!enemy) return 1;
  const intent = run.enemyInterruptedIntent ?? run.enemyIntent;
  if (intent === 'heavy-attack') return DERIVED_FORMULAS.physicalDamage(enemy.stats, enemy.level).max;
  if (intent === 'double-attack') return 2 * basicAttackRange(enemy, 'rogue').max * RULES.criticalMultiplier;
  if (intent === 'fire-arrow') return DERIVED_FORMULAS.magicDamage(enemy.stats, enemy.level).max * RULES.fireArrowDamageMultiplier * RULES.criticalMultiplier;
  if (intent?.endsWith('-class-skill') && enemy.classSkill) {
    const skill = CLASS_SKILLS[enemy.classSkill];
    if (skill.effect === 'aegis' || skill.effect === 'restore-health') return 0;
    const range = skill.classId === 'mage' ? DERIVED_FORMULAS.magicDamage(enemy.stats, enemy.level)
      : DERIVED_FORMULAS.physicalDamage(enemy.stats, enemy.level);
    return range.max * Math.max(1, skill.multiplier) * (skill.hitCount ?? 1) * RULES.criticalMultiplier;
  }
  return Math.max(basicAttackRange(enemy, enemy.classId ?? 'warrior').max,
    DERIVED_FORMULAS.magicDamage(enemy.stats, enemy.level).max) * RULES.criticalMultiplier;
}
function chooseUpgrade(classId: typeof CLASSES[number]): 'for'|'dex'|'int'|'vit' {
  const primary = CLASS_DEFINITIONS[classId].primary;
  const weighted: Array<'for'|'dex'|'int'|'vit'> = [primary, primary, 'vit', 'vit', ['for','dex','int','vit'][int(0,3)] as any];
  return weighted[int(0, weighted.length - 1)];
}
function choosePlayerAction(controller: GameController, counts: any): { action: string; usedItem?: string } {
  const run: any = controller.state;
  const hpRatio = run.player.hp / run.player.maxHp;
  const healingSlot = run.inventory.findIndex((id: string|null) => id === HEALING_POTION_ID);
  if (healingSlot >= 0 && hpRatio <= 0.60) {
    const before = snapshot(run); const enemy = run.enemy;
    controller.usePotion(healingSlot); counts.healingPotions += 1;
    push(counts.runId, counts.seed, counts.classId, 'player_item', {
      room: run.roomIndex + 1, roomEvent: run.rooms[run.roomIndex]?.event,
      enemy: enemy ? enemySummary(enemy) : null, actor: 'player', action: 'Poção de Cura',
      ...before, playerHpAfter: run.player.hp, playerMpAfter: run.player.mp,
      enemyHpAfter: run.enemy?.hp ?? null, enemyMpAfter: run.enemy?.mp ?? null,
      damageDealt: 0, damageReceived: 0, result: 'item usado; ação não consumiu turno',
    });
  }
  const enemy = run.enemy;
  const hostileIntent = isEnemyAttackIntent(run);
  const expected = expectedHitDamage(run);
  const canBrace = hostileIntent && (hpRatio <= 0.45 || expected >= run.player.hp * 0.75);
  if (run.classId === 'mage' && hostileIntent && !run.player.magicShield && run.player.mp >= RULES.magicShieldManaCost
      && (hpRatio <= 0.65 || expected >= run.player.hp * 0.55)) {
    controller.magicShield(); counts.magicShield += 1;
    return { action: 'Escudo Mágico' };
  }
  if (run.classId !== 'mage' && canBrace) {
    controller.defend(); counts.defend += 1;
    return { action: 'Defender' };
  }
  const skillId = run.player.classSkill;
  if (skillId && run.player.level >= RULES.classSkillUnlockLevel) {
    const skill = CLASS_SKILLS[skillId];
    const canAfford = run.player.mp >= skill.manaCost;
    const hpMissing = 1 - hpRatio;
    if (canAfford && (skill.effect === 'restore-health' && hpMissing >= 0.25
        || skill.effect === 'aegis' && hpRatio <= 0.60)) {
      controller.useClassSkill(); counts.classSkill += 1;
      return { action: `Habilidade de classe: ${skill.name}` };
    }
    if (canAfford && !skill.effect && Math.random() < 0.45) {
      controller.useClassSkill(); counts.classSkill += 1;
      return { action: `Habilidade de classe: ${skill.name}` };
    }
  }
  if (run.classId === 'mage') {
    if (run.player.mp >= RULES.fireArrowManaCost && Math.random() < 0.68) {
      controller.fireArrow(); counts.fireArrow += 1; return { action: 'Míssil de Fogo' };
    }
    controller.basicAttack(); counts.basicAttack += 1; return { action: 'Ataque básico' };
  }
  if (run.player.mp >= (run.classId === 'warrior' ? RULES.heavyAttackManaCost : RULES.doubleAttackManaCost)
      && Math.random() < 0.68) {
    controller.classAbility();
    if (run.classId === 'warrior') counts.heavyAttack += 1; else counts.doubleAttack += 1;
    return { action: run.classId === 'warrior' ? 'Ataque Pesado' : 'Ataque Duplo' };
  }
  controller.basicAttack(); counts.basicAttack += 1; return { action: 'Ataque básico' };
}
function enemySummary(enemy: any): any {
  return { name: enemy.name, class: enemy.classId, rarity: enemy.rarity, mutated: enemy.mutated,
    level: enemy.level, stats: { ...enemy.stats }, hp: enemy.hp, maxHp: enemy.maxHp, mp: enemy.mp, maxMp: enemy.maxMp };
}
function chooseProgression(controller: GameController, counts: any): void {
  const run: any = controller.state;
  if (run.status === 'level-up') {
    const attr = chooseUpgrade(run.classId); const before = snapshot(run); const prior = run.player.stats[attr];
    controller.allocatePoint(attr); counts.upgrades[attr] += 1;
    push(counts.runId, counts.seed, counts.classId, 'upgrade', {
      room: run.roomIndex + 1, actor: 'player', action: 'Distribuição de ponto', attribute: attr,
      attributeBefore: prior, attributeAfter: run.player.stats[attr], ...before,
      playerHpAfter: run.player.hp, playerMaxHpAfter: run.player.maxHp,
      playerMpAfter: run.player.mp, playerMaxMpAfter: run.player.maxMp,
      result: 'escolha pseudoaleatória ponderada: primário/VIT favorecidos; pontos restantes uniformes',
    });
    return;
  }
  if (run.status === 'skill-choice' && run.pendingSpecializationSelection) {
    const options = SPECIALIZATIONS_BY_CLASS[run.classId]; const choice = options[int(0, options.length - 1)];
    controller.chooseSpecialization(choice); counts.specializations[choice] = (counts.specializations[choice] ?? 0) + 1;
    push(counts.runId, counts.seed, counts.classId, 'specialization', {
      room: run.roomIndex + 1, actor: 'player', action: 'Escolha de especialização', specialization: choice,
      playerLevel: run.player.level, playerHp: run.player.hp, playerMaxHp: run.player.maxHp,
      playerMp: run.player.mp, playerMaxMp: run.player.maxMp,
    });
    return;
  }
}
function median(numbers: number[]): number|null {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a,b)=>a-b); const middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
function aggregate(classId: string, results: any[], runCounts: any[]): any {
  const n=results.length; const reached=results.filter(r=>r.reachedBoss).length; const killed=results.filter(r=>r.killedBoss).length;
  const levels=results.map(r=>r.maxLevel); const kills=results.map(r=>r.enemiesDefeated);
  const deathsByRoom: Record<string,number>={}; const deathsByEnemy: Record<string,number>={};
  for(const r of results) if(r.outcome==='death') {
    const room=String(r.deathRoom??'?'); deathsByRoom[room]=(deathsByRoom[room]??0)+1;
    const k=`${r.deathEnemy?.class??'?'}/${r.deathEnemy?.rarity??'?'}/${r.deathEnemy?.mutated?'mutante':'normal'}`;
    deathsByEnemy[k]=(deathsByEnemy[k]??0)+1;
  }
  const entries=results.filter(r=>r.bossEntry).map(r=>r.bossEntry);
  const eventCounts: Record<string,number>={};
  for(const r of results) for(const event of r.roomEvents) eventCounts[event]=(eventCounts[event]??0)+1;
  const sum=(key:string)=>runCounts.reduce((x,r)=>x+(r[key]??0),0);
  const actionNames=['basicAttack','heavyAttack','doubleAttack','fireArrow','classSkill','defend','magicShield','healingPotions'];
  const frequency:any={}; for(const key of actionNames) frequency[key]={total:sum(key), perRun:+(sum(key)/n).toFixed(2), runsWithUse:runCounts.filter(r=>(r[key]??0)>0).length};
  return { classId, className:CLASS_LABEL[classId as keyof typeof CLASS_LABEL], attempts:n,
    reachedRoom10:{count:reached,rate:reached/n}, bossKilled:{count:killed,rate:killed/n},
    deathsByRoom,deathsByEnemyClassRarityMutation:deathsByEnemy,
    maxPlayerLevel:{max:Math.max(...levels),median:median(levels),values:levels},
    enemiesDefeated:{mean:+(kills.reduce((a,b)=>a+b,0)/n).toFixed(2),median:median(kills),total:kills.reduce((a,b)=>a+b,0)},
    bossEntry:{count:entries.length,playerHp:{mean:entries.length?+(entries.reduce((a,b)=>a+b.hp,0)/entries.length).toFixed(2):null,median:median(entries.map(e=>e.hp))},
      playerHpPercent:{mean:entries.length?+(entries.reduce((a,b)=>a+b.hp/b.eHpMax,0)/entries.length*100).toFixed(1):null},
      playerMp:{mean:entries.length?+(entries.reduce((a,b)=>a+b.mp,0)/entries.length).toFixed(2):null,median:median(entries.map(e=>e.mp))},
      playerLevel:{mean:entries.length?+(entries.reduce((a,b)=>a+b.level,0)/entries.length).toFixed(2):null,median:median(entries.map(e=>e.level))}},
    eventsEntered:eventCounts, actionFrequency:frequency,
    upgrades:Object.fromEntries(['for','dex','int','vit'].map(k=>[k,sumUpgrade(runCounts,k)])),
    specializations:Object.assign({},...runCounts.map(r=>r.specializations)),
  };
}
function sumUpgrade(runs:any[],key:string):number{return runs.reduce((n,r)=>n+(r.upgrades[key]??0),0);}

for(let c=0;c<CLASSES.length;c++) {
  const classId=CLASSES[c]; const results:any[]=[]; const runCounts:any[]=[];
  for(let index=1;index<=RUNS_PER_CLASS;index++) {
    const seed=SEED_BASE+c*10000+index; seedRandom(seed);
    const runId=`${classId}-${String(index).padStart(3,'0')}`;
    const controller=new GameController(); controller.startRun(classId); const run:any=controller.state;
    const counts:any={runId,seed,classId,basicAttack:0,heavyAttack:0,doubleAttack:0,fireArrow:0,classSkill:0,defend:0,magicShield:0,healingPotions:0,upgrades:{for:0,dex:0,int:0,vit:0},specializations:{}};
    const result:any={runId,seed,classId,outcome:'unknown',reachedBoss:false,killedBoss:false,deathRoom:null,deathEnemy:null,maxLevel:run.player.level,enemiesDefeated:0,roomEvents:[],bossEntry:null};
    push(runId,seed,classId,'run_start',{player:{stats:{...run.player.stats},hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp},policy:'tática aleatória: poção em HP <=60%; defesa/escudo contra intenção ofensiva perigosa em HP baixo; habilidade ofensiva probabilística; upgrades favorecem atributo primário/VIT; especialização uniforme.'});
    let loggedRoom=-1, logCursor=run.combatLog?.length??0;
    for(let steps=0;steps<10000;steps++) {
      if(run.status==='game-over'){result.outcome='death';result.deathRoom=run.roomIndex+1;result.deathEnemy=run.enemy?enemySummary(run.enemy):null;break;}
      const roomNo=run.roomIndex+1;
      if(roomNo!==loggedRoom) {
        loggedRoom=roomNo; const room=run.rooms[run.roomIndex]; const enemy=run.enemy?enemySummary(run.enemy):null;
        result.roomEvents.push(room.event); if(roomNo===10 && run.dungeonLevel===1){result.reachedBoss=true; result.bossEntry={hp:run.player.hp,eHpMax:run.player.maxHp,mp:run.player.mp,mpMax:run.player.maxMp,level:run.player.level};}
        if(enemy) { result.enemyCount=(result.enemyCount??0)+1; }
        push(runId,seed,classId,'room_enter',{dungeonLevel:run.dungeonLevel,room:roomNo,roomEvent:room.event,player:{hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp,level:run.player.level,stats:{...run.player.stats}},enemy});
        logCursor=run.combatLog?.length??0;
      }
      if(run.status==='combat') {
        const before=snapshot(run); const enemyBefore=run.enemy?enemySummary(run.enemy):null;
        let action:string; let actor:string; let transition:any;
        if(run.playerTurn) { actor='player'; const selected=choosePlayerAction(controller,counts); action=selected.action; transition={view:run.status}; }
        else { actor='enemy'; action=run.enemyInterruptedIntent??run.enemyIntent??'Ataque básico'; transition=controller.enemyTurn(); }
        const after=snapshot(run); const messages=(run.combatLog??[]).slice(logCursor).map((entry:any)=>entry.text); logCursor=run.combatLog?.length??0;
        const didDefend=actor==='player' && (action==='Defender'||action==='Escudo Mágico');
        if(actor==='player' && before.enemyHp!==null && after.enemyHp===0) result.enemiesDefeated+=1;
        push(runId,seed,classId,actor==='player'?'player_action':'enemy_action',{
          dungeonLevel:run.dungeonLevel,room:roomNo,roomEvent:run.rooms[run.roomIndex]?.event,
          enemy:enemyBefore?{...enemyBefore,hpAfter:after.enemyHp,mpAfter:after.enemyMp}:null,actor,action,
          playerHpBefore:before.playerHp,playerHpAfter:after.playerHp,playerMaxHp:before.playerMaxHp,
          playerMpBefore:before.playerMp,playerMpAfter:after.playerMp,playerMaxMp:before.playerMaxMp,
          enemyHpBefore:before.enemyHp,enemyHpAfter:after.enemyHp,enemyMpBefore:before.enemyMp,enemyMpAfter:after.enemyMp,
          damageDealt:Math.max(0,(before.enemyHp??0)-(after.enemyHp??0)),damageReceived:Math.max(0,before.playerHp-after.playerHp),
          crit:messages.some((m:string)=>/crítico sim|crítico\)|crítico\./i.test(m)),dodge:messages.some((m:string)=>/esquivado|esquivou/i.test(m)),
          defend:didDefend,usedItem:action==='Poção de Cura',intent:before.enemyIntent,result:transition.view,messages,
        });
        result.maxLevel=Math.max(result.maxLevel,run.player.level);
        if(run.status==='game-over') continue;
      } else if(run.status==='level-up') {
        chooseProgression(controller,counts); logCursor=run.combatLog?.length??0; result.maxLevel=Math.max(result.maxLevel,run.player.level);
      } else if(run.status==='skill-choice') {
        chooseProgression(controller,counts); logCursor=run.combatLog?.length??0;
      } else if(run.status==='loot-choice') {
        const before=snapshot(run); const slot=run.inventory.findIndex((item:string|null)=>item===null);
        controller.chooseLoot(slot>=0?slot:0); counts.lootChoices=(counts.lootChoices??0)+1;
        push(runId,seed,classId,'loot_choice',{room:roomNo,playerHpBefore:before.playerHp,playerHpAfter:run.player.hp,playerMpBefore:before.playerMp,playerMpAfter:run.player.mp,choice:slot>=0?`guardar no espaço ${slot+1}`:'substituir espaço 1',pendingLoot:run.pendingLoot??null});
        logCursor=run.combatLog?.length??0;
      } else if(run.status==='room') {
        const room=run.rooms[run.roomIndex];
        if(room && !room.resolved) {
          if(room.event==='rest'||room.event==='chest') {
            const before=snapshot(run); const event=room.event; controller.interactRoomEvent();
            push(runId,seed,classId,'room_interaction',{room:roomNo,roomEvent:event,playerHpBefore:before.playerHp,playerHpAfter:run.player.hp,playerMpBefore:before.playerMp,playerMpAfter:run.player.mp,enemy:null,result:'evento acionado'});
            logCursor=run.combatLog?.length??0;
          } else throw new Error(`Sala ${roomNo} sem evento resolvido: ${room.event}`);
        } else if(room?.resolved && !room.completionAcknowledged) {
          const before=snapshot(run); controller.acknowledgeRoomCompletion();
          push(runId,seed,classId,'room_acknowledged',{room:roomNo,playerHpBefore:before.playerHp,playerHpAfter:run.player.hp,playerMaxHp:run.player.maxHp,playerMpBefore:before.playerMp,playerMpAfter:run.player.mp,playerMaxMp:run.player.maxMp,roomEvent:room.event});
          logCursor=run.combatLog?.length??0;
        } else if(room?.resolved && room.completionAcknowledged) {
          if(roomNo===10 && run.dungeonLevel===1) {result.outcome='boss-killed';result.killedBoss=true;break;}
          controller.advanceRoom(); logCursor=run.combatLog?.length??0;
        } else throw new Error(`Estado de sala inesperado ${roomNo}`);
      } else throw new Error(`Status inesperado: ${run.status}`);
    }
    result.maxLevel=Math.max(result.maxLevel,run.player.level);
    result.final={room:run.roomIndex+1,hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp,level:run.player.level,enemiesDefeated:result.enemiesDefeated};
    if(result.outcome==='unknown') result.outcome=result.killedBoss?'boss-killed':'step-limit';
    push(runId,seed,classId,'run_end',{outcome:result.outcome,reachedRoom10:result.reachedBoss,killedBoss:result.killedBoss,deathRoom:result.deathRoom,deathEnemy:result.deathEnemy,maxLevel:result.maxLevel,enemiesDefeated:result.enemiesDefeated,final:result.final,bossEntry:result.bossEntry});
    results.push(result); runCounts.push(counts);
  }
  summaries[classId]=aggregate(classId,results,runCounts);
}
const report={method:{runsPerClass:RUNS_PER_CLASS,classes:CLASSES,seedBase:SEED_BASE,seedFormula:'seedBase + classIndex*10000 + runIndex (index 1..100); LCG Math.random, state=(1664525*state+1013904223) mod 2^32.',target:'Até morte ou conclusão do chefe da sala 10 do primeiro andar.',policy:'Tática probabilística: cura gratuita com poção em HP<=60%; Defender/Escudo Mágico com intenção ofensiva e HP baixo ou dano previsto perigoso; habilidade ofensiva em 68% das oportunidades com MP; habilidades de especialização em 45% das oportunidades quando aptas; melhorias aleatórias favorecem atributo primário e VIT; especialização escolhida uniformemente.',limitations:'Simulação da lógica GameController sem interface/tempo de animações. Política artificial não é comportamento real de jogadores. Cada classe tem 100 sementes, suficiente para sinais preliminares, não prova de equilíbrio; RNG determinístico por partida.'},rulesObserved:{maxHp:'20 + 10*(level-1) + 10*(VIT-1)',enemyFireArrowManaCost:2,playerFireArrowManaCost:2,postCombatRecovery:'HP + floor(maxHP/2), MP + floor(maxMP/3), capped'},byClass:summaries};
mkdirSync(OUT,{recursive:true}); writeFileSync(EVENT_FILE,rows.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8'); writeFileSync(SUMMARY_FILE,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({eventFile:EVENT_FILE,summaryFile:SUMMARY_FILE,eventRows:rows.length,summary:Object.fromEntries(Object.entries(summaries).map(([k,v]:any)=>[k,{reachedRoom10:v.reachedRoom10,bossKilled:v.bossKilled,deathsByRoom:v.deathsByRoom,level:v.maxPlayerLevel,enemies:v.enemiesDefeated}]))},null,2));
