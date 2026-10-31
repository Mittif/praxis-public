#!/usr/bin/env bash
# Move an existing Compose installation into Praxis without renaming live volumes.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=praxis
source_project=${1:?用法：./deploy.sh migrate <现有Compose项目标识>}
[[ "$source_project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo '项目标识无效'; exit 1; }
[ "$source_project" != praxis ] || { echo '该实例已经使用 Praxis 标识'; exit 1; }
source=(docker compose -p "$source_project")
[ -n "$("${source[@]}" ps -q db)" ] || { echo '没有找到现有数据库容器'; exit 1; }
if docker volume inspect praxis_database >/dev/null 2>&1; then
 echo '目标数据库卷已存在；为避免覆盖数据，请使用备份恢复流程。'; exit 1
fi
folder="backups/migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$folder"
source_web=$("${source[@]}" ps --all -q web)
certificates=''
if [ -n "$source_web" ]; then
 certificates=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$source_web")
fi
fingerprint_sql="SELECT 'accounts|' || count(*) || '|' || coalesce(md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY id)), '') FROM accounts t;
SELECT 'sessions|' || count(*) || '|' || coalesce(md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY id)), '') FROM practice_sessions t;
SELECT 'attempts|' || count(*) || '|' || coalesce(md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY id)), '') FROM answer_events t;
SELECT 'tokens|' || count(*) || '|' || coalesce(md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY token)), '') FROM auth_sessions t;"
failed() {
 trap - ERR
 echo "迁移未完成。备份保留在 $folder，正在恢复原服务入口。"
 docker compose stop app web >/dev/null 2>&1 || true
 "${source[@]}" start app web >/dev/null 2>&1 || true
 exit 1
}
trap failed ERR
"${source[@]}" stop app web
"${source[@]}" exec -T db pg_dump -U practice practice > "$folder/database.sql"
"${source[@]}" exec -T db psql -U practice -d practice -t -A -c "$fingerprint_sql" > "$folder/source-fingerprint.txt"
if [ -n "$certificates" ]; then
 docker volume create --label com.docker.compose.project=praxis --label com.docker.compose.volume=certificates praxis_certificates >/dev/null
 docker run --rm --network none --entrypoint sh -v "$certificates:/from:ro" -v praxis_certificates:/to caddy:2-alpine -c 'cp -a /from/. /to/'
fi
docker compose up -d db
for attempt in {1..30}; do
 if docker compose exec -T db pg_isready -U practice >/dev/null 2>&1; then break; fi
 sleep 2
done
docker compose exec -T db pg_isready -U practice >/dev/null
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U practice -d practice < "$folder/database.sql" > "$folder/restore.log"
docker compose exec -T db psql -U practice -d practice -t -A -c "$fingerprint_sql" > "$folder/target-fingerprint.txt"
cmp -s "$folder/source-fingerprint.txt" "$folder/target-fingerprint.txt"
echo '账号、会话与答题记录迁移校验通过。'
./deploy.sh local
trap - ERR
"${source[@]}" down
printf '已迁移至 Praxis；备份：%s。原数据卷保留，未自动删除。\n' "$folder"
