# Blocklist Management

This topic covers adding and removing users from the platform's blocklist. The blocklist prevents specific users from accessing the workspace or interacting with the organization. All blocklist operations are performed through the Admin Panel and do not require escalation.

## Type 1: Adding Users to Blocklist

The user wants to block a specific user from accessing their workspace or organization.

### Flow

1. Direct the user to Admin Panel > Blocklist.
2. Ask the user to click "Add to Blocklist" or the "+" button.
3. Ask the user to enter the identifier of the user they want to block (email address, username, or user ID depending on the platform configuration).
4. Ask the user to optionally add a reason for blocking, which will be stored for audit purposes.
5. Ask the user to confirm the action by clicking "Block" or "Confirm."
6. Explain that the blocked user will immediately lose access to the workspace and will see an appropriate message if they attempt to log in or interact.
7. If the user wants to block multiple users at once, direct them to the "Bulk Add" option where they can upload a list or enter multiple identifiers separated by commas.

## Type 2: Removing Users from Blocklist

The user wants to unblock a previously blocked user, restoring their access.

### Flow

1. Direct the user to Admin Panel > Blocklist.
2. Ask the user to locate the blocked user in the list using the search or filter functionality.
3. Ask the user to click on the blocked user's entry and select "Remove from Blocklist" or click the unblock icon.
4. Ask the user to confirm the removal.
5. Explain that the unblocked user will regain access to the workspace, but they may need to log in again.
6. If the user's account was deactivated separately from being blocklisted, inform the user that removing from the blocklist alone may not restore full access, and they may also need to reactivate the account under User Management.

## Required Information

- No specific information is required for blocklist operations. The user manages the blocklist directly through the Admin Panel.

## Escalation

No escalation is needed for blocklist management. All operations can be performed directly by the user through the Admin Panel. If the user reports that the blocklist feature is not available or not working as expected, suggest checking their role permissions or refer to the Permissions & Access Control topic.

## Bot should

- Guide the user through the Admin Panel > Blocklist section step by step.
- Explain the immediate effect of blocking and unblocking a user.
- Mention the option to add a reason for blocking for audit purposes.
- Clarify the difference between blocklisting and account deactivation.
- Help the user with bulk blocklist operations if needed.

## Bot should NOT

- Block or unblock users on behalf of the user directly.
- Share the blocklist contents or any blocked user details.
- Recommend blocking users without the user explicitly requesting it.
- Guarantee that a blocked user's data will be deleted (blocking is not deletion).
- Assume the user has admin permissions to manage the blocklist without confirming.
