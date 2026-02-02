/**
 * Preload API for Jujutsu (jj) version control operations
 *
 * Provides the window.maestro.jj namespace for:
 * - Installation detection: isInstalled, getVersion
 * - Repository detection: isRepo, getRepoRoot
 * - Status queries: getStatus, getBranches, getCurrentChange
 */

import { ipcRenderer } from 'electron';
import type { JjStatus, JjBookmark, JjChange } from '../../shared/types';

/**
 * Creates the jj API object for preload exposure
 */
export function createJjApi() {
	return {
		/**
		 * Check if jj is installed on the system
		 */
		isInstalled: (): Promise<boolean> =>
			ipcRenderer
				.invoke('jj:isInstalled')
				.then((result: { installed: boolean }) => result.installed),

		/**
		 * Get the jj version string
		 */
		getVersion: (): Promise<string> =>
			ipcRenderer
				.invoke('jj:getVersion')
				.then((result: { version: string; error?: string }) => result.version),

		/**
		 * Check if a directory is a jj repository
		 */
		isRepo: (cwd: string): Promise<boolean> => ipcRenderer.invoke('jj:isRepo', cwd),

		/**
		 * Get jj repository status (changed files)
		 */
		getStatus: (cwd: string): Promise<JjStatus> => ipcRenderer.invoke('jj:getStatus', cwd),

		/**
		 * Get all bookmarks (branches) in the repository
		 */
		getBranches: (cwd: string): Promise<JjBookmark[]> =>
			ipcRenderer
				.invoke('jj:getBranches', cwd)
				.then((result: { bookmarks: JjBookmark[] }) => result.bookmarks),

		/**
		 * Get the current working copy change
		 */
		getCurrentChange: (cwd: string): Promise<JjChange | null> =>
			ipcRenderer
				.invoke('jj:getCurrentChange', cwd)
				.then((result: { change: JjChange | null }) => result.change),

		/**
		 * Get the root directory of the jj repository
		 */
		getRepoRoot: (cwd: string): Promise<string | null> =>
			ipcRenderer.invoke('jj:getRepoRoot', cwd).then(
				(result: { root: string }) => result.root,
				() => null // Return null on error (not a jj repo)
			),
	};
}

/**
 * TypeScript type for the jj API
 */
export type JjApi = ReturnType<typeof createJjApi>;
