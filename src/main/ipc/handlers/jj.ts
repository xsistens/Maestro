import { ipcMain } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { execFileNoThrow } from '../../utils/execFile';
import { logger } from '../../utils/logger';
import {
	withIpcErrorLogging,
	createIpcHandler,
	CreateHandlerOptions,
} from '../../utils/ipcHandler';
import {
	parseJjVersion,
	parseJjStatus,
	parseJjBookmarks,
	parseJjChange,
	parseJjLog,
	parseJjDiff,
	JJ_LOG_TEMPLATE,
} from '../../../shared/jjUtils';
import type {
	JjStatus,
	JjBookmark,
	JjChange,
	JjLogEntry,
	JjDiffResult,
	JjShowResult,
	JjOperationResult,
} from '../../../shared/types';
import { detectJjError } from '../../parsers/jj-error-patterns';

const LOG_CONTEXT = '[Jj]';

/** Helper to create handler options with Jj context */
const handlerOpts = (operation: string, logSuccess = false): CreateHandlerOptions => ({
	context: LOG_CONTEXT,
	operation,
	logSuccess,
});

/** Helper to build a failed JjOperationResult with structured error detection */
function failedResult(stderr: string, stdout: string, fallbackMessage: string): JjOperationResult {
	return {
		ok: false,
		message: stdout,
		error: stderr || fallbackMessage,
		jjError: detectJjError(stderr),
	};
}

/**
 * Register all Jujutsu (jj) version control IPC handlers.
 *
 * These handlers provide jj operations used for VCS support including:
 * - Installation detection: isInstalled, getVersion
 * - Repository detection: isRepo, getRepoRoot
 * - Status queries: getStatus, getBranches, getCurrentChange
 */
export function registerJjHandlers(): void {
	// Check if jj is installed by running jj --version
	ipcMain.handle(
		'jj:isInstalled',
		withIpcErrorLogging(handlerOpts('isInstalled'), async () => {
			const result = await execFileNoThrow('jj', ['--version']);
			const { isInstalled } = parseJjVersion(result.stdout);
			const installed = result.exitCode === 0 && isInstalled;
			logger.debug(
				`isInstalled: exitCode=${result.exitCode} (${typeof result.exitCode}), stdout="${result.stdout.trim()}", parsed=${isInstalled}, result=${installed}`,
				LOG_CONTEXT
			);
			return { installed };
		})
	);

	// Get jj version string
	ipcMain.handle(
		'jj:getVersion',
		withIpcErrorLogging(handlerOpts('getVersion'), async () => {
			const result = await execFileNoThrow('jj', ['--version']);
			if (result.exitCode !== 0) {
				return { version: '', error: result.stderr || 'jj not found' };
			}
			const { version } = parseJjVersion(result.stdout);
			return { version };
		})
	);

	// Check if a directory is a jj repository (has .jj/ directory)
	ipcMain.handle(
		'jj:isRepo',
		withIpcErrorLogging(handlerOpts('isRepo'), async (cwd: string) => {
			try {
				const jjPath = path.join(cwd, '.jj');
				const stats = await fs.stat(jjPath);
				return stats.isDirectory();
			} catch {
				// .jj doesn't exist or isn't accessible
				return false;
			}
		})
	);

	// Get jj repository status (changed files)
	ipcMain.handle(
		'jj:getStatus',
		withIpcErrorLogging(handlerOpts('getStatus'), async (cwd: string): Promise<JjStatus> => {
			const result = await execFileNoThrow('jj', ['status'], cwd);
			if (result.exitCode !== 0) {
				logger.warn(`jj status failed in ${cwd}: ${result.stderr}`, LOG_CONTEXT);
				// Return empty status on error
				return parseJjStatus('');
			}
			return parseJjStatus(result.stdout);
		})
	);

	// List all bookmarks (branches in jj terminology)
	ipcMain.handle(
		'jj:getBranches',
		withIpcErrorLogging(
			handlerOpts('getBranches'),
			async (cwd: string): Promise<{ bookmarks: JjBookmark[] }> => {
				const result = await execFileNoThrow('jj', ['bookmark', 'list'], cwd);
				if (result.exitCode !== 0) {
					logger.warn(`jj bookmark list failed in ${cwd}: ${result.stderr}`, LOG_CONTEXT);
					return { bookmarks: [] };
				}
				const bookmarks = parseJjBookmarks(result.stdout);
				return { bookmarks };
			}
		)
	);

	// Get the current working copy change
	ipcMain.handle(
		'jj:getCurrentChange',
		withIpcErrorLogging(
			handlerOpts('getCurrentChange'),
			async (cwd: string): Promise<{ change: JjChange | null }> => {
				// Use template to get change_id, commit_id, and description
				const result = await execFileNoThrow(
					'jj',
					[
						'log',
						'--no-graph',
						'-r',
						'@',
						'-T',
						'change_id ++ " " ++ commit_id ++ " " ++ description',
					],
					cwd
				);
				if (result.exitCode !== 0) {
					logger.warn(`jj log failed in ${cwd}: ${result.stderr}`, LOG_CONTEXT);
					return { change: null };
				}
				const change = parseJjChange(result.stdout);
				return { change };
			}
		)
	);

	// Find the jj repository root directory
	ipcMain.handle(
		'jj:getRepoRoot',
		createIpcHandler(handlerOpts('getRepoRoot'), async (cwd: string) => {
			const result = await execFileNoThrow('jj', ['root'], cwd);
			if (result.exitCode !== 0) {
				throw new Error(result.stderr || 'Not a jj repository');
			}
			return { root: result.stdout.trim() };
		})
	);

	// ========================================================================
	// Operational Commands (diff, show, log, describe, new, squash, abandon, edit)
	// ========================================================================

	// Get diff for current changes
	ipcMain.handle(
		'jj:diff',
		withIpcErrorLogging(
			handlerOpts('diff'),
			async (cwd: string, revision?: string): Promise<JjDiffResult> => {
				const args = ['diff'];
				if (revision) {
					args.push('-r', revision);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					logger.warn(`jj diff failed in ${cwd}: ${result.stderr}`, LOG_CONTEXT);
					return { raw: '', files: [] };
				}
				return parseJjDiff(result.stdout);
			}
		)
	);

	// Show specific change details (metadata + diff)
	ipcMain.handle(
		'jj:show',
		withIpcErrorLogging(
			handlerOpts('show'),
			async (cwd: string, changeId?: string): Promise<JjShowResult | null> => {
				const rev = changeId || '@';

				// Get change metadata via log template
				const logResult = await execFileNoThrow(
					'jj',
					['log', '--no-graph', '-r', rev, '-T', JJ_LOG_TEMPLATE],
					cwd
				);
				if (logResult.exitCode !== 0) {
					logger.warn(`jj log for show failed in ${cwd}: ${logResult.stderr}`, LOG_CONTEXT);
					return null;
				}

				const entries = parseJjLog(logResult.stdout);
				if (entries.length === 0) {
					return null;
				}

				// Get the diff for this specific change
				const diffResult = await execFileNoThrow('jj', ['diff', '-r', rev], cwd);
				const diff = diffResult.exitCode === 0 ? diffResult.stdout : '';

				return {
					change: entries[0],
					diff,
				};
			}
		)
	);

	// Get commit/change history log
	ipcMain.handle(
		'jj:log',
		withIpcErrorLogging(
			handlerOpts('log'),
			async (
				cwd: string,
				options?: { revset?: string; limit?: number }
			): Promise<{ entries: JjLogEntry[] }> => {
				const args = ['log', '--no-graph', '-T', JJ_LOG_TEMPLATE];
				if (options?.revset) {
					args.push('-r', options.revset);
				}
				if (options?.limit) {
					args.push('-n', String(options.limit));
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					logger.warn(`jj log failed in ${cwd}: ${result.stderr}`, LOG_CONTEXT);
					return { entries: [] };
				}
				return { entries: parseJjLog(result.stdout) };
			}
		)
	);

	// Set change description
	ipcMain.handle(
		'jj:describe',
		withIpcErrorLogging(
			handlerOpts('describe'),
			async (
				cwd: string,
				message: string,
				changeId?: string
			): Promise<JjOperationResult> => {
				const args = ['describe', '-m', message];
				if (changeId) {
					args.push('-r', changeId);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj describe failed');
				}
				return { ok: true, message: result.stdout };
			}
		)
	);

	// Create new change
	ipcMain.handle(
		'jj:new',
		withIpcErrorLogging(
			handlerOpts('new'),
			async (cwd: string, revision?: string): Promise<JjOperationResult> => {
				const args = ['new'];
				if (revision) {
					args.push(revision);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj new failed');
				}
				// Extract new change ID from output if available
				const changeIdMatch = result.stderr.match(
					/Working copy now at:\s+(\w+)/
				);
				return {
					ok: true,
					changeId: changeIdMatch?.[1],
					message: result.stderr || result.stdout,
				};
			}
		)
	);

	// Squash changes into parent
	ipcMain.handle(
		'jj:squash',
		withIpcErrorLogging(
			handlerOpts('squash'),
			async (cwd: string, revision?: string): Promise<JjOperationResult> => {
				const args = ['squash'];
				if (revision) {
					args.push('-r', revision);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj squash failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Abandon a change
	ipcMain.handle(
		'jj:abandon',
		withIpcErrorLogging(
			handlerOpts('abandon'),
			async (cwd: string, changeId: string): Promise<JjOperationResult> => {
				const result = await execFileNoThrow('jj', ['abandon', changeId], cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj abandon failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Edit an existing change (set it as the working copy)
	ipcMain.handle(
		'jj:edit',
		withIpcErrorLogging(
			handlerOpts('edit'),
			async (cwd: string, changeId: string): Promise<JjOperationResult> => {
				const result = await execFileNoThrow('jj', ['edit', changeId], cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj edit failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// ========================================================================
	// Branch/Bookmark Management (create, delete, set, track)
	// ========================================================================

	// Create a new bookmark (branch)
	ipcMain.handle(
		'jj:branchCreate',
		withIpcErrorLogging(
			handlerOpts('branchCreate'),
			async (
				cwd: string,
				name: string,
				revision?: string
			): Promise<JjOperationResult> => {
				const args = ['bookmark', 'create', name];
				if (revision) {
					args.push('-r', revision);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj bookmark create failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Delete a bookmark (branch)
	ipcMain.handle(
		'jj:branchDelete',
		withIpcErrorLogging(
			handlerOpts('branchDelete'),
			async (cwd: string, name: string): Promise<JjOperationResult> => {
				const result = await execFileNoThrow(
					'jj',
					['bookmark', 'delete', name],
					cwd
				);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj bookmark delete failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Set a bookmark to a specific revision
	ipcMain.handle(
		'jj:branchSet',
		withIpcErrorLogging(
			handlerOpts('branchSet'),
			async (
				cwd: string,
				name: string,
				revision: string
			): Promise<JjOperationResult> => {
				const result = await execFileNoThrow(
					'jj',
					['bookmark', 'set', name, '-r', revision],
					cwd
				);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj bookmark set failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Track a remote bookmark
	ipcMain.handle(
		'jj:branchTrack',
		withIpcErrorLogging(
			handlerOpts('branchTrack'),
			async (
				cwd: string,
				bookmark: string
			): Promise<JjOperationResult> => {
				const result = await execFileNoThrow(
					'jj',
					['bookmark', 'track', bookmark],
					cwd
				);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj bookmark track failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// ========================================================================
	// Git Interop (fetch, push, clone)
	// ========================================================================

	// Fetch from git remote
	ipcMain.handle(
		'jj:gitFetch',
		withIpcErrorLogging(
			handlerOpts('gitFetch'),
			async (
				cwd: string,
				options?: { remote?: string; branch?: string }
			): Promise<JjOperationResult> => {
				const args = ['git', 'fetch'];
				if (options?.remote) {
					args.push('--remote', options.remote);
				}
				if (options?.branch) {
					args.push('--branch', options.branch);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj git fetch failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Push to git remote
	ipcMain.handle(
		'jj:gitPush',
		withIpcErrorLogging(
			handlerOpts('gitPush'),
			async (
				cwd: string,
				options?: { remote?: string; branch?: string; allBranches?: boolean }
			): Promise<JjOperationResult> => {
				const args = ['git', 'push'];
				if (options?.remote) {
					args.push('--remote', options.remote);
				}
				if (options?.branch) {
					args.push('--branch', options.branch);
				}
				if (options?.allBranches) {
					args.push('--all');
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj git push failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	// Clone a git repository into jj
	ipcMain.handle(
		'jj:gitClone',
		withIpcErrorLogging(
			handlerOpts('gitClone'),
			async (
				cwd: string,
				url: string,
				destination?: string
			): Promise<JjOperationResult> => {
				const args = ['git', 'clone', url];
				if (destination) {
					args.push(destination);
				}
				const result = await execFileNoThrow('jj', args, cwd);
				if (result.exitCode !== 0) {
					return failedResult(result.stderr, result.stdout, 'jj git clone failed');
				}
				return { ok: true, message: result.stderr || result.stdout };
			}
		)
	);

	logger.debug(`${LOG_CONTEXT} Jj IPC handlers registered`);
}
