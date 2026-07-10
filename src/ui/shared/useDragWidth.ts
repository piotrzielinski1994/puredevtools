import { useCallback, useEffect, useRef, useState } from 'react';

export const clampWidth = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export type DragWidth = {
  width: number;
  isDragging: boolean;
  onHandleMouseDown(event: { clientX: number; preventDefault(): void }): void;
};

export const useDragWidth = (initial: number, min: number, max: number): DragWidth => {
  const [width, setWidth] = useState(() => clampWidth(initial, min, max));
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const onHandleMouseDown = useCallback(
    (event: { clientX: number; preventDefault(): void }) => {
      event.preventDefault();
      startX.current = event.clientX;
      startWidth.current = width;
      setIsDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (event: MouseEvent) =>
      setWidth(clampWidth(startWidth.current + (event.clientX - startX.current), min, max));
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, min, max]);

  return { width, isDragging, onHandleMouseDown };
};
