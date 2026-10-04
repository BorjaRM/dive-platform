REVOKE ALL ON FUNCTION iam_app.issue_membership_invitation_command(
  text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.issue_membership_invitation_command(
  text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid
) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_membership_invitation_command(
  text, text, uuid, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_membership_invitation_command(
  text, text, uuid, uuid, uuid
) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_owner_invitation_command(
  text, text, uuid, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_owner_invitation_command(
  text, text, uuid, uuid, uuid
) TO dive_app;
