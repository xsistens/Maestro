/**
 * Tests for VCS detection utility
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { detectRepositoryVcs, getEffectiveVcs } from '../../../renderer/utils/vcsDetection';

// Mock the service modules
vi.mock('../../../renderer/services/git', () => ({
	gitService: {
		isRepo: vi.fn(),
	},
}));

vi.mock('../../../renderer/services/jj', () => ({
	jjService: {
		isRepo: vi.fn(),
		isInstalled: vi.fn(),
	},
}));

// Import mocked services for test control
import { gitService } from '../../../renderer/services/git';
import { jjService } from '../../../renderer/services/jj';

describe('vcsDetection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('detectRepositoryVcs', () => {
		it('returns "git" for git-only repository', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(true);
			vi.mocked(jjService.isRepo).mockResolvedValue(false);

			const result = await detectRepositoryVcs('/path/to/git-repo');
			expect(result).toBe('git');
			expect(gitService.isRepo).toHaveBeenCalledWith('/path/to/git-repo');
			expect(jjService.isRepo).toHaveBeenCalledWith('/path/to/git-repo');
		});

		it('returns "jj" for jj-only repository', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(false);
			vi.mocked(jjService.isRepo).mockResolvedValue(true);

			const result = await detectRepositoryVcs('/path/to/jj-repo');
			expect(result).toBe('jj');
		});

		it('returns "both" for colocated repository (git + jj)', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(true);
			vi.mocked(jjService.isRepo).mockResolvedValue(true);

			const result = await detectRepositoryVcs('/path/to/colocated');
			expect(result).toBe('both');
		});

		it('returns "none" when no VCS is detected', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(false);
			vi.mocked(jjService.isRepo).mockResolvedValue(false);

			const result = await detectRepositoryVcs('/path/to/no-vcs');
			expect(result).toBe('none');
		});

		it('checks both VCS types in parallel', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(true);
			vi.mocked(jjService.isRepo).mockResolvedValue(false);

			await detectRepositoryVcs('/some/path');

			// Both should be called with the same path
			expect(gitService.isRepo).toHaveBeenCalledWith('/some/path');
			expect(jjService.isRepo).toHaveBeenCalledWith('/some/path');
		});
	});

	describe('getEffectiveVcs', () => {
		describe('with userPref "git"', () => {
			it('returns "git" even when jj is installed and jj repo exists', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'git');
				expect(result).toBe('git');
			});

			it('returns "git" when no VCS is present', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isInstalled).mockResolvedValue(false);

				const result = await getEffectiveVcs('/path', 'git');
				expect(result).toBe('git');
			});
		});

		describe('with userPref "jj"', () => {
			it('returns "jj" when jj is installed and jj repo exists', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'jj');
				expect(result).toBe('jj');
			});

			it('returns "jj" when jj is installed even without jj repo', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'jj');
				expect(result).toBe('jj');
			});

			it('falls back to "git" when jj is not installed', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(false);

				const result = await getEffectiveVcs('/path', 'jj');
				expect(result).toBe('git');
			});
		});

		describe('with userPref "auto"', () => {
			it('returns "jj" when jj is installed and jj repo exists', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'auto');
				expect(result).toBe('jj');
			});

			it('returns "jj" for colocated repo when jj is installed', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'auto');
				expect(result).toBe('jj');
			});

			it('returns "git" when jj is installed but no jj repo', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isInstalled).mockResolvedValue(true);

				const result = await getEffectiveVcs('/path', 'auto');
				expect(result).toBe('git');
			});

			it('returns "git" when jj is not installed even with jj repo', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isRepo).mockResolvedValue(true);
				vi.mocked(jjService.isInstalled).mockResolvedValue(false);

				const result = await getEffectiveVcs('/path', 'auto');
				expect(result).toBe('git');
			});

			it('returns "git" when neither VCS is present', async () => {
				vi.mocked(gitService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isRepo).mockResolvedValue(false);
				vi.mocked(jjService.isInstalled).mockResolvedValue(false);

				const result = await getEffectiveVcs('/path', 'auto');
				expect(result).toBe('git');
			});
		});

		it('checks VCS presence and jj installation in parallel', async () => {
			vi.mocked(gitService.isRepo).mockResolvedValue(true);
			vi.mocked(jjService.isRepo).mockResolvedValue(false);
			vi.mocked(jjService.isInstalled).mockResolvedValue(true);

			await getEffectiveVcs('/test/path', 'auto');

			expect(gitService.isRepo).toHaveBeenCalledWith('/test/path');
			expect(jjService.isRepo).toHaveBeenCalledWith('/test/path');
			expect(jjService.isInstalled).toHaveBeenCalled();
		});
	});
});
