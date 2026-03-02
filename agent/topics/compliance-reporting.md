# Compliance & Audit Reports

This topic covers generating audit logs, compliance reports, and activity tracking within the platform. These reports help organizations meet regulatory requirements such as GDPR, maintain data retention policies, and monitor user activity. Most reports can be generated directly from the Admin Panel.

## Type 1: Generating Audit Logs

The user wants to view or export a log of actions performed within the platform, such as login events, data changes, and administrative actions.

### Flow

1. Direct the user to Admin Panel > Compliance > Audit Logs.
2. Ask the user to select the date range for the audit log they want to review.
3. Explain the available filters: user, action type (login, data modification, settings change, export), and resource type.
4. Ask the user to apply any desired filters and click "Generate" or "Search."
5. The audit log will display a list of events with timestamps, user names, action descriptions, and affected resources.
6. To export the audit log, ask the user to click "Export" and choose the format (CSV or PDF).
7. If the audit log shows a very large number of events, suggest narrowing the date range or applying additional filters for a more manageable report.

## Type 2: Compliance Reports (GDPR, Data Retention)

The user needs to generate a report for regulatory compliance purposes, such as GDPR data subject requests or data retention policy reviews.

### Flow

1. Direct the user to Admin Panel > Compliance > Reports.
2. Ask the user to select the report type from the available options (e.g., GDPR Data Subject Report, Data Retention Summary, Access Log Report).
3. Ask the user to choose the relevant date range or reporting period.
4. If the report is for a specific data subject (e.g., GDPR request), ask the user to enter the individual's identifier (email or user ID).
5. Ask the user to click "Generate Report."
6. Once generated, the report can be downloaded as PDF or CSV from the Reports section.
7. Explain that some compliance reports may take a few minutes to generate depending on the data volume.
8. If the user needs a report type that is not available in the Admin Panel, collect details about the requirement and escalate to live support.

## Type 3: Activity Tracking

The user wants to monitor specific user activity or team activity within the platform.

### Flow

1. Direct the user to Admin Panel > Compliance > Activity Tracking.
2. Ask the user to select the scope of tracking: individual user, team, or entire organization.
3. Ask the user to set the date range for the activity they want to review.
4. The activity report will show login times, features accessed, records viewed or modified, and session durations.
5. To export the activity data, ask the user to click "Export" and choose the format.
6. If the user needs real-time activity monitoring, direct them to the Dashboard > Live Activity section if available on their plan.
7. If activity tracking is not available on the user's current plan, inform them about the plan requirements and suggest upgrading or escalate to live support.

## Required Information

- Organization name
- Date range for the report
- Report type (audit log, GDPR, data retention, activity)
- Specific user identifier (if the report is for a particular data subject)

## Escalation

The bot can guide users through generating standard audit logs, compliance reports, and activity tracking reports from the Admin Panel. Escalation to live support is needed when the user requires a custom report type not available in the Admin Panel, when a GDPR data subject request requires manual processing, when the user's plan does not include the needed compliance features, or when the user needs certified or legally attested reports.

## Bot should

- Guide the user through Admin Panel > Compliance step by step.
- Explain the available report types and filters clearly.
- Help the user narrow down large reports using date ranges and filters.
- Inform the user about processing time for large reports.
- Collect the organization name early in the conversation for escalation readiness.

## Bot should NOT

- Generate, modify, or certify compliance reports on behalf of the user.
- Provide legal advice or interpret regulatory requirements (e.g., whether a specific action is GDPR-compliant).
- Access or display individual user activity data directly.
- Guarantee that a report meets specific regulatory standards without verification.
- Share audit log contents or compliance data with unauthorized users.
