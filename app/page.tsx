import { SiteHeader } from '@/components/shell/site-header';
import { Providers } from '@/components/shell/providers';
import { Dashboard } from '@/components/dashboard/dashboard';

export default function Home() {
  return (
    <Providers>
      <SiteHeader current="app" />
      <main id="main" className="flex-1">
        <h1 className="sr-only">Overlap portfolio dashboard</h1>
        <Dashboard />
      </main>
    </Providers>
  );
}
