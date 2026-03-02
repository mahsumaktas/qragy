# Data Management

This topic covers data-related operations including importing records in bulk, deleting or archiving data, migrating data between systems, and handling duplicate records. Most data management tasks can be performed directly through the Admin Panel, but large-scale migrations or complex deduplication may require escalation.

## Type 1: Data Import / Bulk Upload

The user wants to import a large number of records into the platform at once, typically from a CSV or JSON file.

### Flow

1. Direct the user to Admin Panel > Data > Import.
2. Ask the user to click "New Import" or "Import Data" to launch the import wizard.
3. Ask the user to select the data type they want to import (e.g., contacts, transactions, products).
4. Ask the user to choose the file format (CSV or JSON) and upload their file.
5. Guide the user through the field mapping step, where each column in the file is matched to a field in the platform.
6. Suggest the user review the preview to verify that data looks correct before confirming the import.
7. Explain that large imports may take several minutes to process and the user will receive a notification when complete.
8. If the import fails or shows errors, ask the user to check the error log provided on the import results page for details on which rows failed and why.

## Type 2: Data Deletion / Archival

The user wants to permanently delete records or move them to an archive for long-term storage.

### Flow

1. Direct the user to Admin Panel > Data > Manage Records.
2. Ask the user to filter or search for the records they want to delete or archive.
3. Ask the user to select the records using the checkboxes and click "Actions" > "Delete" or "Archive."
4. Explain that archived records are moved out of active views but can be restored later from the Archive section.
5. Explain that deleted records are permanently removed after a retention period (typically 30 days) and cannot be recovered after that.
6. Warn the user that bulk deletion is irreversible after the retention period and suggest creating a backup export first.
7. If the user needs to delete data for compliance reasons (e.g., GDPR right to erasure), collect details and escalate to live support for verified processing.

## Type 3: Data Migration

The user wants to migrate data from another system or between workspaces within the platform.

### Flow

1. Ask the user what system or workspace they are migrating data from.
2. Direct the user to Admin Panel > Data > Migration Tools if available.
3. If a built-in migration connector exists for the source system, guide the user through the connector setup.
4. If no connector is available, suggest the user export data from the source system as CSV or JSON and use the import wizard (see Type 1).
5. Recommend the user perform a test migration with a small dataset first to verify field mapping and data integrity.
6. For large or complex migrations involving multiple data types or custom fields, collect details and escalate to live support for assisted migration.

## Type 4: Duplicate Records

The user has duplicate entries in their data and wants to find and merge or remove them.

### Flow

1. Direct the user to Admin Panel > Data > Deduplication or Data Cleanup.
2. Ask the user to select the data type to scan for duplicates (e.g., contacts, companies).
3. Guide the user to run the duplicate detection scan, which identifies potential duplicates based on matching fields like name, email, or phone number.
4. Ask the user to review the detected duplicates and choose which record to keep as the primary.
5. Explain that merging duplicates combines the data from both records into the primary record and removes the duplicate.
6. If the deduplication tool is not available on the user's plan, inform them and suggest upgrading or escalate to live support for manual assistance.

## Required Information

- Data type being managed (contacts, transactions, products, etc.)
- File format and approximate record count (for imports)
- Source system name (for migrations)
- Organization name (if escalation is needed)

## Escalation

The bot can guide users through standard import, deletion, archival, and deduplication tasks using the Admin Panel. Escalation to live support is needed for GDPR-related deletion requests, large-scale migrations requiring custom mapping, failed imports that cannot be resolved through the error log, and deduplication on plans that do not include the feature.

## Bot should

- Guide the user step by step through the Admin Panel > Data section.
- Recommend creating a backup export before any destructive operation like deletion.
- Explain the difference between deletion and archival clearly.
- Suggest a test run with a small dataset before large imports or migrations.
- Help the user interpret import error logs.

## Bot should NOT

- Delete, modify, or import data on behalf of the user directly.
- Guarantee that deleted data can be recovered after the retention period.
- Assume the user's data format or structure without asking.
- Skip the field mapping step during import guidance.
- Provide SQL queries or direct database commands to the user.
