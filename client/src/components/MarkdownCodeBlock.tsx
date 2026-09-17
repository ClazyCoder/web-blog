import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/useTheme';
import { InCodeFenceContext } from '../context/codeFenceContext';

const MERMAID_THEME_VARIABLES = {
    light: {
        darkMode: false,
        background: '#eef6f4',
        primaryColor: '#ffffff',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#0f766e',
        secondaryColor: '#dff7ee',
        secondaryTextColor: '#0f172a',
        secondaryBorderColor: '#0f766e',
        tertiaryColor: '#e8eef7',
        tertiaryTextColor: '#0f172a',
        tertiaryBorderColor: '#64748b',
        mainBkg: '#ffffff',
        nodeBkg: '#ffffff',
        nodeBorder: '#0f766e',
        nodeTextColor: '#0f172a',
        lineColor: '#334155',
        arrowheadColor: '#334155',
        textColor: '#0f172a',
        titleColor: '#0f172a',
        edgeLabelBackground: '#eef6f4',
        clusterBkg: '#f8fafc',
        clusterBorder: '#94a3b8',
        actorBkg: '#ffffff',
        actorBorder: '#0f766e',
        actorTextColor: '#0f172a',
        signalColor: '#334155',
        signalTextColor: '#0f172a',
        labelBoxBkgColor: '#ffffff',
        labelBoxBorderColor: '#64748b',
        labelTextColor: '#0f172a',
        loopTextColor: '#0f172a',
        noteBkgColor: '#fef3c7',
        noteTextColor: '#422006',
        noteBorderColor: '#d97706',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '16px',
    },
    dark: {
        darkMode: true,
        background: '#0b1320',
        primaryColor: '#132a2a',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#34d399',
        secondaryColor: '#172554',
        secondaryTextColor: '#f8fafc',
        secondaryBorderColor: '#60a5fa',
        tertiaryColor: '#312e4f',
        tertiaryTextColor: '#f8fafc',
        tertiaryBorderColor: '#a78bfa',
        mainBkg: '#132a2a',
        nodeBkg: '#132a2a',
        nodeBorder: '#34d399',
        nodeTextColor: '#f8fafc',
        lineColor: '#cbd5e1',
        arrowheadColor: '#cbd5e1',
        textColor: '#f8fafc',
        titleColor: '#f8fafc',
        edgeLabelBackground: '#0b1320',
        clusterBkg: '#111c2d',
        clusterBorder: '#64748b',
        actorBkg: '#132a2a',
        actorBorder: '#34d399',
        actorTextColor: '#f8fafc',
        signalColor: '#cbd5e1',
        signalTextColor: '#f8fafc',
        labelBoxBkgColor: '#111c2d',
        labelBoxBorderColor: '#94a3b8',
        labelTextColor: '#f8fafc',
        loopTextColor: '#f8fafc',
        noteBkgColor: '#422006',
        noteTextColor: '#fef3c7',
        noteBorderColor: '#f59e0b',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: '16px',
    },
} as const;

const MERMAID_THEME_CSS = `
    .nodeLabel, .edgeLabel, .label, .messageText, .loopText, .noteText, .taskText {
        font-weight: 600;
    }

    .nodeLabel p {
        line-height: 1.4;
    }

    .edgeLabel p {
        padding: 2px 5px;
        border-radius: 4px;
    }
`;

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
                    theme: 'base',
                    themeVariables: MERMAID_THEME_VARIABLES[theme],
                    themeCSS: MERMAID_THEME_CSS,
                    securityLevel: 'strict',
                });
                if (cancelled || generation !== runGenerationRef.current) return;
                await mermaid.run({ nodes: [element] });
                if (cancelled || generation !== runGenerationRef.current) return;

                // Mermaid의 기본 width: 100%는 모바일에서 글자까지 축소한다.
                // viewBox의 자연 너비를 유지하고 컨테이너에서 가로 탐색하도록 한다.
                const svg = element.querySelector<SVGSVGElement>('svg');
                const naturalWidth = svg?.viewBox.baseVal.width ?? 0;
                if (svg && naturalWidth > 0) {
                    svg.style.width = `${Math.ceil(naturalWidth)}px`;
                    svg.style.maxWidth = 'none';
                    svg.style.height = 'auto';
                }

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
                className={`mermaid-surface min-h-28 overflow-x-auto p-4 sm:p-7 ${error ? 'hidden' : ''}`}
                tabIndex={error ? -1 : 0}
                aria-label="Mermaid 다이어그램. 넓은 다이어그램은 가로로 스크롤해서 확인하세요."
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
