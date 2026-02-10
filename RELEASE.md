# Release Manual (Executor)

This repo publishes releases via GitHub Actions and tags.

## Conventions

- Versioning: SemVer `MAJOR.MINOR.PATCH`.
- Release tag format (IMPORTANT): `vX.Y.Z`.
  - Our automation triggers on tags matching `v*` (see `.github/workflows/release.yml`).
  - Obsidian sample docs sometimes say "tag without `v`"; that does NOT apply here.
- CI uses Node.js 20 (see `.github/workflows/ci.yml` / `.github/workflows/release.yml`).
- Releases are marked as *pre-release by default* (workflow sets `prerelease: true`).

## What gets published

The Release workflow uploads:

- `main.js`
- `manifest.json`
- `styles.css`
- `codexian-${version}.zip` (contains `main.js`, `manifest.json`, `styles.css`)

## Pre-flight checklist (local)

- On `main`, up to date, working tree clean.
- Update `manifest.json#minAppVersion` if required by the changes.
- Install deps: `npm ci`
- Verify:
  - `npm run lint`
  - `npm run build`
  - `npm test`

## Version bump (SemVer)

This repo keeps versions aligned via the npm lifecycle `version` script:

- `package.json#version` runs `node version-bump.mjs && git add manifest.json versions.json`
  - It sets `manifest.json#version` to match `package.json#version`.
  - It adds an entry to `versions.json` (key = new plugin version, value = `minAppVersion`).

Recommended bump commands (pick one):

```bash
# Patch/minor/major bump (creates a commit + tag by default)
npm version patch
npm version minor
npm version major

# Or set an exact version
npm version 1.2.3
```

Notes:

- `npm version ...` updates `package.json#version` and then runs the `version` script, which updates/stages `manifest.json` + `versions.json`.
- If you already changed `package.json#version` manually, you can run just:

```bash
npm run version
```

After bumping:

- Confirm `manifest.json` and `versions.json` are updated and staged.
- Push the bump commit.

## Release (GitHub)

Two supported ways:

### A) Tag push (preferred)

`npm version ...` typically creates a git tag `vX.Y.Z`. Push commits and tags:

```bash
git push
git push --tags
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`.

### B) Manual dispatch

Run the "Release" workflow (`.github/workflows/release.yml`) via `workflow_dispatch`.

- Optional input `tag`: e.g. `v1.2.3`.
- If no input tag is provided and you are not on a `v*` tag ref, the workflow falls back to `v${manifest.json.version}`.

## Post-release checklist

- In GitHub Releases, confirm assets exist: `main.js`, `manifest.json`, `styles.css`, `codexian-<version>.zip`.
- Smoke test by installing the release artifacts in an Obsidian vault.
- When ready for a stable release, edit the GitHub Release and uncheck "Pre-release" (workflow defaults to pre-release).

## Release notes template

Copy/paste into the GitHub Release description if you want curated notes (the workflow also enables auto-generated notes).

```markdown
## Highlights
- 

## Breaking changes
- None

## Added
- 

## Changed
- 

## Fixed
- 

## Upgrade notes
- 

## Thanks
- 
```
