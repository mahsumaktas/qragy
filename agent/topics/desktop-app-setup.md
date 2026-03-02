# Desktop App Installation

This topic covers installing and setting up the platform's desktop application. Issues range from fresh installations to reinstalls after a system format and troubleshooting when the app fails to launch. Most installation issues can be resolved by following the standard setup process and verifying system requirements.

## Type 1: Fresh Install

The user wants to install the desktop application for the first time.

### Flow

1. Direct the user to the platform's official website or downloads page.
2. Ask the user to select the correct version for their operating system (Windows, macOS, or Linux).
3. Once the download completes, ask the user to run the installer file.
4. Guide the user through the setup wizard: accept the license agreement, choose the installation directory (default is recommended), and click "Install."
5. Once installation is complete, ask the user to launch the application and sign in with their account credentials.
6. If the user encounters a system requirements error, ask them to check the minimum requirements listed on the downloads page (OS version, RAM, disk space).

## Type 2: Reinstall After Format

The user has formatted their computer or reinstalled their operating system and needs to set up the desktop app again.

### Flow

1. Reassure the user that their account data is stored on the platform's servers, so nothing is lost from reformatting.
2. Direct the user to the platform's official website or downloads page to download the latest version of the desktop app.
3. Ask the user to run the installer and follow the setup wizard as described in Type 1.
4. Once installed, ask the user to sign in with their existing account credentials.
5. Explain that any locally cached data (such as offline files or preferences) will need to sync again, which may take a few minutes depending on the amount of data.
6. If the user has trouble signing in after reinstalling, suggest resetting their password or refer to the Login & Authentication Issues topic.

## Type 3: App Not Launching

The user has installed the desktop app but it does not open, crashes on startup, or shows an error.

### Flow

1. Ask the user to try restarting their computer and launching the app again.
2. If the app still does not open, ask the user to check that their operating system meets the minimum requirements (OS version, available RAM, disk space).
3. On Windows, suggest the user right-click the app icon and select "Run as Administrator."
4. On macOS, ask the user to check System Settings > Privacy & Security to see if the app was blocked and click "Open Anyway."
5. Suggest the user uninstall the app completely, restart their computer, and perform a fresh install from the downloads page.
6. If the app was working before and stopped after an OS update, suggest checking for a newer version of the desktop app that may include compatibility fixes.
7. If the issue persists after reinstalling, collect details about the error message (if any) and the user's operating system version, then escalate to live support.

## Required Information

- Operating system and version (Windows 10/11, macOS version, Linux distribution)
- Error message text (if any)
- Whether the app was previously working or is a new install

## Escalation

The bot can resolve most installation issues by guiding the user through the download and setup process. Escalation to live support is needed when the app fails to launch after a clean reinstall, when there are persistent error messages that are not resolved by the standard steps, or when the user's system meets requirements but the app still does not work.

## Bot should

- Guide the user through the complete download and installation process step by step.
- Suggest checking system requirements early in the troubleshooting flow.
- Reassure users who reformatted that their data is safe on the server.
- Recommend running the latest version of the app.
- Provide OS-specific guidance (Run as Administrator on Windows, Security settings on macOS).

## Bot should NOT

- Provide direct download links unless they are officially configured in the knowledge base.
- Suggest modifying system files, registry entries, or terminal commands that could harm the user's computer.
- Assume the user's operating system without asking.
- Tell the user their computer is incompatible without checking specific requirements first.
- Attempt to remotely install or configure the app on the user's behalf.
