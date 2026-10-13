(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FuxaToolDomain = api;
})(globalThis, function () {
  "use strict";

  const DEFAULT_GRID = Object.freeze({
    columns: 4, originX: 60, originY: 80, gapX: 40, gapY: 40,
    labelPosition: "above", labelOffset: 10, labelFontSize: 14
  });
  const RECT_SIZE = Object.freeze({ width: 40, height: 40 });
  const CYLINDER_SIZE = Object.freeze({ width: 60, height: 64 });
  const PALETTES = Object.freeze({
    normal: ["#00ff07ff", "#f80000ff"],
    alarm: ["#ff0000ff", "#00ff07ff"]
  });
  const MANAGED_NAME = /^tc_(\d+)$/;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validateConfig(config) {
    if (!isRecord(config) || !isRecord(config.devices) ||
        !isRecord(config.hmi) || !Array.isArray(config.hmi.views)) {
      throw new Error("檔案不是可辨識的 FUXA 配置（需包含 devices 與 hmi.views）。");
    }
    return config;
  }

  function buildTagIndex(config) {
    const index = new Map();
    for (const [deviceId, device] of Object.entries(config.devices)) {
      if (!isRecord(device) || !isRecord(device.tags)) continue;
      const deviceName = typeof device.name === "string" ? device.name : deviceId;
      for (const [tagKey, tag] of Object.entries(device.tags)) {
        if (!isRecord(tag)) continue;
        const id = typeof tag.id === "string" ? tag.id : tagKey;
        index.set(id, {
          id,
          name: typeof tag.name === "string" ? tag.name : id,
          type: typeof tag.type === "string" ? tag.type : "",
          deviceId,
          deviceName
        });
      }
    }
    return index;
  }

  function parseSvg(svgText, Parser) {
    const doc = new Parser().parseFromString(svgText, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length > 0 ||
        !doc.documentElement || doc.documentElement.localName !== "svg") {
      throw new Error("View 的 svgcontent 無法解析。");
    }
    return doc;
  }

  function findById(doc, id) {
    for (const element of Array.from(doc.getElementsByTagName("*"))) {
      if (element.getAttribute("id") === id) return element;
    }
    return null;
  }

  function itemName(item) {
    return item && typeof item.name === "string" ? item.name : "";
  }

  function readManaged(view, Parser) {
    const records = [];
    const unmanaged = [];
    if (!isRecord(view.items) || typeof view.svgcontent !== "string") {
      return { records, unmanaged, error: "View 缺少 items 或 svgcontent。" };
    }
    let doc;
    try {
      doc = parseSvg(view.svgcontent, Parser);
    } catch (error) {
      return { records, unmanaged, error: error.message };
    }

    const consumed = new Set();
    for (const [shapeId, shapeItem] of Object.entries(view.items)) {
      const match = MANAGED_NAME.exec(itemName(shapeItem));
      if (!match || !shapeItem || shapeItem.id !== shapeId) continue;
      const seq = Number(match[1]);
      const labelId = Object.keys(view.items).find((id) =>
        itemName(view.items[id]) === `tc_${seq}_label` &&
        view.items[id] && view.items[id].type === "svg-ext-shapes-text"
      );
      if (!labelId) continue;
      const shapeNode = findById(doc, shapeId);
      const labelNode = findById(doc, labelId);
      if (!shapeNode || !labelNode || labelNode.localName !== "text") continue;

      const shapeType = shapeItem.type === "svg-ext-shapes-cylinder" ? "cylinder" : "rect";
      const ranges = shapeItem.property && Array.isArray(shapeItem.property.ranges)
        ? shapeItem.property.ranges : [];
      const colors = ranges.map((range) => range.color);
      const palette = colors[0] === PALETTES.alarm[0] ? "alarm" : "normal";
      records.push({
        key: `loaded-${seq}`,
        seq,
        tagId: shapeItem.property && typeof shapeItem.property.variableId === "string"
          ? shapeItem.property.variableId : "",
        label: labelNode.textContent || "",
        template: shapeType,
        palette,
        shapeId,
        labelId,
        shapeInnerIds: Array.from(shapeNode.querySelectorAll("[id]")).map((node) => node.getAttribute("id")),
        managed: true
      });
      consumed.add(shapeId);
      consumed.add(labelId);
    }

    for (const [id, item] of Object.entries(view.items)) {
      if (consumed.has(id)) continue;
      if (item && item.property && typeof item.property.variableId === "string") {
        unmanaged.push({
          id,
          name: itemName(item) || id,
          tagId: item.property.variableId,
          type: typeof item.type === "string" ? item.type : ""
        });
      }
    }
    records.sort((a, b) => a.seq - b.seq);
    return { records, unmanaged, doc };
  }

  function layoutComponents(components, settings) {
    const grid = { ...DEFAULT_GRID, ...settings };
    const columns = Math.max(1, Math.floor(Number(grid.columns) || 1));
    const gapX = Math.max(0, Number(grid.gapX) || 0);
    const gapY = Math.max(0, Number(grid.gapY) || 0);
    const labelOffset = Math.max(0, Number(grid.labelOffset) || 0);
    const fontSize = Math.max(8, Number(grid.labelFontSize) || DEFAULT_GRID.labelFontSize);
    const placements = [];
    for (const [index, component] of components.entries()) {
      const size = component.template === "cylinder" ? CYLINDER_SIZE : RECT_SIZE;
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cellX = Number(grid.originX) + col * (size.width + gapX);
      const cellY = Number(grid.originY) + row * (size.height + gapY + fontSize + labelOffset);
      const shape = { x: cellX, y: cellY, width: size.width, height: size.height };
      const centerX = cellX + size.width / 2;
      const centerY = cellY + size.height / 2;
      let label;
      switch (grid.labelPosition) {
        case "below":
          label = { x: centerX, y: cellY + size.height + labelOffset + fontSize, anchor: "middle" };
          break;
        case "left":
          label = { x: cellX - labelOffset, y: centerY + fontSize * 0.35, anchor: "end" };
          break;
        case "right":
          label = { x: cellX + size.width + labelOffset, y: centerY + fontSize * 0.35, anchor: "start" };
          break;
        case "above":
        default:
          label = { x: centerX, y: cellY - labelOffset, anchor: "middle" };
      }
      placements.push({ key: component.key, shape, label });
    }
    return placements;
  }

  function serializeConfig(config, lineEnding, hasTrailingNewline) {
    let text = JSON.stringify(config, null, 4);
    if (lineEnding === "\r\n") text = text.replace(/\n/g, "\r\n");
    if (hasTrailingNewline) text += lineEnding;
    return text;
  }

  function generateId(prefix, usedIds, cryptoObject) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const bytes = new Uint8Array(8);
      cryptoObject.getRandomValues(bytes);
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      const id = `${prefix}_${hex.slice(0, 4).join("")}-${hex.slice(4).join("")}`;
      if (!usedIds.has(id)) {
        usedIds.add(id);
        return id;
      }
    }
    throw new Error("無法產生唯一元件 ID。");
  }

  function removeLayoutViewReferences(layout, viewId, replacementViewId) {
    let removed = 0;
    function visit(value) {
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          const entry = value[index];
          if (isRecord(entry) && entry.view === viewId) {
            value.splice(index, 1);
            removed += 1;
          } else {
            visit(entry);
          }
        }
        return;
      }
      if (!isRecord(value)) return;
      for (const [key, child] of Object.entries(value)) {
        if (key === "view" && child === viewId) {
          delete value[key];
          removed += 1;
        } else if (key !== "start") {
          visit(child);
        }
      }
    }
    if (isRecord(layout) && layout.start === viewId) {
      layout.start = replacementViewId;
      removed += 1;
    }
    visit(layout);
    return removed;
  }

  function hasViewShape(view) {
    return isRecord(view) && typeof view.id === "string" &&
      isRecord(view.items) && typeof view.svgcontent === "string";
  }

  function createModbusTcpDevice(params, usedDeviceIds, cryptoObject) {
    const name = params && typeof params.name === "string" ? params.name.trim() : "";
    if (!name) throw new Error("設備名稱不可空白。");
    const id = generateId("d", usedDeviceIds, cryptoObject);
    const property = {
      address: params && params.address ? String(params.address).trim() : "127.0.0.1:502",
      port: null,
      slot: null,
      rack: null,
      slaveid: params && params.slaveid !== undefined ? String(params.slaveid).trim() : "1",
      baudrate: params && Number(params.baudrate) ? Number(params.baudrate) : 9600,
      databits: params && Number(params.databits) ? Number(params.databits) : 8,
      stopbits: params && Number(params.stopbits) ? Number(params.stopbits) : 1,
      parity: params && params.parity ? String(params.parity) : "None",
      connectionOption: params && params.connectionOption ? String(params.connectionOption) : "TcpPort",
      delay: params && params.delay !== undefined ? Number(params.delay) : 10,
      forceFC16: Boolean(params && params.forceFC16),
      timeout: params && params.timeout !== undefined ? Number(params.timeout) : 2000
    };
    return {
      id,
      name,
      enabled: params && params.enabled !== undefined ? Boolean(params.enabled) : true,
      property,
      type: "ModbusTCP",
      polling: params && Number(params.polling) ? Number(params.polling) : 200,
      tags: {}
    };
  }

  function updateModbusTcpDevice(device, params) {
    if (!device || !isRecord(device)) throw new Error("無效的設備資料。");
    if (!isRecord(device.property)) device.property = {};
    if (params && params.name !== undefined) {
      const name = String(params.name).trim();
      if (!name) throw new Error("設備名稱不可空白。");
      device.name = name;
    }
    if (params && params.enabled !== undefined) device.enabled = Boolean(params.enabled);
    if (params && params.polling !== undefined) device.polling = Number(params.polling) || 200;
    if (params && params.address !== undefined) device.property.address = String(params.address).trim();
    if (params && params.slaveid !== undefined) device.property.slaveid = String(params.slaveid).trim();
    if (params && params.baudrate !== undefined) device.property.baudrate = Number(params.baudrate) || 9600;
    if (params && params.databits !== undefined) device.property.databits = Number(params.databits) || 8;
    if (params && params.stopbits !== undefined) device.property.stopbits = Number(params.stopbits) || 1;
    if (params && params.parity !== undefined) device.property.parity = String(params.parity);
    if (params && params.connectionOption !== undefined) device.property.connectionOption = String(params.connectionOption);
    if (params && params.delay !== undefined) device.property.delay = Number(params.delay);
    if (params && params.forceFC16 !== undefined) device.property.forceFC16 = Boolean(params.forceFC16);
    if (params && params.timeout !== undefined) device.property.timeout = Number(params.timeout);
    return device;
  }

  function getNextAvailableAddress(device, memaddress) {
    if (!device || !isRecord(device.tags)) return 1;
    let max = 0;
    for (const tag of Object.values(device.tags)) {
      if (!isRecord(tag)) continue;
      if (memaddress !== undefined && tag.memaddress !== memaddress) continue;
      const addr = Number(tag.address);
      if (Number.isFinite(addr) && addr > max) max = addr;
    }
    return max + 1;
  }

  function parseTagBatchInput(inputText, options) {
    const opts = options || {};
    const defaultMemAddress = typeof opts.defaultMemAddress === "string" ? opts.defaultMemAddress : "000000";
    const defaultType = typeof opts.defaultType === "string" ? opts.defaultType : "Bool";
    const step = Math.max(1, Math.floor(Number(opts.step) || 1));
    let nextAutoAddress = Math.max(0, Math.floor(Number(opts.startAddress) || 1));

    const lines = String(inputText || "").split(/\r?\n/);
    const results = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      const delimiter = line.includes("\t") ? "\t" : ",";
      const parts = line.split(delimiter).map((p) => p.trim());
      const name = parts[0];
      if (!name) continue;

      let address;
      if (parts.length > 1 && parts[1] !== "" && !Number.isNaN(Number(parts[1]))) {
        address = Math.floor(Number(parts[1]));
        nextAutoAddress = address + step;
      } else {
        address = nextAutoAddress;
        nextAutoAddress += step;
      }

      const type = (parts.length > 2 && parts[2]) ? parts[2] : defaultType;
      const memaddress = (parts.length > 3 && parts[3]) ? parts[3] : defaultMemAddress;
      const description = (parts.length > 4 && parts[4]) ? parts[4] : null;

      results.push({
        name,
        address,
        type,
        memaddress,
        description
      });
    }

    return results;
  }

  function batchCreateTags(device, tagSpecs, usedTagIds, cryptoObject) {
    if (!device || !isRecord(device)) throw new Error("無效的設備。");
    if (!isRecord(device.tags)) device.tags = {};
    const created = [];
    const timestamp = Date.now();
    for (const spec of tagSpecs) {
      const id = generateId("t", usedTagIds, cryptoObject);
      const tag = {
        id,
        name: String(spec.name).trim(),
        type: spec.type ? String(spec.type).trim() : "Bool",
        memaddress: spec.memaddress ? String(spec.memaddress).trim() : "000000",
        address: Number(spec.address),
        divisor: spec.divisor !== undefined ? spec.divisor : null,
        daq: {
          enabled: Boolean(spec.daq && spec.daq.enabled),
          interval: spec.daq && Number(spec.daq.interval) ? Number(spec.daq.interval) : 60,
          changed: Boolean(spec.daq && spec.daq.changed),
          restored: Boolean(spec.daq && spec.daq.restored)
        },
        description: spec.description !== undefined ? spec.description : null,
        timestamp
      };
      device.tags[id] = tag;
      created.push(tag);
    }
    return created;
  }

  function syncDeviceConnectionTag(config, deviceId, deviceName, cryptoObject, usedTagIds) {
    if (!isRecord(config) || !isRecord(config.devices) || !isRecord(config.devices["0"])) return null;
    const serverDev = config.devices["0"];
    if (!isRecord(serverDev.tags)) serverDev.tags = {};
    for (const tag of Object.values(serverDev.tags)) {
      if (isRecord(tag) && tag.memaddress === deviceId && tag.sysType === 1) {
        tag.name = `${deviceName} Connection Status`;
        tag.label = `${deviceName} Connection Status`;
        tag.timestamp = Date.now();
        return tag;
      }
    }
    const tagId = generateId("t", usedTagIds, cryptoObject);
    const connTag = {
      id: tagId,
      name: `${deviceName} Connection Status`,
      label: `${deviceName} Connection Status`,
      type: "number",
      memaddress: deviceId,
      daq: {
        enabled: false,
        interval: 60,
        changed: false,
        restored: false
      },
      init: "",
      sysType: 1,
      timestamp: Date.now()
    };
    serverDev.tags[tagId] = connTag;
    return connTag;
  }

  function removeDevice(config, deviceId) {
    if (!isRecord(config) || !isRecord(config.devices) || !config.devices[deviceId]) return false;
    delete config.devices[deviceId];
    if (isRecord(config.devices["0"]) && isRecord(config.devices["0"].tags)) {
      for (const [tagId, tag] of Object.entries(config.devices["0"].tags)) {
        if (isRecord(tag) && tag.memaddress === deviceId && tag.sysType === 1) {
          delete config.devices["0"].tags[tagId];
        }
      }
    }
    return true;
  }

  return {
    DEFAULT_GRID, MANAGED_NAME, PALETTES, RECT_SIZE, CYLINDER_SIZE,
    buildTagIndex, findById, generateId, hasViewShape, isRecord,
    layoutComponents, parseSvg, readManaged, removeLayoutViewReferences,
    serializeConfig, validateConfig,
    createModbusTcpDevice, updateModbusTcpDevice, getNextAvailableAddress,
    parseTagBatchInput, batchCreateTags, syncDeviceConnectionTag, removeDevice
  };
});
