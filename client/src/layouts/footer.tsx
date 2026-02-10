import React from 'react';

const Footer: React.FC = () => {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'admin@example.com';

    return (
        <footer className="bg-gray-800 py-4">
            <div className="flex justify-center items-center">
                <a
                    href={`mailto:${adminEmail}`}
                    className="text-gray-300 hover:text-white transition-colors duration-200"
                >
                    {adminEmail}
                </a>
            </div>
        </footer>
    );
};

export default Footer;
