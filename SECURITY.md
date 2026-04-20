# Security Notes

This project is intentionally small and conservative.

## Design choices

- No third-party packages
- Dry-run is the default mode
- Writes are limited to `.jsonl` files under `workspaceStorage/*/chatSessions`
- No network calls
- No shell execution
- No collection or export of chat contents

## Before publishing your fork

1. Review the README examples and keep them generic.
2. Do not commit real chat session files or backups.
3. If you change default paths, avoid hard-coding personal usernames or machine-specific directories.
4. If you add telemetry or logging, keep actual prompt/response content out of logs.

## Operational caution

Close VS Code before running the script in apply mode.

If a session file is unreadable and you use `--delete-corrupt`, deletion is permanent unless you also made an external backup.