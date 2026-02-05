import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import * as Layouts from "./layouts";

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <BrowserRouter>
            <div className="min-h-screen flex flex-col">
                <Layouts.Header />
                <App />
                <Layouts.Footer />
            </div>
        </BrowserRouter>
    </React.StrictMode>
);