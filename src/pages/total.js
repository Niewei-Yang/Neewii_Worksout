import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import ActivityList from '@/components/ActivityList';
import { Helmet } from 'react-helmet-async';
import { useTheme } from '@/hooks/useTheme';
import { useEffect } from 'react';
const HomePage = () => {
    // Use the theme hook to get the current theme
    const { theme } = useTheme();
    // Apply theme changes to the document when theme changes
    useEffect(() => {
        const htmlElement = document.documentElement;
        // Set explicit theme attribute
        htmlElement.setAttribute('data-theme', theme);
    }, [theme]);
    return (_jsxs(_Fragment, { children: [_jsx(Helmet, { children: _jsx("html", { lang: "en", "data-theme": theme }) }), _jsx(ActivityList, {})] }));
};
export default HomePage;
