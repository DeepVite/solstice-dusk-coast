# ADR-0001 — 默认使用 LDR 后期 RenderTarget，HDR 改为显式启用

| 字段 | 值 |
| --- | --- |
| 编号 | `ADR-0001` |
| 状态 | Accepted |
| 日期 | 2026-10-18 |
| 关联事故 | [INC-2026-001](../incidents/INC-2026-001-half-float-post-processing-corruption.md) |
| 关联验证 | [VER-2026-001](../verification/VER-2026-001-ldr-fallback.md) |
| 影响版本 | `v1.0.1` |

## 背景

`PostFX` 原先在 WebGL2 且浮点颜色扩展可用时自动选择 `HalfFloatType`，以保留 bloom 的高光余量。实际测试显示，在部分 GPU / ANGLE / Direct3D 驱动组合上：

- 扩展报告支持；
- HalfFloat framebuffer 仍会产生间歇性无效数据；
- 数据进入 bloom、god rays、composite 和 AA 后变成全屏雪花/柔焦；
- 改变窗口尺寸或暂停/继续会让异常短暂消失，难以通过简单的启动检查稳定复现。

现场 A/B 测试证明：同一页面、同一场景、同一浏览器中，将后期目标切换为 `UnsignedByteType` 后画面稳定。

## 决策

1. `PostFX` 默认使用 `THREE.UnsignedByteType`。
2. HDR 只在以下条件同时满足时启用：
   - 构造参数显式传入 `{ hdr: true }`；
   - 当前上下文为 WebGL2；
   - 浮点颜色缓冲扩展存在。
3. 默认游戏中不传入 `hdr`，因此玩家始终得到 LDR 兼容路径。
4. HDR 代码保留，以便在已知可靠的设备上进行验证，而不是删除。
5. 亮部阈值与格式绑定：

| 格式 | high | low |
| --- | --- | --- |
| LDR | `.68` | `.82` |
| HDR | `1.02` | `1.20` |

6. `setQuality()` 必须通过同一阈值计算函数更新，避免切到 low 时把 LDR 阈值覆盖为 HDR 值。

## 后果

### 正面

- 避开已确认不稳定的 HalfFloat framebuffer 路径；
- 在受影响环境中，画面从间歇可用变为持续可用；
- 对 UI、世界、物理和输入没有侵入；
- 保留未来启用 HDR 的代码基础；
- LDR 显存占用和带宽更低，兼容性更好。

### 负面

- 失去 HDR 的 >1.0 高光余量，强日照和 bloom 的高光层次会略平；
- LDR 阈值需要单独调校（当前为 `.68` / `.82`）；
- HDR 当前不是玩家可选项，验证 HDR 需要修改构造参数或调试代码；
- 未来若重新自动启用 HDR，仍需解决能力验证问题。

## 备选方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 继续自动使用 HalfFloat | 拒绝 | 已在真实环境复现严重视觉故障 |
| 仅检查扩展是否存在 | 拒绝 | 扩展存在不代表 framebuffer 实际可靠 |
| 提供 URL 参数让玩家切换 HDR | 暂不采用 | 会把已知不稳定路径暴露给普通用户，且缺少可靠判定 |
| 维护 GPU allowlist | 暂缓 | 需要更多设备样本；名单容易过期 |
| 彻底删除 HDR 代码 | 拒绝 | 保留经过验证的设备/诊断路径更有价值 |
| 默认 LDR，HDR 显式 opt-in | **采用** | 风险最低，且保留未来能力 |

## 后续工作

- 增加受控 HDR 自检：创建小型 HalfFloat RT，写入已知图案并读回比较；注意它不能覆盖所有间歇性驱动问题，因此仍需保守默认。
- 在设置层增加“画质诊断”入口时，再考虑让玩家显式选择实验性 HDR。
- 对 LDR 的曝光、bloom 权重和阈值做截图对比，保持“永恒日落”的氛围。
- 收集 GPU / ANGLE 信息，形成已知兼容性矩阵。

## 参考

- [INC-2026-001](../incidents/INC-2026-001-half-float-post-processing-corruption.md)
- [VER-2026-001](../verification/VER-2026-001-ldr-fallback.md)
- [v1.0.1 发布说明](../releases/v1.0.1.md)
