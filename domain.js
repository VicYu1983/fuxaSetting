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
  const DEFAULT_FLOOR_GROUP_FRAME = Object.freeze({
    fill: "#eff6ff", fillOpacity: 0.55, stroke: "#93c5fd",
    strokeWidth: 1, cornerRadius: 12, padding: 16
  });
  const GRID_SETTINGS_KEY = "fuxaSetting";
  const ICON_LIBRARY_KEY = "icons";
  const FLOOR_GROUP_FRAME_SETTINGS_KEY = "floorGroupFrames";
  const FLOOR_GROUP_ARTIFACTS_KEY = "floorGroupArtifacts";
  const LABEL_POSITIONS = new Set(["above", "below", "left", "right"]);
  const RECT_SIZE = Object.freeze({ width: 40, height: 40 });
  const CYLINDER_SIZE = Object.freeze({ width: 60, height: 64 });
  const PALETTES = Object.freeze({
    normal: ["#00ff07ff", "#f80000ff"],
    alarm: ["#ff0000ff", "#00ff07ff"]
  });
  const MANAGED_NAME = /^tc_(\d+)$/;
  const FLOOR_LAYOUT_TRANSFORM = /^translate\(-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?\)$/;
  const SVG_GRAPHICS = new Set([
    "g", "rect", "circle", "ellipse", "path", "polygon", "polyline",
    "line", "text", "image", "use"
  ]);

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

  function normalizeGridSettings(settings) {
    const grid = { ...DEFAULT_GRID };
    if (!isRecord(settings)) return grid;
    for (const key of ["columns", "originX", "originY", "gapX", "gapY", "labelOffset", "labelFontSize"]) {
      const value = settings[key];
      if (!Number.isFinite(value)) continue;
      if (key === "columns") {
        if (Number.isInteger(value) && value >= 1 && value <= 24) grid[key] = value;
      } else if (key === "labelFontSize") {
        if (value >= 8 && value <= 72) grid[key] = value;
      } else if (value >= 0) {
        grid[key] = value;
      }
    }
    if (LABEL_POSITIONS.has(settings.labelPosition)) grid.labelPosition = settings.labelPosition;
    return grid;
  }

  function getViewGridSettings(config, viewId) {
    const settings = isRecord(config.extra) &&
      isRecord(config.extra[GRID_SETTINGS_KEY]) &&
      isRecord(config.extra[GRID_SETTINGS_KEY].viewGrids)
      ? config.extra[GRID_SETTINGS_KEY].viewGrids[viewId]
      : null;
    return normalizeGridSettings(settings);
  }

  function saveViewGridSettings(config, viewIds, grids) {
    if (!isRecord(config)) throw new Error("無效的配置資料。");
    if (config.extra !== undefined && !isRecord(config.extra)) {
      throw new Error("配置的 extra 欄位不是物件，無法安全保存 Grid 設定。");
    }
    if (!isRecord(config.extra)) config.extra = {};
    const toolSettings = config.extra[GRID_SETTINGS_KEY];
    if (toolSettings !== undefined && !isRecord(toolSettings)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY} 欄位不是物件，無法安全保存 Grid 設定。`);
    }
    const storedSettings = isRecord(toolSettings) ? toolSettings : {};
    const existingGrids = storedSettings.viewGrids;
    if (existingGrids !== undefined && !isRecord(existingGrids)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY}.viewGrids 欄位不是物件，無法安全保存 Grid 設定。`);
    }
    const viewGrids = isRecord(existingGrids) ? { ...existingGrids } : {};
    const activeViewIds = new Set(viewIds);
    for (const viewId of Object.keys(viewGrids)) {
      if (!activeViewIds.has(viewId)) delete viewGrids[viewId];
    }
    for (const [viewId, settings] of grids) {
      if (activeViewIds.has(viewId)) viewGrids[viewId] = normalizeGridSettings(settings);
    }
    config.extra[GRID_SETTINGS_KEY] = {
      ...storedSettings,
      version: 1,
      viewGrids
    };
    return config.extra[GRID_SETTINGS_KEY];
  }

  function normalizeFloorGroupFrameSettings(settings) {
    const frame = { ...DEFAULT_FLOOR_GROUP_FRAME };
    if (!isRecord(settings)) return frame;
    for (const key of ["fill", "stroke"]) {
      if (typeof settings[key] === "string" && /^#[\da-f]{6}$/i.test(settings[key])) {
        frame[key] = settings[key].toLowerCase();
      }
    }
    for (const key of ["fillOpacity", "strokeWidth", "cornerRadius", "padding"]) {
      const value = settings[key];
      if (!Number.isFinite(value)) continue;
      if (key === "fillOpacity" && value >= 0 && value <= 1) frame[key] = value;
      else if (key === "strokeWidth" && value >= 0 && value <= 10) frame[key] = value;
      else if (key === "cornerRadius" && value >= 0 && value <= 100) frame[key] = value;
      else if (key === "padding" && value >= 0 && value <= 200) frame[key] = value;
    }
    return frame;
  }

  function getFloorGroupFrameSettings(config) {
    const settings = isRecord(config.extra) &&
      isRecord(config.extra[GRID_SETTINGS_KEY])
      ? config.extra[GRID_SETTINGS_KEY][FLOOR_GROUP_FRAME_SETTINGS_KEY]
      : null;
    return normalizeFloorGroupFrameSettings(settings);
  }

  function saveFloorGroupFrameSettings(config, settings) {
    if (!isRecord(config)) throw new Error("無效的配置資料。");
    if (config.extra !== undefined && !isRecord(config.extra)) {
      throw new Error("配置的 extra 欄位不是物件，無法安全保存樓層底框設定。");
    }
    if (!isRecord(config.extra)) config.extra = {};
    const toolSettings = config.extra[GRID_SETTINGS_KEY];
    if (toolSettings !== undefined && !isRecord(toolSettings)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層底框設定。`);
    }
    const storedSettings = isRecord(toolSettings) ? toolSettings : {};
    if (storedSettings[FLOOR_GROUP_FRAME_SETTINGS_KEY] !== undefined &&
        !isRecord(storedSettings[FLOOR_GROUP_FRAME_SETTINGS_KEY])) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY}.${FLOOR_GROUP_FRAME_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層底框設定。`);
    }
    config.extra[GRID_SETTINGS_KEY] = {
      ...storedSettings,
      [FLOOR_GROUP_FRAME_SETTINGS_KEY]: normalizeFloorGroupFrameSettings(settings)
    };
    return config.extra[GRID_SETTINGS_KEY][FLOOR_GROUP_FRAME_SETTINGS_KEY];
  }

  function getFloorGroupArtifacts(config, viewId) {
    const artifacts = isRecord(config.extra) &&
      isRecord(config.extra[GRID_SETTINGS_KEY]) &&
      isRecord(config.extra[GRID_SETTINGS_KEY][FLOOR_GROUP_ARTIFACTS_KEY])
      ? config.extra[GRID_SETTINGS_KEY][FLOOR_GROUP_ARTIFACTS_KEY][viewId]
      : null;
    return isRecord(artifacts) ? artifacts : {};
  }

  function saveFloorGroupArtifacts(config, viewIds, artifactsByView) {
    if (!isRecord(config)) throw new Error("無效的配置資料。");
    if (config.extra !== undefined && !isRecord(config.extra)) {
      throw new Error("配置的 extra 欄位不是物件，無法安全保存樓層群組元件索引。");
    }
    if (!isRecord(config.extra)) config.extra = {};
    const toolSettings = config.extra[GRID_SETTINGS_KEY];
    if (toolSettings !== undefined && !isRecord(toolSettings)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY} 欄位不是物件，無法安全保存樓層群組元件索引。`);
    }
    const storedSettings = isRecord(toolSettings) ? toolSettings : {};
    const existingArtifacts = storedSettings[FLOOR_GROUP_ARTIFACTS_KEY];
    if (existingArtifacts !== undefined && !isRecord(existingArtifacts)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY}.${FLOOR_GROUP_ARTIFACTS_KEY} 欄位不是物件，無法安全保存樓層群組元件索引。`);
    }
    const artifacts = isRecord(existingArtifacts) ? { ...existingArtifacts } : {};
    const activeViewIds = new Set(viewIds);
    for (const viewId of Object.keys(artifacts)) {
      if (!activeViewIds.has(viewId)) delete artifacts[viewId];
    }
    for (const [viewId, viewArtifacts] of artifactsByView) {
      if (!activeViewIds.has(viewId)) continue;
      if (!isRecord(viewArtifacts)) {
        throw new Error(`View「${viewId}」的樓層群組元件索引格式無效。`);
      }
      artifacts[viewId] = {};
      for (const [floorKey, entry] of Object.entries(viewArtifacts)) {
        if (!isRecord(entry) ||
            !["titleId", "frameId", "frameShapeId"].every((key) =>
              typeof entry[key] === "string" && entry[key])) {
          throw new Error(`View「${viewId}」的樓層群組「${floorKey}」元件索引不完整。`);
        }
        artifacts[viewId][floorKey] = {
          titleId: entry.titleId,
          frameId: entry.frameId,
          frameShapeId: entry.frameShapeId
        };
      }
    }
    config.extra[GRID_SETTINGS_KEY] = {
      ...storedSettings,
      [FLOOR_GROUP_ARTIFACTS_KEY]: artifacts
    };
    return config.extra[GRID_SETTINGS_KEY][FLOOR_GROUP_ARTIFACTS_KEY];
  }

  function validateIconLibrary(icons) {
    if (!Array.isArray(icons)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY}.${ICON_LIBRARY_KEY} 欄位不是陣列。`);
    }
    const ids = new Set();
    for (const icon of icons) {
      if (!isRecord(icon) || typeof icon.id !== "string" || !icon.id ||
          typeof icon.name !== "string" || !icon.name.trim() ||
          !["image/png", "image/jpeg", "image/gif"].includes(icon.mimeType) ||
          typeof icon.dataUrl !== "string" ||
          !icon.dataUrl.startsWith(`data:${icon.mimeType};base64,`) ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(icon.dataUrl.slice(icon.dataUrl.indexOf(",") + 1))) {
        throw new Error("圖示庫包含無效項目；請確認圖片格式與 Base64 資料。");
      }
      if (ids.has(icon.id)) throw new Error(`圖示庫包含重複 ID：${icon.id}`);
      ids.add(icon.id);
    }
    return icons.map((icon) => ({ ...icon }));
  }

  function buildVisibilityActions(tagId, visibleValue) {
    if (typeof tagId !== "string" || !tagId || ![0, 1].includes(visibleValue)) {
      throw new Error("圖示可見條件需要有效的 Boolean Tag 與 0／1 狀態值。");
    }
    return [0, 1].map((value) => ({
      variableId: tagId,
      range: { min: value, max: value },
      type: value === visibleValue ? "show" : "hide",
      options: {}
    }));
  }

  function getIconLibrary(config) {
    const icons = isRecord(config) && isRecord(config.extra) &&
      isRecord(config.extra[GRID_SETTINGS_KEY])
      ? config.extra[GRID_SETTINGS_KEY][ICON_LIBRARY_KEY]
      : undefined;
    return icons === undefined ? [] : validateIconLibrary(icons);
  }

  function saveIconLibrary(config, icons) {
    if (!isRecord(config)) throw new Error("無效的配置資料。");
    if (config.extra !== undefined && !isRecord(config.extra)) {
      throw new Error("配置的 extra 欄位不是物件，無法安全保存圖示庫。");
    }
    if (!isRecord(config.extra)) config.extra = {};
    const toolSettings = config.extra[GRID_SETTINGS_KEY];
    if (toolSettings !== undefined && !isRecord(toolSettings)) {
      throw new Error(`配置的 extra.${GRID_SETTINGS_KEY} 欄位不是物件，無法安全保存圖示庫。`);
    }
    const storedSettings = isRecord(toolSettings) ? toolSettings : {};
    const validatedIcons = validateIconLibrary(icons);
    config.extra[GRID_SETTINGS_KEY] = {
      ...storedSettings,
      [ICON_LIBRARY_KEY]: validatedIcons
    };
    return config.extra[GRID_SETTINGS_KEY][ICON_LIBRARY_KEY];
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
          deviceName,
          floor: getTagFloor(tag),
          record: tag
        });
      }
    }
    return index;
  }

  function normalizeFloor(value) {
    const floor = typeof value === "string" ? value.trim() : "";
    if (!floor) return "";
    const basement = floor.match(/^b\s*(\d+)\s*f?$/i);
    if (basement) return `B${Number(basement[1])}F`;
    const aboveGround = floor.match(/^(\d+)\s*f$/i);
    if (aboveGround) return `${Number(aboveGround[1])}F`;
    return floor;
  }

  function getTagFloor(tag) {
    return isRecord(tag) && isRecord(tag.extra) ? normalizeFloor(tag.extra.floor) : "";
  }

  function setTagFloor(tag, value) {
    if (!isRecord(tag)) throw new Error("無效的 Tag 資料。");
    const floor = normalizeFloor(value);
    if (!isRecord(tag.extra)) tag.extra = {};
    if (floor) tag.extra.floor = floor;
    else delete tag.extra.floor;
    if (Object.keys(tag.extra).length === 0) delete tag.extra;
    return floor;
  }

  function compareFloors(left, right) {
    const a = normalizeFloor(left);
    const b = normalizeFloor(right);
    if (a === b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    function rank(value) {
      const basement = value.match(/^B(\d+)F$/);
      if (basement) return { category: 0, value: -Number(basement[1]) };
      const level = value.match(/^(\d+)F$/);
      if (level) return { category: 1, value: Number(level[1]) };
      if (/^(屋頂|RF|ROOF)$/i.test(value)) return { category: 2, value: 0 };
      return { category: 3, value: value.toLocaleLowerCase() };
    }

    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA.category !== rankB.category) return rankA.category - rankB.category;
    if (rankA.value < rankB.value) return -1;
    if (rankA.value > rankB.value) return 1;
    return a.localeCompare(b, "zh-Hant");
  }

  function groupByFloor(items, getFloor) {
    const groups = new Map();
    for (const item of items || []) {
      const floor = normalizeFloor(getFloor(item));
      if (!groups.has(floor)) groups.set(floor, []);
      groups.get(floor).push(item);
    }
    return Array.from(groups, ([floor, entries]) => ({
      floor,
      title: floor || "未設定樓層",
      items: entries
    })).sort((a, b) => compareFloors(a.floor, b.floor));
  }

  function groupComponentsByFloor(components, tags) {
    return groupByFloor(components, (component) => {
      const tag = tags instanceof Map ? tags.get(component.tagId) : tags && tags[component.tagId];
      return tag ? tag.floor : "";
    });
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

  function readManaged(view, Parser, floorGroupArtifacts = {}) {
    const records = [];
    const unmanaged = [];
    const movableTags = [];
    if (!isRecord(view.items) || typeof view.svgcontent !== "string") {
      return { records, unmanaged, movableTags, error: "View 缺少 items 或 svgcontent。" };
    }
    let doc;
    try {
      doc = parseSvg(view.svgcontent, Parser);
    } catch (error) {
      return { records, unmanaged, movableTags, error: error.message };
    }

    const consumed = new Set();
    const floorTitles = {};
    const floorTitleIds = {};
    const floorFrames = {};
    const floorFrameIds = {};
    const floorFrameShapeIds = {};
    const floorTitleNodes = {};
    const unassignedFloorFrames = [];
    const artifactFloorById = new Map();
    for (const [floorKey, artifact] of Object.entries(floorGroupArtifacts)) {
      if (!isRecord(artifact)) continue;
      for (const id of [artifact.titleId, artifact.frameId]) {
        if (typeof id === "string" && id) artifactFloorById.set(id, floorKey);
      }
    }
    const addFloorId = (idsByFloor, floorKey, id) => {
      if (!idsByFloor[floorKey]) idsByFloor[floorKey] = [];
      if (!idsByFloor[floorKey].includes(id)) idsByFloor[floorKey].push(id);
    };
    const inferTitleFloor = (node, id) => {
      const floor = node.getAttribute("data-floor-group");
      if (floor !== null) return `floor:${normalizeFloor(floor)}`;
      const text = (node.textContent || "").trim();
      if (text) return `floor:${normalizeFloor(text === "未設定樓層" ? "" : text)}`;
      return artifactFloorById.get(id) || "";
    };
    for (const [floorKey, artifact] of Object.entries(floorGroupArtifacts)) {
      if (!isRecord(artifact)) continue;
      if (typeof artifact.titleId === "string" && findById(doc, artifact.titleId)) {
        floorTitles[floorKey] = artifact.titleId;
        addFloorId(floorTitleIds, floorKey, artifact.titleId);
        consumed.add(artifact.titleId);
      }
      if (typeof artifact.frameId === "string" && findById(doc, artifact.frameId)) {
        floorFrames[floorKey] = artifact.frameId;
        addFloorId(floorFrameIds, floorKey, artifact.frameId);
        const shapeId = typeof artifact.frameShapeId === "string" &&
          findById(doc, artifact.frameShapeId)
          ? artifact.frameShapeId
          : findById(doc, artifact.frameId).querySelector("[id]")?.getAttribute("id");
        if (shapeId) floorFrameShapeIds[floorKey] = shapeId;
        consumed.add(artifact.frameId);
      }
    }
    const idCounts = new Map();
    for (const node of Array.from(doc.getElementsByTagName("*"))) {
      const id = node.getAttribute("id");
      if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    for (const [shapeId, shapeItem] of Object.entries(view.items)) {
      if (shapeItem && shapeItem.name === "fuxa_floor_section_frame") {
        const frameNode = findById(doc, shapeId);
        const floor = frameNode && frameNode.getAttribute("data-floor-group");
        const key = frameNode && (floor !== null
          ? `floor:${normalizeFloor(floor)}`
          : artifactFloorById.get(shapeId));
        if (frameNode && key) {
          if (!floorFrames[key]) floorFrames[key] = shapeId;
          addFloorId(floorFrameIds, key, shapeId);
          const innerShape = frameNode.querySelector("[id]");
          if (innerShape) floorFrameShapeIds[key] = innerShape.getAttribute("id");
          consumed.add(shapeId);
          continue;
        }
        if (frameNode) {
          unassignedFloorFrames.push({ id: shapeId, node: frameNode });
          consumed.add(shapeId);
          continue;
        }
      }
      if (shapeItem && shapeItem.name === "fuxa_floor_section_title") {
        const titleNode = findById(doc, shapeId);
        const key = titleNode && inferTitleFloor(titleNode, shapeId);
        if (titleNode && key) {
          if (!floorTitles[key]) floorTitles[key] = shapeId;
          addFloorId(floorTitleIds, key, shapeId);
          if (!floorTitleNodes[key]) floorTitleNodes[key] = titleNode;
          consumed.add(shapeId);
          continue;
        }
      }
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

      const alarmItemId = Object.keys(view.items).find((id) =>
        itemName(view.items[id]) === `tc_${seq}_alarm` &&
        view.items[id] && view.items[id].type === "svg-ext-shapes-select"
      );
      const alarmNode = alarmItemId ? findById(doc, alarmItemId) : null;
      const normalActions = shapeItem.property && Array.isArray(shapeItem.property.actions)
        ? shapeItem.property.actions : [];
      const alarmItem = alarmItemId && view.items[alarmItemId];
      const alarmActions = alarmItem && alarmItem.property &&
        Array.isArray(alarmItem.property.actions) ? alarmItem.property.actions : [];
      const visibilityTagId = normalActions.find((action) =>
        action && typeof action.variableId === "string"
      )?.variableId || "";
      const normalVisibleAtZero = normalActions.some((action) =>
        action.variableId === visibilityTagId && action.range && action.range.min === 0 &&
        action.range.max === 0 && action.type === "show"
      );
      const alarmVisibleAtZero = alarmActions.some((action) =>
        action.variableId === visibilityTagId && action.range && action.range.min === 0 &&
        action.range.max === 0 && action.type === "show"
      );
      const isIconPair = shapeItem.type === "svg-ext-shapes-select" &&
        alarmItem && alarmItem.property && alarmNode && shapeNode.localName === "image" &&
        alarmNode.localName === "image" && visibilityTagId &&
        normalActions.length >= 2 && alarmActions.length >= 2 &&
        alarmActions.every((action) => action.variableId === visibilityTagId);
      const iconNode = shapeNode.querySelector("image[data-fuxa-icon-id]");
      const iconId = shapeNode.getAttribute("data-fuxa-icon-id") ||
        (iconNode && iconNode.getAttribute("data-fuxa-icon-id"));
      const shapeType = isIconPair
        ? "icon-pair"
        : iconId ? "icon"
        : shapeItem.type === "svg-ext-shapes-cylinder" ? "cylinder" : "rect";
      const ranges = shapeItem.property && Array.isArray(shapeItem.property.ranges)
        ? shapeItem.property.ranges : [];
      const colors = ranges.map((range) => range.color);
      const palette = colors[0] === PALETTES.alarm[0] ? "alarm" : "normal";
      records.push({
        key: `loaded-${seq}`,
        seq,
        tagId: isIconPair
          ? visibilityTagId
          : shapeItem.property && typeof shapeItem.property.variableId === "string"
            ? shapeItem.property.variableId : "",
        label: labelNode.textContent || "",
        template: shapeType,
        ...(iconId && !isIconPair ? { iconId } : {}),
        ...(isIconPair ? {
          normalIconId: shapeNode.getAttribute("data-fuxa-icon-id") || "",
          alarmIconId: alarmNode.getAttribute("data-fuxa-icon-id") || "",
          alarmShapeId: alarmItemId,
          invertIconState: !normalVisibleAtZero && alarmVisibleAtZero
        } : {}),
        palette,
        shapeId,
        labelId,
        shapeInnerIds: isIconPair
          ? []
          : Array.from(shapeNode.querySelectorAll("[id]")).map((node) => node.getAttribute("id")),
        managed: true
      });
      consumed.add(shapeId);
      if (isIconPair) consumed.add(alarmItemId);
      consumed.add(labelId);
    }

    for (const { id, node } of unassignedFloorFrames) {
      const shape = node.localName === "rect" ? node : node.querySelector("rect");
      if (!shape) continue;
      const bounds = ["x", "y", "width", "height"].map((key) =>
        Number(shape.getAttribute(key))
      );
      if (!bounds.every(Number.isFinite)) continue;
      const [x, y, width, height] = bounds;
      const matchingFloors = Object.entries(floorTitleNodes).filter(([, title]) => {
        const titleX = Number(title.getAttribute("x"));
        const titleY = Number(title.getAttribute("y"));
        return Number.isFinite(titleX) && Number.isFinite(titleY) &&
          titleX >= x && titleX <= x + width &&
          titleY >= y && titleY <= y + height;
      });
      if (matchingFloors.length !== 1) continue;
      const [key] = matchingFloors[0];
      const isCanonicalFrame = !floorFrames[key];
      if (isCanonicalFrame) floorFrames[key] = id;
      addFloorId(floorFrameIds, key, id);
      if (isCanonicalFrame) {
        const innerShape = node.querySelector("[id]");
        if (innerShape) floorFrameShapeIds[key] = innerShape.getAttribute("id");
      }
    }

    for (const [id, item] of Object.entries(view.items)) {
      if (consumed.has(id)) continue;
      if (item && item.property && typeof item.property.variableId === "string") {
        const node = findById(doc, id);
        let reason = "";
        if (!node) {
          reason = "找不到對應的 SVG 元件";
        } else if (idCounts.get(id) !== 1) {
          reason = "SVG 元件 ID 重複，無法安全辨識位置";
        } else if (node.namespaceURI !== "http://www.w3.org/2000/svg" ||
                   !SVG_GRAPHICS.has(node.localName)) {
          reason = `不支援移動 SVG ${node.localName} 元件`;
        } else if (node.getAttribute("transform") &&
                   !(node.getAttribute("data-fuxa-floor-layout") === "floor-layout-v1" &&
                     FLOOR_LAYOUT_TRANSFORM.test(node.getAttribute("transform")))) {
          reason = "元件已有 transform，為避免改變原有定位而不自動移動";
        } else {
          let parent = node.parentElement;
          while (parent && parent.localName !== "svg") {
            if (parent.getAttribute("transform")) {
              reason = "上層 SVG 群組已有 transform，為避免改變原有定位而不自動移動";
              break;
            }
            parent = parent.parentElement;
          }
        }
        const candidate = {
          id,
          name: itemName(item) || id,
          tagId: item.property.variableId,
          type: typeof item.type === "string" ? item.type : "",
          nodeName: node ? node.localName : "",
          reason
        };
        if (reason) unmanaged.push(candidate);
        else movableTags.push(candidate);
      }
    }
    records.sort((a, b) => a.seq - b.seq);
    return {
      records, unmanaged, movableTags, floorTitles, floorTitleIds,
      floorFrames, floorFrameIds, floorFrameShapeIds, doc
    };
  }

  function layoutComponents(components, settings) {
    const grid = { ...DEFAULT_GRID, ...settings };
    const columns = Math.max(1, Math.floor(Number(grid.columns) || 1));
    const gapX = Math.max(0, Number(grid.gapX) || 0);
    const gapY = Math.max(0, Number(grid.gapY) || 0);
    const labelOffset = Math.max(0, Number(grid.labelOffset) || 0);
    const fontSize = Math.max(8, Number(grid.labelFontSize) || DEFAULT_GRID.labelFontSize);
    const rows = Math.ceil(components.length / columns);
    const columnWidths = Array(columns).fill(0);
    const rowHeights = Array(rows).fill(0);
    const sizes = components.map((component) => {
      const standard = component.template === "cylinder" ? CYLINDER_SIZE : RECT_SIZE;
      const width = Number(component.layoutWidth);
      const height = Number(component.layoutHeight);
      return {
        width: Number.isFinite(width) && width > 0 ? width : standard.width,
        height: Number.isFinite(height) && height > 0 ? height : standard.height
      };
    });
    for (const [index, size] of sizes.entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      columnWidths[col] = Math.max(columnWidths[col], size.width);
      rowHeights[row] = Math.max(rowHeights[row], size.height + fontSize + labelOffset);
    }
    const placements = [];
    for (const [index, component] of components.entries()) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const size = sizes[index];
      const cellX = Number(grid.originX) +
        columnWidths.slice(0, col).reduce((sum, width) => sum + width + gapX, 0);
      const cellY = Number(grid.originY) +
        rowHeights.slice(0, row).reduce((sum, height) => sum + height + gapY, 0);
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

  function layoutFloorComponents(components, settings, tags, frameSettings) {
    const grid = { ...DEFAULT_GRID, ...settings };
    const frame = normalizeFloorGroupFrameSettings(frameSettings);
    const sectionGap = Math.max(0, Number(grid.gapY) || 0);
    const titleFontSize = Math.max(8, Number(grid.labelFontSize) || DEFAULT_GRID.labelFontSize);
    const sections = [];
    const placements = [];
    let nextTitleY = Number(grid.originY) || 0;

    for (const group of groupComponentsByFloor(components, tags)) {
      const titleY = nextTitleY + titleFontSize;
      const sectionGrid = {
        ...grid,
        originY: titleY + sectionGap + titleFontSize + Number(grid.labelOffset || 0)
      };
      const sectionPlacements = layoutComponents(group.items, sectionGrid);
      const entries = group.items.map((component, index) => ({
        component,
        placement: sectionPlacements[index]
      }));
      const bounds = {
        left: Number(grid.originX) || 0,
        top: titleY - titleFontSize * 0.8,
        right: (Number(grid.originX) || 0) +
          measureSvgText(group.title, titleFontSize),
        bottom: titleY + titleFontSize * 0.2
      };
      for (const { component, placement } of entries) {
        bounds.left = Math.min(bounds.left, placement.shape.x);
        bounds.top = Math.min(bounds.top, placement.shape.y);
        bounds.right = Math.max(bounds.right, placement.shape.x + placement.shape.width);
        bounds.bottom = Math.max(bounds.bottom, placement.shape.y + placement.shape.height);
        if (component.managed === false && component.originalBounds) {
          const dx = placement.shape.x - component.originalBounds.x;
          const dy = placement.shape.y - component.originalBounds.y;
          for (const companion of component.companions || []) {
            if (!companion.bounds) continue;
            bounds.left = Math.min(bounds.left, companion.bounds.x + dx);
            bounds.top = Math.min(bounds.top, companion.bounds.y + dy);
            bounds.right = Math.max(bounds.right, companion.bounds.x + dx + companion.bounds.width);
            bounds.bottom = Math.max(bounds.bottom, companion.bounds.y + dy + companion.bounds.height);
          }
        }
        const labelBounds = getSvgTextBounds(
          component.label, placement.label.x, placement.label.y,
          placement.label.anchor, titleFontSize
        );
        bounds.left = Math.min(bounds.left, labelBounds.left);
        bounds.top = Math.min(bounds.top, labelBounds.top);
        bounds.right = Math.max(bounds.right, labelBounds.right);
        bounds.bottom = Math.max(bounds.bottom, labelBounds.bottom);
      }
      const sectionFrame = {
        x: bounds.left - frame.padding,
        y: bounds.top - frame.padding,
        width: bounds.right - bounds.left + frame.padding * 2,
        height: bounds.bottom - bounds.top + frame.padding * 2
      };
      sections.push({
        floor: group.floor,
        title: group.title,
        titleY,
        x: Number(grid.originX) || 0,
        frame: sectionFrame,
        entries
      });
      placements.push(...entries);
      nextTitleY = sectionFrame.y + sectionFrame.height + sectionGap + frame.padding;
    }
    return { sections, placements };
  }

  function measureSvgText(text, fontSize) {
    return Array.from(String(text || "")).reduce((width, character) =>
      width + fontSize * (character.codePointAt(0) > 0x2e80 ? 1 : 0.6), 0);
  }

  function getSvgTextBounds(text, x, y, anchor, fontSize) {
    const width = measureSvgText(text, fontSize);
    const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    return { left, right: left + width, top: y - fontSize * 0.8, bottom: y + fontSize * 0.2 };
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
    const defaultFloor = normalizeFloor(opts.defaultFloor);
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
      const floor = normalizeFloor(parts.length > 5 && parts[5] ? parts[5] : defaultFloor);

      results.push({
        name,
        address,
        type,
        memaddress,
        description,
        floor
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
      const floor = normalizeFloor(spec.floor);
      if (floor) tag.extra = { floor };
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
    DEFAULT_GRID, DEFAULT_FLOOR_GROUP_FRAME, GRID_SETTINGS_KEY, ICON_LIBRARY_KEY,
    MANAGED_NAME, PALETTES, RECT_SIZE, CYLINDER_SIZE,
    buildTagIndex, findById, generateId, hasViewShape, isRecord,
    normalizeGridSettings, getViewGridSettings, saveViewGridSettings,
    normalizeFloorGroupFrameSettings, getFloorGroupFrameSettings, saveFloorGroupFrameSettings,
    getIconLibrary, saveIconLibrary,
    buildVisibilityActions,
    getFloorGroupArtifacts, saveFloorGroupArtifacts,
    layoutComponents, layoutFloorComponents, groupByFloor, groupComponentsByFloor,
    normalizeFloor, compareFloors, getTagFloor, setTagFloor,
    parseSvg, readManaged, removeLayoutViewReferences,
    serializeConfig, validateConfig,
    createModbusTcpDevice, updateModbusTcpDevice, getNextAvailableAddress,
    parseTagBatchInput, batchCreateTags, syncDeviceConnectionTag, removeDevice
  };
});
