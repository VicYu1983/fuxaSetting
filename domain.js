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

  return {
    DEFAULT_GRID, MANAGED_NAME, PALETTES, RECT_SIZE, CYLINDER_SIZE,
    buildTagIndex, findById, generateId, hasViewShape, isRecord,
    layoutComponents, parseSvg, readManaged, removeLayoutViewReferences,
    serializeConfig, validateConfig
  };
});
