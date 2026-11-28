'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { signInAction, type LoginState } from './actions';

const INITIAL: LoginState = { status: 'idle' };

/**
 * Admin sign-in form. Presentational + form state only: the credential check lives in the
 * Server Action, and the failure text is the generic one produced there.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="username"
        required
        disabled={pending}
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        disabled={pending}
      />

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" loading={pending} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
