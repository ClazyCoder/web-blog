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
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* 헤더 */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            모든 게시글
                        </h1>
                        {isAuthenticated && (
                            <button
                                onClick={handleWriteClick}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors shadow-md"
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
                            className="w-full px-4 py-2.5 pl-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-white"
                        />
                        <svg
                            className="absolute left-3 top-3 w-5 h-5 text-gray-400"
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
                                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${isSelected
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                            }`}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 게시글 목록 */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    {/* 테이블 헤더 (데스크톱) */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-300 text-sm">
                        <div className="col-span-7">제목</div>
                        <div className="col-span-3">작성일</div>
                        <div className="col-span-2 text-center">조회수</div>
                    </div>

                    {/* 게시글 리스트 */}
                    {loading ? (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="px-6 py-4 animate-pulse">
                                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                                </div>
                            ))}
                        </div>
                    ) : posts.length === 0 ? (
                        <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-lg font-medium">검색 결과가 없습니다</p>
                            <p className="text-sm mt-1">다른 검색어나 태그를 시도해보세요</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {posts.map((post) => (
                                <div
                                    key={post.id}
                                    onClick={() => handlePostClick(post.id)}
                                    className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
                                >
                                    {/* 데스크톱 레이아웃 */}
                                    <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                                        <div className="col-span-7">
                                            <h3 className="font-medium text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 line-clamp-1">
                                                {post.title}
                                            </h3>
                                            <div className="flex gap-2 mt-1">
                                                {post.tags.map(tag => (
                                                    <span
                                                        key={tag}
                                                        className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="col-span-3 text-gray-600 dark:text-gray-400 text-sm">
                                            {formatDate(post.created_at)}
                                        </div>
                                        <div className="col-span-2 text-center text-gray-600 dark:text-gray-400 text-sm">
                                            {post.view_count}
                                        </div>
                                    </div>

                                    {/* 모바일 레이아웃 */}
                                    <div className="md:hidden">
                                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                                            {post.title}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {post.tags.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                                            <span>{formatDate(post.created_at)}</span>
                                            <span>조회 {post.view_count}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 페이지네이션 */}
                {!loading && totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-center gap-1">
                        {/* 이전 버튼 */}
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            이전
                        </button>

                        {/* 페이지 번호 */}
                        {getPageNumbers().map((page, idx) =>
                            page === '...' ? (
                                <span key={`ellipsis-${idx}`} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    ...
                                </span>
                            ) : (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${currentPage === page
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
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
                            className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            다음
                        </button>
                    </div>
                )}

                {/* 하단 정보 */}
                <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    총 {totalPosts}개의 게시글
                    {totalPages > 1 && ` (${currentPage} / ${totalPages} 페이지)`}
                </div>
            </div>
        </div>
    );
};

export default ListLayout;
