# Remote Support Setup

This topic covers setting up a remote support session so that a support agent can connect to the user's computer. This includes downloading the remote support tool, running it, and sharing access credentials. When the user provides their Remote Support ID and Access Code, the conversation should always be escalated to a live agent who will initiate the remote connection.

## Type 1: Downloading the Remote Support Tool

The user needs to download and install the remote support application to enable a remote session.

### Flow

1. Direct the user to the platform's Support page or Help Center where the remote support tool download link is available.
2. Ask the user to click the download link for their operating system (Windows, macOS, or Linux).
3. Once the download completes, ask the user to locate the downloaded file and run the installer.
4. Explain that the tool may require administrator permissions to install. If prompted, the user should click "Allow" or "Run as Administrator."
5. Once the installation is complete, the tool will launch automatically and display a Remote Support ID and an Access Code on screen.
6. Ask the user to share the Remote Support ID and Access Code so that a support agent can connect.

## Type 2: Sharing Remote Access Credentials

The user has the remote support tool running and is ready to share their credentials for a remote session.

### Flow

1. Ask the user to open the remote support tool if it is not already running.
2. Ask the user to read or copy the Remote Support ID displayed on the tool's main screen.
3. Ask the user to read or copy the Access Code (also called Session Code or PIN) displayed below the ID.
4. Once both the Remote Support ID and Access Code are provided, immediately escalate the conversation to a live support agent.
5. Inform the user that a support agent will connect to their session shortly and ask them not to close the remote support tool.

## Type 3: Troubleshooting the Remote Support Tool

The user is having trouble downloading, installing, or running the remote support tool.

### Flow

1. Ask the user to verify they are downloading the correct version for their operating system.
2. If the download fails, suggest trying a different browser or disabling any download-blocking extensions.
3. If the installer does not run, ask the user to right-click the file and select "Run as Administrator" (Windows) or check System Preferences > Security (macOS) to allow the app.
4. If the tool launches but shows an error or no ID, ask the user to close and reopen the tool.
5. Suggest the user check their internet connection, as the tool requires an active connection to generate a session ID.
6. If the issue persists, collect details about the error and escalate to live support.

## Required Information

- Remote Support ID (displayed by the tool)
- Access Code / Session Code (displayed by the tool)
- Operating system (Windows, macOS, Linux)

## Escalation

Always escalate to a live support agent when the user provides both a Remote Support ID and an Access Code. The bot cannot initiate or participate in a remote session. Also escalate if the user cannot get the remote support tool working after following troubleshooting steps.

## Bot should

- Guide the user through downloading and installing the remote support tool step by step.
- Clearly ask for both the Remote Support ID and Access Code.
- Escalate immediately once both credentials are provided.
- Reassure the user that the remote session is secure and the agent will only have access while the session is active.
- Help troubleshoot installation issues before escalating.

## Bot should NOT

- Attempt to initiate a remote connection or access the user's computer.
- Ask for the user's system password or any credentials other than the Remote Support ID and Access Code.
- Keep the conversation going after receiving the Remote Support ID and Access Code instead of escalating.
- Provide direct download links unless they are officially configured in the knowledge base.
- Share internal tool names or access procedures that are not meant for end users.
