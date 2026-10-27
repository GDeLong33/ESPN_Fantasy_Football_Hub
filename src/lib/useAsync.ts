import { useEffect, useState } from 'react';
import { useReportSample } from './sample';
import { loadData, type Loaded } from './data';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; value: T };

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fn().then(
      (value) => !cancelled && setState({ status: 'ready', value }),
      (err: unknown) =>
        !cancelled && setState({ status: 'error', error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Load a JSON data file and flag the page-level sample banner if a fixture was used. */
export function useData<T>(name: string): AsyncState<Loaded<T>> {
  const state = useAsync(() => loadData<T>(name), [name]);
  const report = useReportSample();
  const isSample = state.status === 'ready' && state.value.sample;
  useEffect(() => {
    if (isSample) report(name);
  }, [isSample, name, report]);
  return state;
}
