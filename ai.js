(()=>{
'use strict';

const API_ENDPOINT='https://cbf-sumulas-ai.cbf-sumulas-ai-worker.workers.dev';
const ui={
  messages:document.getElementById('aiMessages'),
  form:document.getElementById('aiForm'),
  input:document.getElementById('aiInput'),
  send:document.getElementById('aiSend'),
  status:document.getElementById('aiStatus')
};
if(!ui.messages||!ui.form||!ui.input||!ui.send||!ui.status)return;

let busy=false;
const history=[];
const clean=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const inline=value=>clean(value)
  .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  .replace(/`([^`]+)`/g,'<code>$1</code>');

function answerHtml(value){
  const lines=String(value??'').replace(/\r/g,'').split('\n');
  let html='',list='';
  const closeList=()=>{if(list){html+=`</${list}>`;list='';}};
  for(const rawLine of lines){
    const line=rawLine.trim();
    if(!line){closeList();continue;}
    const bullet=line.match(/^[-*]\s+(.+)/);
    const numbered=line.match(/^\d+[.)]\s+(.+)/);
    if(bullet||numbered){
      const nextList=bullet?'ul':'ol';
      if(list!==nextList){closeList();list=nextList;html+=`<${list} class="ai-list">`;}
      html+=`<li>${inline((bullet||numbered)[1])}</li>`;
      continue;
    }
    closeList();
    const heading=line.match(/^#{1,3}\s+(.+)/);
    html+=heading?`<p><strong>${inline(heading[1])}</strong></p>`:`<p>${inline(line)}</p>`;
  }
  closeList();
  return html||'<p>Não recebi uma resposta. Tente novamente.</p>';
}

function sourceButtons(sources){
  if(!Array.isArray(sources)||!sources.length)return'';
  return '<details class="ai-evidence"><summary>Ver fontes ('+clean(sources.length)+')</summary><div class="ai-evidence-list" aria-label="Partidas usadas como fonte">'+sources.map(source=>{
    const label=`${source.title||'Partida'} · ${source.date||source.year||''}`;
    return '<button class="ai-source" type="button" data-match="'+clean(source.id)+'" data-year="'+clean(source.year)+'">'+clean(label)+'</button>';
  }).join('')+'</div></details>';
}

function addMessage(role,html,sources=[]){
  const article=document.createElement('article');
  article.className='ai-message '+role;
  article.innerHTML=role==='assistant'
    ?'<div class="ai-avatar" aria-hidden="true">AI</div><div class="ai-bubble">'+html+sourceButtons(sources)+'</div>'
    :'<div class="ai-bubble">'+html+'</div>';
  ui.messages.append(article);
  ui.messages.scrollTop=ui.messages.scrollHeight;
  return article;
}

const addThinking=()=>addMessage('assistant','<div class="ai-thinking" aria-label="Consultando o acervo"><i></i><i></i><i></i></div>');

function setStatus(text,state=''){
  ui.status.textContent=text;
  ui.status.classList.toggle('remote',state==='online');
  ui.status.classList.toggle('loading',state==='loading');
}

async function fetchWithTimeout(path,options={},timeout=45_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(API_ENDPOINT+path,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}

async function checkHealth(){
  setStatus('Conectando','loading');
  try{
    const response=await fetchWithTimeout('/health',{},10_000);
    if(!response.ok)throw new Error('Serviço indisponível');
    const data=await response.json();
    if(!data.ok)throw new Error('Serviço indisponível');
    setStatus('AI online','online');
  }catch{
    setStatus('AI indisponível');
  }
}

async function submit(question){
  const message=question.trim();
  if(busy||!message)return;
  busy=true;
  ui.send.disabled=true;
  ui.form.setAttribute('aria-busy','true');
  ui.input.value='';
  addMessage('user','<p>'+clean(message)+'</p>');
  const thinking=addThinking();
  setStatus('Consultando','loading');
  try{
    const response=await fetchWithTimeout('/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message,history:history.slice(-6)})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Não foi possível consultar a AI.');
    thinking.remove();
    addMessage('assistant',answerHtml(data.answer),data.sources||[]);
    history.push({role:'user',content:message},{role:'assistant',content:data.answer});
    if(history.length>12)history.splice(0,history.length-12);
    setStatus('AI online','online');
  }catch(error){
    thinking.remove();
    const timedOut=error?.name==='AbortError';
    const networkFailure=error?.name==='TypeError'&&/fetch|network|load failed/i.test(error.message||'');
    const detail=timedOut
      ?'A resposta demorou mais que o esperado. Tente novamente.'
      :networkFailure
        ?'Não foi possível conectar ao serviço de AI. Verifique sua internet e tente novamente.'
        :error.message;
    addMessage('assistant','<p><strong>Não consegui concluir a consulta.</strong></p><p>'+clean(detail)+'</p>');
    setStatus('AI indisponível');
  }finally{
    busy=false;
    ui.send.disabled=false;
    ui.form.removeAttribute('aria-busy');
    ui.input.focus();
  }
}

ui.form.addEventListener('submit',event=>{
  event.preventDefault();
  submit(ui.input.value);
});
ui.input.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ui.form.requestSubmit();}
});
document.querySelectorAll('[data-ai-prompt]').forEach(button=>button.addEventListener('click',()=>submit(button.dataset.aiPrompt||'')));
ui.messages.addEventListener('click',event=>{
  const button=event.target.closest('[data-match]');
  if(!button)return;
  const year=document.getElementById('matchYear');
  if(year){year.value=button.dataset.year;year.dispatchEvent(new Event('change'));}
  if(typeof window.showMatch==='function')window.showMatch(button.dataset.match);
  document.getElementById('partidas')?.scrollIntoView({behavior:'smooth'});
});

checkHealth();
})();
