const ROOMS = [
  "Whole House",
  "Living / Dining",
  "Kitchen",
  "Hall",
  "Downstairs WC",
  "Ground Floor Store",
  "Bedroom 1",
  "En Suite",
  "Bedroom 2",
  "Bedroom 3",
  "Bathroom",
  "First Floor Store",
  "Office",
  "Garden"
];

const STATUS_LABELS = {
  "to-buy": "Need to buy",
  researching: "Researching",
  ordered: "Ordered",
  arrived: "Arrived"
};

const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const config = window.MOVELIST_CONFIG || {};
const isConfigured =
  config.SUPABASE_URL &&
  config.SUPABASE_KEY &&
  !config.SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  !config.SUPABASE_KEY.includes("YOUR_SUPABASE");

const supabaseClient = isConfigured
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY)
  : null;

let session = null;
let profile = null;
let items = [];
let profiles = new Map();
let activeList = "shared";
let editingId = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  setupBanner: $("#setupBanner"),
  authView: $("#authView"),
  appView: $("#appView"),
  loginForm: $("#loginForm"),
  loginEmail: $("#loginEmail"),
  loginPassword: $("#loginPassword"),
  loginError: $("#loginError"),
  accountName: $("#accountName"),
  accountInitials: $("#accountInitials"),
  personalTabLabel: $("#personalTabLabel"),
  adminButton: $("#adminButton"),
  accountButton: $("#accountButton"),
  heroListName: $("#heroListName"),
  welcomeTitle: $("#welcomeTitle"),
  listHeading: $("#listHeading"),
  listDescription: $("#listDescription"),
  floorPlansSection: $("#floorPlansSection"),
  showPlansButton: $("#showPlansButton"),
  hidePlansButton: $("#hidePlansButton"),
  addItemButton: $("#addItemButton"),
  heroAddItem: $("#heroAddItem"),
  emptyAddButton: $("#emptyAddButton"),
  itemDialog: $("#itemDialog"),
  itemForm: $("#itemForm"),
  itemDialogTitle: $("#itemDialogTitle"),
  itemListHint: $("#itemListHint"),
  itemName: $("#itemName"),
  itemRoom: $("#itemRoom"),
  itemPriority: $("#itemPriority"),
  itemStatus: $("#itemStatus"),
  itemQuantity: $("#itemQuantity"),
  itemEstimatedPrice: $("#itemEstimatedPrice"),
  itemActualPrice: $("#itemActualPrice"),
  itemUrl: $("#itemUrl"),
  itemNotes: $("#itemNotes"),
  itemError: $("#itemError"),
  saveItemButton: $("#saveItemButton"),
  searchInput: $("#searchInput"),
  roomFilter: $("#roomFilter"),
  statusFilter: $("#statusFilter"),
  priorityFilter: $("#priorityFilter"),
  sortSelect: $("#sortSelect"),
  roomSummary: $("#roomSummary"),
  resultsLabel: $("#resultsLabel"),
  itemsGrid: $("#itemsGrid"),
  emptyState: $("#emptyState"),
  itemTemplate: $("#itemTemplate"),
  statItems: $("#statItems"),
  statItemsSub: $("#statItemsSub"),
  statEstimated: $("#statEstimated"),
  statSpent: $("#statSpent"),
  statRemaining: $("#statRemaining"),
  progressRing: $("#progressRing"),
  progressPercent: $("#progressPercent"),
  progressText: $("#progressText"),
  progressSubtext: $("#progressSubtext"),
  adminDialog: $("#adminDialog"),
  createUserForm: $("#createUserForm"),
  newUserName: $("#newUserName"),
  newUserEmail: $("#newUserEmail"),
  newUserPassword: $("#newUserPassword"),
  adminError: $("#adminError"),
  adminSuccess: $("#adminSuccess"),
  createUserButton: $("#createUserButton"),
  accountDialog: $("#accountDialog"),
  accountForm: $("#accountForm"),
  accountDialogName: $("#accountDialogName"),
  accountDialogEmail: $("#accountDialogEmail"),
  profileDisplayName: $("#profileDisplayName"),
  profileNewPassword: $("#profileNewPassword"),
  accountError: $("#accountError"),
  accountSuccess: $("#accountSuccess"),
  signOutButton: $("#signOutButton"),
  planDialog: $("#planDialog"),
  planDialogTitle: $("#planDialogTitle"),
  planDialogImage: $("#planDialogImage"),
  toast: $("#toast")
};

function showError(el, message) {
  el.textContent = message || "Something went wrong.";
  el.hidden = false;
}
function clearMessage(...elements) {
  elements.forEach((el) => { el.hidden = true; el.textContent = ""; });
}
function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}
function money(value) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value || 0));
}
function initials(name) {
  return String(name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}
function safeMessage(error) {
  return error?.message || "Something went wrong. Please try again.";
}

function populateRoomControls() {
  els.itemRoom.innerHTML = "";
  els.roomFilter.innerHTML = '<option value="all">All rooms</option>';
  ROOMS.forEach((room) => {
    els.itemRoom.add(new Option(room, room));
    els.roomFilter.add(new Option(room, room));
  });
}

async function bootstrap() {
  populateRoomControls();

  if (!isConfigured) {
    els.setupBanner.hidden = false;
    els.loginForm.querySelector("button[type=submit]").disabled = true;
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);

  supabaseClient.auth.onAuthStateChange(async (_event, newSession) => {
    if (newSession?.user?.id === session?.user?.id) return;
    await applySession(newSession);
  });
}

async function applySession(newSession) {
  session = newSession;

  if (!session) {
    profile = null;
    items = [];
    profiles = new Map();
    els.appView.hidden = true;
    els.authView.hidden = false;
    return;
  }

  els.authView.hidden = true;
  els.appView.hidden = false;

  await Promise.all([loadProfile(), loadProfiles(), loadItems()]);
  renderIdentity();
  renderAll();
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, display_name, role, created_at")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;
  profile = data;
}

async function loadProfiles() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, display_name, role");

  if (error) throw error;
  profiles = new Map((data || []).map((entry) => [entry.id, entry]));
}

async function loadItems() {
  const { data, error } = await supabaseClient
    .from("items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  items = data || [];
}

function renderIdentity() {
  const name = profile?.display_name || session?.user?.email?.split("@")[0] || "Home";
  els.accountName.textContent = name;
  els.accountInitials.textContent = initials(name);
  els.personalTabLabel.textContent = `${name}'s list`;
  els.welcomeTitle.textContent = `Welcome home, ${name}.`;
  els.adminButton.hidden = profile?.role !== "admin";
}

function currentListItems() {
  return items.filter((item) => activeList === "shared"
    ? item.list_scope === "shared"
    : item.list_scope === "personal" && item.owner_id === session.user.id
  );
}

function filteredItems() {
  const query = els.searchInput.value.trim().toLowerCase();
  const room = els.roomFilter.value;
  const status = els.statusFilter.value;
  const priority = els.priorityFilter.value;

  let result = currentListItems().filter((item) => {
    const haystack = [item.name, item.room, item.notes, item.url].filter(Boolean).join(" ").toLowerCase();
    return (!query || haystack.includes(query)) &&
      (room === "all" || item.room === room) &&
      (status === "all" || item.status === status) &&
      (priority === "all" || item.priority === priority);
  });

  result.sort((a, b) => {
    const sort = els.sortSelect.value;
    if (sort === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || new Date(b.created_at) - new Date(a.created_at);
    if (sort === "room") return a.room.localeCompare(b.room) || a.name.localeCompare(b.name);
    if (sort === "name") return a.name.localeCompare(b.name);

    const aPrice = Number(a.estimated_price || 0) * Number(a.quantity || 1);
    const bPrice = Number(b.estimated_price || 0) * Number(b.quantity || 1);
    if (sort === "price-high") return bPrice - aPrice;
    if (sort === "price-low") return aPrice - bPrice;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return result;
}

function renderAll() {
  renderListLabels();
  renderStats();
  renderRoomSummary();
  renderItems();
}

function renderListLabels() {
  const name = profile?.display_name || "My";
  if (activeList === "shared") {
    els.heroListName.textContent = "Shared list";
    els.listHeading.textContent = "Shared list";
    els.listDescription.textContent = "Things anyone in the house can add to and update.";
  } else {
    els.heroListName.textContent = `${name}'s list`;
    els.listHeading.textContent = `${name}'s list`;
    els.listDescription.textContent = "Your own private list — only you can see or change these items.";
  }
}

function renderStats() {
  const list = currentListItems();
  const arrived = list.filter((item) => item.status === "arrived").length;
  const estimated = list.reduce((sum, item) => sum + Number(item.estimated_price || 0) * Number(item.quantity || 1), 0);
  const spent = list.reduce((sum, item) => sum + Number(item.actual_price || 0) * Number(item.quantity || 1), 0);
  const remaining = list.filter((item) => item.status !== "arrived")
    .reduce((sum, item) => sum + Number(item.estimated_price || 0) * Number(item.quantity || 1), 0);
  const progress = list.length ? Math.round((arrived / list.length) * 100) : 0;

  els.statItems.textContent = list.length;
  els.statItemsSub.textContent = `${arrived} arrived`;
  els.statEstimated.textContent = money(estimated);
  els.statSpent.textContent = money(spent);
  els.statRemaining.textContent = money(remaining);
  els.progressPercent.textContent = `${progress}%`;
  els.progressRing.style.setProperty("--progress", `${progress * 3.6}deg`);

  if (!list.length) {
    els.progressText.textContent = "Nothing here yet";
    els.progressSubtext.textContent = "Add your first item to get started.";
  } else if (progress === 100) {
    els.progressText.textContent = "Everything has arrived 🎉";
    els.progressSubtext.textContent = "This list is completely ticked off.";
  } else {
    els.progressText.textContent = `${arrived} of ${list.length} items arrived`;
    els.progressSubtext.textContent = `${list.length - arrived} still to go.`;
  }
}

function renderRoomSummary() {
  els.roomSummary.innerHTML = "";
  const list = currentListItems();
  const data = ROOMS.map((room) => {
    const roomItems = list.filter((item) => item.room === room);
    const done = roomItems.filter((item) => item.status === "arrived").length;
    return { room, roomItems, done };
  }).filter((entry) => entry.roomItems.length);

  data.forEach(({ room, roomItems, done }) => {
    const node = document.createElement("div");
    node.className = "room-chip";
    const percent = Math.round((done / roomItems.length) * 100);
    node.innerHTML = `
      <button type="button">
        <strong>${escapeHtml(room)}</strong>
        <span>${done}/${roomItems.length} arrived</span>
        <div class="room-chip-progress"><i style="width:${percent}%"></i></div>
      </button>`;
    node.querySelector("button").addEventListener("click", () => jumpToRoom(room));
    els.roomSummary.appendChild(node);
  });
}

function renderItems() {
  const list = filteredItems();
  els.itemsGrid.innerHTML = "";
  els.resultsLabel.textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;

  list.forEach((item) => {
    const fragment = els.itemTemplate.content.cloneNode(true);
    fragment.querySelector(".room-pill").textContent = item.room;

    const priority = fragment.querySelector(".priority-pill");
    priority.textContent = `${PRIORITY_LABELS[item.priority]} priority`;
    priority.classList.add(`priority-${item.priority}`);

    fragment.querySelector(".item-name").textContent = item.name;
    const creator = profiles.get(item.created_by)?.display_name;
    const meta = [`Qty ${item.quantity || 1}`];
    if (activeList === "shared" && creator) meta.push(`Added by ${creator}`);
    if (Number(item.actual_price || 0) > 0) meta.push(`Paid ${money(Number(item.actual_price) * Number(item.quantity || 1))}`);
    fragment.querySelector(".item-meta").textContent = meta.join(" • ");

    const status = fragment.querySelector(".status-pill");
    status.textContent = STATUS_LABELS[item.status] || item.status;
    if (item.status === "arrived") status.classList.add("status-arrived");

    const notes = fragment.querySelector(".item-notes");
    notes.textContent = item.notes || "";
    if (!item.notes) notes.style.display = "none";

    const link = fragment.querySelector(".product-link");
    if (item.url) link.href = item.url;
    else link.classList.add("is-disabled");

    fragment.querySelector(".item-price").textContent = money(Number(item.estimated_price || 0) * Number(item.quantity || 1));

    const arrivedButton = fragment.querySelector(".quick-arrived");
    if (item.status === "arrived") {
      arrivedButton.disabled = true;
      arrivedButton.style.opacity = ".55";
    } else {
      arrivedButton.addEventListener("click", () => markArrived(item.id));
    }

    fragment.querySelector(".edit-button").addEventListener("click", () => openEditItem(item.id));
    fragment.querySelector(".delete-button").addEventListener("click", () => deleteItem(item.id));
    els.itemsGrid.appendChild(fragment);
  });

  const empty = list.length === 0;
  els.itemsGrid.hidden = empty;
  els.emptyState.hidden = !empty;
}

function switchList(list) {
  activeList = list;
  $$(".list-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.list === list));
  els.roomFilter.value = "all";
  els.searchInput.value = "";
  renderAll();
}

function jumpToRoom(room) {
  els.roomFilter.value = room;
  renderItems();
  document.querySelector(".shopping-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewItem() {
  editingId = null;
  clearMessage(els.itemError);
  els.itemForm.reset();
  els.itemQuantity.value = 1;
  els.itemPriority.value = "medium";
  els.itemStatus.value = "to-buy";
  els.itemRoom.value = els.roomFilter.value !== "all" ? els.roomFilter.value : "Whole House";
  els.itemDialogTitle.textContent = "Add item";
  els.itemListHint.textContent = activeList === "shared"
    ? "Adding to the shared list — everyone in the house will see it."
    : `Adding to ${profile.display_name}'s private list.`;
  els.itemDialog.showModal();
  setTimeout(() => els.itemName.focus(), 0);
}

function openEditItem(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  editingId = id;
  clearMessage(els.itemError);
  els.itemDialogTitle.textContent = "Edit item";
  els.itemListHint.textContent = item.list_scope === "shared" ? "This item is on the shared list." : "This item is on your private list.";
  els.itemName.value = item.name;
  els.itemRoom.value = item.room;
  els.itemPriority.value = item.priority;
  els.itemStatus.value = item.status;
  els.itemQuantity.value = item.quantity || 1;
  els.itemEstimatedPrice.value = item.estimated_price ?? "";
  els.itemActualPrice.value = item.actual_price ?? "";
  els.itemUrl.value = item.url || "";
  els.itemNotes.value = item.notes || "";
  els.itemDialog.showModal();
}

async function saveItem(event) {
  event.preventDefault();
  clearMessage(els.itemError);
  setBusy(els.saveItemButton, true, "Saving…");

  const payload = {
    name: els.itemName.value.trim(),
    room: els.itemRoom.value,
    priority: els.itemPriority.value,
    status: els.itemStatus.value,
    quantity: Math.max(1, Number(els.itemQuantity.value || 1)),
    estimated_price: Math.max(0, Number(els.itemEstimatedPrice.value || 0)),
    actual_price: Math.max(0, Number(els.itemActualPrice.value || 0)),
    url: els.itemUrl.value.trim() || null,
    notes: els.itemNotes.value.trim() || null
  };

  try {
    if (editingId) {
      const { error } = await supabaseClient.from("items").update(payload).eq("id", editingId);
      if (error) throw error;
      toast("Item updated");
    } else {
      const insertPayload = {
        ...payload,
        list_scope: activeList,
        owner_id: activeList === "personal" ? session.user.id : null,
        created_by: session.user.id
      };
      const { error } = await supabaseClient.from("items").insert(insertPayload);
      if (error) throw error;
      toast("Item added");
    }

    els.itemDialog.close();
    editingId = null;
    await loadItems();
    renderAll();
  } catch (error) {
    showError(els.itemError, safeMessage(error));
  } finally {
    setBusy(els.saveItemButton, false);
  }
}

async function markArrived(id) {
  const { error } = await supabaseClient.from("items").update({ status: "arrived" }).eq("id", id);
  if (error) return toast(safeMessage(error));
  await loadItems();
  renderAll();
  toast("Marked as arrived 🎉");
}

async function deleteItem(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item || !confirm(`Delete “${item.name}”?`)) return;
  const { error } = await supabaseClient.from("items").delete().eq("id", id);
  if (error) return toast(safeMessage(error));
  await loadItems();
  renderAll();
  toast("Item deleted");
}

async function login(event) {
  event.preventDefault();
  clearMessage(els.loginError);
  const button = els.loginForm.querySelector("button[type=submit]");
  setBusy(button, true, "Signing in…");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: els.loginEmail.value.trim(),
      password: els.loginPassword.value
    });
    if (error) throw error;
    els.loginForm.reset();
  } catch (error) {
    showError(els.loginError, safeMessage(error));
  } finally {
    setBusy(button, false);
  }
}

function openAdmin() {
  if (profile?.role !== "admin") return;
  els.createUserForm.reset();
  clearMessage(els.adminError, els.adminSuccess);
  els.adminDialog.showModal();
}

async function createUser(event) {
  event.preventDefault();
  clearMessage(els.adminError, els.adminSuccess);
  setBusy(els.createUserButton, true, "Creating…");

  try {
    const { data, error } = await supabaseClient.functions.invoke("create-user", {
      body: {
        displayName: els.newUserName.value.trim(),
        email: els.newUserEmail.value.trim(),
        password: els.newUserPassword.value
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    els.adminSuccess.textContent = `Account created for ${els.newUserName.value.trim()}.`;
    els.adminSuccess.hidden = false;
    els.createUserForm.reset();
    await loadProfiles();
  } catch (error) {
    showError(els.adminError, safeMessage(error));
  } finally {
    setBusy(els.createUserButton, false);
  }
}

function openAccount() {
  clearMessage(els.accountError, els.accountSuccess);
  els.accountDialogName.textContent = profile.display_name;
  els.accountDialogEmail.textContent = session.user.email || "";
  els.profileDisplayName.value = profile.display_name;
  els.profileNewPassword.value = "";
  els.accountDialog.showModal();
}

async function saveAccount(event) {
  event.preventDefault();
  clearMessage(els.accountError, els.accountSuccess);
  const saveButton = els.accountForm.querySelector("button[type=submit]");
  setBusy(saveButton, true, "Saving…");

  try {
    const displayName = els.profileDisplayName.value.trim();
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", session.user.id);
    if (profileError) throw profileError;

    const password = els.profileNewPassword.value;
    if (password) {
      const { error: authError } = await supabaseClient.auth.updateUser({ password });
      if (authError) throw authError;
    }

    await Promise.all([loadProfile(), loadProfiles()]);
    renderIdentity();
    renderAll();
    els.accountSuccess.textContent = "Account updated.";
    els.accountSuccess.hidden = false;
    els.profileNewPassword.value = "";
  } catch (error) {
    showError(els.accountError, safeMessage(error));
  } finally {
    setBusy(saveButton, false);
  }
}

async function signOut() {
  await supabaseClient.auth.signOut();
  els.accountDialog.close();
}

function openPlan(src, title) {
  els.planDialogImage.src = src;
  els.planDialogImage.alt = `${title} plan of our new house`;
  els.planDialogTitle.textContent = title;
  els.planDialog.showModal();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.loginForm.addEventListener("submit", login);
$$('.list-tab').forEach((tab) => tab.addEventListener("click", () => switchList(tab.dataset.list)));
els.addItemButton.addEventListener("click", openNewItem);
els.heroAddItem.addEventListener("click", openNewItem);
els.emptyAddButton.addEventListener("click", openNewItem);
els.itemForm.addEventListener("submit", saveItem);
els.adminButton.addEventListener("click", openAdmin);
els.createUserForm.addEventListener("submit", createUser);
els.accountButton.addEventListener("click", openAccount);
els.accountForm.addEventListener("submit", saveAccount);
els.signOutButton.addEventListener("click", signOut);

els.searchInput.addEventListener("input", renderItems);
els.roomFilter.addEventListener("change", renderItems);
els.statusFilter.addEventListener("change", renderItems);
els.priorityFilter.addEventListener("change", renderItems);
els.sortSelect.addEventListener("change", renderItems);

els.showPlansButton.addEventListener("click", () => {
  els.floorPlansSection.hidden = false;
  els.floorPlansSection.scrollIntoView({ behavior: "smooth", block: "start" });
});
els.hidePlansButton.addEventListener("click", () => { els.floorPlansSection.hidden = true; });

$$('[data-room-jump]').forEach((button) => button.addEventListener("click", () => jumpToRoom(button.dataset.roomJump)));
$$('[data-plan-src]').forEach((button) => button.addEventListener("click", () => openPlan(button.dataset.planSrc, button.dataset.planTitle)));
$$('[data-close]').forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close)?.close()));

bootstrap().catch((error) => {
  console.error(error);
  if (isConfigured) alert(`MoveList could not start: ${safeMessage(error)}`);
});
