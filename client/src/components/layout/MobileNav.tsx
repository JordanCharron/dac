import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn-ghost p-1 md:hidden"
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden md:flex md:items-center md:gap-1 md:text-sm">{children}</div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute right-0 top-0 h-full w-72 bg-card border-l shadow-xl p-4 flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end">
              <button className="btn-ghost p-1" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-1 text-sm" onClick={() => setOpen(false)}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
