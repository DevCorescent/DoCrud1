import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return { supabaseUrl, supabaseKey };
}

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (!config) {
    return response;
  }

  if (process.env.SUPABASE_MIDDLEWARE_DISABLED === 'true') {
    return response;
  }

  const { supabaseUrl, supabaseKey } = config;

  const timeoutMs = Number(process.env.SUPABASE_MIDDLEWARE_TIMEOUT_MS)
    || (process.env.NODE_ENV === 'development' ? 800 : 2000);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    global: { fetch: (url, init) => fetch(url, { ...init, signal: controller.signal }) },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Timeout, network error, or abort — continue without auth
  } finally {
    clearTimeout(timeoutId);
  }

  return response;
}
