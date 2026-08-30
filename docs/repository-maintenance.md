# Repository maintenance

## Dependency updates

Dependabot checks npm dependencies and GitHub Actions every Monday. Compatible npm minor and patch updates are grouped by production or development usage. Major npm updates remain separate so their migration and compatibility risks can be reviewed explicitly. Action updates remain pinned to full commit SHAs.

Dependabot pull requests are not merged automatically. Each update must pass the required `checks` job and receive a manual review before it is merged.

## Protected branch

The `Protect main` repository ruleset applies to `main` and:

- requires the CI `checks` job to pass against the latest `main`;
- blocks force pushes; and
- blocks branch deletion.

The repository owner can bypass the ruleset from a pull request only to recover from a broken required check. Use that bypass for the smallest CI repair possible, verify the repaired workflow immediately, and return to the normal pull-request path. Direct pushes cannot use the bypass, and it must never be used to merge failing application changes.

If the ruleset itself is misconfigured, an administrator can disable it temporarily under **Settings > Rules > Rulesets > Protect main**, apply and verify the repair, then reactivate it. Record any emergency bypass or ruleset disablement in the related issue or pull request.
