# Security and privacy boundaries

The release contains application code and public dependency notices. It must
never contain real room captures, GM backups, personal configuration, credentials,
browser profiles, internal evidence or environment files.

## Before publication

- Publish the allowlisted repository tree, not a development workspace or its
  Git history. Publish only `.release/pages` to Pages.
- Run the full checks, dependency audit and release security scans. Scan the
  actual archives as well as the source and compiled site; inspect inventories.
- Source maps and environment-file loading are disabled. Build scripts do not
  inject credentials. Unexpected files, personal paths, addresses, geographic
  values and credential patterns block packaging. Scanner output is redacted.
- Pinned dependency versions and action commits reduce drift; they do not prove
  that dependencies have no unknown vulnerabilities. Rescan each release.
- Third-party licenses retain public upstream authors/contacts as legally
  required. These are not application users or developer-machine identities.

## Runtime data

The application has no analytics, account service, geolocation request or
external image/font service. It communicates with Owlbear through its SDK and
loads its own static assets. Hosting providers and Owlbear may process normal
web requests and client addresses under their own policies.

Player names/IDs, turn order and the playable board are intentionally shared
within the room. Scene token identifiers are game data, not authentication
credentials. Static release files contain no captured room state.

Seeds, solution orientations, lock opening angles, undiscovered piece definitions, GM notes and undo
checkpoints remain in the GM browser's localStorage or an explicitly downloaded
private backup. Public projections/exports use reviewed fields only.
Lock turn feedback is public gameplay information; the hidden opening angle is
not sent with it. Only the GM may replace a broken pick. Public screenshot
previews show original artwork with fictional/local demo data; the release
scanner permits only their exact paths and rejects image metadata chunks.

Private storage is not an encrypted vault. Other scripts on the same origin
can access that origin's storage; a dedicated extension host/origin is preferable
to one shared with unrelated applications. Private backups must be kept private.

Only the official Owlbear origins may embed the application. The reference
origin is validated before SDK initialization, and incoming messages must come
from that parent window. HTML includes a restrictive content policy and
no-referrer policy. Inline styles remain enabled for the board/3D renderer;
inline scripts, plugin objects and third-party frames are not allowed.

Imported files are size-limited and validated before review; restoration is
explicit and revision-fenced. Imported titles/notes are text, and SVG coordinate
labels are escaped. New instances/generations prevent replay of old requests.

This is a trusted-table extension, not a cheat-proof server. The GM/controller
checks roles and current connections, but room metadata is shared and the VTT
and other extensions remain part of the trust boundary. Do not put secrets or
credentials into scene metadata or rely on client code being hidden.

## Reporting a problem

Use a private reporting channel agreed with the repository owner. Never put
real tokens, private backups, room links, account details or screenshots with
personal information into a public issue. A reporting address should be chosen
by the owner before publication; no personal email is embedded here.
