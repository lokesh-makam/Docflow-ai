import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@docflow/database";
import { decrypt } from "@docflow/shared";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user?.accessToken) {
      return NextResponse.json({ error: "GitHub token not found" }, { status: 401 });
    }

    const token = decrypt(user.accessToken);

    // Fetch all repos from GitHub (handles pagination)
    let allRepos: any[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub API error ${res.status}: ${body}`);
      }

      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      allRepos = allRepos.concat(batch);
      if (batch.length < 100) break;
      page++;
    }

    const repos = allRepos.map((r: any) => ({
      id: r.id,
      name: r.name,
      owner: r.owner.login,
      fullName: r.full_name,
      description: r.description || null,
      language: r.language || null,
      stars: r.stargazers_count,
      forks: r.forks_count,
      private: r.private,
      updatedAt: r.updated_at,
      defaultBranch: r.default_branch,
      topics: r.topics ?? [],
      size: r.size,
      url: r.html_url,
    }));

    return NextResponse.json({ repos });
  } catch (err: any) {
    console.error("[repos] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch repositories: " + err.message },
      { status: 500 }
    );
  }
}
