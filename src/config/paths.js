"use strict";

const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");

function readEnvString(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolvePath(baseDir, value) {
  if (!value) return "";
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(baseDir, value);
}

function resolveAppPaths(env = process.env) {
  const instanceDirRaw = readEnvString(env, ["QRAGY_INSTANCE_DIR", "INSTANCE_DIR"]);
  const instanceDir = instanceDirRaw ? resolvePath(process.cwd(), instanceDirRaw) : "";
  const rootDir = instanceDir || REPO_ROOT;

  const agentDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_AGENT_DIR", "AGENT_DIR"]) || path.join(rootDir, "agent")
  );
  const topicsDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_TOPICS_DIR", "TOPICS_DIR"]) || path.join(agentDir, "topics")
  );
  const memoryDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_MEMORY_DIR", "MEMORY_DIR"]) || path.join(rootDir, "memory")
  );
  const dataDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_DATA_DIR", "DATA_DIR"]) || path.join(rootDir, "data")
  );
  const uploadsDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_UPLOADS_DIR", "UPLOADS_DIR"]) || path.join(dataDir, "uploads")
  );
  const lanceDbPath = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_LANCEDB_DIR", "LANCE_DB_PATH"]) || path.join(dataDir, "lancedb")
  );
  const publicDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_PUBLIC_DIR", "PUBLIC_DIR"]) || path.join(rootDir, "public")
  );
  const envDir = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_ENV_DIR", "ENV_DIR"]) || rootDir
  );
  const knowledgeBaseCsvFile = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_KNOWLEDGE_BASE_CSV", "KNOWLEDGE_BASE_CSV"]) ||
      path.join(dataDir, "knowledge_base.csv")
  );
  const knowledgeBaseExampleFile = resolvePath(
    rootDir,
    readEnvString(env, ["QRAGY_KNOWLEDGE_BASE_EXAMPLE_CSV", "KNOWLEDGE_BASE_EXAMPLE_CSV"]) ||
      path.join(rootDir, "knowledge_base.example.csv")
  );

  return {
    repoRoot: REPO_ROOT,
    rootDir,
    instanceDir: instanceDir || null,
    agentDir,
    topicsDir,
    memoryDir,
    dataDir,
    uploadsDir,
    lanceDbPath,
    publicDir,
    bundledPublicDir: path.join(REPO_ROOT, "public"),
    bundledAdminV2Dir: path.join(REPO_ROOT, "public", "admin-v2"),
    envDir,
    knowledgeBaseCsvFile,
    knowledgeBaseExampleFile,
    openApiFile: path.join(REPO_ROOT, "openapi.json"),
  };
}

module.exports = { resolveAppPaths, REPO_ROOT };
