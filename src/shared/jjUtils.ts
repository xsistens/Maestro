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

import type { JjStatus, JjFileStatusType, JjBookmark, JjChange } from './types';

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
