# Changelog

> 版本规则：插件版本与**最近一次验证通过的 DeepSeek Harness 版本**保持一致。当前对齐 `0.2.1`（实测 rc.3 与 rc.5）。
> 同一 Harness 版本下的插件自身改动，用「对齐版本 + `-<变更标签>`」表示（如 `0.2.1-zoom`；`0.2.1` 是 npm 上的发布版），标签写明这次改了什么；一旦换到新的 Harness 版本验证通过，版本号立即改成该 Harness 版本。

## 0.2.1-harden

- Widget 沙箱重建：整份文档（`doctype`/`html`/`head`/`body`）由宿主统一生成，模型内容只投放到宿主给出的 head/body 槽位，CSP 因此永远排在模型脚本之前。此前完整 HTML 文档走 `<\/head>` 前插入，模型写在 `<head>` 里的 `<script>` 会在 CSP 生效前执行；模型自带的 CSP `<meta>` 与 `<base>` 一并剥离。
- Widget 动作校验补上父窗口一侧：nonce 写在 Widget 自己的文档里，模型代码能读出来直接 `postMessage` 伪造，所以除 iframe 内的判断之外，父页面独立校验自己文档的 `navigator.userActivation`；iframe 内的判断同时改为 fail-closed。额度从「每个 Widget 一份」改为**整个会话共享**，payload 上限按 UTF-8 **字节**（16 KB）而不是字符数计算。
- 自有路由增加 Host 权威校验：`/dsh-mosaic/prompt` 与 `/dsh-mosaic/log` 只接受 loopback、监听地址或 `config.trustedHosts` 声明的授权。仅比较 Origin 与 Host 挡不住 DNS rebinding——被 rebinding 的请求两者都等于攻击者域名。
- Prompt 状态：`reset` 不再被迟到的 `hydrate` 覆盖（用独立标志区分「还没读过」和「用户刚清空」）；`GET` 返回 `revision`，`POST` 可带 `expectedRevision`，对不上返回 409 并附当前内容，跨浏览器编辑不再静默覆盖。
- 日志路由在 `flush` 之后才回 204，204 变成真正的落盘回执；测试改为等待具体事件而不是「目录里有任意 jsonl」，修掉那条在 CI 上必然失败的竞态。
- 缩放/平移：触屏改为 `touch-action: pan-y`，手指上下划可以继续滚动聊天页面；ResizeObserver 里不再在 `setZoom` 的 updater 内调用 `setOverflowing`，两个更新都在回调顶层发出。
- 测试：新增 `test/client.test.mjs`（Widget 文档构造：CSP 顺序、外壳唯一性、剥离模型 CSP/base、bridge 策略），以及 Host 权威、reset/hydrate 竞态、revision 冲突的回归用例。`npm test` 现为 78 项。

## 0.2.1-zoom

- 示意图与图表可以缩放和拖动：右上角 `−`/`+`/`⟲`/`⤢`，视图内按住拖动平移，`Ctrl/⌘ + 滚轮`缩放，双击或 `⟲` 复位，键盘 `+`/`-`/`0` 同样可用；`⤢` 在遮罩层里打开更大的画布。
- 示意图保留原始尺寸（不再被压缩到卡片宽度），超出部分在视口里裁切、可拖动查看。
- 修复外观切换后 Mermaid 重渲染报 `Unsupported color format: "currentColor"`、随后掉到内置布局的问题：主题变量的兜底改用具体颜色。

## 0.2.1


- Prompt 注册的生命周期修正：更新或读取覆盖之后，插件卸载会撤销**当前**的 section（此前留下的是第一个）；异步读取在卸载后不再注册。
- Prompt 读取接口也做同源校验；响应不再包含 Host 绝对路径；并发保存串行化，磁盘与状态不会再分叉。
- 覆盖文件改为原子写入：同目录独占临时文件 + `fsync` + `rename` + 目录同步，权限 `0600`；失败时旧文件保持原样，临时文件清理。
- 读取覆盖时区分「文件不存在」「内容损坏」「不可读」：后两种会在设置页提示并按内置内容运行，原文件保留以便修复。
- Widget 动作三重限制：默认要求真实用户手势（`navigator.userActivation`）、每分钟最多 10 次、单次 payload 不超过 16 KB；需要自动提交时在节点上显式写 `actions: "programmatic"`。
- `SKILL.md` 的 frontmatter 描述加上引号，成为合法 YAML。
- 删除仅被测试引用的 `lib/widget.js`（与客户端沙箱文档重复且已分叉）。
- 新增诊断日志：`$DSH_HOME/logs/dsh-mosaic/<日期>.jsonl`，一行一个结构化事件（激活/停用、Prompt 生命周期、工具执行、路由、技能、浏览器侧失败），按天分文件、2 MB 滚动、保留 7 天、权限 `0600`；用户内容只记长度不记正文；`config.logLevel` 可调级别。

## 0.4.1

- Mermaid now ships as the unmodified official 12.2.0 distribution
  (`lib/assets/mermaid.min.js`, MIT) instead of a wrapper derived from another
  plugin. Rendering, theme mapping and SVG sanitizing are this package's own code.
- The lazy asset URL is versioned (`?v=…`) and answered with an immutable cache entry;
  the client asks the Host for the URL first and keeps one literal fallback.
- `THIRD_PARTY_NOTICES.md` lists every dependency bundled inside the Mermaid build with
  its license, and the license texts ship under `lib/assets/licenses/`.
- The bundle patch no longer disables another plugin: it only inserts this package's
  row.

## 0.4.0

- One visual style: the three-theme system (编辑 / 卡片 / 玻璃), its picker, tokens and
  stored keys are removed.
- The model prompt is editable again, this time properly: the settings page shows the
  effective text (the built-in prompt by default), saves an override, and restores the
  default. Precedence is user override > `config.prompt` > built-in; the override lives
  in the Host data directory, and the write route accepts same-origin JSON only.
- Visible UI copy moved to the Client locale service with `en` and `zh` dictionaries.
- Styles are tagged with this package's identity so the client module system can reclaim
  them; resources register through named effects.
- The fullscreen surface renders through a portal inside its own component instead of a
  second React root on `document.body`.
- The lazy Mermaid asset moved to the package-private `/dsh-mosaic/assets` route and
  registers on `window.__MosaicAssets__`.
- Theme values come from host tokens only; the plugin no longer guesses light/dark.
- The settings page is a localized explanation of the config key; copying a block's JSON
  moved into the block header.
