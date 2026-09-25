import { useState } from 'react';
import { Link } from 'react-router-dom';

interface PostTagsProps {
    tags: string[];
    onSelect?: (tag: string) => void;
}

export default function PostTags({ tags, onSelect }: PostTagsProps) {
    const [expanded, setExpanded] = useState(false);
    const uniqueTags = [...new Set(tags)];
    const visibleTags = expanded ? uniqueTags : uniqueTags.slice(0, 3);

    if (!uniqueTags.length) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map(tag => (
                <Link
                    key={tag}
                    to={`/board?tags=${encodeURIComponent(tag)}`}
                    onClick={event => {
                        if (onSelect && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
                            event.preventDefault();
                            onSelect(tag);
                        }
                    }}
                    className="relative z-10 max-w-full rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/70 wrap-anywhere"
                    aria-label={`${tag} 태그 글 보기`}
                >
                    {tag}
                </Link>
            ))}
            {uniqueTags.length > 3 && (
                <button
                    type="button"
                    onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    aria-label={expanded ? '태그 접기' : `태그 ${uniqueTags.length - 3}개 더 보기`}
                    className="relative z-10 rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                    {expanded ? '접기' : `+${uniqueTags.length - 3}`}
                </button>
            )}
        </div>
    );
}
