import type { Request, Response, NextFunction } from "express";
import { db } from "@docflow/database";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
      };
    }
  }
}

/**
 * Auth middleware: validates the NextAuth.js session token passed via
 * the Authorization header or cookie.
 *
 * In production, replace this with a proper JWT verification against
 * the NEXTAUTH_SECRET used to sign session tokens.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken =
    req.cookies?.["next-auth.session-token"] ??
    req.cookies?.["__Secure-next-auth.session-token"] ??
    req.headers.authorization?.replace("Bearer ", "");

  if (!sessionToken) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Look up the session in the database
  const session = await db.session.findUnique({
    where: { sessionToken },
    include: { user: { select: { id: true, username: true } } },
  });

  if (!session || session.expires < new Date()) {
    res.status(401).json({ success: false, error: "Session expired" });
    return;
  }

  req.user = {
    id: session.user.id,
    username: session.user.username,
  };

  next();
}
