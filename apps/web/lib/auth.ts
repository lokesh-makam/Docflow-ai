import GithubProvider from "next-auth/providers/github";
import { db } from "@docflow/database";
import { encrypt } from "@docflow/shared";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "repo read:user user:email",
          prompt: "select_account",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }: any) {
      if (account?.provider === "github" && account.access_token) {
        const githubId = parseInt(account.providerAccountId, 10);
        const encryptedToken = encrypt(account.access_token);
        await db.user.upsert({
          where: { githubId },
          update: {
            username: profile.login,
            displayName: profile.name ?? null,
            avatarUrl: profile.avatar_url ?? null,
            email: profile.email ?? null,
            accessToken: encryptedToken,
          },
          create: {
            githubId,
            username: profile.login,
            displayName: profile.name ?? null,
            avatarUrl: profile.avatar_url ?? null,
            email: profile.email ?? null,
            accessToken: encryptedToken,
          },
        });
      }
      return true;
    },
    async jwt({ token, account }: any) {
      if (account?.provider === "github") {
        const githubId = parseInt(account.providerAccountId, 10);
        const user = await db.user.findUnique({ where: { githubId } });
        if (user) {
          token.id = user.id;
          token.username = user.username;
          token.avatarUrl = user.avatarUrl;
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.avatarUrl = token.avatarUrl;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
