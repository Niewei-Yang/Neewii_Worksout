import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import PropTypes from 'prop-types';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import useSiteMetadata from '@/hooks/useSiteMetadata';
const Layout = ({ children }) => {
    const { siteTitle, description, keywords } = useSiteMetadata();
    return (_jsxs(_Fragment, { children: [_jsxs(Helmet, { children: [_jsx("html", { lang: "en" }), _jsx("title", { children: siteTitle }), _jsx("meta", { name: "description", content: description }), _jsx("meta", { name: "keywords", content: keywords }), _jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1, shrink-to-fit=no" })] }), _jsx(Header, {}), _jsx("div", { className: "mx-auto mb-16 max-w-screen-2xl p-4 lg:flex lg:p-16", children: children })] }));
};
Layout.propTypes = {
    children: PropTypes.node.isRequired,
};
export default Layout;
