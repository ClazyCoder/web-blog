export interface TocItem {
    id: string;
    text: string;
    level: number;
}

/**
 * 텍스트를 URL-safe slug로 변환
 * 한글, 영어, 숫자를 지원하며 중복 slug 처리를 위해 slugCount를 사용
 */
function generateSlug(text: string, slugCount: Map<string, number>): string {
    const base = text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s\uAC00-\uD7AF\u3131-\u3163\u314F-\u3163-]/g, '')
        .replace(/[\s]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    const slug = base || 'heading';
    const count = slugCount.get(slug) || 0;
    slugCount.set(slug, count + 1);

    return count === 0 ? slug : `${slug}-${count}`;
}

/**
 * React children에서 순수 텍스트를 추출
 * ReactMarkdown이 넘겨주는 children (string | ReactNode[])를 처리
 */
export function extractTextFromChildren(children: React.ReactNode): string {
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) {
        return children.map(extractTextFromChildren).join('');
    }
    if (children && typeof children === 'object' && 'props' in children) {
        return extractTextFromChildren((children as any).props.children);
    }
    return '';
}

/**
 * 마크다운 원본 문자열에서 헤딩(#, ##, ###)을 파싱하여 TocItem 배열로 반환
 * 코드 블록 내부의 #은 무시
 */
export function parseMarkdownHeadings(markdown: string): TocItem[] {
    const lines = markdown.split('\n');
    const headings: TocItem[] = [];
    const slugCount = new Map<string, number>();
    let inCodeBlock = false;

    for (const line of lines) {
        // 코드 블록 토글
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock) continue;

        // ATX 스타일 헤딩 매칭 (# ~ ###)
        const match = line.match(/^(#{1,3})\s+(.+)$/);
        if (match) {
            const level = match[1].length;
            const text = match[2].replace(/\*\*(.+?)\*\*/g, '$1') // bold 제거
                .replace(/\*(.+?)\*/g, '$1')     // italic 제거
                .replace(/`(.+?)`/g, '$1')        // inline code 제거
                .replace(/\[(.+?)\]\(.+?\)/g, '$1') // link 텍스트만 추출
                .trim();
            const id = generateSlug(text, slugCount);

            headings.push({ id, text, level });
        }
    }

    return headings;
}

/**
 * 이미 파싱된 헤딩 목록에서 텍스트 기반으로 slug를 생성
 * ReactMarkdown의 heading 컴포넌트에서 사용
 */
export function getHeadingSlug(text: string, allHeadings: TocItem[]): string {
    const item = allHeadings.find(h => h.text === text);
    return item?.id || text.toLowerCase().replace(/\s+/g, '-');
}
