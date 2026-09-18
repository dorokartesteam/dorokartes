import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Dorokartes Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;

  // Fail closed in production if credentials are missing.
  if (process.env.NODE_ENV === "production" && (!user || !password)) {
    return new NextResponse("Admin protection is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // In local development, allow access when credentials are not configured.
  if (!user || !password) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();

    const suppliedUser = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);

    if (suppliedUser !== user || suppliedPassword !== password) {
      return unauthorized();
    }

    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
