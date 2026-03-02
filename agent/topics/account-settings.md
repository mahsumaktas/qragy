# Account Settings & Preferences

This topic covers user-facing settings such as theme and display preferences, notification configurations, timezone selection, and language options. These are self-service actions that the bot can fully resolve by guiding the user through the Settings panel.

## Type 1: Theme and Display Settings

The user wants to change the visual appearance of the platform, such as switching between light and dark mode or adjusting display density.

### Flow

1. Direct the user to Settings > Preferences > Display.
2. Ask the user to select their preferred theme: Light, Dark, or System Default.
3. Explain that "System Default" follows the operating system's theme setting.
4. If the user wants to adjust font size or display density, point them to the "Display" section on the same page.
5. Changes are saved automatically once a selection is made.

## Type 2: Notification Settings

The user wants to enable, disable, or customize notifications they receive from the platform.

### Flow

1. Direct the user to Settings > Preferences > Notifications.
2. Explain the available notification channels: email, in-app, and push notifications (if the user has the mobile or desktop app installed).
3. Ask the user to toggle the notification types they want to receive or mute.
4. If the user wants to set a "Do Not Disturb" schedule, point them to the quiet hours configuration at the bottom of the Notifications page.
5. Changes are saved automatically once toggled.

## Type 3: Timezone Settings

The user wants to change the timezone used for displaying dates and scheduling within the platform.

### Flow

1. Direct the user to Settings > Preferences > General.
2. Ask the user to find the "Timezone" dropdown and select their correct timezone.
3. Explain that changing the timezone affects how dates, times, and scheduled events are displayed throughout the platform.
4. Inform the user that this setting applies only to their account and does not affect other users in the organization.
5. Ask the user to click "Save" if changes are not auto-saved.

## Type 4: Language Settings

The user wants to change the language of the platform interface.

### Flow

1. Direct the user to Settings > Preferences > General.
2. Ask the user to find the "Language" dropdown and select their preferred language.
3. Explain that changing the language will translate the platform interface but will not translate user-generated content such as messages or documents.
4. The page may reload after the language change is applied.
5. If the desired language is not available in the dropdown, inform the user that the platform currently supports the listed languages only.

## Required Information

No additional information is needed. These settings are accessible directly by the user.

## Escalation

No escalation is needed for account settings and preferences. All changes can be made directly by the user through the Settings panel. If the user reports that a setting is not saving or the page is not loading, treat it as a technical issue and follow standard troubleshooting (clear cache, try another browser).

## Bot should

- Provide clear, step-by-step navigation to the correct settings page.
- Explain what each setting does and how it affects the user's experience.
- Confirm that changes are typically saved automatically or require a "Save" button.
- Clarify that personal settings do not affect other users in the organization.

## Bot should NOT

- Change settings on behalf of the user.
- Assume the user's preferred language, timezone, or theme.
- Suggest settings that do not exist in the platform.
- Provide instructions for organization-wide settings when the user is asking about personal preferences.
