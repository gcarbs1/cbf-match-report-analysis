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
const {optionalSeason,publicMatch,resolvePlayer,resolveSeasonPeriod,resolveTeam}=module.exports;

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
  {id:'1',name:'Lucas',full_name:'Lucas A',aliases_json:'[]',alias:'Lucas'},
  {id:'2',name:'Lucas',full_name:'Lucas B',aliases_json:'[]',alias:'Lucas'}
];
const playerDb={
  prepare(){return {bind(){return this;},all:async()=>({results:duplicatePlayers})};}
};
await assert.rejects(()=>resolvePlayer(playerDb,'Lucas'),/mais de um jogador/);

const aliasCalls=[];
const exactAliasDb={
  prepare(query){
    aliasCalls.push(query);
    return {
      bind(){return this;},
      all:async()=>({results:query.includes('WHERE player_aliases.normalized_alias = ?')
        ?[{id:'402681',name:'J. Capixaba',full_name:'Luis Antonio da Rocha Junior',aliases_json:'[]',alias:'Juninho Capixaba'}]
        :[]})
    };
  }
};
assert.equal((await resolvePlayer(exactAliasDb,'Juninho Capixaba')).id,'402681');
assert.equal(aliasCalls.length,1);
assert.match(aliasCalls[0],/FROM player_aliases/);

assert.equal(optionalSeason(2020),2020);
assert.equal(optionalSeason(2026),2026);
assert.equal(optionalSeason(2027),2027);
assert.throws(()=>optionalSeason(1800),/ano de temporada válido/);

let boundsQuery='';
const periodDb={
  prepare(query){
    boundsQuery=query;
    return {first:async()=>({min_season:2020,max_season:2026})};
  }
};
const latestPeriod=await resolveSeasonPeriod(periodDb,{ultimas_temporadas:2});
assert.equal(latestPeriod.start,2025);
assert.equal(latestPeriod.end,2026);
assert.equal(latestPeriod.label,'2025–2026');
assert.match(boundsQuery,/MAX\(season\)/);

const singlePeriod=await resolveSeasonPeriod(periodDb,{temporada:2024});
assert.equal(singlePeriod.start,2024);
assert.equal(singlePeriod.end,2024);
assert.equal(singlePeriod.label,'2024');

const rangePeriod=await resolveSeasonPeriod(periodDb,{temporada_inicio:2022,temporada_fim:2025});
assert.equal(rangePeriod.start,2022);
assert.equal(rangePeriod.end,2025);
assert.equal(rangePeriod.label,'2022–2025');

await assert.rejects(
  ()=>resolveSeasonPeriod({
    prepare(){return {first:async()=>({min_season:2023,max_season:2026})};}
  },{ultimas_temporadas:7}),
  /entre 1 e 4/
);

await assert.rejects(
  ()=>resolveSeasonPeriod(periodDb,{temporada:2024,ultimas_temporadas:2}),
  /apenas um recorte/
);
await assert.rejects(
  ()=>resolveSeasonPeriod(periodDb,{temporada_inicio:2024}),
  /temporada_inicio e temporada_fim/
);
await assert.rejects(
  ()=>resolveSeasonPeriod(periodDb,{temporada_inicio:2025,temporada_fim:2024}),
  /inicial não pode ser posterior/
);
await assert.rejects(
  ()=>resolveSeasonPeriod(periodDb,{ultimas_temporadas:0}),
  /entre 1 e 7/
);
await assert.rejects(
  ()=>resolveSeasonPeriod(periodDb,{temporada:2027}),
  /entre 2020 e 2026/
);
await assert.rejects(
  ()=>resolveSeasonPeriod({prepare(){return {first:async()=>({min_season:null,max_season:null})};}},{ultimas_temporadas:2}),
  /Não há temporadas disponíveis/
);

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

console.log('Domain tests passed: fuzzy aliases, ambiguity, dynamic periods and public card types.');
