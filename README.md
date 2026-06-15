# Discourse Read Boost

[![GPLv3 License](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

[Discourse Read Boost](https://greasyfork.org/scripts/519843-linuxdo-readboost) 是一个 Tampermonkey / Violentmonkey 用户脚本，用于在 Discourse 论坛帖子页自动提交阅读时间，提升已读统计。脚本开源、参数可配置，并尽量保持温和的请求节奏。

## 风险提示

使用第三方脚本可能违反站点规则，也可能导致账号被限制、封禁或脚本失效。请在安装前自行审计源码，并自行承担使用后果。作者不对账号风险、数据损失或站点兼容性作任何承诺。

本脚本不会主动绕过论坛检测机制，也不保证所有 Discourse 站点都能长期可用。

## 支持站点

当前元数据匹配以下 Discourse 站点的 `/t/*` 帖子页面：

- `linux.do`
- `nodeloc.com`
- `www.nodeloc.com`
- `idcflare.com`
- `meta.discourse.org`

其他 Discourse 论坛如需支持，可以在 `LINUXDO_ReadBoost.js` 顶部增加对应的 `@match` 规则。

## 使用方法

1. 安装 Tampermonkey 或 Violentmonkey。
2. 通过 GreasyFork 安装脚本，或直接安装仓库中的 `LINUXDO_ReadBoost.js`。
3. 打开受支持 Discourse 论坛的帖子页面。
4. 首次运行时阅读风险提示，输入「明白」后继续。
5. 在页面右上角找到 `ReadBoost` 状态和「设置」按钮。
6. 点击「设置」后可手动开始、保存参数或启用自动运行。

## 设置参数

| 参数 | 说明 | 默认值 | 建议范围 |
| --- | --- | --- | --- |
| 基础延迟 | 每批请求之间的基础间隔，单位 ms | 2000 | 500-10000 |
| 随机延迟范围 | 在基础延迟上增加的随机波动，单位 ms | 300 | 0-3000 |
| 最小每次请求阅读量 | 每批最少包含的回帖数量 | 8 | 1-50 |
| 最大每次请求阅读量 | 每批最多包含的回帖数量 | 20 | 1-100 |
| 最小阅读时间 | 每个回帖的最小模拟阅读时间，单位 ms | 800 | 100-10000 |
| 最大阅读时间 | 每个回帖的最大模拟阅读时间，单位 ms | 3000 | 100-30000 |

建议优先保持默认参数。如需提高速度，优先小幅调大「每次请求阅读量」，不要大幅降低延迟，避免给站点带来过高请求压力。

## 更新记录

### v1.4

- 脚本显示名调整为 `Discourse Read Boost`，与仓库名保持一致。
- 修复设置弹窗中「手动开始」引用未定义变量导致无法启动的问题。
- 修复 Discourse 标准 `/t/<slug>/<id>` 帖子 URL 匹配和 topic ID 解析问题。
- 修复 ReadBoost 控件与 Discourse 头部按钮重叠的问题，并在窄屏隐藏状态文本。
- 增强配置读取和保存校验，自动修正最小值大于最大值的配置。
- 增强 DOM 等待逻辑，降低页面元素稍晚渲染时加载失败的概率。

### v1.3

- 切换到 GPLv3 许可证。

### v1.2

- 支持多个 Discourse 论坛，接口地址改为基于 `location.origin`。
- 增加「停止」按钮，可在运行中中断。
- 设置弹窗跟随 Discourse 主题变量适配暗色模式。
- 增加输入校验，避免 `NaN` 或极端参数。
- 等待 DOM 就绪后再注入 UI，减少页面竞态。
- 最后一批请求后不再额外等待。
- 补充 `@icon`、`@updateURL`、`@downloadURL` 和 `@grant` 元数据。

## 已知限制

- 当前批处理仍按 `1..回复总数` 构造 post ID。帖子存在删帖、隐藏帖或非连续 post ID 时，可能无法稳定达到 100% 已读。
- 只支持帖子页，不支持从列表页批量处理多个帖子。
- 脚本依赖 Discourse 的 DOM 结构、CSRF meta 标签和 `/topics/timings` 接口，论坛升级后可能需要调整选择器或请求参数。

## 本地检查

仓库没有构建流程或测试套件。修改脚本后可运行：

```bash
node --check LINUXDO_ReadBoost.js
```

真实行为仍需在用户脚本管理器中打开受支持的 Discourse 帖子页手动验证。

## 许可证

[GNU General Public License v3.0](LICENSE)。你可以自由使用、修改和分发本脚本，但修改后的衍生作品必须同样以 GPLv3 发布。

如果你基于本脚本二次开发，建议保留来源声明。
