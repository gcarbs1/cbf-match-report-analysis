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
let executeImplementation;
vm.runInNewContext(compiled,{
  module,
  exports:module.exports,
  console,
  JSON,
  Set,
  Map,
  Number,
  String,
  Date,
  require(specifier){
    if(specifier==='./domain')return {
      DomainError,
      readSeasonBounds:async()=>({first:2020,last:2026,label:'2020–2026'})
    };
    if(specifier==='./tools')return {
      executeTool:(...args)=>executeImplementation(...args),
      mergeSources:executions=>executions.flatMap(execution=>execution.sources),
      TOOL_DEFINITIONS:[]
    };
    throw new Error(`Unexpected module: ${specifier}`);
  }
});

const {answerQuestion}=module.exports;
const toolCall=(name,args)=>({function:{name,arguments:JSON.stringify(args)}});
const modelResponse=(toolCalls=[],content='')=>({
  choices:[{message:{content,tool_calls:toolCalls}}],
  usage:{prompt_tokens:10,completion_tokens:2}
});
const execution=(name)=>({
  name,
  data:{periodo:'2026',times:[{time:'Palmeiras',partidas:1,cartoes:2,amarelos:2,vermelhos:0,cartoes_por_jogo:2}]},
  sources:[{id:'1',title:'Palmeiras × Santos',date:'01/01/2026',year:2026}]
});
const environmentWith=(responses)=>{
  let calls=0;
  return {
    env:{
      AI_MODEL:'test-model',
      DB:{},
      AI:{run:async()=>{calls+=1;return responses.shift();}}
    },
    calls:()=>calls
  };
};

executeImplementation=async(_db,name)=>execution(name);
const success=environmentWith([
  modelResponse([toolCall('comparar_times',{times:['Palmeiras'],temporada:2026})])
]);
const successResult=await answerQuestion(success.env,'Cartões do Palmeiras em 2026?',[]);
assert.equal(success.calls(),1,'A deterministic answer must use only the routing inference.');
assert.equal(successResult.meta.synthesis,'deterministic');
assert.match(successResult.answer,/Palmeiras/);

executeImplementation=async()=>{throw new DomainError('Informe um nome mais completo.');};
const domainFailure=environmentWith([
  modelResponse([toolCall('perfil_jogador',{jogador:'Lucas'})])
]);
const domainFailureResult=await answerQuestion(domainFailure.env,'Cartões do Lucas?',[]);
assert.equal(domainFailure.calls(),1,'A domain error must not trigger another inference.');
assert.equal(domainFailureResult.meta.synthesis,'deterministic_error');
assert.equal(domainFailureResult.answer,'Informe um nome mais completo.');

executeImplementation=async(_db,name)=>execution(name);
const multipleTools=environmentWith([
  modelResponse([
    toolCall('comparar_times',{times:['Palmeiras']}),
    toolCall('comparar_times',{times:['Corinthians']})
  ]),
  modelResponse([],'Resposta sintetizada.')
]);
const multipleResult=await answerQuestion(multipleTools.env,'Compare os dois recortes.',[]);
assert.equal(multipleTools.calls(),2,'Multiple tool results still require one grounded synthesis.');
assert.equal(multipleResult.answer,'Resposta sintetizada.');

console.log('Answer flow tests passed: deterministic success/error use one inference; multiple tools use grounded synthesis.');
