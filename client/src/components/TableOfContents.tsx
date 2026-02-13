import React from 'react';
import type { TocItem } from '../utils/tocParser';

interface TableOfContentsProps {
    headings: TocItem[];
    activeId: string;
    onItemClick?: (id: string) => void;
}

interface TocNode {
    item: TocItem;
    children: TocNode[];
    parentId: string | null;
}

function buildTocTree(headings: TocItem[]): TocNode[] {
    const root: TocNode[] = [];
    const stack: TocNode[] = [];

    headings.forEach((heading) => {
        const node: TocNode = {
            item: heading,
            children: [],
            parentId: null,
        };

        while (stack.length > 0 && stack[stack.length - 1].item.level >= heading.level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];
        if (!parent) {
            root.push(node);
        } else {
            node.parentId = parent.item.id;
            parent.children.push(node);
        }

        stack.push(node);
    });

    return root;
}

function buildParentMap(nodes: TocNode[]): Map<string, string | null> {
    const parentMap = new Map<string, string | null>();
    const stack = [...nodes];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        parentMap.set(current.item.id, current.parentId);
        current.children.forEach((child) => stack.push(child));
    }

    return parentMap;
}

const TableOfContents: React.FC<TableOfContentsProps> = ({ headings, activeId, onItemClick }) => {
    const itemRefs = React.useRef<Map<string, HTMLAnchorElement | null>>(new Map());
    const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
    const [showDeepHeadings, setShowDeepHeadings] = React.useState(false);

    const tocTree = React.useMemo(() => buildTocTree(headings), [headings]);
    const parentMap = React.useMemo(() => buildParentMap(tocTree), [tocTree]);

    const activePath = React.useMemo(() => {
        const path = new Set<string>();
        if (!activeId) return path;

        let current: string | null = activeId;
        while (current) {
            path.add(current);
            current = parentMap.get(current) ?? null;
        }
        return path;
    }, [activeId, parentMap]);

    React.useEffect(() => {
        itemRefs.current.clear();
        setExpandedIds(new Set());
    }, [headings]);

    React.useEffect(() => {
        if (!activeId) return;
        const activeElement = itemRefs.current.get(activeId);
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        activeElement?.scrollIntoView({
            block: 'nearest',
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
    }, [activeId]);

    const scrollToTop = () => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    };

    const jumpToCurrentSection = () => {
        if (!activeId) return;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const activeElement = itemRefs.current.get(activeId);
        activeElement?.scrollIntoView({
            block: 'center',
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
        });
    };

    const handleClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            const headerOffset = 80;
            const y = element.getBoundingClientRect().top + window.scrollY - headerOffset;
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({ top: y, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
        onItemClick?.(id);
    };

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const getVisibleChildren = (node: TocNode): TocNode[] => {
        return node.children.filter((child) => {
            return showDeepHeadings || child.item.level < 3 || activePath.has(child.item.id);
        });
    };

    const renderNodes = (nodes: TocNode[], depth = 0): React.ReactNode => {
        if (nodes.length === 0) return null;

        return (
            <ul className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1'}>
                {nodes.map((node) => {
                    if (!showDeepHeadings && node.item.level >= 3 && !activePath.has(node.item.id)) {
                        return null;
                    }

                    const isActive = activeId === node.item.id;
                    const isOnActivePath = activePath.has(node.item.id);
                    const visibleChildren = getVisibleChildren(node);
                    const hasChildren = visibleChildren.length > 0;
                    const isExpanded = hasChildren && (isOnActivePath || expandedIds.has(node.item.id));
                    const paddingLeft = `${depth * 0.75}rem`;

                    return (
                        <li key={node.item.id}>
                            <div
                                className={[
                                    'group relative flex items-center gap-1 rounded-md border-l-2 pr-1 text-sm transition-colors',
                                    isActive
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                        : isOnActivePath
                                            ? 'border-emerald-300 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-200',
                                ].join(' ')}
                                style={{ paddingLeft }}
                            >
                                <a
                                    href={`#${node.item.id}`}
                                    ref={(el) => {
                                        itemRefs.current.set(node.item.id, el);
                                    }}
                                    onClick={(e) => handleClick(e, node.item.id)}
                                    aria-current={isActive ? 'location' : undefined}
                                    className={[
                                        'min-w-0 flex-1 rounded-md px-2 py-1.5',
                                        isActive ? 'font-semibold' : '',
                                    ].join(' ')}
                                    title={node.item.text}
                                >
                                    <span className="line-clamp-2">{node.item.text}</span>
                                </a>
                                {hasChildren && (
                                    <button
                                        type="button"
                                        onClick={() => toggleExpanded(node.item.id)}
                                        className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                                        aria-label={isExpanded ? '하위 목차 접기' : '하위 목차 펼치기'}
                                        aria-expanded={isExpanded}
                                    >
                                        <svg
                                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                            aria-hidden="true"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.94 10 7.23 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 0 1-1.08-.02Z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            {isExpanded && renderNodes(visibleChildren, depth + 1)}
                        </li>
                    );
                })}
            </ul>
        );
    };

    if (headings.length === 0) return null;

    return (
        <nav aria-label="목차">
            <div className="mb-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
                        목차
                    </h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {headings.length}개 섹션
                    </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setShowDeepHeadings((prev) => !prev)}
                            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            aria-pressed={showDeepHeadings}
                        >
                            {showDeepHeadings ? 'h3+ 접기' : 'h3+ 펼치기'}
                        </button>
                        <button
                            type="button"
                            onClick={jumpToCurrentSection}
                            disabled={!activeId}
                            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            aria-label="현재 섹션 항목으로 이동"
                        >
                            현재 섹션
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={scrollToTop}
                        className="rounded-md px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                    >
                        맨 위로
                    </button>
                </div>
            </div>
            {renderNodes(tocTree)}
        </nav>
    );
};

export default TableOfContents;
