# Publishing dsh-mosaic

`dsh-mosaic` is the only package in this monorepo that publishes to npm. The repository is `imwhatiam/dsh-plugins`; the package lives in `packages/dsh-mosaic`.

## Before a release

1. Run `npm test`, `npm run pack:check`, and `npm run compat:probe` from the repository root.
2. Update the compatibility table in `packages/dsh-mosaic/README.md` after a real DSH verification.
3. Confirm `package.json` points at the monorepo:
   - `repository.url` is `git+https://github.com/imwhatiam/dsh-plugins.git`
   - `repository.directory` is `packages/dsh-mosaic`
4. Confirm `npm pack --dry-run` includes `lib/assets/mermaid.min.js`, `screenshots.json`, and `assets/screenshots/`.

## Release

From the repository root:

```sh
npm run release -- dsh-mosaic patch --commit
git push origin main
git push origin v<version>
```

The `release` workflow publishes with npm OIDC. Confirm the published version and the workflow run:

```sh
npm view dsh-mosaic version
gh run list --workflow release.yml --limit 1
```

## Catalog

Catalog submission to `awesome-dsh-plugin` is paused. Do not submit this package until the repository owner asks for it.

## Repository hygiene

- Do not commit `node_modules/`, `.pnpm-store/`, `.DS_Store`, or tarballs.
- Keep `LICENSE`, `THIRD_PARTY_NOTICES.md`, and the Mermaid asset attribution.
- The bundle patch only inserts this plugin's row; it never disables or patches another package.
- The Mermaid asset is lazy-loaded from the npm tarball.
- The widget is an opaque-origin sandbox with no network.
