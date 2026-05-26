import { jsx as _jsx } from "react/jsx-runtime";
import useActivities from '@/hooks/useActivities';
import styles from './style.module.css';
const RunMapButtons = ({ changeYear, thisYear, }) => {
    const { years } = useActivities();
    const yearsButtons = years.slice();
    yearsButtons.push('Total');
    return (_jsx("ul", { className: styles.buttons, children: yearsButtons.map((year) => (_jsx("li", { className: styles.button + ` ${year === thisYear ? styles.selected : ''}`, onClick: () => {
                changeYear(year);
            }, children: year }, `${year}button`))) }));
};
export default RunMapButtons;
