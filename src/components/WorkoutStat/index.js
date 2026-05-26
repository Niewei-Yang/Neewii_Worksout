import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { intComma } from '@/utils/utils';
import { MAIN_COLOR } from '@/utils/const';
const WorkoutStat = ({ value, description, pace, className, distance, onClick, color = MAIN_COLOR, }) => (_jsxs("div", { className: `${className || ' '} pb-2`, onClick: onClick, style: { color }, children: [_jsx("span", { className: `text-5xl font-bold italic`, children: intComma(value) }), _jsx("span", { className: "text-2xl font-semibold italic", children: description }), pace && _jsx("span", { className: "text-5xl font-bold italic", children: ' ' + pace }), pace && _jsx("span", { className: "text-2xl font-semibold italic", children: " Pace" }), distance && (_jsx("span", { className: "text-5xl font-bold italic", children: ' ' + distance })), distance && _jsx("span", { className: "text-2xl font-semibold italic", children: " KM" })] }));
export default WorkoutStat;
