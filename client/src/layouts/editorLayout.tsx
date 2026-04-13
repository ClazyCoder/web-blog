import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import 'highlight.js/styles/github-dark-dimmed.css';
import { useAuth } from '../context/AuthContext';
import { setNavigationGuard, clearNavigationGuard } from '../utils/navigationGuard';
import { UnauthorizedAccess, EditorSidebar } from '../components';
import MarkdownCodeBlock from '../components/MarkdownCodeBlock';
import api from '../utils/api';

interface EditorData {
    title: string;
    markdown: string;
    tags: string[];
    isSecret: boolean;
}

interface UploadProgress {
    fileName: string;
    progress: number;
}

interface UploadedImage {
    url: string;
    filename: string;
    uploadedAt: number;
}

const EditorLayout: React.FC = () => {
    const { id: paramId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuth();
    const [postId, setPostId] = useState<number | null>(paramId ? Number(paramId) : null);
    const [originalStatus, setOriginalStatus] = useState<string | null>(null); // 기존 글의 원래 상태
    const [editorData, setEditorData] = useState<EditorData>({
        title: '',
        markdown: '',
        tags: [],
        isSecret: false,
    });
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDraftSaving, setIsDraftSaving] = useState(false);
    const [isLoadingPost, setIsLoadingPost] = useState(!!paramId);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    const [editorWidth, setEditorWidth] = useState(50); // 에디터 너비 (%)
    const [isResizing, setIsResizing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const scrollSyncSourceRef = useRef<'editor' | 'preview' | null>(null);

    // 임시저장 글 목록 (새 글 작성 모드일 때)
    const [drafts, setDrafts] = useState<{ id: number; title: string; updated_at: string }[]>([]);
    const [showDraftBanner, setShowDraftBanner] = useState(false);

    // 변경사항 추적 (페이지 이탈 경고용)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const initialDataRef = useRef<EditorData>({ title: '', markdown: '', tags: [], isSecret: false });

    // 편집 모드: 기존 게시글 로드
    useEffect(() => {
        if (!paramId) {
            // 새 글 작성 모드: 임시저장 글이 있는지 확인
            const fetchDrafts = async () => {
                try {
                    const response = await api.get('/api/posts', {
                        params: { status: 'draft', limit: 5 }
                    });
                    if (response.data.items.length > 0) {
                        setDrafts(response.data.items.map((d: any) => ({
                            id: d.id,
                            title: d.title,
                            updated_at: d.updated_at,
                        })));
                        setShowDraftBanner(true);
                    }
                } catch {
                    // 무시 (비로그인 상태 등)
                }
            };
            fetchDrafts();
            return;
        }

        const fetchPost = async () => {
            try {
                setIsLoadingPost(true);
                const response = await api.get(`/api/posts/${paramId}`);
                const post = response.data;
                const loadedData = {
                    title: post.title,
                    markdown: post.content,
                    tags: post.tags || [],
                    isSecret: Boolean(post.is_secret),
                };
                setEditorData(loadedData);
                initialDataRef.current = loadedData;
                setHasUnsavedChanges(false);
                setPostId(post.id);
                setOriginalStatus(post.status);

                // 서버 DB에서 관리하는 이미지 목록을 사이드바에 표시
                if (post.images && post.images.length > 0) {
                    const existingImages: UploadedImage[] = post.images.map((img: any) => ({
                        url: img.file_url,
                        filename: img.original_filename || img.filename,
                        uploadedAt: new Date(img.created_at || Date.now()).getTime(),
                    }));
                    setUploadedImages(existingImages);
                }
            } catch (err) {
                console.error('게시글 로드 실패:', err);
                alert('게시글을 불러오는데 실패했습니다.');
                navigate('/board');
            } finally {
                setIsLoadingPost(false);
            }
        };

        fetchPost();
    }, [paramId, navigate]);

    // 변경사항 감지
    useEffect(() => {
        const initial = initialDataRef.current;
        const changed = editorData.title !== initial.title
            || editorData.markdown !== initial.markdown
            || JSON.stringify(editorData.tags) !== JSON.stringify(initial.tags)
            || editorData.isSecret !== initial.isSecret;
        setHasUnsavedChanges(changed);
    }, [editorData]);

    // 브라우저 탭 닫기/새로고침 시 경고
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // SPA 내 네비게이션 가드 등록 (헤더 링크 등)
    const hasUnsavedRef = useRef(false);
    useEffect(() => {
        hasUnsavedRef.current = hasUnsavedChanges;
        setNavigationGuard(() => hasUnsavedRef.current);
        return () => clearNavigationGuard();
    }, [hasUnsavedChanges]);

    // 임시저장 글 불러오기
    const handleLoadDraft = (draftId: number) => {
        setShowDraftBanner(false);
        navigate(`/editor/${draftId}`, { replace: true });
    };

    // 드래그가 완전히 끝났을 때 처리
    useEffect(() => {
        const handleDragEnd = () => {
            setIsDragging(false);
        };

        window.addEventListener('dragend', handleDragEnd);
        window.addEventListener('drop', handleDragEnd);

        return () => {
            window.removeEventListener('dragend', handleDragEnd);
            window.removeEventListener('drop', handleDragEnd);
        };
    }, []);

    // 리사이즈 핸들러
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            const container = document.getElementById('editor-container');
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

            // 최소/최대 너비 제한 (20% ~ 80%)
            if (newWidth >= 20 && newWidth <= 80) {
                setEditorWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing]);

    const syncScrollByRatio = (source: HTMLElement, target: HTMLElement) => {
        const sourceScrollable = source.scrollHeight - source.clientHeight;
        const targetScrollable = target.scrollHeight - target.clientHeight;
        if (sourceScrollable <= 0 || targetScrollable <= 0) {
            target.scrollTop = 0;
            return;
        }
        const scrollRatio = source.scrollTop / sourceScrollable;
        target.scrollTop = scrollRatio * targetScrollable;
    };

    const handleEditorScroll = () => {
        const editorEl = editorTextareaRef.current;
        const previewEl = previewContainerRef.current;
        if (!editorEl || !previewEl || !showPreview) return;
        if (scrollSyncSourceRef.current === 'preview') return;

        scrollSyncSourceRef.current = 'editor';
        syncScrollByRatio(editorEl, previewEl);
        requestAnimationFrame(() => {
            if (scrollSyncSourceRef.current === 'editor') {
                scrollSyncSourceRef.current = null;
            }
        });
    };

    const handlePreviewScroll = () => {
        const editorEl = editorTextareaRef.current;
        const previewEl = previewContainerRef.current;
        if (!editorEl || !previewEl || !showPreview) return;
        if (scrollSyncSourceRef.current === 'editor') return;

        scrollSyncSourceRef.current = 'preview';
        syncScrollByRatio(previewEl, editorEl);
        requestAnimationFrame(() => {
            if (scrollSyncSourceRef.current === 'preview') {
                scrollSyncSourceRef.current = null;
            }
        });
    };

    const syncPreviewToEditorPosition = () => {
        const editorEl = editorTextareaRef.current;
        const previewEl = previewContainerRef.current;
        if (!editorEl || !previewEl) return;
        syncScrollByRatio(editorEl, previewEl);
    };

    useEffect(() => {
        if (!showPreview) return;

        let frame1 = 0;
        let frame2 = 0;
        frame1 = requestAnimationFrame(() => {
            // 레이아웃 계산이 끝난 다음 프리뷰 스크롤을 현재 편집 위치에 맞춘다.
            frame2 = requestAnimationFrame(() => {
                syncPreviewToEditorPosition();
            });
        });

        return () => {
            cancelAnimationFrame(frame1);
            cancelAnimationFrame(frame2);
        };
    }, [showPreview]);

    useEffect(() => {
        if (!showPreview) return;

        const debounceMs = 90;
        let frame1 = 0;
        let frame2 = 0;

        // 마크다운 렌더 높이가 변한 뒤 프리뷰 위치를 부드럽게 재동기화한다.
        const timeoutId = window.setTimeout(() => {
            frame1 = requestAnimationFrame(() => {
                frame2 = requestAnimationFrame(() => {
                    syncPreviewToEditorPosition();
                });
            });
        }, debounceMs);

        return () => {
            window.clearTimeout(timeoutId);
            cancelAnimationFrame(frame1);
            cancelAnimationFrame(frame2);
        };
    }, [editorData.markdown, showPreview, editorWidth, isPreviewMode]);

    const handleToggleMobilePreviewMode = () => {
        const nextPreviewMode = !isPreviewMode;
        setIsPreviewMode(nextPreviewMode);
        if (nextPreviewMode) {
            requestAnimationFrame(() => {
                syncPreviewToEditorPosition();
            });
        }
    };

    const handleTogglePreviewVisibility = () => {
        setShowPreview((prev) => !prev);
    };

    const isEditingPublished = !!postId && originalStatus === 'published';

    // 세션 만료(401) 시 편집 내용을 보존하면서 재로그인 안내
    // (자동 토큰 갱신이 실패한 경우에만 이 함수가 호출됨)
    const handleAuthExpired = () => {
        const shouldLogin = window.confirm(
            '로그인 세션이 완전히 만료되었습니다.\n현재 작성 중인 내용은 유지됩니다.\n\n새 탭에서 로그인 페이지를 여시겠습니까?'
        );
        if (shouldLogin) {
            window.open(
                `/login?redirect=${encodeURIComponent(window.location.pathname)}`,
                '_blank'
            );
        }
    };

    const savePost = async (action: 'draft' | 'published' | 'save') => {
        // action: 'draft' = 임시저장, 'published' = 발행, 'save' = 상태 유지 저장
        const isDraft = action === 'draft';
        const isSaveOnly = action === 'save';

        // 발행 또는 상태 유지 저장 시 필수 필드 검증
        if (!isDraft) {
            if (!editorData.title.trim()) {
                alert('제목을 입력해주세요.');
                return;
            }
            if (!editorData.markdown.trim()) {
                alert('본문을 입력해주세요.');
                return;
            }
        }

        if (isDraft) setIsDraftSaving(true);
        else setIsSaving(true);

        try {
            // 상태 결정: 'save'이면 원래 상태 유지
            const targetStatus = isSaveOnly ? (originalStatus || 'published') : action;

            const payload = {
                title: editorData.title.trim() || '제목 없음',
                content: editorData.markdown || ' ',
                tags: editorData.tags,
                status: targetStatus,
                is_secret: editorData.isSecret,
            };

            let response;
            if (postId) {
                // 기존 게시글 수정 (PUT) — 401 시 하드 리다이렉트 방지
                response = await api.put(`/api/posts/${postId}`, payload, { _skipAuthRedirect: true });
            } else {
                // 새 게시글 생성 (POST) — 401 시 하드 리다이렉트 방지
                response = await api.post('/api/posts', payload, { _skipAuthRedirect: true });
                const newId = response.data.id;
                setPostId(newId);
                // URL을 편집 모드로 변경 (뒤로가기 시 새 글 생성 방지)
                setHasUnsavedChanges(false);
                navigate(`/editor/${newId}`, { replace: true });
            }

            // 저장 성공: 초기 데이터 갱신 (이탈 경고 방지)
            initialDataRef.current = { ...editorData };
            setHasUnsavedChanges(false);

            if (!isDraft && !isSaveOnly) {
                // 발행 시에만 게시글 페이지로 이동
                navigate(`/board/${response.data.id}`);
            } else if (isSaveOnly) {
                // 상태 유지 저장: 게시글 페이지로 이동
                navigate(`/board/${response.data.id}`);
            }
        } catch (err: any) {
            // 세션 만료(401): 편집 내용 보존, 재로그인 안내
            if (err.response?.status === 401) {
                handleAuthExpired();
                return;
            }
            const message = err.response?.data?.detail || '저장에 실패했습니다.';
            alert(message);
        } finally {
            setIsSaving(false);
            setIsDraftSaving(false);
        }
    };

    // 발행된 글 수정 중: "저장" = 상태 유지, "발행" = 발행
    // 새 글 / 임시 글 수정: "임시 저장" = draft, "발행" = published
    const handleSave = () => isEditingPublished ? savePost('save') : savePost('published');
    const handleDraftSave = () => savePost('draft');

    const handleClear = () => {
        if (confirm('작성 중인 내용을 모두 지우시겠습니까?')) {
            setEditorData({ title: '', markdown: '', tags: [], isSecret: false });
            setUploadedImages([]);
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

            const response = await api.post('/api/upload/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                _skipAuthRedirect: true, // 401 시 하드 리다이렉트 방지
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setUploadProgress({ fileName: file.name, progress: percent });
                    }
                },
            });

            const data = response.data;

            // 진행률 100% 표시
            setUploadProgress({ fileName: file.name, progress: 100 });

            // 잠시 후 진행률 제거
            setTimeout(() => setUploadProgress(null), 500);

            // 업로드된 이미지 리스트에 추가
            const uploadedImage: UploadedImage = {
                url: data.url,
                filename: data.filename || file.name,
                uploadedAt: Date.now()
            };
            setUploadedImages(prev => [uploadedImage, ...prev]);

            // 서버 응답: { success: true, url: "http://...", filename: "..." }
            return data.url;

        } catch (error: any) {
            console.error('Image upload failed:', error);
            setUploadProgress(null);

            // 세션 만료(401): 편집 내용 보존, 재로그인 안내
            if (error.response?.status === 401) {
                handleAuthExpired();
                throw error;
            }

            const errorMessage = error.response?.data?.detail
                || (error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.');

            alert(errorMessage);
            throw error;
        }
    };

    // 이미지를 마크다운에 삽입
    const insertImageToMarkdown = (imageUrl: string, altText: string = '이미지') => {
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const scrollTop = textarea.scrollTop; // 스크롤 위치 저장
        const imageMarkdown = `![${altText}](${imageUrl})\n`;

        // 함수형 업데이트를 사용하여 최신 상태를 참조
        setEditorData(prevData => {
            const newMarkdown =
                prevData.markdown.substring(0, start) +
                imageMarkdown +
                prevData.markdown.substring(start);

            return { ...prevData, markdown: newMarkdown };
        });

        // 커서 위치 및 스크롤 위치 복원
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + imageMarkdown.length;
            textarea.setSelectionRange(newPosition, newPosition);
            textarea.scrollTop = scrollTop;
        }, 0);
    };

    // 사이드바에서 이미지 선택 시
    const handleImageSelect = (url: string, filename: string) => {
        insertImageToMarkdown(url, filename);
        setIsSidebarOpen(false);
    };

    // 사이드바에서 이미지 삭제 시
    const handleImageDelete = (url: string) => {
        // 클라이언트에서만 리스트에서 제거 (서버에는 Orphan 상태로 유지)
        setUploadedImages(prev => prev.filter(img => img.url !== url));
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
        // relatedTarget이 컨테이너 밖으로 나갔는지 확인
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
            setIsDragging(false);
        }
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

        // 커서 위치 미리 저장
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        const cursorPosition = textarea?.selectionStart || 0;

        // 업로드할 이미지들을 순차적으로 처리
        const uploadedImageMarkdowns: string[] = [];

        for (const file of imageFiles) {
            if (file.size > 5 * 1024 * 1024) {
                alert(`${file.name}의 크기가 5MB를 초과합니다.`);
                continue;
            }

            try {
                const imageUrl = await uploadImage(file);
                uploadedImageMarkdowns.push(`![${file.name}](${imageUrl})`);
            } catch (error) {
                console.error('Failed to upload image:', error);
            }
        }

        // 모든 이미지를 한 번에 삽입
        if (uploadedImageMarkdowns.length > 0) {
            const allImagesMarkdown = uploadedImageMarkdowns.join('\n') + '\n';

            setEditorData(prevData => {
                const newMarkdown =
                    prevData.markdown.substring(0, cursorPosition) +
                    allImagesMarkdown +
                    prevData.markdown.substring(cursorPosition);

                return { ...prevData, markdown: newMarkdown };
            });

            // 커서 위치 조정
            setTimeout(() => {
                if (textarea) {
                    textarea.focus();
                    const newPosition = cursorPosition + allImagesMarkdown.length;
                    textarea.setSelectionRange(newPosition, newPosition);
                }
            }, 0);
        }
    };

    // 클립보드 붙여넣기 핸들러
    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(item => item.type.startsWith('image/'));

        if (imageItems.length === 0) return;

        e.preventDefault();

        // 커서 위치 미리 저장
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        const cursorPosition = textarea?.selectionStart || 0;

        // 업로드할 이미지들을 순차적으로 처리
        const uploadedImageMarkdowns: string[] = [];

        for (const item of imageItems) {
            const file = item.getAsFile();
            if (!file) continue;

            try {
                const imageUrl = await uploadImage(file);
                uploadedImageMarkdowns.push(`![pasted-image-${Date.now()}](${imageUrl})`);
            } catch (error) {
                console.error('Failed to paste image:', error);
            }
        }

        // 모든 이미지를 한 번에 삽입
        if (uploadedImageMarkdowns.length > 0) {
            const allImagesMarkdown = uploadedImageMarkdowns.join('\n') + '\n';

            setEditorData(prevData => {
                const newMarkdown =
                    prevData.markdown.substring(0, cursorPosition) +
                    allImagesMarkdown +
                    prevData.markdown.substring(cursorPosition);

                return { ...prevData, markdown: newMarkdown };
            });

            // 커서 위치 조정
            setTimeout(() => {
                if (textarea) {
                    textarea.focus();
                    const newPosition = cursorPosition + allImagesMarkdown.length;
                    textarea.setSelectionRange(newPosition, newPosition);
                }
            }, 0);
        }
    };

    const insertMarkdown = (syntax: string, placeholder: string = '') => {
        const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const scrollTop = textarea.scrollTop; // 스크롤 위치 저장
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
            case 'table':
                newText = `| 헤더1 | 헤더2 |\n| --- | --- |\n| 값1 | 값2 |`;
                cursorOffset = 34;
                break;
            case 'details':
                newText = `<details>\n<summary>요약</summary>\n\n${selectedText}\n</details>`;
                cursorOffset = `<details>\n<summary>요약</summary>\n\n`.length;
                break;
            default:
                return;
        }

        const newMarkdown =
            editorData.markdown.substring(0, start) +
            newText +
            editorData.markdown.substring(end);

        setEditorData({ ...editorData, markdown: newMarkdown });

        // 커서 위치 및 스크롤 위치 복원
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + cursorOffset + (selectedText ? selectedText.length : 0);
            textarea.setSelectionRange(newPosition, newPosition);
            textarea.scrollTop = scrollTop;
        }, 0);
    };

    // Tab 키 입력 핸들러
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = e.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const scrollTop = textarea.scrollTop;
            const tab = '    '; // 스페이스 4칸

            if (e.shiftKey) {
                // Shift+Tab: 현재 줄의 앞쪽 들여쓰기 제거
                const lineStart = editorData.markdown.lastIndexOf('\n', start - 1) + 1;
                const lineText = editorData.markdown.substring(lineStart, end);
                const unindented = lineText.replace(/^( {1,4}|\t)/, '');
                const removed = lineText.length - unindented.length;

                if (removed > 0) {
                    const newMarkdown =
                        editorData.markdown.substring(0, lineStart) +
                        unindented +
                        editorData.markdown.substring(end);
                    setEditorData({ ...editorData, markdown: newMarkdown });

                    setTimeout(() => {
                        textarea.focus();
                        const newStart = Math.max(start - removed, lineStart);
                        textarea.setSelectionRange(newStart, end - removed);
                        textarea.scrollTop = scrollTop;
                    }, 0);
                }
            } else {
                // Tab: 커서 위치에 들여쓰기 삽입
                const newMarkdown =
                    editorData.markdown.substring(0, start) +
                    tab +
                    editorData.markdown.substring(end);
                setEditorData({ ...editorData, markdown: newMarkdown });

                setTimeout(() => {
                    textarea.focus();
                    const newPosition = start + tab.length;
                    textarea.setSelectionRange(newPosition, newPosition);
                    textarea.scrollTop = scrollTop;
                }, 0);
            }
        }
    };

    // 게시글 로딩 중이면 로딩 표시
    if (isLoadingPost) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">게시글 불러오는 중...</p>
                </div>
            </div>
        );
    }

    // 인증 로딩 중이면 로딩 표시
    if (isLoading) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
                </div>
            </div>
        );
    }

    // 인증되지 않은 경우
    if (!isAuthenticated) {
        return (
            <UnauthorizedAccess
                redirectPath="/editor"
            />
        );
    }

    // 날짜 포맷 헬퍼
    const formatDraftDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    };

    // 인증된 사용자의 에디터 화면
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-[1920px] mx-auto">
                {/* 임시저장 배너 */}
                {showDraftBanner && drafts.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                                임시저장된 글이 {drafts.length}개 있습니다.
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                {drafts.map(draft => (
                                    <button
                                        key={draft.id}
                                        onClick={() => handleLoadDraft(draft.id)}
                                        className="px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-700 rounded-lg transition-colors"
                                    >
                                        {draft.title} ({formatDraftDate(draft.updated_at)})
                                    </button>
                                ))}
                                <button
                                    onClick={() => setShowDraftBanner(false)}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    새 글 작성
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 헤더 */}
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                        <input
                            type="text"
                            value={editorData.title}
                            onChange={(e) => setEditorData({ ...editorData, title: e.target.value })}
                            placeholder="제목을 입력하세요"
                            className="w-full sm:flex-1 text-xl sm:text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-400"
                        />
                        <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
                            {/* 모바일 전용 편집/미리보기 토글 */}
                            <button
                                onClick={handleToggleMobilePreviewMode}
                                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors lg:hidden whitespace-nowrap"
                            >
                                {isPreviewMode ? '편집' : '미리보기'}
                            </button>
                            {/* 데스크탑 전용 미리보기 토글 */}
                            <button
                                onClick={handleTogglePreviewVisibility}
                                className="hidden lg:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                title={showPreview ? '미리보기 숨기기' : '미리보기 보기'}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {showPreview ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    ) : (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    )}
                                </svg>
                                {showPreview ? '미리보기 숨기기' : '미리보기 보기'}
                            </button>
                            <button
                                onClick={handleClear}
                                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors whitespace-nowrap"
                            >
                                초기화
                            </button>
                            {isEditingPublished ? (
                                /* 발행된 글 수정 모드: "저장" 버튼만 표시 */
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || isDraftSaving}
                                    className="px-4 sm:px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded transition-colors whitespace-nowrap"
                                >
                                    {isSaving ? '저장 중...' : '저장'}
                                </button>
                            ) : (
                                /* 새 글 / 임시 글 모드: "임시 저장" + "발행" */
                                <>
                                    <button
                                        onClick={handleDraftSave}
                                        disabled={isDraftSaving || isSaving}
                                        className="px-3 sm:px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 rounded transition-colors whitespace-nowrap"
                                    >
                                        {isDraftSaving ? '저장 중...' : '임시 저장'}
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving || isDraftSaving}
                                        className="px-4 sm:px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded transition-colors whitespace-nowrap"
                                    >
                                        {isSaving ? '발행 중...' : '발행'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* 툴바 */}
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="flex items-center gap-1 overflow-x-auto" onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.toolbar-btn')) e.preventDefault(); }}>
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
                        <button onClick={() => insertMarkdown('details', '내용')} className="toolbar-btn" title="접기/펼치기 블록">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4 5-4 5" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 9h4M14 12h3M14 15h4" />
                            </svg>
                        </button>
                        <button onClick={() => insertMarkdown('code-block', 'code')} className="toolbar-btn" title="코드 블록">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                        </button>
                        <button onClick={() => insertMarkdown('table')} className="toolbar-btn" title="테이블">
                            <span className="text-sm font-semibold">⊞</span>
                        </button>
                    </div>
                </div>

                {/* 업로드 진행 표시 */}
                {uploadProgress && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-emerald-700 dark:text-emerald-300">
                                📤 {uploadProgress.fileName} 업로드 중...
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                {uploadProgress.progress}%
                            </span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                                className="bg-emerald-600 dark:bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress.progress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* 에디터 영역 */}
                <div id="editor-container" className="flex flex-col lg:flex-row h-[calc(100vh-180px)]">
                    {/* 편집기 */}
                    <div
                        className={`relative ${isPreviewMode ? 'hidden lg:block' : 'block'}`}
                        style={{ width: showPreview ? `${editorWidth}%` : '100%' }}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        {isDragging && (
                            <div className="absolute inset-0 bg-emerald-500/10 border-4 border-dashed border-emerald-500 dark:border-emerald-400 z-10 flex items-center justify-center pointer-events-none">
                                <div className="bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow-lg">
                                    <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                                        📷 이미지를 여기에 드롭하세요
                                    </p>
                                </div>
                            </div>
                        )}
                        <textarea
                            id="markdown-editor"
                            ref={editorTextareaRef}
                            value={editorData.markdown}
                            onChange={(e) => setEditorData({ ...editorData, markdown: e.target.value })}
                            onScroll={handleEditorScroll}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="마크다운으로 작성하세요...&#10;&#10;💡 팁:&#10;  • 이미지를 드래그 앤 드롭하거나&#10;  • Ctrl+V로 클립보드 이미지를 붙여넣거나&#10;  • 툴바의 업로드 버튼을 사용하세요"
                            className="w-full h-full p-6 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none outline-none font-mono text-sm leading-relaxed"
                            spellCheck={false}
                        />
                    </div>

                    {/* 드래그 가능한 경계선 (데스크탑 전용) */}
                    {showPreview && (
                        <div
                            className="hidden lg:block w-1 bg-gray-300 dark:bg-gray-600 hover:bg-emerald-500 dark:hover:bg-emerald-500 cursor-col-resize transition-colors relative group"
                            onMouseDown={() => setIsResizing(true)}
                        >
                            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-emerald-500/20"></div>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 dark:bg-gray-500 rounded-full group-hover:bg-emerald-500 transition-colors"></div>
                        </div>
                    )}

                    {/* 미리보기 */}
                    {showPreview && (
                        <div
                            ref={previewContainerRef}
                            onScroll={handlePreviewScroll}
                            className={`overflow-y-auto bg-white dark:bg-gray-800 ${isPreviewMode ? 'block' : 'hidden lg:block'}`}
                            style={{ width: `${100 - editorWidth}%` }}
                        >
                            <span className="p-2 text-sm italic font-bold mb-4 mt-8 text-gray-700 dark:text-gray-300">미리보기</span>
                            <div className="p-6 max-w-4xl mx-auto">
                                <div className="markdown-content">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath, remarkGfm]}
                                        rehypePlugins={[rehypeRaw, [rehypeSanitize, {
                                            ...defaultSchema,
                                            tagNames: [...(defaultSchema.tagNames || []), 'br', 'hr', 'sub', 'sup', 'mark', 'abbr', 'details', 'summary'],
                                            attributes: {
                                                ...defaultSchema.attributes,
                                                /* 기본 스키마는 code.className을 /^language-.$/만 허용해 language-mermaid 등이 삭제됨 → Mermaid 분기 실패 */
                                                code: [['className', /^language-/, /^hljs$/]],
                                                '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'class', 'id'],
                                            },
                                        }], rehypeKatex, [rehypeHighlight, { plainText: ['mermaid'] }]]}
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
                                            a: ({ href, children }) => {
                                                // XSS 방지: javascript:, data:, vbscript: 등 위험한 스키마 차단
                                                const isSafeUrl = href &&
                                                    !href.toLowerCase().startsWith('javascript:') &&
                                                    !href.toLowerCase().startsWith('data:') &&
                                                    !href.toLowerCase().startsWith('vbscript:');

                                                return (
                                                    <a
                                                        href={isSafeUrl ? href : '#'}
                                                        className="text-emerald-600 dark:text-emerald-400 hover:underline no-underline"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={!isSafeUrl ? (e) => e.preventDefault() : undefined}
                                                    >
                                                        {children}
                                                    </a>
                                                );
                                            },
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
                                                <MarkdownCodeBlock>{children}</MarkdownCodeBlock>
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
                                            img: ({ src, alt }) => {
                                                // XSS 방지: 안전한 이미지 URL만 허용
                                                const isSafeUrl = src &&
                                                    (src.startsWith('http://') ||
                                                        src.startsWith('https://') ||
                                                        src.startsWith('/'));

                                                return isSafeUrl ? (
                                                    <img
                                                        src={src}
                                                        alt={alt || '이미지'}
                                                        className="rounded-lg shadow-lg my-4 max-w-full h-auto"
                                                    />
                                                ) : null;
                                            },
                                        }}
                                    >
                                        {editorData.markdown || '*여기에 미리보기가 표시됩니다*'}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {/* 태그 영역 */}
                <div className="flex flex-col gap-2 p-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input
                            type="checkbox"
                            checked={editorData.isSecret}
                            onChange={(e) => setEditorData({ ...editorData, isSecret: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        비밀글로 설정
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyPress={handleTagKeyPress}
                            placeholder="태그를 입력하고 Enter를 누르세요"
                            className="flex-1 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-white placeholder-gray-400"
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
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full"
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

                {/* 플로팅 버튼 - 업로드된 이미지 보기 */}
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed bottom-8 right-8 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-30"
                    title="업로드된 이미지 보기"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {uploadedImages.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                            {uploadedImages.length}
                        </span>
                    )}
                </button>

                {/* 에디터 사이드바 */}
                <EditorSidebar
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                    uploadedImages={uploadedImages}
                    onImageSelect={handleImageSelect}
                    onImageDelete={handleImageDelete}
                />
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
                /* 모바일에서 에디터/미리보기 영역 전체 너비 강제 */
                @media (max-width: 1023px) {
                    #editor-container > div {
                        width: 100% !important;
                        flex: 1 1 auto;
                    }
                }
            `}</style>
        </div>
    );
};

export default EditorLayout;
