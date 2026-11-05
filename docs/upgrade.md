# DSH 升级 playbook

这套流程只在 DSH 发布新的 `rc` 或正式版时执行。alpha 版本不自动跟踪；需要时手动跑。

## 1. 发现新版本

每日 `dsh-watch` 工作流会检查 GitHub Releases，只关注 `dsh-vX.Y.Z` 和 `dsh-vX.Y.Z-rc.N`，有新版本就开一个 `DSH <version> compatibility` issue。

手动检查：

```sh
npm run compat:watch
```

需要认证时设置 `GITHUB_TOKEN`；本地直连 GitHub 不通时，先走隧道再运行。

## 2. 确定性检查

```sh
npm run compat:probe -- --dsh <version>
```

它会：

- 在 `.compat-tmp/` 下建临时 `DSH_HOME`；
- 从 `web` 模板建 probe profile（必须带 `@deepseek-ai/dsh-web-app`，否则客户端插件等于没测）；
- 把三个包 `npm pack` 成 tarball，装进 profile；
- 断言 `--dump-config` 里三行都在；
- 启动 web 若干秒，确认插件加载没有报错。

失败时加 `--keep` 保留临时目录，先看 stderr，再进目录手动跑 `dsh --profile probe --dump-config`。

## 3. 语义审查

确定性检查抓不到「名字没变、契约变了」的情况。把范围压到最小：

1. 打开 `tools/compat/surface.json`，只看列出的服务、插槽、工具、事件。
2. 在 DSH 源码里定位这些符号所属的包，只 diff 这些包：

   ```sh
   git -C /Users/lian/dev/deepseek-harness diff <old-tag> <new-tag> -- packages/<owner>/<package>
   ```

3. 把 surface、过滤后的 diff、插件源码一起交给 agent，要求输出迁移报告或 PR；人确认语义判断。
4. 不要给 agent 整个仓库的 diff。一个 rc 的 diff 可能有几千个文件，绝大部分与插件无关。

## 4. 本机验证

```sh
bash scripts/verify-local.sh
```

然后手动做 Desktop 检查：

1. 升级 DeepSeek Harness App，重启。
2. 打开插件页，确认 `dsh-mosaic`、`dsh-superpowers`、`dsh-view-background-jobs` 都已加载。
3. 打开 Background jobs 面板和 Mosaic 设置页。
4. 让模型渲染一个 `dsh-view` 回答，确认工具卡片和围栏都正常。

把结果写进 `docs/verification/<version>.md`：`status: passed` 表示确定性检查通过，`Desktop: passed` 表示桌面检查通过。

## 5. 记录与发布

三个包都记录已验证版本：

```sh
npm run compat:record -- --dsh <version> --package dsh-mosaic
npm run compat:record -- --dsh <version> --package dsh-superpowers
npm run compat:record -- --dsh <version> --package dsh-view-background-jobs
npm run compat:table
```

`compat:record` 要求 `docs/verification/<version>.md` 存在且 `status: passed`；它不会替你写验证结论。

只有 `dsh-mosaic` 发布。确认 `engines.dsh` 与已验证版本一致后：

```sh
npm run release -- dsh-mosaic patch --commit
git push origin main
git push origin v<version>
```

CI 的 `release` 工作流用 npm OIDC 发布；发布后确认：

```sh
npm view dsh-mosaic version
gh run list --workflow release.yml --limit 1
```

`dsh-superpowers` 和 `dsh-view-background-jobs` 只 bump 版本、写 CHANGELOG，不打 tag、不发布。

## 6. 失败处理

- probe 失败：先修代码，不要放宽 `engines.dsh`；修好后重跑 probe 和本机检查。
- 已发布版本有问题：发 patch，不删除 npm 版本。
- Desktop profile 链接失效：恢复 `~/.dsh/profiles/desktop/package.json.bak`，在 App 插件页按旧路径重新添加。
