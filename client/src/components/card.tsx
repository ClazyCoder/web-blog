import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface ContentCardProps {
    id?: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc?: string;
    tags?: string[];
    index?: number;
}

const ContentCard: React.FC<ContentCardProps> = ({
    id,
    title,
    text,
    last_updated,
    imgSrc,
    tags = [],
    index = 0,
}) => {
    const navigate = useNavigate();
    const [imgError, setImgError] = useState(false);

    const handleReadClick = () => {
        if (id) {
            navigate(`/board/${id}`);
        }
    };

    // XSS 방지: 안전한 이미지 URL만 허용
    const isSafeImageUrl = imgSrc &&
        (imgSrc.startsWith('http://') ||
         imgSrc.startsWith('https://') ||
         imgSrc.startsWith('/'));

    const hasValidImage = isSafeImageUrl && !imgError;

    return (
        <div
            onClick={handleReadClick}
            className="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700/50 shadow-sm cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-emerald-200 dark:hover:border-emerald-800 hover:-translate-y-1 animate-fade-in-up"
            style={{ animationDelay: `${index * 80}ms` }}
        >
            {/* 썸네일 */}
            <div className="relative overflow-hidden">
                {hasValidImage ? (
                    <img
                        src={imgSrc}
                        alt={title}
                        loading="lazy"
                        className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-emerald-400 to-teal-500 dark:from-emerald-600 dark:to-teal-700 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
                        <svg className="w-12 h-12 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* 본문 */}
            <div className="p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white text-[15px] line-clamp-2 mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {title}
                </h3>

                {text && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
                        {text}
                    </p>
                )}

                {/* 태그 */}
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {tags.map((tag) => (
                            <span
                                key={tag}
                                className="text-xs px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* 날짜 */}
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {last_updated}
                </div>
            </div>
        </div>
    );
};

export default ContentCard;
