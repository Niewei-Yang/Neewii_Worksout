import { useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface TimelineCursorProps {
  cursor?: number | null;
  onCursorChange?: (time: number) => void;
}

export function useTimelineCursor(
  duration: number,
  controlled: TimelineCursorProps
) {
  const [local, setLocal] = useState<number | null>(null);
  const cursor = controlled.cursor === undefined ? local : controlled.cursor;
  const update = controlled.onCursorChange ?? setLocal;
  const inspect = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    update(
      Math.max(
        0,
        Math.min(
          duration,
          ((event.clientX - bounds.left) / bounds.width) * duration
        )
      )
    );
  };
  return {
    cursor,
    onFocus: () => update(cursor ?? 0),
    onPointerMove: inspect,
    onPointerDown: inspect,
    onKeyDown: (event: KeyboardEvent<SVGSVGElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return;
      event.preventDefault();
      update(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? duration
            : Math.max(
                0,
                Math.min(
                  duration,
                  (cursor ?? 0) + (event.key === 'ArrowRight' ? 10 : -10)
                )
              )
      );
    },
  };
}
