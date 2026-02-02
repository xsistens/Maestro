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
} from '../../../shared/jjUtils';
import type { JjStatus, JjBookmark, JjChange } from '../../../shared/types';

const LOG_CONTEXT = '[Jj]';

/** Helper to create handler options with Jj context */
const handlerOpts = (operation: string, logSuccess = false): CreateHandlerOptions => ({
	context: LOG_CONTEXT,
	operation,
	logSuccess,
});

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
			// Check both exit code and that we got valid version output
			const { isInstalled } = parseJjVersion(result.stdout);
			return { installed: result.exitCode === 0 && isInstalled };
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

	logger.debug(`${LOG_CONTEXT} Jj IPC handlers registered`);
}
