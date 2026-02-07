import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface PageItem {
    id: string;
    title: string;
    markdown: string;
    last_updated: string;
    imgSrc: string;
}

const PageLayout: React.FC = () => {
    const [pageData, setPageData] = useState<PageItem | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Mock 데이터 - 실제로는 API나 props로 받아올 수 있습니다
        const getMockPageData = (): PageItem => {
            return {
                id: "1",
                title: "샘플 페이지",
                markdown: `# 제목

이것은 **Markdown** 콘텐츠 예시입니다.

## 코드 블록 예시

\`\`\`javascript
function hello() {
    console.log("Hello, World!");
}
\`\`\`

## 리스트 예시

- 항목 1
- 항목 2
- 항목 3

## 표 예시

| 컬럼1 | 컬럼2 | 컬럼3 |
|-------|-------|-------|
| 데이터1 | 데이터2 | 데이터3 |
| 데이터4 | 데이터5 | 데이터6 |

## 인용문

> 이것은 인용문입니다.

## 링크와 이미지

[링크 예시](https://example.com)

---

더 많은 내용이 여기에 들어갑니다.`,
                last_updated: "2024-02-08",
                imgSrc: "logo192.png"
            };
        };

        setTimeout(() => {
            setPageData(getMockPageData());
            setLoading(false);
        }, 100);
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="text-xl">로딩 중...</div>
            </div>
        );
    }

    if (!pageData) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="text-xl">페이지를 찾을 수 없습니다.</div>
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
                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <span>마지막 수정: {pageData.last_updated}</span>
                    </div>
                </header>

                {/* Markdown 콘텐츠 */}
                <div className="max-w-none markdown-content">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                            // 커스텀 컴포넌트로 스타일 강화
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
                            a: ({ href, children }) => (
                                <a
                                    href={href}
                                    className="text-blue-600 dark:text-blue-400 hover:underline no-underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {children}
                                </a>
                            ),
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
                        {pageData.markdown}
                    </ReactMarkdown>
                </div>
            </article>
        </div>
    );
};

export default PageLayout;