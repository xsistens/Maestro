/**
 * @file JjStatusContext.test.tsx
 * @description Unit tests for JjStatusContext and its focused hooks
 *
 * Tests cover:
 * - JjStatusProvider renders children
 * - useJjBranch returns branch/bookmark data
 * - useJjFileStatus returns file counts and conflict state
 * - useJjDetail returns detailed file changes
 * - Hooks throw when used outside provider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import {
	JjStatusProvider,
	useJjBranch,
	useJjFileStatus,
	useJjDetail,
} from '../../../renderer/contexts/JjStatusContext';
import type { Session } from '../../../renderer/types';

// Mock the jj service
vi.mock('../../../renderer/services/jj', () => ({
	jjService: {
		getStatus: vi.fn(),
		getCurrentChange: vi.fn(),
		getDiff: vi.fn(),
	},
}));

import { jjService } from '../../../renderer/services/jj';

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
	bookmarks: ['feature-branch'],
};

const mockDiff = {
	raw: '+new line\n-old line\n context',
	files: [
		{ path: 'src/main.ts', status: 'M' as const },
	],
};

describe('JjStatusContext', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(jjService.getStatus).mockResolvedValue(mockJjStatus);
		vi.mocked(jjService.getCurrentChange).mockResolvedValue(mockCurrentChange);
		vi.mocked(jjService.getDiff).mockResolvedValue(mockDiff);
	});

	const sessions = [createMockSession({ id: 'jj-1', vcsType: 'jj' })];

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<JjStatusProvider sessions={sessions} activeSessionId="jj-1">
			{children}
		</JjStatusProvider>
	);

	describe('useJjBranch', () => {
		it('returns branch/bookmark data for a session', async () => {
			const { result } = renderHook(() => useJjBranch(), { wrapper });

			await waitFor(() => {
				const info = result.current.getBranchInfo('jj-1');
				expect(info).toBeDefined();
			});

			const info = result.current.getBranchInfo('jj-1')!;
			expect(info.branch).toBe('feature-branch'); // From bookmark
			expect(info.changeId).toBe('abcdef1234567890');
			expect(info.commitId).toBe('deadbeef12345678');
			expect(info.bookmarks).toEqual(['feature-branch']);
		});

		it('returns undefined for unknown session', async () => {
			const { result } = renderHook(() => useJjBranch(), { wrapper });

			await waitFor(() => {
				const known = result.current.getBranchInfo('jj-1');
				expect(known).toBeDefined();
			});

			expect(result.current.getBranchInfo('unknown-session')).toBeUndefined();
		});

		it('throws when used outside JjStatusProvider', () => {
			expect(() => {
				renderHook(() => useJjBranch());
			}).toThrow('useJjBranch must be used within a JjStatusProvider');
		});
	});

	describe('useJjFileStatus', () => {
		it('returns file count for a session', async () => {
			const { result } = renderHook(() => useJjFileStatus(), { wrapper });

			await waitFor(() => {
				expect(result.current.getFileCount('jj-1')).toBe(2);
			});
		});

		it('returns hasChanges correctly', async () => {
			const { result } = renderHook(() => useJjFileStatus(), { wrapper });

			await waitFor(() => {
				expect(result.current.hasChanges('jj-1')).toBe(true);
			});

			expect(result.current.hasChanges('unknown')).toBe(false);
		});

		it('returns hasConflicts correctly', async () => {
			vi.mocked(jjService.getStatus).mockResolvedValue({
				...mockJjStatus,
				hasConflicts: true,
				conflictedFiles: ['src/conflict.ts'],
			});

			const { result } = renderHook(() => useJjFileStatus(), { wrapper });

			await waitFor(() => {
				expect(result.current.hasConflicts('jj-1')).toBe(true);
			});
		});

		it('returns zero file count for unknown session', async () => {
			const { result } = renderHook(() => useJjFileStatus(), { wrapper });

			await waitFor(() => {
				// Wait for data to load
				expect(result.current.getFileCount('jj-1')).toBeGreaterThan(0);
			});

			expect(result.current.getFileCount('unknown')).toBe(0);
		});

		it('throws when used outside JjStatusProvider', () => {
			expect(() => {
				renderHook(() => useJjFileStatus());
			}).toThrow('useJjFileStatus must be used within a JjStatusProvider');
		});
	});

	describe('useJjDetail', () => {
		it('returns detailed file changes for active session', async () => {
			const { result } = renderHook(() => useJjDetail(), { wrapper });

			await waitFor(() => {
				const details = result.current.getFileDetails('jj-1');
				expect(details?.fileChanges).toBeDefined();
			});

			const details = result.current.getFileDetails('jj-1')!;
			expect(details.fileChanges).toHaveLength(2);
			expect(details.totalAdditions).toBe(1); // +new line
			expect(details.totalDeletions).toBe(1); // -old line
			expect(details.description).toBe('work in progress');
			expect(details.isEmpty).toBe(false);
		});

		it('returns undefined for unknown session', async () => {
			const { result } = renderHook(() => useJjDetail(), { wrapper });

			await waitFor(() => {
				expect(result.current.getFileDetails('jj-1')).toBeDefined();
			});

			expect(result.current.getFileDetails('unknown')).toBeUndefined();
		});

		it('provides refreshJjStatus function', async () => {
			const { result } = renderHook(() => useJjDetail(), { wrapper });

			await waitFor(() => {
				expect(result.current.getFileDetails('jj-1')).toBeDefined();
			});

			expect(typeof result.current.refreshJjStatus).toBe('function');
		});

		it('throws when used outside JjStatusProvider', () => {
			expect(() => {
				renderHook(() => useJjDetail());
			}).toThrow('useJjDetail must be used within a JjStatusProvider');
		});
	});
});
