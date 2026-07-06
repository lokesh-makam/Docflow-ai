import type { DatabaseInfo } from "@docflow/shared";
import * as fs from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

const DB_PATTERNS: Array<{
  type: DatabaseInfo["type"];
  orm?: DatabaseInfo["orm"];
  patterns: RegExp[];
}> = [
  // Prisma — check schema first
  {
    type: "postgres",
    orm: "prisma",
    patterns: [/provider\s*=\s*"postgresql"/],
  },
  {
    type: "mysql",
    orm: "prisma",
    patterns: [/provider\s*=\s*"mysql"/],
  },
  {
    type: "sqlite",
    orm: "prisma",
    patterns: [/provider\s*=\s*"sqlite"/],
  },
  {
    type: "mongodb",
    orm: "prisma",
    patterns: [/provider\s*=\s*"mongodb"/],
  },
  // Mongoose
  {
    type: "mongodb",
    orm: "mongoose",
    patterns: [/mongoose\.connect\s*\(/, /require\(['"]mongoose['"]\)/],
  },
  // MySQL
  {
    type: "mysql",
    orm: "none",
    patterns: [/mysql\.createConnection\s*\(/, /mysql2\.createConnection/],
  },
  // PostgreSQL (node-postgres)
  {
    type: "postgres",
    orm: "none",
    patterns: [/new\s+Pool\s*\(/, /new\s+Client\s*\(\s*{/, /require\(['"]pg['"]\)/],
  },
  // Redis
  {
    type: "redis",
    orm: "none",
    patterns: [/redis\.createClient\s*\(/, /new\s+Redis\s*\(/, /require\(['"]ioredis['"]\)/],
  },
  // TypeORM
  {
    type: "postgres",
    orm: "typeorm",
    patterns: [/createConnection\s*\(/, /@Entity\s*\(/, /DataSource\s*\(/],
  },
  // Sequelize
  {
    type: "postgres",
    orm: "sequelize",
    patterns: [/new\s+Sequelize\s*\(/],
  },
  // Drizzle
  {
    type: "postgres",
    orm: "drizzle",
    patterns: [/drizzle\s*\(/, /from\s+['"]drizzle-orm/],
  },
  // SQLAlchemy (Python)
  {
    type: "postgres",
    orm: "none",
    patterns: [/create_engine\s*\(/, /from\s+sqlalchemy/],
  },
  // PyMongo
  {
    type: "mongodb",
    orm: "none",
    patterns: [/MongoClient\s*\(/, /from\s+pymongo/],
  },
];

export async function detectDatabases(repoPath: string): Promise<DatabaseInfo[]> {
  const results: DatabaseInfo[] = [];

  // 1. Check Prisma schema (most authoritative)
  const schemaPath = path.join(repoPath, "prisma", "schema.prisma");
  if (fs.existsSync(schemaPath)) {
    const content = fs.readFileSync(schemaPath, "utf8");
    for (const rule of DB_PATTERNS.filter((r) => r.orm === "prisma")) {
      if (rule.patterns.some((p) => p.test(content))) {
        results.push({ type: rule.type, orm: "prisma", schemaFile: "prisma/schema.prisma" });
      }
    }
    if (results.length > 0) return deduplicateDatabases(results);
  }

  // 2. Scan source files for connection patterns
  const sourceFiles = await glob(
    ["**/*.{ts,js,mjs,py,java,go}", "**/*.prisma"],
    {
      cwd: repoPath,
      absolute: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**", "**/vendor/**"],
    }
  );

  for (const file of sourceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const rule of DB_PATTERNS) {
      if (rule.patterns.some((p) => p.test(content))) {
        const relFile = path.relative(repoPath, file);
        results.push({
          type: rule.type,
          orm: rule.orm,
          schemaFile: relFile.endsWith(".prisma") ? relFile : undefined,
        });
      }
    }
  }

  return deduplicateDatabases(results);
}

function deduplicateDatabases(dbs: DatabaseInfo[]): DatabaseInfo[] {
  const seen = new Set<string>();
  return dbs.filter((d) => {
    const key = `${d.type}:${d.orm ?? "none"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
