(() => {
  "use strict";

  const script = document.currentScript;
  if (!script || window.__chat2orderWidget) return;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const shopKey = script.getAttribute("data-shop-key") || "";
  const apiUrl = (script.getAttribute("data-api-url") || "").replace(/\/+$/, "");

  if (!UUID_RE.test(shopKey) || !/^https?:\/\//i.test(apiUrl)) {
    console.warn(
      "[chat2order] Thiếu hoặc sai data-shop-key / data-api-url, widget không hiển thị.",
    );
    return;
  }
  // visitorId là bí mật của khách, nên bắt buộc có bộ sinh số ngẫu nhiên mã hóa
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    console.warn("[chat2order] Trình duyệt không hỗ trợ bộ sinh số ngẫu nhiên an toàn.");
    return;
  }
  window.__chat2orderWidget = true;

  const title =
    (script.getAttribute("data-title") || "").trim().slice(0, 60) || "Chat với cửa hàng";
  const colorAttr = (script.getAttribute("data-color") || "").trim();
  // Màu được đưa vào CSS nên chỉ chấp nhận đúng dạng #rrggbb
  const brandColor = /^#[0-9a-f]{6}$/i.test(colorAttr) ? colorAttr : "#111827";

  const MAX_LENGTH = 2000;
  const PAGE_LIMIT = 50;
  const OPEN_POLL_MS = 3000;
  const CLOSED_POLL_MS = 10000;
  const MAX_BACKOFF_MS = 60000;
  const REQUEST_TIMEOUT_MS = 15000;

  const ICON_SVG =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #111827; }
    button, textarea, input { font: inherit; }
    button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    .launcher { position: relative; width: 56px; height: 56px; border: 0; border-radius: 50%;
      background: ${brandColor}; color: #fff; cursor: pointer; display: flex; align-items: center;
      justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
    .badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
      border-radius: 10px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 600;
      line-height: 20px; text-align: center; }
    .panel { position: absolute; right: 0; bottom: 68px; width: 360px; height: 480px;
      max-height: calc(100vh - 100px); display: flex; flex-direction: column; background: #fff;
      border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.25); overflow: hidden; }
    @media (max-width: 480px) { .panel { width: calc(100vw - 32px); } }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 14px; background: ${brandColor}; color: #fff; }
    .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
    .close { border: 0; background: transparent; color: inherit; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px; }
    .log { flex: 1; overflow-y: auto; padding: 12px; background: #f9fafb; display: flex; flex-direction: column; gap: 8px; }
    .empty { margin: auto; padding: 0 16px; text-align: center; color: #6b7280; }
    .msg { display: flex; }
    .msg.mine { justify-content: flex-end; }
    .bubble { max-width: 80%; padding: 8px 10px; border-radius: 14px; }
    .mine .bubble { background: ${brandColor}; color: #fff; border-bottom-right-radius: 4px; }
    .theirs .bubble { background: #fff; border: 1px solid #e5e7eb; border-bottom-left-radius: 4px; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .meta { margin-top: 3px; font-size: 11px; opacity: .75; }
    .error { color: #fecaca; margin-right: 6px; }
    .theirs .error { color: #b91c1c; }
    .retry { border: 0; background: transparent; color: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
    .notice { padding: 8px 12px; background: #fef3c7; color: #92400e; font-size: 12px; }
    .footer { padding: 10px; border-top: 1px solid #e5e7eb; background: #fff; display: flex; flex-direction: column; gap: 6px; }
    .name, .input { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 7px 9px; background: #fff; color: #111827; }
    .row { display: flex; gap: 8px; align-items: flex-end; }
    .input { flex: 1; resize: none; }
    .send { border: 0; border-radius: 8px; padding: 8px 14px; background: ${brandColor}; color: #fff; cursor: pointer; }
  `;

  // Sinh UUID v4 từ bộ số ngẫu nhiên mã hóa, kể cả khi trang không chạy trên HTTPS
  function uuid() {
    if (typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const storagePrefix = `chat2order:${shopKey}:`;
  function readStore(key) {
    try {
      return window.localStorage.getItem(storagePrefix + key);
    } catch {
      return null;
    }
  }
  function writeStore(key, value) {
    try {
      window.localStorage.setItem(storagePrefix + key, value);
    } catch {
      /* Trình duyệt chặn lưu trữ: widget vẫn chạy, nhưng mỗi lần tải trang là một khách mới */
    }
  }

  let visitorId = readStore("visitor");
  if (!visitorId || !UUID_RE.test(visitorId)) {
    visitorId = uuid();
    writeStore("visitor", visitorId);
  }
  let visitorName = readStore("name") || "";
  let hasChatted = readStore("chatted") === "1";

  function request(method, path, body, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetch(apiUrl + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) =>
        res
          .json()
          .catch(() => null)
          .then((data) => {
            if (!res.ok) {
              const error = new Error(`HTTP ${res.status}`);
              error.status = res.status;
              throw error;
            }
            return data;
          }),
      )
      .finally(() => clearTimeout(timer));
  }

  function friendlyError(err) {
    if (err && err.status === 429) return "Bạn gửi quá nhanh, vui lòng đợi một chút.";
    if (err && err.status === 404) return "Kênh chat chưa sẵn sàng.";
    if (err && err.status === 400) return "Tin nhắn không hợp lệ.";
    return "Không gửi được. Kiểm tra kết nối rồi thử lại.";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  function start() {
    const messages = [];
    const knownServerIds = new Set();
    let lastServerId = null;
    let isOpen = false;
    let unread = 0;
    let pollTimer = null;
    let polling = false;
    let failures = 0;
    let initialLoaded = false;
    let stopped = false;

    // ---- Giao diện ----
    const host = document.createElement("div");
    host.id = "chat2order-widget";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLE;

    const root = el("div", "root");

    const launcher = el("button", "launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Mở khung chat");
    launcher.setAttribute("aria-expanded", "false");
    const icon = el("span", "icon");
    // Biểu tượng cố định do widget tự viết, không chứa dữ liệu của người dùng
    icon.innerHTML = ICON_SVG;
    const badge = el("span", "badge");
    badge.hidden = true;
    launcher.append(icon, badge);

    const panel = el("section", "panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);

    const header = el("div", "header");
    const closeButton = el("button", "close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Đóng khung chat");
    header.append(el("strong", "title", title), closeButton);

    const log = el("div", "log");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");

    const notice = el("div", "notice");
    notice.hidden = true;

    const footer = el("div", "footer");
    const nameInput = el("input", "name");
    nameInput.type = "text";
    nameInput.maxLength = 100;
    nameInput.placeholder = "Tên của bạn (không bắt buộc)";
    nameInput.value = visitorName;
    nameInput.autocomplete = "name";
    nameInput.setAttribute("aria-label", "Tên của bạn");
    nameInput.hidden = hasChatted;

    const row = el("div", "row");
    const input = el("textarea", "input");
    input.rows = 2;
    input.maxLength = MAX_LENGTH;
    input.placeholder = "Nhập tin nhắn...";
    input.setAttribute("aria-label", "Nội dung tin nhắn");
    const sendButton = el("button", "send", "Gửi");
    sendButton.type = "button";
    row.append(input, sendButton);
    footer.append(nameInput, row);

    panel.append(header, log, notice, footer);
    root.append(panel, launcher);
    shadow.append(style, root);

    function showNotice(text) {
      notice.textContent = text;
      notice.hidden = false;
    }

    function buildBubble(message) {
      const line = el("div", `msg ${message.direction === "INBOUND" ? "mine" : "theirs"}`);
      const bubble = el("div", "bubble");
      // textContent: nội dung tin nhắn luôn là văn bản thuần, không bao giờ là HTML
      bubble.append(el("div", "text", message.text));

      const meta = el("div", "meta");
      if (message.status === "sending") {
        meta.textContent = "Đang gửi...";
      } else if (message.status === "failed") {
        meta.append(el("span", "error", message.error || "Không gửi được."));
        const retry = el("button", "retry", "Thử lại");
        retry.type = "button";
        retry.addEventListener("click", () => deliver(message));
        meta.append(retry);
      } else {
        meta.textContent = formatTime(message.createdAt);
      }
      bubble.append(meta);
      line.append(bubble);
      return line;
    }

    function render(forceScroll) {
      const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.textContent = "";
      if (messages.length === 0) {
        log.append(
          el("p", "empty", "Xin chào! Hãy nhắn tin, cửa hàng sẽ trả lời bạn sớm nhất có thể."),
        );
      }
      for (const message of messages) log.append(buildBubble(message));
      if (forceScroll || nearBottom) log.scrollTop = log.scrollHeight;

      badge.hidden = unread === 0;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      launcher.setAttribute(
        "aria-label",
        unread > 0 ? `Mở khung chat, ${unread} tin mới` : "Mở khung chat",
      );
    }

    // ---- Thăm dò tin mới ----
    function shouldPoll() {
      return !stopped && !document.hidden && (hasChatted || isOpen);
    }

    function nextDelay() {
      const base = isOpen ? OPEN_POLL_MS : CLOSED_POLL_MS;
      return Math.min(base * 2 ** failures, MAX_BACKOFF_MS);
    }

    function scheduleNext(delay) {
      clearTimeout(pollTimer);
      if (shouldPoll()) pollTimer = setTimeout(poll, delay === undefined ? nextDelay() : delay);
    }

    function pollNow() {
      clearTimeout(pollTimer);
      if (shouldPoll() && !polling) poll();
    }

    function mergeServerMessages(items) {
      let added = 0;
      let fromShop = 0;
      for (const item of items) {
        lastServerId = item.id;
        if (knownServerIds.has(item.id)) continue;
        knownServerIds.add(item.id);
        messages.push({
          serverId: item.id,
          direction: item.direction,
          text: String(item.text),
          createdAt: item.createdAt,
          status: "sent",
        });
        added += 1;
        if (item.direction === "OUTBOUND") fromShop += 1;
      }
      return { added, fromShop };
    }

    function poll() {
      if (polling || !shouldPoll()) return;
      polling = true;

      const query =
        `?shopKey=${encodeURIComponent(shopKey)}&limit=${PAGE_LIMIT}` +
        (lastServerId ? `&after=${encodeURIComponent(lastServerId)}` : "");

      request("GET", `/webhooks/web-chat/messages${query}`, null, { "X-Visitor-Id": visitorId })
        .then((data) => {
          failures = 0;
          polling = false;
          const items = data && Array.isArray(data.items) ? data.items : [];
          const result = mergeServerMessages(items);
          // Lần tải lịch sử đầu tiên không tính là tin mới
          if (initialLoaded && !isOpen) unread += result.fromShop;
          initialLoaded = true;
          if (result.added > 0) render(false);
          scheduleNext(items.length >= PAGE_LIMIT ? 0 : undefined);
        })
        .catch((err) => {
          polling = false;
          if (err && err.status === 404) {
            stopped = true;
            showNotice("Kênh chat chưa sẵn sàng.");
            return;
          }
          failures = Math.min(failures + 1, 5);
          scheduleNext();
        });
    }

    // ---- Gửi tin ----
    function deliver(message) {
      message.status = "sending";
      render(false);

      request("POST", "/webhooks/web-chat", {
        shopKey,
        visitorId,
        messageId: message.messageId,
        displayName: visitorName || undefined,
        text: message.text,
      })
        .then((data) => {
          const serverId = data && data.message && data.message.id;
          if (serverId && knownServerIds.has(serverId)) {
            // Lần thăm dò đã trả về chính tin này trước: bỏ bản hiện tạm để không bị hiện hai lần
            messages.splice(messages.indexOf(message), 1);
          } else if (serverId) {
            message.serverId = serverId;
            message.status = "sent";
            knownServerIds.add(serverId);
          } else {
            message.status = "sent";
          }
          render(false);
          pollNow();
        })
        .catch((err) => {
          message.status = "failed";
          message.error = friendlyError(err);
          render(false);
        });
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;

      const name = nameInput.value.trim().slice(0, 100);
      if (name !== visitorName) {
        visitorName = name;
        writeStore("name", name);
      }

      const message = {
        messageId: uuid(), // gửi lại tin này luôn dùng đúng mã này để máy chủ không lưu trùng
        serverId: null,
        direction: "INBOUND",
        text,
        createdAt: new Date().toISOString(),
        status: "sending",
      };
      messages.push(message);
      input.value = "";

      if (!hasChatted) {
        hasChatted = true;
        writeStore("chatted", "1");
        nameInput.hidden = true;
      }
      render(true);
      deliver(message);
    }

    // ---- Mở, đóng và phím tắt ----
    function setOpen(next) {
      isOpen = next;
      panel.hidden = !next;
      launcher.setAttribute("aria-expanded", String(next));
      if (next) {
        unread = 0;
        render(true);
        input.focus();
        pollNow();
      } else {
        launcher.focus();
        scheduleNext();
      }
    }

    launcher.addEventListener("click", () => setOpen(!isOpen));
    closeButton.addEventListener("click", () => setOpen(false));
    sendButton.addEventListener("click", send);
    input.addEventListener("keydown", (event) => {
      // Bỏ qua Enter khi bộ gõ tiếng Việt đang soạn dở một từ
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        send();
      }
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTimeout(pollTimer);
      else pollNow();
    });

    document.body.append(host);
    render(true);
    if (hasChatted) pollNow();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
