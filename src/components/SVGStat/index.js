import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect } from 'react';
import { totalStat } from '@assets/index';
import { loadSvgComponent } from '@/utils/svgUtils';
import { initSvgColorAdjustments } from '@/utils/colorUtils';
// Lazy load both github.svg and grid.svg
const GithubSvg = lazy(() => loadSvgComponent(totalStat, './github.svg'));
const GridSvg = lazy(() => loadSvgComponent(totalStat, './grid.svg'));
const SVGStat = () => {
    useEffect(() => {
        // Initialize SVG color adjustments when component mounts
        const timer = setTimeout(() => {
            initSvgColorAdjustments();
        }, 100); // Small delay to ensure SVG is rendered
        return () => clearTimeout(timer);
    }, []);
    return (_jsx("div", { id: "svgStat", children: _jsxs(Suspense, { fallback: _jsx("div", { className: "text-center", children: "Loading..." }), children: [_jsx(GithubSvg, { className: "github-svg mt-4 h-auto w-full" }), _jsx(GridSvg, { className: "grid-svg mt-4 h-auto w-full" })] }) }));
};
export default SVGStat;
