# Copilot Chat Session Trimmer

Small Node.js utility for trimming oversized VS Code Copilot Chat session files by keeping only the most recent requests.

It is designed for cases where chat session files inside `workspaceStorage/<id>/chatSessions/*.jsonl` have grown large enough to hurt editor performance or fail to open reliably.

Rather than blindly cutting to a fixed request count, it keeps as many requests as possible while trimming the file down to a target size (default 20 MB). This preserves maximum context while eliminating the bloat.

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

## Recovering a specific corrupt session

If a session won't open in VS Code, this is the fastest way to identify and repair it:

1. Open the VS Code Developer Tools: **Help → Toggle Developer Tools** (or `Ctrl+Shift+I`)
2. Click the **Console** tab
3. Click the broken session in the chat panel — it will fail to open and log an error like:
   ```
   Cannot read properties of undefined (reading 'response')
   ...chatSessions/3fa2b1c4-8e91-4d70-a3f2-9b0c7e1d5f28.jsonl
   ```
4. Copy the UUID from that path (e.g. `3fa2b1c4-8e91-4d70-a3f2-9b0c7e1d5f28`)
5. Run the script targeting just that session:

```bash
node trim-chat-sessions.mjs --target 3fa2b1c4-8e91-4d70-a3f2-9b0c7e1d5f28 --apply
```

The `--target` flag finds and repairs all copies of that session UUID across every workspace, ignores the `--min-mb` threshold, and leaves everything else untouched.

---

## Usage

Dry run (safe, no files written):

```bash
node trim-chat-sessions.mjs --dry-run
```

Apply changes with default settings (files over 50 MB, keeps as many requests as possible while targeting 20 MB per file):

```bash
node trim-chat-sessions.mjs --apply
```

Be more aggressive — trim to 10 MB max:

```bash
node trim-chat-sessions.mjs --apply --max-mb 10
```

Repair one specific corrupt session by UUID:

```bash
node trim-chat-sessions.mjs --target <uuid> --apply
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