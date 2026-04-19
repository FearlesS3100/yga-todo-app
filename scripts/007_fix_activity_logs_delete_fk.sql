-- Patch for existing databases: run once in Supabase SQL Editor.
-- Fixes DELETE activity logging to avoid FK violations on activity_logs.todo_id.

CREATE OR REPLACE FUNCTION log_todo_activity()
RETURNS TRIGGER AS $$
DECLARE
    action_type VARCHAR(50);
    old_vals JSONB;
    new_vals JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
        new_vals := to_jsonb(NEW);

        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.workspace_id, NEW.id, NEW.created_by, action_type, 'todo', NEW.id, new_vals);

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            IF NEW.status = 'done' THEN
                action_type := 'completed';
            ELSE
                action_type := 'status_changed';
            END IF;
        ELSIF OLD.category_id != NEW.category_id THEN
            action_type := 'moved';
        ELSIF OLD.position != NEW.position THEN
            action_type := 'reordered';
        ELSE
            action_type := 'updated';
        END IF;

        old_vals := jsonb_build_object(
            'status', OLD.status,
            'category_id', OLD.category_id,
            'title', OLD.title,
            'priority', OLD.priority
        );
        new_vals := jsonb_build_object(
            'status', NEW.status,
            'category_id', NEW.category_id,
            'title', NEW.title,
            'priority', NEW.priority
        );

        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.workspace_id, NEW.id, NEW.created_by, action_type, 'todo', NEW.id, old_vals, new_vals);

    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'deleted';
        old_vals := to_jsonb(OLD);

        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, old_values)
        VALUES (OLD.workspace_id, NULL, OLD.created_by, action_type, 'todo', OLD.id, old_vals);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
