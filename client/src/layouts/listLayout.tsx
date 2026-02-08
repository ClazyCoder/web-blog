import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Post {
    id: string;
    title: string;
    author: string;
    content: string;
    created_at: string;
    views: number;
    tags: string[];
}

const ListLayout: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [posts, setPosts] = useState<Post[]>(getMockPosts());
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState<string>('all');

    // Mock 데이터
    function getMockPosts(): Post[] {
        return [
            {
                id: '1',
                title: 'React 19의 새로운 기능 살펴보기',
                author: '개발자',
                content: 'React 19에서 추가된 새로운 기능들을 알아봅니다...',
                created_at: '2024-02-08',
                views: 245,
                tags: ['React', 'Frontend']
            },
            {
                id: '2',
                title: 'TypeScript 5.0 업데이트 내용',
                author: '개발자',
                content: 'TypeScript 5.0의 주요 변경사항을 정리했습니다...',
                created_at: '2024-02-07',
                views: 189,
                tags: ['TypeScript', 'JavaScript']
            },
            {
                id: '3',
                title: 'FastAPI로 REST API 구축하기',
                author: '백엔드 개발자',
                content: 'Python FastAPI를 사용한 백엔드 개발 가이드...',
                created_at: '2024-02-06',
                views: 312,
                tags: ['Python', 'Backend', 'FastAPI']
            },
            {
                id: '4',
                title: 'Tailwind CSS 실전 활용법',
                author: 'UI 개발자',
                content: 'Tailwind CSS를 활용한 효율적인 스타일링 방법...',
                created_at: '2024-02-05',
                views: 428,
                tags: ['CSS', 'Tailwind', 'Frontend']
            },
            {
                id: '5',
                title: 'JWT 인증 구현 완벽 가이드',
                author: '보안 전문가',
                content: 'JWT를 사용한 안전한 인증 시스템 구축 방법...',
                created_at: '2024-02-04',
                views: 567,
                tags: ['Security', 'Authentication', 'Backend']
            },
        ];
    }

    // 모든 태그 추출
    const allTags = Array.from(
        new Set(posts.flatMap(post => post.tags))
    );

    // 필터링된 포스트
    const filteredPosts = posts.filter(post => {
        const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            post.content.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTag = selectedTag === 'all' || post.tags.includes(selectedTag);
        return matchesSearch && matchesTag;
    });

    const handlePostClick = (postId: string) => {
        navigate(`/board/${postId}`);
    };

    const handleWriteClick = () => {
        navigate('/editor');
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* 헤더 */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            📝 게시판
                        </h1>
                        {isAuthenticated && (
                            <button
                                onClick={handleWriteClick}
                                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                글쓰기
                            </button>
                        )}
                    </div>

                    {/* 검색 및 필터 */}
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* 검색 */}
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="검색어를 입력하세요..."
                                className="w-full px-4 py-2.5 pl-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
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

                        {/* 태그 필터 */}
                        <select
                            value={selectedTag}
                            onChange={(e) => setSelectedTag(e.target.value)}
                            className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                        >
                            <option value="all">모든 태그</option>
                            {allTags.map(tag => (
                                <option key={tag} value={tag}>{tag}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* 게시글 목록 */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    {/* 테이블 헤더 (데스크톱) */}
                    <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-300 text-sm">
                        <div className="col-span-6">제목</div>
                        <div className="col-span-2">작성자</div>
                        <div className="col-span-2">작성일</div>
                        <div className="col-span-2 text-center">조회수</div>
                    </div>

                    {/* 게시글 리스트 */}
                    {filteredPosts.length === 0 ? (
                        <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-lg font-medium">검색 결과가 없습니다</p>
                            <p className="text-sm mt-1">다른 검색어나 태그를 시도해보세요</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredPosts.map((post) => (
                                <div
                                    key={post.id}
                                    onClick={() => handlePostClick(post.id)}
                                    className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition-colors"
                                >
                                    {/* 데스크톱 레이아웃 */}
                                    <div className="hidden md:grid md:grid-cols-12 gap-4 items-center">
                                        <div className="col-span-6">
                                            <h3 className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1">
                                                {post.title}
                                            </h3>
                                            <div className="flex gap-2 mt-1">
                                                {post.tags.map(tag => (
                                                    <span
                                                        key={tag}
                                                        className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="col-span-2 text-gray-600 dark:text-gray-400 text-sm">
                                            {post.author}
                                        </div>
                                        <div className="col-span-2 text-gray-600 dark:text-gray-400 text-sm">
                                            {post.created_at}
                                        </div>
                                        <div className="col-span-2 text-center text-gray-600 dark:text-gray-400 text-sm">
                                            👁️ {post.views}
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
                                                    className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                                            <span>{post.author}</span>
                                            <span>{post.created_at}</span>
                                            <span>👁️ {post.views}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 하단 정보 */}
                <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    총 {filteredPosts.length}개의 게시글
                </div>
            </div>
        </div>
    );
};

export default ListLayout;
