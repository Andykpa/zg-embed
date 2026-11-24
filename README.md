# opencode-zg-embed-auth · 百炼 zg Embedding

一个 [magpie](https://usemagpie.ai) / OpenCode provider 插件：让 [zvec-grep（zg）](https://www.npmjs.com/package/@zvec/zvec-grep) 通过 magpie 网关直接使用阿里云百炼（DashScope）的 embedding 模型，**改名在 magpie 内部完成，不需要外部代理**。

## 为什么需要它

zg 的远程 embedding 模型名是写死的：它只会发送 `qwen3.7-text-embedding`。而百炼上性价比更高的模型是 `qwen3.7-text-embedding-flash`——两者**向量不兼容**（余弦相似度约 0.01–0.06），价格差 4 倍（base ¥0.5/M vs flash ¥0.125/M）。zg 的 CLI、配置文件、授权三层都拒绝 flash 名，所以必须有一层改名。

本插件把名为 `qwen3.7-text-embedding` 的模型的 **API id 声明为 flash**，magpie 网关自动按 API id 发给上游。zg 照常发裸名，上游实际跑 flash，用量记账也在 magpie 里。

## 模型桥接

| zg 发送的名（写死） | 默认上游 API id | 默认维度 | 单行上限 | 批量上限 |
| --- | --- | --- | --- | --- |
| `qwen3.7-text-embedding` | `qwen3.7-text-embedding-flash` | 1024 | 128,000 token | 20 行 |
| `text-embedding-v4` | `text-embedding-v4` | 1024 | 8,192 token | 10 行 |
| `qwen3-vl-embedding` | `qwen3-vl-embedding` | 2560 | 32,000 token | 多模态 |

- 前两个走 OpenAI 兼容接口（`/compatible-mode/v1/embeddings`）。
- `qwen3-vl-embedding` 走 DashScope **原生多模态接口**（请求/响应形状都不同）：zg 发来的原生请求体原样转发；其他 agent 发来的 OpenAI 形状请求由插件双向翻译。
- 上游名可用 options 覆盖（见「换模型」）。

## 快速开始（5 步）

```sh
# 1. 装插件（首次添加插件时 magpie 会自动下载 Bun）
magpie plugin add github:Andykpa/zg-embed

# 2. 签名：选端点（公共百炼 / 自定义业务空间），填百炼 sk- key
magpie plugin login zg-bailian-embed
```

3\. 写 zg 全局配置 `~/.zvec-grep/config.json`：

```json
{
  "version": 1,
  "defaults": { "embedding": "qwen/qwen3.7-text-embedding" },
  "providers": { "qwen": { "apiKey": "magpie" } },
  "models": {
    "qwen/qwen3.7-text-embedding": {
      "endpoint": "http://127.0.0.1:3425/v1/embeddings"
    }
  }
}
```

endpoint 指向你那台 magpie 网关（默认端口 3425）。回环地址不校验入站 key，`apiKey` 填 `magpie` 即可；跨机器访问时填网关 key。

```sh
# 4. 在每个要索引的工作区目录里授权（endpoint 必须与配置一致）
zg --auth grant --capability embedding --scope workspace --embedding qwen/qwen3.7-text-embedding --endpoint http://127.0.0.1:3425/v1/embeddings

# 5. 建索引，然后检索
zg --index
zg "网关如何转发请求"
```

也可以装本地文件夹：`magpie plugin add ./zg-embed`。在 OpenCode 里同样可用（OpenCode v1 provider 插件形状）。

**签名细节**：或在 magpie 应用里 Plugins → 该供应商行 → 签名。端点二选一：

- *Public DashScope / 公共百炼*：`https://dashscope.aliyuncs.com/compatible-mode/v1`，任何百炼 key 可用；
- *Custom workspace / 自定义业务空间*：形如 `https://<workspace>.<region>.maas.aliyuncs.com/compatible-mode/v1`，配该业务空间的专属 key。

签名保存在 `~/.config/magpie/plugin-auth.json`（与 OpenCode 的 `auth.json` 同形，mode 600）。

## 日常使用

```sh
zg --index              # 增量索引（只处理新增/改动文件）
zg --index --rebuild    # 全量重建（换模型/换 endpoint 后必须）
zg "查询内容"            # 语义检索
zg "查询内容" --preview short   # 只看命中片段
zg --auth status        # 查看当前工作区授权
zg --server on          # 起守护进程（MCP 在 http://127.0.0.1:7999/mcp，供 agent 调用）
```

## 换模型 / 换端点 / 换 key

### A. 换裸名跑的上游模型（flash → base，或将来的新模型）

```sh
magpie plugin options zg-embed '{"upstream":{"qwen3.7-text-embedding":"qwen3.7-text-embedding"}}'
magpie plugin options zg-embed off   # 恢复默认（flash）
```

（`zg-embed` 也可写包名 `opencode-zg-embed-auth`，以 `magpie plugin` 列表显示为准。宿主重载需几秒生效。）

> ⚠️ **不同模型的向量互不兼容。** 换上游后，所有旧索引必须 `zg --index --rebuild`，否则检索结果是乱的。zg 侧配置不用动（它只发裸名）。

### B. 让 zg 改用 v4 或 vl

zg 支持三个远程模型，改 `defaults.embedding` 即可切换。以 v4 为例：

1. `config.json`：`defaults.embedding` 改为 `qwen/text-embedding-v4`，并在 `models` 里加 `"qwen/text-embedding-v4": { "endpoint": "http://127.0.0.1:3425/v1/embeddings" }`；
2. 工作区里重新授权：`zg --auth grant --capability embedding --scope workspace --embedding qwen/text-embedding-v4 --endpoint http://127.0.0.1:3425/v1/embeddings`（先 `zg --auth revoke`）；
3. `zg --index --embedding qwen/text-embedding-v4 --rebuild`。

vl 同理（`qwen/qwen3-vl-embedding`，2560 维，支持图片/视频）。**每个工作区索引绑定一个模型，换模型必须重建。**

### C. 换端点（公共百炼 ↔ 业务空间）

- 插件侧：重新 `magpie plugin login zg-bailian-embed` 选新端点；或用 `magpie plugin options zg-embed '{"endpoint":"https://…/compatible-mode/v1"}'` 覆盖（优先于签名时的选择，作用于所有账号）。
- zg 侧：**只有网关地址变了才需要动**——改 config 的 endpoint，然后每个工作区 `zg --auth revoke` → 重新 grant → `zg --index --rebuild`（见「三个坑」）。只换上游端点、网关地址不变的话，zg 侧零改动。

### D. 换 key / 更新插件

```sh
magpie plugin login zg-bailian-embed   # 重新签名即换 key
magpie plugin update                   # git 源按提交比对，有新版就更新
```

## 三个坑（实测得出，务必读）

1. **同一上游不要再挂一个 key 供应商，且其模型目录里含 `qwen3.7-text-embedding`。**
   magpie 的 embeddings 通道按上游目录匹配裸名，那个 key 供应商会抢先截走裸名、按裸名发上游——结果跑的是 base：向量与 flash 索引不兼容，价格 4 倍。禁用模型、改供应商显示名都拦不住。
   *症状*：路由日志里该请求的 provider 不是 `zg-bailian-embed`。*修复*：移除那个 key 供应商（本插件就是它的替代品）。
2. **zg 的授权 grant 是追加，不是替换。** 换 endpoint 时先 `zg --auth revoke` 再 grant，否则旧条目排在前面被优先使用。
3. **endpoint 还存在索引的 `manifest.json` 里**（`embeddingConfigs`）。换 endpoint 后旧索引要 `zg --index --rebuild`，否则检索仍按旧 endpoint 校验授权。

## 故障排查

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| `PERMISSION_DENIED … at http://…` | 授权或索引 manifest 里还是旧 endpoint | `zg --auth revoke` → 重新 grant；`zg --index --rebuild` |
| `404 magpie knows no model "qwen3.7-text-embedding"` | 插件没加载或被关 | `magpie plugin` 查看状态，`magpie plugin on <名>` |
| 检索质量骤降、怀疑跑错模型 | 裸名被别的 key 供应商截走跑了 base | 看路由日志的 provider；移除那个供应商（坑 1） |
| 用量费用显示偏贵 | 按请求名查公价（裸名=base 价） | `magpie model price`，见下节 |
| options 改了没生效 | 宿主重载需要几秒 | 稍等重试 |
| 插件行显示加载错误 | Bun 下载/代码问题 | `magpie plugin` 读错误信息；必要时 rm 后重新 add |

## 用量显示说明

- 用量详情里的「发送模型」记的是**请求名**（裸名），不是实际发送名；实际发送名以 API id 为准（可用向量比对验证）。
- 费用默认按请求名查公开价：裸名 `qwen3.7-text-embedding` 在 models.dev 上对应 base 价，会高估。本插件已为桥接模型声明 flash 的公共价格；若你的业务空间计价不同，用下面命令修正显示（百炼账单按实际跑的模型计，不受影响）：

```sh
magpie model price zg-bailian-embed/qwen3.7-text-embedding 0.018682,0,0,0
```

## 验证它真的跑了 flash

对网关发裸名请求，与直连百炼 flash 的向量比余弦，应 ≈ 1（base 的话约 0.05）：

```sh
curl -s http://127.0.0.1:3425/v1/embeddings -H 'content-type: application/json' -H 'authorization: Bearer magpie' -d '{"model":"qwen3.7-text-embedding","input":"你好世界"}'
```

路由日志在 `~/.config/magpie/routing/<日期>.jsonl`，用量在 `~/.config/magpie/usage.jsonl`。

## 卸载

```sh
magpie plugin rm zg-embed
```

zg 想继续用远程 embedding 的话，把 config 的 endpoint 改回 `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings`、apiKey 填你的百炼 key，并重新授权＋重建索引。注意：直连时裸名跑的是 **base**（没有插件改名了）。

## 开发

```sh
node --test test/helpers.test.mjs   # 纯函数单元测试
```

沙箱测试（官方推荐，绝不碰生产 magpie）：独立 `HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME`，`MAGPIE_ADDR=127.0.0.1:3499`（网关端口），然后 `magpie web --addr 127.0.0.1:3498 --gateway --no-open`（**网页端口必须与网关端口不同**，否则自转发死循环）、`magpie plugin add ./zg-embed`、`magpie plugin login zg-bailian-embed`。详见 [magpie 插件文档](https://usemagpie.ai/docs/plugins)。

## 许可证

MIT

---

# English

A [magpie](https://usemagpie.ai) / OpenCode provider plugin that lets [zvec-grep (zg)](https://www.npmjs.com/package/@zvec/zvec-grep) use Alibaba Bailian (DashScope) embedding models through a magpie gateway — **the model rename happens inside magpie, no external proxy**.

**Why.** zg hardcodes the remote embedding name `qwen3.7-text-embedding`, but the cost-effective Bailian model is `qwen3.7-text-embedding-flash`. Their vectors are incompatible (cosine ≈ 0.01–0.06) and prices differ 4×. This plugin declares the model's **API id** as flash; the gateway sends flash upstream while zg keeps sending the bare name.

**Bridges.** `qwen3.7-text-embedding` → `qwen3.7-text-embedding-flash` (1024-d, 128K); `text-embedding-v4` → itself (1024-d, 8K); `qwen3-vl-embedding` → itself via DashScope's native multimodal API (2560-d; native bodies pass through, OpenAI-shaped bodies are translated both ways).

**Quick start.**

```sh
magpie plugin add github:Andykpa/zg-embed
magpie plugin login zg-bailian-embed   # pick public DashScope or a custom workspace URL, then the sk- key
```

Point `~/.zvec-grep/config.json` at your gateway (`models."qwen/qwen3.7-text-embedding".endpoint = http://127.0.0.1:3425/v1/embeddings`, `providers.qwen.apiKey = "magpie"` on loopback), then per workspace: `zg --auth grant --capability embedding --scope workspace --embedding qwen/qwen3.7-text-embedding --endpoint <same URL>`, and `zg --index` / `zg "query"`.

**Switching models.**
- *Upstream of the bare name* (flash → base or a newer model): `magpie plugin options zg-embed '{"upstream":{"qwen3.7-text-embedding":"<model-id>"}}'`; `off` resets. **Vectors of different models are incompatible — `zg --index --rebuild` every existing index afterwards.**
- *zg using v4 / vl*: change `defaults.embedding` in zg config, add the model's endpoint entry, re-grant with `--embedding qwen/<name>`, rebuild with `--embedding qwen/<name>`. One index per model.
- *Endpoint*: re-login or `options.endpoint`; zg-side changes (revoke → grant → rebuild) are only needed when the **gateway** address changes.
- *Key / updates*: `magpie plugin login zg-bailian-embed` / `magpie plugin update`.

**Gotchas (field-tested).**
1. Do **not** keep another key provider on the same upstream whose catalog contains the bare name — magpie's embeddings channel resolves bare names against upstream catalogs first, so it would intercept the request and run base. Remove it; this plugin replaces it.
2. zg auth grants are **appended**, not replaced: `zg --auth revoke` before re-granting with a new endpoint.
3. The endpoint is also stored in each index's `manifest.json`; after changing it, `zg --index --rebuild` old indexes.

**Troubleshooting.** `PERMISSION_DENIED` → stale grant/manifest: revoke, re-grant, rebuild. `404 knows no model` → plugin off/not loaded: `magpie plugin`. Search quality suddenly wrong → another provider intercepted the bare name (gotcha 1): check the routing log's provider. Options seem ignored → the host reload takes a few seconds.

**Usage display.** The "sent model" column logs the request name, not the wire name; costs are looked up by request name (the bare name maps to base pricing on models.dev). The plugin declares flash's public price; adjust with `magpie model price zg-bailian-embed/qwen3.7-text-embedding <in>,<out>,<cacheRead>,<cacheWrite>` if your workspace prices differ. Bailian bills the model actually run.

MIT licensed. See the Chinese section above for full details.