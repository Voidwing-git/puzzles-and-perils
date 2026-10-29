# Puzzles & Perils

Shared puzzles for Owlbear Rodeo. Start with a visual puzzle picker: runic
channels (flat boards, connected cube faces and a 4 x 4 x 1 dais), lock picking,
rotating ring doors, word terminals, spectral analysis, wave harmonics and
seven styles of hacking console.
Includes GM authoring, turns/free play, private backups, undo and pause/resume.
Local demonstration names are fictional.

Lock picking offers Novice (DC 5), Apprentice (DC 10), Adept (DC 15), Expert
(DC 20) and Master (DC 25). Move the mouse over the lock to aim, then hold the
left mouse button to turn. Arrow keys with Space and a separate Turn control
are also available. Closer angles let the cylinder turn farther before binding.
Release when it binds; a steady hold in the safe zone opens the lock. Higher
tiers have narrower zones and less time before a binding pick breaks.
The GM builder shows the exact angle, a shaded slice and a range bar; player
views never receive that overlay. DCs are table reference labels, not dice rolls.
Each lock starts with one pick. Sustained pressure at a bad angle breaks it;
only the GM can give another pick. The opening angle remains in private GM
storage and private backups. Artwork and preview screenshots are original.
Pick health is visible only in GM view; players use the turning, binding and
breakage feedback. Visual tension responds immediately while successful opening
and pick damage still require the controller's confirmation.

Ring doors have three concentric rings using three of nine original symbols:
Bear, Moth, Owl, Wolf, Serpent, Stag, Fox, Raven and Dragon. Randomize changes
the symbol set, opening combination and starting positions together. Old doors
retain their original symbols. Click a ring or its button
to rotate it; matching the GM's private combination opens the stone door with
an animation. Set the combination in the builder and provide any clue elsewhere
in your adventure. This version does not create or require a puzzle-key item.

The puzzle picker includes actual gameplay screenshots for every type:

- **Word terminal:** twelve five-letter candidates, positional likeness,
  four attempts, and single-use bracket tools. A lockout waits for the GM.
- **Spectral analysis:** combine three additive/subtractive fragments to match
  absorption lines. The GM chooses 1–6 samples for completion.
- **Wave harmonics:** drag the wavelength and amplitude dials (or use their
  sliders/arrow keys) to match the dashed target. The GM chooses 1–5 signals.
- **Hex circuits:** rotate seven hex tiles; right click reverses rotation.
- **Timing pins:** a rotating sweep sets/releases pins and reverses direction.
- **Glyph cipher:** match three pairs of original glyphs to the visible clues.
- **Mirror console:** aim a reflected pointer at illuminated nodes.
- **Orbit lock:** catch dots on three rotating rings, holding through long arcs.
- **Symbol stream:** hold and release the capture control over required glyphs.
- **Data worm:** steer around obstacles and collect all five runes; Space boosts.

These are original tabletop adaptations inspired by familiar game mechanics,
not exact replicas. Timing consoles start explicitly, stop on focus loss, and
use five mistakes instead of a countdown. Failed attempts wait for the GM's
**Allow another attempt** control. Turn order, free play, undo, pause, solve,
reset and private backups also work with these puzzles. Animation clocks and
hit timing run locally; controller validation enforces room identity, turns,
revision and completion rules, not competitive anti-cheat timing.

New puzzles default to free play: any connected room member can rotate, place
and recall pieces without being in the turn order. The default roster follows
players joining while the GM view is open; a customized order is preserved.
Switching to turns loads current room players when the order is not customized.
The GM's **Event history** shows recent actions and is included in private backups.

## Release status

Version 0.11.0 is a hosted-testing candidate. Live multi-device/table
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
