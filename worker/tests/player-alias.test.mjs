import assert from 'node:assert/strict';
import fs from 'node:fs';

const seedBuilder=fs.readFileSync(new URL('../scripts/build-seed.mjs',import.meta.url),'utf8');
const curatedAliases=JSON.parse(fs.readFileSync(new URL('../config/player-aliases.json',import.meta.url),'utf8'));
const compatibilityMigration=fs.readFileSync(new URL('../migrations/0003_juninho_capixaba_alias.sql',import.meta.url),'utf8');
const aliasMigration=fs.readFileSync(new URL('../migrations/0004_player_aliases.sql',import.meta.url),'utf8');

assert.deepEqual(curatedAliases['id:402681'],['Juninho Capixaba']);
assert.match(seedBuilder,/config','player-aliases\.json/);
assert.match(seedBuilder,/\.\.\.\(playerAliases\[player\.id\]\|\|\[\]\)/);
assert.match(seedBuilder,/INSERT OR IGNORE INTO player_aliases/);
assert.match(seedBuilder,/seed-player-aliases\.sql/);
assert.match(compatibilityMigration,/WHERE id = 'id:402681'/);
assert.match(compatibilityMigration,/json_insert\(aliases_json, '\$\[#\]', 'Juninho Capixaba'\)/);
assert.match(aliasMigration,/CREATE TABLE player_aliases/);
assert.match(aliasMigration,/PRIMARY KEY \(normalized_alias, player_id\)/);
assert.match(aliasMigration,/CREATE INDEX player_aliases_player_idx/);

console.log('Player alias test passed: normalized indexed aliases are generated for fresh and existing D1 databases.');
