-- Validation script for migration 44
-- This script checks if the game_item_attributes table was created correctly

-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'game_item_attributes'
) AS table_exists;

-- Check columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'game_item_attributes'
ORDER BY ordinal_position;

-- Check constraints
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'game_item_attributes'
ORDER BY tc.constraint_type, tc.constraint_name;

-- Check indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'game_item_attributes'
ORDER BY indexname;

-- Check table comment
SELECT 
  obj_description('public.game_item_attributes'::regclass) AS table_comment;

-- Check column comments
SELECT 
  col.column_name,
  pgd.description AS column_comment
FROM pg_catalog.pg_statio_all_tables AS st
INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
INNER JOIN information_schema.columns col ON (
  pgd.objsubid = col.ordinal_position
  AND col.table_schema = st.schemaname
  AND col.table_name = st.relname
)
WHERE st.schemaname = 'public'
  AND st.relname = 'game_item_attributes'
ORDER BY col.ordinal_position;
