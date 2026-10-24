# Factorio Planner MCP

[English](README.md)

一个独立维护的社区 MCP 服务，让你在 ChatGPT 等客户端中查询异星工厂配方、计算生产链，而不用让 AI 凭记忆编配方或心算物料。

## 特别感谢 FactorioLab

首先要感谢 **[FactorioLab](https://github.com/factoriolab/factoriolab)** 的原作者 **[Doug Broad / dcbroad3](https://github.com/dcbroad3)**，以及所有维护者和贡献者。

> 从《戴森球计划》到《异星工厂》，我都是靠 FactorioLab 的计算器过来的。它真的救了我老命。

它把复杂的配方、生产链和资源需求变成了可以理解、可以规划的结果。这个项目的起点，就是希望把这份可靠的计算能力带进日常 AI 对话。没有 FactorioLab，就不会有这个 MCP 服务。

感谢原项目长期投入的开发、数据维护、翻译与问题修复。欢迎使用[原版计算器](https://factoriolab.github.io/)，并通过[原项目提供的渠道](https://github.com/factoriolab/factoriolab)支持作者。

本项目独立维护，**并非 FactorioLab 或 Wube 官方产品**。我们保留了原始 MIT 版权与许可证，记录了数据来源 commit 和哈希，也明确列出自身尚未覆盖的功能。

## 直接使用

- MCP 地址：**https://factorio-mcp.anormlylee.com/mcp**
- 服务主页：https://factorio-mcp.anormlylee.com/
- 认证方式：**No authentication**
- 协议：Streamable HTTP

在 ChatGPT 添加自定义 MCP 服务，创建并安装插件，然后新建 Chat 对话，通过 `@` 选择它。具体入口受账号和工作区权限影响，参见[官方接入说明](https://developers.openai.com/api/docs/guides/custom-mcp-server)。自用和自建不需要先上架 ChatGPT 官方目录。

可以这样问：

> 使用 Factorio Planner 查询黑瓶和量子处理器的配方、生产地点。计算每分钟 120 黑瓶需要多少量子处理器，再比较冷氟酮不回收与冷却回收的补充量。

查看实际工具调用记录，确认模型真的查询和计算了。MCP 连接成功不保证模型每轮都正确调用工具。可选的对话说明在 [examples/chatgpt-instructions.md](examples/chatgpt-instructions.md)。

公共地址是尽力维护的社区服务。你也可以完全自行部署；服务本身不调用大模型，**不需要 OpenAI API Key**。

## 功能与默认行为

提供 `list_datasets`、`search_entities`、`get_recipe`、`calculate_production`、`calculate_barrel_transport` 五个只读工具。

支持中文/英文/部分俗称查询、配方和机器地点限制、机器自带增产、机器与插件品质、适用的增产研究、循环液体与副产物、装桶倒桶及空桶返运。

默认采用服务携带的 Space Age 2.1 数据快照，无需先问游戏版本，不读取 Steam 或存档。结果附带版本、来源 commit 和数据链接。另有 Factorio 2.1、Space Age 2.0、Factorio 2.0 数据集。

## 自建到 Cloudflare Workers

需要 Node.js 22.18+ 和 Cloudflare 账号：

```sh
git clone https://github.com/anormlylee/factorio-planner-mcp.git
cd factorio-planner-mcp
npm ci --ignore-scripts
npm run check
npx wrangler login
npm run deploy:self
```

自建命令使用 `wrangler.self-host.jsonc`，没有维护者的域名路由。部署后采用 Wrangler 输出的你自己的 `workers.dev` 地址，并在末尾加 `/mcp`。绑定自有域名时，在这份配置中添加 `custom_domain: true` 路由。

```sh
npm run dev:worker
# 另一个终端：
npm run test:worker
```

计算引擎和数据都打包在 Worker 内，不依赖你的电脑或临时隧道，不需要额外数据库或容器订阅。部署不会替你购买或升级 Cloudflare 套餐；实际 CPU、请求量和计费仍取决于账号套餐。大规模自动全链计算比指定配方的小范围计算更耗 CPU。

## Docker 自建

```sh
git clone https://github.com/anormlylee/factorio-planner-mcp.git
cd factorio-planner-mcp
docker compose up -d --build
```

本地地址为 `http://127.0.0.1:3000/mcp`。远程 ChatGPT 使用时，需要在前面配置自己的 HTTPS 反向代理；`ALLOWED_HOSTS` 填自己的主机名并保留 Host 头。配置示例见 `.env.example`。

## 本地客户端

```sh
npm ci --ignore-scripts
npm start
# 或 stdio：
npm run start:stdio
```

stdio 客户端运行 `node /你的路径/factorio-planner-mcp/src/stdio.js` 即可。手机或远程 ChatGPT 无法直接使用你电脑上的 localhost/stdio，需要可达的 HTTPS 服务。

## 计算时要知道什么

- 输入默认每分钟，也支持 `rateUnit: second/hour`；输出统一每分钟。
- 默认普通品质产物、无插件/研究，机器选择指定地点可用的首个 producer，计入机器固有增产。
- `recipeIds` 可限定计算网络；`externalInputs` 表示外部提供的材料。冷却液回收需要把冷却配方纳入网络。
- 分清总消耗、总产出、外部净补充、返还副产物和启动库存。未知启动库存返回 `null`。
- 配方和机器地点冲突会报错；不指定地点时可能是跨星球生产链，不能解释为都在当地制造。
- 结果是配方物料收支，**不含完整燃料、食物、热量、电力、腐败时效和火箭/平台运输成本**。燃料需求会单独警告；不能把虫卵产线描述成不需生物营养剂。
- `acquisition` 中的开采、抽水等资源获取步骤也需要考虑；`inputs` 不等于完整原料清单。
- 暂不支持信标、随机品质产物、采矿研究/耗竭和完整物流模拟。并非完整移植 FactorioLab，不能声称与其所有结果逐项一致。

参数、JSON 示例、优化目标和完整边界见 [English README](README.md)。`npm run example` 可生成完整的黑瓶/量子处理器/冷却循环示例。

## 测试与维护

```sh
npm run check
npm run build:worker
npm run example
npm audit
```

数据更新显式指定上游 commit：`npm run sync:data -- 上游40位commit`。更新会先下载全部数据、翻译和原许可证，然后更新快照及 manifest；提交前仍需检查差异、运行测试。

欢迎提交问题和贡献。报告中附上问题、工具参数/结果和数据版本即可，不要提交私人聊天记录或密钥。

## 开源许可

本项目采用 **GPL-3.0-only**，包括 GLPK.js 集成；FactorioLab 数据和翻译保留原 MIT 许可。参见 `LICENSE`、`THIRD_PARTY_NOTICES.md` 和 `data/FACTORIOLAB-LICENSE`。
