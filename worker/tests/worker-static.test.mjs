import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../src/tools.ts',import.meta.url),'utf8');
const schema=fs.readFileSync(new URL('../migrations/0001_schema.sql',import.meta.url),'utf8');
const eventsSchema=fs.readFileSync(new URL('../migrations/0002_card_events.sql',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');

assert.match(worker,/Sua única tarefa nesta etapa é escolher a ferramenta/);
assert.match(worker,/SYNTHESIS_PROMPT/);
assert.match(worker,/input\.tools=TOOL_DEFINITIONS/);
assert.match(worker,/Resultados das consultas ao acervo/);
assert.doesNotMatch(worker,/answer:first\.content/);
assert.match(worker,/CHAT_RATE_LIMITER\.limit/);
assert.match(worker,/Origem não autorizada/);
for(const name of ['buscar_partidas','comparar_times','ranquear_times','ranquear_partidas','perfil_arbitro','ranquear_arbitros','perfil_jogador','ranquear_jogadores'])assert.match(tools,new RegExp(`name:'${name}'`));
assert.match(schema,/events_json TEXT NOT NULL/);
assert.match(schema,/CREATE INDEX matches_season_date_idx/);
assert.match(eventsSchema,/CREATE TABLE card_events/);
assert.match(tools,/JOIN card_events/);
assert.match(config,/"binding": "AI"/);
assert.match(config,/llama-3\.3-70b-instruct-fp8-fast/);
assert.match(config,/"limit": 10/);
assert.match(config,/null/);

console.log('Worker static tests passed: grounding, tools, D1, CORS and rate limiting.');
