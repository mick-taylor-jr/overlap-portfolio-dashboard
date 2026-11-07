'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import type { AssetClass, Position, SymbolSearchResult } from '@/lib/types';
import { useSearch } from '@/lib/hooks/use-market-data';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { CRYPTO_TICKER_TO_ID, guessAssetClass, isValidSymbol, normalizeTicker } from '@/lib/portfolio/classify';
import { newId } from '@/lib/portfolio/state';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { NumberField } from '@/components/shared/number-field';
import { Sym } from '@/components/shared/symbol';
import { cn } from '@/components/ui/cn';
import { inputClass } from '@/components/ui/input';

export const CLASS_LABEL: Record<AssetClass, string> = { equity: 'Stock', fund: 'Fund', crypto: 'Crypto', cash: 'Cash' };

interface Picked {
  symbol: string;
  name: string;
  assetClass: AssetClass;
}

function fromResult(r: SymbolSearchResult): Picked {
  if (r.assetClass === 'crypto') {
    const id = /^[a-z0-9-]+$/.test(r.symbol) ? r.symbol : (CRYPTO_TICKER_TO_ID[r.symbol.toUpperCase()] ?? r.symbol.toLowerCase());
    return { symbol: id, name: r.name, assetClass: 'crypto' };
  }
  return { symbol: normalizeTicker(r.symbol), name: r.name, assetClass: r.assetClass };
}

/**
 * Add-a-position control: ARIA 1.2 combobox with a listbox popup, then an amount entered as
 * shares/units OR dollar value. Only the typed query is sent to /api/search.
 */
export function TickerSearch({ onAdd }: { onAdd: (p: Position) => void }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [mode, setMode] = useState<'shares' | 'value'>('value');
  const [amount, setAmount] = useState<number | null>(null);
  const debounced = useDebouncedValue(q, 200);
  const search = useSearch(picked ? '' : debounced);
  const results = (search.data ?? []).slice(0, 8);
  const typed = q.trim();
  // Use the live search results so a typed symbol that matches a result gets that result's class.
  const fallback = typed && !picked ? guessAssetClass(typed, results) : null;
  const showList = open && !picked && typed.length > 0;

  const choose = (p: Picked) => {
    setPicked(p);
    setQ(p.symbol);
    setOpen(false);
    setActive(-1);
    if (p.assetClass === 'cash') setMode('value');
  };

  const chooseTyped = () => {
    if (!fallback || !isValidSymbol(fallback.symbol, fallback.assetClass)) return;
    choose({ symbol: fallback.symbol, name: '', assetClass: fallback.assetClass });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && results[active]) choose(fromResult(results[active]));
      else if (results.length > 0 && results[0].symbol.toUpperCase() === typed.toUpperCase()) choose(fromResult(results[0]));
      else chooseTyped();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const reset = () => {
    setPicked(null);
    setQ('');
    setAmount(null);
    inputRef.current?.focus();
  };

  const add = () => {
    if (!picked || amount === null || !(amount > 0)) return;
    const p: Position = { id: newId(), symbol: picked.symbol, assetClass: picked.assetClass };
    if (picked.name) p.name = picked.name;
    if (mode === 'value' || picked.assetClass === 'cash') p.value = amount;
    else p.quantity = amount;
    onAdd(p);
    reset();
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="relative min-w-0 flex-1">
        <label htmlFor={`${listId}-input`} className="mb-1 block text-xs font-medium text-muted-foreground">
          Add a stock, ETF, mutual fund or crypto
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-opt-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search ticker or name, e.g. VOO or Vanguard"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKey}
            className={cn(inputClass, 'pl-8 pr-8')}
          />
          {search.isFetching && !picked ? (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />
          ) : null}
        </div>
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching securities"
            className="absolute z-40 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {results.map((r, i) => (
              <li
                key={`${r.symbol}-${r.assetClass}-${i}`}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(fromResult(r))}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px]', i === active && 'bg-muted')}
              >
                <Sym className="w-20 shrink-0">{r.symbol}</Sym>
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.exchange ? <span className="hidden text-xs text-muted-foreground sm:inline">{r.exchange}</span> : null}
                <Badge>{CLASS_LABEL[r.assetClass]}</Badge>
              </li>
            ))}
            {search.isError ? <li className="px-3 py-2 text-xs text-warning">Search is unavailable right now. Press Enter to add the ticker as typed.</li> : null}
            {!search.isFetching && !search.isError && results.length === 0 && debounced === q ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No matches. Press Enter to add the ticker as typed.</li>
            ) : null}
            {fallback && isValidSymbol(fallback.symbol, fallback.assetClass) ? (
              <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                Enter adds <Sym className="text-[11px]">{fallback.symbol}</Sym> as {CLASS_LABEL[fallback.assetClass].toLowerCase()}; you can change the class in the table.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground" id={`${listId}-mode`}>
            Enter as
          </span>
          <Segmented
            label="Enter amount as"
            value={picked?.assetClass === 'cash' ? 'value' : mode}
            onValueChange={(v) => setMode(v)}
            options={[
              { value: 'value', label: 'Dollar value' },
              { value: 'shares', label: picked?.assetClass === 'crypto' ? 'Units' : 'Shares' },
            ]}
          />
        </div>
        <NumberField
          className="w-36"
          label={mode === 'value' ? 'Value (USD)' : picked?.assetClass === 'crypto' ? 'Units' : 'Shares'}
          kind={mode === 'value' ? 'usd' : 'number'}
          value={amount}
          onChange={setAmount}
          allowEmpty
          min={0}
          placeholder={mode === 'value' ? '10,000' : '25'}
        />
        <Button onClick={add} disabled={!picked || amount === null || !(amount > 0)} aria-label={picked ? `Add ${picked.symbol}` : 'Add position'}>
          <Plus aria-hidden /> Add
        </Button>
      </div>
    </div>
  );
}
