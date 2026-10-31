"""Shared bookmarks; existing accounts, attempts and sessions are unchanged."""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'


def upgrade():
    if 'question_bookmarks' not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table('question_bookmarks',
                        sa.Column('uid', sa.String, primary_key=True),
                        sa.Column('qid', sa.String, primary_key=True),
                        sa.Column('created', sa.Float, nullable=False))


def downgrade():
    raise RuntimeError('请使用备份恢复，避免删除用户收藏')
