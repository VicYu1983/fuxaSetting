const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const D = require("../domain.js");

const fixturePath = path.join(__dirname, "..", "旭峰建設.json");

test("FUXA sample config is accepted and indexes tags by globally unique id", () => {
  const config = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(D.validateConfig(config), config);
  const tags = D.buildTagIndex(config);
  assert.ok(tags.size > 0);
  assert.equal(tags.get("t_3e02b442-c00c462b").name, "發電機/運轉");
  assert.equal(tags.get("t_3e02b442-c00c462b").deviceName, "B1F-03");
});

test("rejects incomplete or non-FUXA-shaped configurations", () => {
  assert.throws(() => D.validateConfig(null), /不是可辨識的 FUXA 配置/);
  assert.throws(() => D.validateConfig({ devices: {}, hmi: { views: {} } }), /不是可辨識的 FUXA 配置/);
  assert.equal(D.hasViewShape({ id: "v1", items: {}, svgcontent: "<svg/>" }), true);
  assert.equal(D.hasViewShape({ id: "v1", items: [] }), false);
});

test("grid places entries row-major and supports all label positions", () => {
  const components = Array.from({ length: 5 }, (_, index) => ({
    key: String(index), template: index === 4 ? "cylinder" : "rect"
  }));
  const placements = D.layoutComponents(components, {
    columns: 3, originX: 10, originY: 20, gapX: 5, gapY: 6,
    labelPosition: "above", labelOffset: 4, labelFontSize: 10
  });
  assert.equal(placements.length, 5);
  assert.deepEqual(placements[0].shape, { x: 10, y: 20, width: 40, height: 40 });
  assert.equal(placements[1].shape.x, 55);
  assert.equal(placements[3].shape.x, 10);
  assert.equal(placements[3].shape.y, 80);
  assert.deepEqual(placements[0].label, { x: 30, y: 16, anchor: "middle" });
  assert.equal(placements[4].shape.width, 60);

  for (const position of ["above", "below", "left", "right"]) {
    const [placement] = D.layoutComponents([components[0]], { ...D.DEFAULT_GRID, labelPosition: position });
    assert.ok(Number.isFinite(placement.label.x));
    assert.ok(Number.isFinite(placement.label.y));
    assert.ok(["start", "middle", "end"].includes(placement.label.anchor));
  }
});

test("serialization preserves the source file's CRLF and trailing newline policy", () => {
  const text = fs.readFileSync(fixturePath, "utf8");
  const config = JSON.parse(text);
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const hasTrailingNewline = /(?:\r\n|\n)$/.test(text);
  assert.equal(D.serializeConfig(config, lineEnding, hasTrailingNewline), text);
});

test("generated ids retry collisions and reserve the accepted value", () => {
  let call = 0;
  const cryptoMock = {
    getRandomValues(bytes) {
      bytes.fill(call++);
      return bytes;
    }
  };
  const used = new Set(["SHE_00000000-00000000"]);
  const id = D.generateId("SHE", used, cryptoMock);
  assert.equal(id, "SHE_01010101-01010101");
  assert.equal(used.has(id), true);
});
