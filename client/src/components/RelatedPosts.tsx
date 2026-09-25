import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

interface RelatedPost {
    id: number;
    title: string;
    excerpt: string | null;
}

interface RelatedResponse {
    items: RelatedPost[];
    match: 'topic' | 'recent';
}

export default function RelatedPosts({ postId }: { postId: number }) {
    const [result, setResult] = useState<RelatedResponse | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        api.get<RelatedResponse>(`/api/posts/${postId}/related`, {
            signal: controller.signal,
            _skipAuthRedirect: true,
        }).then(response => {
            if (!controller.signal.aborted) setResult(response.data);
        }).catch(() => { /* Optional recommendations must not interrupt reading. */ });
        return () => controller.abort();
    }, [postId]);

    if (!result?.items.length) return null;

    return (
        <section className="mb-8" aria-labelledby="related-posts-title">
            <h2 id="related-posts-title" className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
                {result.match === 'topic' ? '함께 읽으면 좋은 글' : '최근 글 더 읽기'}
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
                {result.items.map(post => (
                    <Link key={post.id} to={`/board/${post.id}`} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-gray-700 dark:bg-gray-800">
                        <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100 [word-break:keep-all] wrap-anywhere">{post.title}</h3>
                        {post.excerpt && <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-300 wrap-anywhere">{post.excerpt}</p>}
                        <span className="mt-3 block text-sm font-medium text-emerald-700 dark:text-emerald-300">이어서 읽기 <span aria-hidden="true">→</span></span>
                    </Link>
                ))}
            </div>
        </section>
    );
}
