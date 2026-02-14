import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useDebounce from '../hooks/useDebounce';
import api from '../utils/api';

interface Post {
    id: number;
    title: string;
    slug: string;
    excerpt: string | null;
    tags: string[];
    category_slug: string | null;
    status: string;
    is_published: boolean;
    view_count: number;
    created_at: string;
    updated_at: string;
    published_at: string | null;
}

const POSTS_PER_PAGE = 10;

const ListLayout: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // URL 파라미터에서 초기 상태 복원
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [selectedTags, setSelectedTags] = useState<string[]>(() => {
        const tagsParam = searchParams.get('tags');
        return tagsParam ? tagsParam.split(',').filter(Boolean) : [];
    });
    const [currentPage, setCurrentPage] = useState(() => {
        const pageParam = searchParams.get('page');
        return pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
    });

    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [totalPosts, setTotalPosts] = useState(0);

    const debouncedSearch = useDebounce(searchTerm, 300);
    const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));

    // URL 쿼리 파라미터 동기화
    useEffect(() => {
        const params: Record<string, string> = {};
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        if (selectedTags.length > 0) params.tags = selectedTags.join(',');
        if (currentPage > 1) params.page = String(currentPage);

        setSearchParams(params, { replace: true });
    }, [debouncedSearch, selectedTags, currentPage, setSearchParams]);

    // 태그 목록 가져오기 (마운트 시 1회)
    useEffect(() => {
        const controller = new AbortController();
        api.get('/api/posts/tags', { signal: controller.signal })
            .then(res => setAllTags(res.data.tags || []))
            .catch(err => {
                if (err?.name !== 'CanceledError') {
                    console.error('태그 목록 로드 실패:', err);
                }
            });
        return () => controller.abort();
    }, []);

    // 게시글 목록 가져오기
    const fetchPosts = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoading(true);
            const params: Record<string, string | number> = {
                skip: (currentPage - 1) * POSTS_PER_PAGE,
                limit: POSTS_PER_PAGE,
                status: 'published',
            };

            if (debouncedSearch.trim()) {
                params.search = debouncedSearch.trim();
            }
            if (selectedTags.length > 0) {
                params.tags = selectedTags.join(',');
            }

            const response = await api.get('/api/posts', { params, signal });
            setPosts(response.data.items);
            setTotalPosts(response.data.total);
        } catch (err: any) {
            if (err?.name !== 'CanceledError') {
                console.error('게시글 로드 실패:', err);
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, debouncedSearch, selectedTags]);

    // 디바운스된 검색어/태그/페이지 변경 시 데이터 로드
    useEffect(() => {
        const controller = new AbortController();
        fetchPosts(controller.signal);
        return () => controller.abort();
    }, [fetchPosts]);

    // 검색어 변경 시 1페이지로 리셋
    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(1);
    };

    // 태그 칩 토글
    const handleTagToggle = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
        setCurrentPage(1);
    };

    // 선택된 태그 전체 초기화
    const handleClearTags = () => {
        setSelectedTags([]);
        setCurrentPage(1);
    };

    const handlePostClick = (postId: number) => {
        navigate(`/board/${postId}`);
    };

    const handleWriteClick = () => {
        navigate('/editor');
    };

    // 날짜 포맷
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    };

    // 페이지네이션 번호 생성
    const getPageNumbers = (): (number | '...')[] => {
        const pages: (number | '...')[] = [];
        const maxVisible = 5;

        if (totalPages <= maxVisible + 2) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) pages.push(i);

            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-5xl mx-auto px-4 py-8">
                {/* 헤더 */}
                <div className="mb-8 animate-fade-in-up">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                모든 게시글
                            </h1>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                총 {totalPosts}개의 게시글
                            </p>
                        </div>
                        {isAuthenticated && (
                            <button
                                onClick={handleWriteClick}
                                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                글쓰기
                            </button>
                        )}
                    </div>

                    {/* 검색 */}
                    <div className="relative mb-4">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="검색어를 입력하세요..."
                            className="w-full px-4 py-3 pl-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-gray-900 dark:text-white shadow-sm transition-shadow duration-200 focus:shadow-md"
                        />
                        <svg
                            className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* 태그 칩 필터 */}
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedTags.length > 0 && (
                                <button
                                    onClick={handleClearTags}
                                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    초기화
                                </button>
                            )}
                            {allTags.map(tag => {
                                const isSelected = selectedTags.includes(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => handleTagToggle(tag)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${isSelected
                                            ? 'bg-emerald-600 text-white shadow-sm scale-105'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 게시글 목록 — 카드 스타일 */}
                <div className="space-y-3">
                    {loading ? (
                        // 스켈레톤 로딩
                        [...Array(5)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/50">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-2.5">
                                        <div className="h-5 skeleton-shimmer rounded-lg w-3/4" />
                                        <div className="flex gap-2">
                                            <div className="h-5 skeleton-shimmer rounded-full w-14" />
                                            <div className="h-5 skeleton-shimmer rounded-full w-18" />
                                        </div>
                                    </div>
                                    <div className="h-4 skeleton-shimmer rounded w-20 shrink-0" />
                                </div>
                            </div>
                        ))
                    ) : posts.length === 0 ? (
                        <div className="py-16 text-center animate-fade-in">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                                <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">검색 결과가 없습니다</p>
                            <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">다른 검색어나 태그를 시도해보세요</p>
                        </div>
                    ) : (
                        posts.map((post, index) => (
                            <div
                                key={post.id}
                                onClick={() => handlePostClick(post.id)}
                                className="group bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/50 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 hover:-translate-y-0.5 animate-fade-in-up"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1 text-[15px]">
                                            {post.title}
                                        </h3>

                                        {/* 태그 */}
                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                            {post.tags.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="text-xs px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full font-medium"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 날짜 + 조회수 */}
                                    <div className="flex flex-col items-end gap-1 shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                        <span>{formatDate(post.created_at)}</span>
                                        <span className="flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            {post.view_count}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* 페이지네이션 */}
                {!loading && totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-1.5 animate-fade-in">
                        {/* 이전 버튼 */}
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            이전
                        </button>

                        {/* 페이지 번호 */}
                        {getPageNumbers().map((page, idx) =>
                            page === '...' ? (
                                <span key={`ellipsis-${idx}`} className="px-2 py-2 text-sm text-gray-400 dark:text-gray-500">
                                    ···
                                </span>
                            ) : (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`w-9 h-9 text-sm font-medium rounded-lg transition-all duration-200 ${currentPage === page
                                        ? 'bg-emerald-600 text-white shadow-md scale-105'
                                        : 'text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {page}
                                </button>
                            )
                        )}

                        {/* 다음 버튼 */}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            다음
                        </button>
                    </div>
                )}

                {/* 하단 정보 */}
                {!loading && totalPages > 1 && (
                    <div className="mt-3 text-center text-sm text-gray-400 dark:text-gray-500">
                        {currentPage} / {totalPages} 페이지
                    </div>
                )}
            </div>
        </div>
    );
};

export default ListLayout;
