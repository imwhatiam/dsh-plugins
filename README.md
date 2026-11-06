# dsh-plugins

DeepSeek Harness plugins maintained in one repository. The former standalone repositories were removed; this repository is the source of truth.

| Package | What it does | Distribution |
| --- | --- | --- |
| [`dsh-mosaic`](packages/dsh-mosaic) | Visual answers, `dsh-view` components, diagrams, widgets | npm + plugin market |
| [`dsh-superpowers`](packages/dsh-superpowers) | Superpowers skills and session bootstrap | local only |
| [`dsh-view-background-jobs`](packages/dsh-view-background-jobs) | Read-only background jobs panel | local only |

## Development

```sh
npm install
npm test
npm run pack:check
npm run compat:probe
```

See [`docs/upgrade.md`](docs/upgrade.md) for the DSH upgrade and release playbook.

<!-- compat:begin -->
| Package | Version | Verified DSH | engines.dsh |
| --- | --- | --- | --- |
| `dsh-mosaic` | 1.1.5 | 0.2.2-rc.1 | `>=0.2.1-rc.1 <0.3.0-0` |
| `dsh-superpowers` | 1.0.1 | 0.2.2-rc.1 | `>=0.2.2-rc.1 <0.3.0-0` |
| `dsh-view-background-jobs` | 0.1.0 | 0.2.2-rc.1 | `>=0.2.2-rc.1 <0.3.0-0` |
<!-- compat:end -->
