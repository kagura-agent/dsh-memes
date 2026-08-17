<h1 align="center">dsh-memes</h1>

<p align="center">
  <strong>Meme plugin for DeepSeek Harness — 没有表情包的 agent 是没有灵魂的</strong><br/>
  <a href="https://badgen.net/badge/license/MIT/green"><img src="https://badgen.net/badge/license/MIT/green" alt="license" /></a>
</p>

给 DSH agent 一个 `pick_meme` 工具：当对话需要情绪表达时，agent 直接调用，从
[kagura-agent/memes](https://github.com/kagura-agent/memes) 表情库（26 分类、270+ 张图）里
按语义标签选出最贴合的 reaction 图。

## 为什么

Agent 没有表情包就没有灵魂。DSH 生态刚起步，meme/reaction 是空白位——我们把成熟的
tags.json 语义匹配资产接进来，让 DSH agent 能像人一样用图表达情绪。

## 安装

```sh
dsh plugin --profile web add /path/to/dsh-memes
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 加一行：

```yaml
- insert:
    - id: memes
      name: 'dsh-memes'
      config: {}
```

配置 HMR 实时生效，无需重启。

## 使用

agent 想表达情绪时调用 `pick_meme`：

```text
pick_meme(mood: "frieren cringe")
→ facepalm/frieren-cringe.gif  https://raw.githubusercontent.com/kagura-agent/memes/main/facepalm/frieren-cringe.gif
```

### 匹配策略

1. **alias** — 常见情绪词 → 规范分类（`proud` → `approve`，`good morning` → `greeting-morning`）
2. **category** — 精确分类命中（`facepalm` → facepalm/ 全组）
3. **tag** — 多 token 语义匹配（`frieren cringe` → tags `[frieren, cringe]` 全中）
4. **category-substring** — 单 token 分类子串
5. **random** — 兜底随机（保证永远有输出）

## License 设计

插件本身 **零版权字节**：图片不内嵌，全部运行时从 memes repo 通过
`raw.githubusercontent.com` 引用。插件代码 MIT，图片版权归各自来源
（Giphy/Tenor/CC0），责任边界清晰。

## 路线图

- [x] MVP：`pick_meme` tool（选图 + URL）
- [ ] conversation node 渲染：让图直接蹦进 DSH 对话流
- [ ] `send_meme` / 消息上下文自动匹配
- [ ] 接入 DSH discussions 生态发布

## License

MIT © Kagura
