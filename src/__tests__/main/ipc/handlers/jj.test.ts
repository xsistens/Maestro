/**
 * Tests for the Jujutsu (jj) IPC handlers
 *
 * These tests verify the jj-related IPC handlers that provide
 * jj operations used across the application.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerJjHandlers } from '../../../../main/ipc/handlers/jj';
import * as execFile from '../../../../main/utils/execFile';

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

describe('Jj IPC handlers', () => {
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

	describe('registration', () => {
		it('should register all 19 jj handlers', () => {
			const expectedChannels = [
				'jj:isInstalled',
				'jj:getVersion',
				'jj:isRepo',
				'jj:getStatus',
				'jj:getBranches',
				'jj:getCurrentChange',
				'jj:getRepoRoot',
				// Operational handlers
				'jj:diff',
				'jj:show',
				'jj:log',
				'jj:describe',
				'jj:new',
				'jj:squash',
				'jj:abandon',
				'jj:edit',
				// Branch/bookmark management handlers
				'jj:branchCreate',
				'jj:branchDelete',
				'jj:branchSet',
				'jj:branchTrack',
			];

			expect(handlers.size).toBe(19);
			for (const channel of expectedChannels) {
				expect(handlers.has(channel)).toBe(true);
			}
		});
	});

	// ========================================================================
	// jj:diff handler tests
	// ========================================================================
	describe('jj:diff', () => {
		it('should return parsed diff on success', async () => {
			const diffOutput = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old content
+new content`;

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: diffOutput,
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:diff');
			const result = await handler!({} as any, '/test/repo');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith('jj', ['diff'], '/test/repo');
			expect(result.raw).toBe(diffOutput);
			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'file.txt', status: 'M' });
		});

		it('should pass revision argument when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:diff');
			await handler!({} as any, '/test/repo', 'abc123');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['diff', '-r', 'abc123'],
				'/test/repo'
			);
		});

		it('should return empty result on failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: not a jj repo',
				exitCode: 1,
			});

			const handler = handlers.get('jj:diff');
			const result = await handler!({} as any, '/test/repo');

			expect(result).toEqual({ raw: '', files: [] });
		});

		it('should detect added files in diff', async () => {
			const diffOutput = `diff --git a/new-file.txt b/new-file.txt
--- /dev/null
+++ b/new-file.txt
@@ -0,0 +1 @@
+new content`;

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: diffOutput,
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:diff');
			const result = await handler!({} as any, '/test/repo');

			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'new-file.txt', status: 'A' });
		});

		it('should detect deleted files in diff', async () => {
			const diffOutput = `diff --git a/old-file.txt b/old-file.txt
--- a/old-file.txt
+++ /dev/null
@@ -1 +0,0 @@
-old content`;

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: diffOutput,
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:diff');
			const result = await handler!({} as any, '/test/repo');

			expect(result.files).toHaveLength(1);
			expect(result.files[0]).toEqual({ path: 'old-file.txt', status: 'D' });
		});
	});

	// ========================================================================
	// jj:show handler tests
	// ========================================================================
	describe('jj:show', () => {
		it('should return change details and diff on success', async () => {
			// First call: jj log for metadata
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce({
					stdout: 'abc123\x1fdef456\x1fMy change\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1fmain\n',
					stderr: '',
					exitCode: 0,
				})
				// Second call: jj diff for the change
				.mockResolvedValueOnce({
					stdout: 'diff content here',
					stderr: '',
					exitCode: 0,
				});

			const handler = handlers.get('jj:show');
			const result = await handler!({} as any, '/test/repo', 'abc123');

			expect(result).not.toBeNull();
			expect(result.change.changeId).toBe('abc123');
			expect(result.change.commitId).toBe('def456');
			expect(result.change.description).toBe('My change');
			expect(result.diff).toBe('diff content here');
		});

		it('should default to @ revision when no changeId provided', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce({
					stdout: 'abc123\x1fdef456\x1f\x1ftrue\x1f\x1f\x1f\x1f\n',
					stderr: '',
					exitCode: 0,
				})
				.mockResolvedValueOnce({
					stdout: '',
					stderr: '',
					exitCode: 0,
				});

			const handler = handlers.get('jj:show');
			await handler!({} as any, '/test/repo');

			// First call should use @ as revision
			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				expect.arrayContaining(['-r', '@']),
				'/test/repo'
			);
		});

		it('should return null on log failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: revision not found',
				exitCode: 1,
			});

			const handler = handlers.get('jj:show');
			const result = await handler!({} as any, '/test/repo', 'nonexistent');

			expect(result).toBeNull();
		});

		it('should return empty diff when diff command fails', async () => {
			vi.mocked(execFile.execFileNoThrow)
				.mockResolvedValueOnce({
					stdout: 'abc123\x1fdef456\x1fChange\x1ffalse\x1f\x1f\x1f\x1f\n',
					stderr: '',
					exitCode: 0,
				})
				.mockResolvedValueOnce({
					stdout: '',
					stderr: 'diff error',
					exitCode: 1,
				});

			const handler = handlers.get('jj:show');
			const result = await handler!({} as any, '/test/repo', 'abc123');

			expect(result).not.toBeNull();
			expect(result.diff).toBe('');
		});
	});

	// ========================================================================
	// jj:log handler tests
	// ========================================================================
	describe('jj:log', () => {
		it('should return parsed log entries on success', async () => {
			const logOutput = [
				'abc123\x1fdef456\x1fFirst change\x1ffalse\x1fJohn\x1fjohn@test.com\x1f2024-01-01\x1fmain',
				'ghi789\x1fjkl012\x1fSecond change\x1ffalse\x1fJane\x1fjane@test.com\x1f2024-01-02\x1f',
			].join('\n');

			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: logOutput,
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:log');
			const result = await handler!({} as any, '/test/repo');

			expect(result.entries).toHaveLength(2);
			expect(result.entries[0].changeId).toBe('abc123');
			expect(result.entries[0].description).toBe('First change');
			expect(result.entries[0].bookmarks).toEqual(['main']);
			expect(result.entries[1].changeId).toBe('ghi789');
			expect(result.entries[1].bookmarks).toEqual([]);
		});

		it('should pass revset option when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:log');
			await handler!({} as any, '/test/repo', { revset: 'main..@' });

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				expect.arrayContaining(['-r', 'main..@']),
				'/test/repo'
			);
		});

		it('should pass limit option when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:log');
			await handler!({} as any, '/test/repo', { limit: 10 });

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				expect.arrayContaining(['-n', '10']),
				'/test/repo'
			);
		});

		it('should return empty entries on failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error',
				exitCode: 1,
			});

			const handler = handlers.get('jj:log');
			const result = await handler!({} as any, '/test/repo');

			expect(result).toEqual({ entries: [] });
		});
	});

	// ========================================================================
	// jj:describe handler tests
	// ========================================================================
	describe('jj:describe', () => {
		it('should set change description successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: 'Working copy now at: abc123 def456 My message',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:describe');
			const result = await handler!({} as any, '/test/repo', 'My message');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['describe', '-m', 'My message'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should pass changeId when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:describe');
			await handler!({} as any, '/test/repo', 'message', 'abc123');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['describe', '-m', 'message', '-r', 'abc123'],
				'/test/repo'
			);
		});

		it('should return error on failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: revision not found',
				exitCode: 1,
			});

			const handler = handlers.get('jj:describe');
			const result = await handler!({} as any, '/test/repo', 'message', 'nonexistent');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('Error: revision not found');
		});
	});

	// ========================================================================
	// jj:new handler tests
	// ========================================================================
	describe('jj:new', () => {
		it('should create new change successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Working copy now at: newchange 12345678 (empty) (no description set)',
				exitCode: 0,
			});

			const handler = handlers.get('jj:new');
			const result = await handler!({} as any, '/test/repo');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['new'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
			expect(result.changeId).toBe('newchange');
		});

		it('should pass revision when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Working copy now at: xyz789 abcdef01',
				exitCode: 0,
			});

			const handler = handlers.get('jj:new');
			await handler!({} as any, '/test/repo', 'main');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['new', 'main'],
				'/test/repo'
			);
		});

		it('should return error on failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: immutable revision',
				exitCode: 1,
			});

			const handler = handlers.get('jj:new');
			const result = await handler!({} as any, '/test/repo');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('Error: immutable revision');
		});
	});

	// ========================================================================
	// jj:squash handler tests
	// ========================================================================
	describe('jj:squash', () => {
		it('should squash changes successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Rebased 1 descendant commits',
				exitCode: 0,
			});

			const handler = handlers.get('jj:squash');
			const result = await handler!({} as any, '/test/repo');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['squash'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should pass revision when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: '',
				exitCode: 0,
			});

			const handler = handlers.get('jj:squash');
			await handler!({} as any, '/test/repo', 'abc123');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['squash', '-r', 'abc123'],
				'/test/repo'
			);
		});

		it('should return error on failure', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: nothing to squash',
				exitCode: 1,
			});

			const handler = handlers.get('jj:squash');
			const result = await handler!({} as any, '/test/repo');

			expect(result.ok).toBe(false);
			expect(result.error).toBe('Error: nothing to squash');
		});
	});

	// ========================================================================
	// jj:abandon handler tests
	// ========================================================================
	describe('jj:abandon', () => {
		it('should abandon change successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Abandoned commit abc123',
				exitCode: 0,
			});

			const handler = handlers.get('jj:abandon');
			const result = await handler!({} as any, '/test/repo', 'abc123');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['abandon', 'abc123'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should return error for nonexistent change', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: Revision "nonexistent" doesn\'t exist',
				exitCode: 1,
			});

			const handler = handlers.get('jj:abandon');
			const result = await handler!({} as any, '/test/repo', 'nonexistent');

			expect(result.ok).toBe(false);
			expect(result.error).toContain("doesn't exist");
		});
	});

	// ========================================================================
	// jj:edit handler tests
	// ========================================================================
	describe('jj:edit', () => {
		it('should edit change successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Working copy now at: abc123 def456',
				exitCode: 0,
			});

			const handler = handlers.get('jj:edit');
			const result = await handler!({} as any, '/test/repo', 'abc123');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['edit', 'abc123'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should return error for immutable revision', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: Commit zzzzzzzz is immutable',
				exitCode: 1,
			});

			const handler = handlers.get('jj:edit');
			const result = await handler!({} as any, '/test/repo', 'zzzzzzzz');

			expect(result.ok).toBe(false);
			expect(result.error).toContain('immutable');
		});
	});

	// ========================================================================
	// jj:branchCreate handler tests
	// ========================================================================
	describe('jj:branchCreate', () => {
		it('should create bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Created 1 bookmarks pointing to abc123',
				exitCode: 0,
			});

			const handler = handlers.get('jj:branchCreate');
			const result = await handler!({} as any, '/test/repo', 'my-feature');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'create', 'my-feature'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should pass revision argument when provided', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Created 1 bookmarks pointing to xyz789',
				exitCode: 0,
			});

			const handler = handlers.get('jj:branchCreate');
			await handler!({} as any, '/test/repo', 'my-feature', 'xyz789');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'create', 'my-feature', '-r', 'xyz789'],
				'/test/repo'
			);
		});

		it('should return error when bookmark already exists', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: Bookmark already exists: my-feature',
				exitCode: 1,
			});

			const handler = handlers.get('jj:branchCreate');
			const result = await handler!({} as any, '/test/repo', 'my-feature');

			expect(result.ok).toBe(false);
			expect(result.error).toContain('already exists');
		});
	});

	// ========================================================================
	// jj:branchDelete handler tests
	// ========================================================================
	describe('jj:branchDelete', () => {
		it('should delete bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Deleted 1 bookmarks.',
				exitCode: 0,
			});

			const handler = handlers.get('jj:branchDelete');
			const result = await handler!({} as any, '/test/repo', 'old-branch');

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'delete', 'old-branch'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should return error for nonexistent bookmark', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: "Error: Bookmark doesn't exist: nonexistent",
				exitCode: 1,
			});

			const handler = handlers.get('jj:branchDelete');
			const result = await handler!({} as any, '/test/repo', 'nonexistent');

			expect(result.ok).toBe(false);
			expect(result.error).toContain("doesn't exist");
		});
	});

	// ========================================================================
	// jj:branchSet handler tests
	// ========================================================================
	describe('jj:branchSet', () => {
		it('should set bookmark to specific revision', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Updated 1 bookmarks to abc123',
				exitCode: 0,
			});

			const handler = handlers.get('jj:branchSet');
			const result = await handler!(
				{} as any,
				'/test/repo',
				'main',
				'abc123'
			);

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'set', 'main', '-r', 'abc123'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should return error for invalid revision', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Error: Revision "badrev" doesn\'t exist',
				exitCode: 1,
			});

			const handler = handlers.get('jj:branchSet');
			const result = await handler!(
				{} as any,
				'/test/repo',
				'main',
				'badrev'
			);

			expect(result.ok).toBe(false);
			expect(result.error).toContain("doesn't exist");
		});
	});

	// ========================================================================
	// jj:branchTrack handler tests
	// ========================================================================
	describe('jj:branchTrack', () => {
		it('should track remote bookmark successfully', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: 'Started tracking 1 remote bookmarks.',
				exitCode: 0,
			});

			const handler = handlers.get('jj:branchTrack');
			const result = await handler!(
				{} as any,
				'/test/repo',
				'main@origin'
			);

			expect(execFile.execFileNoThrow).toHaveBeenCalledWith(
				'jj',
				['bookmark', 'track', 'main@origin'],
				'/test/repo'
			);
			expect(result.ok).toBe(true);
		});

		it('should return error for invalid remote bookmark', async () => {
			vi.mocked(execFile.execFileNoThrow).mockResolvedValue({
				stdout: '',
				stderr: "Error: Remote bookmark doesn't exist: nonexistent@origin",
				exitCode: 1,
			});

			const handler = handlers.get('jj:branchTrack');
			const result = await handler!(
				{} as any,
				'/test/repo',
				'nonexistent@origin'
			);

			expect(result.ok).toBe(false);
			expect(result.error).toContain("doesn't exist");
		});
	});
});
