-- Check if Mining Heads have size attributes
SELECT 
  gi.name,
  gia.attribute_name,
  gia.attribute_value
FROM game_items gi
LEFT JOIN game_item_attributes gia ON gi.id = gia.game_item_id
WHERE gi.name ILIKE '%mining%head%'
ORDER BY gi.name, gia.attribute_name;
