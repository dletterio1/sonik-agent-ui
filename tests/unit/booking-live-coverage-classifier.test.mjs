import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeBindings = JSON.parse(await readFile("tests/fixtures/generated/sonik-booking-runtime-bindings.generated.json", "utf8"));
const coverage = JSON.parse(await readFile("tests/fixtures/sonik-booking/pipeb-live-all72-coverage.fixture.json", "utf8"));

const bindingIds = runtimeBindings.bindings.map((binding) => binding.commandId).sort();
const coveredIds = [...coverage.successCommandIds, ...coverage.failedCommandIds].sort();
const failed = new Set(coverage.failedCommandIds);
const knownBlocked = new Set(coverage.knownBlockers.flatMap((blocker) => blocker.commands));
const knownMissingRest = coverage.knownBlockers.filter((blocker) => blocker.kind === "missing-rest-route-group").flatMap((blocker) => blocker.commands);

assert.equal(coverage.schemaVersion, "sonik.agent_ui.test.booking_live_coverage_fixture.v1");
assert.equal(coverage.environment, "pipe_b");
assert.match(coverage.sourceEvidenceFile, /^\.omx\/logs\/pipeb-all72-20260629171926-live-all72-booking-commands-fixture-v2\.json$/, "fixture names the exact Pipe B source evidence artifact");
assert.match(coverage.sourceEvidenceSha256, /^[a-f0-9]{64}$/, "fixture records a stable SHA-256 of the Pipe B source evidence artifact");
assert.equal(runtimeBindings.summary.commandCount, 72, "generated runtime still owns the full 72-command surface");
assert.deepEqual(coveredIds, bindingIds, "live coverage fixture must classify every generated runtime command exactly once");
assert.equal(coverage.commandCount, runtimeBindings.summary.commandCount, "coverage count matches generated runtime count");
assert.equal(coverage.successCommandIds.length, 37, "Pipe B live proof currently has 37 successful generated commands");
assert.equal(coverage.failedCommandIds.length, 35, "Pipe B live proof currently has 35 non-success commands");
assert.equal(coverage.failedCommandIds.length > 0, true, "non-zero failures must not be reported as all-72 PASS");
assert.equal(coverage.failedCommandIds.every((commandId) => knownBlocked.has(commandId)), true, "every live failure must have an explicit known blocker classification");
assert.equal(knownMissingRest.every((commandId) => failed.has(commandId)), true, "missing REST route groups remain service blockers until mounted or demoted");
assert.equal(failed.has("booking.create.hold"), false, "create-hold principal injection regression is fixed in the live coverage baseline");
assert.equal(failed.has("booking.get.hold"), false, "hold read remains live-proven");
assert.equal(failed.has("booking.extend.hold"), false, "hold extension remains live-proven");
assert.equal(failed.has("booking.release.hold"), false, "hold release remains live-proven");

console.log(JSON.stringify({
  ok: true,
  commandCount: coverage.commandCount,
  successes: coverage.successCommandIds.length,
  failures: coverage.failedCommandIds.length,
  blockerCount: coverage.knownBlockers.length,
}));
