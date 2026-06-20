import assert from "node:assert/strict";
import { sanitizeAgentTelemetry } from "../../apps/standalone-sveltekit/src/lib/server/agent-telemetry.ts";
import { instrumentGenerateStream } from "../../apps/standalone-sveltekit/src/lib/server/stream-telemetry.ts";


{
  const payload = sanitizeAgentTelemetry({
    source: "server",
    event: "api.generate.command_index_context",
    commandFamilies: ["a".repeat(3_000), "campaign", "", 42, ...Array.from({ length: 12 }, (_, index) => `family-${index}`)],
    skillFamilies: ["skill", "b".repeat(3_000)],
    ok: true,
  });

  assert.equal(payload.commandFamilies?.length, 8, "telemetry command family hints should be bounded and empty/non-string entries dropped");
  assert.equal(payload.commandFamilies?.[0].length, 2_001, "telemetry command family hints should truncate long entries with ellipsis");
  assert.equal(payload.commandFamilies?.[1], "campaign");
  assert.deepEqual(payload.skillFamilies?.map((entry) => entry.length), [5, 2_001], "telemetry skill family hints should be individually truncated");
}

async function readAll(stream) {
  const reader = stream.getReader();
  const values = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return values;
    values.push(value);
  }
}

{
  const events = [];
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("a");
      controller.enqueue("b");
      controller.close();
    },
  });

  const values = await readAll(instrumentGenerateStream(stream, { requestId: "req-ok", startedAt: Date.now() }, async (event) => {
    events.push(event);
  }));

  assert.deepEqual(values, ["a", "b"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "api.generate.stream_finished");
  assert.equal(events[0].ok, true);
}

{
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("still-delivered");
      controller.close();
    },
  });

  const values = await readAll(instrumentGenerateStream(stream, { requestId: "req-telemetry-fails", startedAt: Date.now() }, async () => {
    throw new Error("telemetry disk unavailable");
  }));

  assert.deepEqual(values, ["still-delivered"], "telemetry write failures must not break successful streams");
}

{
  const events = [];
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new Error("upstream exploded"));
    },
  });

  await assert.rejects(
    readAll(instrumentGenerateStream(stream, { requestId: "req-fail", startedAt: Date.now() }, async (event) => {
      events.push(event);
    })),
    /upstream exploded/,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].event, "api.generate.stream_failed");
  assert.equal(events[0].ok, false);
  assert.equal(events[0].error, "upstream exploded");
}

{
  const events = [];
  let cancelReason;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue("first");
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });

  const reader = instrumentGenerateStream(stream, { requestId: "req-cancel", startedAt: Date.now() }, async (event) => {
    events.push(event);
  }).getReader();
  const first = await reader.read();
  assert.equal(first.value, "first");
  await reader.cancel("manual-stop");

  assert.equal(cancelReason, "manual-stop");
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "api.generate.stream_cancelled");
  assert.equal(events[0].ok, false);
}

console.log("stream-telemetry tests passed");
