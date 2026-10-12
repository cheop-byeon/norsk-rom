# Repository workflow

When a requested change in this repository is complete and its relevant tests pass, stage only the files belonging to that change, create a concise commit, and push it to the current branch on `origin` without waiting for a separate commit/push request.

Do not force-push, rewrite published history, or push if the branch has diverged or the remote contains changes that need reconciliation. In those cases, stop before pushing and explain the conflict. Never deploy to a production service unless the user explicitly requests deployment.
