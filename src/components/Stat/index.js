import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { intComma } from '@/utils/utils';
const Stat = ({ value, description, className = 'pb-2 w-full', citySize, onClick, }) => (_jsxs("div", { className: `${className}`, onClick: onClick, children: [_jsx("span", { className: `text-${citySize || 5}xl font-bold italic`, children: intComma(value.toString()) }), _jsx("span", { className: "text-2xl font-semibold italic", children: description })] }));
export default Stat;
