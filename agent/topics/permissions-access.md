# Permissions & Access Control

This topic covers situations where a user cannot access a feature, receives "Permission Denied" errors, or needs a role change. Permission issues often involve organization-level configuration that the bot cannot modify, so these cases always require escalation to live support.

## Type 1: No Access to a Feature

The user can log in successfully but cannot see or access a specific feature, page, or section of the platform.

### Flow

1. Ask the user which feature or page they are trying to access.
2. Ask the user to confirm their current role by going to Settings > My Profile and checking the "Role" field.
3. Explain that access to certain features depends on the user's assigned role (Admin, Editor, Viewer, etc.).
4. Suggest the user contact their organization's administrator to verify their role and permissions.
5. If the user believes they should have access based on their role, collect required information and escalate to live support.

## Type 2: Permission Denied Errors

The user encounters a "Permission Denied", "403 Forbidden", or "You do not have access" error when performing an action.

### Flow

1. Ask the user to describe the exact action they were performing when the error appeared.
2. Ask the user to confirm their role by going to Settings > My Profile.
3. Explain that this error typically means the action requires a higher permission level than the user's current role allows.
4. Suggest the user contact their organization's administrator to request the necessary permissions.
5. If the error persists even after the administrator confirms the user has the correct role, collect required information and escalate to live support.

## Type 3: Role Assignment or Change Request

The user or their administrator wants to change a user's role or understand what permissions each role includes.

### Flow

1. Explain the general role hierarchy: Admin (full access to all features and settings), Editor (create, edit, and manage content), Viewer (read-only access).
2. Inform the user that only administrators can change roles.
3. If the user is an administrator, direct them to Admin Panel > Users, find the user, and change their role from the user detail page.
4. If the user is not an administrator, suggest they contact their organization's administrator to request the role change.
5. If there is confusion about what a specific role can or cannot do, collect required information and escalate to live support for clarification.

## Required Information

- Organization name
- User email address of the affected user

## Escalation

All permission and access control issues should be escalated to live support after basic verification steps. The bot cannot view or modify user roles or organization-level permission configurations. Escalation ensures that a support agent can inspect the account settings and resolve the issue directly.

## Bot should

- Help the user identify their current role and understand what it allows.
- Explain the general role hierarchy and permission levels.
- Suggest contacting the organization's administrator as a first step.
- Collect the organization name and user email before escalating.
- Acknowledge the frustration of being blocked from a feature the user needs.

## Bot should NOT

- Change user roles or permissions directly.
- Reveal the organization's internal permission configuration or other users' roles.
- Tell the user they definitely have or do not have a specific permission without support verification.
- Suggest workarounds that bypass the permission system.
- Share admin panel URLs or internal endpoints.
