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

test("removing a View clears navigation references and replaces its start View", () => {
  const layout = {
    start: "view-old",
    navigation: {
      items: [
        {
          text: "Group",
          view: "view-other",
          children: [
            { text: "Old page", view: "view-old" },
            { text: "Keep page", view: "view-other" }
          ]
        },
        { text: "Remove group", view: "view-old", children: [] }
      ]
    }
  };
  const removed = D.removeLayoutViewReferences(layout, "view-old", "view-other");
  assert.equal(removed, 3);
  assert.equal(layout.start, "view-other");
  assert.deepEqual(layout.navigation.items, [{
    text: "Group",
    view: "view-other",
    children: [{ text: "Keep page", view: "view-other" }]
  }]);
});

test("creates and updates ModbusTCP devices", () => {
  const usedDeviceIds = new Set();
  const cryptoMock = {
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    }
  };
  const dev = D.createModbusTcpDevice({
    name: "14F",
    address: "192.168.1.14:502",
    slaveid: "2",
    polling: 300,
    enabled: true
  }, usedDeviceIds, cryptoMock);

  assert.equal(dev.id, "d_07070707-07070707");
  assert.equal(dev.name, "14F");
  assert.equal(dev.type, "ModbusTCP");
  assert.equal(dev.property.address, "192.168.1.14:502");
  assert.equal(dev.property.slaveid, "2");
  assert.equal(dev.polling, 300);
  assert.equal(dev.enabled, true);
  assert.deepEqual(dev.tags, {});

  D.updateModbusTcpDevice(dev, {
    name: "14F-Renamed",
    address: "192.168.1.15:502",
    slaveid: "3",
    polling: 500,
    enabled: false
  });
  assert.equal(dev.name, "14F-Renamed");
  assert.equal(dev.property.address, "192.168.1.15:502");
  assert.equal(dev.property.slaveid, "3");
  assert.equal(dev.polling, 500);
  assert.equal(dev.enabled, false);

  assert.throws(() => D.createModbusTcpDevice({ name: "" }, usedDeviceIds, cryptoMock), /設備名稱不可空白/);
});

test("parses tag batch input with automatic increment and custom columns", () => {
  const input = `
    # 註解行
    點位一
    點位二\t10
    點位三, 20, Bool, 100000, 這是備註
    點位四
  `;
  const specs = D.parseTagBatchInput(input, {
    startAddress: 1,
    step: 1,
    defaultMemAddress: "000000",
    defaultType: "Bool"
  });

  assert.equal(specs.length, 4);
  assert.deepEqual(specs[0], {
    name: "點位一",
    address: 1,
    type: "Bool",
    memaddress: "000000",
    description: null
  });
  assert.deepEqual(specs[1], {
    name: "點位二",
    address: 10,
    type: "Bool",
    memaddress: "000000",
    description: null
  });
  assert.deepEqual(specs[2], {
    name: "點位三",
    address: 20,
    type: "Bool",
    memaddress: "100000",
    description: "這是備註"
  });
  assert.deepEqual(specs[3], {
    name: "點位四",
    address: 21,
    type: "Bool",
    memaddress: "000000",
    description: null
  });
});

test("batch creates tags under a device and detects next available address", () => {
  const device = {
    id: "d_test",
    name: "TestDev",
    tags: {}
  };
  assert.equal(D.getNextAvailableAddress(device), 1);

  const usedTagIds = new Set();
  let counter = 1;
  const cryptoMock = {
    getRandomValues(bytes) {
      bytes.fill(counter++);
      return bytes;
    }
  };

  const specs = [
    { name: "Tag 1", address: 1, type: "Bool", memaddress: "000000" },
    { name: "Tag 2", address: 2, type: "Bool", memaddress: "000000" }
  ];
  const created = D.batchCreateTags(device, specs, usedTagIds, cryptoMock);
  assert.equal(created.length, 2);
  assert.equal(Object.keys(device.tags).length, 2);
  assert.equal(created[0].name, "Tag 1");
  assert.equal(created[0].address, 1);
  assert.equal(D.getNextAvailableAddress(device), 3);
});

test("synchronizes connection tag in FuxaServer device 0 and handles device removal", () => {
  const config = {
    devices: {
      "0": {
        id: "0",
        name: "FUXA",
        type: "FuxaServer",
        tags: {}
      },
      "d_demo": {
        id: "d_demo",
        name: "DemoDev",
        tags: {}
      }
    }
  };
  const usedTagIds = new Set();
  const cryptoMock = {
    getRandomValues(bytes) {
      bytes.fill(9);
      return bytes;
    }
  };

  const connTag = D.syncDeviceConnectionTag(config, "d_demo", "DemoDev", cryptoMock, usedTagIds);
  assert.ok(connTag);
  assert.equal(connTag.name, "DemoDev Connection Status");
  assert.equal(connTag.memaddress, "d_demo");

  // Sync rename
  D.syncDeviceConnectionTag(config, "d_demo", "DemoDev-Renamed", cryptoMock, usedTagIds);
  assert.equal(connTag.name, "DemoDev-Renamed Connection Status");

  // Removal
  const removed = D.removeDevice(config, "d_demo");
  assert.equal(removed, true);
  assert.equal(config.devices["d_demo"], undefined);
  assert.equal(Object.keys(config.devices["0"].tags).length, 0);
});

