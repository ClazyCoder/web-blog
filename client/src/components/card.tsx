import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface ContentCardProps {
    id?: string;
    title: string;
    text: string;
    last_updated: string;
    imgSrc: string;
}

const ContentCard: React.FC<ContentCardProps> = ({
    id,
    title,
    text,
    last_updated,
    imgSrc
}) => {
    const navigate = useNavigate();

    const handleReadClick = () => {
        if (id) {
            navigate(`/board/${id}`);
        }
    };

    return (
        <div className="relative rounded-lg overflow-hidden shadow-lg">
            <img
                src={imgSrc}
                alt={title}
                className="w-full h-[200px] object-cover"
            />

            <div className="absolute inset-0 bg-black/40 p-4 flex flex-col justify-between">
                <div>
                    <h3 className="font-bold text-white text-xl mb-2">
                        {title}
                    </h3>
                    <p className="text-white text-sm mb-2">
                        {text}
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-white/90 text-xs">
                        Last Updated: {last_updated}
                    </p>
                    <button
                        onClick={handleReadClick}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                    >
                        Read
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContentCard;