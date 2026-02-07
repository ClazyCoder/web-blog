"""
이미지 업로드 API 예시
FastAPI를 사용한 이미지 업로드 엔드포인트 구현 예시입니다.

설치 필요:
pip install fastapi uvicorn python-multipart pillow

실행:
uvicorn api_example_image_upload:app --reload --port 8000
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uuid
import shutil
from datetime import datetime
from typing import Optional

app = FastAPI(title="Image Upload API")

# CORS 설정 (개발 환경)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드 디렉토리 설정
UPLOAD_DIR = Path("uploads/images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# 허용된 이미지 확장자
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

# 최대 파일 크기 (5MB)
MAX_FILE_SIZE = 5 * 1024 * 1024


def validate_image(file: UploadFile) -> bool:
    """이미지 파일 유효성 검사"""
    # 파일 확장자 체크
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False
    
    # Content-Type 체크
    if not file.content_type or not file.content_type.startswith("image/"):
        return False
    
    return True


def generate_unique_filename(original_filename: str) -> str:
    """고유한 파일명 생성"""
    file_ext = Path(original_filename).suffix.lower()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"{timestamp}_{unique_id}{file_ext}"


@app.post("/api/upload/image")
async def upload_image(file: UploadFile = File(...)):
    """
    이미지 업로드 엔드포인트
    
    Returns:
        {
            "success": true,
            "url": "http://localhost:8000/uploads/images/20240208_123456_abc123.jpg",
            "filename": "20240208_123456_abc123.jpg",
            "original_filename": "my-image.jpg",
            "size": 123456
        }
    """
    
    # 파일 유효성 검사
    if not validate_image(file):
        raise HTTPException(
            status_code=400,
            detail="Invalid image file. Allowed formats: jpg, jpeg, png, gif, webp"
        )
    
    try:
        # 파일 크기 체크
        content = await file.read()
        file_size = len(content)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024)}MB"
            )
        
        # 고유한 파일명 생성
        unique_filename = generate_unique_filename(file.filename or "image.jpg")
        file_path = UPLOAD_DIR / unique_filename
        
        # 파일 저장
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        
        # URL 생성 (실제 환경에서는 CDN URL이나 실제 서버 URL 사용)
        file_url = f"http://localhost:8000/uploads/images/{unique_filename}"
        
        return {
            "success": True,
            "url": file_url,
            "filename": unique_filename,
            "original_filename": file.filename,
            "size": file_size
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")
    finally:
        await file.close()


@app.get("/api/upload/temp/{filename}")
async def get_temp_image_info(filename: str):
    """
    임시 이미지 정보 조회 (선택사항)
    실제로는 이미지를 직접 serve하거나 CDN URL을 반환
    """
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    return {
        "filename": filename,
        "exists": True,
        "url": f"http://localhost:8000/uploads/images/{filename}"
    }


@app.delete("/api/upload/image/{filename}")
async def delete_image(filename: str):
    """
    이미지 삭제 엔드포인트 (선택사항)
    """
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    try:
        file_path.unlink()
        return {"success": True, "message": f"Image {filename} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(e)}")


@app.get("/")
async def root():
    return {
        "message": "Image Upload API",
        "endpoints": {
            "upload": "POST /api/upload/image",
            "get_info": "GET /api/upload/temp/{filename}",
            "delete": "DELETE /api/upload/image/{filename}"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
