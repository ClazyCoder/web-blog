import React from 'react';

interface UploadedImage {
    url: string;
    filename: string;
    uploadedAt: number;
}

interface EditorSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    uploadedImages: UploadedImage[];
    onImageSelect: (url: string, filename: string) => void;
    onImageDelete: (url: string) => void;
}

const EditorSidebar: React.FC<EditorSidebarProps> = ({ 
    isOpen, 
    onClose, 
    uploadedImages, 
    onImageSelect,
    onImageDelete
}) => {
    return (
        <>
            {/* 오버레이 */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/30 backdrop-blur-md z-40 transition-all duration-300"
                    onClick={onClose}
                />
            )}

            {/* 사이드바 */}
            <div 
                className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                        업로드된 이미지
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        title="닫기"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 이미지 리스트 */}
                <div className="overflow-y-auto h-[calc(100%-73px)] p-4">
                    {uploadedImages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-center">
                                아직 업로드된 이미지가 없습니다
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {uploadedImages.map((image, index) => (
                                <div
                                    key={index}
                                    className="group bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden hover:shadow-md transition-all duration-200 border-2 border-transparent hover:border-blue-500 relative"
                                >
                                    {/* 삭제 버튼 */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('이 이미지를 목록에서 제거하시겠습니까?')) {
                                                onImageDelete(image.url);
                                            }
                                        }}
                                        className="absolute top-2 right-2 z-10 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                                        title="이미지 제거"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>

                                    {/* 이미지 프리뷰 */}
                                    <div 
                                        className="aspect-video w-full overflow-hidden bg-gray-200 dark:bg-gray-600 cursor-pointer"
                                        onClick={() => onImageSelect(image.url, image.filename)}
                                    >
                                        <img
                                            src={image.url}
                                            alt={image.filename}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                            loading="lazy"
                                        />
                                    </div>
                                    
                                    {/* 이미지 정보 */}
                                    <div 
                                        className="p-3 cursor-pointer"
                                        onClick={() => onImageSelect(image.url, image.filename)}
                                    >
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={image.filename}>
                                            {image.filename}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {new Date(image.uploadedAt).toLocaleString('ko-KR', {
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                                                클릭하여 삽입
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default EditorSidebar;
