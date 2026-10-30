import assert from 'node:assert/strict';
import fs from 'node:fs';

const seedBuilder=fs.readFileSync(new URL('../scripts/build-seed.mjs',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0003_juninho_capixaba_alias.sql',import.meta.url),'utf8');

assert.match(seedBuilder,/'id:402681':\['Juninho Capixaba'\]/);
assert.match(seedBuilder,/\.\.\.\(playerAliases\[player\.id\]\|\|\[\]\)/);
assert.match(migration,/WHERE id = 'id:402681'/);
assert.match(migration,/json_insert\(aliases_json, '\$\[#\]', 'Juninho Capixaba'\)/);
assert.match(migration,/NOT EXISTS[\s\S]*json_each\(players\.aliases_json\)[\s\S]*WHERE value = 'Juninho Capixaba'/);

console.log('Player alias test passed: fresh seeds and existing D1 databases include Juninho Capixaba.');
