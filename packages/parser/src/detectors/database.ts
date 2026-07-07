import type { DatabaseInfo, PrismaSchemaInfo, PrismaModel, PrismaModelField } from "@docflow/shared";
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
    const prismaSchema = parsePrismaSchema(content);
    for (const rule of DB_PATTERNS.filter((r) => r.orm === "prisma")) {
      if (rule.patterns.some((p) => p.test(content))) {
        results.push({
          type: rule.type,
          orm: "prisma",
          schemaFile: "prisma/schema.prisma",
          prismaSchema,
        });
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
        const isPrisma = relFile.endsWith(".prisma");
        const prismaSchema = isPrisma ? parsePrismaSchema(content) : undefined;
        results.push({
          type: rule.type,
          orm: rule.orm,
          schemaFile: isPrisma ? relFile : undefined,
          prismaSchema,
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

/**
 * Parses a Prisma schema file and extracts models and relationships.
 */
export function parsePrismaSchema(content: string): PrismaSchemaInfo {
  const models: PrismaModel[] = [];
  const relations: Array<{ from: string; to: string; fields: string[]; references: string[] }> = [];

  // Split by "model" keyword using boundary checking
  const modelBlocks = content.split(/\bmodel\s+/);
  for (let i = 1; i < modelBlocks.length; i++) {
    const block = modelBlocks[i];
    const match = /^(\w+)\s*\{([\s\S]*?)\}/.exec(block.trim());
    if (!match) continue;

    const modelName = match[1];
    const fieldsBlock = match[2];
    const fields: PrismaModelField[] = [];

    const lines = fieldsBlock.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fieldParts = trimmed.split(/\s+/);
      if (fieldParts.length < 2) continue;

      const fieldName = fieldParts[0];
      const fieldType = fieldParts[1];

      const isId = trimmed.includes("@id");
      const isUnique = trimmed.includes("@unique");

      let relation: PrismaModelField["relation"] | undefined;

      const relMatch = /@relation\(([^)]+)\)/.exec(trimmed);
      if (relMatch) {
        const relParams = relMatch[1];
        const fieldsMatch = /fields:\s*\[([^\]]+)\]/.exec(relParams);
        const refsMatch = /references:\s*\[([^\]]+)\]/.exec(relParams);

        const relFields = fieldsMatch ? fieldsMatch[1].split(",").map(f => f.trim()) : [];
        const relRefs = refsMatch ? refsMatch[1].split(",").map(r => r.trim()) : [];

        relation = {
          fields: relFields,
          references: relRefs,
          to: fieldType.replace("?", "").replace("[]", ""),
        };

        relations.push({
          from: modelName,
          to: relation.to,
          fields: relFields,
          references: relRefs,
        });
      }

      fields.push({
        name: fieldName,
        type: fieldType,
        isId,
        isUnique,
        relation,
      });
    }

    models.push({
      name: modelName,
      fields,
    });
  }

  return { models, relations };
}
