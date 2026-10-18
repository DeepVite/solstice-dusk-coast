# 变更记录

本文件是版本的入口索引，只记录版本级变更和工程文档入口。缺陷的完整分析、架构决策、验证证据和发布说明分别归档在 `docs/` 子目录，避免将所有内容堆进一个文件。

## 版本索引

| 版本 | 日期 | 状态 | 说明 |
| --- | --- | --- | --- |
| [1.0.1](docs/releases/v1.0.1.md) | 2026-10-18 | 当前版本 | 修复 HalfFloat/HDR 后期兼容性缺陷；默认改为 LDR |
| [1.0.0](docs/releases/v1.0.0.md) | 2026-10-18 | 历史基线 | 初始公开版本；有意保留已知 HDR 后期缺陷 |

## [1.0.1] - 2026-10-18

### Fixed

- 修复部分 GPU / ANGLE 环境下整个 3D 画面出现彩色雪花、柔焦和偶发正常帧的问题。后期渲染目标默认改为 `UnsignedByteType`，避开异常的 HalfFloat framebuffer 路径。
- 修正 `setQuality()` 在 LDR 模式下会把亮部阈值覆盖回 HDR 档位的问题。

### Changed

- HDR 不再自动启用。只有构造 `PostFX` 时显式传入 `hdr: true`，且浮点颜色缓冲扩展可用时，才使用 HalfFloat。
- LDR high / low 亮部阈值分别为 `.68` / `.82`；HDR 保持 `1.02` / `1.2`。
- 增加 `renderMode`（`ldr` / `hdr`）和 `hdrAvailable`，便于运行诊断。

### Documentation

- 事故报告：[`@docs/incidents/INC-2026-001-half-float-post-processing-corruption.md`](docs/incidents/INC-2026-001-half-float-post-processing-corruption.md)
- 架构决策：[`@docs/adr/ADR-0001-ldr-default-post-processing.md`](docs/adr/ADR-0001-ldr-default-post-processing.md)
- 验证记录：[`@docs/verification/VER-2026-001-ldr-fallback.md`](docs/verification/VER-2026-001-ldr-fallback.md)
- 发布说明：[`@docs/releases/v1.0.1.md`](docs/releases/v1.0.1.md)
- AI 辅助开发记录：[`@docs/development/ai-assisted-development.md`](docs/development/ai-assisted-development.md)

## [1.0.0] - 2026-10-18

### Added

- 初始公开基线：three.js r149 低模体素海岸、永恒日落、重力与结构支撑、树木/巨砾物理、程序化音画、创作模式和完整 UI。
- 该版本**有意保留** HalfFloat/HDR 后期路径，用于复现和审计本次兼容性缺陷。

### Known issue

- 受影响 GPU / ANGLE 图形栈会在多数帧显示全屏彩色雪花和柔焦；DOM UI 正常，偶尔出现干净帧。暂停/继续或改变窗口尺寸可短暂改变症状。
- 详细记录：[`@docs/incidents/INC-2026-001-half-float-post-processing-corruption.md`](docs/incidents/INC-2026-001-half-float-post-processing-corruption.md)
- 发布说明：[`@docs/releases/v1.0.0.md`](docs/releases/v1.0.0.md)

## 文档约定

- 事故记录事实、影响、根因和处置，不承担版本公告职责。
- 架构决策使用 ADR；被取代时新增编号，不篡改历史决策。
- 验证记录保存可复现步骤和实际结果；未验证项必须明确标注。
- 发布说明面向使用者和维护者，只概括版本级变化。
- AI 辅助开发记录只保存可公开的模型、提示摘要、工具和版本信息，不包含密钥或模型内部推理。
