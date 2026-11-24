// Unit tests for the pure helpers: node --test test/helpers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { _internal } from "../index.mjs";

const { PROVIDER, PUBLIC_BASE, DEFAULT_MODEL, ZG_MODELS, resolveTarget, nativeUrl, nativeToOpenAi, openAiToNative, openAiResToNative, nativeResToOpenAi } = _internal;

test("provider id and zg's three hardcoded names", () => {
  assert.equal(PROVIDER, "zg-bailian-embed");
  assert.deepEqual(Object.keys(ZG_MODELS), [
    "qwen3.7-text-embedding",
    "text-embedding-v4",
    "qwen3-vl-embedding",
  ]);
  assert.equal(DEFAULT_MODEL, "qwen3.7-text-embedding-flash");
});

test("resolveTarget: defaults", () => {
  assert.deepEqual(resolveTarget({}, {}), { endpoint: PUBLIC_BASE, model: DEFAULT_MODEL, protocol: "openai" });
  assert.deepEqual(resolveTarget(undefined, undefined), { endpoint: PUBLIC_BASE, model: DEFAULT_MODEL, protocol: "openai" });
});

test("resolveTarget: options win, old sign-in metadata and upstream map still work", () => {
  const auth = { metadata: { baseURL: "https://ws.example.com/compatible-mode/v1/" } };
  assert.equal(resolveTarget({}, auth).endpoint, "https://ws.example.com/compatible-mode/v1");
  assert.equal(resolveTarget({ endpoint: "https://opt.example.com/v1" }, auth).endpoint, "https://opt.example.com/v1");
  assert.equal(resolveTarget({ model: "text-embedding-v4" }, {}).model, "text-embedding-v4");
  assert.equal(resolveTarget({ upstream: { "qwen3.7-text-embedding": "qwen3.7-text-embedding" } }, {}).model, "qwen3.7-text-embedding");
  assert.equal(resolveTarget({ model: "m-new", upstream: { "qwen3.7-text-embedding": "m-old" } }, {}).model, "m-new");
});

test("resolveTarget: protocol auto from the endpoint path, explicit wins", () => {
  assert.equal(resolveTarget({ endpoint: "https://dashscope.aliyuncs.com/api/v1" }, {}).protocol, "dashscope");
  assert.equal(resolveTarget({ endpoint: "https://ws.example.com/compatible-mode/v1" }, {}).protocol, "openai");
  assert.equal(resolveTarget({ endpoint: "https://my.proxy/v1" }, {}).protocol, "openai");
  assert.equal(resolveTarget({ endpoint: PUBLIC_BASE, protocol: "dashscope" }, {}).protocol, "dashscope");
  assert.equal(resolveTarget({ endpoint: "https://dashscope.aliyuncs.com/api/v1", protocol: "openai" }, {}).protocol, "openai");
});

test("nativeUrl derives or keeps the native endpoint", () => {
  assert.equal(nativeUrl(PUBLIC_BASE),
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding");
  assert.equal(nativeUrl("https://ws.example.com/compatible-mode/v1"),
    "https://ws.example.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding");
  const full = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding";
  assert.equal(nativeUrl(full), full);
});

test("nativeToOpenAi: contents/texts, dimensions", () => {
  assert.deepEqual(nativeToOpenAi({ model: "m", input: { contents: [{ text: "a" }, { image: "https://x/i.png" }] }, parameters: { dimension: 1024 } }),
    { model: "m", input: ["a", "https://x/i.png"], dimensions: 1024 });
  assert.deepEqual(nativeToOpenAi({ model: "m", input: { texts: ["a", "b"] } }), { model: "m", input: ["a", "b"] });
});

test("openAiToNative: string and array input, dimensions", () => {
  assert.deepEqual(openAiToNative({ model: "m", input: "你好" }),
    { model: "m", input: { contents: [{ text: "你好" }] } });
  assert.deepEqual(openAiToNative({ model: "m", input: ["a", "b"], dimensions: 1024 }),
    { model: "m", input: { contents: [{ text: "a" }, { text: "b" }] }, parameters: { dimension: 1024 } });
});

test("openAiResToNative: rows, index, usage", () => {
  const r = openAiResToNative({ data: [{ embedding: [0.1], index: 0 }, { embedding: [0.2], index: 1 }], usage: { total_tokens: 5 } }, "m");
  assert.deepEqual(r.output.embeddings, [
    { embedding: [0.1], index: 0, text_index: 0 },
    { embedding: [0.2], index: 1, text_index: 1 },
  ]);
  assert.deepEqual(r.usage, { total_tokens: 5 });
  assert.deepEqual(openAiResToNative({}, "m").output.embeddings, []);
});

test("nativeResToOpenAi: rows, index fallback, usage", () => {
  const r = nativeResToOpenAi({
    output: { embeddings: [{ embedding: [0.1, 0.2], text_index: 0 }, { embedding: [0.3], index: 1 }] },
    usage: { total_tokens: 7 },
  }, "m");
  assert.equal(r.object, "list");
  assert.deepEqual(r.data, [
    { object: "embedding", index: 0, embedding: [0.1, 0.2] },
    { object: "embedding", index: 1, embedding: [0.3] },
  ]);
  assert.deepEqual(r.usage, { prompt_tokens: 7, total_tokens: 7 });
  assert.deepEqual(nativeResToOpenAi({}, "m").data, []);
});