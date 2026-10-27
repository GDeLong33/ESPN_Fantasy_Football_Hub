import type { ReactNode } from 'react';
import type { AsyncState } from '../lib/useAsync';

type Props<T> = {
  state: AsyncState<T>;
  loading?: ReactNode;
  children: (value: T) => ReactNode;
};

/** Renders loading and error states for a fetch, then the content. */
export function DataState<T>({ state, loading, children }: Props<T>) {
  if (state.status === 'loading') {
    return (
      <div className="state" role="status">
        {loading ?? 'Loading…'}
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="state state--error" role="alert">
        <strong>Couldn't load this.</strong> {state.error}. Try refreshing the page.
      </div>
    );
  }
  return <>{children(state.value)}</>;
}
