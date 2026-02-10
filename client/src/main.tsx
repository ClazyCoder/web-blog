import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import * as Layouts from "./layouts";
import { AuthProvider } from './context/AuthContext';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <div className="min-h-screen flex flex-col">
                    <Layouts.Header />
                    <App />
                    <Layouts.Footer />
                </div>
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);