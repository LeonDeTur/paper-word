import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function WordTooltip({
  id,
  anchor,
  translation,
  onEnter,
  onLeave,
}: {
  id: string;
  anchor: HTMLElement;
  translation: string;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tooltip = ref.current;
    if (!tooltip) return;
    const bounds = anchor.getBoundingClientRect();
    const margin = 12;
    const left = Math.max(
      margin,
      Math.min(
        bounds.left + bounds.width / 2 - tooltip.offsetWidth / 2,
        window.innerWidth - tooltip.offsetWidth - margin,
      ),
    );
    const above = bounds.top - tooltip.offsetHeight - 8;
    const top =
      above >= margin
        ? above
        : Math.min(
            bounds.bottom + 8,
            window.innerHeight - tooltip.offsetHeight - margin,
          );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
    tooltip.style.visibility = "visible";
  }, [anchor, translation]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="word-translation"
      lang="ru"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {translation}
    </div>,
    document.body,
  );
}
