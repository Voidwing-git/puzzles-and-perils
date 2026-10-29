# Puzzles & Perils

Shared puzzles for Owlbear Rodeo. Start with a visual puzzle picker: runic
channels (flat boards, connected cube faces and a 4 x 4 x 1 dais) or lock picking.
Includes GM authoring, turns/free play, private backups, undo and pause/resume.
Local demonstration names are fictional.

Lock picking offers Novice (DC 5), Apprentice (DC 10), Adept (DC 15), Expert
(DC 20) and Master (DC 25). Drag the pick or use arrow keys to set its angle;
hold Space or the Turn control, releasing when the cylinder binds. Higher tiers
have narrower opening angles. DCs are table reference labels, not dice rolls.
Each lock starts with one pick. Sustained pressure at a bad angle breaks it;
only the GM can give another pick. The opening angle remains in private GM
storage and private backups. Artwork and preview screenshots are original.

New puzzles default to free play: any connected room member can rotate, place
and recall pieces without being in the turn order. The default roster follows
players joining while the GM view is open; a customized order is preserved.
Switching to turns loads current room players when the order is not customized.
The GM's **Event history** shows recent actions and is included in private backups.

## Release status

Version 0.9.0 is a hosted-testing candidate. Live multi-device/table
qualification is still pending; a successful deployment alone does not qualify
the multiplayer experience.

## Install in Owlbear

After a reviewed deployment, add the hosted `manifest.json` URL through the
Owlbear extension manager and enable it in the room. Players use the room's
enabled extension; each browser must be able to reach the host.

Right-click a scene token, choose **Make puzzle**, review the settings and
finalize. Players open the finalized puzzle from that token. The optional
Puzzle interaction tool supports double-click entry. Ordinary Move-tool
double-click remains owned by Owlbear.

After the Pages deployment succeeds, the install URL is:
`https://voidwing-git.github.io/puzzles-and-perils/manifest.json`.
A localhost address only works for browsers on the computer running that
local server. Keep a private backup before switching to the hosted origin.

## Development and checks

Use Node 24 and the locked dependencies:

```sh
npm ci --ignore-scripts
npm run build
npm run test
```

Browser checks require Microsoft Edge locally. In Linux CI, install Playwright
Chromium and set `PW_CHANNEL=chromium` before running `npm run test:browser`.
The SDK host tests intercept a synthetic document at Owlbear's origin; they
do not contact a live room or claim to qualify Owlbear's service.

To prepare reviewed source and Pages artifacts:

```sh
npm run security:install
npm run release:prepare -- --base /puzzles-and-perils/
```

Use `/` for an account-root site or the intended repository path for a project
site. The build rejects absolute URLs and traversal paths. The release script
uses an explicit file allowlist, privacy checks, checksum-pinned Gitleaks,
normalized ZIP metadata and file-by-file archive verification. Review
`artifacts/release-review.json` and the staged `.release` trees before publishing.
Never upload an entire development workspace.

## GitHub Pages

Use the reviewed repository ZIP as the starting repository contents. Do not
copy browser profiles, caches, internal notes, screenshots, test reports,
environment files or private puzzle saves. No existing Git history is included.

Choose the intended account, repository name and visibility before creating
or uploading a repository. The account/repository identity and commit metadata
are public GitHub information; use an appropriate nonpersonal account or
organization if that identity must not be associated with the site.

Set Pages to **GitHub Actions**. The provided deployment workflow is manual
(`workflow_dispatch`), uses pinned action commits, and uploads only the reviewed
Pages tree. It does not deploy on push. Enable a protected `github-pages`
environment/reviewer before triggering it. No personal access token is needed.

Keep a GM private backup before switching hosts. Browser private storage belongs
to an origin; localhost, a hosted site and another browser/device do not share it.
Open **Save / recovery**, import and review the private backup, then explicitly
replace the puzzle. The room and current roster remain the authority for shared
play. A public board export cannot recover hidden pieces or solutions.

## Hosted release qualification

Before tagging a release, record the exact source commit and Pages inventory:

- Install the deployed manifest, then open GM and player token windows.
- With one GM and two real players, solve a generated missing-piece puzzle.
- Verify turns, wrong-player rejection, undo, pause, reveal/placement/recall,
  private/public exports and restore. Check a flat, cube and dais puzzle.
- Close/reopen windows, leave/return to a scene, restart the GM session and
  restore on another device. Check that no stale move is applied twice.
- Check a real touch device, desktop layout and reduced-motion preference.
- Updates must preserve supported saves or reject incompatible saves clearly.

Local tests do not replace these checks. Tag the tested commit only after this
rehearsal is accepted; preserve the corresponding inventory hash.

## Troubleshooting and rollback

If remote players cannot load the extension, check its hosted HTTPS URL first.
If a second GM connection is open, close the extra connection. If private data
is missing or an action is unconfirmed, reopen the puzzle and explicitly import
a reviewed private backup. Do not retry an unconfirmed rotation as a fresh move.

For rollback, redeploy a previously reviewed commit using the manual workflow.
Retain private backups and the prior inventory. Do not run incompatible versions
against the same live room; imported unsupported formats must fail closed.

Read [SECURITY.md](SECURITY.md) before publication. Required upstream license
notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). A license for
project-owned source has not yet been selected.
