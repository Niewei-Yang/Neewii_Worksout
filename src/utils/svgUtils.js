import { jsx as _jsx } from "react/jsx-runtime";
const FailedLoadSvg = () => {
    console.log('Failed to load SVG component');
    return _jsx("div", {});
};
export const loadSvgComponent = async (stats, path) => {
    try {
        const module = await stats[path]();
        return { default: module };
    }
    catch (error) {
        console.error(error);
        return { default: FailedLoadSvg };
    }
};
