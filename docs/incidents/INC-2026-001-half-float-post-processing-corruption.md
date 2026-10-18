# INC-2026-001 — HalfFloat/HDR 后期渲染目标兼容性故障

| 字段 | 值 |
| --- | --- |
| 事故编号 | `INC-2026-001` |
| 状态 | Resolved（已在 v1.0.1 修复） |
| 严重度 | High — 受影响环境下整个 3D 画面不可用；不崩溃、不丢数据 |
| 首次发现 | 2026-10-18 |
| 影响版本 | `v1.0.0` |
| 修复版本 | `v1.0.1` |
| 影响组件 | `src/postfx.js`，WebGL2 HDR 后期管线 |
| 分类 | 图形兼容性 / 健壮性缺陷 |
| 关联记录 | [ADR-0001](../adr/ADR-0001-ldr-default-post-processing.md)、[VER-2026-001](../verification/VER-2026-001-ldr-fallback.md) |

## 1. 摘要

在受影响 GPU / 浏览器图形栈上，`v1.0.0` 自动启用的 HalfFloat/HDR 离屏渲染目标会间歇性产生无效数据。Bloom、God Rays、Composite 和最终 AA 把这些数据模糊、叠加并输出为全屏彩色雪花和柔焦。

DOM HUD、菜单和物品栏保持完全清晰，因为它们在 WebGL canvas 之外。缺陷不影响世界生成、光照数据、结构物理或玩家输入。

## 2. 影响

- 3D 画面在大多数帧出现密集彩色噪点与模糊，难以正常游玩或截图。
- 偶尔出现一帧或几帧正常画面。
- 暂停后点击继续，第一帧通常正常。
- 拖动/改变浏览器窗口大小后，画面会正常不足 1 秒，然后复发。
- UI 正常，但无法通过隐藏 HUD、暂停层或关闭 CSS 模糊消除问题。
- 不触发 JavaScript 异常，不导致 WebGL 上下文丢失，不损坏存档或世界数据。

## 3. 受影响环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 10.0.26200 x64 |
| 浏览器 | Chromium / Microsoft Edge；截图来自中文 DevTools |
| 浏览器精确版本 | 未采集 |
| GPU / 驱动版本 | 未采集 |
| WebGL | WebGL2；浮点颜色缓冲扩展报告可用 |
| 初始 HDR 类型 | `THREE.HalfFloatType`（1016），由扩展检测自动选择 |
| 修复后类型 | `THREE.UnsignedByteType`（1009），默认 LDR |
| 复现版本 | `v1.0.0`，tag 对应提交 `e688a57` |

由于 GPU 型号和浏览器精确构建号未被记录，本事故不应被表述为“某个具体 GPU 型号确定损坏”。可以确定的是：在这套实际运行环境中，HalfFloat 后期路径不稳定，而 LDR 路径稳定。

## 4. 症状与现场证据

### 4.1 视觉症状

- 全屏、密集的彩色细噪点；
- 噪点被 bloom / 柔边 AA 抹开，看起来像“高斯模糊的雪花电影”；
- 3D 内容在噪点下方仍然存在，镜头方向正确；
- 物品栏、文字、HUD 始终锐利；
- 干净帧无规律出现，暂停/继续后的第一帧概率较高。

### 4.2 用于定位的关键实验

| 实验 | 结果 | 推论 |
| --- | --- | --- |
| 按 `H` 隐藏 HUD | 问题仍在 | 不是 HUD `backdrop-filter` |
| 将 `#hud`、`#pause` 设为 `display:none` | 问题仍在 | 不是 DOM/CSS 合成层 |
| 关闭全站 CSS `backdrop-filter` | 问题仍在 | 不是 CSS 模糊 |
| 改变窗口大小 | 正常 < 1 秒后复发 | canvas / RenderTarget 被重新分配 |
| 暂停→继续 | 第一帧通常正常 | 合成/GPU 状态短暂重置 |
| 强制 LDR RT + `.68` 阈值 | 持续正常 | HalfFloat/HDR 路径是触发源 |

### 4.3 运行时 LDR 对照

在出问题的页面中执行：

```js
var p = SOLSTICE_GAME.post
p.hdrType = THREE.UnsignedByteType   // 1009
p.brightMat.uniforms.uThreshold.value = 0.68
p.allocated = false                  // 下一帧重建所有 RT
```

返回值依次为 `undefined`、`1009`、`0.68`、`false`。这些是正常的赋值回显。执行后 3D 画面保持正常。

## 5. 根因

### 5.1 直接触发因素

`v1.0.0` 在 WebGL2 且检测到以下任一扩展时自动使用 HalfFloat：

- `EXT_color_buffer_float`
- `EXT_color_buffer_half_float`

在这套驱动/ANGLE 图形栈上，扩展存在并不等于 HalfFloat framebuffer 的写入、读取和线性采样可靠。受影响的中间结果进入：

1. `sceneRT`（HalfFloat，带深度）；
2. `brightRT`、`blurA/B`、`bloomA/B`、`raysRT`（HalfFloat）；
3. 合成阶段的加法 bloom / god rays；
4. 最终柔边 AA。

彩色雪花不是场景内容，而是被后期链路放大后的无效 GPU 纹理数据。

### 5.2 软件工程层面的缺陷

自动选择逻辑只验证“扩展是否存在”，没有验证“该格式在当前驱动上是否真的可用”，也没有可用的运行时降级：

```js
// v1.0.0 的行为
if (WebGL2 && extensionPresent) {
  hdrType = HalfFloatType;
}
```

这是一个**能力假设缺陷**。直接异常发生在外部图形栈，但项目把“扩展报告支持”误当成“功能可靠”，没有为已知易碎路径提供保守默认值或回退，因此产品层面仍有责任。

### 5.3 为什么会出现偶发正常帧

- GPU/驱动偶尔完成一次有效的 framebuffer 读写；
- 窗口 resize 会重新创建 canvas drawing buffer 和所有 post RT，短暂清除坏状态；
- 暂停/继续会触发合成状态变化，首帧可能绕过异常路径；
- 这些现象符合“资源/驱动状态问题”，不符合确定性光照或 shader 常量错误。

## 6. 排除项

| 假设 | 结论 |
| --- | --- |
| 低角度太阳 / 阴影痤疮 | 排除。天空、海面和整个画面同时异常，且存在完全正常帧 |
| bloom 参数过强 | 不是根因。正常帧证明参数本身可用；异常数据被 bloom 放大 |
| 胶片颗粒设计 | 不是根因。颗粒幅度固定且每帧执行，不会自己消失；它只是让坏帧更明显 |
| CSS `backdrop-filter` | 排除。隐藏 HUD/暂停层、关闭全部 CSS 模糊后仍复现 |
| 物理 / 世界生成 | 排除。玩家位置、镜头和世界内容均正常 |
| 显示器 / 系统缩放 | 排除。DOM UI 清晰，只有 WebGL canvas 受影响 |

## 7. 修复

`v1.0.1` 采用兼容优先策略：

1. `PostFX` 默认使用 `THREE.UnsignedByteType`；
2. 只有显式传入 `{ hdr: true }` 且扩展可用时，才使用 HalfFloat；
3. LDR 亮部阈值按画质档位设置为 `.68` / `.82`；
4. 修复 `setQuality()` 将 LDR 阈值错误覆盖为 HDR 阈值的问题；
5. HDR 代码保留，用于已验证设备或受控诊断，不暴露为玩家默认路径。

代码位置与决策依据见 [ADR-0001](../adr/ADR-0001-ldr-default-post-processing.md)。

## 8. 验证

- 受影响浏览器中，运行时切换 LDR 后画面持续正常；
- 修复后的源码通过全部 JavaScript 语法检查；
- 构造配置测试确认：默认 LDR / `.68`，显式 HDR / `1.02`，无扩展时回退 LDR，低画质 LDR / `.82`、HDR / `1.2`；
- 详细步骤、证据和未覆盖项见 [VER-2026-001](../verification/VER-2026-001-ldr-fallback.md)。

## 9. 经验与后续

1. **扩展可用性 ≠ 功能可靠性。** 对 framebuffer 格式应采用保守默认值，尤其是面向未知消费级 GPU 的 WebGL 应用。
2. 视觉缺陷应先分离 DOM 与 canvas，再检查资源重建行为；resize 后短暂恢复是很有价值的诊断信号。
3. 需要保留可复现的 HDR 路径，但不应默认暴露给无法验证的环境。
4. 后续可增加：受控 HDR 自检、已知设备 allowlist、画质设置中的显式实验开关、GPU/驱动诊断信息面板。
5. 增加跨 GPU、跨浏览器和连续 resize/pause 的回归测试。

## 10. 参考

- [变更记录](../../changelog.md)
- [ADR-0001](../adr/ADR-0001-ldr-default-post-processing.md)
- [VER-2026-001](../verification/VER-2026-001-ldr-fallback.md)
- [v1.0.0 发布说明](../releases/v1.0.0.md)
- [v1.0.1 发布说明](../releases/v1.0.1.md)
