I ran into a practical VS Code Copilot Chat failure mode this week: a few local chat session files had grown so large that one session would not open reliably.

The fix was straightforward once I mapped the storage format. Copilot Chat sessions are stored as patch streams under `workspaceStorage/.../chatSessions/*.jsonl`. Replaying the patches into a clean state and keeping only the latest requests turned multi-hundred-MB files into a few MB in most cases.

I turned that cleanup into a small Node.js utility:

- dry-run by default
- no third-party dependencies
- trims oversized session files to the latest N requests
- can optionally delete unreadable corrupted session files

It helped recover about 3.1 GB of chat session storage on one machine during cleanup.

Repo:
https://github.com/Ryezzi/copilot-chat-session-trimmer

If you have long-running Copilot sessions or a bloated `workspaceStorage` folder, this may save you a debugging detour.