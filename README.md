# Copilot Chat Session Trimmer

Small Node.js utility for trimming oversized VS Code Copilot Chat session files by keeping only the most recent requests.

It is designed for cases where chat session files inside `workspaceStorage/<id>/chatSessions/*.jsonl` have grown large enough to hurt editor performance or fail to open reliably.

## Safety goals

- No third-party dependencies
- Dry-run by default
- Only touches `.jsonl` files under `chatSessions` inside a `workspaceStorage` root
- Optional delete mode for unreadable session files
- Optional backup mode before rewrite

## What it does

VS Code Copilot Chat session files are stored as JSON patch streams. This script:

1. Scans `workspaceStorage/*/chatSessions/*.jsonl`
2. Replays the patch stream into a full session state
3. Keeps only the latest `N` requests
4. Rewrites the file as a single clean base-state entry

## Requirements

- Node.js 18+
- VS Code closed while running the script is strongly recommended

## Usage

Dry run:

```bash
node trim-chat-sessions.mjs --dry-run
```

Apply changes with default settings:

```bash
node trim-chat-sessions.mjs --apply
```

Keep the latest 20 requests and process files over 25 MB:

```bash
node trim-chat-sessions.mjs --apply --keep 20 --min-mb 25
```

Delete corrupt session files that cannot be replayed:

```bash
node trim-chat-sessions.mjs --apply --delete-corrupt
```

Create backups before rewriting files:

```bash
node trim-chat-sessions.mjs --apply --backup
```

Use a custom workspace storage root:

```bash
node trim-chat-sessions.mjs --root "C:\Users\<you>\AppData\Roaming\Code\User\workspaceStorage" --apply
```

## Example output

```text
Applying 24 oversized session file(s).
Root: C:\Users\<you>\AppData\Roaming\Code\User\workspaceStorage
Threshold: 50 MB, keep latest: 10

abc1.../chatSessions/11111111-....jsonl: 369 MB -> 0.5 MB (341 -> 10 requests)
xyz9.../chatSessions/22222222-....jsonl: 326 MB -> 4.9 MB (173 -> 10 requests)

Trimmed: 21
Deleted corrupt: 3
Skipped corrupt: 0
Freed: 3158 MB
```

## License

MIT