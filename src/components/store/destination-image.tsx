'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/components/ui/cn';

/**
 * Destination photography with a guaranteed fallback (design-solution §8.2).
 *
 * The only Client Component in the storefront: `onError` cannot run on the server. When
 * the remote image fails, a `sand` panel with the flag emoji and the destination name is
 * shown instead of a broken image, so no page can render with a browser error icon.
 *
 * `fill` requires the wrapper to be positioned; every caller passes an aspect ratio so
 * the space is reserved before the image loads (CLS < 0.1).
 */
export function DestinationImage({
  src,
  alt,
  emoji,
  name,
  priority = false,
  aspect = 'aspect-[4/3]',
  sizes = '100vw',
  className,
}: {
  src: string;
  alt: string;
  emoji: string | null;
  name: string;
  priority?: boolean;
  aspect?: string;
  sizes?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('relative w-full overflow-hidden rounded-md bg-sand', aspect, className)}>
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-sand p-4 text-center">
          <span aria-hidden="true" className="text-3xl leading-none">
            {emoji ?? '🌍'}
          </span>
          <span className="text-xs font-medium text-ink-muted">{name}</span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      )}
    </div>
  );
}
