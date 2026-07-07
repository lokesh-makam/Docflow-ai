import { simpleGit, type SimpleGit } from "simple-git";
import { Octokit } from "@octokit/rest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

/**
 * Shallow-clones a repository using a user's GitHub OAuth token.
 * Returns the local path and a cleanup function.
 */
export async function cloneRepo(
  repoFullName: string,
  token: string,
  branch: string
): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
  // Use OAuth token in the Git clone URL
  const cloneUrl = `https://x-oauth-basic:${token}@github.com/${repoFullName}.git`;

  const tmpDir = path.join(
    os.tmpdir(),
    `docflow-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  const git: SimpleGit = simpleGit();

  await git.clone(cloneUrl, tmpDir, [
    "--depth=1",
    "--single-branch",
    `--branch=${branch}`,
    "--no-tags",
  ]);

  return {
    localPath: tmpDir,
    cleanup: async () => {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Commits a file directly to the specified branch.
 */
export async function commitDirectly(options: {
  repoFullName: string;
  token: string;
  branch: string;
  path: string;
  content: string;
  message: string;
}): Promise<{ commitUrl: string; sha: string; fileUrl: string }> {
  const { repoFullName, token, branch, path: filePath, content, message } = options;
  const [owner, repo] = repoFullName.split("/");
  const octokit = new Octokit({ auth: token });

  // Get current file SHA if it exists
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });
    if (!Array.isArray(data) && data.type === "file") {
      existingSha = data.sha;
    }
  } catch {
    // File does not exist, which is fine
  }

  const { data: res } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    sha: existingSha,
  });

  return {
    commitUrl: res.commit?.html_url || "",
    sha: res.commit?.sha || "",
    fileUrl: res.content?.html_url || "",
  };
}

/**
 * Creates a new branch, commits the file to it, and opens a Pull Request upstream.
 */
export async function createPullRequest(options: {
  repoFullName: string;
  token: string;
  baseBranch: string;
  branch: string;
  path: string;
  content: string;
  message: string;
  title?: string;
  body?: string;
}): Promise<{ prUrl: string; prNumber: number }> {
  const {
    repoFullName,
    token,
    baseBranch,
    branch: targetBranch,
    path: filePath,
    content,
    message,
    title,
    body,
  } = options;
  const [owner, repo] = repoFullName.split("/");
  const octokit = new Octokit({ auth: token });

  // Get authenticated user
  const { data: user } = await octokit.rest.users.getAuthenticated();

  // 1. Get base branch SHA from base branch
  const { data: baseBranchData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseBranchData.object.sha;

  // 2. Check if user owns the repo, otherwise fork it
  const userOwnsRepo = user.login.toLowerCase() === owner.toLowerCase();

  let commitOwner = owner;
  let commitRepo = repo;
  let prHead = targetBranch;

  if (userOwnsRepo) {
    // Create target branch directly
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${targetBranch}`,
      sha: baseSha,
    });
  } else {
    // Fork the repo
    const { data: fork } = await octokit.rest.repos.createFork({ owner, repo });
    commitOwner = fork.owner.login;
    commitRepo = fork.name;
    prHead = `${commitOwner}:${targetBranch}`;

    // Wait for the fork to be ready (up to 10 seconds, retrying branch creation)
    await new Promise((resolve) => setTimeout(resolve, 4000));
    for (let i = 0; i < 4; i++) {
      try {
        await octokit.rest.git.createRef({
          owner: commitOwner,
          repo: commitRepo,
          ref: `refs/heads/${targetBranch}`,
          sha: baseSha,
        });
        break;
      } catch (err) {
        if (i === 3) throw err;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  }

  // 3. Commit to target branch
  let existingSha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: commitOwner,
      repo: commitRepo,
      path: filePath,
      ref: targetBranch,
    });
    if (!Array.isArray(data) && data.type === "file") {
      existingSha = data.sha;
    }
  } catch {
    // File doesn't exist
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: commitOwner,
    repo: commitRepo,
    path: filePath,
    message,
    content: Buffer.from(content).toString("base64"),
    branch: targetBranch,
    sha: existingSha,
  });

  // 4. Create pull request upstream
  const prTitle = title || `📚 DocFlow AI: Update README`;
  const prBody = body || `## 📚 DocFlow AI — Automated Documentation Update\n\nThis PR was automatically generated by **DocFlow AI** on behalf of @${user.login}.\n\n- Updated file: \`${filePath}\``;

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: prHead,
    base: baseBranch,
  });

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
  };
}
