import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center ${className}`}>
      {icon && <div className="rounded-full bg-muted p-3 text-muted-fg">{icon}</div>}
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-fg">{description}</p>}
      </div>
      {action}
    </div>
  );
}
