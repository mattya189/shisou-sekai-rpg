import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRealData, loadBattleData } from '../helpers.js';
import { createBattle, advance, effectiveStat, runToEnd } from '../../src/battle/engine.js';
import { learnedSkillIds, setEquippedSkills } from '../../src/progression/skillLoadout.js';
import { createUnitState, grantUnit } from '../../src/progression/units.js';
import { createEmptySave } from '../../src/save/saveSchema.js';
import { tryRecruit } from '../../src/game/recruit.js';
import { abilityDetail, abilityCatalog } from '../../src/codex/abilities.js';
import { PASSIVE_EFFECTS } from '../../src/battle/passives.js';
import { isDebuff } from '../../src/battle/statusEffects.js';
import { statusRemainingText } from '../../src/ui/battleDetail.js';
import { rollEncounter } from '../../src/exploration/encounters.js';
import { createRng } from '../../src/core/rng.js';

const common = ['skill_046', 'skill_047', 'skill_048', 'skill_050', 'skill_051', 'skill_052'];
const stacks = (u, id='marker_003') => u.markers[id]?.stacks ?? 0;
function marker(u, n, id='marker_001') { u.markers[id] = { stacks:n, reachedMaxAt:null }; }
function fixture(data, skills, { defId='mon_010', count=0, enemies=3, seed=1 }={}) {
  const b=createBattle(data, { allies:[{defId, rank:5, level:40, skills, usesMp:false}], enemies:Array.from({length:enemies},()=>({defId:'mon_900'})), seed });
  const a=b.units[0]; a.stats.matk=100; a.stats.atk=100; a.attackCount=count;
  return { b, a, foes:b.units.slice(1) };
}
function step(data, b) { advance(b, data, b.units[0].nextAttackAt-b.timeMs); return b.log.filter(e=>e.type==='action'&&e.actorId==='a1'&&e.kind!=='immediate').at(-1); }
function damage(event) { return event.results.filter(r=>r.kind==='damage').map(r=>r.amount); }

test('リフューラの登録、☆2加入、10習得・5セットと画像参照', async()=>{
  const data=await loadRealData(); assert.deepEqual(data.validate().errors,[]);
  const def=data.get('monsters','mon_010'); assert.equal(def.strength,3); assert.equal(def.initialRank,2); assert.equal(def.element,'elem_009');
  assert.deepEqual(def.speciesIds,['species_001','species_005']); assert.equal(def.learnset.length,10);
  const save=createEmptySave(); grantUnit(save,data,def.id); assert.equal(save.units[def.id].rank,2);
  const r=tryRecruit(createEmptySave(),data,def.id,6,{next:()=>0}); assert.equal(r.success,true);
  for (const learn of def.learnset) {
    const u={defId:def.id,rank:learn.rank,level:learn.level,extraSkills:[]};
    assert.ok(learnedSkillIds(data,u).includes(learn.skillId));
    assert.ok(!learnedSkillIds(data,{...u,rank:learn.rank-1}).includes(learn.skillId));
    assert.ok(!learnedSkillIds(data,{...u,level:learn.level-1}).includes(learn.skillId));
  }
  save.units[def.id]=createUnitState(data,def.id,{rank:5,level:40});
  assert.throws(()=>setEquippedSkills(save,data,def.id,def.learnset.slice(0,6).map(l=>l.skillId)),/5/);
  const png=await readFile(new URL('../../'+def.image,import.meta.url)); assert.equal(png.subarray(1,4).toString(),'PNG'); assert.equal(png[25],6);
});

test('汎用6種は一意の共有ID、図鑑は実データと使用者を参照',async()=>{
  const data=await loadRealData(); const catalog=abilityCatalog(data);
  for(const id of common) {
    assert.equal(data.list('skills').filter(s=>s.id===id).length,1); assert.equal(data.get('skills',id).common,true);
    const detail=abilityDetail(data,'skill',id); assert.ok(detail.users.some(u=>u.monsterId==='mon_010'));
    assert.ok(detail.effects.every(e=>!['healFromDamage'].includes(e)));
  }
  assert.equal(catalog.find(e=>e.id==='skill_052').kind,'passive');
  assert.equal(catalog.find(e=>e.id==='skill_053').kind,'combo');
  assert.equal(catalog.find(e=>e.id==='skill_054').kind,'ultimate');
  assert.ok(abilityDetail(data,'skill','skill_049').effects.some(t=>t.includes('80%')&&t.includes('4%')));
  assert.ok(abilityDetail(data,'skill','skill_053').triggerText.includes('10'));
});

test('色喰らいは4倍数、最多侵色・同数先頭、実消費と威力を参照',async()=>{
  const data=await loadBattleData();
  const {b,a,foes}=fixture(data,['skill_045'],{count:2}); marker(foes[0],4); marker(foes[1],10); marker(foes[2],10);
  assert.equal(step(data,b).kind,'normal'); assert.equal(stacks(a),0);
  const e=step(data,b); assert.equal(e.skillId,'skill_045'); assert.deepEqual(damage(e),[150]);
  assert.equal(e.results.find(r=>r.kind==='damage').targetId,'e2'); assert.equal(stacks(foes[1],'marker_001'),0); assert.equal(stacks(a),5);
});

for(const amount of [0,1,5,10,15]) test(`色喰らい侵色${amount}：実消費量と50%切捨て`,async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_045'],{count:3,enemies:1}); marker(foes[0],amount);
  const n=Math.min(10,amount); assert.deepEqual(damage(step(data,b)),[100+n*5]); assert.equal(stacks(a),Math.floor(n/2)); assert.equal(stacks(foes[0],'marker_001'),amount-n);
});

test('護彩上限30。他者の消費・解除・通常のマーカー減少では増加しない',async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_045'],{count:3}); marker(a,29,'marker_003'); marker(foes[0],10);
  step(data,b);assert.equal(stacks(a),30);
  const passive=data.get('passives','passive_010').effects[0];let gained=0;
  const api={addMarker:()=>gained++};
  PASSIVE_EFFECTS[passive.type].onMarkerConsumed(passive,a,api,{actor:foes[0],markerId:'marker_001',amount:10,skill:{}});
  PASSIVE_EFFECTS[passive.type].onMarkerConsumed(passive,a,api,{actor:a,markerId:'marker_001',amount:10,skill:null});assert.equal(gained,0);
  const other=createBattle(data,{allies:[{defId:'mon_010',rank:5,skills:[],usesMp:false},{defId:'mon_008',skills:[],usesMp:false}],enemies:[{defId:'mon_900'}]});
  marker(other.units[2],22);advance(other,data,1850);assert.equal(stacks(other.units[0]),0);assert.equal(stacks(other.units[2],'marker_001'),11);
  const cleanseData=await loadBattleData(raw=>{raw.skills.push({id:'skill_903',name:'解除',mpCost:0,trigger:{type:'always'},effects:[{type:'addMarker',target:'enemyAll',markerId:'marker_001',amount:-10}]});});
  const clean=fixture(cleanseData,['skill_903']);marker(clean.foes[0],10);step(cleanseData,clean.b);assert.equal(stacks(clean.a),0);
});

test('染色捕食は6倍数、敵ごと最大5・合計で丸め、戦闘不能を除外',async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_049'],{count:5});[5,3,100].forEach((n,i)=>marker(foes[i],n)); foes[2].alive=false;foes[2].hp=0;
  const e=step(data,b);assert.equal(e.skillId,'skill_049');assert.deepEqual(damage(e),[112,112]);assert.equal(stacks(a),4);assert.equal(stacks(foes[2],'marker_001'),100);
});

for(const total of [9,10,15]) test(`護色反転の実消費${total}条件、護彩獲得後威力・回数非加算`,async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_049','skill_053'],{count:5});let left=total;
  for(const f of foes){const n=Math.min(5,left);marker(f,n);left-=n;}
  const e=step(data,b);const first=80+total*4;const bonus=70+Math.floor(total/2)*2;
  assert.deepEqual(damage(e),total>=10?[first,first,first,bonus,bonus,bonus]:[first,first,first]);assert.equal(a.attackCount,6);assert.equal(a.turnCount,1);
  assert.equal(e.results.filter(r=>r.kind==='attackComboTriggered').length,total>=10?1:0);
});

test('コンボは未セットなら発動しない、侵色供給なしで護彩を作れない',async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_049'],{count:5});foes.forEach(f=>marker(f,5));assert.equal(damage(step(data,b)).length,3);
  const solo=fixture(data,['skill_054','skill_049','skill_045','skill_047','skill_051']);runToEnd(solo.b,data);assert.equal(stacks(solo.a),0);assert.ok(!solo.a.usedSkills.includes('skill_054'));
});

test('万彩拒絶砲：護彩30＋次の2倍数、390%、全消費・侵色+3・1回制限',async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_054'],{count:0});marker(a,30,'marker_003');
  assert.equal(step(data,b).kind,'normal');assert.equal(stacks(a),30);
  const e=step(data,b);assert.equal(e.skillId,'skill_054');assert.deepEqual(damage(e),[390,390,390]);assert.equal(stacks(a),0);foes.forEach(f=>assert.equal(stacks(f,'marker_001'),3));
  marker(a,30,'marker_003');step(data,b);assert.equal(step(data,b).kind,'normal');assert.equal(a.usedSkills.filter(id=>id==='skill_054').length,1);
  const missing=fixture(data,['skill_054'],{count:1});marker(missing.a,29,'marker_003');assert.equal(step(data,missing.b).kind,'normal');
});

test('奥義後侵色は生存対象のみ、侵色上限100',async()=>{
  const data=await loadBattleData();const {b,a,foes}=fixture(data,['skill_054'],{count:1});marker(a,30,'marker_003');foes[0].hp=1;marker(foes[1],99);
  step(data,b);assert.equal(foes[0].alive,false);assert.equal(stacks(foes[0],'marker_001'),0);assert.equal(stacks(foes[1],'marker_001'),100);
});

test('汎用暗黒弾・暗黒波は別ユニットの同じIDで発動',async()=>{
  const data=await loadBattleData();
  for(const [id,n,power,targets] of [['skill_047',3,120,1],['skill_051',8,120,3]]){
    const {b,a}=fixture(data,[id],{defId:'chr_900',count:n-1});assert.deepEqual(damage(step(data,b)),Array(targets).fill(power));assert.equal(a.attackCount,n);
  }
});

test('生命吸収は実ダメージ20%、オーバーキルと最大HPを考慮',async()=>{
  const data=await loadBattleData();
  for(const [hp,lost,heal] of [[100000,100,22],[10,100,2],[100000,1,1]]){
    const {b,a,foes}=fixture(data,['skill_050'],{defId:'chr_900',count:4,enemies:1});a.hp=a.maxHp-lost;foes[0].hp=hp;
    const e=step(data,b);assert.equal(e.results.find(r=>r.kind==='heal').amount,heal);assert.equal(a.hp,a.maxHp-lost+heal);
  }
});

test('魔力集中は通常攻撃だけ10%、追加回数なし・3自身行動で終了',async()=>{
  const data=await loadBattleData();const {b,a}=fixture(data,['skill_046'],{defId:'chr_900'});b.rng.chance=()=>true;
  step(data,b);assert.equal(a.attackCount,1);assert.equal(a.turnCount,1);assert.equal(a.statuses[0].remainingTurns,3);assert.ok(Math.abs(effectiveStat(a,'matk')-110)<1e-9);
  a.skills=[];for(let i=0;i<3;i++)step(data,b);assert.equal(a.statuses.length,0);
  const skill=fixture(data,['skill_047','skill_046'],{defId:'chr_900',count:2});skill.b.rng.chance=()=>true;step(data,skill.b);assert.equal(skill.a.statuses.length,0);
  const probability=fixture(data,['skill_046'],{defId:'chr_900'});let chances=[];probability.b.rng.chance=p=>{chances.push(p);return false;};step(data,probability.b);assert.deepEqual(chances,[.1]);
});

test('生命吸収は同じ行動に予約された別コンボのダメージを吸収しない',async()=>{
  const data=await loadBattleData();const {b,a}=fixture(data,['skill_050'],{defId:'chr_900',count:4,enemies:1});a.hp-=100;
  a.pendingAttackEffects.push({effects:[{type:'damage',target:'enemySingle',power:1,damageType:'magic'}],sourceSkillId:'skill_031',comboSkillId:'skill_032'});
  const e=step(data,b);assert.deepEqual(damage(e),[100,110]);assert.equal(e.results.find(r=>r.kind==='heal').amount,22);
});

async function debuffFixture(skills, types=['status_003','status_005'], chance=()=>true) {
  const data=await loadBattleData(raw=>raw.skills.push({id:'skill_904',name:'複数弱体',mpCost:0,trigger:{type:'always'},effects:types.map(statusId=>({type:'applyStatus',target:'enemySingle',statusId}))}));
  const b=createBattle(data,{allies:[{defId:'chr_900',skills,usesMp:false}],enemies:[{defId:'mon_901',skills:['skill_904']}]}); b.rng.chance=chance;
  return {data,b,a:b.units[0]};
}
test('拒絶の構えは同じ敵行動の複数デバフに1判定、20%・再付与も1回',async()=>{
  const chances=[];const {data,b,a}=await debuffFixture(['skill_048'],undefined,p=>{chances.push(p);return true;});advance(b,data,1000);
  assert.deepEqual(chances,[.2]);assert.equal(a.statuses.find(s=>s.statusId==='status_015').remainingTurns,3);assert.equal(a.attackCount,0);assert.equal(a.turnCount,0);
  advance(b,data,1000);assert.deepEqual(chances,[.2,.2]);assert.equal(a.statuses.filter(s=>s.statusId==='status_015').length,1);
});
test('拒絶の構えは確率失敗、耐性・無効化・敵の強化付与では発動しない',async()=>{
  const failed=await debuffFixture(['skill_048'],undefined,()=>false);advance(failed.b,failed.data,1000);assert.ok(!failed.a.statuses.some(s=>s.statusId==='status_015'));
  const buff=await debuffFixture(['skill_048'],['status_004']);advance(buff.b,buff.data,1000);assert.ok(!buff.a.statuses.some(s=>s.statusId==='status_015'));
  const immune=await debuffFixture(['skill_048']);immune.a.statusImmune=['status_003','status_005'];advance(immune.b,immune.data,1000);assert.equal(immune.a.statuses.length,0);
  const allyData=await loadBattleData(raw=>raw.skills.push({id:'skill_905',name:'自傷弱体',mpCost:0,trigger:{type:'always'},effects:[{type:'applyStatus',target:'self',statusId:'status_003'}]}));
  const self=fixture(allyData,['skill_905','skill_048'],{defId:'chr_900'});self.b.rng.chance=()=>true;step(allyData,self.b);assert.ok(!self.a.statuses.some(s=>s.statusId==='status_015'));
});
test('報復本能は別ユニットでも再利用、非重複・全体攻撃へ15%適用後解除',async()=>{
  const {data,b,a}=await debuffFixture(['skill_051','skill_052']);advance(b,data,1000);
  assert.equal(a.statuses.filter(s=>s.statusId==='status_022').length,1);
  // Add targets through the normal battle constructor for the actual all-target assertion.
  const other=fixture(data,['skill_051'],{defId:'chr_900',count:7});other.a.statuses=[a.statuses.find(s=>s.statusId==='status_022')];
  assert.equal(statusRemainingText(other.a.statuses[0],0).short,'次の攻撃');
  const e=step(data,other.b);assert.deepEqual(damage(e),[138,138,138]);assert.equal(other.a.statuses.length,0);
  other.a.attackCount=15;assert.deepEqual(damage(step(data,other.b)),[120,120,120]);
  advance(b,data,2000);assert.ok(a.statuses.filter(s=>s.statusId==='status_022').length<=1);
});
test('報復は非攻撃・全ミスでは残り、コンボへ重複適用しない',async()=>{
  const data=await loadBattleData(raw=>raw.skills.push({id:'skill_906',name:'待機',mpCost:0,countsAsAttack:false,trigger:{type:'always'},effects:[{type:'healPctMax',target:'self',pct:1}]}));
  const {b,a,foes}=fixture(data,['skill_906']);a.statuses=[{statusId:'status_022',kind:'nextAttackDamage',untilAttack:true,params:{pct:15},remainingTurns:null,expiresAt:null}];step(data,b);assert.equal(a.statuses.length,1);
  a.skills=['skill_049','skill_053'];a.attackCount=5;foes.forEach(f=>{marker(f,5);f.stats.evasion=95;});b.rng.chance=()=>true;step(data,b);assert.equal(a.statuses.length,1);
  a.attackCount=5;foes.forEach(f=>{marker(f,5);f.stats.evasion=0;});const e=step(data,b);
  assert.deepEqual(damage(e),[161,161,161,98,98,98]);assert.ok(!a.statuses.some(s=>s.statusId==='status_022'));
});
test('デバフ分類は正の能力強化を除外し、負の複合補正も検出',()=>{
  assert.equal(isDebuff({kind:'statModifier',params:{pct:10}}),false);
  assert.equal(isDebuff({kind:'multiStatModifier',params:{statPct:{matk:-5}}}),true);
});
test('リフューラの遭遇rank、既存セーブは新規加入以外変更しない',async()=>{
  const data=await loadRealData();const save=createEmptySave();save.units.mon_007=createUnitState(data,'mon_007');const before=structuredClone(save.units.mon_007);
  grantUnit(save,data,'mon_010');assert.deepEqual(save.units.mon_007,before);assert.equal(save.saveVersion,3);
  const rng=createRng(1);let found;
  for(let i=0;i<1000&&!found;i++)found=rollEncounter(data,'enc_003',{period:'noon',weatherId:'weather_001',flags:{}},rng).find(e=>e.defId==='mon_010');
  assert.ok(found);assert.equal(found.rank,2);assert.ok(found.level>=5&&found.level<=6);
});
test('汎用・固有処理はseed再現、advance刻みの影響なし',async()=>{
  const data=await loadBattleData();const opts={allies:[{defId:'mon_010',rank:5,level:40,skills:['skill_047','skill_048','skill_050','skill_046','skill_052'],usesMp:false}],enemies:[{defId:'mon_901',skills:['skill_902']}],seed:42};
  const a=createBattle(data,opts),b=createBattle(data,opts);advance(a,data,30000);for(let i=0;i<300;i++)advance(b,data,100);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(a.rng.getState(),b.rng.getState());
});
