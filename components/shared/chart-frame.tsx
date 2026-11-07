'use client';

import { useState, type ReactNode } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Every chart sits in one of these: title, description, coverage note, and a "Show as table"
 * toggle so the same data is always available as text.
 */
export function ChartFrame({
  title,
  description,
  coverage,
  actions,
  chart,
  table,
  footer,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  coverage?: ReactNode;
  actions?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  footer?: ReactNode;
  className?: string;
  id?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className} id={id}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <Button variant="outline" size="xs" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
            {asTable ? 'Show as chart' : 'Show as table'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {coverage ? <div className="mb-3">{coverage}</div> : null}
        {asTable ? table : chart}
        {footer ? <div className="mt-3">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
