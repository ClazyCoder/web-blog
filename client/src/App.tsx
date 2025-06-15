import React from 'react';
import './App.css';
import { Route, Routes } from "react-router-dom";
import * as CustomRoutes from "./routes";
import 'bootstrap/dist/css/bootstrap.min.css';

const App: React.FC = () => {
    return (
        <Routes>
            <Route path="/" element={<CustomRoutes.Home />} />
            <Route path="/board" element={<CustomRoutes.BoardList />} />
        </Routes>
    );
};

export default App; 