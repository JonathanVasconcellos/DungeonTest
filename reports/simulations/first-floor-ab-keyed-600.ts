import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameController } from './harness-source/application/GameController.ts';
import { RULES, DERIVED_FORMULAS } from './harness-source/rules/config.ts';
import { basicAttackRange } from './harness-source/rules/combat.ts';
import { CLASS_DEFINITIONS } from './harness-source/content/classes.ts';
import { CLASS_SKILLS } from './harness-source/content/classSkills.ts';
import { SPECIALIZATIONS_BY_CLASS } from './harness-source/content/specializations.ts';
import { HEALING_POTION_ID } from './harness-source/content/items.ts';

// Harness-only A/B: no game source or rule constants are changed.
const OUT = join(process.cwd(), 'reports', 'simulations');
const LOG_FILE = join(OUT, 'first-floor-ab-keyed-600.jsonl');
const SUMMARY_FILE = join(OUT, 'first-floor-ab-keyed-600-summary.json');
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
function hashKey(...parts: Array<string | number>): number {
  let h = 2166136261;
  for (const char of parts.join(':')) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function scopeRandom(seed: number, ...key: Array<string | number>): void { Math.random = seeded(hashKey(seed, ...key)); }
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
  policyRandom=seeded(hashKey(seed,'policy','level',run.dungeonLevel,run.roomIndex,run.player.level,run.pendingPoints,run.pendingSpecializationSelection?1:0));
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
function interventionDamage(damage:number):number { return damage > 1 ? damage - 1 : damage; }
function median(xs:number[]):number|null {if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}

for(let ci=0;ci<CLASSES.length;ci++)for(let i=1;i<=RUNS_PER_CLASS;i++)for(const scenario of ['control','treatment'] as const){
  const classId=CLASSES[ci], seed=SEED_BASE+ci*10000+i, runId=`${classId}-${String(i).padStart(3,'0')}-${scenario}`;
  scopeRandom(seed,'world'); policyRandom=seeded(hashKey(seed,'policy','world'));
  const controller=new GameController();controller.startRun(classId);const run:any=controller.state;
  const ac:any={basic:0,heavy:0,double:0,fireArrow:0,classSkill:0,defend:0,magicShield:0,potions:0,upgrades:0};
  const rec:any={runId,seed,scenario,classId,outcome:'unknown',deathRoom:null,deathEnemy:null,reachedBoss:false,killedBoss:false,deathDmg:0,enemyCount:0,kills:0,maxLevel:run.player.level,room1EndHp:null,bossHp:null,bossMp:null,bossLevel:null,actions:ac,rooms:[]};
  event(runId,seed,scenario,classId,'start',{hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,maxMp:run.player.maxMp,stats:{...run.player.stats}});
  let currentRoom=-1,iterations=0,playerActionIndex=0,enemyActionIndex=0;
  while(iterations++<15000){
    if(run.status==='game-over'){rec.outcome='death';rec.deathRoom=run.roomIndex+1;rec.deathEnemy=enemyInfo(run.enemy);break;}
    const roomNo=run.roomIndex+1;
    if(roomNo!==currentRoom){currentRoom=roomNo;playerActionIndex=0;enemyActionIndex=0;const room=run.rooms[run.roomIndex];rec.rooms.push(room.event);if(run.enemy)rec.enemyCount++;if(roomNo===10&&run.dungeonLevel===1){rec.reachedBoss=true;rec.bossHp=run.player.hp;rec.bossMp=run.player.mp;rec.bossLevel=run.player.level;}event(runId,seed,scenario,classId,'room',{room:roomNo,event:room.event,hp:run.player.hp,maxHp:run.player.maxHp,mp:run.player.mp,level:run.player.level,enemy:enemyInfo(run.enemy)});}
    if(run.status==='combat'){
      if(run.playerTurn){scopeRandom(seed,'combat',roomNo,'player',playerActionIndex);policyRandom=seeded(hashKey(seed,'policy',roomNo,playerActionIndex));const before=snap(run),action=chooseAction(controller,ac,run);playerActionIndex++;const after=snap(run);if(before.enemyHp!==null&&after.enemyHp===0)rec.kills++;rec.maxLevel=Math.max(rec.maxLevel,run.player.level);event(runId,seed,scenario,classId,'action',{room:roomNo,actor:'player',action,hp:after.hp,mp:after.mp,enemyHp:after.enemyHp,dealt:Math.max(0,(before.enemyHp??0)-(after.enemyHp??0)),received:0});}
      else{
        scopeRandom(seed,'combat',roomNo,'enemy',enemyActionIndex++);
        const before=snap(run),enemy=run.enemy, eligible=scenario==='treatment'&&enemy?.rarity==='normal'&&enemy.level===1&&run.dungeonLevel===1&&run.roomIndex<=2;
        const cursor=run.combatLog?.length??0, trans=controller.enemyTurn(eligible?interventionDamage:undefined);let messages=(run.combatLog??[]).slice(cursor).map((e:any)=>e.text);let after=snap(run);const received=Math.max(0,before.hp-after.hp);rec.deathDmg+=received;event(runId,seed,scenario,classId,'action',{room:roomNo,actor:'enemy',action:run.enemyInterruptedIntent??run.enemyIntent??'enemy-action',enemy:enemyInfo(enemy),hp:after.hp,mp:after.mp,enemyHp:after.enemyHp,received,messages:messages.filter((m:string)=>/dano|esquiv|crítico|interrupção/i.test(m)).slice(0,5)});
      }
    }else if(run.pendingSpecializationSelection&&run.pendingPoints<=0){applyLevel(controller,ac,run,runId,seed,scenario,classId);rec.maxLevel=Math.max(rec.maxLevel,run.player.level);}
    else if(run.status==='level-up'){applyLevel(controller,ac,run,runId,seed,scenario,classId);rec.maxLevel=Math.max(rec.maxLevel,run.player.level);}
    else if(run.status==='skill-choice'){applyLevel(controller,ac,run,runId,seed,scenario,classId);}
    else if(run.status==='loot-choice'){controller.chooseLoot(Math.max(0,run.inventory.findIndex((x:string|null)=>x===null)));}
    else if(run.status==='room'){
      const room=run.rooms[run.roomIndex];
      if(room&&!room.resolved){scopeRandom(seed,'room',roomNo,'event');if(room.event==='rest'||room.event==='chest')controller.interactRoomEvent();else throw new Error(`Unresolved room ${roomNo} (${room.event})`);}
      else if(room?.resolved&&!room.completionAcknowledged){scopeRandom(seed,'room',roomNo,'ack');controller.acknowledgeRoomCompletion();if(roomNo===1)rec.room1EndHp=run.player.hp;}
      else if(room?.resolved&&room.completionAcknowledged){if(roomNo===10&&run.dungeonLevel===1){rec.outcome='boss-killed';rec.killedBoss=true;break;}scopeRandom(seed,'room',roomNo,'advance');controller.advanceRoom();}
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
 const c=out.control,t=out.treatment;
 const controls=all.filter((r:any)=>r.scenario==='control'),treatments=all.filter((r:any)=>r.scenario==='treatment');
 const treatmentBySeed=new Map(treatments.map((r:any)=>[r.seed,r]));
 let farther=0,same=0,shorter=0,room1HpBetter=0,room1HpEqual=0,room1HpWorse=0;
 for(const control of controls){const treatment:any=treatmentBySeed.get(control.seed);if(!treatment)continue;
  const cRoom=control.killedBoss?10:(control.deathRoom??control.final.room),tRoom=treatment.killedBoss?10:(treatment.deathRoom??treatment.final.room);
  if(tRoom>cRoom)farther++;else if(tRoom<cRoom)shorter++;else same++;
  if(control.room1EndHp!==null&&treatment.room1EndHp!==null){if(treatment.room1EndHp>control.room1EndHp)room1HpBetter++;else if(treatment.room1EndHp<control.room1EndHp)room1HpWorse++;else room1HpEqual++;}
 }
 out.paired={deathDelta:c.deaths-t.deaths,room1Deaths:{control:c.deathsByRoom['1']??0,treatment:t.deathsByRoom['1']??0},reachedBossDelta:t.reachedBoss-c.reachedBoss,bossKillsDelta:t.bossKilled-c.bossKilled,perSeed:{farther,sameRoom:same,shorter,room1HpBetter,room1HpEqual,room1HpWorse}};
 summaries[cls]=out;
}
const result={method:{runsPerClassPerScenario:100,totalRuns:600,seedBase:SEED_BASE,seedFormula:'seedBase+classIndex*10000+runIndex; each scenario shares the same seed',rng:'Separate deterministic keyed streams per world, room event/advance, combat actor and local action index, and policy decision. When both arms reach the same opportunity, the local random sequence restarts from the same key; after differing actions/states, outcomes are not guaranteed to remain semantically paired.',policy:'Same tactical policy in both arms: free healing item at HP<=60%, defender/escudo against dangerous telegraphed skill at low HP, offensive class ability/fire arrow with 68% opportunity chance, random weighted upgrades favor primary stat/VIT, uniform specialization.',intervention:'Simulation only: before subtracting HP, reduce each landed direct enemy hit by 1 (minimum 1) for normal level-1 enemies in floor 1, rooms 1-3. No damage-over-time change. Default game behavior is unchanged.',limitations:'Pairing is keyed by logical action opportunity, but if one arm chooses a different action or leaves combat earlier, later opportunities differ. Results are a matched-seed experiment, not a fully counterfactual deterministic replay.'},validation:{runs:600,completed:logs.filter(x=>x.type==='end').length,outcomes:Object.fromEntries(['death','boss-killed','step-limit','runner-error'].map(o=>[o,logs.filter(x=>x.type==='end'&&x.outcome===o).length]))},byClass:summaries};
mkdirSync(OUT,{recursive:true});writeFileSync(LOG_FILE,logs.map(x=>JSON.stringify(x)).join('\n')+'\n','utf8');writeFileSync(SUMMARY_FILE,JSON.stringify(result,null,2)+'\n','utf8');console.log(JSON.stringify({log:LOG_FILE,summary:SUMMARY_FILE,validation:result.validation,byClass:Object.fromEntries(CLASSES.map(c=>[c,{control:result.byClass[c].control,treatment:result.byClass[c].treatment,paired:result.byClass[c].paired}]))},null,2));
