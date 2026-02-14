import React from 'react';
import { Route, Routes, useNavigate } from "react-router-dom";
import * as CustomRoutes from "./routes";

const App: React.FC = () => {
    return (
        <main className="flex-1">
            <Routes>
                <Route path="/" element={<CustomRoutes.Home />} />
                <Route path="/board" element={<CustomRoutes.BoardList />} />
                <Route path="/board/:id" element={<CustomRoutes.PageRoute />} />
                <Route path="/editor" element={<CustomRoutes.Editor />} />
                <Route path="/editor/:id" element={<CustomRoutes.Editor />} />
                <Route path="/login" element={<CustomRoutes.Login />} />
                <Route path="/unauthorized" element={<CustomRoutes.Unauthorized />} />
                <Route path="/admin" element={<CustomRoutes.Admin />} />

                {/* 404 페이지 */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </main>
    );
};

const NotFound: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 bg-gray-50 dark:bg-gray-900">
            <div className="animate-fade-in-up">
                <div className="text-8xl font-bold text-emerald-500/20 dark:text-emerald-400/10 mb-2 select-none">
                    404
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    페이지를 찾을 수 없습니다
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
                    요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
                </p>
                <button
                    onClick={() => navigate('/')}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all duration-200 shadow-md shadow-emerald-600/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    홈으로 돌아가기
                </button>
            </div>
        </div>
    );
};

export default App;
