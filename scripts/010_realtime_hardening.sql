-- Realtime hardening hotfix (idempotent)
-- Safe to run multiple times in Supabase SQL editor.

DO $$
DECLARE
  target_tables text[] := ARRAY[
    'users',
    'categories',
    'todos',
    'todo_assignees',
    'checklist_items',
    'comments',
    'comment_reactions',
    'labels',
    'todo_labels',
    'attachments',
    'notifications',
    'activity_logs'
  ];
  tbl text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime';
  END IF;

  FOREACH tbl IN ARRAY target_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END
$$;

ALTER TABLE IF EXISTS public.notifications REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.comment_reactions REPLICA IDENTITY FULL;
