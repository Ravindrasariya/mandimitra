import { useState, useCallback, useEffect, useRef } from "react";

export function useKeyboardNav<T>(items: T[], keyFn?: (item: T) => string) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevItemsRef = useRef<string>("");

  useEffect(() => {
    const sig = keyFn
      ? items.map(keyFn).join("|")
      : items.map(String).join("|");
    if (sig !== prevItemsRef.current) {
      prevItemsRef.current = sig;
      setActiveIndex(-1);
    }
  }, [items, keyFn]);

  const scrollActiveIntoView = useCallback((idx: number) => {
    if (!listRef.current) return;
    const children = listRef.current.children;
    if (idx >= 0 && idx < children.length) {
      (children[idx] as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, []);

  const handleKeyDown = useCallback((
    e: React.KeyboardEvent,
    onSelect: (item: T) => void,
    onClose: () => void,
  ) => {
    if (items.length === 0) return;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = (activeIndex + 1) % items.length;
        setActiveIndex(next);
        scrollActiveIntoView(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
        setActiveIndex(prev);
        scrollActiveIntoView(prev);
        break;
      }
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) {
          onSelect(items[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        setActiveIndex(-1);
        break;
    }
  }, [items, activeIndex, scrollActiveIntoView]);

  const reset = useCallback(() => setActiveIndex(-1), []);

  return { activeIndex, setActiveIndex, handleKeyDown, reset, listRef };
}
