import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createRuntimeSkillIndex,
  createRuntimeSkillIndexSummary,
  getRuntimeSkillCatalog,
  learnRuntimeSkill,
  searchRuntimeSkillCatalog,
} from "../../apps/standalone-sveltekit/src/lib/server/skill-registry.ts";
import { createSkillCatalogTools } from "../../apps/standalone-sveltekit/src/lib/tools/skill-catalog.ts";

const CONTEXT_ID = "22222222-2222-4222-8222-222222222222";
const pageContext = {
  route: "/booking/bookings/booking_123",
  surface: "booking-admin",
  pageType: "event-booking-detail",
  activeEntity: { type: "booking-context", id: CONTEXT_ID, label: "Summer Jazz Night" },
  commandFamilies: ["booking", "booking-guests", "booking-reservations"],
  skillFamilies: ["booking-reservation"],
  visibleActions: ["view-availability", "create-booking"],
  authenticated: true,
  organizationId: "11111111-1111-4111-8111-111111111111",
  scopes: ["booking:read", "booking:write"],
};

const catalog = getRuntimeSkillCatalog();
assert.equal(catalog.version, "sonik-agent-ui.skill-catalog.v1");
assert.equal(catalog.provider, "sonik-agent-ui-runtime");
assert.equal(catalog.skills.length, 1, "v0 registry is deliberately seeded with one workflow skill");

const skill = catalog.skills[0];
assert.equal(skill.id, "booking.reservation.create");
assert.equal(skill.familyId, "booking-reservation");
assert.equal(skill.loadPolicy.mode, "surface-eager");
assert.deepEqual(skill.commandSequence, ["booking.get.availability", "booking.create.guest", "booking.create.booking"]);
assert.ok(skill.forbiddenUnlessExplicit.includes("booking.create.hold"), "skill encodes hold as forbidden unless explicit");
assert.ok(skill.contextHints.skillFamilies.includes("booking-reservation"), "skill can be selected by donated page skill family");
assert.ok(skill.contextHints.requiredScopes.includes("booking:write"), "skill keeps write scope requirement visible");
assert.ok(skill.metadata.successEvidence.some((line) => /Pipe B telemetry/i.test(line)), "skill requires telemetry proof");

const noAuthIndex = createRuntimeSkillIndex({ ...pageContext, authenticated: false, organizationId: null, scopes: [] });
assert.equal(noAuthIndex.skills.length, 0, "write workflow skill is hidden without trusted booking scopes");

const index = createRuntimeSkillIndex(pageContext);
assert.equal(index.skills.length, 1, "booking page context surfaces the reservation workflow skill");
assert.equal(index.skills[0].id, "booking.reservation.create");
assert.equal(index.skills[0].commandSequence.join(" > "), "booking.get.availability > booking.create.guest > booking.create.booking");

const summary = createRuntimeSkillIndexSummary(pageContext);
assert.match(summary, /Skill index sonik-agent-ui-runtime: 1\/1 loaded/);
assert.match(summary, /booking\.reservation\.create/);
assert.match(summary, /Skills teach tool usage; they do not grant approval or authorization/);

const search = searchRuntimeSkillCatalog({ query: "create reservation", context: pageContext });
assert.equal(search.skills[0].id, "booking.reservation.create", "reservation intent finds the reservation workflow skill");

const learned = learnRuntimeSkill({ skillId: "booking.reservation.create", aspects: ["description", "workflow", "examples", "policy", "context", "commands"] });
assert.equal(learned.ok, true);
assert.equal(learned.workflowRecipe.id, "booking.reservation.create");
assert.deepEqual(learned.commandSequence, ["booking.get.availability", "booking.create.guest", "booking.create.booking"]);
assert.ok(learned.forbiddenUnlessExplicit.includes("booking.create.hold"));
assert.ok(learned.negativeExamples[0].failIfCommandIds.includes("booking.create.hold"));

const tools = createSkillCatalogTools({
  sessionId: "session_skill_test",
  pageContext,
  hostSession: {
    source: "amplify-embedded",
    sessionId: "session_skill_test",
    userId: "user_skill_test",
    principalId: "user_skill_test",
    organizationId: pageContext.organizationId,
    authenticated: true,
    scopes: pageContext.scopes,
    metadata: {},
  },
});
const toolSearch = await tools.searchSkillCatalog.execute({ query: "book tee time", limit: 5 });
assert.equal(toolSearch.kind, "skill-catalog-search");
assert.equal(toolSearch.skills[0].id, "booking.reservation.create");

const toolLearn = await tools.learnSkill.execute({ skillId: "booking.reservation.create", aspects: ["workflow", "commands", "policy"] });
assert.equal(toolLearn.kind, "skill-learn");
assert.equal(toolLearn.ok, true);
assert.deepEqual(toolLearn.commandSequence, ["booking.get.availability", "booking.create.guest", "booking.create.booking"]);

const agentSource = await readFile("apps/standalone-sveltekit/src/lib/agent.ts", "utf8");
assert.equal(agentSource.includes("createSkillCatalogTools"), true, "agent runtime mounts skill catalog tools");
assert.equal(agentSource.includes("searchSkillCatalog/learnSkill"), true, "base prompt teaches workflow discovery before command execution");

const generateSource = await readFile("apps/standalone-sveltekit/src/routes/api/generate/+server.ts", "utf8");
assert.equal(generateSource.includes("CONTEXT-RELEVANT SKILL STARTUP INDEX"), true, "generate route injects compact skill startup context");
assert.equal(generateSource.includes("api.generate.skill_index_context"), true, "generate route emits skill-index telemetry");

console.log(JSON.stringify({
  ok: true,
  skillId: skill.id,
  commandSequence: skill.commandSequence,
  indexedSkillCount: index.skills.length,
}));
