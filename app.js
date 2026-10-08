(function () {
  "use strict";

  const D = window.FuxaToolDomain;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const $ = (selector) => document.querySelector(selector);
  const state = {
    config: null,
    originalText: "",
    lineEnding: "\n",
    hasTrailingNewline: false,
    fileName: "",
    tags: new Map(),
    models: new Map(),
    baselines: new Map(),
    originalViewIds: [],
    originalViewNames: [],
    originalLayout: null,
    viewTitleIds: new Map(),
    selectedViewId: "",
    usedIds: new Set(),
    usedViewIds: new Set(),
    createdIds: new Set(),
    undoStack: [],
    redoStack: []
  };

  const elements = {
    fileInput: $("#config-file"),
    fileName: $("#file-name"),
    status: $("#status"),
    workspace: $("#workspace"),
    viewList: $("#view-list"),
    viewName: $("#selected-view-name"),
    viewMeta: $("#selected-view-meta"),
    rows: $("#component-rows"),
    addView: $("#add-view-button"),
    renameView: $("#rename-view-button"),
    deleteView: $("#delete-view-button"),
    previewHost: $("#preview-host"),
    previewSize: $("#preview-size"),
    previewWarning: $("#preview-warning"),
    addOne: $("#add-one-button"),
    addMany: $("#add-many-button"),
    save: $("#save-button"),
    undo: $("#undo-button"),
    redo: $("#redo-button"),
    dialog: $("#batch-dialog"),
    tagChoices: $("#tag-choices"),
    tagSearch: $("#tag-search"),
    batchConfirm: $("#batch-confirm"),
    newViewDialog: $("#new-view-dialog"),
    newViewName: $("#new-view-name"),
    viewNameDialogTitle: $("#view-name-dialog-title"),
    viewNameDialogDescription: $("#view-name-dialog-description"),
    viewNameConfirm: $("#new-view-confirm"),
    deleteViewDialog: $("#delete-view-dialog"),
    deleteViewMessage: $("#delete-view-message")
  };
  const batchSelection = new Set();
  const gridInputs = {
    columns: $("#grid-columns"),
    originX: $("#grid-x"),
    originY: $("#grid-y"),
    gapX: $("#grid-gap-x"),
    gapY: $("#grid-gap-y"),
    labelPosition: $("#grid-label-position"),
    labelOffset: $("#grid-label-offset"),
    labelFontSize: $("#grid-font-size")
  };

  function setStatus(message, kind) {
    elements.status.textContent = message;
    elements.status.className = `status ${kind || "info"}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function selectedView() {
    return state.config.hmi.views.find((view) => view.id === state.selectedViewId);
  }

  function selectedModel() {
    return state.models.get(state.selectedViewId);
  }

  function allocateId(prefix) {
    const id = D.generateId(prefix, state.usedIds, window.crypto);
    state.createdIds.add(id);
    return id;
  }

  function reserveExistingIds(config) {
    const ids = new Set();
    for (const view of config.hmi.views) {
      if (typeof view.id === "string") ids.add(view.id);
      if (D.isRecord(view.items)) {
        for (const id of Object.keys(view.items)) ids.add(id);
      }
      if (typeof view.svgcontent === "string") {
        try {
          const doc = D.parseSvg(view.svgcontent, window.DOMParser);
          for (const node of Array.from(doc.getElementsByTagName("*"))) {
            const id = node.getAttribute("id");
            if (id) ids.add(id);
          }
        } catch (_) {
          // Invalid views are kept read-only and do not contribute editable ids.
        }
      }
    }
    return ids;
  }

  function loadConfig(text, fileName) {
    let config;
    try {
      config = D.validateConfig(JSON.parse(text));
    } catch (error) {
      throw new Error(error instanceof SyntaxError
        ? `JSON 格式錯誤：${error.message}` : error.message);
    }
    state.config = config;
    state.originalText = text;
    state.lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    state.hasTrailingNewline = /(?:\r\n|\n)$/.test(text);
    state.fileName = fileName || "fuxa-config.json";
    state.tags = D.buildTagIndex(config);
    state.models = new Map();
    state.baselines = new Map();
    state.usedIds = reserveExistingIds(config);
    state.usedViewIds = new Set(config.hmi.views.map((view) => view.id).filter(Boolean));
    state.createdIds = new Set();
    state.originalViewIds = config.hmi.views.map((view) => view.id);
    state.originalViewNames = config.hmi.views.map((view) => [view.id, view.name || ""]);
    state.originalLayout = clone(config.hmi.layout || null);
    state.viewTitleIds = new Map();
    state.undoStack = [];
    state.redoStack = [];

    for (const view of config.hmi.views) {
      if (!D.hasViewShape(view)) continue;
      const parsed = D.readManaged(view, window.DOMParser);
      if (parsed.error) continue;
      state.models.set(view.id, {
        viewId: view.id,
        components: parsed.records,
        originalComponents: clone(parsed.records),
        unmanaged: parsed.unmanaged,
        grid: { ...D.DEFAULT_GRID }
      });
    }
    for (const [viewId, model] of state.models) {
      state.baselines.set(viewId, JSON.stringify({
        components: model.components,
        grid: model.grid
      }));
    }
    state.selectedViewId = config.hmi.views.length ? config.hmi.views[0].id : "";
    elements.fileName.textContent = state.fileName;
    elements.workspace.hidden = false;
    renderAll();
    setStatus(`已載入 ${config.hmi.views.length} 個 View、${state.tags.size} 個 Tag。檔案資料僅在本機處理。`, "success");
  }

  function modelSnapshot() {
    return JSON.stringify({
      views: state.config.hmi.views,
      layout: state.config.hmi.layout,
      models: Array.from(state.models.entries()),
      baselines: Array.from(state.baselines.entries()),
      viewTitleIds: Array.from(state.viewTitleIds.entries()),
      selectedViewId: state.selectedViewId
    });
  }

  function rememberUndo() {
    state.undoStack.push(modelSnapshot());
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function restoreSnapshot(snapshot) {
    const saved = JSON.parse(snapshot);
    state.config.hmi.views = saved.views;
    state.config.hmi.layout = saved.layout;
    state.models = new Map(saved.models);
    state.baselines = new Map(saved.baselines);
    state.viewTitleIds = new Map(saved.viewTitleIds || []);
    state.selectedViewId = saved.selectedViewId;
    renderAll();
  }

  function updateHistoryButtons() {
    elements.undo.disabled = state.undoStack.length === 0;
    elements.redo.disabled = state.redoStack.length === 0;
  }

  function undo() {
    if (!state.undoStack.length) return;
    state.redoStack.push(modelSnapshot());
    restoreSnapshot(state.undoStack.pop());
    updateHistoryButtons();
    setStatus("已復原變更。", "info");
  }

  function redo() {
    if (!state.redoStack.length) return;
    state.undoStack.push(modelSnapshot());
    restoreSnapshot(state.redoStack.pop());
    updateHistoryButtons();
    setStatus("已重做變更。", "info");
  }

  function makeOption(value, label, selected) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    return option;
  }

  function makeTagSelect(value) {
    const select = document.createElement("select");
    select.className = "tag-select";
    select.append(makeOption("", "選擇 Tag…", !value));
    const groups = new Map();
    for (const tag of state.tags.values()) {
      if (!groups.has(tag.deviceId)) {
        const group = document.createElement("optgroup");
        group.label = tag.deviceName;
        groups.set(tag.deviceId, group);
        select.append(group);
      }
      const group = groups.get(tag.deviceId);
      group.append(makeOption(tag.id, `${tag.name} (${tag.type || "未設定型別"}) · ${tag.id}`, tag.id === value));
    }
    return select;
  }

  function makeSelect(options, value, className) {
    const select = document.createElement("select");
    if (className) select.className = className;
    for (const [optionValue, label] of options) {
      select.append(makeOption(optionValue, label, optionValue === value));
    }
    return select;
  }

  function createActionButton(text, action, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.dataset.action = action;
    button.disabled = Boolean(disabled);
    return button;
  }

  function createManagedRow(component, index, total) {
    const row = document.createElement("tr");
    row.dataset.key = component.key;
    const sequenceCell = document.createElement("td");
    sequenceCell.textContent = String(index + 1);
    row.append(sequenceCell);

    const labelCell = document.createElement("td");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = component.label;
    labelInput.maxLength = 160;
    labelInput.dataset.field = "label";
    labelInput.setAttribute("aria-label", "Label 文字");
    labelCell.append(labelInput);
    row.append(labelCell);

    const tagCell = document.createElement("td");
    const tagSelect = makeTagSelect(component.tagId);
    tagSelect.dataset.field = "tagId";
    tagSelect.setAttribute("aria-label", "連結 Tag");
    const currentTag = state.tags.get(component.tagId);
    if (currentTag && currentTag.type.toLocaleLowerCase() !== "bool") {
      tagSelect.title = `此 Tag 型別為 ${currentTag.type}；第一版配色範圍僅針對 Bool，請在 FUXA 確認顯示範圍。`;
    }
    tagCell.append(tagSelect);
    row.append(tagCell);

    const templateCell = document.createElement("td");
    templateCell.append(makeSelect([
      ["rect", "矩形"], ["cylinder", "圓柱"]
    ], component.template, "compact-select"));
    templateCell.firstElementChild.dataset.field = "template";
    row.append(templateCell);

    const paletteCell = document.createElement("td");
    paletteCell.append(makeSelect([
      ["normal", "運轉：綠／紅"], ["alarm", "警報：紅／綠"]
    ], component.palette, "compact-select"));
    paletteCell.firstElementChild.dataset.field = "palette";
    row.append(paletteCell);

    const actionCell = document.createElement("td");
    const actionBox = document.createElement("div");
    actionBox.className = "row-actions";
    actionBox.append(createActionButton("↑", "up", index === 0));
    actionBox.append(createActionButton("↓", "down", index === total - 1));
    actionBox.append(createActionButton("刪除", "delete", false));
    actionCell.append(actionBox);
    row.append(actionCell);
    return row;
  }

  function renderRows() {
    elements.rows.replaceChildren();
    const view = selectedView();
    const model = selectedModel();
    if (!view || !model) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "empty-cell";
      cell.textContent = "此 View 結構無法安全編輯，配置會保留原樣。";
      row.append(cell);
      elements.rows.append(row);
      return;
    }
    if (!model.components.length && !model.unmanaged.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.className = "empty-cell";
      cell.textContent = "此 View 尚無 Tag 元件，按「新增一筆」或「批次新增」。";
      row.append(cell);
      elements.rows.append(row);
    }
    model.components.forEach((component, index) => {
      elements.rows.append(createManagedRow(component, index, model.components.length));
    });
    for (const item of model.unmanaged) {
      const row = document.createElement("tr");
      row.className = "readonly-row";
      const sequence = document.createElement("td");
      sequence.textContent = "—";
      const label = document.createElement("td");
      label.textContent = item.name;
      const tagCell = document.createElement("td");
      const tag = state.tags.get(item.tagId);
      tagCell.textContent = tag ? `${tag.deviceName}／${tag.name}` : `Tag 不存在（${item.tagId}）`;
      const type = document.createElement("td");
      type.textContent = `唯讀：${item.type}`;
      const palette = document.createElement("td");
      palette.textContent = "—";
      const operations = document.createElement("td");
      operations.textContent = "非工具管理";
      row.append(sequence, label, tagCell, type, palette, operations);
      elements.rows.append(row);
    }
  }

  function renderViewList() {
    elements.viewList.replaceChildren();
    for (const view of state.config.hmi.views) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "view-option";
      if (view.id === state.selectedViewId) button.classList.add("active");
      const model = state.models.get(view.id);
      if (!model) button.classList.add("invalid");
      const title = document.createElement("strong");
      title.textContent = view.name || view.id || "未命名 View";
      const summary = document.createElement("small");
      summary.textContent = model
        ? `${model.components.length} 筆可管理 · ${model.unmanaged.length} 筆唯讀`
        : "結構無效 · 唯讀";
      button.append(title, summary);
      button.addEventListener("click", () => {
        state.selectedViewId = view.id;
        renderAll();
      });
      elements.viewList.append(button);
    }
  }

  function renderGridControls() {
    const model = selectedModel();
    const disabled = !model;
    for (const [key, input] of Object.entries(gridInputs)) {
      input.disabled = disabled;
      if (model) input.value = String(model.grid[key]);
    }
  }

  function createSvgNode(doc, name, attributes) {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function buildShapeNode(doc, component, placement) {
    const type = component.template === "cylinder"
      ? "svg-ext-shapes-cylinder" : "svg-ext-shapes-rectangle";
    const group = createSvgNode(doc, "g", {
      "data-name": `tc_${component.seq}`,
      id: component.shapeId,
      type,
      fill: "#FFFFFF",
      stroke: "#000000",
      "font-size": "14",
      "font-family": "sans-serif",
      "text-anchor": "middle"
    });
    const x = placement.shape.x;
    const y = placement.shape.y;
    component.shapeInnerIds = component.shapeInnerIds || [];
    if (component.template === "cylinder") {
      const width = D.CYLINDER_SIZE.width;
      const height = D.CYLINDER_SIZE.height;
      const ry = Math.min(10, height / 6);
      while (component.shapeInnerIds.length < 2) component.shapeInnerIds.push(allocateId("SHE"));
      const top = y + ry;
      const bottom = y + height - ry;
      const first = `M ${x} ${top} C ${x} ${y} ${x + width} ${y} ${x + width} ${top} L ${x + width} ${bottom} C ${x + width} ${y + height} ${x} ${y + height} ${x} ${bottom} Z`;
      const second = `M ${x} ${top} C ${x} ${top + ry * 2} ${x + width} ${top + ry * 2} ${x + width} ${top}`;
      group.append(
        createSvgNode(doc, "path", { id: component.shapeInnerIds[0], d: first }),
        createSvgNode(doc, "path", { id: component.shapeInnerIds[1], d: second })
      );
    } else {
      while (component.shapeInnerIds.length < 1) component.shapeInnerIds.push(allocateId("SHE"));
      group.append(createSvgNode(doc, "rect", {
        id: component.shapeInnerIds[0],
        x, y, width: D.RECT_SIZE.width, height: D.RECT_SIZE.height
      }));
    }
    return group;
  }

  function buildLabelNode(doc, component, placement, grid) {
    const text = createSvgNode(doc, "text", {
      "data-name": `tc_${component.seq}_label`,
      id: component.labelId,
      x: placement.label.x,
      y: placement.label.y,
      fill: "#000000",
      stroke: "#000000",
      "stroke-width": "0",
      "font-size": grid.labelFontSize,
      "font-family": "sans-serif",
      "text-anchor": placement.label.anchor,
      "xml:space": "preserve"
    });
    text.textContent = component.label;
    return text;
  }

  function getLayer(doc) {
    const root = doc.documentElement || doc;
    const groups = Array.from(root.children).filter((node) => node.localName === "g");
    for (const group of groups) {
      if (Array.from(group.getElementsByTagName("title")).some((title) => title.textContent === "Layer 1")) {
        return group;
      }
    }
    return groups[0] || null;
  }

  function managedIds(model) {
    const ids = new Set();
    for (const component of [...(model.originalComponents || []), ...model.components]) {
      ids.add(component.shapeId);
      ids.add(component.labelId);
    }
    return ids;
  }

  function removeManagedFromView(view, model, doc) {
    const ids = managedIds(model);
    for (const id of ids) {
      const node = D.findById(doc, id);
      if (node && node.parentNode) node.parentNode.removeChild(node);
      delete view.items[id];
    }
  }

  function buildItemEntry(existing, component, shape) {
    const oldProperty = existing && D.isRecord(existing.property) ? existing.property : {};
    const nextProperty = {
      ...oldProperty,
      variableId: component.tagId,
      ranges: D.PALETTES[component.palette].map((color, value) => ({
        min: value === 0 ? 1 : 0,
        max: value === 0 ? 1 : 0,
        color,
        type: 2,
        stroke: ""
      }))
    };
    if (!Array.isArray(nextProperty.events)) nextProperty.events = [];
    if (!Array.isArray(nextProperty.actions)) nextProperty.actions = [];
    return {
      ...(existing || {}),
      id: component.shapeId,
      type: shape.getAttribute("type"),
      name: `tc_${component.seq}`,
      property: nextProperty,
      label: "Shapes",
      hide: false,
      lock: false
    };
  }

  function buildLabelEntry(existing, component) {
    return {
      ...(existing || {}),
      id: component.labelId,
      type: "svg-ext-shapes-text",
      name: `tc_${component.seq}_label`,
      property: null,
      label: "Shapes",
      hide: false,
      lock: false
    };
  }

  function applyModelToView(view, model) {
    const doc = D.parseSvg(view.svgcontent, window.DOMParser);
    const layer = getLayer(doc);
    if (!layer) throw new Error(`View「${view.name || view.id}」找不到可安全插入元件的 SVG 圖層。`);
    const previousItems = { ...view.items };
    removeManagedFromView(view, model, doc);
    const placements = D.layoutComponents(model.components, model.grid);
    for (const [index, component] of model.components.entries()) {
      const placement = placements[index];
      const previousShape = previousItems[component.shapeId];
      const previousLabel = previousItems[component.labelId];
      const shapeNode = buildShapeNode(doc, component, placement);
      const labelNode = buildLabelNode(doc, component, placement, model.grid);
      layer.append(shapeNode, labelNode);
      view.items[component.shapeId] = buildItemEntry(previousShape, component, shapeNode);
      view.items[component.labelId] = buildLabelEntry(previousLabel, component);
    }
    view.svgcontent = new XMLSerializer().serializeToString(doc);
  }

  function sanitizePreview(doc) {
    for (const node of Array.from(doc.querySelectorAll("script, foreignObject, style, iframe, object, embed"))) node.remove();
    for (const node of Array.from(doc.getElementsByTagName("*"))) {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith("on") ||
            ((name === "href" || name === "xlink:href") &&
              value && !value.startsWith("#") && !value.startsWith("data:image/")) ||
            name === "style") {
          node.removeAttribute(attr.name);
        }
      }
    }
  }

  function renderPreview() {
    elements.previewHost.replaceChildren();
    const view = selectedView();
    const model = selectedModel();
    if (!view || !model) return;
    try {
      const previewView = clone(view);
      applyModelToView(previewView, model);
      const doc = D.parseSvg(previewView.svgcontent, window.DOMParser);
      sanitizePreview(doc);
      const svg = document.importNode(doc.documentElement, true);
      const width = Number(view.profile && view.profile.width) || 1024;
      const height = Number(view.profile && view.profile.height) || 768;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
      const background = createSvgNode(svg.ownerDocument, "rect", {
        x: 0, y: 0, width, height,
        fill: view.profile && view.profile.bkcolor ? view.profile.bkcolor : "#ffffffff"
      });
      svg.insertBefore(background, svg.firstChild);
      for (const node of Array.from(svg.children)) {
        for (const descendant of [node, ...Array.from(node.querySelectorAll("*"))]) {
          descendant.setAttribute("opacity", "0.42");
        }
      }
      const layer = getLayer(svg);
      if (!layer) throw new Error("無法建立預覽圖層。");
      const placements = D.layoutComponents(model.components, model.grid);
      for (const [index, component] of model.components.entries()) {
        const previewComponent = { ...component };
        const shape = buildShapeNode(svg.ownerDocument, previewComponent, placements[index]);
        const label = buildLabelNode(svg.ownerDocument, previewComponent, placements[index], model.grid);
        shape.removeAttribute("opacity");
        label.removeAttribute("opacity");
        for (const child of Array.from(shape.querySelectorAll("*"))) child.removeAttribute("opacity");
        layer.append(shape, label);
      }
      elements.previewHost.append(svg);
      elements.previewSize.textContent = `${width} × ${height}`;
      const outside = placements.some(({ shape }) =>
        shape.x < 0 || shape.y < 0 || shape.x + shape.width > width || shape.y + shape.height > height
      );
      elements.previewWarning.hidden = !outside;
    } catch (error) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = `無法顯示預覽：${error.message}`;
      elements.previewHost.append(message);
    }
  }

  function isDirty() {
    const currentViewIds = state.config.hmi.views.map((view) => view.id);
    if (JSON.stringify(currentViewIds) !== JSON.stringify(state.originalViewIds)) return true;
    const currentViewNames = state.config.hmi.views.map((view) => [view.id, view.name || ""]);
    if (JSON.stringify(currentViewNames) !== JSON.stringify(state.originalViewNames)) return true;
    if (JSON.stringify(state.config.hmi.layout || null) !== JSON.stringify(state.originalLayout)) return true;
    for (const [viewId, model] of state.models) {
      const current = JSON.stringify({
        components: model.components,
        grid: model.grid
      });
      if (current !== state.baselines.get(viewId)) return true;
    }
    return false;
  }

  function renderAll() {
    if (!state.config) return;
    renderViewList();
    const view = selectedView();
    const model = selectedModel();
    elements.viewName.textContent = view ? (view.name || view.id) : "選取 View";
    elements.viewMeta.textContent = view
      ? `畫布 ${Number(view.profile && view.profile.width) || 1024} × ${Number(view.profile && view.profile.height) || 768}`
      : "";
    elements.addOne.disabled = !model;
    elements.addMany.disabled = !model || state.tags.size === 0;
    elements.save.disabled = !state.config;
    elements.addView.disabled = !state.config;
    elements.renameView.disabled = !view;
    elements.deleteView.disabled = !view || state.config.hmi.views.length <= 1;
    renderGridControls();
    renderRows();
    renderPreview();
    updateHistoryButtons();
  }

  function mutateComponent(key, field, value) {
    const model = selectedModel();
    if (!model) return;
    const component = model.components.find((item) => item.key === key);
    if (!component || component[field] === value) return;
    rememberUndo();
    component[field] = value;
    renderPreview();
  }

  function addComponent(tagId, label) {
    const model = selectedModel();
    if (!model) return;
    const seq = model.components.reduce((max, item) => Math.max(max, item.seq), 0) + 1;
    const shapeId = allocateId("SHE");
    const labelId = allocateId("svg");
    const shapeInnerIds = [allocateId("SHE")];
    rememberUndo();
    model.components.push({
      key: `new-${crypto.randomUUID()}`,
      seq,
      tagId: tagId || "",
      label: label || "",
      template: "rect",
      palette: "normal",
      shapeId,
      labelId,
      shapeInnerIds,
      managed: true
    });
    renderAll();
  }

  function openNewViewDialog() {
    if (!state.config) return;
    elements.newViewDialog.dataset.mode = "create";
    elements.newViewName.value = "";
    elements.viewNameDialogTitle.textContent = "新增空白 View";
    elements.viewNameDialogDescription.textContent = "建立空白畫布，之後可新增 Tag 元件。";
    elements.viewNameConfirm.textContent = "建立 View";
    elements.newViewDialog.showModal();
    elements.newViewName.focus();
  }

  function openRenameViewDialog() {
    const view = selectedView();
    if (!view) return;
    elements.newViewDialog.dataset.mode = "rename";
    elements.newViewDialog.dataset.viewId = view.id;
    elements.newViewName.value = view.name || "";
    elements.viewNameDialogTitle.textContent = "修改 View 名稱";
    elements.viewNameDialogDescription.textContent = "修改名稱不會變更 View ID 或其導覽連結。";
    elements.viewNameConfirm.textContent = "儲存名稱";
    elements.newViewDialog.showModal();
    elements.newViewName.focus();
    elements.newViewName.select();
  }

  function createBlankView(name) {
    const profile = {
      width: 1024,
      height: 768,
      bkcolor: "#ffffffff",
      margin: 10,
      align: "topCenter",
      gridType: "fixed",
      viewRenderDelay: 0
    };
    const active = selectedView();
    if (active && D.isRecord(active.profile)) {
      Object.assign(profile, {
        width: Number(active.profile.width) || profile.width,
        height: Number(active.profile.height) || profile.height,
        bkcolor: active.profile.bkcolor || profile.bkcolor
      });
    }
    const id = D.generateId("v", state.usedViewIds, window.crypto);
    state.usedIds.add(id);
    const titleId = allocateId("svg");
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(profile.width));
    svg.setAttribute("height", String(profile.height));
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("xmlns:svg", SVG_NS);
    const layer = createSvgNode(document, "g", {});
    const layerTitle = createSvgNode(document, "title", {});
    layerTitle.textContent = "Layer 1";
    layer.append(layerTitle);
    const title = createSvgNode(document, "text", {
      "data-name": "view_title",
      id: titleId,
      x: 20,
      y: 36,
      fill: "#000000",
      stroke: "#000000",
      "stroke-width": 0,
      "font-size": 24,
      "font-family": "sans-serif",
      "text-anchor": "start",
      "xml:space": "preserve"
    });
    title.textContent = name;
    layer.append(title);
    svg.append(layer);
    return {
      titleId,
      view: {
        id,
        name,
        profile,
        items: {
          [titleId]: {
            id: titleId,
            type: "svg-ext-shapes-text",
            name: "view_title",
            property: null,
            label: "Shapes",
            hide: false,
            lock: false
          }
        },
        variables: {},
        svgcontent: new XMLSerializer().serializeToString(svg),
        type: "svg"
      }
    };
  }

  function createView(name) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setStatus("View 名稱不可空白。", "error");
      return false;
    }
    if (state.config.hmi.views.some((view) =>
      (view.name || "").trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    )) {
      setStatus(`View「${normalizedName}」已存在，請使用不同名稱。`, "error");
      return false;
    }
    rememberUndo();
    const { view, titleId } = createBlankView(normalizedName);
    state.viewTitleIds.set(view.id, titleId);
    state.config.hmi.views.push(view);
    const model = {
      viewId: view.id,
      components: [],
      originalComponents: [],
      unmanaged: [],
      grid: { ...D.DEFAULT_GRID }
    };
    state.models.set(view.id, model);
    state.baselines.set(view.id, JSON.stringify({
      components: model.components,
      grid: model.grid
    }));
    state.selectedViewId = view.id;
    renderAll();
    setStatus(`已新增空白 View「${normalizedName}」。`, "success");
    return true;
  }

  function renameView(viewId, name) {
    const view = state.config.hmi.views.find((candidate) => candidate.id === viewId);
    if (!view) return false;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setStatus("View 名稱不可空白。", "error");
      return false;
    }
    if (state.config.hmi.views.some((candidate) =>
      candidate.id !== viewId &&
      (candidate.name || "").trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    )) {
      setStatus(`View「${normalizedName}」已存在，請使用不同名稱。`, "error");
      return false;
    }
    if (view.name === normalizedName) return true;
    rememberUndo();
    const titleId = state.viewTitleIds.get(viewId);
    if (titleId) {
      const titleNode = D.findById(D.parseSvg(view.svgcontent, window.DOMParser), titleId);
      if (titleNode) {
        titleNode.textContent = normalizedName;
        view.svgcontent = new XMLSerializer().serializeToString(titleNode.ownerDocument);
      }
    }
    view.name = normalizedName;
    renderAll();
    setStatus(`已將 View 名稱修改為「${normalizedName}」。`, "success");
    return true;
  }

  function deleteSelectedView() {
    const view = selectedView();
    if (!view || state.config.hmi.views.length <= 1) return;
    const index = state.config.hmi.views.findIndex((candidate) => candidate.id === view.id);
    const remaining = state.config.hmi.views.filter((candidate) => candidate.id !== view.id);
    const fallback = remaining[Math.min(index, remaining.length - 1)] || remaining[0];
    const layoutPreview = clone(state.config.hmi.layout || {});
    const referenceCount = D.removeLayoutViewReferences(layoutPreview, view.id, fallback.id);
    const startWasDeleted = state.config.hmi.layout &&
      state.config.hmi.layout.start === view.id;
    elements.deleteViewMessage.textContent =
      `確定刪除「${view.name || view.id}」？${referenceCount
        ? `將自動移除 ${referenceCount - (startWasDeleted ? 1 : 0)} 個導覽引用，${startWasDeleted ? `並將起始頁改為「${fallback.name || fallback.id}」。` : ""}`
        : "此 View 沒有導覽引用。"} 無法還原的 JSON 輸出前仍可使用復原功能。`;
    elements.deleteViewDialog.showModal();
    elements.deleteViewDialog.dataset.viewId = view.id;
    elements.deleteViewDialog.dataset.fallbackId = fallback.id;
  }

  function confirmDeleteView(viewId, fallbackId) {
    const index = state.config.hmi.views.findIndex((view) => view.id === viewId);
    if (index < 0 || state.config.hmi.views.length <= 1) return;
    rememberUndo();
    const fallback = state.config.hmi.views.find((view) => view.id === fallbackId);
    if (state.config.hmi.layout) {
      D.removeLayoutViewReferences(state.config.hmi.layout, viewId, fallbackId);
    }
    state.config.hmi.views.splice(index, 1);
    state.models.delete(viewId);
    state.baselines.delete(viewId);
    state.viewTitleIds.delete(viewId);
    state.selectedViewId = fallback ? fallback.id : state.config.hmi.views[0].id;
    renderAll();
    setStatus(`已刪除 View，並處理其起始頁／導覽引用。`, "success");
  }

  function openBatchDialog() {
    if (!selectedModel()) return;
    batchSelection.clear();
    elements.tagSearch.value = "";
    renderTagChoices("");
    elements.dialog.showModal();
  }

  function renderTagChoices(filter) {
    elements.tagChoices.replaceChildren();
    const query = filter.trim().toLocaleLowerCase();
    const usedInView = new Set(selectedModel().components.map((component) => component.tagId));
    const tags = Array.from(state.tags.values()).filter((tag) =>
      `${tag.deviceName} ${tag.name} ${tag.type}`.toLocaleLowerCase().includes(query)
    );
    for (const tag of tags) {
      const label = document.createElement("label");
      label.className = "tag-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = tag.id;
      checkbox.checked = batchSelection.has(tag.id);
      const description = document.createElement("span");
      description.textContent = `${tag.deviceName}／${tag.name} (${tag.type || "未設定型別"}) · ${tag.id}${usedInView.has(tag.id) ? " · 此 View 已使用" : ""}`;
      label.append(checkbox, description);
      elements.tagChoices.append(label);
    }
    if (!tags.length) {
      const empty = document.createElement("p");
      empty.className = "editor-note";
      empty.textContent = "沒有符合的 Tag。";
      elements.tagChoices.append(empty);
    }
  }

  elements.tagChoices.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;
    if (checkbox.checked) batchSelection.add(checkbox.value);
    else batchSelection.delete(checkbox.value);
  });

  function handleBatchConfirm(event) {
    if (event.submitter && event.submitter.value !== "confirm") return;
    event.preventDefault();
    const chosen = Array.from(batchSelection);
    if (!chosen.length) {
      setStatus("請至少選取一個 Tag。", "warning");
      return;
    }
    const model = selectedModel();
    if (!model) return;
    rememberUndo();
    for (const tagId of chosen) {
      const tag = state.tags.get(tagId);
      if (!tag) continue;
      const seq = model.components.reduce((max, item) => Math.max(max, item.seq), 0) + 1;
      model.components.push({
        key: `new-${crypto.randomUUID()}`,
        seq,
        tagId: tag.id,
        label: tag.name,
        template: "rect",
        palette: "normal",
        shapeId: allocateId("SHE"),
        labelId: allocateId("svg"),
        shapeInnerIds: [allocateId("SHE")],
        managed: true
      });
    }
    elements.dialog.close();
    renderAll();
    batchSelection.clear();
    setStatus(`已加入 ${chosen.length} 筆 Tag 元件。`, "success");
  }

  function getTagIdValidationError() {
    for (const model of state.models.values()) {
      for (const component of model.components) {
        if (!component.tagId || !state.tags.has(component.tagId)) {
          return `項目「${component.label || "(未命名 Label)"}」尚未連結有效 Tag，請先修正。`;
        }
      }
    }
    return "";
  }

  function validateGenerated(config, modifiedViewIds) {
    const createdIdCounts = new Map(Array.from(state.createdIds, (id) => [id, 0]));
    for (const view of config.hmi.views) {
      if (!modifiedViewIds.has(view.id)) continue;
      if (!D.isRecord(view.items)) throw new Error(`View「${view.name || view.id}」的 items 結構無效。`);
      const doc = D.parseSvg(view.svgcontent, window.DOMParser);
      for (const [id, item] of Object.entries(view.items)) {
        if (!item || item.id !== id) throw new Error(`View「${view.name || view.id}」存在不一致的 item id：${id}`);
      }
      for (const node of Array.from(doc.getElementsByTagName("*"))) {
        const id = node.getAttribute("id");
        if (createdIdCounts.has(id)) createdIdCounts.set(id, createdIdCounts.get(id) + 1);
      }
      for (const model of state.models.values()) {
        if (model.viewId !== view.id) continue;
        for (const component of model.components) {
          if (!D.findById(doc, component.shapeId) || !D.findById(doc, component.labelId)) {
            throw new Error(`View「${view.name || view.id}」的元件與 Label 未同步寫入 SVG。`);
          }
          if (!view.items[component.shapeId] || !view.items[component.labelId]) {
            throw new Error(`View「${view.name || view.id}」缺少元件或 Label 的 items 記錄。`);
          }
          if (view.items[component.shapeId].property?.variableId !== component.tagId) {
            throw new Error(`元件 ${component.shapeId} 的 Tag 連結與清單不一致。`);
          }
          if (!component.tagId || !state.tags.has(component.tagId)) {
            throw new Error(`元件 ${component.shapeId} 連結到不存在的 Tag：${component.tagId || "(空白)"}`);
          }
        }
        const currentIds = managedIds({ components: model.components, originalComponents: [] });
        for (const original of model.originalComponents || []) {
          if (currentIds.has(original.shapeId)) continue;
          if (view.items[original.shapeId] || view.items[original.labelId] ||
              D.findById(doc, original.shapeId) || D.findById(doc, original.labelId)) {
            throw new Error(`已刪除的元件 ${original.shapeId} 仍留在輸出配置中。`);
          }
        }
      }
    }
    for (const [id, count] of createdIdCounts) {
      if (count > 1) throw new Error(`新元件 ID ${id} 在 SVG 中重複出現。`);
    }
  }

  function saveConfig() {
    const error = getTagIdValidationError();
    if (error) {
      setStatus(error, "error");
      return;
    }
    const output = clone(state.config);
    try {
      const modifiedViewIds = new Set();
      for (const [viewId, model] of state.models) {
        const view = output.hmi.views.find((item) => item.id === viewId);
        if (!view) continue;
        const current = JSON.stringify({ components: model.components, grid: model.grid });
        if (current === state.baselines.get(viewId)) continue;
        if (model.components.length === 0 && !JSON.parse(state.baselines.get(viewId)).components.length) continue;
        applyModelToView(view, model);
        modifiedViewIds.add(viewId);
      }
      const dirty = isDirty();
      const outputText = dirty
        ? D.serializeConfig(output, state.lineEnding, state.hasTrailingNewline)
        : state.originalText;
      if (dirty) validateGenerated(JSON.parse(outputText), modifiedViewIds);
      const baseName = state.fileName.replace(/\.[^.]+$/, "");
      const blob = new Blob([outputText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.generated.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(dirty
        ? "已驗證並下載新 JSON。原始配置未變更；輸出前請在 FUXA 測試匯入結果。"
        : "配置未修改，已下載原始 JSON 的逐字副本。", "success");
    } catch (saveError) {
      setStatus(`無法產生檔案：${saveError.message}`, "error");
    }
  }

  elements.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      loadConfig(await file.text(), file.name);
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      event.target.value = "";
    }
  });

  elements.rows.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-key]");
    if (!field || !row) return;
    const model = selectedModel();
    const component = model && model.components.find((item) => item.key === row.dataset.key);
    if (!component || component[field] === event.target.value) return;
    rememberUndo();
    component[field] = event.target.value;
    renderPreview();
  });

  elements.rows.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-key]");
    if (!field || !row) return;
    mutateComponent(row.dataset.key, field, event.target.value);
  });

  elements.rows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const model = selectedModel();
    const row = button.closest("tr[data-key]");
    if (!model || !row) return;
    const index = model.components.findIndex((item) => item.key === row.dataset.key);
    if (index < 0) return;
    const action = button.dataset.action;
    rememberUndo();
    if (action === "delete") model.components.splice(index, 1);
    else if (action === "up" && index > 0) [model.components[index - 1], model.components[index]] = [model.components[index], model.components[index - 1]];
    else if (action === "down" && index < model.components.length - 1) [model.components[index + 1], model.components[index]] = [model.components[index], model.components[index + 1]];
    renderAll();
  });

  for (const input of Object.values(gridInputs)) {
    input.addEventListener("change", () => {
      const model = selectedModel();
      if (!model) return;
      const before = JSON.stringify(model.grid);
      const nextGrid = { ...model.grid };
      for (const [key, control] of Object.entries(gridInputs)) {
        nextGrid[key] = key === "labelPosition" ? control.value : Number(control.value);
      }
      if (JSON.stringify(nextGrid) === before) return;
      rememberUndo();
      model.grid = nextGrid;
      renderPreview();
    });
  }

  elements.addOne.addEventListener("click", () => addComponent("", ""));
  elements.addMany.addEventListener("click", openBatchDialog);
  elements.addView.addEventListener("click", openNewViewDialog);
  elements.renameView.addEventListener("click", openRenameViewDialog);
  elements.deleteView.addEventListener("click", deleteSelectedView);
  elements.newViewDialog.addEventListener("submit", (event) => {
    if (event.submitter && event.submitter.value !== "confirm") return;
    event.preventDefault();
    const succeeded = elements.newViewDialog.dataset.mode === "rename"
      ? renameView(elements.newViewDialog.dataset.viewId, elements.newViewName.value)
      : createView(elements.newViewName.value);
    if (succeeded) elements.newViewDialog.close();
  });
  elements.deleteViewDialog.addEventListener("submit", (event) => {
    if (event.submitter && event.submitter.value !== "confirm") return;
    event.preventDefault();
    const { viewId, fallbackId } = elements.deleteViewDialog.dataset;
    elements.deleteViewDialog.close();
    confirmDeleteView(viewId, fallbackId);
  });
  elements.tagSearch.addEventListener("input", () => renderTagChoices(elements.tagSearch.value));
  elements.dialog.addEventListener("submit", handleBatchConfirm);
  elements.save.addEventListener("click", saveConfig);
  elements.undo.addEventListener("click", undo);
  elements.redo.addEventListener("click", redo);
})();
