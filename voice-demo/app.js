"use strict";

const speech = window.speechSynthesis;
const voiceSelect = document.querySelector("#voice-select");
const voiceNote = document.querySelector("#voice-note");
const speechText = document.querySelector("#speech-text");
const characterCount = document.querySelector("#character-count");
const status = document.querySelector("#status");
const speakButton = document.querySelector("#speak-button");
const pauseButton = document.querySelector("#pause-button");
const resumeButton = document.querySelector("#resume-button");
const cancelButton = document.querySelector("#cancel-button");

let voices = [];
let preferredVoiceURI = "";

function setStatus(text, state = "") {
  status.textContent = text;
  status.dataset.state = state;
}

function updateControls() {
  const supported = Boolean(speech);
  const speaking = supported && speech.speaking;
  const paused = supported && speech.paused;
  const hasText = Boolean(speechText.value.trim());

  speakButton.disabled = !supported || !hasText;
  pauseButton.disabled = !speaking || paused;
  resumeButton.disabled = !paused;
  cancelButton.disabled = !speaking && !paused;
}

function renderVoices() {
  if (!speech) return;
  voices = speech.getVoices();
  voiceSelect.replaceChildren();

  if (!voices.length) {
    voiceSelect.disabled = true;
    voiceSelect.add(new Option("瀏覽器尚未提供語音", ""));
    voiceNote.textContent = "尚未取得語音清單；瀏覽器稍後可能會載入語音。";
    setStatus("等待語音清單");
    return;
  }

  const preferredVoice = voices.find((voice) =>
    voice.lang.toLowerCase() === "zh-tw" && voice.localService,
  );
  const fallbackVoice = voices.find((voice) =>
    voice.lang.toLowerCase() === "zh-tw",
  );
  const initialVoice = preferredVoice || fallbackVoice || voices[0];
  const selectedVoice = voices.find((voice) => voice.voiceURI === preferredVoiceURI)
    || initialVoice;

  for (const voice of voices) {
    const details = [
      voice.lang || "語言未知",
      voice.localService ? "本機" : "線上",
      voice.default ? "預設" : "",
    ].filter(Boolean).join(" · ");
    const option = new Option(`${voice.name}（${details}）`, voice.voiceURI);
    voiceSelect.add(option);
  }

  preferredVoiceURI = selectedVoice.voiceURI;
  voiceSelect.value = selectedVoice.voiceURI;
  voiceSelect.disabled = false;
  voiceNote.textContent = preferredVoice
    ? "已優先選擇繁體中文（台灣）的本機語音。"
    : fallbackVoice
      ? "沒有繁體中文本機語音，已選擇可用的繁體中文語音。"
      : "沒有繁體中文語音，已選擇第一個可用語音；也可手動切換。";
  setStatus("語音已就緒");
  updateControls();
}

function speak() {
  if (!speech) {
    setStatus("此瀏覽器不支援語音合成", "error");
    return;
  }

  const text = speechText.value.trim();
  if (!text) {
    setStatus("請先輸入要朗讀的文字", "error");
    speechText.focus();
    return;
  }

  speech.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = voices.find((voice) => voice.voiceURI === voiceSelect.value);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice?.lang || "zh-TW";
  utterance.onstart = () => {
    setStatus("正在朗讀", "playing");
    updateControls();
  };
  utterance.onend = () => {
    setStatus("朗讀完成");
    updateControls();
  };
  utterance.onerror = (event) => {
    setStatus(`播放失敗：${event.error || "語音合成錯誤"}`, "error");
    updateControls();
  };

  setStatus("準備播放…");
  speech.speak(utterance);
  updateControls();
}

if (!speech || typeof SpeechSynthesisUtterance === "undefined") {
  voiceSelect.disabled = true;
  voiceSelect.replaceChildren(new Option("此瀏覽器不支援語音合成", ""));
  voiceNote.textContent = "請改用支援 Web Speech API 的現代瀏覽器。";
  setStatus("不支援語音合成", "error");
} else {
  renderVoices();
  speech.addEventListener("voiceschanged", renderVoices);
}

speechText.addEventListener("input", () => {
  characterCount.textContent = String(speechText.value.length);
  updateControls();
});
characterCount.textContent = String(speechText.value.length);
voiceSelect.addEventListener("change", () => {
  preferredVoiceURI = voiceSelect.value;
});
speakButton.addEventListener("click", speak);
pauseButton.addEventListener("click", () => {
  speech.pause();
  setStatus("已暫停");
  updateControls();
});
resumeButton.addEventListener("click", () => {
  speech.resume();
  setStatus("正在朗讀", "playing");
  updateControls();
});
cancelButton.addEventListener("click", () => {
  speech.cancel();
  setStatus("已停止");
  updateControls();
});

updateControls();
