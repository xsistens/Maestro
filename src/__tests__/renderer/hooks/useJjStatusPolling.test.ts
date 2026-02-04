/**
 * @file useJjStatusPolling.test.ts
 * @description Unit tests for the useJjStatusPolling hook
 *
 * Tests cover:
 * - Polling jj sessions and returning status data
 * - Clearing status when no jj sessions remain
 * - Skipping non-jj sessions
 * - Returning detailed data for active session
 * - Pausing when document is hidden
 * - Polling when pauseWhenHidden is disabled
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJjStatusPolling } from '../../../renderer/hooks/jj/useJjStatusPolling';
import type { Session } from '../../../renderer/types';
import { jjService } from '../../../renderer/services/jj';

vi.mock('../../../renderer/services/jj', () => ({
	jjService: {
		getStatus: vi.fn(),
		getCurrentChange: vi.fn(),
		getDiff: vi.fn(),
	},
}));

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
	id: 'session-1',
	name: 'Test Session',
	toolType: 'claude-code',
	state: 'idle',
	cwd: '/test/project',
	fullPath: '/test/project',
	projectRoot: '/test/project',
	aiLogs: [],
	shellLogs: [],
	workLog: [],
	contextUsage: 0,
	inputMode: 'ai',
	aiPid: 0,
	terminalPid: 0,
	port: 0,
	isLive: false,
	changedFiles: [],
	isGitRepo: false,
	fileTree: [],
	fileExplorerExpanded: [],
	fileExplorerScrollPos: 0,
	executionQueue: [],
	activeTimeMs: 0,
	aiTabs: [],
	activeTabId: 'tab-1',
	closedTabHistory: [],
	...overrides,
});

const setDocumentHidden = (hidden: boolean) => {
	Object.defineProperty(document, 'hidden', {
		configurable: true,
		value: hidden,
	});
};

const mockJjStatus = {
	files: [
		{ path: 'src/main.ts', status: 'M' as const },
		{ path: 'src/new.ts', status: 'A' as const },
	],
	workingCopyChangeId: 'abcdef1234567890',
	workingCopyCommitId: 'deadbeef12345678',
	workingCopyDescription: 'work in progress',
	workingCopyEmpty: false,
	parentChangeId: 'parent123456',
	parentCommitId: 'parentbeef1234',
	parentDescription: 'previous change',
	parentEmpty: false,
	hasConflicts: false,
	conflictedFiles: [],
};

const mockCurrentChange = {
	changeId: 'abcdef1234567890',
	commitId: 'deadbeef12345678',
	description: 'work in progress',
	isEmpty: false,
	bookmarks: ['main'],
};

const mockDiff = {
	raw: '+added line\n-removed line\n context line\n+another add',
	files: [
		{ path: 'src/main.ts', status: 'M' as const },
		{ path: 'src/new.ts', status: 'A' as const },
	],
};

describe('useJjStatusPolling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setDocumentHidden(false);
	});

	afterEach(() => {
		setDocumentHidden(false);
	});

	it('polls jj sessions and returns status data', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);
		vi.mocked(jjService.getDiff).mockResolvedValue(mockDiff);

		const sessions = [
			createMockSession({ id: 'jj-session', vcsType: 'jj' }),
		];

		const { result } = renderHook(() =>
			useJjStatusPolling(sessions, { activeSessionId: 'jj-session' })
		);

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		const data = result.current.jjStatusMap.get('jj-session')!;
		expect(data.fileCount).toBe(2);
		expect(data.branch).toBe('main'); // Uses bookmark name
		expect(data.changeId).toBe('abcdef1234567890');
		expect(data.commitId).toBe('deadbeef12345678');
		expect(data.description).toBe('work in progress');
		expect(data.isEmpty).toBe(false);
		expect(data.hasConflicts).toBe(false);
		expect(data.bookmarks).toEqual(['main']);
		// Active session gets diff stats
		expect(data.totalAdditions).toBe(2); // +added line, +another add
		expect(data.totalDeletions).toBe(1); // -removed line
		expect(data.fileChanges).toHaveLength(2);
	});

	it('returns short change ID as branch when no bookmarks exist', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue({
			...mockCurrentChange,
			bookmarks: [],
		});

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result } = renderHook(() => useJjStatusPolling(sessions));

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		const data = result.current.jjStatusMap.get('jj-session')!;
		expect(data.branch).toBe('abcdef12'); // First 8 chars of change ID
	});

	it('clears status map when no jj sessions remain', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const initialSessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result, rerender } = renderHook(
			({ sessions }) => useJjStatusPolling(sessions),
			{ initialProps: { sessions: initialSessions } }
		);

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		// Remove jj sessions
		rerender({ sessions: [createMockSession({ id: 'jj-session', vcsType: undefined })] });

		await act(async () => {
			await result.current.refreshJjStatus();
		});

		expect(result.current.jjStatusMap.size).toBe(0);
	});

	it('skips non-jj sessions (git sessions)', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const sessions = [
			createMockSession({ id: 'git-session', isGitRepo: true, vcsType: 'git' }),
			createMockSession({ id: 'jj-session', vcsType: 'jj' }),
		];

		const { result } = renderHook(() => useJjStatusPolling(sessions));

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		// Only jj session should be in the map
		expect(result.current.jjStatusMap.has('git-session')).toBe(false);
		expect(result.current.jjStatusMap.has('jj-session')).toBe(true);
	});

	it('returns lightweight data for non-active sessions', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result } = renderHook(() =>
			useJjStatusPolling(sessions, { activeSessionId: 'other-session' })
		);

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		const data = result.current.jjStatusMap.get('jj-session')!;
		// Non-active session should NOT have diff data
		expect(data.fileChanges).toBeUndefined();
		expect(data.totalAdditions).toBe(0);
		expect(data.totalDeletions).toBe(0);
		// But should still have basic info
		expect(data.fileCount).toBe(2);
		expect(data.changeId).toBe('abcdef1234567890');
		// getDiff should NOT have been called since there's no active jj session
		expect(jjService.getDiff).not.toHaveBeenCalled();
	});

	it('pauses polling when document is hidden', async () => {
		setDocumentHidden(true);

		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		renderHook(() => useJjStatusPolling(sessions));

		// Wait a bit - getStatus should NOT be called while hidden
		await new Promise((r) => setTimeout(r, 50));
		expect(jjService.getStatus).not.toHaveBeenCalled();
	});

	it('polls when document is hidden if pauseWhenHidden is false', async () => {
		setDocumentHidden(true);

		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result } = renderHook(() =>
			useJjStatusPolling(sessions, { pauseWhenHidden: false })
		);

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		expect(jjService.getStatus).toHaveBeenCalled();
	});

	it('handles errors gracefully without crashing', async () => {
		vi.mocked(jjService.getStatus).mockRejectedValue(new Error('jj not found'));
		vi.mocked(jjService.getCurrentChange).mockRejectedValue(new Error('jj not found'));

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result } = renderHook(() => useJjStatusPolling(sessions));

		// Wait for poll attempt
		await act(async () => {
			await result.current.refreshJjStatus();
		});

		// Should still have an empty map, no crash
		expect(result.current.jjStatusMap.size).toBe(0);
	});

	it('includes conflict information when conflicts exist', async () => {
		vi.mocked(jjService.getStatus).mockResolvedValue({
			...mockJjStatus,
			hasConflicts: true,
			conflictedFiles: ['src/conflict.ts'],
		});
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);

		const sessions = [createMockSession({ id: 'jj-session', vcsType: 'jj' })];

		const { result } = renderHook(() => useJjStatusPolling(sessions));

		await waitFor(() => {
			expect(result.current.jjStatusMap.get('jj-session')).toBeDefined();
		});

		const data = result.current.jjStatusMap.get('jj-session')!;
		expect(data.hasConflicts).toBe(true);
		expect(data.conflictedFiles).toEqual(['src/conflict.ts']);
	});
});
