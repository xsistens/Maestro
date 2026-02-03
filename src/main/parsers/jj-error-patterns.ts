/**
 * Jujutsu (jj) Error Patterns
 *
 * Detects and categorizes common jj command errors from stderr output.
 * Unlike AI agent error patterns (which match streaming conversational output),
 * these patterns match structured error messages from the jj CLI.
 *
 * Usage:
 * ```typescript
 * import { detectJjError } from './jj-error-patterns';
 *
 * const error = detectJjError(stderr);
 * if (error) {
 *   // Handle structured error (error.type, error.message, error.recoverable)
 * }
 * ```
 */

import type { JjError, JjErrorType } from '../../shared/types';

/**
 * A single jj error pattern definition.
 */
export interface JjErrorPattern {
	/** Regex to match against jj stderr output */
	pattern: RegExp;
	/** User-friendly error message (string or function using captured groups) */
	message: string | ((match: RegExpMatchArray) => string);
	/** Whether this error can be recovered from automatically */
	recoverable: boolean;
}

/**
 * Jj error patterns organized by error type.
 */
export type JjErrorPatterns = {
	[K in JjErrorType]?: JjErrorPattern[];
};

// ============================================================================
// Jujutsu Error Patterns
// ============================================================================

export const JJ_ERROR_PATTERNS: JjErrorPatterns = {
	stale_working_copy: [
		{
			// "The working copy is stale (since ...)"
			pattern: /working copy is stale/i,
			message: 'Working copy is stale. Run "jj workspace update-stale" to refresh.',
			recoverable: true,
		},
		{
			// "Working copy was unexpectedly changed on disk"
			pattern: /working copy.*unexpectedly changed/i,
			message:
				'Working copy was modified outside of jj. The state will be snapshotted automatically.',
			recoverable: true,
		},
	],

	conflict: [
		{
			// "New conflicts appeared in these commits" or "Existing conflicts"
			pattern: /new conflicts appeared/i,
			message: 'Merge conflicts detected. Resolve conflicts before continuing.',
			recoverable: false,
		},
		{
			// "There are unresolved conflicts at these paths"
			pattern: /unresolved conflicts/i,
			message: 'Unresolved conflicts remain. Resolve them before proceeding.',
			recoverable: false,
		},
		{
			// "Conflict in <file>" (from jj status or jj diff output)
			pattern: /conflict in\s+(.+)/i,
			message: (match: RegExpMatchArray) =>
				`Conflict detected in: ${match[1].trim()}. Resolve before proceeding.`,
			recoverable: false,
		},
		{
			// "Some of the inputs to this merge were conflicted"
			pattern: /inputs to this merge were conflicted/i,
			message: 'Cannot merge: one or more inputs have unresolved conflicts.',
			recoverable: false,
		},
	],

	missing_change: [
		{
			// "Revision "abc123" doesn't exist"
			pattern: /revision\s+"?([^"]*)"?\s+doesn'?t exist/i,
			message: (match: RegExpMatchArray) =>
				`Revision "${match[1]}" not found. Check the change ID or revision spec.`,
			recoverable: false,
		},
		{
			// "No such change id: <id>"
			pattern: /no such change id:?\s*(\S+)/i,
			message: (match: RegExpMatchArray) =>
				`Change "${match[1]}" not found. It may have been abandoned or rewritten.`,
			recoverable: false,
		},
		{
			// "Revset "<expr>" resolved to more than one revision" or empty set
			pattern: /revset.*resolved to (?:an )?empty set/i,
			message: 'Revset expression matched no changes. Check your revision specifier.',
			recoverable: false,
		},
		{
			// "No revset/commit/change matching" patterns
			pattern: /no (?:revision|change|commit)s? (?:matching|found)/i,
			message: 'No matching revision found. Verify the change ID or revset expression.',
			recoverable: false,
		},
		{
			// "Commit <hash> is not visible"
			pattern: /commit \S+ is not visible/i,
			message: 'The referenced commit is not visible in the current view.',
			recoverable: false,
		},
	],

	auth_failure: [
		{
			// Git credential helper failures
			pattern: /could not read (?:Username|Password)/i,
			message: 'Git authentication failed. Configure credentials for the remote.',
			recoverable: true,
		},
		{
			// SSH authentication failures during git operations
			pattern: /permission denied \(publickey/i,
			message: 'SSH key authentication failed for git remote. Check your SSH key configuration.',
			recoverable: true,
		},
		{
			// "fatal: Authentication failed for <url>"
			pattern: /(?:fatal:\s*)?authentication failed for/i,
			message: 'Git remote authentication failed. Check your credentials.',
			recoverable: true,
		},
		{
			// HTTP 401/403 from git remotes
			pattern: /(?:the requested url|remote).*returned (?:error:?\s*)?(?:401|403)/i,
			message: 'Git remote returned an authentication error. Check your access permissions.',
			recoverable: true,
		},
		{
			// Generic "failed to authenticate"
			pattern: /failed to authenticate/i,
			message: 'Authentication failed for the remote. Check your credentials.',
			recoverable: true,
		},
	],

	concurrent_operation: [
		{
			// "The repo was loaded at operation <hash>, which is not the most recent operation"
			pattern: /not the most recent operation/i,
			message:
				'Repository state changed during operation. Another process may have modified the repo.',
			recoverable: true,
		},
		{
			// "Failed to lock working copy" or similar lock errors
			pattern: /failed to (?:lock|acquire lock)/i,
			message:
				'Could not lock the repository. Another jj process may be running. Wait and retry.',
			recoverable: true,
		},
		{
			// "Concurrent operations detected"
			pattern: /concurrent.*operation/i,
			message: 'Concurrent jj operations detected. Wait for the other operation to finish.',
			recoverable: true,
		},
	],

	immutable_change: [
		{
			// "Refusing to modify immutable commit" or "Cannot rewrite immutable commits"
			pattern: /(?:refusing to modify|cannot (?:rewrite|modify)).*immutable/i,
			message: 'Cannot modify immutable change. This commit is protected by immutable rules.',
			recoverable: false,
		},
		{
			// "Commit <hash> is immutable"
			pattern: /commit \S+ is immutable/i,
			message: 'This commit is immutable and cannot be modified.',
			recoverable: false,
		},
		{
			// "Cannot abandon the root commit"
			pattern: /cannot abandon.*root/i,
			message: 'Cannot abandon the root commit. It is protected.',
			recoverable: false,
		},
	],

	bookmark_error: [
		{
			// "Bookmark already exists: <name>"
			pattern: /bookmark.*already exists:?\s*(\S+)?/i,
			message: (match: RegExpMatchArray) =>
				match[1]
					? `Bookmark "${match[1]}" already exists. Use a different name or delete it first.`
					: 'Bookmark already exists. Use a different name or delete it first.',
			recoverable: false,
		},
		{
			// "No such bookmark: <name>"
			pattern: /no such bookmark:?\s*(\S+)?/i,
			message: (match: RegExpMatchArray) =>
				match[1]
					? `Bookmark "${match[1]}" not found.`
					: 'Bookmark not found.',
			recoverable: false,
		},
		{
			// "Remote bookmark is not tracked" or "untracked remote bookmark"
			pattern: /(?:remote bookmark.*not tracked|untracked remote bookmark)/i,
			message: 'Remote bookmark is not tracked. Use "jj bookmark track" first.',
			recoverable: false,
		},
		{
			// "Failed to push some bookmarks"
			pattern: /failed to push.*bookmark/i,
			message: 'Failed to push bookmarks to remote. Check remote permissions and bookmark state.',
			recoverable: true,
		},
	],

	not_a_repo: [
		{
			// "There is no jj repo in ..." or "not a jj repository"
			pattern: /no jj repo|not a jj repo/i,
			message: 'Not a jj repository. Initialize with "jj git init" or "jj init".',
			recoverable: false,
		},
		{
			// "Error: could not find .jj/ directory"
			pattern: /could not find \.jj/i,
			message: 'No .jj directory found. This is not a jj repository.',
			recoverable: false,
		},
	],
};

// ============================================================================
// Detection Function
// ============================================================================

/**
 * Detect a structured jj error from command output (typically stderr).
 *
 * Scans the output against known jj error patterns and returns the first match
 * as a structured `JjError` object, or `null` if no known pattern is detected.
 *
 * @param output - The stderr (or combined output) from a jj command
 * @returns Structured JjError if a known pattern matches, null otherwise
 */
export function detectJjError(output: string): JjError | null {
	if (!output || output.trim().length === 0) {
		return null;
	}

	// Check each error type's patterns in priority order
	const errorTypes: JjErrorType[] = [
		'stale_working_copy',
		'conflict',
		'missing_change',
		'auth_failure',
		'concurrent_operation',
		'immutable_change',
		'bookmark_error',
		'not_a_repo',
	];

	for (const errorType of errorTypes) {
		const typePatterns = JJ_ERROR_PATTERNS[errorType];
		if (!typePatterns) continue;

		for (const pattern of typePatterns) {
			const match = output.match(pattern.pattern);
			if (match) {
				const message =
					typeof pattern.message === 'function'
						? pattern.message(match)
						: pattern.message;

				return {
					type: errorType,
					message,
					recoverable: pattern.recoverable,
					raw: output,
				};
			}
		}
	}

	return null;
}

/**
 * Match a specific line against jj error patterns.
 * This is a convenience wrapper matching the agent error pattern API shape
 * for consistency, but returns JjError instead of AgentError info.
 *
 * @param line - A single line of jj output to check
 * @returns Matched JjError info or null if no match
 */
export function matchJjErrorPattern(
	line: string
): { type: JjErrorType; message: string; recoverable: boolean } | null {
	const error = detectJjError(line);
	if (!error) return null;
	return {
		type: error.type,
		message: error.message,
		recoverable: error.recoverable,
	};
}
