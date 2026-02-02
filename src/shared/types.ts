// Shared type definitions for Maestro CLI and Electron app
// These types are used by both the CLI tool and the renderer process

export type ToolType = 'claude-code' | 'opencode' | 'codex' | 'terminal' | 'factory-droid';

/**
 * ThinkingMode controls how AI reasoning/thinking content is displayed.
 * - 'off': Thinking is suppressed (not shown)
 * - 'on': Thinking is shown while streaming, cleared when final response arrives
 * - 'sticky': Thinking is shown and remains visible after the final response
 */
export type ThinkingMode = 'off' | 'on' | 'sticky';

// Session group
export interface Group {
	id: string;
	name: string;
	emoji: string;
	collapsed: boolean;
}

// Simplified session interface for CLI (subset of full Session)
export interface SessionInfo {
	id: string;
	groupId?: string;
	name: string;
	toolType: ToolType;
	cwd: string;
	projectRoot: string;
	autoRunFolderPath?: string;
}

// Usage statistics from AI agent CLI (Claude Code, Codex, etc.)
export interface UsageStats {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	totalCostUsd: number;
	contextWindow: number;
	/**
	 * Reasoning/thinking tokens (separate from outputTokens)
	 * Some models like OpenAI o3/o4-mini report reasoning tokens separately.
	 * These are already included in outputTokens but tracked separately for UI display.
	 */
	reasoningTokens?: number;
}

// History entry types for the History panel
export type HistoryEntryType = 'AUTO' | 'USER';

export interface HistoryEntry {
	id: string;
	type: HistoryEntryType;
	timestamp: number;
	summary: string;
	fullResponse?: string;
	agentSessionId?: string;
	sessionName?: string;
	projectPath: string;
	sessionId?: string;
	contextUsage?: number;
	usageStats?: UsageStats;
	success?: boolean;
	elapsedTimeMs?: number;
	validated?: boolean;
}

// Document entry within a playbook
export interface PlaybookDocumentEntry {
	filename: string;
	resetOnCompletion: boolean;
}

// A saved Playbook configuration
export interface Playbook {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	documents: PlaybookDocumentEntry[];
	loopEnabled: boolean;
	maxLoops?: number | null;
	prompt: string;
	worktreeSettings?: {
		branchNameTemplate: string;
		createPROnCompletion: boolean;
		prTargetBranch?: string;
	};
}

// Document entry in the batch run queue (runtime version with IDs)
export interface BatchDocumentEntry {
	id: string;
	filename: string;
	resetOnCompletion: boolean;
	isDuplicate: boolean;
	isMissing?: boolean;
}

// Git worktree configuration for Auto Run
export interface WorktreeConfig {
	enabled: boolean;
	path: string;
	branchName: string;
	createPROnCompletion: boolean;
	prTargetBranch: string;
}

// Configuration for starting a batch run
export interface BatchRunConfig {
	documents: BatchDocumentEntry[];
	prompt: string;
	loopEnabled: boolean;
	maxLoops?: number | null;
	worktree?: WorktreeConfig;
}

// Agent configuration
export interface AgentConfig {
	id: string;
	name: string;
	binaryName: string;
	command: string;
	args: string[];
	available: boolean;
	path?: string;
	requiresPty?: boolean;
	hidden?: boolean;
}

// ============================================================================
// Agent Error Handling Types
// ============================================================================

/**
 * Types of errors that agents can encounter.
 * Used to determine appropriate recovery actions and UI display.
 */
export type AgentErrorType =
	| 'auth_expired' // API key invalid, token expired, login required
	| 'token_exhaustion' // Context window full, max tokens reached
	| 'rate_limited' // Too many requests, quota exceeded
	| 'network_error' // Connection failed, timeout
	| 'agent_crashed' // Process exited unexpectedly
	| 'permission_denied' // Agent lacks required permissions
	| 'session_not_found' // Session was deleted or doesn't exist
	| 'unknown'; // Unrecognized error

/**
 * Structured error information from an AI agent.
 * Contains details needed for error display and recovery.
 */
export interface AgentError {
	/** The category of error */
	type: AgentErrorType;

	/** Human-readable error message for display */
	message: string;

	/** Whether the error can be recovered from (vs. requiring user intervention) */
	recoverable: boolean;

	/** The agent that encountered the error (e.g., 'claude-code', 'opencode') */
	agentId: string;

	/** The session ID where the error occurred (if applicable) */
	sessionId?: string;

	/** Timestamp when the error occurred */
	timestamp: number;

	/** Original error data for debugging (stderr, exit code, etc.) */
	raw?: {
		exitCode?: number;
		stderr?: string;
		stdout?: string;
		errorLine?: string;
	};

	/** Parsed JSON error details (if the error contains structured JSON) */
	parsedJson?: unknown;
}

/**
 * Recovery action for an agent error.
 * Provides both the action metadata and the action function.
 */
export interface AgentErrorRecovery {
	/** The error type this recovery addresses */
	type: AgentErrorType;

	/** Button label for the recovery action (e.g., "Re-authenticate", "Start New Session") */
	label: string;

	/** Description of what the recovery action will do */
	description?: string;

	/** Whether this is the recommended/primary action */
	primary?: boolean;

	/** Icon identifier for the action button (optional) */
	icon?: string;
}

// ============================================================================
// Power Management Types
// ============================================================================

/**
 * Status information for the power management system.
 * Returned by power:getStatus IPC handler.
 */
export interface PowerStatus {
	/** Whether sleep prevention is enabled by user preference */
	enabled: boolean;
	/** Whether we are currently blocking sleep (enabled AND have active reasons) */
	blocking: boolean;
	/** List of active reasons for blocking (e.g., "session:abc123", "autorun:batch1") */
	reasons: string[];
	/** Current platform */
	platform: 'darwin' | 'win32' | 'linux';
}

// ============================================================================
// Marketplace Types (re-exported from marketplace-types.ts)
// ============================================================================

export type {
	MarketplaceManifest,
	MarketplacePlaybook,
	MarketplaceDocument,
	MarketplaceCache,
	MarketplaceDocumentContent,
	MarketplaceErrorType,
	MarketplaceError,
	GetManifestResponse,
	GetDocumentResponse,
	GetReadmeResponse,
	ImportPlaybookResponse,
	MarketplaceErrorResponse,
} from './marketplace-types';

export {
	MarketplaceFetchError,
	MarketplaceCacheError,
	MarketplaceImportError,
} from './marketplace-types';

// ============================================================================
// SSH Remote Execution Types
// ============================================================================

/**
 * Configuration for an SSH remote host where agents can be executed.
 * Supports key-based authentication only (no password auth).
 *
 * When useSshConfig is true, the host field becomes the SSH config Host pattern
 * (e.g., "dev-server" from ~/.ssh/config), and username/privateKeyPath can be
 * omitted as they're inherited from the SSH config file.
 */
export interface SshRemoteConfig {
	/** Unique identifier for this remote configuration */
	id: string;

	/** Display name for UI */
	name: string;

	/**
	 * SSH server hostname or IP address.
	 * When useSshConfig is true, this is the Host pattern from ~/.ssh/config
	 * (e.g., "dev-server" instead of "192.168.1.100").
	 */
	host: string;

	/** SSH server port (default: 22). Optional when using SSH config. */
	port: number;

	/**
	 * SSH username. Optional when useSshConfig is true and the SSH config
	 * provides the User directive.
	 */
	username: string;

	/**
	 * Path to private key file. Optional when useSshConfig is true and the
	 * SSH config provides the IdentityFile directive.
	 */
	privateKeyPath: string;

	/** Environment variables to set on remote */
	remoteEnv?: Record<string, string>;

	/** Enable this remote configuration */
	enabled: boolean;

	/**
	 * When true, use the host field as an SSH config Host pattern.
	 * Connection settings (User, IdentityFile, Port, HostName) will be
	 * inherited from ~/.ssh/config. Explicit settings here override config.
	 */
	useSshConfig?: boolean;

	/**
	 * Reference to the SSH config host pattern this was imported from.
	 * Used for display purposes to show where the config came from.
	 */
	sshConfigHost?: string;
}

/**
 * Status of an SSH remote connection from last test.
 */
export interface SshRemoteStatus {
	/** Last connection test result */
	lastTestSuccess: boolean | null;

	/** Last connection test timestamp */
	lastTestAt: number | null;

	/** Error message from last test */
	lastTestError: string | null;
}

/**
 * Result of testing an SSH remote connection.
 */
export interface SshRemoteTestResult {
	/** Whether the connection test succeeded */
	success: boolean;

	/** Error message if test failed */
	error?: string;

	/** Remote host info (hostname, agent version, etc.) */
	remoteInfo?: {
		hostname: string;
		agentVersion?: string;
	};
}

/**
 * Agent-level SSH remote configuration.
 * Allows overriding the global default SSH remote for specific agents.
 */
export interface AgentSshRemoteConfig {
	/** Use SSH remote for this agent */
	enabled: boolean;

	/** Remote config ID to use (references SshRemoteConfig.id) */
	remoteId: string | null;

	/** Override working directory for this agent */
	workingDirOverride?: string;
}

// ============================================================================
// Global Agent Statistics Types
// ============================================================================

/**
 * Per-provider statistics breakdown
 */
export interface ProviderStats {
	sessions: number;
	messages: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	hasCostData: boolean;
}

/**
 * Global stats aggregated from all providers.
 * Used by AboutModal and AgentSessions handlers.
 */
export interface GlobalAgentStats {
	totalSessions: number;
	totalMessages: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCacheReadTokens: number;
	totalCacheCreationTokens: number;
	/** Total cost in USD - only includes providers that support cost tracking */
	totalCostUsd: number;
	/** Whether any provider contributed cost data */
	hasCostData: boolean;
	totalSizeBytes: number;
	/** Whether stats calculation is complete (used for progressive updates) */
	isComplete: boolean;
	/** Per-provider breakdown */
	byProvider: Record<string, ProviderStats>;
}

// ============================================================================
// Jujutsu (jj) Version Control Types
// ============================================================================

/**
 * File status in jj working copy
 * Maps to jj status output indicators: A (added), M (modified), D (deleted), R (renamed), C (copied)
 */
export type JjFileStatusType = 'A' | 'M' | 'D' | 'R' | 'C';

/**
 * Represents a file change from jj status output
 */
export interface JjFileStatus {
	path: string;
	status: JjFileStatusType;
}

/**
 * Status of the jj working copy
 * Parsed from `jj status` output
 */
export interface JjStatus {
	/** Files with changes in the working copy */
	files: JjFileStatus[];
	/** Working copy change ID (short form like 'qzmzpxyl') */
	workingCopyChangeId: string;
	/** Working copy commit ID (short form like 'bc915fcd') */
	workingCopyCommitId: string;
	/** Working copy description */
	workingCopyDescription: string;
	/** Whether working copy is empty */
	workingCopyEmpty: boolean;
	/** Parent commit change ID */
	parentChangeId: string;
	/** Parent commit commit ID */
	parentCommitId: string;
	/** Parent commit description */
	parentDescription: string;
	/** Whether parent commit is empty */
	parentEmpty: boolean;
	/** Whether there are conflicts in the working copy */
	hasConflicts: boolean;
	/** Conflicted file paths */
	conflictedFiles: string[];
}

/**
 * Represents a jj bookmark (formerly called branch)
 * Parsed from `jj bookmark list` output
 */
export interface JjBookmark {
	/** Bookmark name */
	name: string;
	/** Target change ID (short form) */
	changeId: string;
	/** Target commit ID (short form) */
	commitId: string;
	/** Commit description */
	description: string;
	/** Whether this bookmark is conflicted (has divergent targets) */
	isConflicted: boolean;
	/** Remote name if this is a remote bookmark */
	remote?: string;
	/** Whether this bookmark is tracked */
	isTracked: boolean;
}

/**
 * Represents a jj change (commit)
 * Parsed from `jj log` output
 */
export interface JjChange {
	/** Change ID (stable identifier, e.g., 'qzmzpxyl') */
	changeId: string;
	/** Commit ID (content-based hash, e.g., 'bc915fcd') */
	commitId: string;
	/** Commit description/message */
	description: string;
	/** Whether this change is empty (no file changes) */
	isEmpty: boolean;
	/** Author information */
	author?: {
		name: string;
		email: string;
		timestamp: string;
	};
	/** Bookmarks pointing to this change */
	bookmarks: string[];
}

/**
 * Represents a jj workspace
 * Jujutsu supports multiple workspaces within a single repository
 */
export interface JjWorkspace {
	/** Workspace name (default is 'default') */
	name: string;
	/** Path to the workspace root */
	path: string;
	/** Current working copy change ID in this workspace */
	workingCopyChangeId: string;
}
