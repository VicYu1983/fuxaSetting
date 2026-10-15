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

test("normalizes floor metadata without discarding other extra fields", () => {
  const tag = { id: "t1", extra: { note: "keep", owner: "ops" } };
  assert.equal(D.getTagFloor(tag), "");
  assert.equal(D.setTagFloor(tag, " b02f "), "B2F");
  assert.deepEqual(tag.extra, { note: "keep", owner: "ops", floor: "B2F" });
  assert.equal(D.setTagFloor(tag, "4f"), "4F");
  assert.equal(tag.extra.floor, "4F");
  assert.equal(D.setTagFloor(tag, ""), "");
  assert.deepEqual(tag.extra, { note: "keep", owner: "ops" });
  assert.equal(D.normalizeFloor("屋頂"), "屋頂");
});

test("loads and saves per-View Grid settings in the top-level tool extra namespace", () => {
  const config = {
    devices: {},
    hmi: { views: [{ id: "view-a" }, { id: "view-b" }] },
    extra: {
      keep: { value: true },
      fuxaSetting: {
        note: "keep",
        viewGrids: {
          "view-a": {
            columns: 6,
            originX: 20,
            labelPosition: "right",
            labelFontSize: 18
          },
          "removed-view": { columns: 2 }
        }
      }
    }
  };
  const gridA = D.getViewGridSettings(config, "view-a");
  assert.deepEqual(gridA, {
    ...D.DEFAULT_GRID,
    columns: 6,
    originX: 20,
    labelPosition: "right",
    labelFontSize: 18
  });
  assert.deepEqual(D.getViewGridSettings(config, "view-b"), D.DEFAULT_GRID);

  D.saveViewGridSettings(config, ["view-a", "view-b"], new Map([
    ["view-a", gridA],
    ["view-b", { ...D.DEFAULT_GRID, columns: 3 }]
  ]));
  assert.deepEqual(config.extra.keep, { value: true });
  assert.equal(config.extra.fuxaSetting.note, "keep");
  assert.deepEqual(config.extra.fuxaSetting.viewGrids["view-a"], gridA);
  assert.equal(config.extra.fuxaSetting.viewGrids["view-b"].columns, 3);
  assert.equal(Object.hasOwn(config.extra.fuxaSetting.viewGrids, "removed-view"), false);
});

test("loads and saves shared floor-group frame styling without discarding extra settings", () => {
  const config = {
    extra: {
      keep: true,
      fuxaSetting: {
        note: "keep",
        viewGrids: { "view-a": { columns: 3 } },
        floorGroupFrames: { fill: "#123456", fillOpacity: 0.8, padding: 24 }
      }
    }
  };
  assert.deepEqual(D.getFloorGroupFrameSettings(config), {
    ...D.DEFAULT_FLOOR_GROUP_FRAME,
    fill: "#123456",
    fillOpacity: 0.8,
    padding: 24
  });
  assert.deepEqual(D.getFloorGroupFrameSettings({}), D.DEFAULT_FLOOR_GROUP_FRAME);

  D.saveFloorGroupFrameSettings(config, {
    fill: "#ABCDEF",
    fillOpacity: 0.4,
    stroke: "#010203",
    strokeWidth: 2,
    cornerRadius: 8,
    padding: 12
  });
  assert.deepEqual(config.extra.keep, true);
  assert.equal(config.extra.fuxaSetting.note, "keep");
  assert.deepEqual(config.extra.fuxaSetting.viewGrids, { "view-a": { columns: 3 } });
  assert.deepEqual(config.extra.fuxaSetting.floorGroupFrames, {
    fill: "#abcdef",
    fillOpacity: 0.4,
    stroke: "#010203",
    strokeWidth: 2,
    cornerRadius: 8,
    padding: 12
  });
});

test("stores imported icon data in the tool extra namespace and preserves sibling settings", () => {
  const config = {
    extra: {
      keep: true,
      fuxaSetting: {
        note: "keep",
        viewGrids: { "view-a": { columns: 3 } }
      }
    }
  };
  assert.deepEqual(D.getIconLibrary(config), []);

  const icon = {
    id: "icon-one",
    name: "pump",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw=="
  };
  D.saveIconLibrary(config, [icon]);
  assert.deepEqual(D.getIconLibrary(config), [icon]);
  assert.deepEqual(config.extra.keep, true);
  assert.equal(config.extra.fuxaSetting.note, "keep");
  assert.deepEqual(config.extra.fuxaSetting.viewGrids, { "view-a": { columns: 3 } });
  assert.deepEqual(config.extra.fuxaSetting.icons, [icon]);

  assert.throws(() => D.saveIconLibrary(config, [{ ...icon, mimeType: "image/svg+xml" }]), /無效項目/);
  assert.throws(() => D.saveIconLibrary(config, [icon, icon]), /重複 ID/);
  assert.throws(() => D.saveIconLibrary(config, [{ ...icon, dataUrl: "https://example.com/image.png" }]), /無效項目/);
});

test("stores named normal/alarm icon sets and validates both embedded images", () => {
  const pair = {
    id: "icon-set-one",
    name: "消防泵",
    type: "pair",
    normal: {
      id: "icon-one-normal",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,iVBORw=="
    },
    alarm: {
      id: "icon-one-alarm",
      mimeType: "image/gif",
      dataUrl: "data:image/gif;base64,R0lGODlh"
    }
  };
  const config = { extra: { fuxaSetting: { note: "keep" } } };
  D.saveIconLibrary(config, [pair]);
  assert.deepEqual(D.getIconLibrary(config), [pair]);
  assert.equal(config.extra.fuxaSetting.note, "keep");
  assert.throws(() => D.saveIconLibrary(config, [{
    ...pair,
    alarm: { ...pair.alarm, dataUrl: "https://example.com/alarm.png" }
  }]), /無效圖片/);
  assert.throws(() => D.saveIconLibrary(config, [{
    ...pair,
    alarm: { ...pair.alarm, id: pair.normal.id }
  }]), /重複 ID/);
});

test("builds complementary FUXA visibility actions and reverses their state mapping", () => {
  const normal = D.buildVisibilityActions("tag-bool", 0);
  const alarm = D.buildVisibilityActions("tag-bool", 1);
  assert.deepEqual(normal, [
    { variableId: "tag-bool", range: { min: 0, max: 0 }, type: "show", options: {} },
    { variableId: "tag-bool", range: { min: 1, max: 1 }, type: "hide", options: {} }
  ]);
  assert.deepEqual(alarm, [
    { variableId: "tag-bool", range: { min: 0, max: 0 }, type: "hide", options: {} },
    { variableId: "tag-bool", range: { min: 1, max: 1 }, type: "show", options: {} }
  ]);
  assert.throws(() => D.buildVisibilityActions("", 0), /Boolean Tag/);
  assert.throws(() => D.buildVisibilityActions("tag-bool", 2), /0／1/);
});

test("persists per-View floor artifact ids without discarding other tool settings", () => {
  const config = {
    extra: {
      fuxaSetting: {
        note: "keep",
        viewGrids: { "view-a": { columns: 4 } },
        floorGroupArtifacts: { "removed-view": { "floor:1F": {} } }
      }
    }
  };
  D.saveFloorGroupArtifacts(config, ["view-a"], new Map([
    ["view-a", {
      "floor:": {
        titleId: "title-empty",
        frameId: "frame-empty",
        frameShapeId: "frame-shape-empty"
      },
      "floor:B1F": {
        titleId: "title-b1",
        frameId: "frame-b1",
        frameShapeId: "frame-shape-b1"
      }
    }]
  ]));
  assert.deepEqual(config.extra.fuxaSetting.viewGrids, { "view-a": { columns: 4 } });
  assert.equal(config.extra.fuxaSetting.note, "keep");
  assert.deepEqual(D.getFloorGroupArtifacts(config, "view-a"), {
    "floor:": {
      titleId: "title-empty",
      frameId: "frame-empty",
      frameShapeId: "frame-shape-empty"
    },
    "floor:B1F": {
      titleId: "title-b1",
      frameId: "frame-b1",
      frameShapeId: "frame-shape-b1"
    }
  });
  assert.equal(Object.hasOwn(config.extra.fuxaSetting.floorGroupArtifacts, "removed-view"), false);
});

test("rejects malformed top-level extra data instead of overwriting it", () => {
  const config = { extra: "preserve this" };
  assert.throws(
    () => D.saveViewGridSettings(config, [], new Map()),
    /extra 欄位不是物件/
  );
  assert.equal(config.extra, "preserve this");
});

test("groups floors in natural order and leaves unassigned tags last", () => {
  const groups = D.groupByFloor(
    ["Roof", "first", "basement", "custom", "unset"],
    (value) => ({
      Roof: "屋頂",
      first: "1f",
      basement: "b2f",
      custom: "機房層"
    })[value] || ""
  );
  assert.deepEqual(groups.map((group) => group.title), ["B2F", "1F", "屋頂", "機房層", "未設定樓層"]);
});

test("lays out each floor as a titled section using one shared grid", () => {
  const tags = new Map([
    ["a", { floor: "1F" }],
    ["b", { floor: "1F" }],
    ["c", { floor: "B1F" }],
    ["manually-removed", { floor: "3F" }]
  ]);
  const components = ["a", "b", "c"].map((tagId, index) => ({
    key: tagId,
    tagId,
    template: "rect",
    seq: index
  }));
  const result = D.layoutFloorComponents(components, {
    ...D.DEFAULT_GRID,
    columns: 2,
    originX: 10,
    originY: 20,
    gapY: 5
  }, tags);
  assert.deepEqual(result.sections.map((section) => section.title), ["B1F", "1F"]);
  assert.equal(result.sections[0].entries[0].placement.shape.x, 10);
  assert.ok(result.sections[0].frame.x < result.sections[0].entries[0].placement.shape.x);
  assert.ok(result.sections[0].frame.y < result.sections[0].titleY);
  assert.ok(result.sections[1].frame.y >=
    result.sections[0].frame.y + result.sections[0].frame.height);
  assert.ok(result.sections[1].titleY > result.sections[0].entries[0].placement.shape.y);
  assert.equal(result.placements.length, 3);
  assert.equal(result.placements.some(({ component }) => component.tagId === "manually-removed"), false);
});

test("floor frames include the measured bounds of existing companion labels", () => {
  const component = {
    key: "existing-tag",
    tagId: "tag-a",
    template: "existing",
    managed: false,
    originalBounds: { x: 100, y: 150, width: 40, height: 40 },
    layoutWidth: 40,
    layoutHeight: 40,
    companions: [{ bounds: { x: 80, y: 125, width: 80, height: 16 } }]
  };
  const result = D.layoutFloorComponents([component], {
    ...D.DEFAULT_GRID,
    originX: 100,
    originY: 150
  }, new Map([["tag-a", { floor: "1F" }]]));
  const { frame, entries } = result.sections[0];
  const placement = entries[0].placement;
  const dx = placement.shape.x - component.originalBounds.x;
  const dy = placement.shape.y - component.originalBounds.y;
  assert.ok(frame.x <= 80 + dx);
  assert.ok(frame.y <= 125 + dy);
  assert.ok(frame.x + frame.width >= 160 + dx);
  assert.ok(frame.y + frame.height >= 141 + dy);
});

test("recognizes duplicate floor titles and frames after floor SVG attributes are stripped", () => {
  class SvgNode {
    constructor(localName, attributes = {}, textContent = "", children = []) {
      this.localName = localName;
      this.namespaceURI = "http://www.w3.org/2000/svg";
      this.attributes = attributes;
      this.textContent = textContent;
      this.children = children;
    }
    getAttribute(name) {
      return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
    }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector === "[id]" && child.getAttribute("id")) return child;
        if (selector === "rect" && child.localName === "rect") return child;
        const descendant = child.querySelector(selector);
        if (descendant) return descendant;
      }
      return null;
    }
  }
  const nodes = [
    new SvgNode("svg", { id: "root" }, "", [
      new SvgNode("text", { id: "title-old", x: "10", y: "20" }, "未設定樓層"),
      new SvgNode("text", {
        id: "title-new", x: "10", y: "20", "data-floor-group": ""
      }, "未設定樓層"),
      new SvgNode("g", { id: "frame-old" }, "", [
        new SvgNode("rect", {
          id: "shape-old", x: "0", y: "0", width: "100", height: "100"
        })
      ]),
      new SvgNode("g", { id: "frame-new", "data-floor-group": "" }, "", [
        new SvgNode("rect", {
          id: "shape-new", x: "0", y: "0", width: "100", height: "100"
        })
      ])
    ])
  ];
  const document = {
    documentElement: nodes[0],
    getElementsByTagName(name) {
      const all = [];
      const visit = (node) => {
        all.push(node);
        for (const child of node.children) visit(child);
      };
      for (const node of nodes) visit(node);
      return name === "*" ? all : all.filter((node) => node.localName === name);
    }
  };
  class Parser {
    parseFromString() {
      return document;
    }
  }
  const view = {
    svgcontent: "<svg/>",
    items: {
      "title-old": { id: "title-old", name: "fuxa_floor_section_title" },
      "title-new": { id: "title-new", name: "fuxa_floor_section_title" },
      "frame-old": { id: "frame-old", name: "fuxa_floor_section_frame" },
      "frame-new": { id: "frame-new", name: "fuxa_floor_section_frame" }
    }
  };
  const result = D.readManaged(view, Parser);
  assert.deepEqual(result.floorTitleIds["floor:"], ["title-old", "title-new"]);
  assert.deepEqual(result.floorFrameIds["floor:"], ["frame-new", "frame-old"]);
  assert.equal(result.floorTitles["floor:"], "title-old");
  assert.equal(result.floorFrames["floor:"], "frame-new");
  assert.equal(result.floorFrameShapeIds["floor:"], "shape-new");

  const indexed = D.readManaged(view, Parser, {
    "floor:": {
      titleId: "title-new",
      frameId: "frame-new",
      frameShapeId: "shape-new"
    }
  });
  assert.equal(indexed.floorTitles["floor:"], "title-new");
  assert.equal(indexed.floorFrames["floor:"], "frame-new");
  assert.equal(indexed.floorFrameShapeIds["floor:"], "shape-new");
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

test("grid reserves per-column and per-row space for existing SVG Tag bounds", () => {
  const placements = D.layoutComponents([
    { key: "existing-wide", template: "existing", layoutWidth: 100, layoutHeight: 50 },
    { key: "standard", template: "rect" },
    { key: "next-row", template: "rect" }
  ], {
    columns: 2, originX: 10, originY: 20, gapX: 10, gapY: 5,
    labelFontSize: 10, labelOffset: 0
  });

  assert.equal(placements[0].shape.width, 100);
  assert.equal(placements[1].shape.x, 120);
  assert.equal(placements[2].shape.y, 85);
});

test("serialization preserves the source file's CRLF and trailing newline policy", () => {
  const config = { devices: {}, hmi: { views: [] } };
  const text = `${JSON.stringify(config, null, 4).replace(/\n/g, "\r\n")}\r\n`;
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
  assert.equal(dev.property.addressCount, 0);
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
  assert.throws(() => D.createModbusTcpDevice({
    name: "bad-count",
    addressCount: 1.5
  }, usedDeviceIds, cryptoMock), /地址數量/);
});

test("fills missing ModbusTCP addresses from the first tag without replacing existing tags", () => {
  const device = {
    property: { addressCount: 4 },
    tags: {
      "tag-12": {
        id: "tag-12",
        name: "Point 12",
        type: "number",
        memaddress: "400000",
        address: 12,
        divisor: 10,
        daq: { enabled: true, interval: 15, changed: true, restored: false },
        description: null,
        timestamp: 1
      },
      "tag-10": {
        id: "tag-10",
        name: "Point 10",
        type: "number",
        memaddress: "400000",
        address: 10,
        divisor: 10,
        daq: { enabled: true, interval: 15, changed: true, restored: false },
        description: null,
        timestamp: 1
      },
      "tag-other-area": {
        id: "tag-other-area",
        name: "Other area 11",
        type: "Bool",
        memaddress: "000000",
        address: 11
      }
    }
  };
  let generated = 0;
  const usedTagIds = new Set(Object.keys(device.tags));
  const cryptoMock = {
    getRandomValues(bytes) {
      bytes.fill(++generated);
      return bytes;
    }
  };

  const result = D.fillModbusTcpAddressGaps(device, usedTagIds, cryptoMock);
  assert.deepEqual(result.missing, [11, 13]);
  assert.deepEqual(result.created.map((tag) => [tag.name, tag.address]), [
    ["補位_11", 11],
    ["補位_13", 13]
  ]);
  assert.equal(result.created[0].type, "number");
  assert.equal(result.created[0].memaddress, "400000");
  assert.equal(result.created[0].divisor, 10);
  assert.deepEqual(result.created[0].daq, {
    enabled: true, interval: 15, changed: true, restored: false
  });
  assert.equal(device.tags["tag-12"].name, "Point 12");
  assert.equal(device.tags["tag-other-area"].name, "Other area 11");
  assert.deepEqual(
    D.fillModbusTcpAddressGaps(device, usedTagIds, cryptoMock).created,
    []
  );
});

test("validates ModbusTCP address fill bounds and waits until a tag establishes the start", () => {
  const cryptoMock = { getRandomValues(bytes) { bytes.fill(2); return bytes; } };
  const noTags = { property: { addressCount: 32 }, tags: {} };
  assert.deepEqual(
    D.fillModbusTcpAddressGaps(noTags, new Set(), cryptoMock),
    { count: 32, missing: [], hasAnchor: false, created: [] }
  );
  assert.throws(() => D.getModbusTcpAddressFillPlan({
    property: { addressCount: 2 },
    tags: { high: { address: 65535, memaddress: "000000" } }
  }), /超出 Modbus 位址範圍/);
  assert.throws(() => D.updateModbusTcpDevice(
    { property: {} }, { addressCount: -1 }
  ), /地址數量/);
});

test("shifts every valid ModbusTCP tag address across memory areas", () => {
  const device = {
    type: "ModbusTCP",
    tags: {
      coil: { address: 1, memaddress: "000000" },
      register: { address: "10", memaddress: "400000" },
      noAddress: { memaddress: "d_demo" },
      invalid: { address: "not-an-address", memaddress: "300000" }
    }
  };

  assert.deepEqual(D.getModbusTcpAddressShiftPlan(device, 1).count, 2);
  assert.deepEqual(D.shiftModbusTcpAddresses(device, 1), {
    count: 2,
    skippedInvalid: 1
  });
  assert.equal(device.tags.coil.address, 2);
  assert.equal(device.tags.register.address, "11");
  assert.equal(device.tags.noAddress.address, undefined);
  assert.equal(device.tags.invalid.address, "not-an-address");

  assert.deepEqual(D.shiftModbusTcpAddresses(device, -1), {
    count: 2,
    skippedInvalid: 1
  });
  assert.equal(device.tags.coil.address, 1);
  assert.equal(device.tags.register.address, "10");
});

test("rejects out-of-range ModbusTCP shifts atomically", () => {
  const upperBound = {
    type: "ModbusTCP",
    tags: {
      first: { address: 8 },
      last: { address: 65535 }
    }
  };
  assert.throws(() => D.shiftModbusTcpAddresses(upperBound, 1), /未修改任何 Tag/);
  assert.equal(upperBound.tags.first.address, 8);
  assert.equal(upperBound.tags.last.address, 65535);

  const lowerBound = {
    type: "ModbusTCP",
    tags: {
      first: { address: 0 },
      last: { address: 10 }
    }
  };
  assert.throws(() => D.shiftModbusTcpAddresses(lowerBound, -1), /未修改任何 Tag/);
  assert.equal(lowerBound.tags.first.address, 0);
  assert.equal(lowerBound.tags.last.address, 10);
  assert.throws(() => D.getModbusTcpAddressShiftPlan(upperBound, 2), /只能是 \+1 或 -1/);
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
    description: null,
    floor: ""
  });
  assert.deepEqual(specs[1], {
    name: "點位二",
    address: 10,
    type: "Bool",
    memaddress: "000000",
    description: null,
    floor: ""
  });
  assert.deepEqual(specs[2], {
    name: "點位三",
    address: 20,
    type: "Bool",
    memaddress: "100000",
    description: "這是備註",
    floor: ""
  });

  assert.deepEqual(specs[3], {
    name: "點位四",
    address: 21,
    type: "Bool",
    memaddress: "000000",
    description: null,
    floor: ""
  });
});

test("parses and creates batch tags with a normalized shared or per-tag floor", () => {
  const specs = D.parseTagBatchInput("Tag A\nTag B\t7\tBool\t000000\t\tb1f", {
    startAddress: 1,
    defaultFloor: "4f"
  });
  assert.deepEqual(specs.map((spec) => spec.floor), ["4F", "B1F"]);
  const device = { tags: {} };
  let id = 1;
  const created = D.batchCreateTags(device, specs, new Set(), {
    getRandomValues(bytes) { bytes.fill(id++); return bytes; }
  });
  assert.deepEqual(created.map((tag) => tag.extra.floor), ["4F", "B1F"]);
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
