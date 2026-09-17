'use client';

import { cn } from '../../utils/cn';

export interface TabOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface TabsProps {
  tabs: TabOption[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Reusable Minimalist Segmented Tabs Switcher Component.
 * 
 * Used for switching between Direct/Group chats, Contacts, and Call categories.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tab_role
 */
export function Tabs({
  tabs,
  activeTab,
  onChange,
  className,
  size = 'md',
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center p-1 rounded-xl bg-card border border-border-subtle gap-1 w-full select-none',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 cursor-pointer',
              size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm',
              isActive
                ? 'bg-surface text-txt-primary shadow-xs font-semibold'
                : 'text-txt-secondary hover:text-txt-primary hover:bg-card-hover'
            )}
          >
            {tab.icon && <span className="w-4 h-4 shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-semibold',
                  isActive
                    ? 'bg-accent text-accent-fg'
                    : 'bg-border-subtle text-txt-muted'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
