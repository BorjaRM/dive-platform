-- Preserve the invariant when the app role updates membership status or roles directly.
CREATE OR REPLACE FUNCTION iam_app.prevent_last_owner_removal()
RETURNS trigger LANGUAGE plpgsql SET search_path = iam_app, pg_temp AS $$
BEGIN
	IF OLD.status = 'active'
		AND OLD.roles @> ARRAY['tenant_owner']::text[]
		AND (
			NEW.status <> 'active'
			OR NOT (NEW.roles @> ARRAY['tenant_owner']::text[])
		) THEN
		PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 0));
		IF (
			SELECT count(*)
			FROM iam_app.memberships
			WHERE tenant_id = NEW.tenant_id
				AND status = 'active'
				AND roles @> ARRAY['tenant_owner']::text[]
		) <= 1 THEN
			RAISE EXCEPTION 'Cannot remove last tenant owner' USING ERRCODE = '23514';
		END IF;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.prevent_last_owner_removal() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS memberships_last_owner_guard ON iam_app.memberships;
--> statement-breakpoint
CREATE TRIGGER memberships_last_owner_guard
BEFORE UPDATE OF status, roles ON iam_app.memberships
FOR EACH ROW EXECUTE FUNCTION iam_app.prevent_last_owner_removal();