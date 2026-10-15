import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameController } from '../../src/game/application/GameController.ts';
import { RULES, DERIVED_FORMULAS } from '../../src/game/rules/config.ts';
import { basicAttackRange } from '../../src/game/rules/combat.ts';
import { CLASS_DEFINITIONS } from '../../src/game/content/classes.ts';
import { CLASS_SKILLS } from '../../src/game/content/classSkills.ts';
import { SPECIALIZATIONS_BY_CLASS } from '../../src/game/content/specializations.ts';
import { HEALING_POTION_ID } from '../../src/game/content/items.ts';
import { chooseEnemyIntent } from '../../src/game/combat/CombatSystem.ts';

// Harness-only A/B: no game source or rule constants are changed.
const OUT = join(process.cwd(), 'reports', 'simulations');
const LOG_FILE = join(OUT, 'first-floor-ab-600.jsonl');
const SUMMARY_FILE = join(OUT, 'first-floor-ab-600-summary.json');
const CLASSES = ['warrior', 'rogue', 'mage'] as const;
const CLASS_LABEL = { warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago' };
const RUNS_PER_CLASS = 100;
const SEED_BASE = 202610130000;
const logs: any[] = [];
const summaries: Record<string, any> = {};

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
let policyRandom = Math.random;
function pInt(min: number, max: number): number { return Math.floor(policyRandom() * (max - min + 1)) + min; }
function event(runId: string, seed: number, scenario: string, classId: string, type: string, data: any = {}) {
  logs.push({ runId, seed, scenario, classId, type, ...data });
}
function snap(run: any) {
  return { hp: run.player.hp, maxHp: run.player.maxHp, mp: run.player.mp, maxMp: run.player.maxMp,
    enemyHp: run.enemy?.hp ?? null, enemyMp: run.enemy?.mp ?? null, level: run.player.level };
}
function chooseUpgrade(classId: typeof CLASSES[number]): 'for'|'dex'|'int'|'vit' {
  const primary = CLASS_DEFINITIONS[classId].primary;
  const bag: Array<'for'|'dex'|'int'|'vit'> = [primary, primary, 'vit', 'vit', ['for','dex','int','vit'][pInt(0,3)] as any];
  return bag[pInt(0, bag.length - 1)];
}
function isHostile(run: any): boolean {
  const intent = run.enemyInterruptedIntent ?? run.enemyIntent;
  if (!intent || intent === 'basic-attack') return false;
  if (intent.endsWith('-class-skill') && run.enemy?.classSkill) {
    const effect = CLASS_SKILLS[run.enemy.classSkill].effect;
    return effect !== 'aegis' && effect !== 'restore-health';
  }
  return true;
}
function expectedDamage(run: any): number {
  const e=run.enemy; if (!e) return 1;
  const intent=run.enemyInterruptedIntent ?? run.enemyIntent;
  if (intent==='heavy-attack') return DERIVED_FORMULAS.physicalDamage(e.stats,e.level).max;
  if (intent==='double-attack') return 2*basicAttackRange(e,'rogue').max*RULES.criticalMultiplier;
  if (intent==='fire-arrow') return DERIVED_FORMULAS.magicDamage(e.stats,e.level).max*RULES.fireArrowDamageMultiplier*RULES.criticalMultiplier;
  if (intent?.endsWith('-class-skill')&&e.classSkill) {
    const skill=CLASS_SKILLS[e.classSkill]; if(skill.effect==='aegis'||skill.effect==='restore-health')return 0;
    const r=skill.classId==='mage'?DERIVED_FORMULAS.magicDamage(e.stats,e.level):DERIVED_FORMULAS.physicalDamage(e.stats,e.level);
    return r.max*Math.max(1,skill.multiplier)*(skill.hitCount??1)*RULES.criticalMultiplier;
  }
  return Math.max(basicAttackRange(e,e.classId??'warrior').max,DERIVED_FORMULAS.magicDamage(e.stats,e.level).max)*RULES.criticalMultiplier;
}
function enemyInfo(e:any) { return e ? {name:e.name,class:e.classId,rarity:e.rarity,mutated:!!e.mutated,level:e.level} : null; }
function chooseAction(controller:GameController, stats:any, run: any):string {
  const ratio=run.player.hp/run.player.maxHp;
  const slot=run.inventory.findIndex((id:string|null)=>id===HEALING_POTION_ID);
  if(slot>=0&&ratio<=.60){controller.usePotion(slot);stats.potions++;}
  const hostile=isHostile(run), expected=expectedDamage(run);
  if(run.classId==='mage'&&hostile&&!run.player.magicShield&&run.player.mp>=RULES.magicShieldManaCost&&(ratio<=.65||expected>=run.player.hp*.55)){
    controller.magicShield();stats.magicShield++;return 'Escudo Mágico';
  }
  if(run.classId!=='mage'&&hostile&&(ratio<=.45||expected>=run.player.hp*.75)){controller.defend();stats.defend++;return 'Defender';}
  const skillId=run.player.classSkill;
  if(skillId&&run.player.level>=RULES.classSkillUnlockLevel){
    const skill=CLASS_SKILLS[skillId], afford=run.player.mp>=skill.manaCost, missing=1-ratio;
    if(afford&&((skill.effect==='restore-health'&&missing>=.25)||(skill.effect==='aegis'&&ratio<=.60))){controller.useClassSkill();stats.classSkill++;return skill.name;}
    if(afford&&!skill.effect&&policyRandom()<.45){controller.useClassSkill();stats.classSkill++;return skill.name;}
  }
  if(run.classId==='mage'){
    if(run.player.mp>=RULES.fireArrowManaCost&&policyRandom()<.68){controller.fireArrow();stats.fireArrow++;return 'Míssil de Fogo';}
    controller.basicAttack();stats.basic++;return 'Ataque básico';
  }
  const cost=run.classId==='warrior'?RULES.heavyAttackManaCost:RULES.doubleAttackManaCost;
  if(run.player.mp>=cost&&policyRandom()<.68){controller.classAbility();if(run.classId==='warrior')stats.heavy++;else stats.double++;return run.classId==='warrior'?'Ataque Pesado':'Ataque Duplo';}
  controller.basicAttack();stats.basic++;return 'Ataque básico';
}
function applyLevel(controller:GameController, stats:any, run:any, runId:string, seed:number, scenario:string, classId:string): void {
  // Pending skill choice is returned as transition.view='skill-choice' while RunState.status remains 'level-up'.
  if(run.pendingPoints<=0&&run.pendingSpecializationSelection){
    const choices=SPECIALIZATIONS_BY_CLASS[classId as keyof typeof SPECIALIZATIONS_BY_CLASS];
    const choice=choices[pInt(0,choices.length-1)];
    const t=controller.chooseSpecialization(choice as any);
    event(runId,seed,scenario,classId,'specialization',{room:run.roomIndex+1,choice,view:t.view,level:run.player.level});
    return;
  }
  const before=run.pendingPoints, attr=chooseUpgrade(classId as any), old=run.player.stats[attr];
  const t=controller.allocatePoint(attr as any);
  if(run.pendingPoints===before||run.player.stats[attr]===old){
    throw new Error(`level-up sem progresso: status=${run.status} view=${t.view} pendingPoints=${run.pendingPoints} specialization=${run.pendingSpecializationSelection} attr=${attr}`);
  }
  stats.upgrades++;
  event(runId,seed,scenario,classId,'upgrade',{room:run.roomIndex+1,attr,pointsLeft:run.pendingPoints,view:t.view,level:run.player.level});
}
function directHitDamage(messages:string[]):number[] {
  const hits:number[]=[];
  for(const m of messages){
    let match:RegExpMatchArray|null;
    if((match=m.match(/^Golpe inimigo \d+:[\s\S]*? final (\d+)/i))) hits.push(Number(match[1]));
    else if((match=m.match(/^[^:]+, golpe \d+:[\s\S]*?dano final (\d+)/i))) hits.push(Number(match[1]));
    else if((match=m.match(/^Cálculo do ataque básico .* inimigo:[\s\S]*?, dano (\d+)/i))) hits.push(Number(match[1]));
    else if((match=m.match(/^Cálculo pesado:[\s\S]*?dano (\d+)/i))) hits.push(Number(match[1]));
    else if((match=m.match(/^Míssil inimigo:[\s\S]*?; dano (\d+)/i))) hits.push(Number(match[1]));
  }
  return hits;
}
function applyTreatment(run:any, hits:number[], wasGameOver:boolean):number {
  let saved=0; for(const d of hits) if(d>1)saved++;
  if(!saved)return 0;
  run.player.hp=Math.min(run.player.maxHp,run.player.hp+saved);
  if(wasGameOver&&run.player.hp>0&&run.enemy){
    run.status='combat';run.playerTurn=true;run.enemyIntent=chooseEnemyIntent(run.enemy,run.player);
    run.enemyInterruptedIntent=undefined;run.enemyActionInterrupted=false;
  }
  return saved;
}
function median(xs:number[]):number|null {if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}

for(let ci=0;ci<CLASSES.length;ci++)for(let i=1;i<=RUNS_PER_CLASS;i++)for(const scenario of ['control','treatment'] as const){
  const classId=CLASSES[ci], seed=SEED_BASE+ci*10000+i, runId=`${classId}-${String(i).padStart(3,'0')}-${scenario}`;
  Math.random=seeded(seed); policyRandom=seeded(seed^0x6d2b79f5);
  const controller=new GameController();controller.startRun(classId);const run:any=controller.state;
  const ac:any={basic:0,heavy:0,double:0,fireArrow:0,classSkill:0,defend:0,magicShield:0,potions:0,upgrades:0};
  const rec:any={runId,seed,scenario,classId,outcome:'unknown',deathRoom:null,deathEnemy:null,reachedBoss:false,killedBoss:false,deathDmg:0,enemyCount:0,kills:0,maxLevel:run.player.level,room1EndHp:null,bossHp:null,bossMp:null,bossLevel:null,actions:ac,rooms:[]};
  event(runId,seed,scenario,classId,'start',{hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp,stats:{...run.player.stats}});
  let currentRoom=-1,iterations=0;
  while(iterations++<15000){
    if(run.status==='game-over'){rec.outcome='death';rec.deathRoom=run.roomIndex+1;rec.deathEnemy=enemyInfo(run.enemy);break;}
    const roomNo=run.roomIndex+1;
    if(roomNo!==currentRoom){currentRoom=roomNo;const room=run.rooms[run.roomIndex];rec.rooms.push(room.event);if(run.enemy)rec.enemyCount++;if(roomNo===10&&run.dungeonLevel===1){rec.reachedBoss=true;rec.bossHp=run.player.hp;rec.bossMp=run.player.mp;rec.bossLevel=run.player.level;}event(runId,seed,scenario,classId,'room',{room:roomNo,event:room.event,hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,level:run.player.level,enemy:enemyInfo(run.enemy)});}
    if(run.status==='combat'){
      if(run.playerTurn){const before=snap(run),action=chooseAction(controller,ac,run);const after=snap(run);if(before.enemyHp!==null&&after.enemyHp===0)rec.kills++;rec.maxLevel=Math.max(rec.maxLevel,run.player.level);event(runId,seed,scenario,classId,'action',{room:roomNo,actor:'player',action,hp:after.hp,mp:after.mp,enemyHp:after.enemyHp,dealt:Math.max(0,(before.enemyHp??0)-(after.enemyHp??0)),received:0});}
      else{
        const before=snap(run),enemy=run.enemy, eligible=scenario==='treatment'&&enemy?.rarity==='normal'&&enemy.level===1&&run.dungeonLevel===1&&run.roomIndex<=2;
        const cursor=run.combatLog?.length??0, trans=controller.enemyTurn();let messages=(run.combatLog??[]).slice(cursor).map((e:any)=>e.text);let after=snap(run);let received=Math.max(0,before.hp-after.hp),saved=0;
        if(eligible){saved=applyTreatment(run,directHitDamage(messages),trans.view==='game-over');after=snap(run);if(saved){if(trans.view==='game-over')rec.outcome='revived-by-treatment';}}
        rec.deathDmg+=received-saved;event(runId,seed,scenario,classId,'action',{room:roomNo,actor:'enemy',action:run.enemyInterruptedIntent??run.enemyIntent??'enemy-action',enemy:enemyInfo(enemy),hp:after.hp,mp:after.mp,enemyHp:after.enemyHp,received:Math.max(0,before.hp-after.hp),mitigated:saved,messages:messages.filter((m:string)=>/dano|esquiv|crítico|interrupção/i.test(m)).slice(0,5)});
        if(run.status==='game-over'&&rec.outcome!=='revived-by-treatment')continue;
      }
    }else if(run.pendingSpecializationSelection&&run.pendingPoints<=0){applyLevel(controller,ac,run,runId,seed,scenario,classId);rec.maxLevel=Math.max(rec.maxLevel,run.player.level);}
    else if(run.status==='level-up'){applyLevel(controller,ac,run,runId,seed,scenario,classId);rec.maxLevel=Math.max(rec.maxLevel,run.player.level);}
    else if(run.status==='skill-choice'){applyLevel(controller,ac,run,runId,seed,scenario,classId);}
    else if(run.status==='loot-choice'){controller.chooseLoot(Math.max(0,run.inventory.findIndex((x:string|null)=>x===null)));}
    else if(run.status==='room'){
      const room=run.rooms[run.roomIndex];
      if(room&&!room.resolved){if(room.event==='rest'||room.event==='chest')controller.interactRoomEvent();else throw new Error(`Unresolved room ${roomNo} (${room.event})`);}
      else if(room?.resolved&&!room.completionAcknowledged){controller.acknowledgeRoomCompletion();if(roomNo===1)rec.room1EndHp=run.player.hp;}
      else if(room?.resolved&&room.completionAcknowledged){if(roomNo===10&&run.dungeonLevel===1){rec.outcome='boss-killed';rec.killedBoss=true;break;}controller.advanceRoom();}
      else throw new Error(`Unexpected room state ${roomNo}`);
    }else throw new Error(`Unexpected run status ${run.status}`);
  }
  if(iterations>=15000&&rec.outcome==='unknown')rec.outcome='step-limit';
  if(rec.outcome==='unknown')rec.outcome=run.status==='game-over'?'death':rec.killedBoss?'boss-killed':'runner-error';
  if(rec.outcome==='death'){rec.deathRoom??=run.roomIndex+1;rec.deathEnemy??=enemyInfo(run.enemy);}
  rec.final={room:run.roomIndex+1,hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp,level:run.player.level};
  event(runId,seed,scenario,classId,'end',{outcome:rec.outcome,deathRoom:rec.deathRoom,deathEnemy:rec.deathEnemy,room1EndHp:rec.room1EndHp,bossHp:rec.bossHp,bossMp:rec.bossMp,bossLevel:rec.bossLevel,kills:rec.kills,enemies:rec.enemyCount,damageTaken:rec.deathDmg,maxLevel:rec.maxLevel,final:rec.final,actions:ac});
  (summaries[classId]??=[]).push(rec);
}

for(const cls of CLASSES){
 const all=summaries[cls],out:any={};
 for(const scenario of ['control','treatment']){
  const rs=all.filter((r:any)=>r.scenario===scenario),deaths=rs.filter((r:any)=>r.outcome==='death'),censored=rs.filter((r:any)=>!['death','boss-killed'].includes(r.outcome));
  const byRoom:Record<string,number>={};for(const r of deaths)byRoom[String(r.deathRoom??'?')]=(byRoom[String(r.deathRoom??'?')]??0)+1;
  const avg=(key:string)=>+(rs.reduce((n:number,r:any)=>n+(r[key]??0),0)/rs.length).toFixed(2);
  const actions:any={};for(const key of ['basic','heavy','double','fireArrow','classSkill','defend','magicShield','potions'])actions[key]={total:rs.reduce((n:number,r:any)=>n+(r.actions[key]??0),0),perAttempt:+(rs.reduce((n:number,r:any)=>n+(r.actions[key]??0),0)/rs.length).toFixed(2)};
  out[scenario]={attempts:rs.length,deaths:deaths.length,deathRate:deaths.length/rs.length,censored:censored.length,censoredRuns:censored.map((r:any)=>({runId:r.runId,outcome:r.outcome,room:r.final.room,hp:r.final.hp,level:r.final.level})),deathsByRoom:byRoom,reachedBoss:rs.filter((r:any)=>r.reachedBoss).length,bossKilled:rs.filter((r:any)=>r.killedBoss).length,room1EndHp:{count:rs.filter((r:any)=>r.room1EndHp!==null).length,mean:rs.some((r:any)=>r.room1EndHp!==null)?+(rs.filter((r:any)=>r.room1EndHp!==null).reduce((n:number,r:any)=>n+r.room1EndHp,0)/rs.filter((r:any)=>r.room1EndHp!==null).length).toFixed(2):null},bossEntry:rs.filter((r:any)=>r.bossHp!==null).map((r:any)=>({hp:r.bossHp,mp:r.bossMp,level:r.bossLevel})),enemiesDefeated:{mean:avg('kills'),median:median(rs.map((r:any)=>r.kills))},maxLevel:{mean:avg('maxLevel'),median:median(rs.map((r:any)=>r.maxLevel)),max:Math.max(...rs.map((r:any)=>r.maxLevel))},damageTaken:{mean:avg('deathDmg'),perAttempt:avg('deathDmg')},actions};
 }
 const c=out.control,t=out.treatment;out.paired={deathDelta:c.deaths-t.deaths,room1Deaths:{control:c.deathsByRoom['1']??0,treatment:t.deathsByRoom['1']??0},reachedBossDelta:t.reachedBoss-c.reachedBoss,bossKillsDelta:t.bossKilled-c.bossKilled};
 summaries[cls]=out;
}
const result={method:{runsPerClassPerScenario:100,totalRuns:600,seedBase:SEED_BASE,seedFormula:'seedBase+classIndex*10000+runIndex; unique seeds paired across scenarios',rng:'gameplay RNG and decision/upgrades RNG are separate deterministic streams; the same seed gives identical policy decision sequence and upgrade draws for both arms',policy:'Same tactical policy in both arms: free healing item at HP<=60%, defender/escudo against dangerous telegraphed skill at low HP, offensive class ability/fire arrow with 68% opportunity chance, random weighted upgrades favor primary stat/VIT, uniform specialization.',intervention:'Harness only: after normal engine damage calculation, for each landed direct enemy hit, if enemy rarity normal, level 1, floor 1, roomIndex 0-2, replace damage d with max(1,d-1). No damage-over-time change. Game source/rules unchanged.',limitations:'The treatment correction is applied to post-resolution direct-hit amounts parsed from combat log. If it rescues a fatal hit, harness restores combat state and rolls the next enemy intent; temporary effects cleared by GameController game-over cleanup remain ended. Any censored/runner-error attempts are listed explicitly.'},validation:{runs:600,completed:logs.filter(x=>x.type==='end').length,outcomes:Object.fromEntries(['death','boss-killed','step-limit','runner-error','revived-by-treatment'].map(o=>[o,logs.filter(x=>x.type==='end'&&x.outcome===o).length]))},byClass:summaries};
mkdirSync(OUT,{recursive:true});writeFileSync(LOG_FILE,logs.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');writeFileSync(SUMMARY_FILE,JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({log:LOG_FILE,summary:SUMMARY_FILE,validation:result.validation,byClass:Object.fromEntries(CLASSES.map(c=>[c,{control:result.byClass[c].control,treatment:result.byClass[c].treatment,paired:result.byClass[c].paired}]))},null,2));
