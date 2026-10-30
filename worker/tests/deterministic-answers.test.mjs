import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const module={exports:{}};
class DomainError extends Error {}
vm.runInNewContext(compiled,{
  module,
  exports:module.exports,
  console,
  JSON,
  Set,
  Map,
  Number,
  String,
  Intl,
  require(specifier){
    if(specifier==='./domain')return {DomainError,readSeasonBounds(){}};
    if(specifier==='./tools')return {executeTool(){},mergeSources(){return[];},TOOL_DEFINITIONS:[]};
    throw new Error(`Unexpected module: ${specifier}`);
  }
});

const {deterministicAnswer,deterministicError}=module.exports;
const execution=(name,data)=>[{name,data,sources:[]}];

const matchAnswer=deterministicAnswer(execution('buscar_partidas',{
  quantidade:1,
  consulta:{campos:['resumo','cartoes']},
  partidas:[{
    mandante:'Palmeiras',visitante:'Corinthians',data:'29/04/2023',arbitro:'Wilton Pereira Sampaio',teve_var:true,
    cartoes:{total:8,amarelos:8,vermelhos:0},
    eventos:[{jogador:'Jogador A',time:'Palmeiras',tipo:'amarelo',justificativa:'Reclamação'}]
  }]
}));
assert.match(matchAnswer,/Palmeiras × Corinthians · 29\/04\/2023/);
assert.match(matchAnswer,/árbitro Wilton Pereira Sampaio/);
assert.match(matchAnswer,/Jogador A \(Palmeiras\) — amarelo: Reclamação/);
assert.equal(deterministicAnswer(execution('buscar_partidas',{quantidade:0,partidas:[]})),'Não encontrei partidas para esse recorte.');

const refereeMatchAnswer=deterministicAnswer(execution('buscar_partidas',{
  quantidade:1,
  consulta:{campos:['arbitro']},
  partidas:[{
    mandante:'Palmeiras',visitante:'Corinthians',data:'29/04/2023',arbitro:'Wilton Pereira Sampaio',teve_var:true,
    cartoes:{total:8,amarelos:8,vermelhos:0},eventos:[]
  }]
}));
assert.match(refereeMatchAnswer,/Árbitro: Wilton Pereira Sampaio/);
assert.doesNotMatch(refereeMatchAnswer,/Cartões:/);

const comparisonAnswer=deterministicAnswer(execution('comparar_times',{
  periodo:'2025–2026',
  times:[{time:'Fluminense',partidas:71,cartoes:185,amarelos:176,vermelhos:9,cartoes_por_jogo:2.61}]
}));
assert.match(comparisonAnswer,/Comparação no período de 2025–2026/);
assert.match(comparisonAnswer,/185 cartões \(176 amarelos e 9 vermelhos\)/);
assert.match(comparisonAnswer,/média de 2,61 por jogo/);

const teamRankingAnswer=deterministicAnswer(execution('ranquear_times',{
  metrica:'media',periodo:'2024',
  times:[{time:'Corinthians',partidas:38,cartoes:141,amarelos:131,vermelhos:10,cartoes_por_jogo:3.71}]
}));
assert.match(teamRankingAnswer,/Ranking por média de cartões por jogo · 2024/);
assert.match(teamRankingAnswer,/1\. \*\*Corinthians\*\*/);

const matchRankingAnswer=deterministicAnswer(execution('ranquear_partidas',{
  metrica:'vermelhos',periodo:'2020–2026',
  partidas:[{mandante:'Ceará',visitante:'Santos',data:'05/09/2020',arbitro:'Árbitro X',cartoes:{total:12,amarelos:6,vermelhos:6}}]
}));
assert.match(matchRankingAnswer,/Partidas com mais cartões vermelhos/);
assert.match(matchRankingAnswer,/12 cartões: 6 amarelos e 6 vermelhos/);

const refereeAnswer=deterministicAnswer(execution('perfil_arbitro',{
  arbitro:'Raphael Claus',periodo:'2026',partidas:17,cartoes:73,amarelos:66,vermelhos:7,
  cartoes_por_jogo:4.29,partidas_com_var:5,percentual_com_var:29.4,
  categorias_recorrentes:[{categoria:'Ação temerária',ocorrencias:31}]
}));
assert.match(refereeAnswer,/Raphael Claus · 2026/);
assert.match(refereeAnswer,/média de 4,29 por jogo/);
assert.match(refereeAnswer,/VAR mencionado em 5 partidas \(29,4%\)/);

const refereeRankingAnswer=deterministicAnswer(execution('ranquear_arbitros',{
  criterio:'media',periodo:'2025',
  arbitros:[{arbitro:'Árbitro Y',partidas:12,cartoes:60,amarelos:55,vermelhos:5,cartoes_por_jogo:5}]
}));
assert.match(refereeRankingAnswer,/Ranking de árbitros por média de cartões por jogo · 2025/);
assert.match(refereeRankingAnswer,/60 cartões em 12 partidas/);

const playerAnswer=deterministicAnswer(execution('perfil_jogador',{
  jogador:'Gustavo Gomez',periodo:'2025–2026',times:['Palmeiras'],partidas_com_cartao:12,
  cartoes:12,amarelos:12,vermelhos:0,segundos_amarelos:0,vermelhos_diretos:0,
  categorias:[{categoria:'Ação temerária',total:5}]
}));
assert.match(playerAnswer,/Gustavo Gomez.*12 cartões: 12 amarelos e 0 vermelhos/);
assert.match(playerAnswer,/Times associados no período: Palmeiras/);

const playerRankingAnswer=deterministicAnswer(execution('ranquear_jogadores',{
  metrica:'amarelos',periodo:'2020–2026',time:'Palmeiras',
  jogadores:[{jogador:'Gustavo Gomez',times:['Palmeiras'],partidas_com_cartao:50,cartoes:51,amarelos:48,vermelhos:3}]
}));
assert.match(playerRankingAnswer,/Ranking de jogadores por cartões amarelos · 2020–2026 · Palmeiras/);
assert.match(playerRankingAnswer,/51 cartões: 48 amarelos e 3 vermelhos/);

assert.equal(deterministicAnswer(execution('desconhecida',{})),null);
assert.equal(deterministicAnswer([]),null);
assert.equal(
  deterministicError(1,[],[{name:'perfil_jogador',error:'Informe um nome mais completo.'}]),
  'Informe um nome mais completo.'
);
assert.equal(deterministicError(2,[],[{name:'perfil_jogador',error:'Falha.'}]),null);
assert.equal(deterministicError(1,execution('perfil_jogador',{}),[{name:'perfil_jogador',error:'Falha.'}]),null);

console.log('Deterministic answer and domain-error tests passed.');
