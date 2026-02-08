import React from 'react';
import './App.css';
import { Route, Routes } from "react-router-dom";
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

                {/* 404 페이지 */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </main>
    );
};

const NotFound: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <h1 className="text-6xl font-bold text-gray-800 mb-4">404</h1>
            <p className="text-xl text-gray-600 mb-8">페이지를 찾을 수 없습니다</p>
            <a
                href="/"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded transition-colors"
            >
                홈으로 돌아가기
            </a>
        </div>
    );
};

export default App;