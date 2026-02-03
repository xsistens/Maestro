/**
 * Integration tests for Jujutsu (jj) IPC handlers.
 *
 * These tests verify the full integration chain:
 *   handler invocation → command execution (mocked) → output parsing → error detection
 *
 * Unlike the unit tests in src/__tests__/main/ipc/handlers/jj.test.ts which
 * test individual handlers in isolation, these integration tests use realistic
 * fixture data and verify cross-cutting concerns:
 *   - Structured error detection flowing through failedResult() → jjError field
 *   - Complex multi-line output parsing through handlers
 *   - End-to-end handler → parser integration with fixture data
 *   - Edge cases: empty repos, multi-file diffs, large logs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerJjHandlers } from '../../../../main/ipc/handlers/jj';
import * as execFile from '../../../../main/utils/execFile';
import * as fixtures from './fixtures/jj-outputs';

// Mock electron's ipcMain
vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

// Mock the execFile module
vi.mock('../../../../main/utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

// Mock the logger
vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
	default: {
		stat: vi.fn(),
	},
}));

/** Helper to create mock exec result */
function mockExecResult(stdout: string, stderr = '', exitCode = 0) {
	return { stdout, stderr, exitCode };
}

/** Helper to create a failure exec result */
function mockExecFailure(stderr: string, stdout = '') {
	return { stdout, stderr, exitCode: 1 };
}

describe('Jj IPC Handler Integration Tests', () => {
	let handlers: Map<string, Function>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Capture all registered handlers
		handlers = new Map();
		vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
			handlers.set(channel, handler);
		});

		registerJjHandlers();
	});

	afterEach(() => {
		handlers.clear();
	});

	// Helper to invoke a handler (mimics ipcMain.handle calling convention)
	function invoke(channel: string, ...args: unknown[]) {
		const handler = handlers.get(channel);
		if (!handler) throw new Error(`Handler not found: ${channel}`);
		return handler({} as any, ...args);
	}

	// ========================================================================
	// Fixture-based diff parsing through handlers
	// ========================================================================
	describe('diff handler with fixture data', () => {
		it('should parse single-file modification diff from fixture', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_SINGLE_MODIFIED)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.raw).toBe(fixtures.JJ_DIFF_SINGLE_MODIFIED);
			expect(result.files).toHaveLength(1);
			expect(result.files[0].path).toBe('src/main.ts');
			expect(result.files[0].status).toBe('M');
		});

		it('should parse new file diff from fixture', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_NEW_FILE)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.files).toHaveLength(1);
			expect(result.files[0].path).toBe('src/new-feature.ts');
			expect(result.files[0].status).toBe('A');
		});

		it('should parse deleted file diff from fixture', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_DELETED_FILE)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.files).toHaveLength(1);
			expect(result.files[0].path).toBe('src/deprecated.ts');
			expect(result.files[0].status).toBe('D');
		});

		it('should parse multi-file diff with add, modify, and delete', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_MULTI_FILE)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.files).toHaveLength(3);

			const byPath = Object.fromEntries(
				result.files.map((f: { path: string; status: string }) => [f.path, f.status])
			);
			expect(byPath['src/main.ts']).toBe('M');
			expect(byPath['src/new-module.ts']).toBe('A');
			expect(byPath['src/old-module.ts']).toBe('D');
		});

		it('should handle empty diff (no changes)', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_EMPTY)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.raw).toBe('');
			expect(result.files).toEqual([]);
		});
	});

	// ========================================================================
	// Fixture-based log parsing through handlers
	// ========================================================================
	describe('log handler with fixture data', () => {
		it('should parse single log entry with all fields', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_LOG_SINGLE)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toHaveLength(1);
			const entry = result.entries[0];
			expect(entry.changeId).toBe('yqosmzpn');
			expect(entry.commitId).toBe('3f2a8b1cdef456');
			expect(entry.description).toBe('add new feature');
			expect(entry.isEmpty).toBe(false);
			expect(entry.author).toBe('John Doe');
			expect(entry.email).toBe('john@example.com');
			expect(entry.timestamp).toContain('2024-06-15');
			expect(entry.bookmarks).toEqual(['main']);
		});

		it('should parse multiple log entries preserving order', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_LOG_MULTIPLE)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toHaveLength(3);
			expect(result.entries[0].changeId).toBe('yqosmzpn');
			expect(result.entries[1].changeId).toBe('rlvkpnrz');
			expect(result.entries[2].changeId).toBe('sqptruyz');

			// Verify different authors
			expect(result.entries[0].author).toBe('John Doe');
			expect(result.entries[1].author).toBe('Jane Smith');
		});

		it('should parse empty change with isEmpty=true', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_LOG_EMPTY_CHANGE)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].isEmpty).toBe(true);
			expect(result.entries[0].description).toBe('');
		});

		it('should parse entry with multiple bookmarks', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_LOG_MULTI_BOOKMARK)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].bookmarks).toEqual(['main', 'release-1.0', 'latest']);
		});

		it('should pass revset and limit options to jj command', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_LOG_SINGLE)
			);

			await invoke('jj:log', '/test/repo', { revset: 'trunk()..@', limit: 5 });

			const callArgs = vi.mocked(execFile.execFileNoThrow).mock.calls[0];
			expect(callArgs[1]).toContain('-r');
			expect(callArgs[1]).toContain('trunk()..@');
			expect(callArgs[1]).toContain('-n');
			expect(callArgs[1]).toContain('5');
		});

		it('should return empty entries for failed log', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecFailure(fixtures.JJ_ERROR_NOT_A_REPO)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result).toEqual({ entries: [] });
		});
	});

	// ========================================================================
	// Show handler with fixture-based output
	// ========================================================================
	describe('show handler with fixture data', () => {
		it('should combine log metadata with diff output', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_LOG_SINGLE))
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_DIFF_SINGLE_MODIFIED));

			const result = await invoke('jj:show', '/test/repo', 'yqosmzpn');

			expect(result).not.toBeNull();
			expect(result.change.changeId).toBe('yqosmzpn');
			expect(result.change.description).toBe('add new feature');
			expect(result.change.bookmarks).toEqual(['main']);
			expect(result.diff).toBe(fixtures.JJ_DIFF_SINGLE_MODIFIED);
		});

		it('should return empty diff string when diff command fails', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_LOG_SINGLE))
				.mockResolvedValueOnce(mockExecFailure('diff failed'));

			const result = await invoke('jj:show', '/test/repo', 'yqosmzpn');

			expect(result).not.toBeNull();
			expect(result.change.changeId).toBe('yqosmzpn');
			expect(result.diff).toBe('');
		});

		it('should return null when log command returns empty', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('')
			);

			const result = await invoke('jj:show', '/test/repo', 'nonexistent');

			expect(result).toBeNull();
		});

		it('should use @ as default revision', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_LOG_SINGLE))
				.mockResolvedValueOnce(mockExecResult(''));

			await invoke('jj:show', '/test/repo');

			const firstCall = vi.mocked(execFile.execFileNoThrow).mock.calls[0];
			expect(firstCall[1]).toContain('@');
		});
	});

	// ========================================================================
	// Mutation handlers with structured error detection
	// ========================================================================
	describe('mutation handlers with structured error detection', () => {
		describe('jj:describe', () => {
			it('should return ok on success with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult(fixtures.JJ_DESCRIBE_SUCCESS)
				);

				const result = await invoke('jj:describe', '/test/repo', 'fix: resolve parsing bug');

				expect(result.ok).toBe(true);
				expect(result.message).toContain('fix: resolve parsing bug');
			});

			it('should detect immutable change error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_IMMUTABLE)
				);

				const result = await invoke('jj:describe', '/test/repo', 'msg', 'rlvkpnrz');

				expect(result.ok).toBe(false);
				expect(result.error).toContain('immutable');
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('immutable_change');
				expect(result.jjError?.recoverable).toBe(false);
			});

			it('should detect missing revision error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_MISSING_REVISION)
				);

				const result = await invoke('jj:describe', '/test/repo', 'msg', 'nonexistent');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('missing_change');
			});
		});

		describe('jj:new', () => {
			it('should extract changeId from success output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_NEW_SUCCESS, 0)
				);

				const result = await invoke('jj:new', '/test/repo');

				expect(result.ok).toBe(true);
				expect(result.changeId).toBe('xyzpqrmn');
			});

			it('should pass revision argument', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_NEW_FROM_REVISION, 0)
				);

				await invoke('jj:new', '/test/repo', 'main');

				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['new', 'main'],
					'/test/repo'
				);
			});

			it('should detect concurrent operation error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_CONCURRENT_OP)
				);

				const result = await invoke('jj:new', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('concurrent_operation');
				expect(result.jjError?.recoverable).toBe(true);
			});
		});

		describe('jj:squash', () => {
			it('should return ok on success with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_SQUASH_SUCCESS, 0)
				);

				const result = await invoke('jj:squash', '/test/repo');

				expect(result.ok).toBe(true);
				expect(result.message).toContain('Rebased');
			});

			it('should detect stale working copy error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_STALE_WORKING_COPY)
				);

				const result = await invoke('jj:squash', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('stale_working_copy');
				expect(result.jjError?.recoverable).toBe(true);
			});
		});

		describe('jj:abandon', () => {
			it('should return ok on success with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_ABANDON_SUCCESS, 0)
				);

				const result = await invoke('jj:abandon', '/test/repo', 'yqosmzpn');

				expect(result.ok).toBe(true);
			});

			it('should handle abandon with descendants', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_ABANDON_WITH_DESCENDANTS, 0)
				);

				const result = await invoke('jj:abandon', '/test/repo', 'yqosmzpn');

				expect(result.ok).toBe(true);
				expect(result.message).toContain('Rebased 2 descendant');
			});

			it('should detect immutable change error on abandon', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure('Cannot abandon the root commit')
				);

				const result = await invoke('jj:abandon', '/test/repo', 'zzzzzzzz');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('immutable_change');
			});
		});

		describe('jj:edit', () => {
			it('should return ok on success with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_EDIT_SUCCESS, 0)
				);

				const result = await invoke('jj:edit', '/test/repo', 'rlvkpnrz');

				expect(result.ok).toBe(true);
			});

			it('should detect immutable revision error on edit', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_IMMUTABLE)
				);

				const result = await invoke('jj:edit', '/test/repo', 'rlvkpnrz');

				expect(result.ok).toBe(false);
				expect(result.jjError?.type).toBe('immutable_change');
				expect(result.jjError?.recoverable).toBe(false);
			});
		});
	});

	// ========================================================================
	// Branch/bookmark handlers with structured error detection
	// ========================================================================
	describe('bookmark handlers with structured error detection', () => {
		it('should create bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', fixtures.JJ_BOOKMARK_CREATE_SUCCESS, 0)
			);

			const result = await invoke('jj:branchCreate', '/test/repo', 'feature-y');

			expect(result.ok).toBe(true);
			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'create', 'feature-y'],
				'/test/repo'
			);
		});

		it('should create bookmark at specific revision', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', fixtures.JJ_BOOKMARK_CREATE_SUCCESS, 0)
			);

			await invoke('jj:branchCreate', '/test/repo', 'feature-y', 'rlvkpnrz');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'create', 'feature-y', '-r', 'rlvkpnrz'],
				'/test/repo'
			);
		});

		it('should detect bookmark already exists error', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecFailure(fixtures.JJ_ERROR_BOOKMARK_EXISTS)
			);

			const result = await invoke('jj:branchCreate', '/test/repo', 'main');

			expect(result.ok).toBe(false);
			expect(result.jjError).not.toBeNull();
			expect(result.jjError?.type).toBe('bookmark_error');
			expect(result.jjError?.message).toContain('main');
		});

		it('should delete bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', fixtures.JJ_BOOKMARK_DELETE_SUCCESS, 0)
			);

			const result = await invoke('jj:branchDelete', '/test/repo', 'old-branch');

			expect(result.ok).toBe(true);
		});

		it('should detect no such bookmark error on delete', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecFailure(fixtures.JJ_ERROR_NO_SUCH_BOOKMARK)
			);

			const result = await invoke('jj:branchDelete', '/test/repo', 'nonexistent-branch');

			expect(result.ok).toBe(false);
			expect(result.jjError?.type).toBe('bookmark_error');
		});

		it('should set bookmark to revision', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', fixtures.JJ_BOOKMARK_SET_SUCCESS, 0)
			);

			const result = await invoke('jj:branchSet', '/test/repo', 'main', 'rlvkpnrz');

			expect(result.ok).toBe(true);
			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'set', 'main', '-r', 'rlvkpnrz'],
				'/test/repo'
			);
		});

		it('should track remote bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', fixtures.JJ_BOOKMARK_TRACK_SUCCESS, 0)
			);

			const result = await invoke('jj:branchTrack', '/test/repo', 'main@origin');

			expect(result.ok).toBe(true);
		});

		it('should detect untracked remote bookmark error', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecFailure(fixtures.JJ_ERROR_REMOTE_BOOKMARK_NOT_TRACKED)
			);

			const result = await invoke('jj:branchTrack', '/test/repo', 'main@origin');

			expect(result.ok).toBe(false);
			expect(result.jjError?.type).toBe('bookmark_error');
		});
	});

	// ========================================================================
	// Git interop handlers with structured error detection
	// ========================================================================
	describe('git interop handlers with structured error detection', () => {
		describe('jj:gitFetch', () => {
			it('should fetch from default remote with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_FETCH_SUCCESS, 0)
				);

				const result = await invoke('jj:gitFetch', '/test/repo');

				expect(result.ok).toBe(true);
				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'fetch'],
					'/test/repo'
				);
			});

			it('should pass remote and branch options', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_FETCH_WITH_UPDATES, 0)
				);

				await invoke('jj:gitFetch', '/test/repo', {
					remote: 'upstream',
					branch: 'develop',
				});

				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'fetch', '--remote', 'upstream', '--branch', 'develop'],
					'/test/repo'
				);
			});

			it('should detect auth failure with credential helper error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_AUTH_FAILURE)
				);

				const result = await invoke('jj:gitFetch', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('auth_failure');
				expect(result.jjError?.recoverable).toBe(true);
			});

			it('should detect SSH auth failure', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_SSH_AUTH)
				);

				const result = await invoke('jj:gitFetch', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError?.type).toBe('auth_failure');
			});

			it('should detect not-a-repo error during fetch', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_NOT_A_REPO)
				);

				const result = await invoke('jj:gitFetch', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError?.type).toBe('not_a_repo');
			});
		});

		describe('jj:gitPush', () => {
			it('should push to default remote with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_PUSH_SUCCESS, 0)
				);

				const result = await invoke('jj:gitPush', '/test/repo');

				expect(result.ok).toBe(true);
			});

			it('should pass --all flag when allBranches is true', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_PUSH_SUCCESS, 0)
				);

				await invoke('jj:gitPush', '/test/repo', { allBranches: true });

				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'push', '--all'],
					'/test/repo'
				);
			});

			it('should pass remote and branch options', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', '', 0)
				);

				await invoke('jj:gitPush', '/test/repo', {
					remote: 'upstream',
					branch: 'feature-x',
				});

				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'push', '--remote', 'upstream', '--branch', 'feature-x'],
					'/test/repo'
				);
			});

			it('should detect auth failure on push', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_SSH_AUTH)
				);

				const result = await invoke('jj:gitPush', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.jjError?.type).toBe('auth_failure');
			});

			it('should handle push rejection without structured error', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_PUSH_REJECTION)
				);

				const result = await invoke('jj:gitPush', '/test/repo');

				expect(result.ok).toBe(false);
				expect(result.error).toContain('failed to push');
				// Generic push error may not match jj-specific patterns
			});
		});

		describe('jj:gitClone', () => {
			it('should clone repository with fixture output', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_CLONE_SUCCESS, 0)
				);

				const result = await invoke(
					'jj:gitClone',
					'/test/target',
					'https://github.com/user/repo.git'
				);

				expect(result.ok).toBe(true);
				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'clone', 'https://github.com/user/repo.git'],
					'/test/target'
				);
			});

			it('should pass destination argument', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('', fixtures.JJ_GIT_CLONE_SUCCESS, 0)
				);

				await invoke(
					'jj:gitClone',
					'/test/target',
					'https://github.com/user/repo.git',
					'custom-dir'
				);

				expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
					'jj',
					['git', 'clone', 'https://github.com/user/repo.git', 'custom-dir'],
					'/test/target'
				);
			});

			it('should detect auth failure on clone', async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_AUTH_FAILURE)
				);

				const result = await invoke(
					'jj:gitClone',
					'/test/target',
					'https://github.com/private/repo.git'
				);

				expect(result.ok).toBe(false);
				expect(result.jjError?.type).toBe('auth_failure');
			});
		});
	});

	// ========================================================================
	// Cross-cutting: every error category through mutation handlers
	// ========================================================================
	describe('structured error detection across all error categories', () => {
		const errorCases: Array<{
			name: string;
			stderr: string;
			expectedType: string;
			expectedRecoverable: boolean;
		}> = [
			{
				name: 'stale working copy',
				stderr: fixtures.JJ_ERROR_STALE_WORKING_COPY,
				expectedType: 'stale_working_copy',
				expectedRecoverable: true,
			},
			{
				name: 'conflict detection',
				stderr: fixtures.JJ_ERROR_CONFLICTS,
				expectedType: 'conflict',
				expectedRecoverable: false,
			},
			{
				name: 'missing revision',
				stderr: fixtures.JJ_ERROR_MISSING_REVISION,
				expectedType: 'missing_change',
				expectedRecoverable: false,
			},
			{
				name: 'authentication failure',
				stderr: fixtures.JJ_ERROR_AUTH_FAILURE,
				expectedType: 'auth_failure',
				expectedRecoverable: true,
			},
			{
				name: 'concurrent operation',
				stderr: fixtures.JJ_ERROR_CONCURRENT_OP,
				expectedType: 'concurrent_operation',
				expectedRecoverable: true,
			},
			{
				name: 'immutable change',
				stderr: fixtures.JJ_ERROR_IMMUTABLE,
				expectedType: 'immutable_change',
				expectedRecoverable: false,
			},
			{
				name: 'bookmark error',
				stderr: fixtures.JJ_ERROR_BOOKMARK_EXISTS,
				expectedType: 'bookmark_error',
				expectedRecoverable: false,
			},
			{
				name: 'not a repo',
				stderr: fixtures.JJ_ERROR_NOT_A_REPO,
				expectedType: 'not_a_repo',
				expectedRecoverable: false,
			},
		];

		for (const { name, stderr, expectedType, expectedRecoverable } of errorCases) {
			it(`should detect ${name} error flowing through handler's failedResult()`, async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(stderr)
				);

				// Use jj:describe as a representative mutation handler
				const result = await invoke('jj:describe', '/test/repo', 'test msg');

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe(expectedType);
				expect(result.jjError?.recoverable).toBe(expectedRecoverable);
				expect(result.jjError?.raw).toBe(stderr);
			});
		}

		it('should set jjError to null for unrecognized errors', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecFailure('Some completely unknown error output')
			);

			const result = await invoke('jj:describe', '/test/repo', 'test msg');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('Some completely unknown error output');
			expect(result.jjError).toBeNull();
		});
	});

	// ========================================================================
	// Error detection through all mutation handler types
	// ========================================================================
	describe('error detection through each mutation handler', () => {
		const mutationHandlers: Array<{
			channel: string;
			args: unknown[];
		}> = [
			{ channel: 'jj:describe', args: ['/test/repo', 'msg'] },
			{ channel: 'jj:new', args: ['/test/repo'] },
			{ channel: 'jj:squash', args: ['/test/repo'] },
			{ channel: 'jj:abandon', args: ['/test/repo', 'abc123'] },
			{ channel: 'jj:edit', args: ['/test/repo', 'abc123'] },
			{ channel: 'jj:branchCreate', args: ['/test/repo', 'branch-name'] },
			{ channel: 'jj:branchDelete', args: ['/test/repo', 'branch-name'] },
			{ channel: 'jj:branchSet', args: ['/test/repo', 'branch-name', 'rev'] },
			{ channel: 'jj:branchTrack', args: ['/test/repo', 'main@origin'] },
			{ channel: 'jj:gitFetch', args: ['/test/repo'] },
			{ channel: 'jj:gitPush', args: ['/test/repo'] },
			{ channel: 'jj:gitClone', args: ['/test/repo', 'https://example.com/repo.git'] },
		];

		for (const { channel, args } of mutationHandlers) {
			it(`${channel} should include jjError in failure response`, async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecFailure(fixtures.JJ_ERROR_IMMUTABLE)
				);

				const result = await invoke(channel, ...args);

				expect(result.ok).toBe(false);
				expect(result.jjError).not.toBeNull();
				expect(result.jjError?.type).toBe('immutable_change');
			});

			it(`${channel} should return ok=true on success`, async () => {
				vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
					mockExecResult('Success output', 'Working copy now at: abc123 def456', 0)
				);

				const result = await invoke(channel, ...args);

				expect(result.ok).toBe(true);
			});
		}
	});

	// ========================================================================
	// Edge cases and boundary conditions
	// ========================================================================
	describe('edge cases', () => {
		it('diff handler should handle binary file markers gracefully', async () => {
			const binaryDiff = `diff --git a/image.png b/image.png
Binary file has changed`;

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(binaryDiff)
			);

			const result = await invoke('jj:diff', '/test/repo');

			// Should still have the raw output
			expect(result.raw).toContain('Binary file');
		});

		it('log handler should handle entries with newlines in description', async () => {
			// JJ_LOG_TEMPLATE uses \n as line separator, descriptions are single-line
			// but test that extra whitespace is trimmed
			const logOutput = 'abc123\x1fdef456\x1f  padded description  \x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1f\n';

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(logOutput)
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].description).toBe('padded description');
		});

		it('log handler should handle empty stdout gracefully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('')
			);

			const result = await invoke('jj:log', '/test/repo');

			expect(result.entries).toEqual([]);
		});

		it('diff handler should preserve raw output exactly', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult(fixtures.JJ_DIFF_MULTI_FILE)
			);

			const result = await invoke('jj:diff', '/test/repo');

			expect(result.raw).toBe(fixtures.JJ_DIFF_MULTI_FILE);
		});

		it('show handler should handle log returning multiple entries (uses first)', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_LOG_MULTIPLE))
				.mockResolvedValueOnce(mockExecResult(fixtures.JJ_DIFF_SINGLE_MODIFIED));

			const result = await invoke('jj:show', '/test/repo', 'yqosmzpn');

			expect(result).not.toBeNull();
			// Should use the first entry from the log
			expect(result.change.changeId).toBe('yqosmzpn');
		});

		it('new handler should handle stderr without "Working copy" pattern', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue(
				mockExecResult('', 'Rebased 1 commits', 0)
			);

			const result = await invoke('jj:new', '/test/repo');

			expect(result.ok).toBe(true);
			// changeId should be undefined since the pattern didn't match
			expect(result.changeId).toBeUndefined();
		});
	});
});
