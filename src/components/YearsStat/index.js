import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import YearStat from '@/components/YearStat';
import useActivities from '@/hooks/useActivities';
import { INFO_MESSAGE } from '@/utils/const';
const YearsStat = ({ year, onClick, onClickTypeInYear, }) => {
    const { years } = useActivities();
    // Memoize the years array calculation
    const yearsArrayUpdate = useMemo(() => {
        // make sure the year click on front
        let updatedYears = years.slice();
        updatedYears.push('Total');
        updatedYears = updatedYears.filter((x) => x !== year);
        updatedYears.unshift(year);
        return updatedYears;
    }, [years, year]);
    const infoMessage = useMemo(() => {
        return INFO_MESSAGE(years.length, year);
    }, [years.length, year]);
    // for short solution need to refactor
    return (_jsxs("div", { className: "w-full pb-16 pr-16 lg:w-full lg:pr-16", children: [_jsxs("section", { className: "pb-0", children: [_jsxs("p", { className: "leading-relaxed", children: [infoMessage, _jsx("br", {})] }), _jsxs("p", { className: "mt-4 text-sm leading-relaxed opacity-80", children: ["Pain is inevitable. Suffering is optional. \u8FD9\u4FBF\u662F\u4ED6\u7684\u771F\u8A00\u3002\u5176\u5FAE\u5999\u7684\u542B\u4E49\u96BE\u4EE5\u6B63\u786E\u5730\u7FFB\u8BD1\uFF0C\u660E\u77E5\u5176\u4E0D\u53EF\u8BD1\u800C\u786C\u8BD1\uFF0C\u4E0D\u59A8\u8BD1\u6210\u6700\u4E3A\u7B80\u5355\u7684\uFF1A\u201C\u75DB\u695A\u96BE\u4EE5\u907F\u514D\uFF0C\u800C\u78E8\u96BE\u53EF\u4EE5\u9009\u62E9\u3002\u201D", _jsx("br", {}), "\u2014\u2014\u6751\u4E0A\u6625\u6811\u300A\u5F53\u6211\u8C08\u8DD1\u6B65\u65F6\u6211\u8C08\u4E9B\u4EC0\u4E48\u300B"] })] }), _jsx("hr", {}), yearsArrayUpdate.map((yearItem) => (_jsx(YearStat, { year: yearItem, onClick: onClick, onClickTypeInYear: onClickTypeInYear }, yearItem)))] }));
};
export default YearsStat;
