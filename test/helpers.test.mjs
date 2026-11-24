// Unit tests for the pure helpers: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { _internal } from "../index.mjs";

const { PROVIDER, PUBLIC_BASE, BRIDGES, resolveBase, nativeVlUrl, toNativeVl, fromNativeVl } = _internal;

test("provider id and bridges", () => {
  assert.equal(PROVIDER, "zg-bailian-embed");
  assert.deepEqual(Object.keys(BRIDGES), [
    "qwen3.7-text-embedding",
    "text-embedding-v4",
    "qwen3-vl-embedding",
  ]);
  assert.equal(BRIDGES["qwen3.7-text-embedding"].id, "qwen3.7-text-embedding-flash");
});

test("resolveBase: options > sign-in metadata > public default", () => {
  assert.equal(resolveBase({}, {}), PUBLIC_BASE);
  assert.equal(resolveBase({}, { metadata: { baseURL: "https://ws.example.com/compatible-mode/v1/" } }),
    "https://ws.example.com/compatible-mode/v1");
  assert.equal(resolveBase({ endpoint: "https://opt.example.com/v1" }, { metadata: { baseURL: "https://ws.example.com/compatible-mode/v1" } }),
    "https://opt.example.com/v1");
  assert.equal(resolveBase(undefined, undefined), PUBLIC_BASE);
});

test("nativeVlUrl derives the native endpoint from the base", () => {
  assert.equal(nativeVlUrl(PUBLIC_BASE),
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding");
  assert.equal(nativeVlUrl("https://ws.example.com/compatible-mode/v1"),
    "https://ws.example.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding");
});

test("toNativeVl: string and array input, dimensions", () => {
  assert.deepEqual(toNativeVl({ model: "qwen3-vl-embedding", input: "你好" }),
    { model: "qwen3-vl-embedding", input: { contents: [{ text: "你好" }] } });
  assert.deepEqual(toNativeVl({ model: "qwen3-vl-embedding", input: ["a", "b"], dimensions: 1024 }),
    { model: "qwen3-vl-embedding", input: { contents: [{ text: "a" }, { text: "b" }] }, parameters: { dimension: 1024 } });
});

test("fromNativeVl: rows, index fallback, usage", () => {
  const out = {
    output: { embeddings: [{ embedding: [0.1, 0.2], text_index: 0 }, { embedding: [0.3], index: 1 }] },
    usage: { total_tokens: 7 },
  };
  const r = fromNativeVl(out, "qwen3-vl-embedding");
  assert.equal(r.object, "list");
  assert.equal(r.data.length, 2);
  assert.deepEqual(r.data[0], { object: "embedding", index: 0, embedding: [0.1, 0.2] });
  assert.equal(r.data[1].index, 1);
  assert.deepEqual(r.usage, { prompt_tokens: 7, total_tokens: 7 });
  assert.deepEqual(fromNativeVl({}, "m").data, []);
});