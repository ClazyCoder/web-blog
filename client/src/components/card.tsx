import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PostTags from './PostTags';

export interface ContentCardProps {
    id: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc?: string;
    tags?: string[];
    index?: number;
    isSecret?: boolean;
}

const ContentCard: React.FC<ContentCardProps> = ({
    id,
    title,
    text,
    last_updated,
    imgSrc,
    tags = [],
    index = 0,
    isSecret = false,
}) => {
    const [imgError, setImgError] = useState(false);

    // XSS 방지: 안전한 이미지 URL만 허용
    const isSafeImageUrl = imgSrc &&
        (imgSrc.startsWith('http://') ||
         imgSrc.startsWith('https://') ||
         imgSrc.startsWith('/'));

    const hasValidImage = isSafeImageUrl && !imgError;

    return (
        <article
            className="group relative flex flex-col bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700/50 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800 hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: `${index * 80}ms` }}
        >
            {/* 썸네일 */}
            {hasValidImage ? (
                <div className="overflow-hidden">
                    <img
                        src={imgSrc}
                        alt={title}
                        loading="lazy"
                        className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImgError(true)}
                    />
                </div>
            ) : (
                <div className="h-1 bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            )}

            {/* 본문 */}
            <div className="flex flex-1 flex-col p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg leading-7 line-clamp-3 mb-2 [word-break:keep-all] wrap-anywhere group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    <Link to={`/board/${id}`} className="post-card-link">
                        {title}
                    </Link>
                </h3>

                {text && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
                        {text}
                    </p>
                )}

                {/* 태그 */}
                <div className="mb-3 space-y-2">
                    {isSecret && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">비밀글</span>}
                    <PostTags tags={tags} />
                </div>

                {/* 날짜 */}
                <div className="mt-auto pt-2 flex items-center gap-1.5 text-[13px] text-gray-600 dark:text-gray-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {last_updated}
                </div>
            </div>
        </article>
    );
};

export default ContentCard;
