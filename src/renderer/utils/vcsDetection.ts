/**
 * VCS Detection Utility
 *
 * Detects which version control systems are present in a directory
 * and determines the effective VCS to use based on user preferences.
 */

import { gitService } from '../services/git';
import { jjService } from '../services/jj';
import { type VcsMode, getActiveVcsMode } from '../hooks/settings/useSettings';

/**
 * Result of VCS detection indicating which VCS(s) are present in a directory.
 * - 'git': Only .git/ directory present
 * - 'jj': Only .jj/ directory present
 * - 'both': Both .git/ and .jj/ present (colocated repository)
 * - 'none': Neither VCS is present
 */
export type VcsDetectionResult = 'git' | 'jj' | 'both' | 'none';

/**
 * Detects which version control system(s) are present in a directory.
 *
 * This function checks for the presence of .git/ and .jj/ directories
 * to determine what VCS is being used. It handles "colocated" repositories
 * where both jj and git are present (jj can use git as a backend).
 *
 * @param cwd - The working directory path to check
 * @returns Promise resolving to the detection result
 *
 * @example
 * const vcs = await detectRepositoryVcs('/path/to/project');
 * if (vcs === 'both') {
 *   // Handle colocated jj+git repo
 * }
 */
export async function detectRepositoryVcs(cwd: string): Promise<VcsDetectionResult> {
	// Check both VCS types in parallel for better performance
	const [isGitRepo, isJjRepo] = await Promise.all([gitService.isRepo(cwd), jjService.isRepo(cwd)]);

	if (isGitRepo && isJjRepo) {
		return 'both';
	}
	if (isJjRepo) {
		return 'jj';
	}
	if (isGitRepo) {
		return 'git';
	}
	return 'none';
}

/**
 * Determines the effective VCS to use for a directory based on user preference
 * and what's actually available.
 *
 * This combines the user's VCS mode preference with the detected repository type
 * to determine which VCS should be used. It handles:
 * - 'git' mode: Always returns 'git'
 * - 'jj' mode: Returns 'jj' if installed and repo exists, otherwise falls back to 'git'
 * - 'auto' mode: Returns 'jj' if installed and jj repo exists, otherwise 'git'
 *
 * For colocated repositories (both .git and .jj present), the user preference
 * determines which VCS to use.
 *
 * @param cwd - The working directory path to check
 * @param userPref - User's VCS mode preference ('git' | 'jj' | 'auto')
 * @returns Promise resolving to the effective VCS to use
 *
 * @example
 * const vcs = await getEffectiveVcs('/path/to/project', 'auto');
 * // Returns 'jj' if jj is installed and .jj/ exists, otherwise 'git'
 */
export async function getEffectiveVcs(cwd: string, userPref: VcsMode): Promise<'git' | 'jj'> {
	// Check VCS presence and jj installation in parallel
	const [detectedVcs, jjInstalled] = await Promise.all([
		detectRepositoryVcs(cwd),
		jjService.isInstalled(),
	]);

	// Determine if a jj repo is present (either jj-only or colocated)
	const hasJjRepo = detectedVcs === 'jj' || detectedVcs === 'both';

	// Use the centralized logic from useSettings to determine effective VCS
	return getActiveVcsMode(userPref, hasJjRepo, jjInstalled);
}
