"""Add explicit administrator roles; existing accounts remain ordinary users."""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'


def upgrade():
    op.add_column('accounts', sa.Column('role', sa.String(), nullable=False,
                                      server_default='user'))


def downgrade():
    op.drop_column('accounts', 'role')
