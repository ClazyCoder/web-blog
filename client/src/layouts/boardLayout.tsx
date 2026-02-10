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

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8">
                <div className="container mx-auto px-4">
                    <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-white">
                        게시글
                    </h1>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="rounded-lg overflow-hidden shadow-lg bg-gray-200 dark:bg-gray-700 animate-pulse h-[250px] sm:h-[280px]" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
                <div className="container mx-auto px-4 text-center">
                    <p className="text-red-500 dark:text-red-400 text-lg">{error}</p>
                </div>
            </div>
        );
    }

    // 날짜 포맷 헬퍼
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

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8">
            <div className="container mx-auto px-4">
                <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900 dark:text-white">
                    게시글
                </h1>
                {posts.length === 0 ? (
                    <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                        <p className="text-lg">아직 게시글이 없습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {posts.map((post) => (
                            <ContentCard
                                key={post.id}
                                id={String(post.id)}
                                title={post.title}
                                text={post.excerpt || ''}
                                last_updated={formatDate(post.created_at)}
                                imgSrc={post.thumbnail || '/placeholder.png'}
                                tags={post.tags}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoardLayout;
