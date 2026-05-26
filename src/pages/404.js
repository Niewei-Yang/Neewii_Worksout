import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Layout from '@/components/Layout';
import useSiteMetadata from '@/hooks/useSiteMetadata';
const NotFoundPage = () => {
    const { siteUrl } = useSiteMetadata();
    return (_jsxs(Layout, { children: [_jsx("h1", { className: "my-2.5 text-5xl font-bold italic", children: "404" }), _jsx("p", { children: "This page doesn't exist." }), _jsxs("p", { className: "text-gray-400", children: ["If you wanna more message, you could visit", ' ', _jsx("a", { className: "font-bold text-gray-400", href: siteUrl, children: siteUrl })] })] }));
};
export default NotFoundPage;
