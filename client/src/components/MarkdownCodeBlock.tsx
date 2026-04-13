import React, { useEffect, useMemo, useRef, useState } from 'react';

const extractCodeText = (node: React.ReactNode): string => {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractCodeText).join('');
    if (React.isValidElement(node)) {
        return extractCodeText((node.props as { children?: React.ReactNode }).children);
    }
    return '';
};

function normalizeClassName(className: unknown): string {
    if (className == null) return '';
    if (Array.isArray(className)) return className.map(String).join(' ');
    return String(className);
}

function getFenceLanguage(children: React.ReactNode): string | null {
    let lang: string | null = null;
    const visit = (node: React.ReactNode): void => {
        if (lang) return;
        if (React.isValidElement(node)) {
            const elType = node.type;
            const isCode = elType === 'code' || (typeof elType === 'string' && elType === 'code');
            if (isCode) {
                const cn = normalizeClassName((node.props as { className?: unknown }).className);
                const m = cn.match(/language-([^\s]+)/);
                if (m) lang = m[1].toLowerCase();
            }
            if (!lang) {
                visit((node.props as { children?: React.ReactNode }).children);
            }
        } else if (Array.isArray(node)) {
            node.forEach(visit);
        }
    };
    visit(children);
    return lang;
}

function usePrefersDarkScheme(): boolean {
    const [dark, setDark] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
    );

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => setDark(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    return dark;
}

/**
 * mermaid.render(고정 id)는 Strict Mode·재렌더 시 DOM id 충돌이 나기 쉬우므로,
 * 공식 run({ nodes }) 경로로 노드별 자동 id를 쓰도록 한다.
 */
const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const runGenerationRef = useRef(0);
    const [error, setError] = useState<string | null>(null);
    const prefersDark = usePrefersDarkScheme();

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return undefined;

        runGenerationRef.current += 1;
        const gen = runGenerationRef.current;
        let cancelled = false;

        el.classList.add('mermaid');
        el.removeAttribute('data-processed');
        el.textContent = code.trim();

        void (async () => {
            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: prefersDark ? 'dark' : 'default',
                    securityLevel: 'loose',
                });
                if (cancelled || gen !== runGenerationRef.current) return;
                await mermaid.run({ nodes: [el] });
                if (cancelled || gen !== runGenerationRef.current) return;
                setError(null);
            } catch (e) {
                if (!cancelled && gen === runGenerationRef.current) {
                    const message = e instanceof Error ? e.message : String(e);
                    setError(message);
                    el.innerHTML = '';
                    el.removeAttribute('data-processed');
                }
            }
        })();

        return () => {
            cancelled = true;
            el.removeAttribute('data-processed');
            el.classList.remove('mermaid');
            el.innerHTML = '';
        };
    }, [code, prefersDark]);

    return (
        <div className="space-y-2">
            {error ? (
                <>
                    <div
                        className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
                        role="alert"
                    >
                        Mermaid 렌더 오류: {error}
                    </div>
                    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                        {code}
                    </pre>
                </>
            ) : null}
            {/* ref 호스트는 항상 마운트: 오류 후 소스 수정 시에도 effect가 다시 돈다 */}
            <div
                ref={hostRef}
                className={`flex min-h-16 justify-center overflow-x-auto rounded-lg border border-gray-500/30 bg-white p-4 dark:border-gray-600/40 dark:bg-gray-950 [&_svg]:max-w-full ${error ? 'hidden' : ''}`}
                aria-hidden={error ? true : undefined}
            />
        </div>
    );
};

/**
 * 마크다운 fenced code 블록용: 일반 코드는 하이라이트된 children을 그대로 표시하고,
 * ` ```mermaid ` 는 Mermaid로 렌더링한다.
 */
const MarkdownCodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<number | null>(null);

    const language = useMemo(() => getFenceLanguage(children), [children]);
    const codeText = useMemo(() => extractCodeText(children), [children]);

    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) {
                window.clearTimeout(copiedTimerRef.current);
            }
        };
    }, []);

    const handleCopy = async () => {
        if (!codeText.trim()) return;

        try {
            await navigator.clipboard.writeText(codeText);
            setCopied(true);

            if (copiedTimerRef.current) {
                window.clearTimeout(copiedTimerRef.current);
            }

            copiedTimerRef.current = window.setTimeout(() => {
                setCopied(false);
            }, 1400);
        } catch (err) {
            console.error('코드 복사 실패:', err);
        }
    };

    if (language === 'mermaid') {
        return (
            <div className="group relative my-4">
                <button
                    type="button"
                    onClick={handleCopy}
                    className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-500/40 bg-gray-700/80 text-gray-100 backdrop-blur transition-opacity duration-150 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-gray-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    aria-label={copied ? '코드 복사 완료' : '코드 복사'}
                    title={copied ? '복사됨' : '코드 복사'}
                >
                    {copied ? (
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.414-1.414l2.493 2.493 6.493-6.493a1 1 0 011.415 0z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M6 2a2 2 0 00-2 2v1H3a2 2 0 00-2 2v8a2 2 0 002 2h7a2 2 0 002-2v-1h1a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0010.586 2H6zm5 2.414L13.586 7H11V4.414zM10 4v4a1 1 0 001 1h3v6h-2V7a2 2 0 00-2-2H6V4h4z" />
                        </svg>
                    )}
                </button>
                <div className="pr-14 pt-1">
                    <MermaidDiagram code={codeText} />
                </div>
            </div>
        );
    }

    return (
        <div className="group relative my-4">
            <button
                type="button"
                onClick={handleCopy}
                className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-500/40 bg-gray-700/80 text-gray-100 backdrop-blur transition-opacity duration-150 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-gray-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                aria-label={copied ? '코드 복사 완료' : '코드 복사'}
                title={copied ? '복사됨' : '코드 복사'}
            >
                {copied ? (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.414-1.414l2.493 2.493 6.493-6.493a1 1 0 011.415 0z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M6 2a2 2 0 00-2 2v1H3a2 2 0 00-2 2v8a2 2 0 002 2h7a2 2 0 002-2v-1h1a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-3.414-3.414A2 2 0 0010.586 2H6zm5 2.414L13.586 7H11V4.414zM10 4v4a1 1 0 001 1h3v6h-2V7a2 2 0 00-2-2H6V4h4z" />
                    </svg>
                )}
            </button>
            <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 pr-16 rounded-lg overflow-x-auto">
                {children}
            </pre>
        </div>
    );
};

export default MarkdownCodeBlock;
