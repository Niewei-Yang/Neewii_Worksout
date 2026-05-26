import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Stat from '@/components/Stat';
import useActivities from '@/hooks/useActivities';
import { IS_CHINESE } from '@/utils/const';
import { titleForType } from '@/utils/utils';
const PeriodStat = ({ onClick }) => {
    const { runPeriod } = useActivities();
    const periodArr = Object.entries(runPeriod);
    periodArr.sort((a, b) => b[1] - a[1]);
    return (_jsxs("div", { className: "cursor-pointer", children: [_jsx("section", { children: periodArr.map(([type, times]) => (_jsx(Stat, { value: `${IS_CHINESE && titleForType(type)} ${times} `, description: type + (times > 1 ? 's' : ''), citySize: 5, onClick: () => onClick(type) }, type))) }), _jsx("hr", {})] }));
};
export default PeriodStat;
