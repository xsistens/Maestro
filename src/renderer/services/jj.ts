/**
 * Jujutsu (jj) operations service
 * Wraps IPC calls to main process for jj version control operations
 */

import { createIpcMethod } from './ipcWrapper';
import type { JjStatus, JjBookmark, JjChange } from '../../shared/types';

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
};
