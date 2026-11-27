import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = sectionRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={sectionRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="relative h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-950"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="sheet-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg px-3 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </div>
  );
}
