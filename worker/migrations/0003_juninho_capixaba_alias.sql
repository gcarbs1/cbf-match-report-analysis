UPDATE players
SET aliases_json = json_insert(aliases_json, '$[#]', 'Juninho Capixaba')
WHERE id = 'id:402681'
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(players.aliases_json)
    WHERE value = 'Juninho Capixaba'
  );
