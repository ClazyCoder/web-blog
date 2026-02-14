import React, { useEffect, useState } from 'react';
import { ContentCard } from "../components";
import api from '../utils/api';

interface PostItem {
    id: number;
    title: string;
    slug: string;
    excerpt: string | null;
    tags: string[];
    category_slug: string | null;
    status: string;
    is_published: boolean;
    view_count: number;
    thumbnail: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
}

const BoardLayout: React.FC = () => {
    const [posts, setPosts] = useState<PostItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const fetchPosts = async () => {
            try {
                setLoading(true);
                const response = await api.get('/api/posts', {
                    params: { limit: 6, status: 'published' },
                    signal: controller.signal,
                });
                setPosts(response.data.items);
            } catch (err: any) {
                if (err?.name !== 'CanceledError') {
                    console.error('게시글 로드 실패:', err);
                    setError('게시글을 불러오는데 실패했습니다.');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchPosts();
        return () => controller.abort();
    }, []);

    // 상대 시간 포맷
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHour = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return '방금 전';
        if (diffMin < 60) return `${diffMin}분 전`;
        if (diffHour < 24) return `${diffHour}시간 전`;
        if (diffDay < 7) return `${diffDay}일 전`;
        return date.toLocaleDateString('ko-KR');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="mb-8 animate-fade-in-up">
                        <div className="h-9 skeleton-shimmer rounded-lg w-48 mb-2" />
                        <div className="h-4 skeleton-shimmer rounded w-32" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700/50 shadow-sm"
                            >
                                <div className="h-48 skeleton-shimmer" />
                                <div className="p-5 space-y-3">
                                    <div className="h-5 skeleton-shimmer rounded-lg w-3/4" />
                                    <div className="h-4 skeleton-shimmer rounded w-full" />
                                    <div className="h-4 skeleton-shimmer rounded w-2/3" />
                                    <div className="flex gap-2 pt-1">
                                        <div className="h-5 skeleton-shimmer rounded-full w-14" />
                                        <div className="h-5 skeleton-shimmer rounded-full w-18" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center animate-fade-in">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/30 mb-4">
                        <svg className="w-8 h-8 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                        </svg>
                    </div>
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8">
            <div className="max-w-6xl mx-auto px-4">
                {/* 헤더 */}
                <div className="mb-8 animate-fade-in-up">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        게시글
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        최근 작성된 글
                    </p>
                </div>

                {posts.length === 0 ? (
                    <div className="py-16 text-center animate-fade-in">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                        </div>
                        <p className="text-lg font-medium text-gray-700 dark:text-gray-300">아직 게시글이 없습니다</p>
                        <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">첫 번째 글을 작성해보세요</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {posts.map((post, index) => (
                            <ContentCard
                                key={post.id}
                                id={String(post.id)}
                                title={post.title}
                                text={post.excerpt || ''}
                                last_updated={formatDate(post.created_at)}
                                imgSrc={post.thumbnail || '/placeholder.png'}
                                tags={post.tags}
                                index={index}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoardLayout;
