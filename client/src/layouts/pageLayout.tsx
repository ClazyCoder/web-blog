import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

interface PostData {
    id: number;
    title: string;
    content: string;
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

const PageLayout: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [pageData, setPageData] = useState<PostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const viewCounted = useRef(false);

    useEffect(() => {
        const controller = new AbortController();

        const fetchPost = async () => {
            if (!id) {
                setError('잘못된 접근입니다.');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const response = await api.get(`/api/posts/${id}`, {
                    signal: controller.signal,
                });
                setPageData(response.data);

                // 조회수 증가 (한 번만 호출)
                if (!viewCounted.current) {
                    viewCounted.current = true;
                    api.post(`/api/posts/${id}/view`).catch(() => {});
                }
            } catch (err: any) {
                if (controller.signal.aborted) return;
                if (err.response?.status === 404) {
                    setError('게시글을 찾을 수 없습니다.');
                } else {
                    setError('게시글을 불러오는데 실패했습니다.');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchPost();

        return () => controller.abort();
    }, [id]);

    const handleEdit = () => {
        if (pageData) {
            navigate(`/editor/${pageData.id}`);
        }
    };

    const handleDelete = async () => {
        if (!pageData) return;

        if (!confirm('정말로 이 게시글을 삭제하시겠습니까?')) return;

        try {
            setIsDeleting(true);
            await api.delete(`/api/posts/${pageData.id}`);
            navigate('/board');
        } catch (err) {
            console.error('삭제 실패:', err);
            alert('게시글 삭제에 실패했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
                </div>
            </div>
        );
    }

    if (error || !pageData) {
        return (
            <div className="flex flex-col justify-center items-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="text-xl text-gray-700 dark:text-gray-300 mb-4">{error || '페이지를 찾을 수 없습니다.'}</div>
                <button
                    onClick={() => navigate('/board')}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                    게시판으로 돌아가기
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            <article className="max-w-4xl mx-auto px-4 py-8">
                {/* 헤더 섹션 */}
                <header className="mb-8">
                    <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
                        {pageData.title}
                    </h1>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <span>작성일: {formatDate(pageData.created_at)}</span>
                            {pageData.updated_at !== pageData.created_at && (
                                <span>수정일: {formatDate(pageData.updated_at)}</span>
                            )}
                            <span>조회 {pageData.view_count}</span>
                        </div>

                        {/* 수정/삭제 버튼 (인증된 사용자만) */}
                        {isAuthenticated && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleEdit}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    수정
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-50 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    {isDeleting ? '삭제 중...' : '삭제'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 태그 */}
                    {pageData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {pageData.tags.map(tag => (
                                <span
                                    key={tag}
                                    className="text-sm px-3 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </header>

                {/* Markdown 콘텐츠 */}
                <div className="max-w-none markdown-content">
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
                            a: ({ href, children }) => {
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
                        {pageData.content}
                    </ReactMarkdown>
                </div>

                {/* 하단 네비게이션 */}
                <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => navigate('/board')}
                        className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        게시판으로 돌아가기
                    </button>
                </div>
            </article>
        </div>
    );
};

export default PageLayout;
