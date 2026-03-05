"""add is_secret to posts

Revision ID: 03944ec69ea4
Revises: 53e4aaf678ac
Create Date: 2026-03-06 08:08:57.845352

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '03944ec69ea4'
down_revision: Union[str, Sequence[str], None] = '53e4aaf678ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('posts', sa.Column('is_secret', sa.Boolean(), nullable=True))
    op.execute("UPDATE posts SET is_secret = FALSE WHERE is_secret IS NULL")
    op.alter_column(
        'posts',
        'is_secret',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    )
    op.create_index(op.f('ix_posts_is_secret'), 'posts', ['is_secret'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_posts_is_secret'), table_name='posts')
    op.drop_column('posts', 'is_secret')
