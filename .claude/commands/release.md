You are cutting a new release of pancakemaker. Follow these steps exactly:

## 1. Ask for bump type

Use AskUserQuestion to ask whether this is a **major**, **minor**, or **patch** release.

## 2. Determine the new version

Read the current version from the root `package.json`. Apply the semver bump:

- **patch**: 0.0.1 → 0.0.2
- **minor**: 0.0.1 → 0.1.0
- **major**: 0.0.1 → 1.0.0

## 3. Generate changelog entry

Run `git log --oneline <last-tag>..HEAD` to get all commits since the last release tag. If there are no tags yet, use all commits.

Group commits into categories based on prefixes:

- `feat:` → **Added**
- `fix:` → **Fixed**
- `chore:`, `ci:`, `docs:`, `refactor:`, `style:`, `test:` → **Changed**
- Commits without a conventional prefix → **Changed**

## 4. Update CHANGELOG.md

Insert a new section at the top (after the header), formatted as:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- commit message

### Fixed

- commit message

### Changed

- commit message
```

Only include sections that have entries. Use today's date.

## 5. Bump version in package.json

Update the `"version"` field in the root `package.json` to the new version.

## 6. Commit, tag, and push

```bash
git add CHANGELOG.md package.json
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```

## 7. Create GitHub release

Use `gh release create` with the tag, using the changelog section as the body.

## 8. Confirm

Tell the user the release is done and that the deploy workflow has been triggered. Provide a link to the GitHub Actions run.
