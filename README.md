# SOLSTICE · 暮海

一个用 **three.js** 写成的 Minecraft 风格体素海岸。不是夜晚，也不是生存服：这里只有一场永远不会结束的落日，以及一套会记住重量的世界。

![style](https://img.shields.io/badge/renderer-three.js%20r149-orange) ![mode](https://img.shields.io/badge/mode-creative-8a6b56) ![physics](https://img.shields.io/badge/world-gravity%20%2B%20structural-A6634A)

[GitHub 仓库](https://github.com/DeepVite/solstice-dusk-coast) · [变更记录](changelog.md)

## 怎么打开

### 最简单
直接双击 **`index.html`**。项目没有构建步骤，three.js 已经放在 `vendor/` 里。

### 推荐：本地服务器
某些浏览器不允许 `file://` 页面捕获鼠标指针。

Windows 用户可以直接双击 **`start-game.bat`**：它会启动一个本地服务器并打开浏览器。

也可以在该目录手动运行：

```bash
node serve.mjs
# 然后访问 http://127.0.0.1:8080/
```

或：

```bash
npm start
```

需要 Node.js 18+。无需 `npm install`，项目没有任何 npm 运行时依赖。

## 操作

| 输入 | 行为 |
| --- | --- |
| `W A S D` | 漫步 |
| 鼠标 | 环顾 |
| `Shift` | 地面疾跑；飞行时下降（水中下潜） |
| `Space` | 跳跃；飞行时上升 |
| 双击 `Space` / `F` | 开关创造飞行 |
| 左键 | 破坏方块 / 击碎巨砾 |
| 右键 | 放置当前方块 |
| `1`–`9` / 滚轮 | 切换物品 |
| `H` | 收起 / 唤回 HUD（拍照用） |
| `M` | 静音 |
| `Esc` | 暂停，松开鼠标 |
| `R` | 回到落日崖 |

## 这世界和原版不同的地方

### 低模体素，而不是大量正方体
地形仍保留体素世界的基本单位，但视觉主体由低模几何构成：

- 树干是六边锥形段，树冠是成簇的多面体叶团；
- 岩石、海蚀柱是手工拼合的多面体；
- 草丛、花、芦苇都来自程序化低模几何；
- 手持物与物品栏图标也是低模“日凝琥珀”式的碎块；
- 天空海面、云、飞鸟、船统一在一个落色调色板里。

### 重力与结构力学
这是一个“会倒”的世界。

- **树木不再悬空**：树根失去支撑、树干被砍断，树冠会以枢轴倒向坡下或远离玩家的方向，落地后炸成木片与叶团。
- **岩石不再悬空**：巨砾会在下方被挖空后开始坠落，沿地形坡度滚动、弹跳并最终停住；玩家可以和巨砾发生碰撞。
- **结构跨度有极限**：每类方块有不同的横向支撑跨度。苔草和沙几乎不能悬挑，玄武岩可以撑得久一点。你会在悬挑过长时看到整片结构变成落石。
- **坍塌是级联的**：挖掉洞顶、坡脚或桥墩，会触发局部支撑重算，落石、尘土和屏幕震动同时出现。
- **完整洞穴系统**：世界生成的是细长的“虫洞”式洞穴、少数洞室，以及从海崖里探出的洞口。它们大多是稳定的，直到你从错误的地方挖进去。

每一次编辑都会在局部做 0/1 权重的支撑传播：竖直受力免费，横向受力要消耗跨度。没有支撑的区域就会脱离地形，变为带物理的碎石。

## 画面技术

- 手写后期管线（不依赖 examples/addons）：阈值高光、双重高斯 bloom、屏幕空间径向体积光、日盘泛光、三枚很淡的透镜鬼影、ACES Filmic、色温分级、边缘色散、暗角、胶片颗粒、柔边 AA。
- 默认使用 **LDR 兼容渲染目标**，避免部分 GPU/ANGLE 驱动对 HalfFloat framebuffer 的异常；HDR 路径保留给经过验证的设备或诊断使用（见 [changelog.md](changelog.md)）。
- **永恒日落**：天空穹顶为自定义 shader。朝太阳一侧是金橙色地平线，背阳一侧是粉紫色；太阳是一个清晰的橙色圆盘，带暖色光晕、云层遮蔽与低空霞光。
- **海面**：解析波纹法线、天空/云层反射、菲涅尔、太阳高光、显式的“日光路”以及随潮线呼吸的泡沫。海水近岸半透，露出发紫的浅滩。
- **长影**：低角度方向光 + 2048 PCF Soft shadow map，光随玩家移动。海洋、树木、巨砾和地形都在光里。
- **薄雾与氛围**：指数雾、海面薄雾 Sprite、空气里的花粉、低空海鸟、远处的海蚀柱和帆船剪影。
- 世界生成、贴图、音效全部程序化；没有外部图片或音频文件。

## 项目结构

```text
index.html          界面、加载屏、HUD 与菜单
styles.css          完整的视觉样式
vendor/three.min.js three.js r149 UMD（便于直接打开）
src/core.js         调色板、确定性噪声、方块定义
src/world.js        海岸/山丘/洞穴生成、网格化、射线与体素修改
src/sky.js          天空 shader、太阳、云
src/water.js        海面 shader、反射、日光路、泡沫
src/props.js        低模树、岩石、草花、海鸟、船、薄雾、手持物
src/physics.js      支撑分析、坍塌、碎石、树木倒塌、粉尘
src/postfx.js       后期管线：默认 LDR，HDR 可选（bloom / 体积光 / ACES / 调色）
src/player.js       第一人称移动、碰撞、挖掘/放置、飞行
src/audio.js        程序化海浪、风、海鸥与材质音
src/ui.js           菜单、HUD、程序化物品图标
src/main.js         启动、载入、灯光与主循环
serve.mjs           可选的无依赖静态服务器
changelog.md        版本变更与工程文档入口
docs/               事故、决策、验证、发布与 AI 开发记录
```

## 一些提示

- 想体验“倒下的世界”，去砍附近一棵树，或从悬崖边挖掉一块支撑岩。
- 想看到洞穴坍塌，找到海岸崖壁上的暗色洞口，或者顺着松林里的竖向小洞往下挖。洞穴顶板有跨度极限。
- 如果你想拍一张干净的落日：按 `H` 隐藏 HUD，用滚动找好视角。海面会继续呼吸。
- 若帧率偏低，脚本会自动降低一点内部渲染分辨率；也可以缩小窗口并保持窗口聚焦。

## 兼容性

需要支持 WebGL 的现代浏览器。推荐 Chrome / Edge。启用硬件加速会得到明显更好的 bloom 和阴影表现。

后期默认使用 8 位 LDR 渲染目标。这是刻意选择的兼容性默认值：部分 GPU/ANGLE 驱动会错误处理 HalfFloat/HDR framebuffer，导致 3D 画面出现彩色雪花、柔焦或偶发正常帧。HDR 代码仍保留，但只能由验证过的设备或诊断代码显式启用。

## 变更记录与工程记录

- [changelog.md](changelog.md) — 版本入口与工程文档索引
- [docs/README.md](docs/README.md) — 事故、决策、验证、发布和 AI 开发记录的组织方式
- [docs/incidents/INC-2026-001-half-float-post-processing-corruption.md](docs/incidents/INC-2026-001-half-float-post-processing-corruption.md) — 本次兼容性缺陷的完整记录

## 许可

代码以 MIT 许可发布。three.js r149 版权与许可见 `vendor/three.LICENSE`。
