//**
// middleware.ts
// Session refresh + route guard: unauthenticated -> /, authenticated / -> /home
//**
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session cookie when expired; also gives us the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith("/auth"));

  if (!user && !isPublic && !path.startsWith("/api")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (user && path === "/") {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login-bg.jpg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
