/**
 * Shared Jujutsu (jj) utilities for Maestro
 *
 * This module provides common jj-related parsing and utility functions
 * used across main process, renderer, and CLI.
 *
 * Note: Actual jj command execution differs by environment:
 * - Main process: Uses execFileNoThrow
 * - CLI: Uses execFileSync
 *
 * This module focuses on parsing and utility functions that can be shared.
 */

import type {
	JjStatus,
	JjFileStatusType,
	JjBookmark,
	JjChange,
	JjLogEntry,
	JjDiffFile,
	JjDiffResult,
	JjChangeDetail,
	JjDiff,
	JjFileDiff,
} from './types';

/**
 * Parse jj version output to extract version information
 *
 * @param stdout - Raw stdout from `jj version` or `jj --version`
 * @returns Object with version string and installation status
 *
 * @example
 * ```typescript
 * parseJjVersion('jj 0.24.0')
 * // Returns: { version: '0.24.0', isInstalled: true }
 *
 * parseJjVersion('')
 * // Returns: { version: '', isInstalled: false }
 * ```
 */
export function parseJjVersion(stdout: string): { version: string; isInstalled: boolean } {
	if (!stdout || !stdout.trim()) {
		return { version: '', isInstalled: false };
	}

	const trimmed = stdout.trim();
	// jj version output format: "jj X.Y.Z" or just "X.Y.Z"
	const match =
		trimmed.match(/^jj\s+(\d+\.\d+\.\d+(?:-\w+)?)/i) || trimmed.match(/^(\d+\.\d+\.\d+(?:-\w+)?)/);

	if (match) {
		return { version: match[1], isInstalled: true };
	}

	// If output exists but doesn't match expected format, still consider installed
	return { version: trimmed, isInstalled: true };
}

/**
 * Parse jj status output into structured status information
 *
 * jj status output format:
 * ```
 * Working copy changes:
 * A .gitignore
 * M src/main.rs
 * D old-file.txt
 * Working copy : qzmzpxyl bc915fcd (no description set)
 * Parent commit: zzzzzzzz 00000000 (empty) (no description set)
 * ```
 *
 * @param stdout - Raw stdout from `jj status`
 * @returns Parsed JjStatus object
 */
export function parseJjStatus(stdout: string): JjStatus {
	const defaultStatus: JjStatus = {
		files: [],
		workingCopyChangeId: '',
		workingCopyCommitId: '',
		workingCopyDescription: '',
		workingCopyEmpty: true,
		parentChangeId: '',
		parentCommitId: '',
		parentDescription: '',
		parentEmpty: true,
		hasConflicts: false,
		conflictedFiles: [],
	};

	if (!stdout || !stdout.trim()) {
		return defaultStatus;
	}

	const lines = stdout.split('\n');
	const status = { ...defaultStatus };
	let inFileChanges = false;
	let inConflicts = false;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Check for section headers
		if (trimmedLine === 'Working copy changes:') {
			inFileChanges = true;
			inConflicts = false;
			continue;
		}

		if (trimmedLine === 'The working copy has no changes.') {
			inFileChanges = false;
			continue;
		}

		if (trimmedLine.includes('conflict') || trimmedLine.includes('Conflict')) {
			inConflicts = true;
			status.hasConflicts = true;
			continue;
		}

		// Parse file changes (A/M/D/R/C followed by path)
		if (inFileChanges) {
			const fileMatch = trimmedLine.match(/^([AMDRC])\s+(.+)$/);
			if (fileMatch) {
				status.files.push({
					status: fileMatch[1] as JjFileStatusType,
					path: fileMatch[2],
				});
				continue;
			}
		}

		// Parse conflicted files
		if (inConflicts) {
			const conflictFileMatch = trimmedLine.match(/^([AMDRC])\s+(.+)$/);
			if (conflictFileMatch) {
				status.conflictedFiles.push(conflictFileMatch[2]);
				continue;
			}
		}

		// Parse working copy line
		// Format: "Working copy : changeId commitId (empty)? description"
		// or "Working copy (@) : changeId commitId description"
		const workingCopyMatch = trimmedLine.match(
			/^Working copy\s*(?:\(@\))?\s*:\s*(\w+)\s+(\w+)\s*(.*)$/
		);
		if (workingCopyMatch) {
			status.workingCopyChangeId = workingCopyMatch[1];
			status.workingCopyCommitId = workingCopyMatch[2];
			const rest = workingCopyMatch[3];
			status.workingCopyEmpty = rest.includes('(empty)');
			// Extract description, removing (empty) and (no description set)
			status.workingCopyDescription = rest
				.replace(/\(empty\)/g, '')
				.replace(/\(no description set\)/g, '')
				.trim();
			inFileChanges = false;
			continue;
		}

		// Parse parent commit line
		// Format: "Parent commit: changeId commitId (empty)? description"
		// or "Parent commit(@-): changeId commitId description"
		const parentMatch = trimmedLine.match(
			/^Parent commit\s*(?:\(@-\))?\s*:\s*(\w+)\s+(\w+)\s*(.*)$/
		);
		if (parentMatch) {
			status.parentChangeId = parentMatch[1];
			status.parentCommitId = parentMatch[2];
			const rest = parentMatch[3];
			status.parentEmpty = rest.includes('(empty)');
			// Extract description, removing (empty) and (no description set)
			status.parentDescription = rest
				.replace(/\(empty\)/g, '')
				.replace(/\(no description set\)/g, '')
				.trim();
			inFileChanges = false;
			continue;
		}
	}

	// If we found files, working copy is not empty
	if (status.files.length > 0) {
		status.workingCopyEmpty = false;
	}

	return status;
}

/**
 * Count uncommitted changes from jj status output
 *
 * @param stdout - Raw stdout from `jj status`
 * @returns Number of changed files
 */
export function countJjChanges(stdout: string): number {
	const status = parseJjStatus(stdout);
	return status.files.length;
}

/**
 * Check if jj status output indicates any uncommitted changes
 *
 * @param stdout - Raw stdout from `jj status`
 * @returns True if there are any uncommitted changes
 */
export function hasJjChanges(stdout: string): boolean {
	const status = parseJjStatus(stdout);
	return status.files.length > 0;
}

/**
 * Parse jj bookmark list output into structured bookmark information
 *
 * jj bookmark list output format:
 * ```
 * main: qzmzpxyl bc915fcd my description
 * feature/foo: abcdefgh 12345678 another description
 * conflicted-bookmark (conflicted):
 *   - oldChangeId oldCommitId old description
 *   + newChangeId newCommitId new description
 * remote@origin: changeId commitId description
 * ```
 *
 * @param stdout - Raw stdout from `jj bookmark list`
 * @returns Array of parsed bookmarks
 */
export function parseJjBookmarks(stdout: string): JjBookmark[] {
	if (!stdout || !stdout.trim()) {
		return [];
	}

	const bookmarks: JjBookmark[] = [];
	const lines = stdout.split('\n').filter((line) => line.length > 0);

	let currentConflictedBookmark: string | null = null;

	for (const line of lines) {
		// Check for conflicted bookmark header
		const conflictHeaderMatch = line.match(/^(\S+)\s+\(conflicted\):?\s*$/);
		if (conflictHeaderMatch) {
			currentConflictedBookmark = conflictHeaderMatch[1];
			continue;
		}

		// Parse conflict resolution lines (+ or - prefix)
		if (currentConflictedBookmark && (line.startsWith('  +') || line.startsWith('  -'))) {
			const conflictMatch = line.match(/^\s+[+-]\s+(\w+)\s+(\w+)\s*(.*)$/);
			if (conflictMatch && line.startsWith('  +')) {
				// Only add the new target (+ line)
				bookmarks.push({
					name: currentConflictedBookmark,
					changeId: conflictMatch[1],
					commitId: conflictMatch[2],
					description: conflictMatch[3].trim(),
					isConflicted: true,
					isTracked: false,
				});
			}
			continue;
		}

		// Reset conflict state for non-conflict lines
		currentConflictedBookmark = null;

		// Parse regular bookmark line
		// Format: "name: changeId commitId description"
		// Or with remote: "name@remote: changeId commitId description"
		const bookmarkMatch = line.match(/^(\S+?)(?:@(\S+))?:\s+(\w+)\s+(\w+)\s*(.*)$/);
		if (bookmarkMatch) {
			const [, name, remote, changeId, commitId, description] = bookmarkMatch;
			bookmarks.push({
				name,
				changeId,
				commitId,
				description: description.trim(),
				isConflicted: false,
				remote: remote || undefined,
				isTracked: !!remote,
			});
		}
	}

	return bookmarks;
}

/**
 * Parse jj log output for a single change
 *
 * This parses the output of commands like:
 * `jj log --no-graph -r @ -T 'change_id ++ " " ++ commit_id ++ " " ++ description'`
 *
 * @param stdout - Raw stdout from jj log command with custom template
 * @returns Parsed change information
 */
export function parseJjChange(stdout: string): JjChange | null {
	if (!stdout || !stdout.trim()) {
		return null;
	}

	const trimmed = stdout.trim();
	// Expected format: "changeId commitId description" (space-separated)
	const parts = trimmed.split(/\s+/);

	if (parts.length < 2) {
		return null;
	}

	const changeId = parts[0];
	const commitId = parts[1];
	const description = parts.slice(2).join(' ');

	return {
		changeId,
		commitId,
		description: description || '',
		isEmpty: description === '' || description === '(empty)',
		bookmarks: [],
	};
}

/**
 * Parse change ID from jj log output with simple template
 *
 * Parses output from: `jj log --no-graph -r @ -T 'change_id ++ "\n"'`
 *
 * @param stdout - Raw stdout containing just change ID
 * @returns Change ID string or empty string
 */
export function parseJjChangeId(stdout: string): string {
	if (!stdout || !stdout.trim()) {
		return '';
	}
	return stdout.trim().split('\n')[0].trim();
}

/**
 * Check if a directory is a jj repository
 *
 * This is a synchronous check that can be used when you already have
 * access to the filesystem. For async checks, use the IPC handler.
 *
 * @param hasJjDir - Whether the .jj directory exists in the path
 * @returns True if this appears to be a jj repository
 */
export function isJjRepository(hasJjDir: boolean): boolean {
	return hasJjDir;
}

/**
 * Get file status display character
 *
 * @param status - File status type
 * @returns Human-readable status character
 */
export function getJjStatusChar(status: JjFileStatusType): string {
	switch (status) {
		case 'A':
			return 'A'; // Added
		case 'M':
			return 'M'; // Modified
		case 'D':
			return 'D'; // Deleted
		case 'R':
			return 'R'; // Renamed
		case 'C':
			return 'C'; // Copied
		default:
			return '?';
	}
}

/**
 * Get human-readable file status description
 *
 * @param status - File status type
 * @returns Description of the status
 */
export function getJjStatusDescription(status: JjFileStatusType): string {
	switch (status) {
		case 'A':
			return 'Added';
		case 'M':
			return 'Modified';
		case 'D':
			return 'Deleted';
		case 'R':
			return 'Renamed';
		case 'C':
			return 'Copied';
		default:
			return 'Unknown';
	}
}

/**
 * Extract file paths from jj status
 *
 * @param status - Parsed JjStatus object
 * @returns Array of file paths
 */
export function getJjChangedFiles(status: JjStatus): string[] {
	return status.files.map((f) => f.path);
}

/**
 * Filter files by status type
 *
 * @param status - Parsed JjStatus object
 * @param statusType - Status type to filter by
 * @returns Array of file paths with the specified status
 */
export function getJjFilesByStatus(status: JjStatus, statusType: JjFileStatusType): string[] {
	return status.files.filter((f) => f.status === statusType).map((f) => f.path);
}

/**
 * The jj log template used for structured output.
 * Produces one line per change in the format:
 * changeId<SEP>commitId<SEP>description<SEP>isEmpty<SEP>author<SEP>email<SEP>timestamp<SEP>bookmarks
 *
 * Using \x1f (ASCII Unit Separator) as field delimiter to avoid conflicts with
 * descriptions that may contain spaces, quotes, or other characters.
 */
export const JJ_LOG_TEMPLATE =
	'change_id ++ "\\x1f" ++ commit_id ++ "\\x1f" ++ description ++ "\\x1f" ++ empty ++ "\\x1f" ++ author.name() ++ "\\x1f" ++ author.email() ++ "\\x1f" ++ author.timestamp() ++ "\\x1f" ++ bookmarks ++ "\\n"';

/**
 * Parse jj log output produced with JJ_LOG_TEMPLATE into structured entries.
 *
 * @param stdout - Raw stdout from `jj log --no-graph -T JJ_LOG_TEMPLATE`
 * @returns Array of parsed log entries
 */
export function parseJjLog(stdout: string): JjLogEntry[] {
	if (!stdout || !stdout.trim()) {
		return [];
	}

	const entries: JjLogEntry[] = [];
	const lines = stdout.trim().split('\n');

	for (const line of lines) {
		if (!line.trim()) continue;

		const parts = line.split('\x1f');
		if (parts.length < 4) continue;

		const changeId = parts[0].trim();
		const commitId = parts[1].trim();
		const description = parts[2].trim();
		const isEmpty = parts[3].trim() === 'true';
		const author = parts[4]?.trim() || '';
		const email = parts[5]?.trim() || '';
		const timestamp = parts[6]?.trim() || '';
		const bookmarksRaw = parts[7]?.trim() || '';

		const bookmarks = bookmarksRaw
			? bookmarksRaw.split(/\s+/).filter((b) => b.length > 0)
			: [];

		entries.push({
			changeId,
			commitId,
			description,
			isEmpty,
			author,
			email,
			timestamp,
			bookmarks,
		});
	}

	return entries;
}

/**
 * Parse a unified diff output from `jj diff` into structured result.
 *
 * Extracts file-level change summaries from diff headers (--- / +++ lines)
 * while preserving the raw diff text.
 *
 * @param stdout - Raw stdout from `jj diff`
 * @returns Structured diff result with file summaries
 */
export function parseJjDiff(stdout: string): JjDiffResult {
	if (!stdout || !stdout.trim()) {
		return { raw: '', files: [] };
	}

	const files: JjDiffFile[] = [];
	const lines = stdout.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Look for diff headers: "diff --git a/path b/path" or "=== path ==="
		const gitDiffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
		if (gitDiffMatch) {
			const oldPath = gitDiffMatch[1];
			const newPath = gitDiffMatch[2];

			// Determine status by looking at subsequent --- / +++ lines
			let status: JjFileStatusType = 'M';
			for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
				if (lines[j].startsWith('--- /dev/null')) {
					status = 'A';
					break;
				}
				if (lines[j].startsWith('+++ /dev/null')) {
					status = 'D';
					break;
				}
				if (lines[j].startsWith('diff ')) break;
			}

			// Use the new path (for renames, it's the destination)
			if (oldPath !== newPath) {
				status = 'R';
			}

			files.push({ path: newPath, status });
		}
	}

	return { raw: stdout, files };
}

/**
 * Parse `jj show` output into structured change details.
 *
 * `jj show` output typically contains change metadata followed by a diff.
 * The metadata section includes lines like:
 * ```
 * Change ID: qzmzpxylbc915fcd
 * Commit ID: bc915fcd12345678
 * Author: John Doe <john@example.com> (2024-01-15 10:30:00)
 * Committer: John Doe <john@example.com> (2024-01-15 10:30:00)
 * Description: My change description
 *
 * diff --git a/file.txt b/file.txt
 * ...
 * ```
 *
 * @param stdout - Raw stdout from `jj show`
 * @returns Parsed change detail, or null if output is empty/unparseable
 */
export function parseJjShow(stdout: string): JjChangeDetail | null {
	if (!stdout || !stdout.trim()) {
		return null;
	}

	const lines = stdout.split('\n');
	let changeId = '';
	let commitId = '';
	let description = '';
	let author = '';
	let email = '';
	let timestamp = '';
	let isEmpty = true;
	const bookmarks: string[] = [];
	let diffStartIndex = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Detect the start of the diff section
		if (line.startsWith('diff --git ')) {
			diffStartIndex = i;
			break;
		}

		// Parse Change ID (full hex or short form)
		const changeIdMatch = line.match(/^Change\s+ID:\s*(\S+)/i);
		if (changeIdMatch) {
			changeId = changeIdMatch[1];
			continue;
		}

		// Parse Commit ID
		const commitIdMatch = line.match(/^Commit\s+ID:\s*(\S+)/i);
		if (commitIdMatch) {
			commitId = commitIdMatch[1];
			continue;
		}

		// Parse Author line: "Author: Name <email> (timestamp)"
		const authorMatch = line.match(/^Author:\s*(.+?)\s*<([^>]*)>\s*\(([^)]*)\)/i);
		if (authorMatch) {
			author = authorMatch[1].trim();
			email = authorMatch[2].trim();
			timestamp = authorMatch[3].trim();
			continue;
		}

		// Parse Author without email: "Author: Name (timestamp)"
		const authorNoEmailMatch = line.match(/^Author:\s*(.+?)\s*\(([^)]*)\)/i);
		if (!authorMatch && authorNoEmailMatch) {
			author = authorNoEmailMatch[1].trim();
			timestamp = authorNoEmailMatch[2].trim();
			continue;
		}

		// Parse Bookmarks line
		const bookmarksMatch = line.match(/^Bookmarks?:\s*(.+)/i);
		if (bookmarksMatch) {
			const bms = bookmarksMatch[1].trim().split(/\s+/).filter((b) => b.length > 0);
			bookmarks.push(...bms);
			continue;
		}

		// Parse Description (may be multi-line, but typically single)
		const descMatch = line.match(/^Description:\s*(.*)/i);
		if (descMatch) {
			description = descMatch[1].trim();
			// Collect continuation lines (indented or non-header lines)
			for (let j = i + 1; j < lines.length; j++) {
				const nextLine = lines[j];
				if (nextLine.startsWith('diff --git ')) {
					diffStartIndex = j;
					break;
				}
				// Stop on empty line followed by diff or on another header
				if (
					nextLine.match(/^(Change|Commit|Author|Committer|Bookmarks?)\s+/i) ||
					nextLine.startsWith('diff ')
				) {
					break;
				}
				if (nextLine.trim()) {
					description += '\n' + nextLine.trim();
				}
			}
			continue;
		}
	}

	// If we couldn't parse any IDs, the output format wasn't recognized
	if (!changeId && !commitId) {
		return null;
	}

	// Extract the diff portion
	const diffText = diffStartIndex >= 0 ? lines.slice(diffStartIndex).join('\n') : '';

	// Parse the diff for file details
	const diff = diffText ? parseJjDiff(diffText) : { raw: '', files: [] };

	isEmpty = diff.files.length === 0 && (!description || description === '(no description set)');

	return {
		changeId,
		commitId,
		description: description === '(no description set)' ? '' : description,
		isEmpty,
		author,
		email,
		timestamp,
		bookmarks,
		diff,
	};
}

/**
 * Parse a unified diff output from `jj diff` into a detailed structured result.
 *
 * This enhanced parser splits the diff into per-file sections and counts
 * additions/deletions, producing a JjDiff that is compatible with
 * existing diff display components. The per-file `diffText` fields can be
 * passed directly to `parseGitDiff()` or `react-diff-view`'s `parseDiff()`.
 *
 * @param stdout - Raw stdout from `jj diff`
 * @returns Detailed structured diff with per-file sections and stats
 */
export function parseJjDiffDetailed(stdout: string): JjDiff {
	if (!stdout || !stdout.trim()) {
		return { raw: '', files: [], fileDiffs: [], additions: 0, deletions: 0 };
	}

	// Split into per-file sections by "diff --git" headers
	const sections = stdout.split(/(?=diff --git )/g).filter((s) => s.trim());

	const files: JjDiffFile[] = [];
	const fileDiffs: JjFileDiff[] = [];
	let totalAdditions = 0;
	let totalDeletions = 0;

	for (const section of sections) {
		const sectionLines = section.split('\n');
		const headerLine = sectionLines[0];

		// Extract paths from "diff --git a/oldPath b/newPath"
		const pathMatch = headerLine.match(/^diff --git a\/(.+) b\/(.+)$/);
		if (!pathMatch) continue;

		const oldPath = pathMatch[1];
		const newPath = pathMatch[2];

		// Determine file status
		let status: JjFileStatusType = 'M';
		let isNewFile = false;
		let isDeletedFile = false;
		const isBinary = /Binary files .* differ/.test(section);

		for (let j = 1; j < Math.min(6, sectionLines.length); j++) {
			const line = sectionLines[j];
			if (line.startsWith('--- /dev/null') || line.includes('new file mode')) {
				status = 'A';
				isNewFile = true;
				break;
			}
			if (line.startsWith('+++ /dev/null') || line.includes('deleted file mode')) {
				status = 'D';
				isDeletedFile = true;
				break;
			}
			if (line.startsWith('diff ')) break;
		}

		if (oldPath !== newPath) {
			status = 'R';
		}

		// Count additions and deletions from hunk content lines
		let additions = 0;
		let deletions = 0;
		let inHunk = false;

		for (const line of sectionLines) {
			if (line.startsWith('@@')) {
				inHunk = true;
				continue;
			}
			if (inHunk) {
				if (line.startsWith('+') && !line.startsWith('+++')) {
					additions++;
				} else if (line.startsWith('-') && !line.startsWith('---')) {
					deletions++;
				}
			}
		}

		totalAdditions += additions;
		totalDeletions += deletions;

		files.push({ path: newPath, status });
		fileDiffs.push({
			oldPath,
			newPath,
			status,
			diffText: section,
			isBinary,
			isNewFile,
			isDeletedFile,
			additions,
			deletions,
		});
	}

	return {
		raw: stdout,
		files,
		fileDiffs,
		additions: totalAdditions,
		deletions: totalDeletions,
	};
}
