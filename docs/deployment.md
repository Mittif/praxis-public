# Praxis 部署与运维

## 环境与入口

需要Docker Engine或Docker Desktop、Compose插件、Bash、curl、openssl及tar。当前已在macOS的arm64 Docker环境验证，目标服务器仍应执行一次部署和恢复测试。

- `./deploy.sh local`：默认HTTP 8080、HTTPS映射8443，入口为 http://localhost:8080。
- `./deploy.sh production`：首次提示域名，使用80/443端口；域名解析正确且端口可达时由Caddy自动申请证书。
- 没有域名时可先使用HTTP检查服务。正式账号使用HTTPS，并设置 `COOKIE_SECURE=true`。

服务由 `app`、`db`、`web` 组成，固定Compose项目名为 `praxis`，使用 `praxis_database` 与 `praxis_certificates` 卷。应用等待数据库健康，网站入口等待API健康。PostgreSQL不映射宿主端口。

公开仓库初次运行需先执行 `python3 scripts/init_demo_bank.py` 生成自编演示题库，或准备自己有权使用的题库，详见 [本地题库说明](../data/README.md)。已有题库时跳过演示初始化，脚本也不会覆盖现有文件。

## 配置

首次运行自动生成权限为600的 `.env`；也可提前根据 `.env.example` 准备私有配置以便无人值守部署。

| 变量 | 用途与默认值 |
| --- | --- |
| `DB_PASSWORD` | 首次随机生成的数据库密码，不提交Git |
| `SITE_ADDRESS` | 本地为 `:80`；生产填写实际域名 |
| `HTTP_PORT` | 本地8080，生产通常80 |
| `HTTPS_PORT` | 本地8443，生产通常443 |
| `COOKIE_SECURE` | 本地HTTP为false，对外HTTPS为true |
| `BIND_ADDRESS` | 默认 `0.0.0.0`；接到宿主反向代理后面时设置为 `127.0.0.1` |
| `APP_IMAGE` | 默认 `praxis-api:current` |
| `WEB_IMAGE` | 默认 `praxis-web:current` |

Caddyfile、Compose文件和.env.example是公开模板，真实域名和密钥放在私有.env中。后端生产连接由Compose注入；本地开发可使用 `DATABASE_URL=sqlite:///data/app.db`。

宿主机已有反向代理时，保留原代理和站点，设置 `BIND_ADDRESS=127.0.0.1`、未占用的 `HTTP_PORT` / `HTTPS_PORT`、`SITE_ADDRESS=:80`。由原代理为实际域名提供 HTTPS 并转发到本机 HTTP 端口，同时设置 `COOKIE_SECURE=true`。这样容器端口只在服务器本机监听，数据库也不直接对外开放。

## 已有部署迁移

如果已有使用其他Compose项目标识的实例，直接启动新实例会创建新数据卷。先在新版本仓库根目录执行：

```sh
./deploy.sh migrate <现有Compose项目标识>
```

`<现有Compose项目标识>` 是占位说明，请替换为实际项目名。可用 `docker compose ls` 查看当前实例。

迁移会暂停原应用入口，备份数据库，复制证书卷，将数据库恢复至Praxis卷，逐表核对账号、令牌、练习与答题数据指纹，再构建和启动新服务。新服务健康后移除原容器，原数据卷保留为回退副本。失败时尝试恢复原入口。

为避免覆盖数据，目标 `praxis_database` 已存在时迁移会停止；此时请先检查已有实例，使用明确的备份恢复流程。所有迁移文件放在私有 `backups/` 中。迁移期间会有短暂不可用，请避开用户答题时段。

## 更新与回滚

```sh
./deploy.sh update
./deploy.sh rollback
```

更新先备份，再保存上一个应用及前端镜像，随后执行构建、Alembic迁移与健康检查。回滚使用 `praxis-api:previous` 和 `praxis-web:previous`，不自动回退数据库。

没有成功更新过的全新实例不存在previous镜像，不能直接回滚。后续迁移应向后兼容；不兼容的数据变化需要使用备份恢复。

## 备份与恢复

```sh
./deploy.sh backup
./deploy.sh restore backups/实际备份文件.tar.gz --confirm
```

备份包含数据库、题库和材料资源；另行安全保管.env和证书配置，并将备份复制至其他磁盘或主机。恢复会覆盖当前数据库，执行前再次备份，使用自身生成的可信文件。

每日备份示例，路径需按实际安装目录修改：

```cron
0 3 * * * cd /opt/praxis && ./deploy.sh backup >> /opt/praxis/backups.log 2>&1
```

不要使用 `docker compose down -v` 来停止日常服务，该选项会删除数据卷。保留备份的数量与周期由实例维护者决定。

## 账号维护

```sh
docker compose exec app python -m scripts.create_admin maintainer
docker compose exec app python -m scripts.reset_password maintainer
```

密码通过终端隐藏输入，不要写入仓库或命令行参数。修改密码会使该账号的旧会话失效。

## 日常检查与排错

```sh
docker compose ps
./deploy.sh logs
curl -fsS http://localhost:8080/api/v1/health
```

- **端口占用**：检查已有网站、反向代理和.env中的映射端口；共享服务器可把Praxis接到现有代理后面。
- **HTTPS失败**：核对域名解析、80/443可达性、Caddy日志与证书申请状态。HTTP跳转成功不代表HTTPS已配置完成。
- **数据库不健康**：先查看db日志与磁盘空间，不要删除卷来“重新初始化”。
- **首次构建较慢**：依赖下载、镜像拉取和前端构建比正常运行更占资源；小内存机器可准备适当swap或在匹配架构的构建环境生成镜像。
- **恢复或升级失败**：保留日志和备份，避免重复执行覆盖操作；先检查迁移版本与失败步骤。

敏感数据只在私有运行环境与备份中保留。安全边界和报告方式见 [SECURITY](../SECURITY.md)。
