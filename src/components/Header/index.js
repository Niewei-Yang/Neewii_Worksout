import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { useState } from 'react';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import { useTheme } from '@/hooks/useTheme';
import styles from './style.module.css';
const Header = () => {
    const { logo, siteUrl, navLinks } = useSiteMetadata();
    const { setTheme } = useTheme();
    const [currentIconIndex, setCurrentIconIndex] = useState(0);
    const icons = [
        {
            id: 'dark',
            svg: (_jsx("svg", { width: "22", height: "23", viewBox: "0 0 22 23", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M21.7519 15.0137C20.597 15.4956 19.3296 15.7617 18 15.7617C12.6152 15.7617 8.25 11.3965 8.25 6.01171C8.25 4.68211 8.51614 3.41468 8.99806 2.25977C5.47566 3.72957 3 7.20653 3 11.2617C3 16.6465 7.36522 21.0117 12.75 21.0117C16.8052 21.0117 20.2821 18.536 21.7519 15.0137Z", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) })),
        },
        {
            id: 'light',
            svg: (_jsx("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M12 3.00464V5.25464M18.364 5.64068L16.773 7.23167M21 12.0046H18.75M18.364 18.3686L16.773 16.7776M12 18.7546V21.0046M7.22703 16.7776L5.63604 18.3686M5.25 12.0046H3M7.22703 7.23167L5.63604 5.64068M15.75 12.0046C15.75 14.0757 14.0711 15.7546 12 15.7546C9.92893 15.7546 8.25 14.0757 8.25 12.0046C8.25 9.93357 9.92893 8.25464 12 8.25464C14.0711 8.25464 15.75 9.93357 15.75 12.0046Z", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) })),
        },
    ];
    const handleToggle = () => {
        const nextIndex = (currentIconIndex + 1) % icons.length;
        setCurrentIconIndex(nextIndex);
        setTheme(icons[nextIndex].id);
    };
    const currentIcon = icons[currentIconIndex];
    return (_jsx(_Fragment, { children: _jsxs("nav", { className: "mx-auto mt-12 flex w-full min-w-max items-center justify-between pl-6 lg:px-16", children: [_jsx("div", { className: "w-1/4", children: _jsx(Link, { to: siteUrl, children: _jsx("picture", { children: _jsx("img", { className: "h-16 w-16 rounded-full", alt: "logo", src: logo }) }) }) }), _jsxs("div", { className: "flex w-3/4 items-center justify-end text-right", children: [navLinks.map((n, i) => (_jsx("a", { href: n.url, className: "mr-3 text-lg lg:mr-4 lg:text-base", children: n.name }, i))), _jsx("div", { className: "ml-4 flex items-center space-x-2", children: _jsx("button", { type: "button", onClick: handleToggle, className: `${styles.themeButton} ${styles.themeButtonActive}`, "aria-label": `Switch to ${currentIcon.id} theme`, title: `Switch to ${currentIcon.id} theme`, children: _jsx("div", { className: styles.iconWrapper, children: currentIcon.svg }) }) })] })] }) }));
};
export default Header;
