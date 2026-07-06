import type { Context } from "probot";
import { db } from "@docflow/database";

/** Handles GitHub App installation and repository access events */
export async function handleInstallationEvent(
  context: Context<"installation"> | Context<"installation_repositories">
) {
  const payload = context.payload as {
    installation: {
      id: number;
      account: { login: string; type: string };
      app_id: number;
      target_type: string;
    };
    repositories?: Array<{ id: number; full_name: string; private: boolean }>;
    repositories_added?: Array<{ id: number; full_name: string; private: boolean }>;
  };

  const { installation } = payload;
  context.log.info(
    `[installation] ${installation.account.login} (id: ${installation.id})`
  );

  // Upsert the installation record
  const dbInstallation = await db.installation.upsert({
    where: { githubInstallationId: installation.id },
    create: {
      githubInstallationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      appId: installation.app_id,
      targetType: installation.target_type,
      suspended: false,
    },
    update: {
      accountLogin: installation.account.login,
      suspended: false,
    },
  });

  // Sync newly accessible repositories
  const repos = payload.repositories ?? payload.repositories_added ?? [];

  for (const repo of repos) {
    await db.repository.upsert({
      where: { githubRepoId: repo.id },
      create: {
        githubRepoId: repo.id,
        fullName: repo.full_name,
        installationId: dbInstallation.id,
        enabled: false, // User must explicitly enable via dashboard
        trackedBranch: "main",
      },
      update: {
        fullName: repo.full_name,
        installationId: dbInstallation.id,
      },
    });
  }

  context.log.info(
    `[installation] Synced ${repos.length} repos for installation ${installation.id}`
  );
}
