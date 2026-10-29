import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/domain.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{module,exports:module.exports,console,Set,Map,JSON});
const {optionalSeason,publicMatch,resolvePlayer,resolveTeam}=module.exports;

const teamRows=[
  {alias:'Athletico Paranaense',team_name:'Athletico-PR'},
  {alias:'Atletico Paranaense',team_name:'Athletico-PR'},
  {alias:'Atletico Mineiro',team_name:'Atlético-MG'},
  {alias:'Atletico Goianiense',team_name:'Atlético-GO'}
];
const teamDb={
  prepare(){
    return {bind(){return this;},first:async()=>null,all:async()=>({results:teamRows})};
  }
};

assert.equal(await resolveTeam(teamDb,'athetico paranaense'),'Athletico-PR');
await assert.rejects(()=>resolveTeam(teamDb,'atletico'),/ambíguo/);

const duplicatePlayers=[
  {id:'1',name:'Lucas',full_name:'Lucas A',aliases_json:'[]'},
  {id:'2',name:'Lucas',full_name:'Lucas B',aliases_json:'[]'}
];
const playerDb={
  prepare(){return {bind(){return this;},all:async()=>({results:duplicatePlayers})};}
};
await assert.rejects(()=>resolvePlayer(playerDb,'Lucas'),/mais de um jogador/);

assert.equal(optionalSeason(2020),2020);
assert.equal(optionalSeason(2026),2026);
assert.throws(()=>optionalSeason(2027),/entre 2020 e 2026/);

const match=publicMatch({
  id:'1',season:2024,match_date:'2024-01-01',display_date:'01/01/2024',
  home_team:'Time A',away_team:'Time B',referee:'Árbitro',has_var:0,
  total_cards:3,yellow_cards:1,second_yellow_cards:1,direct_red_cards:1,red_cards:2,
  home_yellow_cards:1,home_red_cards:1,away_yellow_cards:0,away_red_cards:1,
  events_json:JSON.stringify([
    {ordinal:1,player:'A',team:'Time A',type:'A',reason:'Motivo',tags:[],timing:'1º tempo'},
    {ordinal:2,player:'B',team:'Time B',type:'V2',reason:'Motivo',tags:[],timing:'2º tempo'},
    {ordinal:3,player:'C',team:'Time A',type:'VD',reason:'Motivo',tags:[],timing:'2º tempo'}
  ])
});
assert.equal(match.cartoes.segundos_amarelos,1);
assert.deepEqual(Array.from(match.eventos,event=>event.tipo),['amarelo','segundo_amarelo','vermelho_direto']);

console.log('Domain tests passed: fuzzy aliases, ambiguity, season bounds and public card types.');
