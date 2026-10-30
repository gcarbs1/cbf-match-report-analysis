import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile=(url)=>ts.transpileModule(fs.readFileSync(url,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

const domainModule={exports:{}};
vm.runInNewContext(compile(new URL('../src/domain.ts',import.meta.url)),{
  module:domainModule,exports:domainModule.exports,console,Set,Map,JSON
});

const toolsModule={exports:{}};
vm.runInNewContext(compile(new URL('../src/tools.ts',import.meta.url)),{
  module:toolsModule,
  exports:toolsModule.exports,
  console,
  Set,
  Map,
  JSON,
  require(specifier){
    if(specifier==='./domain')return domainModule.exports;
    throw new Error(`Unexpected module: ${specifier}`);
  }
});

const {TOOL_DEFINITIONS,executeTool}=toolsModule.exports;

const comparisonDefinition=TOOL_DEFINITIONS.find(tool=>tool.function.name==='comparar_times');
const comparisonProperties=comparisonDefinition.function.parameters.properties;
for(const field of ['temporada','temporada_inicio','temporada_fim','ultimas_temporadas']){
  assert.ok(comparisonProperties[field],`Missing period field: ${field}`);
}

const calls=[];
const db={
  prepare(query){
    const call={query,bindings:[]};
    calls.push(call);
    return {
      bind(...bindings){call.bindings=bindings;return this;},
      async first(){
        if(query.includes('FROM team_aliases'))return {team_name:'Fluminense'};
        if(query.includes('MIN(season)'))return {min_season:2020,max_season:2026};
        if(query.includes('COUNT(*) AS games'))return {games:2,yellow:3,red:1};
        return null;
      },
      async all(){return {results:[]};}
    };
  }
};

const latest=await executeTool(db,'comparar_times',{
  times:['fluminense'],
  ultimas_temporadas:2
});
assert.equal(latest.data.periodo,'2025–2026');
assert.equal(latest.data.times[0].partidas,2);
const latestStatsCall=calls.find(call=>call.query.includes('COUNT(*) AS games'));
assert.match(latestStatsCall.query,/season BETWEEN \? AND \?/);
assert.equal(latestStatsCall.bindings.at(-2),2025);
assert.equal(latestStatsCall.bindings.at(-1),2026);

calls.length=0;
const exact=await executeTool(db,'buscar_partidas',{
  time_1:'fluminense',
  temporada:2024
});
assert.equal(exact.data.consulta.temporada,2024);
assert.equal(exact.data.consulta.periodo,'2024');
assert.equal(calls.some(call=>call.query.includes('MIN(season)')),false);
const matchCall=calls.find(call=>call.query.includes('SELECT * FROM matches'));
assert.match(matchCall.query,/season = \?/);
assert.equal(matchCall.bindings.at(-2),2024);

console.log('Tools period test passed: schemas, dynamic latest seasons, SQL bindings and single-season compatibility.');
