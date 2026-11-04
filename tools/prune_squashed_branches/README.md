# Prune squash-merged local branches

Interactive helper for cleaning up **local** branches after a squash merge
into `main`. Commit hashes alone cannot prove that a squash-merged branch
has already been applied, so the helper checks whether squash-merging a
candidate into `main` would produce an empty diff.

Run from inside the Git repository:

```sh
python tools/prune_squashed_branches/src/main.py
```

The helper skips `main` and the currently checked-out branch, checks
candidates in a temporary worktree, and lists branches it considers
redundant. It deletes nothing unless you type exactly `yes`; deletion
uses Git's forced local branch deletion. It does not delete remote refs.

Make sure the local `main` reference is current before running the check.
Review the proposed branch names: a matching squash result does not establish
that every branch has been archived or that its history is no longer needed.
