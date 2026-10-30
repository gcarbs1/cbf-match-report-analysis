import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../ai.js',import.meta.url),'utf8');
assert.match(script,/cbf-sumulas-ai\.cbf-sumulas-ai-worker\.workers\.dev/);
assert.match(script,/CHAT_TIMEOUT_MS=75_000/);
assert.match(script,/new AbortController\(\)/);

const makeElement=()=>{
  const handlers=new Map();
  return {
    value:'',textContent:'',innerHTML:'',scrollTop:0,scrollHeight:0,disabled:false,children:[],dataset:{},
    classList:{toggle(){}},
    addEventListener(type,handler){handlers.set(type,handler);},
    append(node){this.children.push(node);},
    remove(){this.removed=true;},
    setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},dispatchEvent(){},
    closest(){return null;},
    handlers
  };
};

const elements=new Map();
for(const id of ['aiMessages','aiForm','aiInput','aiSend','aiStatus','matchYear','partidas'])elements.set(id,makeElement());
const document={
  getElementById:id=>elements.get(id)||null,
  querySelectorAll:()=>[],
  createElement:()=>makeElement()
};
const requests=[];
let failChat=false;
let timeoutChat=false;
const fetch=async(url,options={})=>{
  requests.push({url,options});
  if(url.endsWith('/health'))return {ok:true,json:async()=>({ok:true})};
  if(failChat)throw new TypeError('Failed to fetch');
  if(timeoutChat){
    const error=new Error('The operation was aborted.');
    error.name='AbortError';
    throw error;
  }
  return {ok:true,json:async()=>({
    answer:'**Anderson Daronco** apitou Corinthians × Palmeiras em 03/09/2023.',
    sources:[{id:'2023-foo',title:'Corinthians × Palmeiras',date:'03/09/2023',year:2023}]
  })};
};

const context={document,window:{},fetch,AbortController,setTimeout,clearTimeout,Event,console};
vm.runInNewContext(script,context,{filename:'ai.js'});
await new Promise(resolve=>setTimeout(resolve,0));

assert.equal(requests[0].url,'https://cbf-sumulas-ai.cbf-sumulas-ai-worker.workers.dev/health');
assert.equal(elements.get('aiStatus').textContent,'AI online');

elements.get('aiInput').value='quem apitou palmeiras e corinthinas em 2023';
elements.get('aiForm').handlers.get('submit')({preventDefault(){}});
await new Promise(resolve=>setTimeout(resolve,10));

assert.equal(requests.length,2);
assert.equal(requests[1].url,'https://cbf-sumulas-ai.cbf-sumulas-ai-worker.workers.dev/chat');
const payload=JSON.parse(requests[1].options.body);
assert.equal(payload.message,'quem apitou palmeiras e corinthinas em 2023');
assert.deepEqual(payload.history,[]);
const rendered=elements.get('aiMessages').children.map(child=>child.innerHTML).join('\n');
assert.match(rendered,/Anderson Daronco/);
assert.match(rendered,/Ver partidas de referência \(1\)/);

failChat=true;
elements.get('aiInput').value='qual foi a partida com mais cartões?';
elements.get('aiForm').handlers.get('submit')({preventDefault(){}});
await new Promise(resolve=>setTimeout(resolve,10));
const failureRendered=elements.get('aiMessages').children.map(child=>child.innerHTML).join('\n');
assert.match(failureRendered,/Não foi possível conectar ao serviço de AI/);
assert.doesNotMatch(failureRendered,/Failed to fetch/);
assert.equal(elements.get('aiStatus').textContent,'AI indisponível');

failChat=false;
timeoutChat=true;
elements.get('aiInput').value='quantos cartões tomou Gustavo Gómez?';
elements.get('aiForm').handlers.get('submit')({preventDefault(){}});
await new Promise(resolve=>setTimeout(resolve,10));
const timeoutRendered=elements.get('aiMessages').children.map(child=>child.innerHTML).join('\n');
assert.match(timeoutRendered,/A consulta ultrapassou 75 segundos/);
assert.equal(elements.get('aiStatus').textContent,'AI lenta');

console.log('AI frontend smoke test passed: health, chat, evidence, network failure and timeout states.');
