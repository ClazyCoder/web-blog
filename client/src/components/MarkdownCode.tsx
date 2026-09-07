import React, { useContext } from 'react';
import { InCodeFenceContext } from '../context/codeFenceContext';

const MarkdownCode: React.FC<React.ComponentPropsWithoutRef<'code'>> = ({ className, children, ...props }) => {
    const inFence = useContext(InCodeFenceContext);

    return inFence ? (
        <code className={className} {...props}>{children}</code>
    ) : (
        <code
            className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200"
            {...props}
        >
            {children}
        </code>
    );
};

export default MarkdownCode;
