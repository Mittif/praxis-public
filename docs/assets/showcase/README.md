# Praxis 展示素材

该目录保存 README 引用的真实 UI 截图、综合海报和可编辑 HTML 源文件。KPB 新版与原版独立保存，原有素材不覆盖。

现有图片记录了较早的主站视觉版本。后续新增的紧凑回看、错题分页与简洁模式品牌，以当前实现为准；README 已说明这一差异。更新素材时需要实际运行浏览器场景，不将布局示意或离线 DOM 验证当成最新截图。

## KPB 漫画海报

```sh
node scripts/build_showcase_kpb.mjs
```

该脚本直接复用本目录已有的真实组件截图，不需要启动 Praxis 服务，不读取账号数据。需要前端开发依赖和 Google Chrome。输出为 **3600 × 2400** PNG，设计画布为 1800 × 1200。排版 HTML 在小屏浏览器中等比缩放，保留整张海报。

- `praxis-overview-kpb.png`：新版七格漫画海报，README 当前使用的版本。
- `overview-kpb.html`：可编辑的文字、截图、信息层级和排版源文件。
- `kpb-panels.svg`：七个可独立编辑的矢量分镜，主描边统一为 4px，色块、网点、星形与装饰均为矢量。
- `kpb-render-report.json`：最近一次图片加载、文字溢出与画布尺寸检查结果。
- `references/comic-panel-grid.png`：用户提供的漫画网格原图，原样保留。
- `references/kinetic-pop-brutalism.md`：用户提供的设计 skill，原样保留。

按 KPB 海报预设 **90 / 65 / 90**（动感 / 装饰密度 / 几何精度）设计。参考原图重绘可编辑底板，为现有 UI 截图调整分镜比例；文字和截图保持水平，不随边框倾斜。沿用原有品牌标识和组件截图，不重新生成或伪造产品界面。

## 原版海报与组件截图

在本机Praxis服务启动、前端开发依赖安装且Google Chrome可用后运行：

```sh
node scripts/build_showcase.mjs
```

脚本会执行两项视觉用例，使用自编场景拦截API响应，不读取正式账号的数据；随后生成截图和 `praxis-overview.png`。已有最新截图时可以追加 `--reuse-screenshots`。

- `overview.html`：海报布局源文件，直接在浏览器中打开即可查看。
- `praxis-overview.png`：保留的原版综合海报。
- `home.png`、`feedback.png`、`mistakes.png`、`summary.png`：功能截图。
- `mobile.png`：手机端练习示例。
- `banks.png`、`continue.png`、`feedback-paper.png`、`setup-card.png`：用于海报的组件截图。

海报采用原生HTML/CSS排版后由浏览器截图，无外部图片服务，不使用真实用户身份或第三方题库题目。品牌SVG见相邻的 `brand/` 目录。
