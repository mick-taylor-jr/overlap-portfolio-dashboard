'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AdvisoryFee } from '@/lib/types';
import { advisoryFeeAmount, effectiveRate, validateBrackets } from '@/lib/finance';
import { fmtRate, fmtUsd } from '@/lib/format';
import { DEFAULT_ADVISORY_TIERS } from '@/lib/portfolio/state';
import { Segmented } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/shared/number-field';

type Bracket = { upTo: number | null; rate: number };

function bracketError(b: Bracket[]): string | null {
  try {
    validateBrackets(b);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^.*?:\s*/, '') : 'Invalid brackets';
  }
}

/**
 * Advisory fee: none, flat %, or tiered by AUM with marginal brackets (each rate applies only to
 * the slice of assets inside its bracket, like income tax).
 */
export function AdvisoryEditor({ fee, onChange, aum, idPrefix }: { fee: AdvisoryFee | undefined; onChange: (f: AdvisoryFee | undefined) => void; aum: number; idPrefix: string }) {
  const kind = fee?.kind ?? 'none';
  // Draft brackets can be temporarily invalid while typing; only valid schedules are committed.
  const [draft, setDraft] = useState<Bracket[] | null>(null);
  const brackets = draft ?? (fee?.kind === 'tiered' ? fee.brackets : []);
  const err = kind === 'tiered' ? bracketError(brackets) : null;

  const setBrackets = (b: Bracket[]) => {
    const e = bracketError(b);
    if (e) setDraft(b);
    else {
      setDraft(null);
      onChange({ kind: 'tiered', brackets: b });
    }
  };

  let summary: string | null = null;
  if (fee && !err && aum > 0) {
    try {
      summary = `${fmtUsd(advisoryFeeAmount(aum, fee))} a year on ${fmtUsd(aum)}, an effective ${fmtRate(effectiveRate(aum, fee))}.`;
    } catch {
      summary = null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Advisory fee type"
        value={kind}
        onValueChange={(k) => {
          setDraft(null);
          if (k === 'none') onChange(undefined);
          else if (k === 'flat') onChange({ kind: 'flat', rate: fee?.kind === 'flat' ? fee.rate : 0.01 });
          else onChange(fee?.kind === 'tiered' ? fee : DEFAULT_ADVISORY_TIERS);
        }}
        options={[
          { value: 'none', label: 'None' },
          { value: 'flat', label: 'Flat' },
          { value: 'tiered', label: 'Tiered by AUM' },
        ]}
      />
      {fee?.kind === 'flat' ? (
        <NumberField
          id={`${idPrefix}-flat`}
          className="w-36"
          label="Annual rate on all assets"
          kind="percent"
          value={fee.rate}
          min={0}
          max={0.1}
          onChange={(v) => v !== null && onChange({ kind: 'flat', rate: v })}
        />
      ) : null}
      {kind === 'tiered' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Marginal brackets: each rate applies only to assets within its band.</p>
          <ol className="flex flex-col gap-2">
            {brackets.map((b, i) => {
              const last = i === brackets.length - 1;
              const from = i === 0 ? 0 : (brackets[i - 1].upTo ?? 0);
              return (
                <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  {last ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Band</span>
                      <span className="flex h-9 items-center text-[13px] text-muted-foreground">Above {fmtUsd(from)}</span>
                    </div>
                  ) : (
                    <NumberField
                      label={i === 0 ? 'Up to' : `${fmtUsd(from)} up to`}
                      kind="usd"
                      value={b.upTo}
                      min={1}
                      onChange={(v) => v !== null && setBrackets(brackets.map((x, j) => (j === i ? { ...x, upTo: v } : x)))}
                    />
                  )}
                  <NumberField
                    label="Rate"
                    kind="percent"
                    value={b.rate}
                    min={0}
                    max={0.1}
                    onChange={(v) => v !== null && setBrackets(brackets.map((x, j) => (j === i ? { ...x, rate: v } : x)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove bracket ${i + 1}`}
                    disabled={brackets.length <= 1}
                    onClick={() => {
                      const next = brackets.filter((_, j) => j !== i);
                      next[next.length - 1] = { ...next[next.length - 1], upTo: null };
                      setBrackets(next);
                    }}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button
            variant="outline"
            size="xs"
            className="self-start"
            disabled={brackets.length >= 8}
            onClick={() => {
              const prev = brackets.slice(0, -1);
              const lastFrom = prev.length ? (prev[prev.length - 1].upTo ?? 0) : 0;
              const lastRate = brackets[brackets.length - 1]?.rate ?? 0.005;
              setBrackets([...prev, { upTo: lastFrom + 1_000_000, rate: lastRate }, { upTo: null, rate: Math.max(0, lastRate - 0.0025) }]);
            }}
          >
            <Plus aria-hidden /> Add bracket
          </Button>
          {err ? (
            <p role="alert" className="text-xs text-danger">
              Brackets must rise in order: {err}. Changes apply once they are valid.
            </p>
          ) : null}
        </div>
      ) : null}
      {summary ? <p className="num text-[13px] text-muted-foreground">{summary}</p> : null}
    </div>
  );
}
