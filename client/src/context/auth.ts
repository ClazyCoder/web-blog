import { createContext } from 'react';

export interface User {
    id: string;
    username: string;
    email: string;
}

export interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (username: string, password: string, rememberMe?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

