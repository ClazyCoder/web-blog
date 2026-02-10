"""
Orphan 이미지 정리 서비스

고아 이미지(orphan images) 정의:
1. 임시 업로드 후 게시글에 연결되지 않은 이미지 (is_temporary=True, post_id=None)
2. 게시글 수정 시 본문에서 제거된 이미지 (is_temporary=True, post_id=None)
3. 이미 soft-delete된 이미지 (deleted_at IS NOT NULL)

정리 정책:
- 임시 이미지: 생성 후 일정 시간(기본 24시간) 경과 시 삭제
- soft-delete된 이미지: 삭제 후 일정 시간(기본 7일) 경과 시 파일 + DB 레코드 영구 삭제
"""

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import AsyncSessionLocal
from models.image import Image

logger = logging.getLogger("image_cleanup")

# 설정
UPLOAD_DIR = Path("uploads/images")
ORPHAN_TTL_HOURS = 24          # 임시 이미지 보존 시간 (시간)
SOFT_DELETE_TTL_DAYS = 7       # soft-delete 이미지 영구 삭제까지 대기 기간 (일)
CLEANUP_INTERVAL_HOURS = 1     # 정리 작업 실행 간격 (시간)


async def cleanup_orphan_images(db: AsyncSession) -> dict:
    """
    고아 이미지 정리 (임시 업로드 후 미연결 이미지)
    
    조건: is_temporary=True AND post_id IS NULL AND created_at < (현재 - ORPHAN_TTL_HOURS)
    동작: 파일 삭제 + soft-delete (deleted_at 설정)
    """
    cutoff = datetime.now() - timedelta(hours=ORPHAN_TTL_HOURS)
    
    stmt = select(Image).where(
        and_(
            Image.is_temporary.is_(True),
            Image.post_id.is_(None),
            Image.deleted_at.is_(None),
            Image.created_at < cutoff,
        )
    )
    result = await db.execute(stmt)
    orphans = result.scalars().all()
    
    deleted_count = 0
    errors = []
    
    for img in orphans:
        try:
            # 실제 파일 삭제
            file_path = UPLOAD_DIR / img.filename
            if file_path.exists():
                file_path.unlink()
            
            # DB soft-delete
            img.deleted_at = datetime.now()
            deleted_count += 1
        except Exception as e:
            errors.append(f"Image {img.id} ({img.storage_key}): {str(e)}")
    
    if orphans:
        await db.commit()
    
    return {
        "type": "orphan_cleanup",
        "found": len(orphans),
        "deleted": deleted_count,
        "errors": errors,
    }


async def purge_soft_deleted_images(db: AsyncSession) -> dict:
    """
    soft-delete된 이미지 영구 삭제
    
    조건: deleted_at IS NOT NULL AND deleted_at < (현재 - SOFT_DELETE_TTL_DAYS)
    동작: 파일 삭제 (아직 남아있다면) + DB 레코드 하드 삭제
    """
    cutoff = datetime.now() - timedelta(days=SOFT_DELETE_TTL_DAYS)
    
    stmt = select(Image).where(
        and_(
            Image.deleted_at.isnot(None),
            Image.deleted_at < cutoff,
        )
    )
    result = await db.execute(stmt)
    expired = result.scalars().all()
    
    purged_count = 0
    errors = []
    
    for img in expired:
        try:
            # 실제 파일 삭제 (아직 남아있는 경우)
            file_path = UPLOAD_DIR / img.filename
            if file_path.exists():
                file_path.unlink()
            
            # DB 하드 삭제
            await db.delete(img)
            purged_count += 1
        except Exception as e:
            errors.append(f"Image {img.id} ({img.storage_key}): {str(e)}")
    
    if expired:
        await db.commit()
    
    return {
        "type": "purge_soft_deleted",
        "found": len(expired),
        "purged": purged_count,
        "errors": errors,
    }


async def run_cleanup() -> dict:
    """
    전체 정리 작업 실행 (단일 실행용)
    
    Returns:
        정리 결과 요약
    """
    async with AsyncSessionLocal() as db:
        try:
            orphan_result = await cleanup_orphan_images(db)
            purge_result = await purge_soft_deleted_images(db)
            
            summary = {
                "timestamp": datetime.now().isoformat(),
                "orphan_cleanup": orphan_result,
                "purge_soft_deleted": purge_result,
            }
            
            # 작업이 있었을 때만 로그 출력
            if orphan_result["deleted"] > 0 or purge_result["purged"] > 0:
                logger.info(
                    f"Image cleanup completed: "
                    f"orphans={orphan_result['deleted']}, "
                    f"purged={purge_result['purged']}"
                )
            
            if orphan_result["errors"] or purge_result["errors"]:
                logger.warning(
                    f"Image cleanup errors: "
                    f"orphan_errors={orphan_result['errors']}, "
                    f"purge_errors={purge_result['errors']}"
                )
            
            return summary
            
        except Exception as e:
            logger.error(f"Image cleanup failed: {str(e)}")
            return {
                "timestamp": datetime.now().isoformat(),
                "error": str(e),
            }


async def start_cleanup_scheduler():
    """
    주기적 정리 작업 스케줄러 (asyncio 기반)
    FastAPI lifespan에서 백그라운드 태스크로 실행
    """
    logger.info(
        f"Image cleanup scheduler started "
        f"(interval={CLEANUP_INTERVAL_HOURS}h, "
        f"orphan_ttl={ORPHAN_TTL_HOURS}h, "
        f"purge_ttl={SOFT_DELETE_TTL_DAYS}d)"
    )
    
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 3600)
            await run_cleanup()
        except asyncio.CancelledError:
            logger.info("Image cleanup scheduler stopped")
            break
        except Exception as e:
            logger.error(f"Cleanup scheduler error: {str(e)}")
            # 에러 발생해도 스케줄러는 계속 실행
            await asyncio.sleep(60)
