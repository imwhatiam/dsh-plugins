# Changelog

> 版本规则：插件版本按 npm 语义独立递增，**不再与 DeepSeek Harness 版本号对齐**。
> 兼容性分两处表达：`package.json` 的 `engines.dsh` 给机器可读的范围，README「安装」一节给「插件版本 ↔ 实测 Harness 版本」对照表；每次在真实 Harness 上验证后更新这两处。
> `0.2.1` 及各 `0.2.1-<标签>` 是改规则前的历史版本，保留用于追溯。

## 1.1.0

### 示意图

- `diagram` 从 4 种扩到 13 种。新增 `quadrant`、`tree`、`funnel`、`venn`、`swimlane` 由插件自己排布（与 `timeline`、`layers` 同一条原生 SVG 路线，不依赖图引擎）；新增 `state`、`er`、`gantt`、`mindmap` 走 Mermaid 语法。
- `legend: [{label, tone}]`：给颜色加说明，所有图类型通用，渲染在卡片下方。
- 节点按标签文字估宽，不再固定宽度后截断成省略号；`tree` 的父节点按子树居中，`swimlane` 的列宽随步数自适应，`quadrant` 的标签相撞时自动下移。
- 修复同页多张图共用 `#mosaic-arrow` / `#mosaic-seq-arrow` 的问题：marker id 现在按组件实例生成。

### 导出

- 每个 diagram 卡片新增 `svg` 与 `png` 导出。导出前用 `getComputedStyle` 把主题令牌解析成实际颜色并内联，去掉仍带 `var(--m-*)` 的表现属性，因此文件脱离页面也能正常显示；PNG 以 2 倍尺寸光栅化，并先铺卡片背景。

### 视觉修正

- 列表圆点和链接箭头改用 `1lh` 定高，跟随实际行高居中；此前用写死的像素偏移，宿主行高不同就会一个偏高、一个偏低。
- 柱状图柱宽封顶 28px 并在分类槽里居中，多序列组内留 4px 间距；此前柱宽按分类宽度等比放大，7 个分类时每根接近 60px。
- Mermaid 输出的 SVG 带 `width="100%"`，插件此前用 `max-width:none` 去掉上限，导致整图被拉到卡片宽度、文字跟着放大。现在按 `viewBox` 钉回自然尺寸，并套用与原生示意图相同的高度上限。
- ER 与 sequence 在 Mermaid 内部写死 14px / 16px，不认 `themeVariables.fontSize`；统一归一到 12px，作用域限定在该 SVG 自己的 id 上。
- `row` 的子节点原本套着一层 `.mosaic-grid-item`，`col` 的百分比宽度会按这层收缩到内容宽度的包装计算（40% 只剩 30px）。改用 `display:contents` 让 `col` 直接作为 flex 子项，两栏按比例分配并吸收间距。
- README 的效果图按修复后的渲染重新截图。

### 校验与建议

- `validate_view` 与 `render_view` 新增 `warnings=`：视图合法但超出可读规模时给出具体改法（表格超过 8 行、列表超过 7 项、图表点数为 1、`accent` 用在超过 2 个元素、卡片嵌套超过 2 层、某类图超过自己的规模、`widget` 引用外部资源）。这些只是建议，不影响渲染。
- 模型侧提示词与 `SKILL.md` 增加反模式清单、焦点规则和每类图的可读规模；`SKILL.md` 补全 13 种图的字段说明与选型表。

## 1.0.0

首个稳定版，也是 npm 上第一次发布的完整版本（`0.2.1` 之后的所有改动都在这里）。

- 版本规则变更：不再与 DeepSeek Harness 版本号对齐。此前用 `0.2.1-<标签>` 表示「对齐 0.2.1 的本地改动」，但这类版本在 semver 里是**预发布**（`0.2.1-harden < 0.2.1`），既不会被 `npm i` 选中，发布时还必须显式 `--tag`。兼容范围改由 `engines.dsh` 与 README 的对照表表达。
- 发布自动化：新增 tag 触发的发布工作流（`.github/workflows/release.yml`），使用 npm trusted publishing（OIDC，无需长期 token），并在发布前校验 tag 与 `package.json` 版本一致、该版本尚未发布。

### 功能（此前未发布）

- 示意图与图表支持缩放/平移：`−`/`+`/`⟲`/`⤢`、拖动平移、`Ctrl/⌘ + 滚轮`、双击复位、键盘 `+`/`-`/`0`；示意图按原始尺寸渲染，超出部分裁切可拖动。

### 安全与状态修正

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
