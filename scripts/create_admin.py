"""Create an administrator from the server terminal; never seed a default password."""
import argparse
import getpass
import sys
import uuid

from sqlalchemy.exc import IntegrityError
from backend.app import e, users, password, insert, select


def create_admin(name: str, plaintext: str) -> dict:
    name = name.strip()
    if not 2 <= len(name) <= 40:
        raise ValueError('用户名需为 2–40 个字符')
    if not 8 <= len(plaintext) <= 128:
        raise ValueError('密码需为 8–128 个字符')
    account = {'id': str(uuid.uuid4()), 'name': name, 'role': 'admin'}
    try:
        with e.begin() as connection:
            if connection.execute(select(users.c.id).where(users.c.name == name)).first():
                raise ValueError('用户名已存在，未修改现有账号')
            connection.execute(insert(users).values(**account, password=password(plaintext)))
    except IntegrityError as exc:
        raise ValueError('用户名已存在，未修改现有账号') from exc
    return account


def main():
    parser = argparse.ArgumentParser(description='创建管理员账号（仅服务器终端）')
    parser.add_argument('username')
    parser.add_argument('--password-stdin', action='store_true',
                        help='从标准输入读取一行密码，避免密码出现在命令行参数中')
    args = parser.parse_args()
    plaintext = (sys.stdin.readline().rstrip('\r\n') if args.password_stdin
                 else getpass.getpass('管理员密码：'))
    try:
        account = create_admin(args.username, plaintext)
    except ValueError as exc:
        parser.exit(1, str(exc) + '\n')
    print(f"管理员账号已创建：{account['name']}")


if __name__ == '__main__':
    main()
