# Password Reset

This topic covers situations where a user needs to reset their password, either because they forgot it or because it has expired. Password reset requests are security-sensitive and always require escalation to live support for identity verification.

## Type 1: Forgot Password

The user cannot remember their password and needs to regain access to their account.

### Flow

1. Direct the user to the login page and ask them to click the "Forgot Password" link.
2. Ask the user to enter the email address associated with their account.
3. Inform the user that a password reset email will be sent to their registered email address.
4. If the user does not receive the email within 5 minutes, suggest checking the spam or junk folder.
5. If the email still does not arrive, confirm the email address is correct and collect required information for escalation to live support.

## Type 2: Password Expired

The user's password has expired due to the organization's security policy and they are prompted to change it upon login.

### Flow

1. Explain that the organization's security policy requires periodic password changes.
2. Ask the user to follow the on-screen instructions to create a new password.
3. Inform the user of general password requirements: minimum 8 characters, at least one uppercase letter, one number, and one special character.
4. If the user encounters an error while setting a new password, suggest clearing the browser cache and trying again.
5. If the issue persists, collect required information and escalate to live support.

## Required Information

- Organization name
- User email address associated with the account
- IP address (if available, for security verification purposes)

## Escalation

All password reset issues should be escalated to live support after the self-service steps have been attempted. Password resets involve identity verification that the bot cannot perform. When escalating, provide the collected information so the support agent can verify the user's identity quickly.

## Bot should

- Guide the user to the self-service "Forgot Password" flow first.
- Remind the user to check their spam/junk folder for the reset email.
- Ask the user to wait at least 5 minutes before assuming the email was not sent.
- Collect the organization name, email, and IP address before escalating.
- Reassure the user that their account is safe and the process is straightforward.

## Bot should NOT

- Attempt to reset the user's password directly.
- Send password reset links or tokens through the chat.
- Ask the user for their current or old password.
- Confirm or deny whether an email address is registered in the system.
- Share internal security policies or technical details about password hashing or storage.
