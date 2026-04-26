import { useTranslation } from 'react-i18next';
import { Moon, Sun, LogOut, Globe } from 'lucide-react';
import { useTheme } from '@/theme/theme-provider';
import { setLang } from '@/i18n/i18n';
import { useAuth } from '@/features/auth/AuthContext';
import { FleurDeLys } from './Logo';
import { MobileNav } from './MobileNav';
import { Link } from 'react-router-dom';

export function Header({ children }: { children?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const { me, logout } = useAuth();

  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <FleurDeLys className="h-7 w-7 text-accent" />
          <span className="hidden lg:inline">{t('app.title')}</span>
          <span className="lg:hidden">{t('app.short')}</span>
        </Link>
        <nav className="flex-1 min-w-0">
          <MobileNav>{children}</MobileNav>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            className="btn-ghost"
            title={t('common.language')}
            onClick={() => setLang(i18n.language === 'fr' ? 'en' : 'fr')}
          >
            <Globe className="h-4 w-4" />
            <span className="uppercase text-xs">{i18n.language === 'fr' ? 'EN' : 'FR'}</span>
          </button>
          <button className="btn-ghost" title={t('common.theme')} onClick={toggle}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {me && (
            <>
              <span className="hidden lg:inline text-sm text-muted-fg">{me.username}</span>
              <button className="btn-ghost" title={t('common.logout')} onClick={() => logout()}>
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
