import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
// only support China for now
const LocationSummary = () => {
    const { years, countries, provinces, cities } = useActivities();
    return (_jsxs("div", { className: "cursor-pointer", children: [_jsxs("section", { children: [years ? (_jsx(Stat, { value: `${years.length}`, description: " \u5E74\u91CC\u6211\u8D70\u8FC7" })) : null, countries ? (_jsx(Stat, { value: countries.length, description: " \u4E2A\u56FD\u5BB6" })) : null, provinces ? (_jsx(Stat, { value: provinces.length, description: " \u4E2A\u7701\u4EFD" })) : null, cities ? (_jsx(Stat, { value: Object.keys(cities).length, description: " \u4E2A\u57CE\u5E02" })) : null] }), _jsx("hr", {})] }));
};
export default LocationSummary;
