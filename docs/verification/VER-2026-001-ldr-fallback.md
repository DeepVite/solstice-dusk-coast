# VER-2026-001 — LDR 后期回退验证

| 字段 | 值 |
| --- | --- |
| 验证编号 | `VER-2026-001` |
| 关联事故 | [INC-2026-001](../incidents/INC-2026-001-half-float-post-processing-corruption.md) |
| 关联决策 | [ADR-0001](../adr/ADR-0001-ldr-default-post-processing.md) |
| 验证版本 | `v1.0.1` |
| 验证日期 | 2026-10-18 |
| 状态 | 核心故障模式已验证；跨设备矩阵待补 |

## 1. 验证范围

本记录验证以下三件事：

1. 故障是否确实来自 WebGL 后期渲染路径，而非 DOM/CSS、光照、物理或显示设备；
2. 将后期 RenderTarget 从 HalfFloat 切换到 8 位 LDR 后，原故障是否消失；
3. 提交后的默认配置是否等价于现场验证过的 LDR 配置。

本文不声称已经覆盖所有 GPU、浏览器版本或长时间稳定性测试。

## 2. 环境

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows 10.0.26200 x64 |
| 浏览器 | Chromium / Microsoft Edge |
| 浏览器精确版本 | 未采集 |
| GPU / 驱动 | 未采集 |
| 初始版本 | `v1.0.0`，提交 `e688a57` |
| 修复版本 | `v1.0.1` |
| 场景 | 暮海出生点，朝向落日；镜头方向正常 |
| 测试方式 | 报障者现场交互 + 本仓库代码级检查 |

## 3. 修复前对照

### 3.1 默认 HDR/HalfFloat

- 3D 画面大多数帧为全屏彩色雪花 + 柔焦；
- HUD、文字、物品栏清晰；
- 偶发 1 帧或数帧正常；
- 暂停后继续，首帧通常正常；
- 改变浏览器窗口大小，正常不足 1 秒后复发。

### 3.2 排除 DOM / CSS

执行：

```js
document.getElementById('hud').style.display='none'
document.getElementById('pause').style.display='none'
document.querySelectorAll('*').forEach(el => el.style.backdropFilter = 'none')
```

结果：3D 雪花和模糊仍然存在。  
结论：不是 HUD、暂停遮罩或 `backdrop-filter` 合成层。

### 3.3 排除光照 / 世界逻辑

镜头、坐标和场景内容正常；故障覆盖天空、海面、地形等全部 3D 内容；干净帧与光照状态、玩家位置无对应关系。  
结论：不是低角度阳光、阴影、材质或物理。

## 4. 运行时 A/B

在 `v1.0.0` 页面中执行：

```js
var p = SOLSTICE_GAME.post
p.hdrType = THREE.UnsignedByteType
p.brightMat.uniforms.uThreshold.value = 0.68
p.allocated = false
```

控制台返回：

```text
undefined
1009
0.68
false
```

说明：

- `undefined`：`var` 声明语句的正常返回值；
- `1009`：`THREE.UnsignedByteType`，这是新赋的值；
- `0.68`：LDR 亮部阈值；
- `false`：标记需要重建 RenderTarget；下一帧 `allocate()` 生效。

### 实际结果

| 配置 | 结果 |
| --- | --- |
| 默认 HalfFloat/HDR | 间歇性全屏雪花/柔焦 |
| 运行时 LDR + `.68` | 画面持续正常，UI 仍清晰 |
| 仅改变窗口尺寸 | 正常 < 1 秒，随后复发 |
| 关闭全部 CSS 模糊 | 无改善 |

这组结果把根因锁定为 HalfFloat/HDR 后期 RenderTarget 路径，而不是 DOM、光照或显示设备。

## 5. 提交修复的代码级验证

### 5.1 JavaScript 语法检查

对 `src/` 下全部 11 个 JavaScript 文件执行：

```text
node --check src/audio.js
node --check src/core.js
node --check src/main.js
node --check src/physics.js
node --check src/player.js
node --check src/postfx.js
node --check src/props.js
node --check src/sky.js
node --check src/ui.js
node --check src/water.js
node --check src/world.js
```

结果：全部 `SYNTAX_OK`。

### 5.2 构造配置 / 阈值单元检查

使用最小 `THREE` stub 在 Node 中实例化 `PostFX`，检查默认配置：

| 场景 | hdrType | renderMode | high 阈值 |
| --- | --- | --- | --- |
| 默认，无 `hdr` | 1009 | `ldr` | `.68` |
| 显式 `hdr:true`，扩展可用 | 1016 | `hdr` | `1.02` |
| 显式 `hdr:true`，无扩展 | 1009 | `ldr` | `.68` |

切换低画质后：

| 场景 | hdrType | renderMode | low 阈值 |
| --- | --- | --- | --- |
| 默认 LDR | 1009 | `ldr` | `.82` |
| 显式 HDR | 1016 | `hdr` | `1.20` |

结果：`POSTFX_PROFILE_TEST_OK`。

该检查还覆盖了原实现中 `setQuality()` 会把 LDR 阈值覆盖为 HDR 阈值的问题。

### 5.3 等价性判断

提交后的游戏入口 `src/main.js` 构造 `PostFX` 时没有传 `hdr:true`，因此运行时等价于现场验证过的 LDR 配置：

- `hdrType = UnsignedByteType`（1009）；
- `renderMode = 'ldr'`；
- high 画质亮部阈值 `.68`。

### 5.4 未执行的验证

- 未在受影响 GPU 上进行提交后的完整浏览器回归（该环境由报障者交互使用）；
- 未覆盖 Firefox、Safari、移动 GPU；
- 未做数小时 soak test；
- 未验证 HDR opt-in 在其他设备上的画质和稳定性。

因此本记录将状态标记为“核心故障模式已验证；跨设备矩阵待补”，而不是“已证明所有环境无问题”。

## 6. 结论

1. 原故障与 DOM/CSS、光照、物理和显示器无关。
2. 在报告环境中，HalfFloat/HDR 后期路径是直接触发源；LDR 路径持续正常。
3. `v1.0.1` 默认配置与现场修复配置一致，并修复了质量切换时的阈值回退问题。
4. 对受影响环境，修复方向有充分证据支持；对全部消费级 GPU 的兼容性仍需补测试矩阵。

## 7. 后续验证建议

- 在 v1.0.1 上重复：启动、暂停/继续、连续 resize、长时间运行；
- 在 Intel / AMD / NVIDIA 集显与独显、Chrome / Edge / Firefox 上做截图对比；
- 若未来重新启用 HDR，加入独立的兼容性门槛和可回退开关。

## 8. 参考

- [INC-2026-001](../incidents/INC-2026-001-half-float-post-processing-corruption.md)
- [ADR-0001](../adr/ADR-0001-ldr-default-post-processing.md)
- [v1.0.1 发布说明](../releases/v1.0.1.md)
