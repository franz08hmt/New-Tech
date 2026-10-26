-- Rollback of 027_workspace_members.sql. Operator-run, in a maintenance window,
-- after a backup. It removes only what 027 added: members already granted stay
-- (they are ordinary workspace_memberships rows); profiles and open invitations
-- are lost. The API keeps working: the Members page reports "not available".
-- Never run this on a database where 027 was not applied.
BEGIN;
DROP FUNCTION examate_private.accept_workspace_invitation(uuid, uuid, text);
DROP FUNCTION examate_private.record_member_profile(uuid, uuid, text, text);
DROP FUNCTION public.examate_invitation_revoke(uuid);
DROP FUNCTION public.examate_member_invite(text, text);
DROP FUNCTION public.examate_member_grant(uuid, text);
DROP FUNCTION public.examate_member_set_active(uuid, boolean);
DROP FUNCTION public.examate_member_set_role(uuid, text);
DROP FUNCTION public.examate_invitations_list();
DROP FUNCTION public.examate_member_requests();
DROP FUNCTION public.examate_members_list();
DROP FUNCTION public.examate_member_caller();
DROP TABLE public.workspace_invitations;
DROP TABLE public.workspace_member_profiles;
DELETE FROM public.schema_migrations WHERE name = '027_workspace_members.sql';
COMMIT;
