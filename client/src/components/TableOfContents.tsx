import React from 'react';
import type { TocItem } from '../utils/tocParser';

interface TableOfContentsProps {
    headings: TocItem[];
    activeId: string;
    onItemClick?: (id: string) => void;
}

const levelIndent: Record<number, string> = {
    1: 'pl-0',
    2: 'pl-3',
    3: 'pl-6',
};

const TableOfContents: React.FC<TableOfContentsProps> = ({
    headings,
    activeId,
    onItemClick,
}) => {
    const itemRefs = React.useRef<Map<string, HTMLAnchorElement | null>>(new Map());

    React.useEffect(() => {
        if (!activeId) return;
        const activeElement = itemRefs.current.get(activeId);
        activeElement?.scrollIntoView({ block: 'nearest' });
    }, [activeId]);

    const handleClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        onItemClick?.(id); // 스크롤 및 URL 업데이트는 부모(handleTocItemClick)에서 처리
    };

    if (headings.length === 0) return null;

    return (
        <nav aria-label="목차">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-3">
                목차
            </h2>
            <ul className="space-y-1">
                {headings.map((heading) => {
                    const isActive = activeId === heading.id;
                    return (
                        <li key={heading.id} className={levelIndent[heading.level] || 'pl-0'}>
                            <a
                                href={`#${heading.id}`}
                                ref={(el) => {
                                    itemRefs.current.set(heading.id, el);
                                }}
                                onClick={(e) => handleClick(e, heading.id)}
                                className={`
                                    block py-1.5 px-3 text-sm rounded-md transition-all duration-200
                                    border-l-2
                                    ${isActive
                                        ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 font-medium'
                                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }
                                `}
                                title={heading.text}
                            >
                                <span className="line-clamp-2">{heading.text}</span>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

export default TableOfContents;
