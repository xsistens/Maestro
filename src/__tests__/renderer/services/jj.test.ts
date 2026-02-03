/**
 * Tests for src/renderer/services/jj.ts
 * Jujutsu operations service that wraps IPC calls to main process
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { jjService, jjServiceWithTimeout, withTimeout } from '../../../renderer/services/jj';

// Mock the window.maestro.jj object
const mockJj = {
	isInstalled: vi.fn(),
	getVersion: vi.fn(),
	isRepo: vi.fn(),
	getStatus: vi.fn(),
	getBranches: vi.fn(),
	getCurrentChange: vi.fn(),
	getRepoRoot: vi.fn(),
	diff: vi.fn(),
	show: vi.fn(),
	log: vi.fn(),
	describe: vi.fn(),
	new: vi.fn(),
	squash: vi.fn(),
	abandon: vi.fn(),
	edit: vi.fn(),
	branchCreate: vi.fn(),
	branchDelete: vi.fn(),
	branchSet: vi.fn(),
	branchTrack: vi.fn(),
	gitFetch: vi.fn(),
	gitPush: vi.fn(),
	gitClone: vi.fn(),
};

// Setup mock before each test
beforeEach(() => {
	vi.clearAllMocks();

	// Ensure window.maestro.jj is mocked
	(window as any).maestro = {
		...(window as any).maestro,
		jj: mockJj,
	};

	// Mock console.error to prevent noise in test output
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('jjService', () => {
	// ========================================================================
	// Basic Operations (already existed, verify still working)
	// ========================================================================

	describe('isInstalled', () => {
		test('returns true when jj is installed', async () => {
			mockJj.isInstalled.mockResolvedValue(true);

			const result = await jjService.isInstalled();

			expect(result).toBe(true);
		});

		test('returns false on error', async () => {
			mockJj.isInstalled.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.isInstalled();

			expect(result).toBe(false);
			expect(console.error).toHaveBeenCalledWith('Jj isInstalled error:', expect.any(Error));
		});
	});

	describe('getVersion', () => {
		test('returns version string', async () => {
			mockJj.getVersion.mockResolvedValue('0.24.0');

			const result = await jjService.getVersion();

			expect(result).toBe('0.24.0');
		});

		test('returns empty string on error', async () => {
			mockJj.getVersion.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.getVersion();

			expect(result).toBe('');
		});
	});

	describe('isRepo', () => {
		test('returns true when directory is a jj repository', async () => {
			mockJj.isRepo.mockResolvedValue(true);

			const result = await jjService.isRepo('/path/to/repo');

			expect(result).toBe(true);
			expect(mockJj.isRepo).toHaveBeenCalledWith('/path/to/repo');
		});

		test('returns false on error', async () => {
			mockJj.isRepo.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.isRepo('/path/to/repo');

			expect(result).toBe(false);
		});
	});

	describe('getStatus', () => {
		test('returns status from IPC', async () => {
			const status = {
				files: [{ path: 'file.ts', status: 'M' as const }],
				workingCopyChangeId: 'abc123',
				workingCopyCommitId: 'def456',
				workingCopyDescription: 'test change',
				workingCopyEmpty: false,
				parentChangeId: 'ghi789',
				parentCommitId: 'jkl012',
				parentDescription: 'parent',
				parentEmpty: false,
				hasConflicts: false,
				conflictedFiles: [],
			};
			mockJj.getStatus.mockResolvedValue(status);

			const result = await jjService.getStatus('/path/to/repo');

			expect(result).toEqual(status);
			expect(mockJj.getStatus).toHaveBeenCalledWith('/path/to/repo');
		});

		test('returns empty status on error', async () => {
			mockJj.getStatus.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.getStatus('/path/to/repo');

			expect(result.files).toEqual([]);
			expect(result.workingCopyChangeId).toBe('');
			expect(result.hasConflicts).toBe(false);
		});
	});

	// ========================================================================
	// Diff/Show/Log Operations
	// ========================================================================

	describe('getDiff', () => {
		test('returns diff result for current changes', async () => {
			const diffResult = {
				raw: 'diff --git a/file.ts b/file.ts\n+new line',
				files: [{ path: 'file.ts', status: 'M' as const }],
			};
			mockJj.diff.mockResolvedValue(diffResult);

			const result = await jjService.getDiff('/path/to/repo');

			expect(result).toEqual(diffResult);
			expect(mockJj.diff).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes revision parameter when provided', async () => {
			const diffResult = { raw: 'diff content', files: [] };
			mockJj.diff.mockResolvedValue(diffResult);

			const result = await jjService.getDiff('/path/to/repo', 'abc123');

			expect(result).toEqual(diffResult);
			expect(mockJj.diff).toHaveBeenCalledWith('/path/to/repo', 'abc123');
		});

		test('returns empty diff result on error', async () => {
			mockJj.diff.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.getDiff('/path/to/repo');

			expect(result).toEqual({ raw: '', files: [] });
			expect(console.error).toHaveBeenCalledWith('Jj diff error:', expect.any(Error));
		});
	});

	describe('show', () => {
		test('returns change details for working copy', async () => {
			const showResult = {
				change: {
					changeId: 'abc123',
					commitId: 'def456',
					description: 'test change',
					isEmpty: false,
					author: 'Test User',
					email: 'test@example.com',
					timestamp: '2026-01-01T00:00:00Z',
					bookmarks: ['main'],
				},
				diff: 'diff --git a/file.ts b/file.ts',
			};
			mockJj.show.mockResolvedValue(showResult);

			const result = await jjService.show('/path/to/repo');

			expect(result).toEqual(showResult);
			expect(mockJj.show).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes changeId parameter when provided', async () => {
			const showResult = {
				change: {
					changeId: 'xyz789',
					commitId: 'uvw012',
					description: 'specific change',
					isEmpty: false,
					author: 'Test',
					email: 'test@example.com',
					timestamp: '2026-01-01T00:00:00Z',
					bookmarks: [],
				},
				diff: '',
			};
			mockJj.show.mockResolvedValue(showResult);

			const result = await jjService.show('/path/to/repo', 'xyz789');

			expect(result).toEqual(showResult);
			expect(mockJj.show).toHaveBeenCalledWith('/path/to/repo', 'xyz789');
		});

		test('returns null on error', async () => {
			mockJj.show.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.show('/path/to/repo');

			expect(result).toBeNull();
			expect(console.error).toHaveBeenCalledWith('Jj show error:', expect.any(Error));
		});
	});

	describe('getLog', () => {
		test('returns log entries', async () => {
			const entries = [
				{
					changeId: 'abc123',
					commitId: 'def456',
					description: 'first change',
					isEmpty: false,
					author: 'Test User',
					email: 'test@example.com',
					timestamp: '2026-01-01T00:00:00Z',
					bookmarks: ['main'],
				},
				{
					changeId: 'ghi789',
					commitId: 'jkl012',
					description: 'second change',
					isEmpty: false,
					author: 'Test User',
					email: 'test@example.com',
					timestamp: '2026-01-02T00:00:00Z',
					bookmarks: [],
				},
			];
			mockJj.log.mockResolvedValue({ entries });

			const result = await jjService.getLog('/path/to/repo');

			expect(result).toEqual(entries);
			expect(mockJj.log).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes options when provided', async () => {
			mockJj.log.mockResolvedValue({ entries: [] });

			const result = await jjService.getLog('/path/to/repo', {
				revset: 'trunk()..@',
				limit: 10,
			});

			expect(result).toEqual([]);
			expect(mockJj.log).toHaveBeenCalledWith('/path/to/repo', {
				revset: 'trunk()..@',
				limit: 10,
			});
		});

		test('returns empty array on error', async () => {
			mockJj.log.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.getLog('/path/to/repo');

			expect(result).toEqual([]);
			expect(console.error).toHaveBeenCalledWith('Jj log error:', expect.any(Error));
		});
	});

	// ========================================================================
	// Change Management Operations
	// ========================================================================

	describe('describe', () => {
		test('sets change description successfully', async () => {
			mockJj.describe.mockResolvedValue({ ok: true, message: 'Description set' });

			const result = await jjService.describe('/path/to/repo', 'my message');

			expect(result).toEqual({ ok: true, message: 'Description set' });
			expect(mockJj.describe).toHaveBeenCalledWith('/path/to/repo', 'my message', undefined);
		});

		test('passes changeId when provided', async () => {
			mockJj.describe.mockResolvedValue({ ok: true, message: 'Description set' });

			const result = await jjService.describe('/path/to/repo', 'msg', 'abc123');

			expect(result.ok).toBe(true);
			expect(mockJj.describe).toHaveBeenCalledWith('/path/to/repo', 'msg', 'abc123');
		});

		test('returns failure result on error', async () => {
			mockJj.describe.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.describe('/path/to/repo', 'msg');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('IPC call failed');
		});
	});

	describe('newChange', () => {
		test('creates a new change successfully', async () => {
			mockJj.new.mockResolvedValue({
				ok: true,
				changeId: 'newchange',
				message: 'Created new change',
			});

			const result = await jjService.newChange('/path/to/repo');

			expect(result.ok).toBe(true);
			expect(result.changeId).toBe('newchange');
			expect(mockJj.new).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes revision when provided', async () => {
			mockJj.new.mockResolvedValue({ ok: true, message: 'Created' });

			await jjService.newChange('/path/to/repo', 'parent123');

			expect(mockJj.new).toHaveBeenCalledWith('/path/to/repo', 'parent123');
		});

		test('returns failure result on error', async () => {
			mockJj.new.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.newChange('/path/to/repo');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('IPC call failed');
		});
	});

	describe('squash', () => {
		test('squashes changes successfully', async () => {
			mockJj.squash.mockResolvedValue({ ok: true, message: 'Squashed' });

			const result = await jjService.squash('/path/to/repo');

			expect(result.ok).toBe(true);
			expect(mockJj.squash).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes revision when provided', async () => {
			mockJj.squash.mockResolvedValue({ ok: true, message: 'Squashed' });

			await jjService.squash('/path/to/repo', 'rev123');

			expect(mockJj.squash).toHaveBeenCalledWith('/path/to/repo', 'rev123');
		});

		test('returns failure result on error', async () => {
			mockJj.squash.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.squash('/path/to/repo');

			expect(result.ok).toBe(false);
		});
	});

	describe('abandon', () => {
		test('abandons a change successfully', async () => {
			mockJj.abandon.mockResolvedValue({ ok: true, message: 'Abandoned' });

			const result = await jjService.abandon('/path/to/repo', 'abc123');

			expect(result.ok).toBe(true);
			expect(mockJj.abandon).toHaveBeenCalledWith('/path/to/repo', 'abc123');
		});

		test('returns failure result on error', async () => {
			mockJj.abandon.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.abandon('/path/to/repo', 'abc123');

			expect(result.ok).toBe(false);
		});
	});

	describe('edit', () => {
		test('edits a change successfully', async () => {
			mockJj.edit.mockResolvedValue({ ok: true, message: 'Now editing abc123' });

			const result = await jjService.edit('/path/to/repo', 'abc123');

			expect(result.ok).toBe(true);
			expect(mockJj.edit).toHaveBeenCalledWith('/path/to/repo', 'abc123');
		});

		test('returns failure result on error', async () => {
			mockJj.edit.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.edit('/path/to/repo', 'abc123');

			expect(result.ok).toBe(false);
		});
	});

	// ========================================================================
	// Branch/Bookmark Management
	// ========================================================================

	describe('branchCreate', () => {
		test('creates a bookmark successfully', async () => {
			mockJj.branchCreate.mockResolvedValue({ ok: true, message: 'Created' });

			const result = await jjService.branchCreate('/path/to/repo', 'feature-x');

			expect(result.ok).toBe(true);
			expect(mockJj.branchCreate).toHaveBeenCalledWith(
				'/path/to/repo',
				'feature-x',
				undefined
			);
		});

		test('passes revision when provided', async () => {
			mockJj.branchCreate.mockResolvedValue({ ok: true, message: 'Created' });

			await jjService.branchCreate('/path/to/repo', 'feature-x', 'rev123');

			expect(mockJj.branchCreate).toHaveBeenCalledWith(
				'/path/to/repo',
				'feature-x',
				'rev123'
			);
		});

		test('returns failure result on error', async () => {
			mockJj.branchCreate.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.branchCreate('/path/to/repo', 'feature-x');

			expect(result.ok).toBe(false);
		});
	});

	describe('branchDelete', () => {
		test('deletes a bookmark successfully', async () => {
			mockJj.branchDelete.mockResolvedValue({ ok: true, message: 'Deleted' });

			const result = await jjService.branchDelete('/path/to/repo', 'old-branch');

			expect(result.ok).toBe(true);
			expect(mockJj.branchDelete).toHaveBeenCalledWith('/path/to/repo', 'old-branch');
		});

		test('returns failure result on error', async () => {
			mockJj.branchDelete.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.branchDelete('/path/to/repo', 'old-branch');

			expect(result.ok).toBe(false);
		});
	});

	describe('branchSet', () => {
		test('sets a bookmark to a revision', async () => {
			mockJj.branchSet.mockResolvedValue({ ok: true, message: 'Set' });

			const result = await jjService.branchSet('/path/to/repo', 'main', 'rev123');

			expect(result.ok).toBe(true);
			expect(mockJj.branchSet).toHaveBeenCalledWith('/path/to/repo', 'main', 'rev123');
		});

		test('returns failure result on error', async () => {
			mockJj.branchSet.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.branchSet('/path/to/repo', 'main', 'rev123');

			expect(result.ok).toBe(false);
		});
	});

	describe('branchTrack', () => {
		test('tracks a remote bookmark', async () => {
			mockJj.branchTrack.mockResolvedValue({ ok: true, message: 'Tracked' });

			const result = await jjService.branchTrack('/path/to/repo', 'main@origin');

			expect(result.ok).toBe(true);
			expect(mockJj.branchTrack).toHaveBeenCalledWith('/path/to/repo', 'main@origin');
		});

		test('returns failure result on error', async () => {
			mockJj.branchTrack.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.branchTrack('/path/to/repo', 'main@origin');

			expect(result.ok).toBe(false);
		});
	});

	// ========================================================================
	// Git Interop Operations
	// ========================================================================

	describe('gitFetch', () => {
		test('fetches from default remote', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });

			const result = await jjService.gitFetch('/path/to/repo');

			expect(result.ok).toBe(true);
			expect(mockJj.gitFetch).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes options when provided', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });

			await jjService.gitFetch('/path/to/repo', { remote: 'upstream', branch: 'main' });

			expect(mockJj.gitFetch).toHaveBeenCalledWith('/path/to/repo', {
				remote: 'upstream',
				branch: 'main',
			});
		});

		test('returns failure result on error', async () => {
			mockJj.gitFetch.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.gitFetch('/path/to/repo');

			expect(result.ok).toBe(false);
		});
	});

	describe('gitPush', () => {
		test('pushes to default remote', async () => {
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			const result = await jjService.gitPush('/path/to/repo');

			expect(result.ok).toBe(true);
			expect(mockJj.gitPush).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes options when provided', async () => {
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			await jjService.gitPush('/path/to/repo', { allBranches: true });

			expect(mockJj.gitPush).toHaveBeenCalledWith('/path/to/repo', { allBranches: true });
		});

		test('returns failure result on error', async () => {
			mockJj.gitPush.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.gitPush('/path/to/repo');

			expect(result.ok).toBe(false);
		});
	});

	describe('gitClone', () => {
		test('clones a git repository', async () => {
			mockJj.gitClone.mockResolvedValue({ ok: true, message: 'Cloned' });

			const result = await jjService.gitClone(
				'/parent/dir',
				'https://github.com/user/repo.git'
			);

			expect(result.ok).toBe(true);
			expect(mockJj.gitClone).toHaveBeenCalledWith(
				'/parent/dir',
				'https://github.com/user/repo.git',
				undefined
			);
		});

		test('passes destination when provided', async () => {
			mockJj.gitClone.mockResolvedValue({ ok: true, message: 'Cloned' });

			await jjService.gitClone('/parent', 'https://example.com/repo.git', 'my-repo');

			expect(mockJj.gitClone).toHaveBeenCalledWith(
				'/parent',
				'https://example.com/repo.git',
				'my-repo'
			);
		});

		test('returns failure result on error', async () => {
			mockJj.gitClone.mockRejectedValue(new Error('IPC error'));

			const result = await jjService.gitClone('/parent', 'https://example.com/repo.git');

			expect(result.ok).toBe(false);
		});
	});

	// ========================================================================
	// Convenience Methods
	// ========================================================================

	describe('commitChanges', () => {
		test('describes and creates new change in sequence', async () => {
			mockJj.describe.mockResolvedValue({ ok: true, message: 'Description set' });
			mockJj.new.mockResolvedValue({
				ok: true,
				changeId: 'newchange',
				message: 'Created new change',
			});

			const result = await jjService.commitChanges('/path/to/repo', 'my commit message');

			expect(result.ok).toBe(true);
			expect(result.changeId).toBe('newchange');
			expect(mockJj.describe).toHaveBeenCalledWith(
				'/path/to/repo',
				'my commit message',
				undefined
			);
			expect(mockJj.new).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('returns early if describe fails', async () => {
			mockJj.describe.mockResolvedValue({
				ok: false,
				message: '',
				error: 'Description failed',
			});

			const result = await jjService.commitChanges('/path/to/repo', 'msg');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('Description failed');
			expect(mockJj.new).not.toHaveBeenCalled();
		});

		test('returns failure if new change fails', async () => {
			mockJj.describe.mockResolvedValue({ ok: true, message: 'Description set' });
			mockJj.new.mockResolvedValue({
				ok: false,
				message: '',
				error: 'New change failed',
			});

			const result = await jjService.commitChanges('/path/to/repo', 'msg');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('New change failed');
		});
	});

	describe('syncWithRemote', () => {
		test('fetches and pushes in sequence', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			const result = await jjService.syncWithRemote('/path/to/repo');

			expect(result.fetch.ok).toBe(true);
			expect(result.push.ok).toBe(true);
			expect(mockJj.gitFetch).toHaveBeenCalledWith('/path/to/repo', undefined);
			expect(mockJj.gitPush).toHaveBeenCalledWith('/path/to/repo', undefined);
		});

		test('passes remote option to both operations', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			await jjService.syncWithRemote('/path/to/repo', { remote: 'upstream' });

			expect(mockJj.gitFetch).toHaveBeenCalledWith('/path/to/repo', { remote: 'upstream' });
			expect(mockJj.gitPush).toHaveBeenCalledWith('/path/to/repo', { remote: 'upstream' });
		});

		test('skips push if fetch fails', async () => {
			mockJj.gitFetch.mockResolvedValue({
				ok: false,
				message: '',
				error: 'Fetch failed',
			});

			const result = await jjService.syncWithRemote('/path/to/repo');

			expect(result.fetch.ok).toBe(false);
			expect(result.push.ok).toBe(false);
			expect(result.push.error).toBe('Skipped: fetch failed');
			expect(mockJj.gitPush).not.toHaveBeenCalled();
		});
	});
});

// ============================================================================
// Timeout Utility Tests
// ============================================================================

describe('withTimeout', () => {
	test('resolves when promise settles before timeout', async () => {
		const promise = Promise.resolve('success');

		const result = await withTimeout(promise, 1000, 'test op');

		expect(result).toBe('success');
	});

	test('rejects with timeout error when promise exceeds timeout', async () => {
		const promise = new Promise<string>((resolve) => {
			setTimeout(() => resolve('too late'), 500);
		});

		await expect(withTimeout(promise, 50, 'slow op')).rejects.toThrow(
			'slow op timed out after 50ms'
		);
	});

	test('propagates original error when promise rejects before timeout', async () => {
		const promise = Promise.reject(new Error('original error'));

		await expect(withTimeout(promise, 1000, 'test op')).rejects.toThrow('original error');
	});
});

// ============================================================================
// Timeout-Aware Service Tests
// ============================================================================

describe('jjServiceWithTimeout', () => {
	describe('gitFetch', () => {
		test('resolves normally when fetch completes in time', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });

			const result = await jjServiceWithTimeout.gitFetch('/path/to/repo');

			expect(result.ok).toBe(true);
		});

		test('rejects when fetch exceeds custom timeout', async () => {
			mockJj.gitFetch.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: '' }), 500))
			);

			await expect(
				jjServiceWithTimeout.gitFetch('/path/to/repo', undefined, 50)
			).rejects.toThrow('jj git fetch timed out after 50ms');
		});
	});

	describe('gitPush', () => {
		test('resolves normally when push completes in time', async () => {
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			const result = await jjServiceWithTimeout.gitPush('/path/to/repo');

			expect(result.ok).toBe(true);
		});

		test('rejects when push exceeds custom timeout', async () => {
			mockJj.gitPush.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: '' }), 500))
			);

			await expect(
				jjServiceWithTimeout.gitPush('/path/to/repo', undefined, 50)
			).rejects.toThrow('jj git push timed out after 50ms');
		});
	});

	describe('gitClone', () => {
		test('resolves normally when clone completes in time', async () => {
			mockJj.gitClone.mockResolvedValue({ ok: true, message: 'Cloned' });

			const result = await jjServiceWithTimeout.gitClone(
				'/parent',
				'https://example.com/repo.git'
			);

			expect(result.ok).toBe(true);
		});

		test('rejects when clone exceeds custom timeout', async () => {
			mockJj.gitClone.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: '' }), 500))
			);

			await expect(
				jjServiceWithTimeout.gitClone('/parent', 'https://example.com/repo.git', undefined, 50)
			).rejects.toThrow('jj git clone timed out after 50ms');
		});
	});

	describe('syncWithRemote', () => {
		test('resolves normally when sync completes in time', async () => {
			mockJj.gitFetch.mockResolvedValue({ ok: true, message: 'Fetched' });
			mockJj.gitPush.mockResolvedValue({ ok: true, message: 'Pushed' });

			const result = await jjServiceWithTimeout.syncWithRemote('/path/to/repo');

			expect(result.fetch.ok).toBe(true);
			expect(result.push.ok).toBe(true);
		});

		test('rejects when sync exceeds custom timeout', async () => {
			mockJj.gitFetch.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve({ ok: true, message: '' }), 500))
			);

			await expect(
				jjServiceWithTimeout.syncWithRemote('/path/to/repo', undefined, 50)
			).rejects.toThrow('jj sync with remote timed out after 50ms');
		});
	});
});
