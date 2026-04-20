#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function parseArgs(argv) {
  const options = {
    root: path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'),
    minMb: 50,
    keep: 10,
    apply: false,
    dryRun: true,
    deleteCorrupt: false,
    backup: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = argv[++index];
    } else if (arg === '--min-mb') {
      options.minMb = Number(argv[++index]);
    } else if (arg === '--keep') {
      options.keep = Number(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
      options.apply = false;
    } else if (arg === '--delete-corrupt') {
      options.deleteCorrupt = true;
    } else if (arg === '--backup') {
      options.backup = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.minMb) || options.minMb <= 0) {
    throw new Error('--min-mb must be a positive number');
  }

  if (!Number.isInteger(options.keep) || options.keep < 1) {
    throw new Error('--keep must be an integer greater than 0');
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node trim-chat-sessions.mjs [options]

Options:
  --root <path>         Workspace storage root to scan
  --min-mb <number>     Minimum file size in MB to process (default: 50)
  --keep <number>       Number of latest requests to keep (default: 10)
  --apply               Rewrite matching files in place
  --dry-run             Show what would change without writing files
  --delete-corrupt      Delete unreadable session files when used with --apply
  --backup              Save a .bak copy before rewriting a file
  --help, -h            Show help

Notes:
  Dry-run is the default mode.
  This script only processes *.jsonl files inside chatSessions folders under workspaceStorage.
`);
}

function getAtPath(target, segments) {
  let current = target;
  for (const segment of segments) {
    if (current == null) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function setAtPath(target, segments, value) {
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const nextSegment = segments[index + 1];
    if (current[segment] === undefined) {
      current[segment] = typeof nextSegment === 'number' ? [] : {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

function splitJsonObjects(text) {
  const entries = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        entries.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return entries;
}

function replaySessionEntries(entries) {
  let state = null;

  for (const entryText of entries) {
    const entry = JSON.parse(entryText);

    if (entry.kind === 0) {
      state = entry.v;
      continue;
    }

    if (!state) {
      throw new Error('Patch entry encountered before base state');
    }

    if (entry.kind === 1) {
      setAtPath(state, entry.k, entry.v);
      continue;
    }

    if (entry.kind === 2) {
      const target = getAtPath(state, entry.k);
      if (!Array.isArray(target)) {
        throw new Error('Append patch target is not an array');
      }
      for (const value of Object.values(entry.v ?? {})) {
        target.push(value);
      }
      continue;
    }
  }

  if (!state || !Array.isArray(state.requests)) {
    throw new Error('Session does not contain a requests array');
  }

  return state;
}

function isAllowedSessionPath(filePath, rootPath) {
  const normalizedFile = path.resolve(filePath);
  const normalizedRoot = path.resolve(rootPath);
  const relative = path.relative(normalizedRoot, normalizedFile);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  return normalizedFile.endsWith('.jsonl') && normalizedFile.includes(`${path.sep}chatSessions${path.sep}`);
}

function findCandidateFiles(rootPath, minBytes) {
  const candidates = [];
  for (const workspaceDir of fs.readdirSync(rootPath)) {
    const chatSessionsDir = path.join(rootPath, workspaceDir, 'chatSessions');
    if (!fs.existsSync(chatSessionsDir)) {
      continue;
    }

    for (const fileName of fs.readdirSync(chatSessionsDir)) {
      if (!fileName.endsWith('.jsonl')) {
        continue;
      }

      const filePath = path.join(chatSessionsDir, fileName);
      const stat = fs.statSync(filePath);
      if (stat.size >= minBytes && isAllowedSessionPath(filePath, rootPath)) {
        candidates.push({ filePath, sizeBytes: stat.size });
      }
    }
  }

  return candidates.sort((left, right) => right.sizeBytes - left.sizeBytes);
}

function mb(sizeBytes) {
  return Math.round((sizeBytes / 1024 / 1024) * 10) / 10;
}

function trimSessionFile(filePath, options) {
  const originalBytes = fs.statSync(filePath).size;
  const raw = fs.readFileSync(filePath, 'utf8');
  const entries = splitJsonObjects(raw);
  const state = replaySessionEntries(entries);
  const totalRequests = state.requests.length;
  const keepCount = Math.min(options.keep, totalRequests);
  const trimmedState = {
    ...state,
    requests: state.requests.slice(-keepCount),
  };
  const nextContent = `${JSON.stringify({ kind: 0, v: trimmedState })}\n`;
  const nextBytes = Buffer.byteLength(nextContent, 'utf8');

  if (options.apply) {
    if (options.backup) {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    }
    fs.writeFileSync(filePath, nextContent, 'utf8');
  }

  return {
    action: 'trimmed',
    filePath,
    originalBytes,
    nextBytes,
    totalRequests,
    keepCount,
  };
}

function deleteCorruptFile(filePath, options, error) {
  const originalBytes = fs.statSync(filePath).size;
  if (options.apply && options.deleteCorrupt) {
    fs.unlinkSync(filePath);
  }

  return {
    action: options.apply && options.deleteCorrupt ? 'deleted-corrupt' : 'skipped-corrupt',
    filePath,
    originalBytes,
    error: error instanceof Error ? error.message : String(error),
  };
}

function relativeLabel(rootPath, filePath) {
  return path.relative(rootPath, filePath) || path.basename(filePath);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(options.root)) {
    throw new Error(`Root path does not exist: ${options.root}`);
  }

  const files = findCandidateFiles(options.root, options.minMb * 1024 * 1024);
  if (files.length === 0) {
    console.log('No matching session files found.');
    return;
  }

  console.log(`${options.apply ? 'Applying' : 'Dry run for'} ${files.length} oversized session file(s).`);
  console.log(`Root: ${options.root}`);
  console.log(`Threshold: ${options.minMb} MB, keep latest: ${options.keep}`);
  console.log('');

  let trimmedCount = 0;
  let deletedCorruptCount = 0;
  let skippedCorruptCount = 0;
  let savedBytes = 0;

  for (const file of files) {
    try {
      const result = trimSessionFile(file.filePath, options);
      trimmedCount += 1;
      savedBytes += Math.max(result.originalBytes - result.nextBytes, 0);
      console.log(`${relativeLabel(options.root, result.filePath)}: ${mb(result.originalBytes)} MB -> ${mb(result.nextBytes)} MB (${result.totalRequests} -> ${result.keepCount} requests)`);
    } catch (error) {
      const result = deleteCorruptFile(file.filePath, options, error);
      if (result.action === 'deleted-corrupt') {
        deletedCorruptCount += 1;
        savedBytes += result.originalBytes;
      } else {
        skippedCorruptCount += 1;
      }
      console.log(`${relativeLabel(options.root, result.filePath)}: ${result.action} (${mb(result.originalBytes)} MB, ${result.error})`);
    }
  }

  console.log('');
  console.log(`Trimmed: ${trimmedCount}`);
  console.log(`Deleted corrupt: ${deletedCorruptCount}`);
  console.log(`Skipped corrupt: ${skippedCorruptCount}`);
  console.log(`${options.apply ? 'Freed' : 'Potential savings'}: ${mb(savedBytes)} MB`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}