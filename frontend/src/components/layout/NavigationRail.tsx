'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  Users,
  Phone,
  Radio,
  Settings,
  Sun,
  Moon,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { Avatar, Tooltip, Dropdown } from '../ui';
import { useThemeStore } from '../../stores/theme.store';
import { useAuthStore } from '../../stores/auth.store';
import { authService } from '../../services/auth.service';
import { cn } from '../../utils/cn';

/**
 * Desktop Left Navigation Rail Component.
 * 
 * 64px width fixed left sidebar providing high-level navigation
 * between Chats, Contacts, Calls, and Stories, plus user session control.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/navigation_role
 */
export function NavigationRail() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useThemeStore();
  const { user, refreshToken, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authService.logout(refreshToken);
    } catch {
      // Ignore network failures on logout
    } finally {
      logout();
      router.push('/login');
    }
  };

  const navItems = [
    {
      id: 'chats',
      label: 'Chats',
      icon: MessageSquare,
      href: '/chat',
      isActive: pathname.startsWith('/chat'),
    },
    {
      id: 'stories',
      label: 'Stories',
      icon: Radio,
      href: '/stories',
      isActive: pathname.startsWith('/stories'),
    },
    {
      id: 'calls',
      label: 'Calls',
      icon: Phone,
      href: '/calls',
      isActive: pathname.startsWith('/calls'),
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: Users,
      href: '/contacts',
      isActive: pathname.startsWith('/contacts'),
    },
  ];

  const userMenuItems = [
    {
      id: 'profile',
      label: user?.fullName || 'Profile',
      icon: <UserIcon className="w-4 h-4" />,
      onClick: () => router.push('/profile'),
    },
    {
      id: 'settings',
      label: 'Preferences',
      icon: <Settings className="w-4 h-4" />,
      onClick: () => router.push('/settings'),
    },
    {
      id: 'logout',
      label: 'Sign Out',
      icon: <LogOut className="w-4 h-4" />,
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <aside
      aria-label="Application Navigation"
      className="hidden md:flex flex-col items-center justify-between w-16 h-screen border-r border-border bg-card py-4 select-none shrink-0 z-30"
    >
      {/* Top Branding Logo */}
      <div className="flex flex-col items-center gap-6">
        <Link
          href="/chat"
          className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20 hover:scale-105 transition-all"
        >
          <MessageSquare className="w-5 h-5 fill-current" />
        </Link>

        {/* Primary Navigation Icons */}
        <nav className="flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id} content={item.label} position="right">
                <Link
                  href={item.href}
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center transition-all',
                    item.isActive
                      ? 'bg-brand-500/10 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400 font-bold'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )}
                  aria-label={item.label}
                >
                  <Icon className="w-5 h-5" />
                </Link>
              </Tooltip>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls: Theme Toggle, Settings, User Avatar */}
      <div className="flex flex-col items-center gap-3">
        {/* Quick Theme Switcher */}
        <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} position="right">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-zinc-700" />
            )}
          </button>
        </Tooltip>

        {/* User Profile Avatar with Context Menu */}
        <Dropdown
          trigger={
            <button
              type="button"
              className="rounded-full p-0.5 ring-2 ring-transparent hover:ring-brand-500/30 transition-all focus:outline-none"
              aria-label="User Account Menu"
            >
              <Avatar
                name={user?.fullName || user?.username || 'User'}
                src={user?.avatarUrl}
                size="sm"
                status="online"
              />
            </button>
          }
          items={userMenuItems}
          align="left"
        />
      </div>
    </aside>
  );
}
