/**
 * Jujutsu (jj) operations service
 * Wraps IPC calls to main process for jj version control operations
 */

import { createIpcMethod } from './ipcWrapper';
import type {
	JjStatus,
	JjBookmark,
	JjChange,
	JjDiffResult,
	JjShowResult,
	JjLogEntry,
	JjOperationResult,
} from '../../shared/types';

/**
 * Default empty JjStatus for error fallback
 */
const emptyJjStatus: JjStatus = {
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

/**
 * Service for jj (Jujutsu) version control operations.
 * All methods wrap IPC calls with consistent error handling.
 */
export const jjService = {
	/**
	 * Check if jj is installed on the system
	 * @returns Promise<boolean> - true if jj binary exists and is executable
	 */
	async isInstalled(): Promise<boolean> {
		return createIpcMethod({
			call: () => window.maestro.jj.isInstalled(),
			errorContext: 'Jj isInstalled',
			defaultValue: false,
		});
	},

	/**
	 * Get the installed jj version string
	 * @returns Promise<string> - version string (e.g., "jj 0.24.0") or empty string on error
	 */
	async getVersion(): Promise<string> {
		return createIpcMethod({
			call: () => window.maestro.jj.getVersion(),
			errorContext: 'Jj getVersion',
			defaultValue: '',
		});
	},

	/**
	 * Check if a directory is a jj repository
	 * @param cwd Working directory path
	 * @returns Promise<boolean> - true if directory contains .jj/ folder
	 */
	async isRepo(cwd: string): Promise<boolean> {
		return createIpcMethod({
			call: () => window.maestro.jj.isRepo(cwd),
			errorContext: 'Jj isRepo',
			defaultValue: false,
		});
	},

	/**
	 * Get jj repository status (changed files, working copy info)
	 * @param cwd Working directory path
	 * @returns Promise<JjStatus> - repository status or empty status on error
	 */
	async getStatus(cwd: string): Promise<JjStatus> {
		return createIpcMethod({
			call: () => window.maestro.jj.getStatus(cwd),
			errorContext: 'Jj getStatus',
			defaultValue: emptyJjStatus,
		});
	},

	/**
	 * Get all bookmarks (branches) in the jj repository
	 * @param cwd Working directory path
	 * @returns Promise<JjBookmark[]> - list of bookmarks or empty array on error
	 */
	async getBranches(cwd: string): Promise<JjBookmark[]> {
		return createIpcMethod({
			call: () => window.maestro.jj.getBranches(cwd),
			errorContext: 'Jj getBranches',
			defaultValue: [],
		});
	},

	/**
	 * Get the current working copy change
	 * @param cwd Working directory path
	 * @returns Promise<JjChange | null> - current change or null on error
	 */
	async getCurrentChange(cwd: string): Promise<JjChange | null> {
		return createIpcMethod({
			call: () => window.maestro.jj.getCurrentChange(cwd),
			errorContext: 'Jj getCurrentChange',
			defaultValue: null,
		});
	},

	/**
	 * Get the root directory of the jj repository
	 * @param cwd Working directory path
	 * @returns Promise<string | null> - repository root path or null if not a jj repo
	 */
	async getRepoRoot(cwd: string): Promise<string | null> {
		return createIpcMethod({
			call: () => window.maestro.jj.getRepoRoot(cwd),
			errorContext: 'Jj getRepoRoot',
			defaultValue: null,
		});
	},

	// ========================================================================
	// Diff/Show/Log Operations
	// ========================================================================

	/**
	 * Get diff for current changes or a specific revision
	 * @param cwd Working directory path
	 * @param revision Optional revision to diff
	 * @returns Promise<JjDiffResult> - diff result with raw text and file list
	 */
	async getDiff(cwd: string, revision?: string): Promise<JjDiffResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.diff(cwd, revision),
			errorContext: 'Jj diff',
			defaultValue: { raw: '', files: [] },
		});
	},

	/**
	 * Show specific change details (metadata + diff)
	 * @param cwd Working directory path
	 * @param changeId Optional change ID to show (defaults to working copy)
	 * @returns Promise<JjShowResult | null> - change details or null on error
	 */
	async show(cwd: string, changeId?: string): Promise<JjShowResult | null> {
		return createIpcMethod({
			call: () => window.maestro.jj.show(cwd, changeId),
			errorContext: 'Jj show',
			defaultValue: null,
		});
	},

	/**
	 * Get commit/change history log
	 * @param cwd Working directory path
	 * @param options Optional revset filter and entry limit
	 * @returns Promise<JjLogEntry[]> - list of log entries or empty array on error
	 */
	async getLog(
		cwd: string,
		options?: { revset?: string; limit?: number }
	): Promise<JjLogEntry[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.jj.log(cwd, options);
				return result.entries;
			},
			errorContext: 'Jj log',
			defaultValue: [],
		});
	},

	// ========================================================================
	// Change Management Operations
	// ========================================================================

	/**
	 * Set change description (commit message)
	 * @param cwd Working directory path
	 * @param message Description text
	 * @param changeId Optional change ID (defaults to working copy)
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async describe(
		cwd: string,
		message: string,
		changeId?: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.describe(cwd, message, changeId),
			errorContext: 'Jj describe',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Create a new change on top of the current one
	 * @param cwd Working directory path
	 * @param revision Optional parent revision for the new change
	 * @returns Promise<JjOperationResult> - operation result with new change ID
	 */
	async newChange(cwd: string, revision?: string): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.new(cwd, revision),
			errorContext: 'Jj new',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Squash changes from working copy into parent
	 * @param cwd Working directory path
	 * @param revision Optional revision to squash
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async squash(cwd: string, revision?: string): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.squash(cwd, revision),
			errorContext: 'Jj squash',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Abandon a change (remove it from history)
	 * @param cwd Working directory path
	 * @param changeId Change ID to abandon
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async abandon(cwd: string, changeId: string): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.abandon(cwd, changeId),
			errorContext: 'Jj abandon',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Edit an existing change (set it as the working copy)
	 * @param cwd Working directory path
	 * @param changeId Change ID to edit
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async edit(cwd: string, changeId: string): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.edit(cwd, changeId),
			errorContext: 'Jj edit',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	// ========================================================================
	// Branch/Bookmark Management
	// ========================================================================

	/**
	 * Create a new bookmark (branch) in the jj repository
	 * @param cwd Working directory path
	 * @param name Bookmark name to create
	 * @param revision Optional revision to point the bookmark at
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async branchCreate(
		cwd: string,
		name: string,
		revision?: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.branchCreate(cwd, name, revision),
			errorContext: 'Jj branchCreate',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Delete a bookmark (branch) from the jj repository
	 * @param cwd Working directory path
	 * @param name Bookmark name to delete
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async branchDelete(
		cwd: string,
		name: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.branchDelete(cwd, name),
			errorContext: 'Jj branchDelete',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Set a bookmark to a specific revision
	 * @param cwd Working directory path
	 * @param name Bookmark name to set
	 * @param revision Target revision
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async branchSet(
		cwd: string,
		name: string,
		revision: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.branchSet(cwd, name, revision),
			errorContext: 'Jj branchSet',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Track a remote bookmark
	 * @param cwd Working directory path
	 * @param bookmark Bookmark reference to track (e.g., "name@remote")
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async branchTrack(
		cwd: string,
		bookmark: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.branchTrack(cwd, bookmark),
			errorContext: 'Jj branchTrack',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Fetch from git remote
	 * @param cwd Working directory path
	 * @param options Optional remote and branch to fetch
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async gitFetch(
		cwd: string,
		options?: { remote?: string; branch?: string }
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.gitFetch(cwd, options),
			errorContext: 'Jj gitFetch',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Push to git remote
	 * @param cwd Working directory path
	 * @param options Optional remote, branch, and allBranches flag
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async gitPush(
		cwd: string,
		options?: { remote?: string; branch?: string; allBranches?: boolean }
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.gitPush(cwd, options),
			errorContext: 'Jj gitPush',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	/**
	 * Clone a git repository into jj
	 * @param cwd Working directory path (parent directory for clone)
	 * @param url Git repository URL to clone
	 * @param destination Optional target directory name
	 * @returns Promise<JjOperationResult> - operation result
	 */
	async gitClone(
		cwd: string,
		url: string,
		destination?: string
	): Promise<JjOperationResult> {
		return createIpcMethod({
			call: () => window.maestro.jj.gitClone(cwd, url, destination),
			errorContext: 'Jj gitClone',
			defaultValue: { ok: false, message: '', error: 'IPC call failed' },
		});
	},

	// ========================================================================
	// Convenience Methods
	// ========================================================================

	/**
	 * Commit changes by describing the working copy and creating a new empty change.
	 * Combines `jj describe` + `jj new` into one operation.
	 * @param cwd Working directory path
	 * @param message Commit message / change description
	 * @returns Promise<JjOperationResult> - result of the `jj new` (final step)
	 */
	async commitChanges(
		cwd: string,
		message: string
	): Promise<JjOperationResult> {
		const describeResult = await this.describe(cwd, message);
		if (!describeResult.ok) {
			return describeResult;
		}
		return this.newChange(cwd);
	},

	/**
	 * Synchronize with a git remote by fetching then pushing.
	 * Combines `jj git fetch` + `jj git push` into one operation.
	 * @param cwd Working directory path
	 * @param options Optional remote to sync with
	 * @returns Promise<{ fetch: JjOperationResult; push: JjOperationResult }> - results of both operations
	 */
	async syncWithRemote(
		cwd: string,
		options?: { remote?: string }
	): Promise<{ fetch: JjOperationResult; push: JjOperationResult }> {
		const fetchResult = await this.gitFetch(cwd, options);
		if (!fetchResult.ok) {
			return {
				fetch: fetchResult,
				push: { ok: false, message: '', error: 'Skipped: fetch failed' },
			};
		}
		const pushResult = await this.gitPush(cwd, options);
		return { fetch: fetchResult, push: pushResult };
	},
};

// ============================================================================
// Timeout Utility
// ============================================================================

/**
 * Default timeout for long-running jj operations (fetch, push, clone) in ms.
 * 60 seconds should accommodate most network operations.
 */
const JJ_NETWORK_TIMEOUT_MS = 60_000;

/**
 * Wraps a promise with a timeout. If the promise does not settle within
 * the given duration, it rejects with a timeout error.
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Human-readable name for error messages
 * @returns The resolved value of the original promise
 */
export function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	operationName: string
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

/**
 * Timeout-aware wrappers for long-running jj operations.
 * Use these when you need to guard against hung network operations.
 */
export const jjServiceWithTimeout = {
	async gitFetch(
		cwd: string,
		options?: { remote?: string; branch?: string },
		timeoutMs = JJ_NETWORK_TIMEOUT_MS
	): Promise<JjOperationResult> {
		return withTimeout(
			jjService.gitFetch(cwd, options),
			timeoutMs,
			'jj git fetch'
		);
	},

	async gitPush(
		cwd: string,
		options?: { remote?: string; branch?: string; allBranches?: boolean },
		timeoutMs = JJ_NETWORK_TIMEOUT_MS
	): Promise<JjOperationResult> {
		return withTimeout(
			jjService.gitPush(cwd, options),
			timeoutMs,
			'jj git push'
		);
	},

	async gitClone(
		cwd: string,
		url: string,
		destination?: string,
		timeoutMs = JJ_NETWORK_TIMEOUT_MS
	): Promise<JjOperationResult> {
		return withTimeout(
			jjService.gitClone(cwd, url, destination),
			timeoutMs,
			'jj git clone'
		);
	},

	async syncWithRemote(
		cwd: string,
		options?: { remote?: string },
		timeoutMs = JJ_NETWORK_TIMEOUT_MS
	): Promise<{ fetch: JjOperationResult; push: JjOperationResult }> {
		return withTimeout(
			jjService.syncWithRemote(cwd, options),
			timeoutMs,
			'jj sync with remote'
		);
	},
};
