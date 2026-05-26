import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import YearStat from '@/components/YearStat';
import { CHINESE_LOCATION_INFO_MESSAGE_FIRST, CHINESE_LOCATION_INFO_MESSAGE_SECOND, } from '@/utils/const';
import CitiesStat from './CitiesStat';
import LocationSummary from './LocationSummary';
import PeriodStat from './PeriodStat';
const LocationStat = ({ changeYear, changeCity, changeType, onClickTypeInYear, }) => (_jsxs("div", { className: "w-full pb-16 lg:w-full lg:pr-16", children: [_jsx("section", { className: "pb-0", children: _jsxs("p", { className: "leading-relaxed", children: [CHINESE_LOCATION_INFO_MESSAGE_FIRST, ".", _jsx("br", {}), CHINESE_LOCATION_INFO_MESSAGE_SECOND, ".", _jsx("br", {}), _jsx("br", {}), "Yesterday you said tomorrow."] }) }), _jsx("hr", {}), _jsx(LocationSummary, {}), _jsx(CitiesStat, { onClick: changeCity }), _jsx(PeriodStat, { onClick: changeType }), _jsx(YearStat, { year: "Total", onClick: changeYear, onClickTypeInYear: onClickTypeInYear })] }));
export default LocationStat;
