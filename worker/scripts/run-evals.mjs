import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory=path.dirname(fileURLToPath(import.meta.url));
const workerDirectory=path.resolve(scriptDirectory,'..');
const suitePath=path.join(workerDirectory,'evals','cases.json');
const suite=JSON.parse(fs.readFileSync(suitePath,'utf8'));
const DEFAULT_ENDPOINT='https://cbf-sumulas-ai.cbf-sumulas-ai-worker.workers.dev/chat';

const usage=`Uso:
  npm run eval -- [opções]

Por segurança, sem --confirm-live o comando apenas mostra o plano da execução.

Opções:
  --confirm-live          Autoriza chamadas reais ao endpoint e consumo de Neurons.
  --endpoint URL          Endpoint /chat (padrão: produção).
  --limit N               Máximo de casos após os filtros.
  --offset N              Ignora os primeiros N casos selecionados.
  --category LISTA        Categorias separadas por vírgula.
  --per-category N        Seleciona até N casos de cada categoria.
  --filter TEXTO          Filtra por id ou pergunta, sem diferenciar maiúsculas.
  --delay-ms N            Intervalo entre chamadas (padrão: 6500).
  --timeout-ms N          Timeout de cada chamada (padrão: 90000).
  --output ARQUIVO        Grava o relatório JSON também em um arquivo.
  --fail-on-error         Retorna código 1 se algum caso falhar.
  --help                  Exibe esta ajuda.

Exemplos:
  npm run eval -- --category players --limit 5
  npm run eval -- --category aliases_typos --limit 8 --confirm-live
  npm run eval -- --filter palmeiras --limit 3 --confirm-live --output eval-results.json`;

const valueAfter=(argv,index,flag)=>{
  const value=argv[index+1];
  if(value===undefined||value.startsWith('--'))throw new Error(`${flag} exige um valor.`);
  return value;
};

const nonNegativeInteger=(value,flag)=>{
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<0)throw new Error(`${flag} deve ser um inteiro não negativo.`);
  return parsed;
};

const positiveInteger=(value,flag)=>{
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<1)throw new Error(`${flag} deve ser um inteiro positivo.`);
  return parsed;
};

const parseArgs=argv=>{
  const options={
    endpoint:DEFAULT_ENDPOINT,
    limit:undefined,
    offset:0,
    categories:[],
    perCategory:undefined,
    filter:'',
    delayMs:6500,
    timeoutMs:90_000,
    output:'',
    confirmLive:false,
    failOnError:false,
    help:false
  };
  for(let index=0;index<argv.length;index+=1){
    const argument=argv[index];
    if(argument==='--confirm-live'){options.confirmLive=true;continue;}
    if(argument==='--fail-on-error'){options.failOnError=true;continue;}
    if(argument==='--help'){options.help=true;continue;}
    if(argument==='--endpoint'){options.endpoint=valueAfter(argv,index,argument);index+=1;continue;}
    if(argument==='--limit'){options.limit=positiveInteger(valueAfter(argv,index,argument),argument);index+=1;continue;}
    if(argument==='--offset'){options.offset=nonNegativeInteger(valueAfter(argv,index,argument),argument);index+=1;continue;}
    if(argument==='--category'){
      options.categories=valueAfter(argv,index,argument).split(',').map(value=>value.trim()).filter(Boolean);
      index+=1;
      continue;
    }
    if(argument==='--per-category'){options.perCategory=positiveInteger(valueAfter(argv,index,argument),argument);index+=1;continue;}
    if(argument==='--filter'){options.filter=valueAfter(argv,index,argument).trim().toLowerCase();index+=1;continue;}
    if(argument==='--delay-ms'){options.delayMs=nonNegativeInteger(valueAfter(argv,index,argument),argument);index+=1;continue;}
    if(argument==='--timeout-ms'){options.timeoutMs=positiveInteger(valueAfter(argv,index,argument),argument);index+=1;continue;}
    if(argument==='--output'){options.output=valueAfter(argv,index,argument);index+=1;continue;}
    throw new Error(`Opção desconhecida: ${argument}`);
  }
  const endpoint=new URL(options.endpoint);
  if(!['http:','https:'].includes(endpoint.protocol))throw new Error('--endpoint deve usar HTTP ou HTTPS.');
  options.endpoint=endpoint.toString();
  return options;
};

const normalize=value=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase();

const percentile=(values,ratio)=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1)];
};

export const validateResponse=(testCase,status,data)=>{
  const failures=[];
  const expected=testCase.expected||{};
  const expectedStatus=Number(expected.status??200);
  const answer=String(data?.answer??'');
  const normalizedAnswer=normalize(answer);
  const tools=Array.isArray(data?.meta?.tools)?data.meta.tools:[];
  const sources=Array.isArray(data?.sources)?data.sources:[];

  if(status!==expectedStatus)failures.push({rule:'status',expected:expectedStatus,actual:status});
  if(expected.tool===null&&tools.length)failures.push({rule:'tool',expected:null,actual:tools});
  if(typeof expected.tool==='string'&&!tools.includes(expected.tool))failures.push({rule:'tool',expected:expected.tool,actual:tools});

  for(const value of expected.answerIncludes||[]){
    if(!normalizedAnswer.includes(normalize(value)))failures.push({rule:'answerIncludes',expected:value});
  }
  if(Array.isArray(expected.answerAnyOf)&&expected.answerAnyOf.length){
    const matched=expected.answerAnyOf.some(value=>normalizedAnswer.includes(normalize(value)));
    if(!matched)failures.push({rule:'answerAnyOf',expected:expected.answerAnyOf});
  }
  for(const value of expected.answerExcludes||[]){
    if(normalizedAnswer.includes(normalize(value)))failures.push({rule:'answerExcludes',expected:value});
  }

  const minimumSources=expected.sources?.min;
  const maximumSources=expected.sources?.max;
  if(Number.isInteger(minimumSources)&&sources.length<minimumSources){
    failures.push({rule:'sources.min',expected:minimumSources,actual:sources.length});
  }
  if(Number.isInteger(maximumSources)&&sources.length>maximumSources){
    failures.push({rule:'sources.max',expected:maximumSources,actual:sources.length});
  }
  for(const value of expected.sourceTitlesInclude||[]){
    const found=sources.some(source=>normalize(source?.title).includes(normalize(value)));
    if(!found)failures.push({rule:'sourceTitlesInclude',expected:value});
  }

  return {failures,answer,tools,sources};
};

export const isInfrastructureFailure=(status,data)=>
  status===429||status===502||status===504||data?.code==='AI_QUOTA_EXCEEDED';

const executeCase=async(testCase,options)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),options.timeoutMs);
  const started=performance.now();
  try{
    const response=await fetch(options.endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:testCase.question,history:testCase.history||[]}),
      signal:controller.signal
    });
    const data=await response.json().catch(()=>({error:'Resposta não é JSON.'}));
    const latencyMs=Math.round(performance.now()-started);
    const validation=validateResponse(testCase,response.status,data);
    return {
      id:testCase.id,
      category:testCase.category,
      question:testCase.question,
      passed:validation.failures.length===0,
      infrastructure_failure:isInfrastructureFailure(response.status,data),
      latency_ms:latencyMs,
      failures:validation.failures,
      observed:{
        status:response.status,
        tools:validation.tools,
        sources:validation.sources.length,
        answer:validation.answer.slice(0,800),
        model:data?.meta?.model??null,
        synthesis:data?.meta?.synthesis??null,
        routing:data?.meta?.routing??null,
        timings:data?.meta?.timings??null,
        usage:data?.meta?.usage??null,
        request_id:data?.request_id??null,
        error:data?.error??null
      }
    };
  }catch(error){
    const latencyMs=Math.round(performance.now()-started);
    return {
      id:testCase.id,
      category:testCase.category,
      question:testCase.question,
      passed:false,
      infrastructure_failure:true,
      latency_ms:latencyMs,
      failures:[{rule:error?.name==='AbortError'?'timeout':'request',actual:error?.message||String(error)}],
      observed:{status:null,tools:[],sources:0,answer:'',model:null,synthesis:null,routing:null,timings:null,usage:null,request_id:null,error:error?.message||String(error)}
    };
  }finally{
    clearTimeout(timer);
  }
};

const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export const summarize=(results,options,selected)=>{
  const latencies=results.map(result=>result.latency_ms);
  const passed=results.filter(result=>result.passed).length;
  const qualityResults=results.filter(result=>!result.infrastructure_failure);
  const qualityPassed=qualityResults.filter(result=>result.passed).length;
  const byCategory={};
  for(const result of results){
    const metric=byCategory[result.category]||{total:0,passed:0,failed:0};
    metric.total+=1;
    metric[result.passed?'passed':'failed']+=1;
    byCategory[result.category]=metric;
  }
  return {
    suite:{version:suite.version,dataset:suite.dataset,total_cases:suite.cases.length},
    run:{
      created_at:new Date().toISOString(),
      endpoint:options.endpoint,
      selected_cases:selected.length,
      delay_ms:options.delayMs,
      timeout_ms:options.timeoutMs
    },
    metrics:{
      total:results.length,
      passed,
      failed:results.length-passed,
      pass_rate:results.length?Number(((passed/results.length)*100).toFixed(1)):0,
      quality:{
        total:qualityResults.length,
        passed:qualityPassed,
        failed:qualityResults.length-qualityPassed,
        pass_rate:qualityResults.length?Number(((qualityPassed/qualityResults.length)*100).toFixed(1)):0
      },
      infrastructure_failures:results.length-qualityResults.length,
      latency_ms:{p50:percentile(latencies,0.5),p95:percentile(latencies,0.95),max:latencies.length?Math.max(...latencies):0},
      by_category:byCategory
    },
    results
  };
};

const selectCases=options=>{
  const knownCategories=new Set(suite.cases.map(testCase=>testCase.category));
  for(const category of options.categories){
    if(!knownCategories.has(category))throw new Error(`Categoria desconhecida: ${category}`);
  }
  let selected=suite.cases.filter(testCase=>{
    if(options.categories.length&&!options.categories.includes(testCase.category))return false;
    if(options.filter&&!`${testCase.id} ${testCase.question}`.toLowerCase().includes(options.filter))return false;
    return true;
  });
  if(options.perCategory!==undefined){
    const counts=new Map();
    selected=selected.filter(testCase=>{
      const count=counts.get(testCase.category)||0;
      if(count>=options.perCategory)return false;
      counts.set(testCase.category,count+1);
      return true;
    });
  }
  selected=selected.slice(options.offset);
  if(options.limit!==undefined)selected=selected.slice(0,options.limit);
  return selected;
};

const main=async()=>{
  const options=parseArgs(process.argv.slice(2));
  if(options.help){console.log(usage);return;}
  const selected=selectCases(options);
  if(!selected.length)throw new Error('Nenhum caso corresponde aos filtros informados.');

  if(!options.confirmLive){
    console.log(JSON.stringify({
      mode:'plan',
      message:'Nenhuma chamada foi realizada. Use --confirm-live para executar e consumir Neurons.',
      endpoint:options.endpoint,
      suite_cases:suite.cases.length,
      selected_cases:selected.length,
      categories:Object.fromEntries([...new Set(selected.map(testCase=>testCase.category))].map(category=>[category,selected.filter(testCase=>testCase.category===category).length])),
      estimated_minimum_duration_seconds:Math.ceil(Math.max(0,selected.length-1)*options.delayMs/1000),
      ids:selected.map(testCase=>testCase.id)
    },null,2));
    return;
  }

  const results=[];
  for(let index=0;index<selected.length;index+=1){
    const testCase=selected[index];
    process.stderr.write(`[${index+1}/${selected.length}] ${testCase.id} ... `);
    const result=await executeCase(testCase,options);
    results.push(result);
    process.stderr.write(`${result.passed?'PASS':'FAIL'} (${result.latency_ms} ms)\n`);
    if(index<selected.length-1&&options.delayMs)await sleep(options.delayMs);
  }

  const report=summarize(results,options,selected);
  const serialized=JSON.stringify(report,null,2)+'\n';
  console.log(serialized.trimEnd());
  if(options.output){
    const outputPath=path.resolve(process.cwd(),options.output);
    fs.mkdirSync(path.dirname(outputPath),{recursive:true});
    fs.writeFileSync(outputPath,serialized);
    process.stderr.write(`Relatório gravado em ${outputPath}\n`);
  }
  if(options.failOnError&&report.metrics.failed)process.exitCode=1;
};

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  main().catch(error=>{
    console.error(error?.message||String(error));
    process.exitCode=1;
  });
}
