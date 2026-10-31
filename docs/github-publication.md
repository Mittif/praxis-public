# 准备公开 GitHub 仓库

公开范围是应用源码、部署模板、文档、品牌与自编演示截图。第三方 PDF、提取题库、原页图片、账号数据、实例配置、备份和密钥继续私有保存。

## 先区分两种工作目录

- 从干净公开仓库克隆的贡献目录，可以按正常分支和 PR 流程提交。
- 曾跟踪私有资料的本地开发目录，需要先导出独立公开副本。`.gitignore` 只影响之后的跟踪，不会删除旧提交中的资料。

先执行：

```sh
python3 scripts/check_secrets.py
python3 scripts/check_publication.py
```

前者检查凭据模式，后者检查所有可达历史中的私有数据与符号链接。若历史检查阻止公开，保留原目录，使用下面的副本流程；不要为此删除资料、强制推送或直接重写自己的开发历史。

## 生成可审查的公开包

先完成需要公开的修改与 commit，再运行：

```sh
python3 scripts/check_docs.py
python3 scripts/package_public.py
```

输出为 `tmp/public/praxis-github-public.zip`，内含 `praxis/` 目录。打包脚本读取当前 Git 索引和未忽略的新文件，不带入 `.git`；检查路径、文件内容及本机密钥模式，并拒绝文件或目录符号链接。强制跟踪题库或数据库也会使导出停止。

该工具不会改写原仓库，也不执行网络推送。不要直接用系统压缩功能打包整个开发目录。

## 准备独立 Git 仓库

将 ZIP 解压到一个全新目录，在其中初始化独立历史：

```sh
unzip tmp/public/praxis-github-public.zip -d tmp/github-upload
cd tmp/github-upload/praxis
git init -b main
```

在首个公开 commit 前确认 Git 作者信息，建议使用自己的 GitHub noreply 邮箱。自动准备的副本也可以使用项目身份 `Praxis Contributors`，避免携带本机个人邮箱；在手动推送前仍可自行调整。

```sh
git add .
git commit -m "Initial public source release"
python3 scripts/check_secrets.py
python3 scripts/check_publication.py
python3 scripts/check_docs.py
git config core.hooksPath .githooks
```

此时检查源码、README、图片、作者信息和首个 commit。确认后再在该独立目录中添加自己的 GitHub remote 并手动推送，或用 GitHub Desktop 添加该本地仓库。原开发目录与它的旧 `.git` 不应一起上传。推送 hook 只运行检查，不执行推送或部署。

## 验证克隆后可运行

公开副本应能只依赖自编演示题库完成检查：

```sh
python3 scripts/init_demo_bank.py
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm ci --prefix frontend
npm run test:presentation --prefix frontend
npm run build --prefix frontend
./deploy.sh local
```

演示库生成 200 道自编题，真实题库不会被覆盖。CI 无需部署密钥或正式用户数据；浏览器验证按 [贡献指南](../CONTRIBUTING.md) 在独立测试实例执行。

实际检查只覆盖所描述的文件范围和已知模式，不构成对未知敏感信息的绝对保证；个人资料或私有题库也不应进入公开截图。
