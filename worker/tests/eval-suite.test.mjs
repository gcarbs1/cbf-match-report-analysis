import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isInfrastructureFailure,summarize,validateResponse} from '../scripts/run-evals.mjs';

const testDirectory=path.dirname(fileURLToPath(import.meta.url));
const workerDirectory=path.resolve(testDirectory,'..');
const casesPath=path.join(workerDirectory,'evals','cases.json');
const runnerPath=path.join(workerDirectory,'scripts','run-evals.mjs');
const suite=JSON.parse(fs.readFileSync(casesPath,'utf8'));

assert.equal(suite.version,1);
assert.ok(suite.cases.length>=50&&suite.cases.length<=100,`Expected 50–100 cases, got ${suite.cases.length}`);

const identifiers=suite.cases.map(testCase=>testCase.id);
assert.equal(new Set(identifiers).size,identifiers.length,'Evaluation ids must be unique.');

const validTools=new Set([
  'buscar_partidas','comparar_times','ranquear_times','ranquear_partidas',
  'perfil_arbitro','ranquear_arbitros','perfil_jogador','ranquear_jogadores'
]);
const requiredCategories=new Set([
  'matches','team_stats','team_rankings','match_rankings','referees','players',
  'periods','aliases_typos','out_of_scope','ambiguity_no_results'
]);
const observedCategories=new Set();

for(const testCase of suite.cases){
  assert.match(testCase.id,/^[a-z]+(?:-[a-z]+)*-\d{3}$/);
  assert.equal(typeof testCase.category,'string');
  assert.ok(testCase.question.trim().length>=2);
  assert.equal(typeof testCase.expected,'object');
  observedCategories.add(testCase.category);

  if(testCase.expected.tool!==undefined&&testCase.expected.tool!==null){
    assert.ok(validTools.has(testCase.expected.tool),`Unknown tool in ${testCase.id}`);
  }
  for(const field of ['answerIncludes','answerAnyOf','answerExcludes','sourceTitlesInclude']){
    if(testCase.expected[field]!==undefined){
      assert.ok(Array.isArray(testCase.expected[field])&&testCase.expected[field].length,`${testCase.id}.${field} must be a non-empty array.`);
    }
  }
  if(testCase.expected.sources){
    for(const bound of ['min','max']){
      const value=testCase.expected.sources[bound];
      if(value!==undefined)assert.ok(Number.isInteger(value)&&value>=0,`${testCase.id}.sources.${bound} must be non-negative.`);
    }
  }
  if(testCase.history!==undefined){
    assert.ok(Array.isArray(testCase.history));
    for(const message of testCase.history){
      assert.ok(['user','assistant'].includes(message.role));
      assert.equal(typeof message.content,'string');
    }
  }
}

for(const category of requiredCategories){
  assert.ok(observedCategories.has(category),`Missing evaluation category: ${category}`);
}
for(const testCase of suite.cases.filter(testCase=>testCase.category==='out_of_scope')){
  assert.equal(testCase.expected.tool,null,`${testCase.id} must reject tool use.`);
  assert.equal(testCase.expected.sources.max,0,`${testCase.id} must reject inherited sources.`);
}

const planned=spawnSync(process.execPath,[runnerPath,'--category','players','--limit','2'],{
  cwd:workerDirectory,
  encoding:'utf8'
});
assert.equal(planned.status,0,planned.stderr);
const plan=JSON.parse(planned.stdout);
assert.equal(plan.mode,'plan');
assert.equal(plan.selected_cases,2);
assert.deepEqual(plan.ids,['player-001','player-002']);
assert.match(plan.message,/Nenhuma chamada foi realizada/);

const help=spawnSync(process.execPath,[runnerPath,'--help'],{cwd:workerDirectory,encoding:'utf8'});
assert.equal(help.status,0,help.stderr);
assert.match(help.stdout,/--confirm-live/);
assert.match(help.stdout,/--fail-on-error/);
assert.match(help.stdout,/--per-category/);

const balanced=spawnSync(process.execPath,[runnerPath,'--per-category','2'],{
  cwd:workerDirectory,
  encoding:'utf8'
});
assert.equal(balanced.status,0,balanced.stderr);
const balancedPlan=JSON.parse(balanced.stdout);
assert.equal(balancedPlan.selected_cases,20);
assert.ok(Object.values(balancedPlan.categories).every(count=>count===2));

const scored=validateResponse({
  expected:{tool:'buscar_partidas',answerIncludes:['Anderson Daronco'],sources:{min:1}}
},200,{
  answer:'O árbitro foi Anderson Daronco.',
  meta:{tools:['buscar_partidas']},
  sources:[{title:'Corinthians × Palmeiras'}]
});
assert.equal(scored.failures.length,0);
assert.equal(validateResponse({expected:{answerIncludes:['8 cartões']}},200,{answer:'7 cartões'}).failures[0].rule,'answerIncludes');
assert.equal(isInfrastructureFailure(503,{code:'AI_QUOTA_EXCEEDED'}),true);
assert.equal(isInfrastructureFailure(500,{code:'INTERNAL_ERROR'}),false);
assert.equal(isInfrastructureFailure(503,{code:'INTERNAL_ERROR'}),false);

const summary=summarize([
  {category:'matches',passed:true,infrastructure_failure:false,latency_ms:100},
  {category:'matches',passed:false,infrastructure_failure:true,latency_ms:200},
  {category:'players',passed:false,infrastructure_failure:false,latency_ms:300}
],{endpoint:'test',delayMs:0,timeoutMs:1000},[1,2,3]);
assert.equal(summary.metrics.total,3);
assert.equal(summary.metrics.infrastructure_failures,1);
assert.equal(summary.metrics.quality.total,2);
assert.equal(summary.metrics.quality.pass_rate,50);

console.log(`Evaluation suite tests passed: ${suite.cases.length} grounded cases and safe dry-run CLI.`);
