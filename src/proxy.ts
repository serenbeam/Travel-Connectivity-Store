import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getPublicEnv } from '@/lib/env.public';
import { createFetchWithTimeout, PROXY_FETCH_TIMEOUT_MS } from '@/lib/http';
import { logWarn } from '@/lib/logger';

/**
 * Next.js 16 proxy (formerly middleware). Runtime is Node.js and cannot be changed.
 *
 * This is an EARLY, FAIL-CLOSED session gate for /admin/* only. It is NOT the
 * authorization layer: every admin Route Handler, Server Action and Server
 * Component must still call requireAdmin() (src/modules/auth/session.ts), and RLS is
 * the final layer. See docs/technical-decisions.md ADR-1 and docs/api-contract.md §5.
 *
 * Fail-closed means: missing environment, unreachable Supabase Auth, or a thrown
 * error all redirect to the login page. There is no "allow because the check failed"
 * branch.
 */
export const config = {
  matcher: ['/admin/:path*'],
};

const LOGIN_PATH = '/admin/login';

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // The login page itself must stay reachable, otherwise the redirect loops.
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return NextResponse.next();
  }

  // 1) Environment first: no Supabase object is created when it is unavailable.
  let env;
  try {
    env = getPublicEnv();
  } catch (error) {
    logWarn('proxy: public environment unavailable, failing closed', {
      path: pathname,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return redirectToLogin(request);
  }

  const response = NextResponse.next({ request });

  // 2) Session check, cancelled after PROXY_FETCH_TIMEOUT_MS (3 s).
  try {
    const supabase = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
        global: {
          fetch: createFetchWithTimeout(PROXY_FETCH_TIMEOUT_MS),
        },
      },
    );

    // getUser() validates the token against Supabase Auth; getSession() only decodes
    // a cookie and must not be used for authorization decisions.
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return redirectToLogin(request);
    }
  } catch (error) {
    logWarn('proxy: session check failed, failing closed', {
      path: pathname,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return redirectToLogin(request);
  }

  // Allowed: return the response that may carry refreshed session cookies.
  return response;
}
