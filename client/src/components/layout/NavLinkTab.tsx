import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export function NavLinkTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-1.5 transition-colors',
          isActive ? 'bg-muted font-medium text-fg' : 'text-muted-fg hover:bg-muted hover:text-fg',
        )
      }
    >
      {children}
    </NavLink>
  );
}
