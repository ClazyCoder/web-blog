import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface ContentCardProps {
    id?: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc?: string;
    tags?: string[];
}

const ContentCard: React.FC<ContentCardProps> = ({
    id,
    title,
    text,
    last_updated,
    imgSrc,
    tags = []
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
        <div className="relative rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300 cursor-pointer group">
            {hasValidImage ? (
                <img
                    src={imgSrc}
                    alt={title}
                    className="w-full h-[200px] object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={() => setImgError(true)}
                />
            ) : (
                <div className="w-full h-[200px] bg-linear-to-br from-emerald-500 to-teal-600 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                    <svg className="w-12 h-12 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                    </svg>
                </div>
            )}

            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors duration-300 p-4 flex flex-col justify-between">
                <div>
                    <h3 className="font-bold text-white text-xl mb-2">
                        {title}
                    </h3>
                    <p className="text-white text-sm mb-2">
                        {text}
                    </p>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="inline-block px-2 py-0.5 text-xs font-medium bg-emerald-500/80 hover:bg-emerald-500 text-white rounded transition-colors"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <p className="text-white/90 text-xs">
                        Last Updated: {last_updated}
                    </p>
                    <button
                        onClick={handleReadClick}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded transition-colors"
                    >
                        Read
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContentCard;