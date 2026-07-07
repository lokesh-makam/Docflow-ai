import type { AuthInfo } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

const AUTH_LIBRARY_MAP: Array<{ library: string; type: string; pattern: RegExp }> = [
  { library: "jsonwebtoken", type: "JWT", pattern: /require\(['"]jsonwebtoken['"]\)|from ['"]jsonwebtoken['"]/ },
  { library: "passport", type: "OAuth/Session", pattern: /require\(['"]passport['"]\)|from ['"]passport['"]/ },
  { library: "next-auth", type: "OAuth (NextAuth)", pattern: /from ['"]next-auth|require\(['"]next-auth['"]\)/ },
  { library: "@auth/core", type: "OAuth (Auth.js)", pattern: /from ['"]@auth\/core/ },
  { library: "firebase-admin", type: "Firebase Auth", pattern: /from ['"]firebase-admin|require\(['"]firebase-admin['"]\)/ },
  { library: "@supabase/supabase-js", type: "Supabase Auth", pattern: /supabase\.auth\.|createClient/ },
  { library: "@clerk/nextjs", type: "Clerk Auth", pattern: /from ['"]@clerk\/nextjs|clerkMiddleware/ },
  { library: "lucia", type: "Session (Lucia)", pattern: /from ['"]lucia|new Lucia/ },
  { library: "better-auth", type: "BetterAuth", pattern: /from ['"]better-auth/ },
  { library: "express-jwt", type: "JWT (express-jwt)", pattern: /require\(['"]express-jwt['"]\)|from ['"]express-jwt['"]/ },
  { library: "bcrypt", type: "Password Hashing", pattern: /require\(['"]bcrypt['"]\)|from ['"]bcrypt['"]/ },
  { library: "argon2", type: "Password Hashing (Argon2)", pattern: /require\(['"]argon2['"]\)|from ['"]argon2['"]/ },
  // Python
  { library: "python-jose", type: "JWT (Python)", pattern: /from jose import|import jose/ },
  { library: "python-dotenv", type: "Env Auth", pattern: /from dotenv import/ },
  { library: "authlib", type: "OAuth (Authlib)", pattern: /from authlib import|import authlib/ },
  // Java/Spring
  { library: "spring-security", type: "Spring Security", pattern: /org\.springframework\.security/ },
  { library: "jwt-java", type: "JWT (Java)", pattern: /io\.jsonwebtoken/ },
  // Go
  { library: "golang-jwt/jwt", type: "JWT (Go)", pattern: /golang-jwt\/jwt/ },
  { library: "gorilla/sessions", type: "Session (Go)", pattern: /gorilla\/sessions/ },
];

export async function detectAuth(repoPath: string): Promise<AuthInfo[]> {
  const results: AuthInfo[] = [];

  // 1. Check package.json for declared auth dependencies
  const pkgPath = path.join(repoPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const { library, type } of AUTH_LIBRARY_MAP) {
        if (library in allDeps) {
          results.push({ type, library });
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  // 2. If nothing found in package.json, scan source files
  if (results.length === 0) {
    const sourceFiles = await glob(["**/*.{ts,js,py,java,go}", "requirements.txt", "go.mod"], {
      cwd: repoPath,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/build/**"],
    });

    for (const file of sourceFiles) {
      let content: string;
      try {
        content = fs.readFileSync(file, "utf8");
      } catch {
        continue;
      }

      for (const { library, type, pattern } of AUTH_LIBRARY_MAP) {
        if (pattern.test(content) && !results.some((r) => r.library === library)) {
          results.push({ type, library });
        }
      }
    }
  }

  return results;
}
