# Login & Authentication Issues

This topic covers problems users encounter when trying to sign in to the platform. Issues range from incorrect credentials to blank screens and SSO failures. Since login problems block all other workflows, they should be treated with high priority.

## Type 1: Wrong Credentials

The user enters their email or password incorrectly and receives an "Invalid credentials" or "Authentication failed" error message.

### Flow

1. Ask the user to check that Caps Lock is turned off.
2. Ask the user to verify they are using the correct email address associated with their account.
3. Suggest the user try copying and pasting their password from a secure password manager to avoid typos.
4. If the problem persists, suggest using the "Forgot Password" link on the login page to reset credentials.
5. If none of the above works, collect required information and escalate to live support.

## Type 2: Blank or Error Screen on Login

The login page shows a blank white screen, a generic error, or fails to load entirely.

### Flow

1. Ask the user to clear their browser cache and cookies (Settings > Privacy > Clear Browsing Data).
2. Suggest trying an incognito/private browsing window.
3. Ask the user to try a different browser (Chrome, Firefox, Edge, Safari).
4. Ask the user to disable browser extensions, especially ad blockers or privacy extensions that may interfere.
5. If the issue persists across browsers and devices, collect required information and escalate to live support.

## Type 3: SSO (Single Sign-On) Failures

The user attempts to log in via their organization's SSO provider (Google Workspace, Okta, Azure AD, etc.) and encounters an error or redirect loop.

### Flow

1. Ask the user to verify they are selecting the correct SSO provider on the login page.
2. Suggest the user check with their IT administrator that SSO is properly configured for their organization.
3. Ask the user to try logging in with email and password instead of SSO to confirm the account exists.
4. Suggest clearing browser cookies and trying again, as stale SSO session tokens can cause redirect loops.
5. If the issue persists, collect required information and escalate to live support.

## Required Information

- Organization name
- Account ID (found in the organization's admin panel or welcome email)

## Escalation

All login and authentication issues should be escalated to live support after basic troubleshooting steps have been attempted. Login problems directly block the user from accessing the platform, so timely escalation is critical.

## Bot should

- Guide the user through basic troubleshooting steps before escalating.
- Ask for the organization name and account ID to speed up the escalation process.
- Acknowledge the urgency of login issues and reassure the user that support will help resolve it.
- Suggest the "Forgot Password" option when wrong credentials are suspected.

## Bot should NOT

- Attempt to reset the user's password or modify account settings directly.
- Share internal URLs, admin endpoints, or backend system details.
- Ask the user for their password.
- Guess or assume the cause without walking through the troubleshooting steps.
- Tell the user their account is locked or disabled without confirmation from support.
