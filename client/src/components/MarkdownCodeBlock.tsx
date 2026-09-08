import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/useTheme';
import { InCodeFenceContext } from '../context/codeFenceContext';

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
    let language: string | null = null;
    const visit = (node: React.ReactNode): void => {
        if (language) return;
        if (React.isValidElement(node)) {
            const className = normalizeClassName((node.props as { className?: unknown }).className);
            const match = className.match(/language-([^\s]+)/);
            if (match) {
                language = match[1].toLowerCase();
                return;
            }
            visit((node.props as { children?: React.ReactNode }).children);
        } else if (Array.isArray(node)) {
            node.forEach(visit);
        }
    };
    visit(children);
    return language;
}

interface CodeBlockHeaderProps {
    language: string | null;
    copied: boolean;
    onCopy: () => void;
}

const CodeBlockHeader: React.FC<CodeBlockHeaderProps> = ({ language, copied, onCopy }) => (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-700/80 bg-[#182235] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
            <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 font-mono text-[11px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-300/15"
                aria-hidden="true"
            >
                &gt;_
            </span>
            <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                {language || 'code'}
            </span>
        </div>
        <button
            type="button"
            onClick={onCopy}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                copied
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : 'border-slate-600/70 bg-slate-800/60 text-slate-300 hover:border-slate-500 hover:bg-slate-700/70 hover:text-white'
            }`}
            aria-label={copied ? '코드 복사 완료' : '코드 복사'}
            title={copied ? '복사됨' : '코드 복사'}
        >
            {copied ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.414l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.414-1.414l2.493 2.493 6.493-6.493a1 1 0 011.415 0z" clipRule="evenodd" />
                </svg>
            ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="9" height="10" rx="1.5" strokeWidth="1.5" />
                    <path d="M12.5 6V4.5A1.5 1.5 0 0 0 11 3H5a1.5 1.5 0 0 0-1.5 1.5V12A1.5 1.5 0 0 0 5 13.5h1" strokeWidth="1.5" />
                </svg>
            )}
            <span aria-live="polite">{copied ? '복사됨' : '복사'}</span>
        </button>
    </div>
);

/** Mermaid는 현재 페이지 테마와 함께 다시 렌더링한다. */
const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const runGenerationRef = useRef(0);
    const [error, setError] = useState<string | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        const element = hostRef.current;
        if (!element) return undefined;

        runGenerationRef.current += 1;
        const generation = runGenerationRef.current;
        let cancelled = false;

        element.classList.add('mermaid');
        element.removeAttribute('data-processed');
        element.textContent = code.trim();

        void (async () => {
            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: theme === 'dark' ? 'dark' : 'default',
                    securityLevel: 'strict',
                });
                if (cancelled || generation !== runGenerationRef.current) return;
                await mermaid.run({ nodes: [element] });
                if (cancelled || generation !== runGenerationRef.current) return;
                setError(null);
            } catch (renderError) {
                if (!cancelled && generation === runGenerationRef.current) {
                    const message = renderError instanceof Error ? renderError.message : String(renderError);
                    setError(message);
                    element.innerHTML = '';
                    element.removeAttribute('data-processed');
                }
            }
        })();

        return () => {
            cancelled = true;
            element.removeAttribute('data-processed');
            element.classList.remove('mermaid');
            element.innerHTML = '';
        };
    }, [code, theme]);

    return (
        <div>
            {error ? (
                <div className="border-b border-red-400/20 bg-red-950/40 px-4 py-3 text-sm text-red-200" role="alert">
                    Mermaid 렌더 오류: {error}
                </div>
            ) : null}
            <div
                ref={hostRef}
                className={`flex min-h-28 justify-center overflow-x-auto bg-slate-50 p-5 dark:bg-[#0f172a] sm:p-7 [&_svg]:max-w-full ${error ? 'hidden' : ''}`}
                aria-hidden={error ? true : undefined}
            />
            {error ? (
                <pre className="m-0 overflow-x-auto bg-[#111827] px-5 py-5 font-mono text-[13px] leading-6 text-slate-200 whitespace-pre-wrap">
                    {code}
                </pre>
            ) : null}
        </div>
    );
};

const MarkdownCodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<number | null>(null);
    const language = useMemo(() => getFenceLanguage(children), [children]);
    const codeText = useMemo(() => extractCodeText(children), [children]);

    useEffect(() => () => {
        if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    }, []);

    const handleCopy = async () => {
        if (!codeText.trim()) return;

        try {
            await navigator.clipboard.writeText(codeText);
            setCopied(true);

            if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
        } catch (error) {
            console.error('코드 복사 실패:', error);
        }
    };

    return (
        <div className="code-block relative my-6 overflow-hidden rounded-xl border border-slate-700/80 bg-[#111827] shadow-[0_14px_34px_-22px_rgba(15,23,42,0.85)] ring-1 ring-black/5 dark:shadow-black/30">
            <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" aria-hidden="true" />
            <CodeBlockHeader language={language} copied={copied} onCopy={handleCopy} />
            <InCodeFenceContext.Provider value={true}>
                {language === 'mermaid' ? (
                    <MermaidDiagram code={codeText} />
                ) : (
                    <pre className="m-0 overflow-x-auto bg-[#111827] px-5 py-5 font-mono text-[13px] leading-6 text-slate-200 sm:px-6 sm:text-sm">
                        {children}
                    </pre>
                )}
            </InCodeFenceContext.Provider>
        </div>
    );
};

export default MarkdownCodeBlock;
