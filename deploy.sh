#!/usr/bin/env bash
set -euo pipefail
umask 077
export LC_ALL=C
export COMPOSE_PROJECT_NAME=praxis
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo '请先安装 Docker Engine/Desktop 与 Compose 插件'; exit 1; }
docker compose version >/dev/null
action=${1:-local}
if [ ! -f .env ]; then
 umask 077
 printf 'DB_PASSWORD=%s\nSITE_ADDRESS=:80\nHTTP_PORT=8080\nHTTPS_PORT=8443\nCOOKIE_SECURE=false\n' "$(openssl rand -hex 24)" > .env
fi
value() { sed -n "s/^$1=//p" .env | tail -1; }
backup() {
 mkdir -p backups
 stamp=$(date +%Y%m%d-%H%M%S)
 folder="backups/$stamp"; mkdir -p "$folder"
 docker compose exec -T db pg_dump -U practice practice > "$folder/database.sql"
 cp -R data "$folder/data"
 docker compose images > "$folder/images.txt"
 tar -czf "$folder.tar.gz" -C backups "$stamp"
 echo "备份完成：$folder.tar.gz（请另行安全保存 .env）"
}
health() {
 port=$(value HTTP_PORT); port=${port:-8080}
 site=$(value SITE_ADDRESS)
 url="http://127.0.0.1:$port/api/v1/health"
 if [ "$site" != ':80' ] && [ -n "$site" ]; then
  case "$site" in http://*) url="$site/api/v1/health";; https://*) url="$site/api/v1/health";; *) url="https://$site/api/v1/health";; esac
 fi
 for i in {1..30}; do
  if curl --max-time 5 -fsS "$url"; then printf '\n部署成功：%s\n' "${url%/api/v1/health}"; return 0; fi
  sleep 2
 done
 docker compose logs --tail=50; echo '健康检查失败，请检查端口、域名解析及证书'; return 1
}
case "$action" in
migrate)
 ./scripts/migrate_compose.sh "${2:?请指定现有Compose项目标识}";;
production)
 if [ "$(value SITE_ADDRESS)" = ':80' ]; then
  read -r -p '域名（留空则使用服务器 HTTP 80 测试）：' domain
  if [ -n "$domain" ] && ! [[ "$domain" =~ ^[a-zA-Z0-9.-]+$ ]]; then echo '域名格式无效'; exit 1; fi
  if [ -n "$domain" ]; then address="$domain"; secure=true; else address=':80';secure=false;fi
  temp=$(mktemp)
  sed -e "s/^SITE_ADDRESS=.*/SITE_ADDRESS=$address/" -e 's/^HTTP_PORT=.*/HTTP_PORT=80/' -e 's/^HTTPS_PORT=.*/HTTPS_PORT=443/' -e "s/^COOKIE_SECURE=.*/COOKIE_SECURE=$secure/" .env > "$temp"
  cp "$temp" .env; chmod 600 .env
 fi
 docker compose config --quiet
 docker compose up -d --build
 health;;
local)
 docker compose config --quiet
 docker compose up -d --build
 health;;
update)
 backup
 for service in app web; do
  image=$(docker compose images -q "$service" | head -1)
  if [ -n "$image" ]; then
   case "$service" in app) repository=praxis-api;; web) repository=praxis-web;; esac
   docker tag "$image" "$repository:previous"
  fi
 done
 docker compose up -d --build
 health;;
backup) backup;;
restore)
 file=${2:?用法：./deploy.sh restore backups/时间戳.tar.gz --confirm}
 [ "${3:-}" = '--confirm' ] || { echo '恢复会覆盖数据库与题库，请追加 --confirm'; exit 1; }
 [ -f "$file" ] || { echo '备份不存在'; exit 1; }
 backup
 temp=$(mktemp -d)
 # Only accept archives produced by this script, without absolute or parent paths.
 if tar -tzf "$file" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then echo '不安全的备份路径';exit 1;fi
 tar -xzf "$file" -C "$temp"
 dump=$(find "$temp" -name database.sql -type f | head -1)
 [ -n "$dump" ] || { echo '缺少数据库备份'; exit 1; }
 docker compose stop app
 docker compose exec -T db psql -v ON_ERROR_STOP=1 -U practice -d practice -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
 docker compose exec -T db psql -v ON_ERROR_STOP=1 -U practice -d practice < "$dump"
 cp -R "$(dirname "$dump")/data/." data/
 docker compose up -d --build app
 health;;
rollback)
 docker image inspect praxis-api:previous praxis-web:previous >/dev/null
 APP_IMAGE=praxis-api:previous WEB_IMAGE=praxis-web:previous docker compose up -d --no-build app web
 health;;
stop) docker compose down;;
logs) docker compose logs --tail=100;;
*) echo '支持: local production migrate update backup restore rollback stop logs'; exit 1;;
esac
