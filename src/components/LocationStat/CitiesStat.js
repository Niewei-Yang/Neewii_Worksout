import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
// only support China for now
const CitiesStat = ({ onClick }) => {
    const { cities } = useActivities();
    const citiesArr = Object.entries(cities);
    citiesArr.sort((a, b) => b[1] - a[1]);
    return (_jsxs("div", { className: "cursor-pointer", children: [_jsx("section", { children: citiesArr.map(([city, distance]) => (_jsx(Stat, { value: city, description: ` ${(distance / 1000).toFixed(0)} KM`, citySize: 5, onClick: () => onClick(city) }, city))) }), _jsx("hr", {})] }));
};
export default CitiesStat;
