import React from 'react';

const Footer: React.FC = () => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'admin@example.com';
    const siteName = import.meta.env.VITE_SITE_NAME || 'YSG Blog';
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-gray-900 border-t border-gray-800">
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* 브랜드 + 저작권 */}
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                            <span className="text-xs font-bold text-emerald-400">
                                {siteName.charAt(0)}
                            </span>
                        </div>
                        <span className="text-sm text-gray-400">
                            &copy; {currentYear} {siteName}
                        </span>
                    </div>

                    {/* 이메일 링크 */}
                    <a
                        href={`mailto:${adminEmail}`}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-emerald-400 transition-colors duration-200"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        {adminEmail}
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
