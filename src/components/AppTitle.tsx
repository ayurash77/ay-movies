import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppTitleState = {
    title: string;
    display?: ReactNode;
    mobileBackTo?: '/chat';
} | null;

type AppTitleContextValue = {
    title: AppTitleState;
    setTitle: (title: AppTitleState) => void;
    toolbar: ReactNode | null;
    setToolbar: (toolbar: ReactNode | null) => void;
};

const AppTitleContext = createContext<AppTitleContextValue | null>(null);

export function AppTitleProvider({ children }: { children: ReactNode }) {
    const [ title, setTitle ] = useState<AppTitleState>(null);
    const [ toolbar, setToolbar ] = useState<ReactNode | null>(null);
    const value = useMemo(() => ({ title, setTitle, toolbar, setToolbar }), [ title, toolbar ]);

    return (
        <AppTitleContext.Provider value={value}>
            {children}
        </AppTitleContext.Provider>
    );
}

export function useAppTitle() {
    const context = useContext(AppTitleContext);
    if (!context) {
        throw new Error('useAppTitle must be used inside AppTitleProvider');
    }
    return context.title;
}

export function useAppToolbar() {
    const context = useContext(AppTitleContext);
    if (!context) {
        throw new Error('useAppToolbar must be used inside AppTitleProvider');
    }
    return context.toolbar;
}

export function useAppHeaderToolbar(toolbar: ReactNode | null) {
    const context = useContext(AppTitleContext);
    const setToolbar = context?.setToolbar;

    useEffect(() => {
        if (!setToolbar) return;
        setToolbar(toolbar);
        return () => setToolbar(null);
    }, [ setToolbar, toolbar ]);

    return Boolean(context);
}

export function PageTitle({
    title,
    display,
    mobileBackTo,
}: {
    title: string;
    display?: ReactNode;
    mobileBackTo?: '/chat';
}) {
    const context = useContext(AppTitleContext);
    const setTitle = context?.setTitle;

    useEffect(() => {
        if (!setTitle) return;
        setTitle({ title, display, mobileBackTo });
        return () => setTitle(null);
    }, [ display, mobileBackTo, setTitle, title ]);

    return null;
}
