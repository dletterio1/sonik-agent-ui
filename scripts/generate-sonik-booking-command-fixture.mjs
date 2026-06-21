import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCommandArtifactsFromOpenApi } from "../packages/command-generator/src/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const documentPath = resolve(root, "tests/fixtures/sonik-booking/booking-openapi.fixture.json");
const configPath = resolve(root, "tests/fixtures/sonik-booking/generator.config.json");
const outputPath = resolve(root, "tests/fixtures/generated/sonik-booking-command-artifacts.generated.json");

const document = JSON.parse(await readFile(documentPath, "utf8"));
const config = JSON.parse(await readFile(configPath, "utf8"));
const artifacts = generateCommandArtifactsFromOpenApi({ document, config });
const operationCount = Object.values(document.paths ?? {}).reduce((count, pathItem) => count + Object.keys(pathItem ?? {}).filter((method) => ["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())).length, 0);

const output = {
  version: "sonik-agent-ui.generated-command-artifacts.v1",
  generatedAt: config.generatedAt,
  source: document["x-fixture-provenance"],
  summary: {
    operationCount,
    commandCount: artifacts.catalog.commands.length,
    familyCount: artifacts.registry.families.length,
    cliProjectionCount: artifacts.projections.cli?.commands.length ?? 0,
    mcpProjectionCount: artifacts.projections.mcp?.commands.length ?? 0,
  },
  manifest: artifacts.manifest,
  registry: artifacts.registry,
  catalog: artifacts.catalog,
  projections: artifacts.projections,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
console.log(JSON.stringify(output.summary));
