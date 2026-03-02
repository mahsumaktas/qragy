# Integrations & API

This topic covers connecting third-party services, managing API keys, configuring webhooks, troubleshooting sync issues, and understanding rate limits. Most integration tasks can be resolved by guiding the user through the Settings panel, but complex configuration issues may require escalation.

## Type 1: API Key Issues

The user needs to create, rotate, or troubleshoot an API key that is not working.

### Flow

1. Direct the user to Settings > Integrations > API Keys.
2. If the user needs a new key, ask them to click "Generate New API Key", give it a descriptive name, and copy the key immediately (it will not be shown again).
3. If an existing key is not working, ask the user to check whether the key has been revoked or expired by reviewing the status column in the API Keys list.
4. Suggest the user regenerate the key if they suspect it has been compromised or if it shows as expired.
5. Remind the user to update the new key in all applications or services that use it.
6. If the key is active but API calls still fail, ask the user to verify they are including the key correctly in the request headers (typically as `Authorization: Bearer <API_KEY>`).

## Type 2: Webhook Failures

The user has configured a webhook but it is not receiving events, or it is returning errors.

### Flow

1. Direct the user to Settings > Integrations > Webhooks.
2. Ask the user to verify that the webhook URL is correct and publicly accessible (not behind a firewall or VPN).
3. Ask the user to check the webhook delivery log by clicking on the webhook entry and viewing "Recent Deliveries".
4. If deliveries show error status codes (4xx or 5xx), explain that the issue is likely on the receiving server and suggest checking the endpoint's logs.
5. If there are no delivery attempts listed, ask the user to verify the correct event types are selected for the webhook trigger.
6. Suggest the user test the webhook by clicking "Send Test Event" if available.
7. If the issue persists, collect required information and escalate to live support.

## Type 3: Sync Problems

Data is not syncing correctly between the platform and a connected third-party service.

### Flow

1. Ask the user which integration is affected (e.g., CRM, email marketing, project management tool).
2. Direct the user to Settings > Integrations and locate the affected integration.
3. Ask the user to check the connection status. If it shows "Disconnected" or "Error", suggest clicking "Reconnect" and re-authorizing the integration.
4. If the connection is active but data is not syncing, ask the user to check the last sync timestamp and try triggering a manual sync if the option is available.
5. Explain that sync intervals vary by integration and some syncs may take up to 15 minutes.
6. If the sync issue persists after reconnecting, collect required information and escalate to live support.

## Type 4: Rate Limits

The user is receiving "429 Too Many Requests" errors or their API calls are being throttled.

### Flow

1. Explain that the platform enforces rate limits to ensure fair usage and system stability.
2. Direct the user to Settings > Integrations > API Usage to view their current usage and limits.
3. Ask the user to review the rate limit details for their plan (e.g., requests per minute, requests per day).
4. Suggest the user implement exponential backoff in their API client to handle rate limit responses gracefully.
5. If the user's legitimate use case requires higher limits, suggest they consider upgrading their plan or contact support to discuss increased limits.

## Required Information

- Organization name
- Integration name or API endpoint in question

## Escalation

The bot can resolve most integration questions by guiding the user through the settings panel. Escalation to live support is needed for persistent webhook failures after verification, sync issues that do not resolve with reconnection, API keys that appear active but consistently fail, and rate limit increase requests that cannot be addressed by a plan upgrade.

## Bot should

- Guide the user through the Integrations section step by step.
- Help the user verify API key status, webhook URLs, and connection states.
- Explain rate limits and suggest best practices like exponential backoff.
- Remind the user to copy new API keys immediately after generation.
- Suggest checking the webhook delivery log for error details.

## Bot should NOT

- Display, generate, or rotate API keys on behalf of the user.
- Access the user's webhook payloads or API request logs directly.
- Provide specific rate limit numbers unless they are part of the public documentation.
- Suggest disabling rate limits or security measures.
- Debug the user's custom code or third-party application configurations in detail.
