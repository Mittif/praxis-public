# 参与 Praxis

欢迎提交可复现的问题、聚焦一个行为的修复，以及文档和体验改进。项目约定见 [架构说明](docs/architecture.md)，上手步骤见 [README](README.md#本地开发)。

## 配置开发环境

使用 Python 3.12+ 和 Node.js 22，在功能分支中开发。首次克隆公开源码时先生成自编题库：

```sh
python3 scripts/init_demo_bank.py
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm ci --prefix frontend
```

已有 `data/questions.json` 时跳过初始化，不要覆盖自己的资料。按 README 分别启动 API 和 Vite。实例配置放在 `.env`，用户数据库、题库、原页图片和运行报告不提交 Git。

## 代码与数据约定

- 服务端负责身份校验、选题与判分。固定题目／选项 ID 与显示字母分离。
- 保留会话快照、幂等提交、账号隔离，以及两站对同一学习记录的兼容性。
- 题库版本变化不能悄悄替换已开始练习的题意；旧会话通过自身快照恢复。
- 主站沿用纸张、描边、硬阴影与有限像素反馈；简洁模式保持轻量，两者均适配减少动态效果设置。
- 数据库结构变化使用 Alembic，说明旧数据的处理和恢复方式；不要在更新中删除数据卷。
- 示例、截图和新增测试使用自编内容，不携带第三方题库或真实账号信息。

## 运行检查

```sh
.venv/bin/python -m pytest -q
npm run test:presentation --prefix frontend
npm run build --prefix frontend
python3 scripts/check_docs.py
python3 scripts/check_secrets.py
python3 scripts/check_publication.py
git diff --check
```

CI 使用生成的演示题库运行这些检查。`check_publication.py` 会检查所有可达 Git 历史；若本机保留了私有资料历史，按 [公开副本流程](docs/github-publication.md) 准备独立仓库，不要重写或删除自己的工作资料。

可在干净公开仓库中启用本地推送检查：

```sh
git config core.hooksPath .githooks
```

该 hook 仅运行公开内容与凭据检查，不会自动推送或访问部署服务器。

## 浏览器与视觉验证

浏览器用例默认使用本机 Google Chrome，环境准备见 [Playwright 官方说明](https://playwright.dev/docs/browsers)。先启动本地应用，再运行：

```sh
BASE_URL=http://localhost:8080 npm run test:e2e --prefix frontend
```

使用 Vite 联调时，将 `BASE_URL` 改为 `http://127.0.0.1:5173`。套件包含使用自编响应的界面场景，也包含创建测试账号的真实 API 场景，因此只对本地或独立测试实例运行。

界面变更检查桌面、手机、窄屏、长题／长解析、错误反馈、刷新恢复和减少动态效果。附上真实执行的截图或结果；如果只能运行构建与离线逻辑检查，应明确写出尚未完成的浏览器验证。

README 的海报与截图保存在 `docs/assets/`，生成方式见 [展示素材说明](docs/assets/showcase/README.md)。保留可编辑源文件，截图仅使用自编数据；不能把手工示意图称为真实产品截图。

## Issue 与 Pull Request

反馈问题时提供版本、环境、复现步骤和预期／实际行为。功能建议先描述使用场景。PR 说明具体问题、行为变化、检查结果和兼容性影响，提交前检查文档与截图是否仍然准确。

安全问题按 [SECURITY](SECURITY.md) 中的方式报告；公开 Issue、日志与截图中不要放密码、Cookie、令牌、私钥或真实学习资料。
