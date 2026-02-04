import { createContext, useContext, useMemo, ReactNode } from 'react';
import {
	useJjStatusPolling,
	type JjStatusData,
	type UseJjStatusPollingOptions,
} from '../hooks/jj';
import type { GitFileChange } from '../hooks/git/useGitStatusPolling';
import type { Session } from '../types';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Branch/bookmark-related jj data - changes infrequently.
 * Components that only show bookmark name don't need to re-render when file counts change.
 */
export interface JjBranchContextValue {
	/** Get branch/bookmark info for a session */
	getBranchInfo: (sessionId: string) =>
		| {
				/** Current bookmark name (or short change ID if no bookmark) */
				branch?: string;
				/** Full change ID of the working copy */
				changeId?: string;
				/** Commit ID (hash) of the working copy */
				commitId?: string;
				/** Bookmarks pointing to current change */
				bookmarks?: string[];
		  }
		| undefined;
}

/**
 * File status counts - changes on file operations.
 * Components that show file counts don't need full file details.
 */
export interface JjFileStatusContextValue {
	/** Get file count for a session */
	getFileCount: (sessionId: string) => number;
	/** Check if a session has uncommitted changes */
	hasChanges: (sessionId: string) => boolean;
	/** Whether data is currently being fetched */
	isLoading: boolean;
	/** Whether a session has merge conflicts */
	hasConflicts: (sessionId: string) => boolean;
}

/**
 * Detailed file changes - only available for active session.
 * Components showing file details need this, but most don't.
 */
export interface JjDetailContextValue {
	/** Get detailed file changes for a session (only populated for active session) */
	getFileDetails: (sessionId: string) =>
		| {
				fileChanges?: GitFileChange[];
				totalAdditions: number;
				totalDeletions: number;
				modifiedCount: number;
				/** Working copy description */
				description?: string;
				/** Whether the working copy is empty */
				isEmpty?: boolean;
				/** Conflicted file paths */
				conflictedFiles?: string[];
		  }
		| undefined;
	/** Manually trigger a refresh of jj status */
	refreshJjStatus: () => Promise<void>;
}

// ============================================================================
// CONTEXTS
// ============================================================================

const JjBranchContext = createContext<JjBranchContextValue | null>(null);
const JjFileStatusContext = createContext<JjFileStatusContextValue | null>(null);
const JjDetailContext = createContext<JjDetailContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface JjStatusProviderProps {
	children: ReactNode;
	/** Array of all sessions to poll */
	sessions: Session[];
	/** ID of the currently active session */
	activeSessionId?: string;
	/** Optional polling options override */
	options?: Omit<UseJjStatusPollingOptions, 'activeSessionId'>;
}

/**
 * JjStatusProvider - Provides centralized jj status polling for all jj sessions.
 *
 * This provider consolidates jj polling and exposes data through three focused contexts:
 * - JjBranchContext: Bookmark name, change ID, commit ID (rarely changes)
 * - JjFileStatusContext: File counts, hasChanges, hasConflicts (changes on file operations)
 * - JjDetailContext: Detailed file changes, description (only for active session)
 *
 * Components can subscribe to only the context they need, reducing cascade re-renders.
 */
export function JjStatusProvider({
	children,
	sessions,
	activeSessionId,
	options = {},
}: JjStatusProviderProps) {
	const { jjStatusMap, refreshJjStatus, isLoading } = useJjStatusPolling(sessions, {
		...options,
		activeSessionId,
	});

	// ============================================================================
	// BRANCH CONTEXT VALUE (rarely changes)
	// ============================================================================
	const branchContextValue = useMemo<JjBranchContextValue>(
		() => ({
			getBranchInfo: (sessionId: string) => {
				const data = jjStatusMap.get(sessionId);
				if (!data) return undefined;
				return {
					branch: data.branch,
					changeId: data.changeId,
					commitId: data.commitId,
					bookmarks: data.bookmarks,
				};
			},
		}),
		[jjStatusMap]
	);

	// ============================================================================
	// FILE STATUS CONTEXT VALUE (changes on file operations)
	// ============================================================================
	const fileStatusContextValue = useMemo<JjFileStatusContextValue>(
		() => ({
			getFileCount: (sessionId: string) => jjStatusMap.get(sessionId)?.fileCount ?? 0,
			hasChanges: (sessionId: string) => (jjStatusMap.get(sessionId)?.fileCount ?? 0) > 0,
			isLoading,
			hasConflicts: (sessionId: string) =>
				jjStatusMap.get(sessionId)?.hasConflicts ?? false,
		}),
		[jjStatusMap, isLoading]
	);

	// ============================================================================
	// DETAIL CONTEXT VALUE (only for active session, most expensive)
	// ============================================================================
	const detailContextValue = useMemo<JjDetailContextValue>(
		() => ({
			getFileDetails: (sessionId: string) => {
				const data = jjStatusMap.get(sessionId);
				if (!data) return undefined;
				return {
					fileChanges: data.fileChanges,
					totalAdditions: data.totalAdditions,
					totalDeletions: data.totalDeletions,
					modifiedCount: data.modifiedCount,
					description: data.description,
					isEmpty: data.isEmpty,
					conflictedFiles: data.conflictedFiles,
				};
			},
			refreshJjStatus,
		}),
		[jjStatusMap, refreshJjStatus]
	);

	return (
		<JjBranchContext.Provider value={branchContextValue}>
			<JjFileStatusContext.Provider value={fileStatusContextValue}>
				<JjDetailContext.Provider value={detailContextValue}>
					{children}
				</JjDetailContext.Provider>
			</JjFileStatusContext.Provider>
		</JjBranchContext.Provider>
	);
}

// ============================================================================
// HOOKS - Focused hooks for specific data needs
// ============================================================================

/**
 * useJjBranch - Hook for bookmark/branch-related data.
 * Use when you only need bookmark name, change ID, or commit ID.
 * Updates less frequently than file status.
 */
export function useJjBranch(): JjBranchContextValue {
	const context = useContext(JjBranchContext);
	if (!context) {
		throw new Error('useJjBranch must be used within a JjStatusProvider');
	}
	return context;
}

/**
 * useJjFileStatus - Hook for file count and change detection.
 * Use when you need to show file counts, check for changes, or check for conflicts.
 * More efficient than full status when you don't need file details.
 */
export function useJjFileStatus(): JjFileStatusContextValue {
	const context = useContext(JjFileStatusContext);
	if (!context) {
		throw new Error('useJjFileStatus must be used within a JjStatusProvider');
	}
	return context;
}

/**
 * useJjDetail - Hook for detailed file changes.
 * Use when you need line additions/deletions, individual file changes, or working copy description.
 * Only populated for the active session.
 */
export function useJjDetail(): JjDetailContextValue {
	const context = useContext(JjDetailContext);
	if (!context) {
		throw new Error('useJjDetail must be used within a JjStatusProvider');
	}
	return context;
}

// Re-export types for convenience
export type { JjStatusData } from '../hooks/jj';
export type { GitFileChange };
