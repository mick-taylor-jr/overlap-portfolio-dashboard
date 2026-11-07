import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '@/lib/cache/breaker';
import { ProviderError } from '@/lib/providers/types';

const fail = () => Promise.reject(new ProviderError('x', 'boom', 'unavailable'));
const ok = () => Promise.resolve('ok');

describe('CircuitBreaker', () => {
  it('opens after N consecutive failures, fails fast, half-opens after cooldown, closes on success', async () => {
    let t = 0;
    const b = new CircuitBreaker('x', { threshold: 3, cooldownMs: 1000, now: () => t });
    for (let i = 0; i < 3; i++) await expect(b.exec(fail)).rejects.toThrow('boom');
    expect(b.state).toBe('open');
    let called = false;
    await expect(b.exec(async () => ((called = true), 'x'))).rejects.toMatchObject({ kind: 'circuit_open' });
    expect(called).toBe(false);
    t = 1000;
    expect(b.state).toBe('half-open');
    await expect(b.exec(ok)).resolves.toBe('ok');
    expect(b.state).toBe('closed');
    expect(b.lastSuccessAt).toBeDefined();
  });

  it('a failed half-open trial re-opens immediately', async () => {
    let t = 0;
    const b = new CircuitBreaker('x', { threshold: 2, cooldownMs: 500, now: () => t });
    await expect(b.exec(fail)).rejects.toThrow();
    await expect(b.exec(fail)).rejects.toThrow();
    t = 600;
    expect(b.state).toBe('half-open');
    await expect(b.exec(fail)).rejects.toThrow('boom');
    expect(b.state).toBe('open');
  });

  it('success resets the consecutive-failure count; not_found does not count', async () => {
    const b = new CircuitBreaker('x', { threshold: 2 });
    await expect(b.exec(fail)).rejects.toThrow();
    await b.exec(ok);
    await expect(b.exec(fail)).rejects.toThrow();
    expect(b.state).toBe('closed');
    const nf = () => Promise.reject(new ProviderError('x', 'nope', 'not_found'));
    for (let i = 0; i < 5; i++) await expect(b.exec(nf)).rejects.toThrow();
    expect(b.state).toBe('closed');
  });
});
