/**
 * Test fixtures for jj IPC handler integration tests.
 *
 * Contains realistic sample outputs from various jj commands,
 * organized by command type. These fixtures match the actual output
 * format of jj CLI to ensure parsing fidelity.
 */

// ============================================================================
// jj --version outputs
// ============================================================================

export const JJ_VERSION_OUTPUT = 'jj 0.24.0\n';
export const JJ_VERSION_PRERELEASE = 'jj 0.25.0-dev.1\n';

// ============================================================================
// jj status outputs
// ============================================================================

export const JJ_STATUS_EMPTY = '';

export const JJ_STATUS_SINGLE_MODIFIED = `Working copy changes:
M src/main.ts
Working copy : yqosmzpn 3f2a8b1c (no description set)
Parent commit: rlvkpnrz 7a4e9d0f main | initial commit
`;

export const JJ_STATUS_MULTIPLE_CHANGES = `Working copy changes:
A src/new-file.ts
M src/main.ts
M src/utils/helpers.ts
D src/old-file.ts
Working copy : yqosmzpn 3f2a8b1c add new feature
Parent commit: rlvkpnrz 7a4e9d0f main | initial commit
`;

export const JJ_STATUS_CONFLICTS = `Working copy changes:
M src/main.ts
There are unresolved conflicts at these paths:
src/main.ts    2-sided conflict
Working copy : yqosmzpn 3f2a8b1c (conflict) (no description set)
Parent commit: rlvkpnrz 7a4e9d0f main | initial commit
`;

// ============================================================================
// jj bookmark list outputs
// ============================================================================

export const JJ_BOOKMARKS_EMPTY = '';

export const JJ_BOOKMARKS_SIMPLE = `main: rlvkpnrz 7a4e9d0f initial commit
feature-x: yqosmzpn 3f2a8b1c add feature x
`;

export const JJ_BOOKMARKS_WITH_REMOTE = `main: rlvkpnrz 7a4e9d0f initial commit
  @origin: rlvkpnrz 7a4e9d0f initial commit
feature-x: yqosmzpn 3f2a8b1c add feature x
  @origin (ahead by 1 commits): sqptruyz 8b5d2e1a old feature x
`;

// ============================================================================
// jj log outputs (using JJ_LOG_TEMPLATE format with \x1f separators)
// ============================================================================

/** Single entry: working copy change */
export const JJ_LOG_SINGLE = [
	'yqosmzpn\x1f3f2a8b1cdef456\x1fadd new feature\x1ffalse\x1fJohn Doe\x1fjohn@example.com\x1f2024-06-15T10:30:00-07:00\x1fmain',
].join('\n');

/** Multiple log entries with various states */
export const JJ_LOG_MULTIPLE = [
	'yqosmzpn\x1f3f2a8b1cdef456\x1frefactor: improve error handling\x1ffalse\x1fJohn Doe\x1fjohn@example.com\x1f2024-06-15T10:30:00-07:00\x1ffeature-x',
	'rlvkpnrz\x1f7a4e9d0fabc123\x1ffix: resolve null pointer in parser\x1ffalse\x1fJane Smith\x1fjane@example.com\x1f2024-06-14T16:45:00-07:00\x1fmain',
	'sqptruyz\x1f8b5d2e1aghi789\x1finitial commit\x1ffalse\x1fJohn Doe\x1fjohn@example.com\x1f2024-06-13T09:00:00-07:00\x1f',
].join('\n');

/** Log entry with empty change (no files modified) */
export const JJ_LOG_EMPTY_CHANGE = [
	'xyzpqrmn\x1fabcdef01234567\x1f\x1ftrue\x1fJohn Doe\x1fjohn@example.com\x1f2024-06-15T12:00:00-07:00\x1f',
].join('\n');

/** Log entry with multiple bookmarks */
export const JJ_LOG_MULTI_BOOKMARK = [
	'yqosmzpn\x1f3f2a8b1cdef456\x1frelease v1.0\x1ffalse\x1fJohn Doe\x1fjohn@example.com\x1f2024-06-15T10:30:00-07:00\x1fmain release-1.0 latest',
].join('\n');

// ============================================================================
// jj diff outputs (unified diff format)
// ============================================================================

/** Simple single-file modification diff */
export const JJ_DIFF_SINGLE_MODIFIED = `diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,6 @@
 import { app } from 'electron';
+import { logger } from './utils/logger';

 function main() {
-  console.log('starting');
+  logger.info('starting application');
   app.start();
 }
`;

/** New file added */
export const JJ_DIFF_NEW_FILE = `diff --git a/src/new-feature.ts b/src/new-feature.ts
--- /dev/null
+++ b/src/new-feature.ts
@@ -0,0 +1,10 @@
+export class NewFeature {
+  private name: string;
+
+  constructor(name: string) {
+    this.name = name;
+  }
+
+  greet(): string {
+    return \`Hello from \${this.name}\`;
+  }
+}
`;

/** File deleted */
export const JJ_DIFF_DELETED_FILE = `diff --git a/src/deprecated.ts b/src/deprecated.ts
--- a/src/deprecated.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunction() {
-  return 'deprecated';
-}
`;

/** Multi-file diff combining add, modify, and delete */
export const JJ_DIFF_MULTI_FILE = `diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
 import { app } from 'electron';
+import { newModule } from './new-module';

 function main() {
diff --git a/src/new-module.ts b/src/new-module.ts
--- /dev/null
+++ b/src/new-module.ts
@@ -0,0 +1,3 @@
+export function newModule() {
+  return 'new';
+}
diff --git a/src/old-module.ts b/src/old-module.ts
--- a/src/old-module.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldModule() {
-  return 'old';
-}
`;

/** Empty diff (no changes) */
export const JJ_DIFF_EMPTY = '';

// ============================================================================
// jj new outputs (stderr-based, jj writes to stderr for status messages)
// ============================================================================

export const JJ_NEW_SUCCESS = 'Working copy now at: xyzpqrmn abcdef01 (empty) (no description set)';
export const JJ_NEW_FROM_REVISION = 'Working copy now at: mnopqrst 12345678 (empty) (no description set)';

// ============================================================================
// jj describe outputs
// ============================================================================

export const JJ_DESCRIBE_SUCCESS = 'Working copy now at: yqosmzpn 3f2a8b1c fix: resolve parsing bug';

// ============================================================================
// jj squash outputs
// ============================================================================

export const JJ_SQUASH_SUCCESS = 'Rebased 1 descendant commits\nWorking copy now at: rlvkpnrz 7a4e9d0f (empty) (no description set)';

// ============================================================================
// jj abandon outputs
// ============================================================================

export const JJ_ABANDON_SUCCESS = 'Abandoned commit yqosmzpn 3f2a8b1c';
export const JJ_ABANDON_WITH_DESCENDANTS = 'Abandoned commit yqosmzpn 3f2a8b1c\nRebased 2 descendant commits';

// ============================================================================
// jj edit outputs
// ============================================================================

export const JJ_EDIT_SUCCESS = 'Working copy now at: rlvkpnrz 7a4e9d0f fix: resolve parsing bug';

// ============================================================================
// jj bookmark operations outputs
// ============================================================================

export const JJ_BOOKMARK_CREATE_SUCCESS = 'Created 1 bookmarks pointing to yqosmzpn';
export const JJ_BOOKMARK_DELETE_SUCCESS = 'Deleted 1 bookmarks.';
export const JJ_BOOKMARK_SET_SUCCESS = 'Updated 1 bookmarks to rlvkpnrz';
export const JJ_BOOKMARK_TRACK_SUCCESS = 'Started tracking 1 remote bookmarks.';

// ============================================================================
// jj git operations outputs
// ============================================================================

export const JJ_GIT_FETCH_SUCCESS = 'Fetching from origin\nNothing changed.';
export const JJ_GIT_FETCH_WITH_UPDATES = 'Fetching from origin\nbookmark main@origin now at 7a4e9d0f';
export const JJ_GIT_PUSH_SUCCESS = 'Branch changes to push to origin:\n  Move forward bookmark main from abc123 to def456';
export const JJ_GIT_CLONE_SUCCESS = 'Fetching into new repo in "/tmp/target/my-repo"\nSetting the revset alias "trunk()" to "main@origin"';

// ============================================================================
// Common error outputs
// ============================================================================

export const JJ_ERROR_STALE_WORKING_COPY =
	'The working copy is stale (since 2024-06-15 10:30:00). Run `jj workspace update-stale` to update.';

export const JJ_ERROR_CONFLICTS =
	'New conflicts appeared in these commits:\n  yqosmzpn 3f2a8b1c (conflict) add feature';

export const JJ_ERROR_MISSING_REVISION =
	'Error: Revision "nonexistent" doesn\'t exist';

export const JJ_ERROR_AUTH_FAILURE =
	'could not read Username for \'https://github.com\': terminal prompts disabled';

export const JJ_ERROR_SSH_AUTH =
	'Permission denied (publickey,keyboard-interactive).';

export const JJ_ERROR_CONCURRENT_OP =
	'The repo was loaded at operation abc123, which is not the most recent operation';

export const JJ_ERROR_IMMUTABLE =
	'Refusing to modify immutable commit rlvkpnrz 7a4e9d0f';

export const JJ_ERROR_BOOKMARK_EXISTS =
	'Error: Bookmark already exists: main';

export const JJ_ERROR_NO_SUCH_BOOKMARK =
	"Error: No such bookmark: nonexistent-branch";

export const JJ_ERROR_NOT_A_REPO =
	'There is no jj repo in "/home/user/random-dir"';

export const JJ_ERROR_PUSH_REJECTION =
	'Error: failed to push some refs to \'origin\'';

export const JJ_ERROR_NOTHING_TO_SQUASH =
	'Error: The working copy has no changes to squash into the parent.';

export const JJ_ERROR_REMOTE_BOOKMARK_NOT_TRACKED =
	'Error: untracked remote bookmark main@origin';
