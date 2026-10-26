# Historical credential exposure remediation

## Scope and status

A credential-like PostgreSQL connection string was found in the current changelog and in an older commit (September 2026). The current-tree reference is being replaced with a generic, non-credential connection-string template.

**This document does not claim the Git history has been rewritten.** Removing a secret from a current file or opening a pull request does not remove it from older Git objects, forks, cached views, or existing clones.

## Required incident response

1. Rotate the affected database credential before attempting history cleanup. Update the VPS secret file / encrypted vault and application configuration through the normal, backed-up deployment process. Do not paste credentials into issues, pull requests, chat, or command-line arguments.
2. Make a fresh, private local clone and a protected backup before rewriting history. Coordinate a maintenance window; rewriting history changes commit IDs and can disrupt open PRs and other clones.
3. Install and run Gitleaks locally (not in GitHub Actions) against all refs, including history. For example:
   `gitleaks git . --redact --log-opts="--all"`
   Review the tool's installed-version help if flags differ. Keep any raw report private; use redacted output only.
4. Prepare a local-only git-filter-repo replacement file outside the repository. Add the exposed value locally as a literal replacement rule mapping it to `***REMOVED***`; never commit or upload that replacement file.
5. Run `git filter-repo --replace-text <private-replacements-file> --force` on the private clone. Re-scan all refs and inspect the result before publishing.
6. After explicit coordination with collaborators, force-push the rewritten branches and tags using a carefully checked `--force-with-lease` workflow. Recreate or retarget affected PRs as needed. GitHub cached views, forks, and old clones may still retain copies; collaborators must re-clone or carefully reset.
7. Re-run the history scan and verify the credential no longer appears in any reachable branch/tag history. Keep the report redacted.

## Safety boundaries

- Do not run the history rewrite against the VPS production worktree.
- Do not modify the production database or secrets automatically from this document.
- Do not publish unredacted scanner output.
- A clean current branch is not proof that historical Git objects are clean.
