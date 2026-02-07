import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface EditorData {
    title: string;
    markdown: string;
    tags: string[];
}

interface UploadProgress {
    fileName: string;
    progress: number;
}

const EditorLayout: React.FC = () => {
    const [editorData, setEditorData] = useState<EditorData>({
        title: '',
        markdown: '',
        tags: []
    });
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 자동 저장 (로컬 스토리지)
    useEffect(() => {
        const savedData = localStorage.getItem('markdown-draft');
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                // tags가 없는 이전 데이터와 호환성 유지
                setEditorData({
                    title: parsed.title || '',
                    markdown: parsed.markdown || '',
                    tags: parsed.tags || []
                });
            } catch (e) {
                console.error('Failed to load draft:', e);
            }
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('markdown-draft', JSON.stringify(editorData));
        }, 1000);

        return () => clearTimeout(timer);
    }, [editorData]);

    const handleSave = async () => {
        setIsSaving(true);
        // TODO: API 호출로 서버에 저장
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Saved:', editorData);
        alert('저장되었습니다!');
        setIsSaving(false);
    };

    const handleClear = () => {
        if (confirm('작성 중인 내용을 모두 지우시겠습니까?')) {
            setEditorData({ title: '', markdown: '', tags: [] });
            localStorage.removeItem('markdown-draft');
        }
    };

    // 태그 추가
    const handleAddTag = () => {
        const trimmedTag = tagInput.trim();
        if (trimmedTag && !editorData.tags.includes(trimmedTag)) {
            setEditorData({
                ...editorData,
                tags: [...editorData.tags, trimmedTag]
            });
            setTagInput('');
        }
    };

    // 태그 제거
    const handleRemoveTag = (tagToRemove: string) => {
        setEditorData({
            ...editorData,
            tags: editorData.tags.filter(tag => tag !== tagToRemove)
        });
    };

    // Enter 키로 태그 추가
    const handleTagKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    };

    // 이미지 업로드 함수
    const uploadImage = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);  // 서버 API의 파라미터명과 일치

        try {
            setUploadProgress({ fileName: file.name, progress: 0 });

            // 실제 API 호출
            const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

            const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
                method: 'POST',
                body: formData,
                // JWT 토큰이 있는 경우 포함 (선택사항)
                // headers: {
                //     'Authorization': `Bearer ${localStorage.getItem('token')}`
                // }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
            }

            const data = await response.json();

            // 진행률 100% 표시
            setUploadProgress({ fileName: file.name, progress: 100 });

            // 잠시 후 진행률 제거
            setTimeout(() => setUploadProgress(null), 500);

            // 서버 응답: { success: true, url: "http://...", filename: "..." }
            return data.url;

        } catch (error) {
            console.error('Image upload failed:', error);
            setUploadProgress(null);

            const errorMessage = error instanceof Error
                ? error.message
                : '이미지 업로드에 실패했습니다.';

            alert(errorMessage);
            throw error;
        }
    };

    // 이미지를 마크다운에 삽입
    const insertImageToMarkdown = (imageUrl: string, altText: string = '이미지') => {
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const imageMarkdown = `![${altText}](${imageUrl})\n`;

        const newMarkdown =
            editorData.markdown.substring(0, start) +
            imageMarkdown +
            editorData.markdown.substring(start);

        setEditorData({ ...editorData, markdown: newMarkdown });

        // 커서 위치 조정
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + imageMarkdown.length;
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    // 파일 선택 핸들러
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // 이미지 파일 체크
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        // 파일 크기 체크 (예: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('파일 크기는 5MB를 초과할 수 없습니다.');
            return;
        }

        try {
            const imageUrl = await uploadImage(file);
            insertImageToMarkdown(imageUrl, file.name);
        } catch (error) {
            console.error('Failed to handle file:', error);
        }

        // input 초기화
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // 드래그 앤 드롭 핸들러
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        if (imageFiles.length === 0) {
            alert('이미지 파일만 업로드할 수 있습니다.');
            return;
        }

        for (const file of imageFiles) {
            if (file.size > 5 * 1024 * 1024) {
                alert(`${file.name}의 크기가 5MB를 초과합니다.`);
                continue;
            }

            try {
                const imageUrl = await uploadImage(file);
                insertImageToMarkdown(imageUrl, file.name);
            } catch (error) {
                console.error('Failed to upload image:', error);
            }
        }
    };

    // 클립보드 붙여넣기 핸들러
    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(item => item.type.startsWith('image/'));

        if (imageItems.length === 0) return;

        e.preventDefault();

        for (const item of imageItems) {
            const file = item.getAsFile();
            if (!file) continue;

            try {
                const imageUrl = await uploadImage(file);
                insertImageToMarkdown(imageUrl, `pasted-image-${Date.now()}`);
            } catch (error) {
                console.error('Failed to paste image:', error);
            }
        }
    };

    const insertMarkdown = (syntax: string, placeholder: string = '') => {
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = editorData.markdown.substring(start, end) || placeholder;

        let newText = '';
        let cursorOffset = 0;

        switch (syntax) {
            case 'bold':
                newText = `**${selectedText}**`;
                cursorOffset = 2;
                break;
            case 'italic':
                newText = `*${selectedText}*`;
                cursorOffset = 1;
                break;
            case 'code':
                newText = `\`${selectedText}\``;
                cursorOffset = 1;
                break;
            case 'link':
                newText = `[${selectedText}](url)`;
                cursorOffset = selectedText.length + 3;
                break;
            case 'image':
                newText = `![${selectedText}](image-url)`;
                cursorOffset = selectedText.length + 4;
                break;
            case 'h1':
                newText = `# ${selectedText}`;
                break;
            case 'h2':
                newText = `## ${selectedText}`;
                break;
            case 'h3':
                newText = `### ${selectedText}`;
                break;
            case 'ul':
                newText = `- ${selectedText}`;
                break;
            case 'ol':
                newText = `1. ${selectedText}`;
                break;
            case 'quote':
                newText = `> ${selectedText}`;
                break;
            case 'code-block':
                newText = `\`\`\`\n${selectedText}\n\`\`\``;
                cursorOffset = 3;
                break;
            default:
                return;
        }

        const newMarkdown =
            editorData.markdown.substring(0, start) +
            newText +
            editorData.markdown.substring(end);

        setEditorData({ ...editorData, markdown: newMarkdown });

        // 커서 위치 조정
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + cursorOffset + (selectedText ? selectedText.length : 0);
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-[1920px] mx-auto">
                {/* 헤더 */}
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        <input
                            type="text"
                            value={editorData.title}
                            onChange={(e) => setEditorData({ ...editorData, title: e.target.value })}
                            placeholder="제목을 입력하세요"
                            className="flex-1 text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <div className="flex items-center gap-2 ml-4">
                            <button
                                onClick={() => setIsPreviewMode(!isPreviewMode)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors lg:hidden"
                            >
                                {isPreviewMode ? '편집' : '미리보기'}
                            </button>
                            <button
                                onClick={handleClear}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                                초기화
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded transition-colors"
                            >
                                {isSaving ? '저장 중...' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 툴바 */}
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        <button onClick={() => insertMarkdown('h1', '제목')} className="toolbar-btn" title="제목 1">
                            <span className="font-bold text-base">H1</span>
                        </button>
                        <button onClick={() => insertMarkdown('h2', '제목')} className="toolbar-btn" title="제목 2">
                            <span className="font-bold text-base">H2</span>
                        </button>
                        <button onClick={() => insertMarkdown('h3', '제목')} className="toolbar-btn" title="제목 3">
                            <span className="font-bold text-base">H3</span>
                        </button>
                        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => insertMarkdown('bold', '굵은 텍스트')} className="toolbar-btn" title="굵게 (Ctrl+B)">
                            <span className="font-bold text-base">B</span>
                        </button>
                        <button onClick={() => insertMarkdown('italic', '기울임 텍스트')} className="toolbar-btn" title="기울임 (Ctrl+I)">
                            <span className="italic text-base">I</span>
                        </button>
                        <button onClick={() => insertMarkdown('code', '코드')} className="toolbar-btn" title="인라인 코드">
                            <span className="font-mono text-sm">&lt;/&gt;</span>
                        </button>
                        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => insertMarkdown('link', '링크 텍스트')} className="toolbar-btn" title="링크 추가">
                            🔗
                        </button>
                        <button onClick={() => insertMarkdown('image', 'alt text')} className="toolbar-btn" title="이미지 URL 입력">
                            🖼️
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="toolbar-btn"
                            title="이미지 업로드"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => insertMarkdown('ul', '항목')} className="toolbar-btn" title="목록">
                            <span className="text-lg">•</span>
                        </button>
                        <button onClick={() => insertMarkdown('ol', '항목')} className="toolbar-btn" title="번호 목록">
                            <span className="text-sm font-semibold">1.</span>
                        </button>
                        <button onClick={() => insertMarkdown('quote', '인용문')} className="toolbar-btn" title="인용문">
                            <span className="text-lg font-bold">"</span>
                        </button>
                        <button onClick={() => insertMarkdown('code-block', 'code')} className="toolbar-btn" title="코드 블록">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 업로드 진행 표시 */}
                {uploadProgress && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-blue-700 dark:text-blue-300">
                                📤 {uploadProgress.fileName} 업로드 중...
                            </span>
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                {uploadProgress.progress}%
                            </span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                                className="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress.progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* 에디터 영역 */}
                <div className="flex flex-col lg:flex-row h-[calc(100vh-180px)]">
                    {/* 편집기 */}
                    <div
                        className={`flex-1 relative ${isPreviewMode ? 'hidden lg:block' : ''}`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        {isDragging && (
                            <div className="absolute inset-0 bg-blue-500/10 border-4 border-dashed border-blue-500 dark:border-blue-400 z-10 flex items-center justify-center">
                                <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-lg">
                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                                        📷 이미지를 여기에 드롭하세요
                                    </p>
                                </div>
                            </div>
                        )}
                        <textarea
                            id="markdown-editor"
                            value={editorData.markdown}
                            onChange={(e) => setEditorData({ ...editorData, markdown: e.target.value })}
                            onPaste={handlePaste}
                            placeholder="마크다운으로 작성하세요...&#10;&#10;💡 팁:&#10;  • 이미지를 드래그 앤 드롭하거나&#10;  • Ctrl+V로 클립보드 이미지를 붙여넣거나&#10;  • 툴바의 업로드 버튼을 사용하세요"
                            className="w-full h-full p-6 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none outline-none border-r border-gray-200 dark:border-gray-700 font-mono text-sm leading-relaxed"
                            spellCheck={false}
                        />
                    </div>

                    {/* 미리보기 */}
                    <div className={`flex-1 overflow-y-auto bg-white dark:bg-gray-800 ${!isPreviewMode ? 'hidden lg:block' : ''}`}>
                        <div className="p-6 max-w-4xl mx-auto">
                            <div className="markdown-content">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                        h1: ({ children }) => (
                                            <h1 className="text-3xl font-bold mb-4 mt-8 text-gray-900 dark:text-gray-100">
                                                {children}
                                            </h1>
                                        ),
                                        h2: ({ children }) => (
                                            <h2 className="text-2xl font-bold mb-3 mt-6 text-gray-900 dark:text-gray-100">
                                                {children}
                                            </h2>
                                        ),
                                        h3: ({ children }) => (
                                            <h3 className="text-xl font-bold mb-2 mt-4 text-gray-900 dark:text-gray-100">
                                                {children}
                                            </h3>
                                        ),
                                        p: ({ children }) => (
                                            <p className="mb-4 leading-7 text-gray-800 dark:text-gray-300">
                                                {children}
                                            </p>
                                        ),
                                        a: ({ href, children }) => (
                                            <a
                                                href={href}
                                                className="text-blue-600 dark:text-blue-400 hover:underline no-underline"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {children}
                                            </a>
                                        ),
                                        strong: ({ children }) => (
                                            <strong className="font-semibold text-gray-900 dark:text-gray-100">
                                                {children}
                                            </strong>
                                        ),
                                        code: ({ className, children }) => {
                                            const isInline = !className;
                                            return isInline ? (
                                                <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">
                                                    {children}
                                                </code>
                                            ) : (
                                                <code className={className}>{children}</code>
                                            );
                                        },
                                        pre: ({ children }) => (
                                            <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto my-4">
                                                {children}
                                            </pre>
                                        ),
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-700 dark:text-gray-400 my-4">
                                                {children}
                                            </blockquote>
                                        ),
                                        ul: ({ children }) => (
                                            <ul className="list-disc pl-6 mb-4 text-gray-800 dark:text-gray-300">
                                                {children}
                                            </ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol className="list-decimal pl-6 mb-4 text-gray-800 dark:text-gray-300">
                                                {children}
                                            </ol>
                                        ),
                                        li: ({ children }) => (
                                            <li className="mb-2">{children}</li>
                                        ),
                                        table: ({ children }) => (
                                            <div className="overflow-x-auto my-4">
                                                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                                                    {children}
                                                </table>
                                            </div>
                                        ),
                                        th: ({ children }) => (
                                            <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold text-left">
                                                {children}
                                            </th>
                                        ),
                                        td: ({ children }) => (
                                            <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-800 dark:text-gray-300">
                                                {children}
                                            </td>
                                        ),
                                        hr: () => (
                                            <hr className="my-8 border-gray-300 dark:border-gray-700" />
                                        ),
                                        img: ({ src, alt }) => (
                                            <img
                                                src={src}
                                                alt={alt}
                                                className="rounded-lg shadow-lg my-4 max-w-full h-auto"
                                            />
                                        ),
                                    }}
                                >
                                    {editorData.markdown || '*여기에 미리보기가 표시됩니다*'}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                </div>
                {/* 태그 영역 */}
                <div className="flex flex-col gap-2 p-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyPress={handleTagKeyPress}
                            placeholder="태그를 입력하고 Enter를 누르세요"
                            className="flex-1 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <button
                            onClick={handleAddTag}
                            className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                        >
                            추가
                        </button>
                    </div>
                    {editorData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {editorData.tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full"
                                >
                                    <span>{tag}</span>
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                        title="태그 제거"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .toolbar-btn {
                    padding: 0.5rem 0.75rem;
                    font-size: 0.875rem;
                    font-weight: 500;
                    color: rgb(55, 65, 81);
                    background-color: transparent;
                    border-radius: 0.375rem;
                    transition: background-color 0.2s;
                }
                .toolbar-btn:hover {
                    background-color: rgb(243, 244, 246);
                }
                @media (prefers-color-scheme: dark) {
                    .toolbar-btn {
                        color: rgb(209, 213, 219);
                    }
                    .toolbar-btn:hover {
                        background-color: rgb(55, 65, 81);
                    }
                }
            `}</style>
        </div>
    );
};

export default EditorLayout;
