'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { THEME_KEY, type ThemePref } from './theme';

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = pref;
}

function readPref(): ThemePref {
  if (typeof document === 'undefined') return 'system';
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match system theme', Icon: Monitor },
];

export function ThemeToggle() {
  // The inline head script already set data-theme before hydration; start from 'system' on the
  // server and sync after mount so the markup matches.
  const [pref, setPref] = useState<ThemePref>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the pre-paint script
    setPref(readPref());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const choose = (v: ThemePref) => {
    setPref(v);
    apply(v);
    try {
      localStorage.setItem(THEME_KEY, v);
    } catch {
      /* preference just won't persist */
    }
  };

  return (
    <div role="radiogroup" aria-label="Color theme" className="inline-flex rounded-md border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = mounted && pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={cn('inline-flex size-7 items-center justify-center rounded text-muted-foreground', on ? 'bg-muted text-foreground' : 'hover:text-foreground')}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
