/**
 * Tests for jj-error-patterns.ts
 *
 * Tests the jj-specific error pattern matching and detection for
 * categorizing Jujutsu CLI errors into structured error types.
 */

import { describe, it, expect } from 'vitest';
import {
	detectJjError,
	matchJjErrorPattern,
	JJ_ERROR_PATTERNS,
} from '../../../main/parsers/jj-error-patterns';

describe('jj-error-patterns', () => {
	describe('JJ_ERROR_PATTERNS structure', () => {
		it('should define stale_working_copy patterns', () => {
			expect(JJ_ERROR_PATTERNS.stale_working_copy).toBeDefined();
			expect(JJ_ERROR_PATTERNS.stale_working_copy?.length).toBeGreaterThan(0);
		});

		it('should define conflict patterns', () => {
			expect(JJ_ERROR_PATTERNS.conflict).toBeDefined();
			expect(JJ_ERROR_PATTERNS.conflict?.length).toBeGreaterThan(0);
		});

		it('should define missing_change patterns', () => {
			expect(JJ_ERROR_PATTERNS.missing_change).toBeDefined();
			expect(JJ_ERROR_PATTERNS.missing_change?.length).toBeGreaterThan(0);
		});

		it('should define auth_failure patterns', () => {
			expect(JJ_ERROR_PATTERNS.auth_failure).toBeDefined();
			expect(JJ_ERROR_PATTERNS.auth_failure?.length).toBeGreaterThan(0);
		});

		it('should define concurrent_operation patterns', () => {
			expect(JJ_ERROR_PATTERNS.concurrent_operation).toBeDefined();
			expect(JJ_ERROR_PATTERNS.concurrent_operation?.length).toBeGreaterThan(0);
		});

		it('should define immutable_change patterns', () => {
			expect(JJ_ERROR_PATTERNS.immutable_change).toBeDefined();
			expect(JJ_ERROR_PATTERNS.immutable_change?.length).toBeGreaterThan(0);
		});

		it('should define bookmark_error patterns', () => {
			expect(JJ_ERROR_PATTERNS.bookmark_error).toBeDefined();
			expect(JJ_ERROR_PATTERNS.bookmark_error?.length).toBeGreaterThan(0);
		});

		it('should define not_a_repo patterns', () => {
			expect(JJ_ERROR_PATTERNS.not_a_repo).toBeDefined();
			expect(JJ_ERROR_PATTERNS.not_a_repo?.length).toBeGreaterThan(0);
		});
	});

	describe('detectJjError', () => {
		describe('stale_working_copy errors', () => {
			it('should detect "working copy is stale"', () => {
				const error = detectJjError('The working copy is stale (since 2024-01-15)');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('stale_working_copy');
				expect(error?.recoverable).toBe(true);
				expect(error?.message).toContain('jj workspace update-stale');
			});

			it('should detect "working copy was unexpectedly changed"', () => {
				const error = detectJjError('Working copy was unexpectedly changed on disk');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('stale_working_copy');
				expect(error?.recoverable).toBe(true);
			});
		});

		describe('conflict errors', () => {
			it('should detect "new conflicts appeared"', () => {
				const error = detectJjError('New conflicts appeared in these commits');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('conflict');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "unresolved conflicts"', () => {
				const error = detectJjError(
					'There are unresolved conflicts at these paths:\n  src/main.ts'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('conflict');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "conflict in <file>" with dynamic message', () => {
				const error = detectJjError('Conflict in src/main.ts');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('conflict');
				expect(error?.message).toContain('src/main.ts');
			});

			it('should detect "inputs to this merge were conflicted"', () => {
				const error = detectJjError(
					'Some of the inputs to this merge were conflicted'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('conflict');
				expect(error?.recoverable).toBe(false);
			});
		});

		describe('missing_change errors', () => {
			it('should detect revision doesn\'t exist', () => {
				const error = detectJjError('Revision "abc123" doesn\'t exist');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
				expect(error?.message).toContain('abc123');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "no such change id"', () => {
				const error = detectJjError('No such change id: xyzpqr');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
				expect(error?.message).toContain('xyzpqr');
			});

			it('should detect revset resolved to empty set', () => {
				const error = detectJjError(
					'Revset "trunk()..@" resolved to an empty set'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
			});

			it('should detect "no revisions matching"', () => {
				const error = detectJjError('No revisions matching the given spec');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
			});

			it('should detect "commit is not visible"', () => {
				const error = detectJjError('Commit abc123def is not visible in the current view');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
			});

			it('should detect "no changes found"', () => {
				const error = detectJjError('No changes found for the given revset');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('missing_change');
			});
		});

		describe('auth_failure errors', () => {
			it('should detect "could not read Username"', () => {
				const error = detectJjError(
					'could not read Username for https://github.com: terminal prompts disabled'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
				expect(error?.recoverable).toBe(true);
			});

			it('should detect "could not read Password"', () => {
				const error = detectJjError('could not read Password for https://github.com');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});

			it('should detect SSH permission denied', () => {
				const error = detectJjError(
					'Permission denied (publickey,keyboard-interactive)'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});

			it('should detect "Authentication failed for"', () => {
				const error = detectJjError(
					"fatal: Authentication failed for 'https://github.com/user/repo.git/'"
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});

			it('should detect HTTP 401 from remote', () => {
				const error = detectJjError(
					'The requested URL returned error: 401'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});

			it('should detect HTTP 403 from remote', () => {
				const error = detectJjError(
					'The requested URL returned error: 403'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});

			it('should detect "failed to authenticate"', () => {
				const error = detectJjError('Failed to authenticate with remote');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('auth_failure');
			});
		});

		describe('concurrent_operation errors', () => {
			it('should detect "not the most recent operation"', () => {
				const error = detectJjError(
					'The repo was loaded at operation abc123, which is not the most recent operation'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('concurrent_operation');
				expect(error?.recoverable).toBe(true);
			});

			it('should detect "failed to lock"', () => {
				const error = detectJjError('Failed to lock working copy');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('concurrent_operation');
				expect(error?.recoverable).toBe(true);
			});

			it('should detect "failed to acquire lock"', () => {
				const error = detectJjError('Failed to acquire lock on the repository');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('concurrent_operation');
			});

			it('should detect "concurrent operations"', () => {
				const error = detectJjError('Concurrent operations detected on this repository');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('concurrent_operation');
			});
		});

		describe('immutable_change errors', () => {
			it('should detect "refusing to modify immutable commit"', () => {
				const error = detectJjError('Refusing to modify immutable commit abc123');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('immutable_change');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "cannot rewrite immutable commits"', () => {
				const error = detectJjError('Cannot rewrite immutable commits');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('immutable_change');
			});

			it('should detect "commit is immutable"', () => {
				const error = detectJjError('Commit abc123def is immutable');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('immutable_change');
			});

			it('should detect "cannot abandon the root commit"', () => {
				const error = detectJjError('Cannot abandon the root commit');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('immutable_change');
			});

			it('should detect "cannot modify immutable"', () => {
				const error = detectJjError('Cannot modify immutable change');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('immutable_change');
			});
		});

		describe('bookmark_error errors', () => {
			it('should detect "bookmark already exists" with name', () => {
				const error = detectJjError('Bookmark already exists: main');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
				expect(error?.message).toContain('main');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "bookmark already exists" without name', () => {
				const error = detectJjError('Bookmark already exists');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
			});

			it('should detect "no such bookmark" with name', () => {
				const error = detectJjError('No such bookmark: feature-x');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
				expect(error?.message).toContain('feature-x');
			});

			it('should detect "no such bookmark" without name', () => {
				const error = detectJjError('No such bookmark');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
			});

			it('should detect "remote bookmark is not tracked"', () => {
				const error = detectJjError('Remote bookmark is not tracked');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
			});

			it('should detect "untracked remote bookmark"', () => {
				const error = detectJjError('Error: untracked remote bookmark main@origin');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
			});

			it('should detect "failed to push bookmarks"', () => {
				const error = detectJjError(
					'Failed to push some bookmarks to the remote'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('bookmark_error');
				expect(error?.recoverable).toBe(true);
			});
		});

		describe('not_a_repo errors', () => {
			it('should detect "no jj repo"', () => {
				const error = detectJjError(
					'There is no jj repo in "/home/user/project"'
				);
				expect(error).not.toBeNull();
				expect(error?.type).toBe('not_a_repo');
				expect(error?.recoverable).toBe(false);
			});

			it('should detect "not a jj repo"', () => {
				const error = detectJjError('Error: not a jj repo');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('not_a_repo');
			});

			it('should detect "could not find .jj"', () => {
				const error = detectJjError('Error: could not find .jj/ directory');
				expect(error).not.toBeNull();
				expect(error?.type).toBe('not_a_repo');
			});
		});

		describe('non-matching output', () => {
			it('should return null for empty string', () => {
				expect(detectJjError('')).toBeNull();
			});

			it('should return null for whitespace-only string', () => {
				expect(detectJjError('   \n  ')).toBeNull();
			});

			it('should return null for normal jj output', () => {
				expect(detectJjError('Working copy now at: abc123 (no description set)')).toBeNull();
			});

			it('should return null for success messages', () => {
				expect(detectJjError('Rebased 3 descendant commits')).toBeNull();
			});

			it('should return null for normal log output', () => {
				expect(
					detectJjError('abc12345 user@example.com 2024-01-15 fix: resolve compilation error')
				).toBeNull();
			});

			it('should return null for null-ish input', () => {
				expect(detectJjError(undefined as unknown as string)).toBeNull();
			});
		});

		describe('raw field', () => {
			it('should include the raw output in the error', () => {
				const stderr = 'No such change id: xyzpqr';
				const error = detectJjError(stderr);
				expect(error?.raw).toBe(stderr);
			});
		});

		describe('priority ordering', () => {
			it('should prioritize stale_working_copy over other types', () => {
				// If output contains both stale and conflict, stale should win since it's checked first
				const error = detectJjError('Working copy is stale with unresolved conflicts');
				expect(error?.type).toBe('stale_working_copy');
			});
		});
	});

	describe('matchJjErrorPattern', () => {
		it('should return error info for known jj errors', () => {
			const result = matchJjErrorPattern('Working copy is stale');
			expect(result).not.toBeNull();
			expect(result?.type).toBe('stale_working_copy');
			expect(result?.message).toBeDefined();
			expect(result?.recoverable).toBe(true);
		});

		it('should return null for non-matching input', () => {
			const result = matchJjErrorPattern('Everything is fine');
			expect(result).toBeNull();
		});

		it('should return null for empty string', () => {
			const result = matchJjErrorPattern('');
			expect(result).toBeNull();
		});

		it('should return the correct type for each category', () => {
			const testCases: Array<{ input: string; expectedType: string }> = [
				{ input: 'Working copy is stale', expectedType: 'stale_working_copy' },
				{ input: 'New conflicts appeared', expectedType: 'conflict' },
				{ input: 'No such change id: abc', expectedType: 'missing_change' },
				{ input: 'Authentication failed for remote', expectedType: 'auth_failure' },
				{ input: 'Concurrent operations detected', expectedType: 'concurrent_operation' },
				{ input: 'Commit abc123 is immutable', expectedType: 'immutable_change' },
				{ input: 'No such bookmark: main', expectedType: 'bookmark_error' },
				{ input: 'There is no jj repo', expectedType: 'not_a_repo' },
			];

			for (const { input, expectedType } of testCases) {
				const result = matchJjErrorPattern(input);
				expect(result).not.toBeNull();
				expect(result?.type).toBe(expectedType);
			}
		});
	});
});
