'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Debounced (300 ms) admin search bound to a URL parameter (design-solution §7).
 *
 * The component owns only the URL, never the query: the server re-validates the value
 * through parseOrdersSearch() and turns anything that is not an order number or an email
 * into 422. Changing the search always drops `cursor`, so page 2 of the previous result set
 * can never be requested with a new filter.
 */
export interface SearchFieldProps {
  label: string;
  basePath: string;
  paramName?: string;
  placeholder?: string;
  defaultValue?: string;
}

export function SearchField({
  label,
  basePath,
  paramName = 'q',
  placeholder,
  defaultValue = '',
}: SearchFieldProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  function schedule(next: string) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();

      if (trimmed === '') {
        params.delete(paramName);
      } else {
        params.set(paramName, trimmed);
      }

      params.delete('cursor');

      const query = params.toString();
      router.replace(query === '' ? basePath : `${basePath}?${query}`);
    }, 300);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="admin-search" className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id="admin-search"
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          schedule(event.target.value);
        }}
        className="w-full rounded-sm border border-sand bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/70 focus:border-teal"
      />
    </div>
  );
}
