// الاتصال بقاعدة البيانات
const db = window.supabase.createClient(
  "https://trlsbndokjyxjxoyhzwk.supabase.co",
  "sb_publishable_UDbvmhMTZ3hCXxvtIPRS4A_9V-RykBe"
);

let employees = [], assets = [], maintenance = [], pendingAssetId = null, myRole = "staff", myEmployeeId = null;
const $ = (id) => document.getElementById(id);

function toast(msg, isError = false) {
  const box = document.createElement("div");
  box.className = "toast-box" + (isError ? " error" : "");
  box.textContent = msg;
  $("toast").appendChild(box);
  setTimeout(() => box.remove(), 2800);
}

function esc(t) {
  const d = document.createElement("div");
  d.textContent = t ?? "";
  return d.innerHTML;
}

// ==================== تسجيل الدخول والخروج ====================
$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-pass").value
  });
  if (error) return toast("فشل تسجيل الدخول: بيانات غير صحيحة", true);
};

$("logout-btn").onclick = () => db.auth.signOut();

db.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    const { data } = await db.from("staff_roles").select("role, employee_id").eq("email", session.user.email).single();
    myRole = data?.role || "staff";
    myEmployeeId = data?.employee_id || null;
    const isAdmin = myRole === "admin";
    $("nav-employees").style.display = isAdmin ? "" : "none";
    $("asset-form").style.display = isAdmin ? "" : "none";
    $("login-screen").classList.add("hidden");
    $("app-screen").classList.remove("hidden");
    loadData();
  } else {
    $("app-screen").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
  }
});

// ==================== التنقل بين التبويبات ====================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll("[id^='tab-']").forEach((s) => s.classList.add("hidden"));
    $(`tab-${btn.dataset.tab}`).classList.remove("hidden");
  };
});

// ==================== جلب كل البيانات ====================
async function loadData() {
  const [e, a, m] = await Promise.all([
    db.from("employees").select("*").order("created_at", { ascending: false }),
    db.from("assets").select("*, assigned_employee:assigned_to(id, full_name)").order("created_at", { ascending: false }),
    db.from("maintenance_requests").select("*, asset:asset_id(device_name, serial_number)").order("created_at", { ascending: false })
  ]);
  if (e.error || a.error || m.error) return toast("تعذر جلب البيانات", true);
  employees = e.data; assets = a.data; maintenance = m.data;
  renderAll();
}

function renderAll() {
  $("s-total").textContent = assets.length;
  $("s-available").textContent = assets.filter(a => a.status === "available").length;
  $("s-assigned").textContent = assets.filter(a => a.status === "assigned").length;
  $("s-maintenance").textContent = assets.filter(a => a.status === "maintenance").length;
  $("s-employees").textContent = employees.length;
  renderAssets();
  renderEmployees();
  renderMaintenance();
  renderMyAssets();
}

// الرئيسية: الموظف يرى عُهده فقط، والأدمن يرى كل العُهد.
function renderMyAssets() {
  const isAdmin = myRole === "admin";
  const search = $("my-assets-search").value.trim().toLowerCase();
  let list = isAdmin ? assets : assets.filter(a => a.assigned_to === myEmployeeId);

  if (search) list = list.filter(a =>
    `${a.device_name} ${a.assigned_employee?.full_name || ""}`.toLowerCase().includes(search)
  );

  $("my-assets-title").textContent = isAdmin ? "جميع العُهد" : "عُهدي الحالية";
  $("my-assets-note").textContent = isAdmin ? "جميع الأجهزة المسجلة في النظام" : "الأجهزة المسندة إلى حسابك";
  $("my-assets-employee-head").style.display = isAdmin ? "" : "none";

  if (!isAdmin && !myEmployeeId) {
    $("my-assets-body").innerHTML = `<tr><td colspan="3" class="text-center text-slate-400 py-6">لم يتم ربط حسابك بسجل موظف بعد</td></tr>`;
    return;
  }

  const badge = {
    available: "badge-available",
    assigned: "badge-assigned",
    maintenance: "badge-maintenance"
  };
  const label = { available: "متاحة", assigned: "مصروفة", maintenance: "قيد الصيانة" };

  $("my-assets-body").innerHTML = list.map(a => `<tr>
    ${isAdmin ? `<td class="py-2">${esc(a.assigned_employee?.full_name || "—")}</td>` : ""}
    <td class="font-bold">${esc(a.device_name)}</td>
    <td class="font-mono text-xs">${esc(a.serial_number)}</td>
    <td><span class="badge ${badge[a.status]}">${label[a.status]}</span></td>
  </tr>`).join("") || `<tr><td colspan="${isAdmin ? 4 : 3}" class="text-center text-slate-400 py-6">لا توجد عُهد مطابقة</td></tr>`;
}

$("my-assets-search").oninput = renderMyAssets;

function renderAssets() {
  const statusMap = {
    available: [`<span class="badge badge-available">متاحة</span>`, (a) => myRole === "admin" ? `<button class="link-btn link-green" onclick="openAssign('${a.id}')">صرف</button>` : `<span class="text-xs text-slate-400">—</span>`],
    assigned: [`<span class="badge badge-assigned">مصروفة</span>`, (a) => myRole === "admin" ? `<button class="link-btn link-red" onclick="returnAsset('${a.id}')">استرجاع</button>` : `<span class="text-xs text-slate-400">—</span>`],
    maintenance: [`<span class="badge badge-maintenance">قيد الصيانة</span>`, () => `<span class="text-xs text-slate-400">بانتظار الإصلاح</span>`]
  };
  $("assets-body").innerHTML = assets.map((a) => {
    const [badge, actionFn] = statusMap[a.status];
    return `<tr>
      <td class="py-2 font-bold">${esc(a.device_name)}</td>
      <td>${esc(a.brand)}</td>
      <td class="font-mono text-xs">${esc(a.serial_number)}</td>
      <td>${esc(a.category)}</td>
      <td>${badge}</td>
      <td>${a.assigned_employee ? esc(a.assigned_employee.full_name) : "—"}</td>
      <td>${actionFn(a)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="text-center text-slate-400 py-6">لا توجد عُهد بعد</td></tr>`;
}

function renderEmployees() {
  $("emp-grid").innerHTML = employees.map((e) => `
    <div class="card">
      <p class="font-bold">${esc(e.full_name)}</p>
      <p class="text-xs text-slate-500 mb-2">${esc(e.job_title)}</p>
      <p class="text-xs text-slate-400">رقم وظيفي: ${esc(e.employee_number)}</p>
    </div>`).join("") || `<p class="text-slate-400 col-span-full text-center py-6">لا يوجد موظفين بعد</p>`;
}

function renderMaintenance() {
  $("maint-body").innerHTML = maintenance.map((m) => {
    const done = m.status === "completed";
    const badge = done ? `<span class="badge badge-available">تم الإصلاح</span>` : `<span class="badge badge-maintenance">قيد الصيانة</span>`;
    const action = done ? `<span class="text-xs text-slate-400">—</span>` : (myRole === "admin" ? `<button class="link-btn link-green" onclick="markFixed('${m.id}','${m.asset_id}')">تم الإصلاح</button>` : `<span class="text-xs text-slate-400">بانتظار الأدمن</span>`);
    return `<tr>
      <td class="py-2 font-bold">${esc(m.asset?.device_name)}</td>
      <td class="font-mono text-xs">${esc(m.asset?.serial_number)}</td>
      <td>${esc(m.issue_description)}</td>
      <td>${badge}</td>
      <td class="text-xs text-slate-500">${new Date(m.created_at).toLocaleDateString("ar-SA")}</td>
      <td>${action}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="text-center text-slate-400 py-6">لا توجد طلبات إصلاح</td></tr>`;

  $("m-asset").innerHTML = assets.filter(a => a.status !== "maintenance")
    .map(a => `<option value="${a.id}">${esc(a.device_name)} — ${esc(a.serial_number)}</option>`)
    .join("") || `<option value="">لا توجد عُهد متاحة</option>`;
}

// ==================== إضافة عُهدة ====================
$("asset-form").onsubmit = async (e) => {
  e.preventDefault();
  if (myRole !== "admin") return toast("هذا الإجراء متاح للأدمن فقط", true);
  const { error } = await db.from("assets").insert([{
    device_name: $("a-name").value.trim(),
    brand: $("a-brand").value.trim(),
    serial_number: $("a-serial").value.trim(),
    category: $("a-cat").value,
    status: "available"
  }]);
  if (error) return toast("فشل إضافة العُهدة: " + error.message, true);
  toast("تمت إضافة العُهدة");
  e.target.reset();
  loadData();
};

// ==================== إضافة موظف ====================
$("emp-form").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await db.from("employees").insert([{
    full_name: $("e-name").value.trim(),
    job_title: $("e-job").value.trim(),
    employee_number: $("e-num").value.trim()
  }]);
  if (error) return toast("فشل إضافة الموظف: " + error.message, true);
  toast("تمت إضافة الموظف");
  e.target.reset();
  loadData();
};

// ==================== صرف العُهدة ====================
window.openAssign = (id) => {
  if (myRole !== "admin") return toast("هذا الإجراء متاح للأدمن فقط", true);
  if (!employees.length) return toast("أضف موظف أولاً", true);
  pendingAssetId = id;
  const a = assets.find(x => x.id === id);
  $("modal-asset").textContent = a.device_name + " — " + a.serial_number;
  $("modal-emp").innerHTML = employees.map(e => `<option value="${e.id}">${esc(e.full_name)}</option>`).join("");
  $("modal").classList.remove("hidden");
  $("modal").classList.add("flex");
};

$("modal-cancel").onclick = () => {
  $("modal").classList.add("hidden");
  $("modal").classList.remove("flex");
};

$("modal-confirm").onclick = async () => {
  const { error } = await db.from("assets")
    .update({ status: "assigned", assigned_to: $("modal-emp").value })
    .eq("id", pendingAssetId);
  if (error) return toast("فشل الصرف: " + error.message, true);
  toast("تم صرف العُهدة");
  $("modal").classList.add("hidden");
  $("modal").classList.remove("flex");
  loadData();
};

// ==================== استرجاع العُهدة ====================
window.returnAsset = async (id) => {
  if (myRole !== "admin") return toast("هذا الإجراء متاح للأدمن فقط", true);
  if (!confirm("تأكيد استرجاع العُهدة؟")) return;
  const { error } = await db.from("assets").update({ status: "available", assigned_to: null }).eq("id", id);
  if (error) return toast("فشل الاسترجاع: " + error.message, true);
  toast("تم استرجاع العُهدة");
  loadData();
};

// ==================== تقديم طلب إصلاح ====================
$("maint-form").onsubmit = async (e) => {
  e.preventDefault();
  const assetId = $("m-asset").value;
  if (!assetId) return toast("لا توجد عُهدة لاختيارها", true);
  const r1 = await db.from("maintenance_requests").insert([{ asset_id: assetId, issue_description: $("m-desc").value.trim() }]);
  if (r1.error) return toast("فشل تقديم الطلب: " + r1.error.message, true);
  const r2 = await db.from("assets").update({ status: "maintenance" }).eq("id", assetId);
  if (r2.error) return toast("فشل تحديث الجهاز: " + r2.error.message, true);
  toast("تم تقديم طلب الإصلاح");
  e.target.reset();
  loadData();
};

// ==================== تأكيد الإصلاح ====================
window.markFixed = async (reqId, assetId) => {
  if (myRole !== "admin") return toast("هذا الإجراء متاح للأدمن فقط", true);
  const r1 = await db.from("maintenance_requests").update({ status: "completed", resolved_at: new Date().toISOString() }).eq("id", reqId);
  if (r1.error) return toast("فشل تحديث الطلب: " + r1.error.message, true);
  const r2 = await db.from("assets").update({ status: "available" }).eq("id", assetId);
  if (r2.error) return toast("فشل تحديث الجهاز: " + r2.error.message, true);
  toast("تم إصلاح العُهدة");
  loadData();
};
