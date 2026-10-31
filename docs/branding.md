# Praxis 品牌与目录整理

## 命名约定

- 项目名称：Praxis；仓库与工作目录使用 `praxis`。
- 前端包：`@praxis/web`；浏览器标题与接口文档标题使用Praxis。
- Compose项目标识：`praxis`，不再由本地文件夹名称自动推导。
- 运行镜像：`praxis-api:current`、`praxis-web:current`；回滚镜像使用相同仓库的 `previous` 标签。
- 数据卷：`praxis_database`、`praxis_certificates`。
- 数据库内部服务名、用户名及表结构保持通用命名，不因品牌调整而修改账号数据。

## 现有实例与本地资料

已有部署通过 `deploy.sh migrate` 迁移。数据库导出恢复后，对账号、登录会话、练习和答题数据逐表比较指纹；验证通过才切换入口。原数据卷保留为回退副本。

本地目录改名后重建Python虚拟环境、刷新Node依赖和路径缓存。历史备份及临时记录归档到项目目录之外的私有位置，保留原记录，不改写备份文件内容。Git历史保持可追溯，源码审查针对当前工作树；不会通过修改历史提交来伪造项目沿革。

## 展示素材

- `docs/assets/brand/`：原创SVG标识，前端favicon由相同图形导出。
- `docs/assets/showcase/`：README功能截图、组件截图、综合海报及HTML源文件。
- `scripts/build_showcase.mjs`：执行视觉用例并重建素材，默认访问本机8080入口。
- 所有新展示图采用真实组件与自编演示数据，不使用真实用户资料、实际口令或第三方题库题目。

## 文档与许可

README覆盖功能、快速开始、开发、题库工作流、部署入口和维护导航。运维细节独立到 `docs/deployment.md`，贡献与安全报告方式分别见CONTRIBUTING和SECURITY。

自有源码默认采用MIT；题库及第三方内容不包含在该许可授权中，具体范围见NOTICE。未配置远程仓库时，不虚构线上演示地址、CI状态、发布记录或GitHub仓库链接。

## 验证记录

本次已执行16项后端测试、8项浏览器测试，验证了迁移前后数据一致、移动端布局、选项标签对应和README本地链接。源代码和本地环境的旧目录标识残留另行扫描，私有凭据检查使用 `scripts/check_secrets.py`。
