(function () {
  "use strict";

  const D = window.FuxaToolDomain;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const FLOOR_LAYOUT_MARKER = "floor-layout-v1";
  const $ = (selector) => document.querySelector(selector);
  const state = {
    config: null,
    originalText: "",
    originalDevices: "",
    originalIcons: "[]",
    floorGroupFrame: { ...D.DEFAULT_FLOOR_GROUP_FRAME },
    originalFloorGroupFrame: { ...D.DEFAULT_FLOOR_GROUP_FRAME },
    lineEnding: "\n",
    hasTrailingNewline: false,
    fileName: "",
    tags: new Map(),
    iconLibrary: [],
    models: new Map(),
    baselines: new Map(),
    floorBaselines: new Map(),
    originalViewIds: [],
    originalViewNames: [],
    originalLayout: null,
    viewTitleIds: new Map(),
    selectedViewId: "",
    selectedDeviceId: "",
    isCreatingNewDevice: false,
    usedIds: new Set(),
    usedViewIds: new Set(),
    usedDeviceIds: new Set(),
    usedTagIds: new Set(),
    createdIds: new Set(),
    undoStack: [],
    redoStack: []
  };

  const elements = {
    fileInput: $("#config-file"),
    clearProject: $("#clear-project-button"),
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
    iconLibraryButton: $("#icon-library-button"),
    iconLibraryDialog: $("#icon-library-dialog"),
    iconLibraryClose: $("#icon-library-close"),
    iconLibraryForm: $("#icon-library-form"),
    iconLibraryList: $("#icon-library-list"),
    iconSetName: $("#icon-set-name"),
    iconSetType: $("#icon-set-type"),
    singleIconFileField: $("#single-icon-file-field"),
    singleIconFile: $("#single-icon-file"),
    normalIconFileField: $("#normal-icon-file-field"),
    normalIconFile: $("#normal-icon-file"),
    alarmIconFileField: $("#alarm-icon-file-field"),
    alarmIconFile: $("#alarm-icon-file"),
    addOne: $("#add-one-button"),
    addMany: $("#add-many-button"),
    save: $("#save-button"),
    undo: $("#undo-button"),
    redo: $("#redo-button"),
    dialog: $("#batch-dialog"),
    tagChoices: $("#tag-choices"),
    tagSearch: $("#tag-search"),
    tagSelectAll: $("#tag-select-all"),
    batchConfirm: $("#batch-confirm"),
    newViewDialog: $("#new-view-dialog"),
    newViewName: $("#new-view-name"),
    viewNameDialogTitle: $("#view-name-dialog-title"),
    viewNameDialogDescription: $("#view-name-dialog-description"),
    viewNameConfirm: $("#new-view-confirm"),
    deleteViewDialog: $("#delete-view-dialog"),
    deleteViewMessage: $("#delete-view-message"),
    deviceMgrButton: $("#device-mgr-button"),
    floorManagerButton: $("#floor-manager-button"),
    floorManagerDialog: $("#floor-manager-dialog"),
    floorManagerClose: $("#floor-manager-close"),
    floorTagSearch: $("#floor-tag-search"),
    floorGroupView: $("#floor-group-view"),
    floorListView: $("#floor-list-view"),
    floorSelectVisible: $("#floor-select-visible"),
    floorBulkValue: $("#floor-bulk-value"),
    floorBulkApply: $("#floor-bulk-apply"),
    floorSelectedCount: $("#floor-selected-count"),
    floorTagList: $("#floor-tag-list"),
    floorOptions: $("#floor-options"),
    quickBatchTagsButton: $("#quick-batch-tags-button"),
    deviceMgrDialog: $("#device-mgr-dialog"),
    deviceMgrClose: $("#device-mgr-close"),
    tabBtnDevice: $("#tab-btn-device"),
    tabBtnTags: $("#tab-btn-tags"),
    tabPaneDevice: $("#tab-pane-device"),
    tabPaneTags: $("#tab-pane-tags"),
    deviceSearch: $("#device-search"),
    newDeviceBtn: $("#new-device-btn"),
    deviceList: $("#device-list"),
    deviceForm: $("#device-form"),
    deviceFormTitle: $("#device-form-title"),
    deviceIdBadge: $("#device-id-badge"),
    devName: $("#dev-name"),
    devEnabled: $("#dev-enabled"),
    devAddress: $("#dev-address"),
    devSlaveId: $("#dev-slaveid"),
    devPolling: $("#dev-polling"),
    devAddressCount: $("#dev-address-count"),
    devAddressCountField: $("#dev-address-count").closest("label"),
    devConnOption: $("#dev-conn-option"),
    devTimeout: $("#dev-timeout"),
    devDelay: $("#dev-delay"),
    devBaudrate: $("#dev-baudrate"),
    devDatabits: $("#dev-databits"),
    devStopbits: $("#dev-stopbits"),
    devParity: $("#dev-parity"),
    devForceFC16: $("#dev-force-fc16"),
    deviceTagsCountText: $("#device-tags-count-text"),
    goToBatchTagsBtn: $("#go-to-batch-tags-btn"),
    shiftAddressesUp: $("#shift-addresses-up-btn"),
    shiftAddressesDown: $("#shift-addresses-down-btn"),
    deleteDeviceBtn: $("#delete-device-btn"),
    saveDeviceBtn: $("#save-device-btn"),
    batchCreateTagsForm: $("#batch-create-tags-form"),
    batchTagDevice: $("#batch-tag-device"),
    batchTagMemaddress: $("#batch-tag-memaddress"),
    batchTagType: $("#batch-tag-type"),
    batchTagStartAddr: $("#batch-tag-start-addr"),
    batchTagStep: $("#batch-tag-step"),
    batchTagInput: $("#batch-tag-input"),
    batchTagFloor: $("#batch-tag-floor"),
    batchPreviewCount: $("#batch-preview-count"),
    batchTagPreviewBody: $("#batch-tag-preview-body"),
    batchAlsoAddView: $("#batch-also-add-view"),
    batchCancelBtn: $("#batch-cancel-btn"),
    batchCreateTagsConfirm: $("#batch-create-tags-confirm")
  };
  const batchSelection = new Set();
  const floorSelection = new Set();
  let floorDisplayMode = "group";
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
  const frameInputs = {
    fill: $("#floor-frame-fill"),
    fillOpacity: $("#floor-frame-opacity"),
    stroke: $("#floor-frame-stroke"),
    strokeWidth: $("#floor-frame-stroke-width"),
    cornerRadius: $("#floor-frame-radius"),
    padding: $("#floor-frame-padding")
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

  function nextComponentSequence(model) {
    const max = model.components.reduce((highest, component) =>
      component.managed !== false && Number.isSafeInteger(component.seq)
        ? Math.max(highest, component.seq)
        : highest, 0);
    return max + 1;
  }

  function floorSignature(model) {
    return JSON.stringify(model.components.map((component) => {
      const tag = state.tags.get(component.tagId);
      return [component.tagId, tag ? tag.floor : ""];
    }));
  }

  function floorTitleKey(floor) {
    return `floor:${floor}`;
  }

  function measureSvgItem(doc, id) {
    const node = D.findById(doc, id);
    if (!node) throw new Error("找不到對應的 SVG 元件。");
    const svg = document.createElementNS(SVG_NS, "svg");
    const sourceRoot = doc.documentElement;
    const viewBox = sourceRoot.getAttribute("viewBox");
    svg.setAttribute("viewBox", viewBox || "0 0 1000 1000");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "1000");
    svg.setAttribute("height", "1000");
    svg.setAttribute("visibility", "hidden");
    const cloneNode = node.cloneNode(true);
    if (cloneNode.getAttribute("data-fuxa-floor-layout") === FLOOR_LAYOUT_MARKER) {
      cloneNode.removeAttribute("transform");
    }
    svg.append(cloneNode);
    document.body.append(svg);
    try {
      const bounds = cloneNode.getBBox();
      if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
          bounds.width <= 0 || bounds.height <= 0) {
        throw new Error("無法取得有效的 SVG 外框。");
      }
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };
    } finally {
      svg.remove();
    }
  }

  function hasSvgTransform(node) {
    let current = node;
    while (current && current.localName !== "svg") {
      if (current.getAttribute("transform")) {
        const isToolPosition = current === node &&
          current.getAttribute("data-fuxa-floor-layout") === FLOOR_LAYOUT_MARKER &&
          /^translate\(-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?\)$/.test(current.getAttribute("transform"));
        if (!isToolPosition) return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function prepareMovableTagComponents(parsed) {
    const components = [];
    const unsupported = [...parsed.unmanaged];
    for (const item of parsed.movableTags || []) {
      try {
        const bounds = measureSvgItem(parsed.doc, item.id);
        components.push({
          key: `existing-${item.id}`,
          tagId: item.tagId,
          label: item.name,
          template: "existing",
          shapeId: item.id,
          seq: Number.MAX_SAFE_INTEGER,
          type: item.type,
          managed: false,
          originalBounds: bounds,
          layoutWidth: bounds.width,
          layoutHeight: bounds.height,
          companions: []
        });
      } catch (error) {
        unsupported.push({
          ...item,
          reason: error.message
        });
      }
    }
    return { components, unsupported };
  }

  function attachExistingTagLabels(view, parsed, components) {
    const usedLabels = new Set();
    const labels = [];
    for (const [id, item] of Object.entries(view.items || {})) {
      if (!item || item.type !== "svg-ext-shapes-text" ||
          (item.property && typeof item.property.variableId === "string") ||
          item.name === "fuxa_floor_section_title" ||
          /^tc_\d+_label$/.test(item.name || "")) continue;
      const node = D.findById(parsed.doc, id);
      if (!node || node.localName !== "text" || hasSvgTransform(node)) continue;
      try {
        labels.push({ id, bounds: measureSvgItem(parsed.doc, id) });
      } catch (_) {
        // An unrelated text element that cannot be measured is left untouched.
      }
    }
    for (const component of components) {
      const shape = component.originalBounds;
      const centerX = shape.x + shape.width / 2;
      const candidate = labels
        .filter(({ id, bounds }) => {
          if (usedLabels.has(id)) return false;
          const centerDiff = Math.abs(bounds.x + bounds.width / 2 - centerX);
          const verticalGap = shape.y - (bounds.y + bounds.height);
          return centerDiff <= Math.max(2, Math.min(8, shape.width * 0.1)) &&
            verticalGap >= -2 && verticalGap <= 80;
        })
        .sort((left, right) => {
          const leftGap = shape.y - (left.bounds.y + left.bounds.height);
          const rightGap = shape.y - (right.bounds.y + right.bounds.height);
          return leftGap - rightGap;
        })[0];
      if (!candidate) continue;
      usedLabels.add(candidate.id);
      component.companions.push(candidate);
    }
  }

  function prepareViewTagComponents(view, parsed) {
    const prepared = prepareMovableTagComponents(parsed);
    attachExistingTagLabels(view, parsed, prepared.components);
    return prepared;
  }

  function needsFloorLayout(model) {
    const activeKeys = new Set(D.groupComponentsByFloor(model.components, state.tags)
      .map((group) => floorTitleKey(group.floor)));
    for (const key of activeKeys) {
      if (!Object.prototype.hasOwnProperty.call(model.originalFloorTitles || {}, key) ||
          !Object.prototype.hasOwnProperty.call(model.originalFloorFrames || {}, key) ||
          ((model.originalFloorTitleIds || {})[key] || []).length > 1 ||
          ((model.originalFloorFrameIds || {})[key] || []).length > 1) return true;
    }
    return [
      model.originalFloorTitles, model.originalFloorTitleIds,
      model.originalFloorFrames, model.originalFloorFrameIds
    ]
      .some((entries) => Object.keys(entries || {}).some((key) => !activeKeys.has(key)));
  }

  function floorGroupArtifactsForModel(model) {
    const artifacts = {};
    for (const group of D.groupComponentsByFloor(model.components, state.tags)) {
      const key = floorTitleKey(group.floor);
      const titleId = model.floorTitles[key];
      const frameId = model.floorFrames[key];
      const frameShapeId = model.floorFrameShapeIds[key];
      if (titleId && frameId && frameShapeId) {
        artifacts[key] = { titleId, frameId, frameShapeId };
      }
    }
    return artifacts;
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
    const iconLibrary = D.getIconLibrary(config);
    state.config = config;
    state.iconLibrary = iconLibrary;
    state.originalText = text;
    state.originalDevices = JSON.stringify(config.devices);
    state.originalIcons = JSON.stringify(iconLibrary);
    state.lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    state.hasTrailingNewline = /(?:\r\n|\n)$/.test(text);
    state.fileName = fileName || "fuxa-config.json";
    state.floorGroupFrame = D.getFloorGroupFrameSettings(config);
    state.originalFloorGroupFrame = { ...state.floorGroupFrame };
    state.tags = D.buildTagIndex(config);
    state.models = new Map();
    state.baselines = new Map();
    state.floorBaselines = new Map();
    state.usedIds = reserveExistingIds(config);
    state.usedViewIds = new Set(config.hmi.views.map((view) => view.id).filter(Boolean));
    state.usedDeviceIds = new Set(Object.keys(config.devices || {}));
    state.usedTagIds = new Set();
    for (const dev of Object.values(config.devices || {})) {
      if (D.isRecord(dev) && D.isRecord(dev.tags)) {
        for (const tagId of Object.keys(dev.tags)) {
          state.usedTagIds.add(tagId);
        }
      }
    }
    const devKeys = Object.keys(config.devices || {});
    const firstModbus = devKeys.find((id) => config.devices[id] && config.devices[id].type === "ModbusTCP");
    state.selectedDeviceId = firstModbus || devKeys.find((id) => id !== "0") || devKeys[0] || "";
    state.isCreatingNewDevice = false;
    state.createdIds = new Set();
    state.originalViewIds = config.hmi.views.map((view) => view.id);
    state.originalViewNames = config.hmi.views.map((view) => [view.id, view.name || ""]);
    state.originalLayout = clone(config.hmi.layout || null);
    state.viewTitleIds = new Map();
    state.undoStack = [];
    state.redoStack = [];

    for (const view of config.hmi.views) {
      if (!D.hasViewShape(view)) continue;
      const parsed = D.readManaged(
        view, window.DOMParser, D.getFloorGroupArtifacts(config, view.id)
      );
      if (parsed.error) continue;
      const existing = prepareViewTagComponents(view, parsed);
      const components = [...parsed.records, ...existing.components];
      state.models.set(view.id, {
        viewId: view.id,
        components,
        originalComponents: clone(components),
        unmanaged: existing.unsupported,
        grid: D.getViewGridSettings(config, view.id),
        floorTitles: { ...(parsed.floorTitles || {}) },
        originalFloorTitles: { ...(parsed.floorTitles || {}) },
        floorTitleIds: clone(parsed.floorTitleIds || {}),
        originalFloorTitleIds: clone(parsed.floorTitleIds || {}),
        floorFrames: { ...(parsed.floorFrames || {}) },
        originalFloorFrames: { ...(parsed.floorFrames || {}) },
        floorFrameIds: clone(parsed.floorFrameIds || {}),
        originalFloorFrameIds: clone(parsed.floorFrameIds || {}),
        floorFrameShapeIds: { ...(parsed.floorFrameShapeIds || {}) }
      });
    }
    for (const [viewId, model] of state.models) {
      state.baselines.set(viewId, JSON.stringify({
        components: model.components,
        grid: model.grid
      }));
      state.floorBaselines.set(viewId, floorSignature(model));
    }
    state.selectedViewId = config.hmi.views.length ? config.hmi.views[0].id : "";
    elements.fileName.textContent = state.fileName;
    elements.workspace.hidden = false;
    renderAll();
    setStatus(`已載入 ${config.hmi.views.length} 個 View、${state.tags.size} 個 Tag。檔案資料僅在本機處理。`, "success");
  }

  function clearProject() {
    if (state.config && !window.confirm(
      "這會以空白 FUXA 專案取代目前工作區，尚未另存的變更將遺失。原始檔不會被修改。是否繼續？"
    )) return;
    try {
      const emptyConfig = D.createEmptyConfig();
      loadConfig(`${JSON.stringify(emptyConfig, null, 4)}\n`, "fuxa-project.json");
      setStatus("已建立空白 FUXA 專案；原始檔未變更，可另存新 JSON。", "success");
    } catch (error) {
      setStatus(`無法清空專案：${error.message}`, "error");
    }
  }

  function modelSnapshot() {
    return {
      data: JSON.stringify({
        views: state.config.hmi.views,
        layout: state.config.hmi.layout,
        devices: state.config.devices,
        models: Array.from(state.models.entries()),
        baselines: Array.from(state.baselines.entries()),
        floorBaselines: Array.from(state.floorBaselines.entries()),
        viewTitleIds: Array.from(state.viewTitleIds.entries()),
        selectedViewId: state.selectedViewId,
        selectedDeviceId: state.selectedDeviceId,
        floorGroupFrame: state.floorGroupFrame
      }),
      iconLibrary: state.iconLibrary
    };
  }

  function rememberUndo() {
    state.undoStack.push(modelSnapshot());
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }

  function restoreSnapshot(snapshot) {
    const saved = JSON.parse(snapshot.data);
    state.config.hmi.views = saved.views;
    state.config.hmi.layout = saved.layout;
    state.iconLibrary = snapshot.iconLibrary;
    if (saved.devices) {
      state.config.devices = saved.devices;
      state.tags = D.buildTagIndex(state.config);
      state.usedDeviceIds = new Set(Object.keys(state.config.devices));
      state.usedTagIds = new Set();
      for (const dev of Object.values(state.config.devices)) {
        if (D.isRecord(dev) && D.isRecord(dev.tags)) {
          for (const tid of Object.keys(dev.tags)) state.usedTagIds.add(tid);
        }
      }
    }
    state.models = new Map(saved.models);
    state.baselines = new Map(saved.baselines);
    state.floorBaselines = new Map(saved.floorBaselines || []);
    state.viewTitleIds = new Map(saved.viewTitleIds || []);
    state.selectedViewId = saved.selectedViewId;
    state.floorGroupFrame = D.normalizeFloorGroupFrameSettings(saved.floorGroupFrame);
    if (saved.selectedDeviceId) state.selectedDeviceId = saved.selectedDeviceId;
    renderAll();
    if (elements.deviceMgrDialog.open) {
      renderDeviceList(elements.deviceSearch.value);
      if (state.selectedDeviceId && state.config.devices[state.selectedDeviceId]) {
        selectDevice(state.selectedDeviceId);
      } else {
        prepareNewDevice();
      }
      updateBatchDeviceOptions();
      if (state.selectedDeviceId && state.config.devices[state.selectedDeviceId]) {
        onBatchDeviceChange();
      } else {
        renderBatchTagPreview();
      }
    }
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

  function createGraphicSelect(component) {
    const select = document.createElement("select");
    select.className = "compact-select";
    select.setAttribute("aria-label", "圖形");
    select.dataset.field = "graphic";
    const options = [
      ["rect", "矩形"],
      ["cylinder", "圓柱"],
      ...state.iconLibrary
        .filter((icon) => icon.type !== "pair")
        .map((icon) => [`icon:${icon.id}`, icon.name]),
      ...getIconPairChoices().map((icon) => [`pair:${icon.choiceId}`, `${icon.name}（正常／告警）`])
    ];
    const pairChoice = component.template === "icon-pair"
      ? getIconPairChoices().find((icon) =>
        icon.normalIconId === component.normalIconId &&
        icon.alarmIconId === component.alarmIconId)
      : null;
    const selected = component.template === "icon" && component.iconId
      ? `icon:${component.iconId}`
      : component.template === "icon-pair" && pairChoice
        ? `pair:${pairChoice.choiceId}`
        : component.template;
    if (!options.some(([value]) => value === selected)) {
      const missing = component.template === "icon-pair"
        ? `正常／告警圖示組不存在（${component.normalIconId || "未知"}）`
        : `圖示不存在（${component.iconId || "未知"}）`;
      options.push([selected, missing]);
    }
    for (const [value, label] of options) {
      select.append(makeOption(value, label, value === selected));
    }
    return select;
  }

  function getIconAsset(iconId) {
    for (const icon of state.iconLibrary) {
      if (icon.type === "pair") {
        if (icon.normal.id === iconId) return icon.normal;
        if (icon.alarm.id === iconId) return icon.alarm;
      } else if (icon.id === iconId) {
        return icon;
      }
    }
    return null;
  }

  function getIconPairChoices() {
    const pairs = state.iconLibrary
      .filter((icon) => icon.type === "pair")
      .map((icon) => ({
        choiceId: icon.id,
        id: icon.id,
        name: icon.name,
        normalIconId: icon.normal.id,
        alarmIconId: icon.alarm.id,
        normal: icon.normal,
        alarm: icon.alarm
      }));
    for (const model of state.models.values()) {
      for (const component of model.components) {
        if (component.managed === false || component.template !== "icon-pair" ||
            pairs.some((pair) => pair.normalIconId === component.normalIconId &&
              pair.alarmIconId === component.alarmIconId)) continue;
        const normal = getIconAsset(component.normalIconId);
        const alarm = getIconAsset(component.alarmIconId);
        pairs.push({
          choiceId: `legacy:${component.normalIconId}:${component.alarmIconId}`,
          id: "",
          name: `${normal ? normal.name : "缺少正常圖"} / ${alarm ? alarm.name : "缺少告警圖"}`,
          normalIconId: component.normalIconId,
          alarmIconId: component.alarmIconId,
          legacy: true
        });
      }
    }
    return pairs;
  }

  function renderIconLibrary() {
    elements.iconLibraryList.replaceChildren();
    if (!state.config) return;
    const icons = state.iconLibrary;
    if (!icons.length) {
      const empty = document.createElement("span");
      empty.className = "icon-library-empty";
      empty.textContent = "圖示庫尚無項目，請先新增一般圖示或正常／告警圖示組。";
      elements.iconLibraryList.append(empty);
      return;
    }
    for (const icon of icons) {
      const item = document.createElement("div");
      item.className = "icon-library-item";
      const previews = document.createElement("div");
      previews.className = "icon-library-previews";
      const assets = icon.type === "pair" ? [icon.normal, icon.alarm] : [icon];
      for (const [index, asset] of assets.entries()) {
        const image = document.createElement("img");
        image.src = asset.dataUrl;
        image.alt = "";
        image.title = icon.type === "pair"
          ? index === 0 ? "正常狀態" : "告警狀態"
          : icon.name;
        previews.append(image);
      }
      const copy = document.createElement("div");
      copy.className = "icon-library-item-copy";
      const name = document.createElement("strong");
      name.textContent = icon.name;
      name.title = icon.name;
      const type = document.createElement("small");
      type.textContent = icon.type === "pair" ? "正常／告警圖示" : "一般圖示";
      copy.append(name, type);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "刪除";
      remove.setAttribute("aria-label", `刪除圖示 ${icon.name}`);
      remove.addEventListener("click", () => removeLibraryIcon(icon.id));
      item.append(previews, copy, remove);
      elements.iconLibraryList.append(item);
    }
  }

  function removeLibraryIcon(iconId) {
    const icons = state.iconLibrary;
    const icon = icons.find((item) => item.id === iconId);
    if (!icon) return;
    const usages = [];
    for (const [viewId, model] of state.models) {
      const view = state.config.hmi.views.find((item) => item.id === viewId);
      for (const component of model.components) {
        if (component.managed !== false &&
            ([component.iconId, component.normalIconId, component.alarmIconId]
              .includes(iconId) ||
             (icon.type === "pair" &&
              [component.normalIconId, component.alarmIconId].some((assetId) =>
                [icon.normal.id, icon.alarm.id].includes(assetId))))) {
          const tag = state.tags.get(component.tagId);
          const label = component.label || (tag && tag.name) || `#${component.seq}`;
          usages.push(`「${view && (view.name || view.id) || viewId}」的 ${label}`);
        }
      }
    }
    if (usages.length) {
      setStatus(`無法刪除圖示「${icon.name}」；以下元件仍在使用：${usages.join("、")}。`, "warning");
      return;
    }
    rememberUndo();
    state.iconLibrary = icons.filter((item) => item.id !== iconId);
    renderAll();
    setStatus(`已從圖示庫刪除「${icon.name}」。`, "success");
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
    const graphicSelect = createGraphicSelect(component);
    templateCell.append(graphicSelect);
    if (component.template === "icon-pair") {
      const pairControls = document.createElement("div");
      pairControls.className = "icon-pair-controls";
      const invertLabel = document.createElement("label");
      invertLabel.className = "icon-invert-option";
      const invert = document.createElement("input");
      invert.type = "checkbox";
      invert.checked = Boolean(component.invertIconState);
      invert.dataset.field = "invertIconState";
      invertLabel.append(invert, document.createTextNode("反轉狀態"));
      pairControls.append(invertLabel);
      templateCell.append(pairControls);
    }
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
    for (const group of D.groupComponentsByFloor(model.components, state.tags)) {
      const groupRow = document.createElement("tr");
      groupRow.className = "floor-section-row";
      const groupCell = document.createElement("th");
      groupCell.colSpan = 6;
      groupCell.textContent = `${group.title} · ${group.items.length} 個 Tag`;
      groupRow.append(groupCell);
      elements.rows.append(groupRow);
      for (const component of group.items) {
        if (component.managed === false) {
          const row = document.createElement("tr");
          row.className = "readonly-row";
          const sequence = document.createElement("td");
          sequence.textContent = "—";
          const label = document.createElement("td");
          label.textContent = component.label;
          const tagCell = document.createElement("td");
          const tag = state.tags.get(component.tagId);
          tagCell.textContent = tag ? `${tag.deviceName}／${tag.name}` : `Tag 不存在（${component.tagId}）`;
          const type = document.createElement("td");
          type.textContent = `既有元件：${component.type || "SVG"}`;
          const palette = document.createElement("td");
          palette.textContent = "保留原設定";
          const operations = document.createElement("td");
          operations.textContent = "依樓層自動移動";
          row.append(sequence, label, tagCell, type, palette, operations);
          elements.rows.append(row);
        } else {
          elements.rows.append(createManagedRow(
            component,
            model.components.indexOf(component),
            model.components.length
          ));
        }
      }
    }
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
      operations.textContent = item.reason || "結構不支援自動移動";
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
        ? `${model.components.filter((item) => item.managed !== false).length} 筆工具管理 · ` +
          `${model.components.filter((item) => item.managed === false).length} 筆既有元件可重排 · ` +
          `${model.unmanaged.length} 筆保留唯讀`
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
    for (const [key, input] of Object.entries(frameInputs)) {
      input.disabled = !state.config;
      if (!state.config) continue;
      const value = key === "fillOpacity"
        ? Math.round(state.floorGroupFrame[key] * 100)
        : state.floorGroupFrame[key];
      input.value = String(value);
    }
  }

  function createSvgNode(doc, name, attributes) {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  }

  function buildIconPairNodes(doc, component, placement) {
    const normalIcon = getIconAsset(component.normalIconId);
    const alarmIcon = getIconAsset(component.alarmIconId);
    if (!normalIcon || !alarmIcon || !component.alarmShapeId) {
      throw new Error(`元件「${component.label || "未命名"}」尚未設定正常與告警圖示。`);
    }
    const x = placement.shape.x;
    const y = placement.shape.y;
    const createImage = (name, icon, id) => {
      const image = createSvgNode(doc, "image", {
        "data-name": name,
        "data-fuxa-icon-id": icon.id,
        id,
        x, y,
        width: D.RECT_SIZE.width,
        height: D.RECT_SIZE.height,
        preserveAspectRatio: "xMidYMid meet"
      });
      image.setAttributeNS(XLINK_NS, "xlink:href", icon.dataUrl);
      return image;
    };
    return [
      createImage(`tc_${component.seq}`, normalIcon, component.shapeId),
      createImage(`tc_${component.seq}_alarm`, alarmIcon, component.alarmShapeId)
    ];
  }

  function buildShapeNode(doc, component, placement) {
    const icon = component.template === "icon"
      ? getIconAsset(component.iconId)
      : null;
    if (component.template === "icon" && !icon) {
      throw new Error(`元件「${component.label || "未命名"}」使用的圖示不存在。`);
    }
    const type = component.template === "cylinder"
      ? "svg-ext-shapes-cylinder" : "svg-ext-shapes-rectangle";
    const group = createSvgNode(doc, "g", {
      "data-name": `tc_${component.seq}`,
      id: component.shapeId,
      type,
      fill: icon ? D.PALETTES[component.palette][0] : "#FFFFFF",
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
    } else if (icon) {
      const width = D.RECT_SIZE.width;
      const height = D.RECT_SIZE.height;
      while (component.shapeInnerIds.length < 2) component.shapeInnerIds.push(allocateId("SHE"));
      const image = createSvgNode(doc, "image", {
        "data-fuxa-icon-id": icon.id,
        id: component.shapeInnerIds[0],
        x, y, width, height,
        preserveAspectRatio: "xMidYMid meet"
      });
      image.setAttributeNS(XLINK_NS, "xlink:href", icon.dataUrl);
      group.append(image);
      const markerSize = 8;
      group.append(createSvgNode(doc, "rect", {
        "data-fuxa-state-marker": "true",
        id: component.shapeInnerIds[1],
        x: x + width - markerSize,
        y: y + height - markerSize,
        width: markerSize,
        height: markerSize,
        stroke: "none"
      }));
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
      if (component.managed === false) continue;
      ids.add(component.shapeId);
      if (component.alarmShapeId) ids.add(component.alarmShapeId);
      if (component.labelId) ids.add(component.labelId);
    }
    for (const id of Object.values(model.floorTitles || {})) ids.add(id);
    for (const id of Object.values(model.floorFrames || {})) ids.add(id);
    for (const titleIds of Object.values({
      ...(model.originalFloorTitleIds || {}),
      ...(model.floorTitleIds || {})
    })) {
      for (const id of titleIds) ids.add(id);
    }
    for (const frameIds of Object.values({
      ...(model.originalFloorFrameIds || {}),
      ...(model.floorFrameIds || {})
    })) {
      for (const id of frameIds) ids.add(id);
    }
    return ids;
  }

  function removeManagedFromView(view, model, doc) {
    const ids = managedIds(model);
    const floorArtifactNames = new Set([
      "fuxa_floor_section_title",
      "fuxa_floor_section_frame"
    ]);
    for (const [id, item] of Object.entries(view.items)) {
      if (item && floorArtifactNames.has(item.name)) ids.add(id);
    }
    for (const node of Array.from(doc.getElementsByTagName("*"))) {
      if (!floorArtifactNames.has(node.getAttribute("data-name"))) continue;
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    for (const id of ids) {
      const node = D.findById(doc, id);
      const pairWrapper = node && node.closest("[data-fuxa-icon-pair-wrapper]");
      const removeNode = pairWrapper || node;
      if (removeNode && removeNode.parentNode) removeNode.parentNode.removeChild(removeNode);
      delete view.items[id];
    }
  }

  function buildItemEntry(existing, component, shape) {
    const oldProperty = existing && D.isRecord(existing.property) ? existing.property : {};
    if (component.template === "icon-pair") {
      const normalVisibleValue = component.invertIconState ? 1 : 0;
      const isNormalImage = shape.getAttribute("data-name") === `tc_${component.seq}`;
      const visibleValue = isNormalImage ? normalVisibleValue : 1 - normalVisibleValue;
      const property = {
        ...oldProperty,
        ranges: [],
        events: Array.isArray(oldProperty.events) ? oldProperty.events : [],
        actions: D.buildVisibilityActions(component.tagId, visibleValue)
      };
      delete property.variableId;
      return {
        ...(existing || {}),
        id: shape.getAttribute("id"),
        type: "svg-ext-shapes-select",
        name: shape.getAttribute("data-name"),
        property,
        label: "Shapes",
        hide: false,
        lock: false
      };
    }
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

  function buildFloorTitleNode(doc, section, id, grid) {
    const text = createSvgNode(doc, "text", {
      "data-name": "fuxa_floor_section_title",
      "data-floor-group": section.floor,
      id,
      type: "svg-ext-shapes-text",
      x: section.x,
      y: section.titleY,
      fill: "#1d4ed8",
      stroke: "#1d4ed8",
      "stroke-width": "0",
      "font-size": grid.labelFontSize,
      "font-family": "sans-serif",
      "font-weight": "bold",
      "text-anchor": "start",
      "xml:space": "preserve"
    });
    text.textContent = section.title;
    return text;
  }

  function buildFloorTitleEntry(existing, id) {
    return {
      ...(existing || {}),
      id,
      type: "svg-ext-shapes-text",
      name: "fuxa_floor_section_title",
      property: null,
      label: "Shapes",
      hide: false,
      lock: false
    };
  }

  function buildFloorFrameNode(doc, section, id, innerId) {
    const frame = state.floorGroupFrame;
    const group = createSvgNode(doc, "g", {
      "data-name": "fuxa_floor_section_frame",
      "data-floor-group": section.floor,
      id,
      type: "svg-ext-shapes-rectangle",
      fill: frame.fill,
      stroke: frame.stroke,
      "stroke-width": frame.strokeWidth
    });
    const attributes = {
      x: section.frame.x,
      y: section.frame.y,
      width: section.frame.width,
      height: section.frame.height,
      rx: frame.cornerRadius,
      ry: frame.cornerRadius,
      fill: frame.fill,
      "fill-opacity": frame.fillOpacity,
      stroke: frame.stroke,
      "stroke-width": frame.strokeWidth
    };
    if (innerId) attributes.id = innerId;
    group.append(createSvgNode(doc, "rect", attributes));
    return group;
  }

  function buildFloorFrameEntry(existing, id) {
    return {
      ...(existing || {}),
      id,
      type: "svg-ext-shapes-rectangle",
      name: "fuxa_floor_section_frame",
      property: null,
      label: "Shapes",
      hide: false,
      lock: false
    };
  }

  function insertFloorFrameNode(layer, frameNode, section, doc) {
    const managedNodes = new Set();
    for (const { component } of section.entries) {
      if (component.managed !== false) continue;
      const shape = D.findById(doc, component.shapeId);
      if (shape) managedNodes.add(shape);
      for (const companion of component.companions || []) {
        const label = D.findById(doc, companion.id);
        if (label) managedNodes.add(label);
      }
    }
    const firstManagedChild = Array.from(layer.children).find((child) =>
      Array.from(managedNodes).some((node) => child === node || child.contains(node))
    );
    if (firstManagedChild) layer.insertBefore(frameNode, firstManagedChild);
    else layer.append(frameNode);
  }

  function existingTagTransform(component, placement) {
    const dx = placement.shape.x - component.originalBounds.x;
    const dy = placement.shape.y - component.originalBounds.y;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return "";
    const x = Number(dx.toFixed(3));
    const y = Number(dy.toFixed(3));
    return `translate(${x} ${y})`;
  }

  function applyModelToView(view, model) {
    const doc = D.parseSvg(view.svgcontent, window.DOMParser);
    if (model.components.some((component) =>
      component.template === "icon" || component.template === "icon-pair"
    )) {
      doc.documentElement.setAttributeNS(
        "http://www.w3.org/2000/xmlns/",
        "xmlns:xlink",
        XLINK_NS
      );
    }
    const layer = getLayer(doc);
    if (!layer) throw new Error(`View「${view.name || view.id}」找不到可安全插入元件的 SVG 圖層。`);
    const previousItems = { ...view.items };
    removeManagedFromView(view, model, doc);
    const layout = D.layoutFloorComponents(model.components, model.grid, state.tags, state.floorGroupFrame);
    for (const section of layout.sections) {
      const titleKey = floorTitleKey(section.floor);
      const frameId = model.floorFrames[titleKey] || allocateId("svg");
      model.floorFrames[titleKey] = frameId;
      model.floorFrameIds[titleKey] = [frameId];
      const frameShapeId = model.floorFrameShapeIds[titleKey] ||
        (model.floorFrameShapeIds[titleKey] = allocateId("SHE"));
      const frameNode = buildFloorFrameNode(doc, section, frameId, frameShapeId);
      insertFloorFrameNode(layer, frameNode, section, doc);
      view.items[frameId] = buildFloorFrameEntry(previousItems[frameId], frameId);
      const titleId = model.floorTitles[titleKey] || allocateId("svg");
      model.floorTitles[titleKey] = titleId;
      model.floorTitleIds[titleKey] = [titleId];
      const titleNode = buildFloorTitleNode(doc, section, titleId, model.grid);
      layer.append(titleNode);
      view.items[titleId] = buildFloorTitleEntry(previousItems[titleId], titleId);
      for (const { component, placement } of section.entries) {
        if (component.managed === false) {
          const node = D.findById(doc, component.shapeId);
          if (!node) throw new Error(`既有 Tag 元件 ${component.shapeId} 在 SVG 中不存在。`);
          const transform = existingTagTransform(component, placement);
          if (transform) {
            node.setAttribute("transform", transform);
            node.setAttribute("data-fuxa-floor-layout", FLOOR_LAYOUT_MARKER);
          } else {
            node.removeAttribute("transform");
            node.removeAttribute("data-fuxa-floor-layout");
          }
          for (const companion of component.companions || []) {
            const labelNode = D.findById(doc, companion.id);
            if (!labelNode) throw new Error(`既有 Tag 標籤 ${companion.id} 在 SVG 中不存在。`);
            if (transform) {
              labelNode.setAttribute("transform", transform);
              labelNode.setAttribute("data-fuxa-floor-layout", FLOOR_LAYOUT_MARKER);
            } else {
              labelNode.removeAttribute("transform");
              labelNode.removeAttribute("data-fuxa-floor-layout");
            }
          }
          continue;
        }
        const previousShape = previousItems[component.shapeId];
        const previousLabel = previousItems[component.labelId];
        const previousAlarmShape = component.alarmShapeId
          ? previousItems[component.alarmShapeId] : null;
        const shapeNodes = component.template === "icon-pair"
          ? buildIconPairNodes(doc, component, placement)
          : [buildShapeNode(doc, component, placement)];
        const labelNode = buildLabelNode(doc, component, placement, model.grid);
        layer.append(...shapeNodes, labelNode);
        if (component.template === "icon-pair") {
          const [normalNode, alarmNode] = shapeNodes;
          view.items[component.shapeId] = buildItemEntry(previousShape, component, normalNode);
          view.items[component.alarmShapeId] = buildItemEntry(previousAlarmShape, component, alarmNode);
        } else {
          view.items[component.shapeId] = buildItemEntry(previousShape, component, shapeNodes[0]);
        }
        view.items[component.labelId] = buildLabelEntry(previousLabel, component);
      }
    }
    const activeFloorKeys = new Set(layout.sections.map((section) => floorTitleKey(section.floor)));
    for (const key of [
      ...Object.keys(model.floorTitles),
      ...Object.keys(model.floorTitleIds),
      ...Object.keys(model.floorFrames),
      ...Object.keys(model.floorFrameIds),
      ...Object.keys(model.floorFrameShapeIds)
    ]) {
      if (activeFloorKeys.has(key)) continue;
      delete model.floorTitles[key];
      delete model.floorTitleIds[key];
      delete model.floorFrames[key];
      delete model.floorFrameIds[key];
      delete model.floorFrameShapeIds[key];
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
      const layout = D.layoutFloorComponents(model.components, model.grid, state.tags, state.floorGroupFrame);
      for (const section of layout.sections) {
        const titleKey = floorTitleKey(section.floor);
        const frameId = model.floorFrames[titleKey] ||
          (model.floorFrames[titleKey] = allocateId("svg"));
        const frameNode = D.findById(svg, frameId);
        if (frameNode) {
          frameNode.removeAttribute("opacity");
          for (const child of Array.from(frameNode.querySelectorAll("*"))) child.removeAttribute("opacity");
        }
        const titleId = model.floorTitles[titleKey] ||
          (model.floorTitles[titleKey] = allocateId("svg"));
        const previousTitle = D.findById(svg, titleId);
        if (previousTitle && previousTitle.parentNode) previousTitle.parentNode.removeChild(previousTitle);
        const title = buildFloorTitleNode(svg.ownerDocument, section, titleId, model.grid);
        layer.append(title);
        title.removeAttribute("opacity");
        for (const { component, placement } of section.entries) {
          const previewComponent = { ...component };
          const shapes = previewComponent.template === "icon-pair"
            ? buildIconPairNodes(svg.ownerDocument, previewComponent, placement)
            : [buildShapeNode(svg.ownerDocument, previewComponent, placement)];
          const label = buildLabelNode(svg.ownerDocument, previewComponent, placement, model.grid);
          for (const shape of shapes) shape.removeAttribute("opacity");
          label.removeAttribute("opacity");
          for (const child of shapes.flatMap((shape) => Array.from(shape.querySelectorAll("*")))) {
            child.removeAttribute("opacity");
          }
          if (previewComponent.template === "icon-pair") {
            shapes[previewComponent.invertIconState ? 0 : 1].setAttribute("display", "none");
          }
          layer.append(...shapes, label);
        }
      }
      elements.previewHost.append(svg);
      elements.previewSize.textContent = `${width} × ${height}`;
      const outside = layout.placements.some(({ placement }) => {
        const { shape } = placement;
        return shape.x < 0 || shape.y < 0 || shape.x + shape.width > width || shape.y + shape.height > height;
      }) || layout.sections.some((section) =>
        section.titleY < 0 || section.titleY > height || section.x > width ||
        section.frame.x < 0 || section.frame.y < 0 ||
        section.frame.x + section.frame.width > width ||
        section.frame.y + section.frame.height > height
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
    if (JSON.stringify(state.config.devices) !== state.originalDevices) return true;
    if (JSON.stringify(state.iconLibrary) !== state.originalIcons) return true;
    if (JSON.stringify(state.floorGroupFrame) !== JSON.stringify(state.originalFloorGroupFrame)) return true;
    const currentViewIds = state.config.hmi.views.map((view) => view.id);
    if (JSON.stringify(currentViewIds) !== JSON.stringify(state.originalViewIds)) return true;
    const currentViewNames = state.config.hmi.views.map((view) => [view.id, view.name || ""]);
    if (JSON.stringify(currentViewNames) !== JSON.stringify(state.originalViewNames)) return true;
    if (JSON.stringify(state.config.hmi.layout || null) !== JSON.stringify(state.originalLayout)) return true;
    for (const [viewId, model] of state.models) {
      if (needsFloorLayout(model)) return true;
      if (JSON.stringify(floorGroupArtifactsForModel(model)) !==
          JSON.stringify(D.getFloorGroupArtifacts(state.config, viewId))) return true;
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
    renderIconLibrary();
    renderFloorOptions();
    renderViewList();
    const view = selectedView();
    const model = selectedModel();
    elements.viewName.textContent = view ? (view.name || view.id) : "選取 View";
    elements.viewMeta.textContent = view
      ? `畫布 ${Number(view.profile && view.profile.width) || 1024} × ${Number(view.profile && view.profile.height) || 768}`
      : "";
    elements.addOne.disabled = !model;
    elements.addMany.disabled = !model || state.tags.size === 0;
    elements.deviceMgrButton.disabled = !state.config;
    elements.floorManagerButton.disabled = !state.config;
    elements.quickBatchTagsButton.disabled = !state.config;
    elements.iconLibraryButton.disabled = !state.config;
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

  function makeComponent(tagId, label) {
    const model = selectedModel();
    const seq = nextComponentSequence(model);
    return {
      key: `new-${crypto.randomUUID()}`,
      seq,
      tagId: tagId || "",
      label: label || "",
      template: "rect",
      palette: "normal",
      shapeId: allocateId("SHE"),
      labelId: allocateId("svg"),
      shapeInnerIds: [allocateId("SHE")],
      managed: true
    };
  }

  function addComponent(tagId, label) {
    const model = selectedModel();
    if (!model) return;
    rememberUndo();
    model.components.push(makeComponent(tagId, label));
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
      grid: { ...D.DEFAULT_GRID },
      floorTitles: {},
      originalFloorTitles: {},
      floorTitleIds: {},
      originalFloorTitleIds: {},
      floorFrames: {},
      originalFloorFrames: {},
      floorFrameIds: {},
      originalFloorFrameIds: {},
      floorFrameShapeIds: {}
    };
    state.models.set(view.id, model);
    state.baselines.set(view.id, JSON.stringify({
      components: model.components,
      grid: model.grid
    }));
    state.floorBaselines.set(view.id, floorSignature(model));
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
    state.floorBaselines.delete(viewId);
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
    updateTagSelectAll(tags.map((tag) => tag.id));
  }

  function updateTagSelectAll(tagIds) {
    const selectedCount = tagIds.filter((tagId) => batchSelection.has(tagId)).length;
    elements.tagSelectAll.checked = tagIds.length > 0 && selectedCount === tagIds.length;
    elements.tagSelectAll.indeterminate = selectedCount > 0 && selectedCount < tagIds.length;
    elements.tagSelectAll.disabled = tagIds.length === 0;
  }

  elements.tagChoices.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== "checkbox") return;
    if (checkbox.checked) batchSelection.add(checkbox.value);
    else batchSelection.delete(checkbox.value);
    const visibleTagIds = Array.from(elements.tagChoices.querySelectorAll('input[type="checkbox"]'), (item) => item.value);
    updateTagSelectAll(visibleTagIds);
  });

  elements.tagSelectAll.addEventListener("change", () => {
    const visibleTagIds = Array.from(elements.tagChoices.querySelectorAll('input[type="checkbox"]'), (item) => item.value);
    for (const tagId of visibleTagIds) {
      if (elements.tagSelectAll.checked) batchSelection.add(tagId);
      else batchSelection.delete(tagId);
    }
    renderTagChoices(elements.tagSearch.value);
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
      const seq = nextComponentSequence(model);
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
    const singleIconIds = new Set();
    const pairAssetIds = new Set();
    for (const icon of state.iconLibrary) {
      if (icon.type === "pair") {
        pairAssetIds.add(icon.normal.id);
        pairAssetIds.add(icon.alarm.id);
      } else {
        singleIconIds.add(icon.id);
      }
    }
    for (const model of state.models.values()) {
      for (const component of model.components) {
        if (component.managed === false) continue;
        if (!component.tagId || !state.tags.has(component.tagId)) {
          return `項目「${component.label || "(未命名 Label)"}」尚未連結有效 Tag，請先修正。`;
        }
        if (component.template === "icon" && !singleIconIds.has(component.iconId)) {
          return `項目「${component.label || "(未命名 Label)"}」使用的圖示不存在，請重新選擇。`;
        }
        if (component.template === "icon-pair") {
          const hasPair = getIconPairChoices().some((pair) =>
            pair.normalIconId === component.normalIconId &&
            pair.alarmIconId === component.alarmIconId);
          if (!hasPair ||
              (!pairAssetIds.has(component.normalIconId) &&
               !getIconAsset(component.normalIconId)) ||
              (!pairAssetIds.has(component.alarmIconId) &&
               !getIconAsset(component.alarmIconId))) {
            return `項目「${component.label || "(未命名 Label)"}」必須選擇正常／告警圖示組。`;
          }
          const tag = state.tags.get(component.tagId);
          if (!tag || !["bool", "boolean"].includes(String(tag.type || "").toLocaleLowerCase())) {
            return `項目「${component.label || "(未命名 Label)"}」的雙圖示顯示條件需要 Boolean Tag。`;
          }
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
        const floorLayout = D.layoutFloorComponents(
          model.components, model.grid, state.tags, state.floorGroupFrame
        );
        for (const component of model.components) {
          if (component.managed === false) {
            const node = D.findById(doc, component.shapeId);
            const item = view.items[component.shapeId];
            if (!node || !item || item.property?.variableId !== component.tagId) {
              throw new Error(`既有 Tag 元件 ${component.shapeId} 的 SVG 或 Tag 綁定未保留。`);
            }
            const entry = floorLayout.placements.find(({ component: placed }) => placed.key === component.key);
            const expectedTransform = entry ? existingTagTransform(component, entry.placement) : null;
            if (!entry || (node.getAttribute("transform") || "") !== expectedTransform ||
                (node.getAttribute("data-fuxa-floor-layout") || "") !==
                  (expectedTransform ? FLOOR_LAYOUT_MARKER : "")) {
              throw new Error(`既有 Tag 元件 ${component.shapeId} 的新位置未正確寫入 SVG。`);
            }
            for (const companion of component.companions || []) {
              const labelNode = D.findById(doc, companion.id);
              if (!labelNode ||
                  (labelNode.getAttribute("transform") || "") !== expectedTransform ||
                  (labelNode.getAttribute("data-fuxa-floor-layout") || "") !==
                    (expectedTransform ? FLOOR_LAYOUT_MARKER : "")) {
                throw new Error(`既有 Tag 元件 ${component.shapeId} 的對應文字標籤未同步移動。`);
              }
            }
            continue;
          }
          const alarmNode = component.alarmShapeId
            ? D.findById(doc, component.alarmShapeId) : null;
          const normalNode = D.findById(doc, component.shapeId);
          if (!normalNode ||
              (component.template === "icon-pair" && !alarmNode) ||
              !D.findById(doc, component.labelId)) {
            throw new Error(`View「${view.name || view.id}」的元件與 Label 未同步寫入 SVG。`);
          }
          if (component.template === "icon-pair" &&
              (normalNode.localName !== "image" || alarmNode.localName !== "image" ||
               !normalNode.parentNode || !alarmNode.parentNode ||
               normalNode.parentNode !== alarmNode.parentNode ||
               normalNode.parentNode.hasAttribute("data-fuxa-icon-pair-wrapper") ||
               ["x", "y", "width", "height"].some((attribute) =>
                 normalNode.getAttribute(attribute) !== alarmNode.getAttribute(attribute)))) {
            throw new Error(`元件 ${component.shapeId} 的正常／告警圖示未輸出為同層且重疊的獨立圖片。`);
          }
          if (!view.items[component.shapeId] ||
              (component.template === "icon-pair" && !view.items[component.alarmShapeId]) ||
              !view.items[component.labelId]) {
            throw new Error(`View「${view.name || view.id}」缺少元件或 Label 的 items 記錄。`);
          }
          if (component.template === "icon-pair") {
            const normalActions = view.items[component.shapeId].property?.actions || [];
            const alarmActions = view.items[component.alarmShapeId]?.property?.actions || [];
            const normalVisibleValue = component.invertIconState ? 1 : 0;
            const hasVisibilityRule = (actions, visibleValue) =>
              [0, 1].every((value) => actions.some((action) =>
                action.variableId === component.tagId &&
                action.range?.min === value && action.range?.max === value &&
                action.type === (value === visibleValue ? "show" : "hide")
              ));
            if (!hasVisibilityRule(normalActions, normalVisibleValue) ||
                !hasVisibilityRule(alarmActions, 1 - normalVisibleValue)) {
              throw new Error(`元件 ${component.shapeId} 的正常／告警圖示可見條件未正確寫入。`);
            }
          } else if (view.items[component.shapeId].property?.variableId !== component.tagId) {
            throw new Error(`元件 ${component.shapeId} 的 Tag 連結與清單不一致。`);
          }
          if (!component.tagId || !state.tags.has(component.tagId)) {
            throw new Error(`元件 ${component.shapeId} 連結到不存在的 Tag：${component.tagId || "(空白)"}`);
          }
        }
        for (const section of floorLayout.sections) {
          const titleId = model.floorTitles[floorTitleKey(section.floor)];
          const titleNode = titleId ? D.findById(doc, titleId) : null;
          const titleItem = titleId ? view.items[titleId] : null;
          if (!titleNode || !titleItem ||
              titleItem.name !== "fuxa_floor_section_title" ||
              titleNode.textContent !== section.title ||
              titleNode.getAttribute("data-floor-group") !== section.floor) {
            throw new Error(`View「${view.name || view.id}」的「${section.title}」樓層標題未正確寫入。`);
          }
          const frameId = model.floorFrames[floorTitleKey(section.floor)];
          const frameNode = frameId ? D.findById(doc, frameId) : null;
          const frameItem = frameId ? view.items[frameId] : null;
          if (!frameNode || !frameItem ||
              frameItem.name !== "fuxa_floor_section_frame" ||
              frameNode.getAttribute("data-floor-group") !== section.floor) {
            throw new Error(`View「${view.name || view.id}」的「${section.title}」樓層底框未正確寫入。`);
          }
          if ((model.floorTitleIds[floorTitleKey(section.floor)] || []).length !== 1 ||
              (model.floorFrameIds[floorTitleKey(section.floor)] || []).length !== 1) {
            throw new Error(`View「${view.name || view.id}」的「${section.title}」樓層元件仍有重複項目。`);
          }
        }
        const expectedTitles = floorLayout.sections.length;
        const actualTitles = Object.values(view.items)
          .filter((item) => item && item.name === "fuxa_floor_section_title").length;
        const actualFrames = Object.values(view.items)
          .filter((item) => item && item.name === "fuxa_floor_section_frame").length;
        if (actualTitles !== expectedTitles || actualFrames !== expectedTitles) {
          throw new Error(`View「${view.name || view.id}」的樓層標題或底框數量與分組不一致。`);
        }
        const currentIds = managedIds({ components: model.components, originalComponents: [] });
        for (const original of model.originalComponents || []) {
          if (original.managed === false) continue;
          if (currentIds.has(original.shapeId)) continue;
          if (view.items[original.shapeId] || view.items[original.alarmShapeId] ||
              view.items[original.labelId] || D.findById(doc, original.shapeId) ||
              D.findById(doc, original.alarmShapeId) || D.findById(doc, original.labelId)) {
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
    const dirty = isDirty();
    const output = clone(state.config);
    try {
      const modifiedViewIds = new Set();
      for (const [viewId, model] of state.models) {
        const view = output.hmi.views.find((item) => item.id === viewId);
        if (!view) continue;
        const current = JSON.stringify({ components: model.components, grid: model.grid });
        const floorsChanged = floorSignature(model) !== state.floorBaselines.get(viewId);
        const frameStyleChanged = JSON.stringify(state.floorGroupFrame) !==
          JSON.stringify(state.originalFloorGroupFrame);
        if (current === state.baselines.get(viewId) && !floorsChanged &&
            !frameStyleChanged && !needsFloorLayout(model)) continue;
        if (model.components.length === 0 &&
            !Object.keys(model.originalFloorTitles || {}).length &&
            !Object.keys(model.originalFloorFrames || {}).length) continue;
        applyModelToView(view, model);
        modifiedViewIds.add(viewId);
      }
      if (dirty) {
        if (JSON.stringify(state.iconLibrary) !== state.originalIcons) {
          D.saveIconLibrary(output, state.iconLibrary);
        }
        D.saveViewGridSettings(
          output,
          output.hmi.views.map((view) => view.id),
          new Map(Array.from(state.models, ([viewId, model]) => [viewId, model.grid]))
        );
        D.saveFloorGroupFrameSettings(output, state.floorGroupFrame);
        D.saveFloorGroupArtifacts(
          output,
          output.hmi.views.map((view) => view.id),
          new Map(Array.from(state.models, ([viewId, model]) =>
            [viewId, floorGroupArtifactsForModel(model)]))
        );
      }
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
  elements.clearProject.addEventListener("click", clearProject);

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return window.btoa(binary);
  }

  function identifyImageType(bytes) {
    if (bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
          .every((byte, index) => bytes[index] === byte)) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
    if (bytes.length >= 6 &&
        String.fromCharCode(...bytes.subarray(0, 6)).match(/^GIF8[79]a$/)) return "image/gif";
    return "";
  }

  async function readIconAsset(file, id) {
    if (!file) throw new Error("請選擇圖片檔。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = identifyImageType(bytes);
    if (!mimeType) throw new Error(`圖片「${file.name}」格式無效；請選擇 PNG、JPEG 或 GIF。`);
    return { id, mimeType, dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}` };
  }

  function updateIconFormFields() {
    const isPair = elements.iconSetType.value === "pair";
    elements.singleIconFileField.hidden = isPair;
    elements.normalIconFileField.hidden = !isPair;
    elements.alarmIconFileField.hidden = !isPair;
    elements.singleIconFile.required = !isPair;
    elements.normalIconFile.required = isPair;
    elements.alarmIconFile.required = isPair;
  }

  elements.iconSetType.addEventListener("change", updateIconFormFields);
  elements.iconLibraryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.iconSetName.value.trim();
    if (!name) {
      setStatus("圖示名稱不可空白。", "error");
      elements.iconSetName.focus();
      return;
    }
    if (state.iconLibrary.some((icon) =>
      icon.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setStatus(`圖示名稱「${name}」已存在，請輸入不同名稱。`, "error");
      elements.iconSetName.focus();
      return;
    }
    const type = elements.iconSetType.value;
    const id = crypto.randomUUID();
    try {
      let icon;
      if (type === "pair") {
        const [normal, alarm] = await Promise.all([
          readIconAsset(elements.normalIconFile.files[0], `icon-${id}-normal`),
          readIconAsset(elements.alarmIconFile.files[0], `icon-${id}-alarm`)
        ]);
        icon = { id: `icon-set-${id}`, name, type: "pair", normal, alarm };
      } else {
        icon = {
          id: `icon-${id}`,
          name,
          type: "single",
          ...await readIconAsset(elements.singleIconFile.files[0], `icon-${id}`)
        };
      }
      rememberUndo();
      state.iconLibrary = [...state.iconLibrary, icon];
      elements.iconLibraryForm.reset();
      updateIconFormFields();
      renderAll();
      setStatus(`已新增${type === "pair" ? "正常／告警圖示組" : "一般圖示"}「${name}」。`, "success");
      elements.iconSetName.focus();
    } catch (error) {
      setStatus(`無法新增圖示：${error.message}`, "error");
    }
  });

  elements.rows.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-key]");
    if (!field || !row) return;
    if (["graphic", "invertIconState"].includes(field)) return;
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
    if (field === "graphic") {
      const model = selectedModel();
      const component = model && model.components.find((item) => item.key === row.dataset.key);
      if (!component) return;
      const value = event.target.value;
      const isSingleIcon = value.startsWith("icon:");
      const isPairIcon = value.startsWith("pair:");
      const nextTemplate = isSingleIcon ? "icon" : isPairIcon ? "icon-pair" : value;
      const selectedPair = isPairIcon
        ? getIconPairChoices().find((pair) => pair.choiceId === value.slice("pair:".length))
        : null;
      const nextIconId = isSingleIcon ? value.slice("icon:".length) : "";
      if (component.template === nextTemplate &&
          (nextTemplate === "icon" && component.iconId === nextIconId ||
           nextTemplate === "icon-pair" && selectedPair &&
             component.normalIconId === selectedPair.normalIconId &&
             component.alarmIconId === selectedPair.alarmIconId ||
           !["icon", "icon-pair"].includes(nextTemplate))) return;
      rememberUndo();
      if (nextTemplate === "icon-pair" && !component.alarmShapeId) {
        component.alarmShapeId = allocateId("SHE");
      }
      component.template = nextTemplate;
      if (nextTemplate === "icon") component.iconId = nextIconId;
      else delete component.iconId;
      if (nextTemplate === "icon-pair" && selectedPair) {
        component.normalIconId = selectedPair.normalIconId;
        component.alarmIconId = selectedPair.alarmIconId;
      }
      if (nextTemplate !== "icon-pair") {
        delete component.normalIconId;
        delete component.alarmIconId;
        delete component.invertIconState;
        delete component.alarmShapeId;
      }
      renderAll();
      return;
    }
    if (field === "invertIconState") {
      mutateComponent(row.dataset.key, field, event.target.checked);
      return;
    }
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

  for (const [key, input] of Object.entries(frameInputs)) {
    input.addEventListener("change", () => {
      if (!state.config) return;
      const nextFrame = { ...state.floorGroupFrame };
      nextFrame[key] = key === "fillOpacity"
        ? Number(input.value) / 100
        : input.type === "number" ? Number(input.value) : input.value;
      const normalized = D.normalizeFloorGroupFrameSettings(nextFrame);
      if (JSON.stringify(normalized) === JSON.stringify(state.floorGroupFrame)) {
        input.value = String(key === "fillOpacity"
          ? Math.round(state.floorGroupFrame[key] * 100)
          : state.floorGroupFrame[key]);
        return;
      }
      rememberUndo();
      state.floorGroupFrame = normalized;
      renderAll();
    });
  }

  function openDeviceMgr(tabName, targetDeviceId) {
    if (!state.config) return;
    if (targetDeviceId && state.config.devices[targetDeviceId]) {
      state.selectedDeviceId = targetDeviceId;
      state.isCreatingNewDevice = false;
    }
    renderDeviceList(elements.deviceSearch.value);
    if (state.selectedDeviceId && state.config.devices[state.selectedDeviceId]) {
      selectDevice(state.selectedDeviceId);
    } else {
      prepareNewDevice();
    }
    updateBatchDeviceOptions();
    if (targetDeviceId) {
      elements.batchTagDevice.value = targetDeviceId;
      onBatchDeviceChange();
    }
    switchDeviceMgrTab(tabName || "device");
    elements.deviceMgrDialog.showModal();
  }

  function switchDeviceMgrTab(tabName) {
    const isDevice = tabName === "device";
    elements.tabBtnDevice.classList.toggle("active", isDevice);
    elements.tabBtnTags.classList.toggle("active", !isDevice);
    elements.tabPaneDevice.classList.toggle("active", isDevice);
    elements.tabPaneTags.classList.toggle("active", !isDevice);
    if (!isDevice) {
      if (state.selectedDeviceId && elements.batchTagDevice.value !== state.selectedDeviceId) {
        elements.batchTagDevice.value = state.selectedDeviceId;
        onBatchDeviceChange();
      } else {
        renderBatchTagPreview();
      }
    }
  }

  function renderDeviceList(filterQuery) {
    elements.deviceList.replaceChildren();
    if (!state.config || !state.config.devices) return;
    const query = (filterQuery || "").trim().toLowerCase();
    const devices = Object.values(state.config.devices).filter((dev) => {
      if (!D.isRecord(dev)) return false;
      const name = String(dev.name || dev.id || "").toLowerCase();
      const addr = String(dev.property && dev.property.address ? dev.property.address : "").toLowerCase();
      const type = String(dev.type || "").toLowerCase();
      return name.includes(query) || addr.includes(query) || type.includes(query);
    });

    for (const dev of devices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "device-item";
      if (!state.isCreatingNewDevice && dev.id === state.selectedDeviceId) {
        button.classList.add("active");
      }
      const top = document.createElement("div");
      top.className = "device-item-top";
      const title = document.createElement("span");
      title.className = "device-item-title";
      title.textContent = dev.name || dev.id;

      const badge = document.createElement("span");
      badge.className = `badge ${dev.enabled ? "badge-success" : "badge-muted"}`;
      badge.textContent = dev.enabled ? "已啟用" : "停用";
      top.append(title, badge);

      const meta = document.createElement("div");
      meta.className = "device-item-meta";
      const tagCount = dev.tags ? Object.keys(dev.tags).length : 0;
      const addrText = (dev.property && dev.property.address) ? dev.property.address : "無位址";
      meta.textContent = `${dev.type || "ModbusTCP"} · ${addrText} · ${tagCount} 個 Tag`;

      button.append(top, meta);
      button.addEventListener("click", () => {
        state.isCreatingNewDevice = false;
        selectDevice(dev.id);
        renderDeviceList(elements.deviceSearch.value);
      });
      elements.deviceList.append(button);
    }

    if (!devices.length) {
      const empty = document.createElement("div");
      empty.className = "empty-cell";
      empty.textContent = "查無符合條件的設備。";
      elements.deviceList.append(empty);
    }
  }

  function selectDevice(deviceId) {
    const dev = state.config.devices[deviceId];
    if (!dev) return;
    const isModbusTcp = dev.type === "ModbusTCP";
    state.selectedDeviceId = deviceId;
    state.isCreatingNewDevice = false;
    elements.deviceFormTitle.textContent = `編輯設備：${dev.name || dev.id}`;
    elements.deviceIdBadge.textContent = dev.id;
    elements.devName.value = dev.name || "";
    elements.devEnabled.checked = Boolean(dev.enabled);
    elements.devAddress.value = (dev.property && dev.property.address) ? dev.property.address : "";
    elements.devSlaveId.value = (dev.property && dev.property.slaveid !== undefined && dev.property.slaveid !== null) ? String(dev.property.slaveid) : "1";
    elements.devPolling.value = dev.polling || 200;
    elements.devAddressCount.value = String(
      dev.property && Number.isSafeInteger(Number(dev.property.addressCount))
        ? Number(dev.property.addressCount) : 0
    );
    elements.devAddressCountField.hidden = !isModbusTcp;
    elements.devConnOption.value = (dev.property && dev.property.connectionOption) ? dev.property.connectionOption : "TcpPort";
    elements.devTimeout.value = (dev.property && dev.property.timeout !== undefined && dev.property.timeout !== null) ? dev.property.timeout : 2000;
    elements.devDelay.value = (dev.property && dev.property.delay !== undefined && dev.property.delay !== null) ? dev.property.delay : 10;
    elements.devBaudrate.value = (dev.property && dev.property.baudrate) ? dev.property.baudrate : 9600;
    elements.devDatabits.value = (dev.property && dev.property.databits) ? dev.property.databits : 8;
    elements.devStopbits.value = (dev.property && dev.property.stopbits) ? dev.property.stopbits : 1;
    elements.devParity.value = (dev.property && dev.property.parity) ? dev.property.parity : "None";
    elements.devForceFC16.checked = Boolean(dev.property && dev.property.forceFC16);

    const tagCount = dev.tags ? Object.keys(dev.tags).length : 0;
    elements.deviceTagsCountText.textContent = `目前已有 ${tagCount} 個 Tag`;
    elements.deleteDeviceBtn.hidden = (dev.id === "0");
    elements.shiftAddressesUp.hidden = !isModbusTcp;
    elements.shiftAddressesDown.hidden = !isModbusTcp;
  }

  function prepareNewDevice() {
    state.isCreatingNewDevice = true;
    elements.deviceFormTitle.textContent = "新增 ModbusTCP 設備";
    elements.deviceIdBadge.textContent = "(新建立後自動產生 ID)";
    elements.devName.value = "";
    elements.devEnabled.checked = true;
    elements.devAddress.value = "127.0.0.1:502";
    elements.devSlaveId.value = "1";
    elements.devPolling.value = 200;
    elements.devAddressCount.value = 0;
    elements.devAddressCountField.hidden = false;
    elements.devConnOption.value = "TcpPort";
    elements.devTimeout.value = 2000;
    elements.devDelay.value = 10;
    elements.devBaudrate.value = 9600;
    elements.devDatabits.value = 8;
    elements.devStopbits.value = 1;
    elements.devParity.value = "None";
    elements.devForceFC16.checked = false;
    elements.deviceTagsCountText.textContent = "目前已有 0 個 Tag";
    elements.deleteDeviceBtn.hidden = true;
    elements.shiftAddressesUp.hidden = true;
    elements.shiftAddressesDown.hidden = true;
    renderDeviceList(elements.deviceSearch.value);
  }

  function shiftSelectedDeviceAddresses(delta) {
    const device = state.config && state.config.devices[state.selectedDeviceId];
    if (!device || device.type !== "ModbusTCP") return;

    let plan;
    try {
      plan = D.getModbusTcpAddressShiftPlan(device, delta);
    } catch (error) {
      setStatus(error.message, "error");
      return;
    }
    const direction = delta > 0 ? "+1" : "-1";
    if (!plan.count) {
      setStatus(plan.skippedInvalid
        ? `沒有可調整的有效數字 address；另有 ${plan.skippedInvalid} 個無效 address 保持不變。`
        : "本站沒有可調整的數字 address。", plan.skippedInvalid ? "warning" : "info");
      return;
    }
    if (!window.confirm(
      `確定將設備「${device.name || device.id}」的 ${plan.count} 個 Tag address 全部 ${direction}？\n` +
      "此操作跨所有 memaddress 區段；沒有 address 的 Tag 不變。"
    )) return;

    rememberUndo();
    const result = D.shiftModbusTcpAddresses(device, delta);
    state.tags = D.buildTagIndex(state.config);
    renderAll();
    renderDeviceList(elements.deviceSearch.value);
    selectDevice(state.selectedDeviceId);
    updateBatchDeviceOptions();
    onBatchDeviceChange();
    setStatus(
      `已將設備「${device.name || device.id}」的 ${result.count} 個 Tag address 全部 ${direction}。` +
      (result.skippedInvalid ? ` ${result.skippedInvalid} 個無效 address 未變更。` : ""),
      result.skippedInvalid ? "warning" : "success"
    );
  }

  function handleSaveDevice(event) {
    event.preventDefault();
    const name = elements.devName.value.trim();
    if (!name) {
      setStatus("設備名稱不可空白。", "error");
      return;
    }

    const params = {
      name,
      enabled: elements.devEnabled.checked,
      address: elements.devAddress.value.trim(),
      slaveid: elements.devSlaveId.value.trim(),
      polling: Number(elements.devPolling.value) || 200,
      connectionOption: elements.devConnOption.value.trim() || "TcpPort",
      timeout: Number(elements.devTimeout.value) || 2000,
      delay: Number(elements.devDelay.value) || 10,
      baudrate: Number(elements.devBaudrate.value) || 9600,
      databits: Number(elements.devDatabits.value) || 8,
      stopbits: Number(elements.devStopbits.value) || 1,
      parity: elements.devParity.value,
      forceFC16: elements.devForceFC16.checked
    };
    const currentDevice = state.isCreatingNewDevice
      ? null : state.config.devices[state.selectedDeviceId];
    if (state.isCreatingNewDevice || currentDevice && currentDevice.type === "ModbusTCP") {
      params.addressCount = Number(elements.devAddressCount.value);
    }

    if (params.addressCount !== undefined &&
        (!Number.isSafeInteger(params.addressCount) ||
         params.addressCount < 0 || params.addressCount > 65536)) {
      setStatus("地址數量必須是 0 到 65536 之間的整數。", "error");
      elements.devAddressCount.focus();
      return;
    }
    const existingDevice = currentDevice && currentDevice.type === "ModbusTCP"
      ? currentDevice : null;
    if (existingDevice) {
      try {
        D.getModbusTcpAddressFillPlan({
          ...existingDevice,
          property: { ...existingDevice.property, addressCount: params.addressCount }
        });
      } catch (error) {
        setStatus(error.message, "error");
        elements.devAddressCount.focus();
        return;
      }
    }

    rememberUndo();
    let device;
    if (state.isCreatingNewDevice) {
      device = D.createModbusTcpDevice(params, state.usedDeviceIds, window.crypto);
      state.config.devices[device.id] = device;
      D.syncDeviceConnectionTag(state.config, device.id, device.name, window.crypto, state.usedTagIds);
      state.selectedDeviceId = device.id;
      state.isCreatingNewDevice = false;
      setStatus(`已成功建立 ModbusTCP 設備「${device.name}」(${device.id})。`, "success");
    } else {
      device = state.config.devices[state.selectedDeviceId];
      if (!device) return;
      D.updateModbusTcpDevice(device, params);
      D.syncDeviceConnectionTag(state.config, device.id, device.name, window.crypto, state.usedTagIds);
      setStatus(`已更新設備「${device.name}」設定。`, "success");
    }

    const fillResult = device.type === "ModbusTCP"
      ? D.fillModbusTcpAddressGaps(device, state.usedTagIds, window.crypto)
      : { created: [], count: 0, hasAnchor: false };
    state.tags = D.buildTagIndex(state.config);
    renderAll();
    renderDeviceList(elements.deviceSearch.value);
    selectDevice(state.selectedDeviceId);
    updateBatchDeviceOptions();
    if (fillResult.created.length) {
      setStatus(`已更新設備「${device.name}」設定，並自動建立 ${fillResult.created.length} 個補位 Tag（${fillResult.startAddress}–${fillResult.endAddress}）。`, "success");
    } else if (fillResult.count && !fillResult.hasAnchor) {
      setStatus(`已更新設備「${device.name}」設定；目前沒有可作為起點的 Tag，新增第一個 Tag 後會自動補齊地址。`, "warning");
    }
  }

  function handleDeleteDevice() {
    const devId = state.selectedDeviceId;
    const dev = state.config.devices[devId];
    if (!dev || devId === "0") return;

    const linkedViews = [];
    for (const [viewId, model] of state.models) {
      const view = state.config.hmi.views.find((v) => v.id === viewId);
      const viewTitle = view ? (view.name || view.id) : viewId;
      const count = model.components.filter((comp) => {
        const tag = state.tags.get(comp.tagId);
        return tag && tag.deviceId === devId;
      }).length;
      if (count > 0) linkedViews.push(`View「${viewTitle}」(${count} 個元件)`);
    }

    let msg = `確定要刪除設備「${dev.name || devId}」嗎？此操作將同時移除其所有 Tag。`;
    if (linkedViews.length) {
      msg += `\n\n警告：以下 View 正在使用此設備的 Tag，刪除後將導致元件 Tag 參照失效：\n${linkedViews.join("\n")}`;
    }
    if (!window.confirm(msg)) return;

    rememberUndo();
    D.removeDevice(state.config, devId);
    state.tags = D.buildTagIndex(state.config);

    const devKeys = Object.keys(state.config.devices);
    state.selectedDeviceId = devKeys.find((id) => id !== "0") || devKeys[0] || "";
    state.isCreatingNewDevice = false;

    renderAll();
    renderDeviceList(elements.deviceSearch.value);
    if (state.selectedDeviceId) {
      selectDevice(state.selectedDeviceId);
    } else {
      prepareNewDevice();
    }
    updateBatchDeviceOptions();
    setStatus(`已刪除設備「${dev.name || devId}」。`, "info");
  }

  function updateBatchDeviceOptions() {
    elements.batchTagDevice.replaceChildren();
    if (!state.config || !state.config.devices) return;
    for (const [id, dev] of Object.entries(state.config.devices)) {
      if (id === "0") continue;
      const count = dev.tags ? Object.keys(dev.tags).length : 0;
      const option = makeOption(id, `${dev.name || id} (${dev.type || "Modbus"}) · ${count} tags`, id === state.selectedDeviceId);
      elements.batchTagDevice.append(option);
    }
    if (state.selectedDeviceId && elements.batchTagDevice.value !== state.selectedDeviceId) {
      elements.batchTagDevice.value = state.selectedDeviceId;
    }
  }

  function onBatchDeviceChange() {
    const devId = elements.batchTagDevice.value;
    const dev = state.config ? state.config.devices[devId] : null;
    if (dev) {
      state.selectedDeviceId = devId;
      const memaddr = elements.batchTagMemaddress.value;
      const nextAddr = D.getNextAvailableAddress(dev, memaddr);
      elements.batchTagStartAddr.value = String(nextAddr);
    }
    renderBatchTagPreview();
  }

  function renderBatchTagPreview() {
    elements.batchTagPreviewBody.replaceChildren();
    const devId = elements.batchTagDevice.value;
    const dev = state.config ? state.config.devices[devId] : null;
    const text = elements.batchTagInput.value;
    const startAddr = Number(elements.batchTagStartAddr.value) || 1;
    const step = Number(elements.batchTagStep.value) || 1;
    const defaultMem = elements.batchTagMemaddress.value;
    const defaultType = elements.batchTagType.value;
    const defaultFloor = elements.batchTagFloor.value;

    const specs = D.parseTagBatchInput(text, {
      startAddress: startAddr,
      step,
      defaultMemAddress: defaultMem,
      defaultType,
      defaultFloor
    });

    elements.batchPreviewCount.textContent = `${specs.length} 筆 Tag`;
    elements.batchCreateTagsConfirm.disabled = specs.length === 0 || !dev;

    if (!specs.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.className = "empty-cell";
      td.textContent = "在上方文字框輸入或貼上 Tag 名稱以預覽。";
      tr.append(td);
      elements.batchTagPreviewBody.append(tr);
      return;
    }

    const existingTags = dev && dev.tags ? Object.values(dev.tags) : [];
    const existingAddrs = new Set(existingTags.map((t) => `${t.memaddress}_${t.address}`));
    const existingNames = new Set(existingTags.map((t) => t.name));

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const tr = document.createElement("tr");

      const tdIndex = document.createElement("td");
      tdIndex.textContent = String(i + 1);

      const tdName = document.createElement("td");
      tdName.textContent = spec.name;

      const tdAddr = document.createElement("td");
      tdAddr.textContent = String(spec.address);

      const tdMem = document.createElement("td");
      tdMem.textContent = spec.memaddress;

      const tdType = document.createElement("td");
      tdType.textContent = spec.type;

      const tdFloor = document.createElement("td");
      tdFloor.textContent = spec.floor || "未設定";

      const tdStatus = document.createElement("td");
      const badge = document.createElement("span");
      const isAddrDup = existingAddrs.has(`${spec.memaddress}_${spec.address}`);
      const isNameDup = existingNames.has(spec.name);
      if (isAddrDup) {
        badge.className = "badge badge-warn";
        badge.textContent = "⚠ 位址重複";
      } else if (isNameDup) {
        badge.className = "badge badge-warn";
        badge.textContent = "⚠ 名稱已存在";
      } else {
        badge.className = "badge badge-success";
        badge.textContent = "正常";
      }
      tdStatus.append(badge);

      tr.append(tdIndex, tdName, tdAddr, tdMem, tdType, tdFloor, tdStatus);
      elements.batchTagPreviewBody.append(tr);
    }
  }

  function handleBatchCreateTagsSubmit(event) {
    event.preventDefault();
    const devId = elements.batchTagDevice.value;
    const dev = state.config ? state.config.devices[devId] : null;
    if (!dev) {
      setStatus("請先選取目標設備。", "error");
      return;
    }

    const text = elements.batchTagInput.value;
    const startAddr = Number(elements.batchTagStartAddr.value) || 1;
    const step = Number(elements.batchTagStep.value) || 1;
    const defaultMem = elements.batchTagMemaddress.value;
    const defaultType = elements.batchTagType.value;
    const defaultFloor = elements.batchTagFloor.value;

    const specs = D.parseTagBatchInput(text, {
      startAddress: startAddr,
      step,
      defaultMemAddress: defaultMem,
      defaultType,
      defaultFloor
    });

    if (!specs.length) {
      setStatus("未解析出任何有效的 Tag 項目。", "warning");
      return;
    }

    if (dev.type === "ModbusTCP" && Number(dev.property && dev.property.addressCount) > 0) {
      const candidateTags = { ...(D.isRecord(dev.tags) ? dev.tags : {}) };
      specs.forEach((spec, index) => {
        candidateTags[`pending-${index}`] = {
          address: spec.address,
          memaddress: spec.memaddress
        };
      });
      try {
        D.getModbusTcpAddressFillPlan({ ...dev, tags: candidateTags });
      } catch (error) {
        setStatus(error.message, "error");
        return;
      }
    }

    rememberUndo();
    const created = D.batchCreateTags(dev, specs, state.usedTagIds, window.crypto);
    const fillResult = dev.type === "ModbusTCP"
      ? D.fillModbusTcpAddressGaps(dev, state.usedTagIds, window.crypto)
      : { created: [], count: 0, hasAnchor: false };
    state.tags = D.buildTagIndex(state.config);

    let addedToViewCount = 0;
    if (elements.batchAlsoAddView.checked && selectedModel()) {
      const model = selectedModel();
      for (const tag of created) {
        const seq = nextComponentSequence(model);
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
        addedToViewCount += 1;
      }
    }

    elements.batchTagInput.value = "";
    elements.deviceMgrDialog.close();
    renderAll();
    renderDeviceList(elements.deviceSearch.value);
    selectDevice(dev.id);
    updateBatchDeviceOptions();

    const viewMsg = addedToViewCount > 0 ? `，並已將 ${addedToViewCount} 筆加入當前 View` : "";
    const fillerMsg = fillResult.created.length
      ? `，另自動補齊 ${fillResult.created.length} 個地址`
      : "";
    setStatus(`已成功為設備「${dev.name || dev.id}」批次新增 ${created.length} 個 Tag${fillerMsg}${viewMsg}。`, "success");
  }

  function renderFloorOptions() {
    const floors = Array.from(new Set(Array.from(state.tags.values())
      .map((tag) => tag.floor)
      .filter(Boolean))).sort(D.compareFloors);
    elements.floorOptions.replaceChildren();
    for (const floor of floors) {
      const option = document.createElement("option");
      option.value = floor;
      elements.floorOptions.append(option);
    }
  }

  function updateFloorSelectionSummary(visibleIds) {
    elements.floorSelectedCount.textContent = `已選 ${floorSelection.size} 個`;
    const selectedVisible = visibleIds.filter((id) => floorSelection.has(id)).length;
    elements.floorSelectVisible.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    elements.floorSelectVisible.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
  }

  function renderFloorTagList() {
    elements.floorTagList.replaceChildren();
    renderFloorOptions();
    const query = elements.floorTagSearch.value.trim().toLocaleLowerCase();
    const tags = Array.from(state.tags.values()).filter((tag) =>
      `${tag.deviceName} ${tag.name} ${tag.floor}`.toLocaleLowerCase().includes(query)
    );
    const groups = floorDisplayMode === "group"
      ? D.groupByFloor(tags, (tag) => tag.floor)
      : [{ floor: "", title: "", items: tags }];
    const visibleIds = tags.map((tag) => tag.id);

    if (!tags.length) {
      const empty = document.createElement("div");
      empty.className = "floor-tag-list-empty";
      empty.textContent = "沒有符合條件的 Tag。";
      elements.floorTagList.append(empty);
    }

    for (const group of groups) {
      const groupNode = document.createElement("section");
      groupNode.className = "floor-tag-group";
      if (group.title) {
        const title = document.createElement("div");
        title.className = "floor-tag-group-title";
        title.textContent = `${group.title} · ${group.items.length} 個 Tag`;
        groupNode.append(title);
      }
      for (const tag of group.items) {
        const row = document.createElement("div");
        row.className = "floor-tag-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.floorSelectTag = tag.id;
        checkbox.checked = floorSelection.has(tag.id);
        checkbox.setAttribute("aria-label", `選取 ${tag.deviceName}／${tag.name}`);
        const name = document.createElement("span");
        name.className = "floor-tag-name";
        name.textContent = tag.name;
        const device = document.createElement("span");
        device.className = "floor-tag-device";
        device.textContent = tag.deviceName;
        const floor = document.createElement("input");
        floor.type = "text";
        floor.value = tag.floor;
        floor.placeholder = "未設定樓層";
        floor.setAttribute("list", "floor-options");
        floor.dataset.floorTagId = tag.id;
        floor.setAttribute("aria-label", `${tag.name} 的樓層`);
        row.append(checkbox, name, device, floor);
        groupNode.append(row);
      }
      elements.floorTagList.append(groupNode);
    }
    updateFloorSelectionSummary(visibleIds);
  }

  function setFloorsForTags(tagIds, value) {
    const floor = D.normalizeFloor(value);
    const changed = tagIds.filter((id) => {
      const tag = state.tags.get(id);
      if (!tag) return false;
      const hasStoredFloor = D.isRecord(tag.record.extra) &&
        Object.prototype.hasOwnProperty.call(tag.record.extra, "floor");
      const storedFloor = hasStoredFloor ? tag.record.extra.floor : undefined;
      return tag.floor !== floor ||
        (floor ? storedFloor !== floor : hasStoredFloor);
    });
    if (!changed.length) return 0;

    rememberUndo();
    for (const id of changed) {
      const tag = state.tags.get(id);
      D.setTagFloor(tag.record, floor);
    }
    state.tags = D.buildTagIndex(state.config);
    renderAll();
    if (elements.floorManagerDialog.open) renderFloorTagList();
    return changed.length;
  }

  function openFloorManager() {
    if (!state.config) return;
    floorSelection.clear();
    elements.floorTagSearch.value = "";
    renderFloorTagList();
    elements.floorManagerDialog.showModal();
  }

  elements.iconLibraryButton.addEventListener("click", () => {
    if (!state.config) return;
    renderIconLibrary();
    updateIconFormFields();
    elements.iconLibraryDialog.showModal();
    elements.iconSetName.focus();
  });
  elements.iconLibraryClose.addEventListener("click", () => elements.iconLibraryDialog.close());
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

  // ModbusTCP & Tag Management
  elements.deviceMgrButton.addEventListener("click", () => openDeviceMgr("device"));
  elements.floorManagerButton.addEventListener("click", openFloorManager);
  elements.quickBatchTagsButton.addEventListener("click", () => openDeviceMgr("tags"));
  elements.deviceMgrClose.addEventListener("click", () => elements.deviceMgrDialog.close());
  elements.batchCancelBtn.addEventListener("click", () => elements.deviceMgrDialog.close());
  elements.tabBtnDevice.addEventListener("click", () => switchDeviceMgrTab("device"));
  elements.tabBtnTags.addEventListener("click", () => switchDeviceMgrTab("tags"));
  elements.deviceSearch.addEventListener("input", () => renderDeviceList(elements.deviceSearch.value));
  elements.newDeviceBtn.addEventListener("click", prepareNewDevice);
  elements.deviceForm.addEventListener("submit", handleSaveDevice);
  elements.deleteDeviceBtn.addEventListener("click", handleDeleteDevice);
  elements.shiftAddressesUp.addEventListener("click", () => shiftSelectedDeviceAddresses(1));
  elements.shiftAddressesDown.addEventListener("click", () => shiftSelectedDeviceAddresses(-1));
  elements.goToBatchTagsBtn.addEventListener("click", () => {
    if (state.selectedDeviceId) {
      elements.batchTagDevice.value = state.selectedDeviceId;
      onBatchDeviceChange();
    }
    switchDeviceMgrTab("tags");
  });
  elements.batchTagDevice.addEventListener("change", onBatchDeviceChange);
  elements.batchTagMemaddress.addEventListener("change", onBatchDeviceChange);
  elements.batchTagType.addEventListener("change", renderBatchTagPreview);
  elements.batchTagFloor.addEventListener("input", renderBatchTagPreview);
  elements.batchTagStartAddr.addEventListener("input", renderBatchTagPreview);
  elements.batchTagStep.addEventListener("input", renderBatchTagPreview);
  elements.batchTagInput.addEventListener("input", renderBatchTagPreview);
  elements.batchCreateTagsForm.addEventListener("submit", handleBatchCreateTagsSubmit);
  elements.floorManagerClose.addEventListener("click", () => elements.floorManagerDialog.close());
  elements.floorTagSearch.addEventListener("input", renderFloorTagList);
  elements.floorGroupView.addEventListener("click", () => {
    floorDisplayMode = "group";
    elements.floorGroupView.classList.add("active");
    elements.floorListView.classList.remove("active");
    renderFloorTagList();
  });
  elements.floorListView.addEventListener("click", () => {
    floorDisplayMode = "list";
    elements.floorListView.classList.add("active");
    elements.floorGroupView.classList.remove("active");
    renderFloorTagList();
  });
  elements.floorTagList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.floorSelectTag) {
      if (target.checked) floorSelection.add(target.dataset.floorSelectTag);
      else floorSelection.delete(target.dataset.floorSelectTag);
      updateFloorSelectionSummary(Array.from(elements.floorTagList.querySelectorAll("[data-floor-select-tag]"))
        .map((input) => input.dataset.floorSelectTag));
      return;
    }
    if (target.dataset.floorTagId) {
      const changed = setFloorsForTags([target.dataset.floorTagId], target.value);
      if (changed) {
        elements.floorBulkValue.value = "";
        setStatus(`已更新 ${changed} 個 Tag 的樓層，相關工具管理元件已即時重新排列。`, "success");
      } else {
        target.value = D.normalizeFloor(target.value);
      }
    }
  });
  elements.floorSelectVisible.addEventListener("change", () => {
    const visibleIds = Array.from(elements.floorTagList.querySelectorAll("[data-floor-select-tag]"))
      .map((input) => input.dataset.floorSelectTag);
    for (const id of visibleIds) {
      if (elements.floorSelectVisible.checked) floorSelection.add(id);
      else floorSelection.delete(id);
    }
    renderFloorTagList();
  });
  elements.floorBulkApply.addEventListener("click", () => {
    if (!floorSelection.size) {
      setStatus("請先選取要設定樓層的 Tag。", "warning");
      return;
    }
    const changed = setFloorsForTags(Array.from(floorSelection), elements.floorBulkValue.value);
    elements.floorBulkValue.value = "";
    setStatus(changed
      ? `已更新 ${changed} 個 Tag 的樓層，相關工具管理元件已即時重新排列。`
      : "選取的 Tag 樓層沒有變更。", changed ? "success" : "info");
  });
})();
