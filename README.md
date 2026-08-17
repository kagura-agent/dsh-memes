<h1 align="center">dsh-memes</h1>

<p align="center">
  <strong>Meme plugin for DeepSeek Harness — 没有表情包的 agent 是没有灵魂的</strong><br/>
  <a href="https://badgen.net/badge/license/MIT/green"><img src="https://badgen.net/badge/license/MIT/green" alt="license" /></a>
  <a href="https://badgen.net/badge/tests/26%20passing/green"><img src="https://badgen.net/badge/tests/26%20passing/green" alt="tests" /></a>
</p>

给 DSH agent 一个 `pick_meme` 工具：当对话需要情绪表达时，agent 直接调用，从
[kagura-agent/memes](https://github.com/kagura-agent/memes) 表情库（26 分类、270+ 张图）里
按语义标签选出最贴合的 reaction 图。

## 为什么

Agent 没有表情包就没有灵魂。DSH 生态刚起步，meme/reaction 是空白位——我们把成熟的
tags.json 语义匹配资产接进来，让 DSH agent 能像人一样用图表达情绪。

## 安装（自动启用）

本包声明了 `dsh.bundle.patch` → `cordis.patch.yml`，安装即自动成为 profile 的一个 patch 层，
**无需手动编辑 cordis.patch.yml**：

```sh
dsh plugin --profile web add /path/to/dsh-memes
```

配置 HMR 实时生效，无需重启。

## 使用

agent 想表达情绪时调用 `pick_meme`，聊天窗口直接渲染 GIF：

```text
pick_meme(mood: "frieren cringe")
→ facepalm/frieren-cringe.gif  https://media.githubusercontent.com/media/kagura-agent/memes/f360607c/facepalm/frieren-cringe.gif
```

### 聊天窗口内直接显示（Web Client）

默认的 DSH Tool Card 会把非文本结果 `JSON.stringify()` 后塞进 `<pre>`（显示成代码块）。
本插件自带 Web Client，注册了 `pick_meme` 专用 Tool View（keyed `tool.call.toolview`），
把返回的 GIF 直接渲染成 `<img>` 网格：

```tsx
<img src={meme.url} alt={meme.file} />
```

> ⚠️ **LFS 坑**：memes repo 的图片是 Git LFS 对象。`raw.githubusercontent.com` 返回的是
> LFS 指针文本（`version https://git-lfs.github.com/spec/v1…`），不是图片字节；
> `<img>` 会渲染成一坨指针。因此 URL 必须用 `media.githubusercontent.com/media/...`（固定 revision）。
> 这个坑已在 v0.3 修复（最初版本用了 raw 域名，图片显示不出来）。

### 匹配策略

1. **alias** — 常见情绪词 → 规范分类（`proud` → `approve`，`good morning` → `greeting-morning`）
2. **category** — 精确分类命中（`facepalm` → facepalm/ 全组）
3. **tag** — 多 token 语义匹配（`frieren cringe` → tags `[frieren, cringe]` 全中）
4. **random** — 兜底随机（保证永远有输出）

## 架构

```text
src/
├── index.js      # 薄插件入口：注册 tool，注入 tags store
├── tool.js       # pick_meme 工具定义（schema + render + execute）
├── match.js      # 纯函数匹配管线（alias → category → tag → random）
├── network.js    # 远程资源层：tags.json 获取 + 校验 + 缓存
└── client.js     # Web Client：pick_meme 专用 Tool View（<img> 渲染）
tests/
└── dsh-memes.test.js   # 26 个测试，node:test 零依赖
```

### 远程资源策略

- **固定 revision**：图片 URL 和 tags.json 都钉死在 commit `f360607c`，结果可复现
- **LFS-safe URL**：图片走 `media.githubusercontent.com/media/`（raw 域名会返回 LFS 指针文本）
- **并发缓存**：1h TTL，并发调用共享同一个 in-flight fetch（只发一次请求）
- **超时错误**：10s AbortController 超时，超时抛 `TagsError`
- **数据校验**：`validateTags` 严格校验结构（object、文件 key 必须含 `/`、tag 非空、体积上限 1MB），坏数据大声失败而非静默错配
- **失败自愈**：fetch 失败清缓存，下一次调用自动重试

## License 设计

插件本身 **零版权字节**：图片不内嵌，全部运行时从 memes repo 通过
`raw.githubusercontent.com` 引用（固定 commit）。插件代码 MIT，图片版权归各自来源
（Giphy/Tenor/CC0），责任边界清晰。

## 路线图

- [x] MVP：`pick_meme` tool（选图 + URL）
- [x] bundle 自动启用（`dsh.bundle.patch`）
- [x] 模块拆分 + 26 个测试
- [x] 远程资源加固（并发缓存 / 超时 / 校验 / 固定 revision）
- [x] Web Client：pick_meme 专用 Tool View，聊天窗口直接显示 GIF
- [x] LFS 坑修复：URL 改用 media.githubusercontent.com
- [ ] `send_meme` / 消息上下文自动匹配
- [ ] 接入 DSH discussions 生态发布

## License

MIT © Kagura
