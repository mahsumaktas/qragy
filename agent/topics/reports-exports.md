# Reports & Data Exports

This topic covers generating reports, exporting data, and troubleshooting issues with report output. Most reporting tasks can be resolved by guiding the user through the Reports section of the dashboard.

## Type 1: Report Not Generating

The user attempts to generate a report but it does not load, gets stuck, or shows an error.

### Flow

1. Ask the user which type of report they are trying to generate (e.g., usage report, activity report, financial report).
2. Direct the user to the Reports section from the main navigation.
3. Ask the user to select the report type and set the date range, then click "Generate" or "Run Report".
4. If the report is stuck or loading for a long time, suggest reducing the date range to a shorter period (e.g., last 7 days instead of last 90 days) to reduce processing time.
5. Suggest the user try a different browser or clear their cache if the report still does not generate.
6. If the issue persists, escalate to live support.

## Type 2: Export Fails or Downloads Empty File

The user generates a report successfully but the export (CSV or PDF) fails to download or the downloaded file is empty.

### Flow

1. Ask the user to confirm which export format they selected (CSV or PDF).
2. Ask the user to check their browser's download folder and pop-up blocker settings, as some browsers block automatic downloads.
3. Suggest the user try the alternative format (e.g., CSV instead of PDF or vice versa) to determine if the issue is format-specific.
4. If the file downloads but is empty, ask the user to verify that the report preview shows data before exporting.
5. Suggest the user try exporting from a different browser.
6. If the issue persists, escalate to live support.

## Type 3: Data Mismatch in Report

The user notices that the numbers or data in a report do not match their expectations or differ from what they see elsewhere in the platform.

### Flow

1. Ask the user to specify which data points appear incorrect and where they expect to see different values.
2. Ask the user to confirm the date range and filters applied to the report, as mismatched filters are a common cause.
3. Explain that some reports may have a data processing delay (typically up to a few hours) and the most recent data may not be reflected yet.
4. Suggest the user regenerate the report to ensure they are viewing the latest available data.
5. If the discrepancy persists after verifying filters and regenerating, escalate to live support for investigation.

## Required Information

- Report type and date range (for troubleshooting)
- Organization name (if escalation is needed)

## Escalation

Most reporting issues can be resolved by adjusting filters, reducing date ranges, or switching browsers. Escalation to live support is needed when reports consistently fail to generate, exports are repeatedly empty, or data discrepancies persist after the user has verified their filters and regenerated the report.

## Bot should

- Guide the user step by step through the Reports section.
- Suggest reducing the date range as a first troubleshooting step for slow or stuck reports.
- Explain common causes of data mismatches (filters, processing delays).
- Help the user try alternative export formats.
- Clarify that recent data may have a short processing delay.

## Bot should NOT

- Generate or modify reports on behalf of the user.
- Guarantee specific numbers or data accuracy without support verification.
- Access or display the user's report data.
- Suggest custom SQL queries or direct database access.
- Assume the user's data is wrong without exploring possible causes.
