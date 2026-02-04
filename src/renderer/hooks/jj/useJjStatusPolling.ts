import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '../../types';
import { jjService } from '../../services/jj';
import type { GitFileChange, GitStatusData } from '../git/useGitStatusPolling';

/**
 * Jj-specific status data for a session.
 * Extends GitStatusData with jj-specific fields while maintaining UI compatibility.
 */
export interface JjStatusData extends GitStatusData {
	/** The full change ID of the working copy */
	changeId?: string;
	/** The working copy commit ID (hash) */
	commitId?: string;
	/** Description of the working copy change */
	description?: string;
	/** Whether the working copy is empty (no changes) */
	isEmpty?: boolean;
	/** Whether there are merge conflicts */
	hasConflicts?: boolean;
	/** List of conflicted file paths */
	conflictedFiles?: string[];
	/** Bookmarks pointing to the current change */
	bookmarks?: string[];
}

/**
 * Return type for the useJjStatusPolling hook
 */
export interface UseJjStatusPollingReturn {
	/** Map of session ID to jj status data */
	jjStatusMap: Map<string, JjStatusData>;
	/** Manually trigger a refresh */
	refreshJjStatus: () => Promise<void>;
	/** Whether data is currently being fetched */
	isLoading: boolean;
}

/**
 * Configuration options for jj status polling
 */
export interface UseJjStatusPollingOptions {
	/** Polling interval in ms. Default: 2000 (2 seconds) */
	pollInterval?: number;
	/** Pause polling when document is hidden. Default: true */
	pauseWhenHidden?: boolean;
	/** Inactivity timeout in ms. Default: 60000 (60 seconds) */
	inactivityTimeout?: number;
	/** ID of the currently active session */
	activeSessionId?: string;
}

const DEFAULT_POLL_INTERVAL = 2000; // 2 seconds (jj is faster than git)
const DEFAULT_INACTIVITY_TIMEOUT = 60000; // 60 seconds

/**
 * PERF: Compare two JjStatusData objects for meaningful changes.
 * Ignores lastUpdated since that always changes.
 */
function jjStatusDataEqual(a: JjStatusData, b: JjStatusData): boolean {
	return (
		a.fileCount === b.fileCount &&
		a.branch === b.branch &&
		a.changeId === b.changeId &&
		a.commitId === b.commitId &&
		a.description === b.description &&
		a.isEmpty === b.isEmpty &&
		a.hasConflicts === b.hasConflicts &&
		a.totalAdditions === b.totalAdditions &&
		a.totalDeletions === b.totalDeletions &&
		a.modifiedCount === b.modifiedCount &&
		(a.conflictedFiles?.length ?? 0) === (b.conflictedFiles?.length ?? 0) &&
		(a.bookmarks?.length ?? 0) === (b.bookmarks?.length ?? 0) &&
		(a.fileChanges?.length ?? 0) === (b.fileChanges?.length ?? 0) &&
		(a.fileChanges?.every((f, i) => {
			const other = b.fileChanges?.[i];
			return (
				other &&
				f.path === other.path &&
				f.status === other.status &&
				f.additions === other.additions &&
				f.deletions === other.deletions
			);
		}) ??
			true)
	);
}

/**
 * PERF: Compare two jj status maps for meaningful changes.
 */
function jjStatusMapsEqual(
	oldMap: Map<string, JjStatusData>,
	newMap: Map<string, JjStatusData>
): boolean {
	if (oldMap.size !== newMap.size) return false;
	for (const [sessionId, newData] of newMap) {
		const oldData = oldMap.get(sessionId);
		if (!oldData || !jjStatusDataEqual(oldData, newData)) {
			return false;
		}
	}
	return true;
}

/**
 * Poll a single jj session for status data.
 */
async function pollJjSession(
	sessionId: string,
	cwd: string,
	isActiveSession: boolean
): Promise<readonly [string, JjStatusData] | null> {
	try {
		const [jjStatus, currentChange] = await Promise.all([
			jjService.getStatus(cwd),
			jjService.getCurrentChange(cwd),
		]);

		// Determine bookmark/branch name
		const bookmarks = currentChange?.bookmarks ?? [];
		const branchName =
			bookmarks.length > 0
				? bookmarks[0]
				: jjStatus.workingCopyChangeId
					? jjStatus.workingCopyChangeId.slice(0, 8)
					: undefined;

		// For non-active sessions, return lightweight data
		if (!isActiveSession) {
			return [
				sessionId,
				{
					fileCount: jjStatus.files.length,
					branch: branchName,
					behind: 0,
					ahead: 0,
					totalAdditions: 0,
					totalDeletions: 0,
					modifiedCount: 0,
					lastUpdated: Date.now(),
					changeId: jjStatus.workingCopyChangeId,
					commitId: jjStatus.workingCopyCommitId,
					description: jjStatus.workingCopyDescription,
					isEmpty: jjStatus.workingCopyEmpty,
					hasConflicts: jjStatus.hasConflicts,
					conflictedFiles: jjStatus.conflictedFiles,
					bookmarks,
				},
			] as const;
		}

		// For active session, also get diff for line-level stats
		const jjDiff = await jjService.getDiff(cwd);

		// Count additions/deletions from raw diff output
		let totalAdditions = 0;
		let totalDeletions = 0;
		if (jjDiff.raw) {
			for (const line of jjDiff.raw.split('\n')) {
				if (line.startsWith('+') && !line.startsWith('+++')) {
					totalAdditions++;
				} else if (line.startsWith('-') && !line.startsWith('---')) {
					totalDeletions++;
				}
			}
		}

		// Map jj file statuses to GitFileChange format for UI compatibility
		let modifiedCount = 0;
		const fileChanges: GitFileChange[] = jjStatus.files.map((file) => {
			const isModified = file.status === 'M' || file.status === 'R';
			if (isModified) modifiedCount++;
			return {
				path: file.path,
				status: file.status,
				additions: 0, // jj doesn't provide per-file line stats from status
				deletions: 0,
				modified: isModified,
			};
		});

		return [
			sessionId,
			{
				fileCount: jjStatus.files.length,
				branch: branchName,
				behind: 0,
				ahead: 0,
				fileChanges,
				totalAdditions,
				totalDeletions,
				modifiedCount,
				lastUpdated: Date.now(),
				changeId: jjStatus.workingCopyChangeId,
				commitId: jjStatus.workingCopyCommitId,
				description: jjStatus.workingCopyDescription,
				isEmpty: jjStatus.workingCopyEmpty,
				hasConflicts: jjStatus.hasConflicts,
				conflictedFiles: jjStatus.conflictedFiles,
				bookmarks,
			},
		] as const;
	} catch {
		return null;
	}
}

/**
 * Hook that polls jj status for all jj repository sessions.
 *
 * Features:
 * - Only polls sessions with vcsType === 'jj'
 * - Default 2-second interval (jj is faster than git)
 * - Pauses polling when window is not focused (power saving)
 * - Pauses after user inactivity to save CPU
 * - Resumes on window focus or user activity
 * - Parallelizes status calls across sessions
 * - Returns jj-specific data (changeId, bookmarks, conflicts) alongside
 *   GitStatusData-compatible fields for UI interop
 * - Debounces rapid updates to prevent UI flicker
 *
 * @param sessions - Array of all sessions (filters to jj only)
 * @param options - Optional configuration
 */
export function useJjStatusPolling(
	sessions: Session[],
	options: UseJjStatusPollingOptions = {}
): UseJjStatusPollingReturn {
	const {
		pollInterval = DEFAULT_POLL_INTERVAL,
		pauseWhenHidden = true,
		inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
		activeSessionId,
	} = options;

	const [jjStatusMap, setJjStatusMap] = useState<Map<string, JjStatusData>>(new Map());
	const [isLoading, setIsLoading] = useState(false);

	const sessionsRef = useRef(sessions);
	sessionsRef.current = sessions;

	const activeSessionIdRef = useRef(activeSessionId);
	activeSessionIdRef.current = activeSessionId;

	// Activity tracking refs
	const lastActivityRef = useRef<number>(Date.now());
	const isActiveRef = useRef<boolean>(true);
	const intervalRef = useRef<NodeJS.Timeout | null>(null);

	const pollJjStatus = useCallback(async () => {
		if (pauseWhenHidden && document.hidden) return;

		const jjSessions = sessionsRef.current.filter((s) => s.vcsType === 'jj');
		if (jjSessions.length === 0) {
			setJjStatusMap((prev) => (prev.size === 0 ? prev : new Map()));
			return;
		}

		setIsLoading(true);

		try {
			const currentActiveSessionId = activeSessionIdRef.current;

			const results = await Promise.all(
				jjSessions.map(async (session) => {
					const cwd =
						session.inputMode === 'terminal' ? session.shellCwd || session.cwd : session.cwd;
					const isActiveSession = session.id === currentActiveSessionId;
					return pollJjSession(session.id, cwd, isActiveSession);
				})
			);

			const newStatusMap = new Map<string, JjStatusData>();
			for (const result of results) {
				if (result) {
					newStatusMap.set(result[0], result[1]);
				}
			}

			// PERF: Only update state if data actually changed
			setJjStatusMap((prev) => (jjStatusMapsEqual(prev, newStatusMap) ? prev : newStatusMap));
		} finally {
			setIsLoading(false);
		}
	}, [pauseWhenHidden]);

	const startPolling = useCallback(() => {
		if (!intervalRef.current && (!pauseWhenHidden || !document.hidden)) {
			pollJjStatus();
			intervalRef.current = setInterval(() => {
				const now = Date.now();
				const timeSinceLastActivity = now - lastActivityRef.current;

				if (timeSinceLastActivity < inactivityTimeout) {
					pollJjStatus();
				} else {
					isActiveRef.current = false;
					if (intervalRef.current) {
						clearInterval(intervalRef.current);
						intervalRef.current = null;
					}
				}
			}, pollInterval);
		}
	}, [pollInterval, inactivityTimeout, pollJjStatus, pauseWhenHidden]);

	const stopPolling = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	// Handle visibility changes
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.hidden) {
				stopPolling();
			} else if (isActiveRef.current) {
				startPolling();
			}
		};

		if (pauseWhenHidden) {
			document.addEventListener('visibilitychange', handleVisibilityChange);
		}

		return () => {
			if (pauseWhenHidden) {
				document.removeEventListener('visibilitychange', handleVisibilityChange);
			}
		};
	}, [pauseWhenHidden, startPolling, stopPolling]);

	// Debounce timer ref for activity handler
	const activityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startPollingRef = useRef(startPolling);
	startPollingRef.current = startPolling;

	// Listen for user activity to restart polling if inactive
	useEffect(() => {
		const handleActivity = () => {
			if (activityDebounceRef.current) {
				clearTimeout(activityDebounceRef.current);
			}

			activityDebounceRef.current = setTimeout(() => {
				lastActivityRef.current = Date.now();
				const wasInactive = !isActiveRef.current;
				isActiveRef.current = true;

				if (wasInactive && (!pauseWhenHidden || !document.hidden)) {
					startPollingRef.current();
				}
				activityDebounceRef.current = null;
			}, 100);
		};

		window.addEventListener('keydown', handleActivity);
		window.addEventListener('mousedown', handleActivity);
		window.addEventListener('wheel', handleActivity);
		window.addEventListener('touchstart', handleActivity);

		return () => {
			window.removeEventListener('keydown', handleActivity);
			window.removeEventListener('mousedown', handleActivity);
			window.removeEventListener('wheel', handleActivity);
			window.removeEventListener('touchstart', handleActivity);
			if (activityDebounceRef.current) {
				clearTimeout(activityDebounceRef.current);
			}
		};
	}, [pauseWhenHidden]);

	// Initial start and cleanup
	useEffect(() => {
		if (!pauseWhenHidden || !document.hidden) {
			startPolling();
		}

		return () => {
			stopPolling();
		};
	}, [pauseWhenHidden, startPolling, stopPolling]);

	// Refresh immediately when active session changes
	useEffect(() => {
		if (activeSessionId) {
			pollJjStatus();
		}
	}, [activeSessionId, pollJjStatus]);

	return {
		jjStatusMap,
		refreshJjStatus: pollJjStatus,
		isLoading,
	};
}
