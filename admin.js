
/* =========================================
   NEXORA ADMIN
   Admin dashboard + deposit address settings
   ========================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  let supabase = null;
  let selectedCustomer = null;
  let busy = false;

  const ASSETS = ["BTC", "ETH", "USDT", "USD"];

  const ADDRESS_FIELDS = {
    BTC: "btcAddress",
    ETH: "ethAddress",
    USDT: "usdtAddress"
  };

  function message(id, text, type = "") {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.className = "message" + (type ? " " + type : "");
  }

  function setBusy(value) {
    busy = value;

    [
      "loginButton",
      "searchButton",
      "fundButton",
      "saveDepositAddressesButton"
    ].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = value;
    });

    if ($("fundButton") && !value && !selectedCustomer) {
      $("fundButton").disabled = true;
    }
  }

  function showLogin() {
    $("loginView")?.classList.remove("hidden");
    $("dashboardView")?.classList.add("hidden");

    selectedCustomer = null;

    if ($("fundButton")) $("fundButton").disabled = true;
  }

  function showDashboard() {
    $("loginView")?.classList.add("hidden");
    $("dashboardView")?.classList.remove("hidden");
  }

  async function getClient() {
    if (window.nexoraSupabase) {
      supabase = window.nexoraSupabase;
      return true;
    }

    message(
      "loginMessage",
      "Supabase client is not configured. Check supabase2.js.",
      "error"
    );

    return false;
  }

  async function verifyAdmin() {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      showLogin();
      return false;
    }

    const { data, error } = await supabase.rpc("nexora_is_admin");

    if (error) throw error;

    if (data !== true) {
      await supabase.auth.signOut();
      showLogin();

      message(
        "loginMessage",
        "This account is not authorized for NEXORA administration.",
        "error"
      );

      return false;
    }

    if ($("adminRole")) {
      $("adminRole").textContent = "Verified admin";
    }

    message("adminStatus", "Admin session verified.", "success");
    showDashboard();

    return true;
  }

  async function login(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    message("loginMessage", "Signing in...");

    try {
      if (!(await getClient())) return;

      const email = $("adminEmail")?.value.trim();
      const password = $("adminPassword")?.value;

      if (!email || !password) {
        message("loginMessage", "Enter your email and password.", "error");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (!(await verifyAdmin())) return;

      const { error: auditError } = await supabase.rpc(
        "nexora_admin_log_login"
      );

      if (auditError) {
        console.error("Admin login audit failed:", auditError.message);
        message(
          "adminStatus",
          "Signed in, but login auditing failed: " + auditError.message,
          "error"
        );
      }

      if ($("adminPassword")) $("adminPassword").value = "";
      message("loginMessage", "");

      await Promise.all([
        loadOverview(),
        loadWithdrawals(),
        loadAudit(),
        loadDepositAddresses()
      ]);
    } catch (error) {
      console.error("Admin login failed:", error);
      message("loginMessage", error.message || "Sign-in failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!supabase) return;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      selectedCustomer = null;

      if ($("customerResult")) {
        $("customerResult").textContent = "No customer selected.";
      }

      if ($("adminPassword")) $("adminPassword").value = "";

      showLogin();
      message("loginMessage", "You have signed out.", "success");
    } catch (error) {
      message("adminStatus", error.message, "error");
    }
  }

  async function searchCustomer(event) {
    event.preventDefault();

    if (!supabase || busy) return;

    const email = $("customerSearch")?.value.trim();
    const resultBox = $("customerResult");

    if (!email || !resultBox) {
      message("fundMessage", "Enter a customer email first.", "error");
      return;
    }

    setBusy(true);
    selectedCustomer = null;
    resultBox.textContent = "Searching...";

    try {
      const { data, error } = await supabase.rpc(
        "nexora_admin_find_customer",
        { p_email: email }
      );

      if (error) throw error;

      if (!data || !data.found || !data.customer) {
        resultBox.textContent =
          data?.message || "No customer found with that email.";
        return;
      }

      const customer = data.customer;

      selectedCustomer = {
        user_id: customer.user_id,
        email: customer.email
      };

      resultBox.replaceChildren();

      const heading = document.createElement("h3");
      heading.textContent = "Customer Details";

      const emailLine = document.createElement("p");
      emailLine.textContent = "Email: " + customer.email;

      const idLine = document.createElement("p");
      idLine.textContent = "User ID: " + customer.user_id;

      const createdLine = document.createElement("p");
      createdLine.textContent =
        "Account created: " +
        (customer.created_at
          ? new Date(customer.created_at).toLocaleString()
          : "Unknown");

      resultBox.append(heading, emailLine, idLine, createdLine);
      message("fundMessage", "");
    } catch (error) {
      console.error("Customer search failed:", error);
      resultBox.textContent =
        "Search failed: " + (error.message || "Unknown error");
    } finally {
      setBusy(false);

      if ($("fundButton")) {
        $("fundButton").disabled = !selectedCustomer;
      }
    }
  }

  async function fundCustomer(event) {
    event.preventDefault();

    if (!supabase || !selectedCustomer || busy) {
      message("fundMessage", "Search for a customer first.", "error");
      return;
    }

    const asset = $("fundAsset")?.value;
    const amount = Number($("fundAmount")?.value);

    if (
      !ASSETS.includes(asset) ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      message("fundMessage", "Enter a valid asset and positive amount.", "error");
      return;
    }

    if (!window.confirm(
      "Add " + amount + " " + asset +
      " in DEMO funds to " + selectedCustomer.email + "?"
    )) return;

    setBusy(true);
    message("fundMessage", "Processing demo funding...");

    try {
      const { data, error } = await supabase.rpc(
  "nexora_admin_fund_account",
  {
    p_customer_email: selectedCustomer.email,
    p_asset: asset,
    p_amount: amount
  }
);

if (error) throw error;

      if (error) throw error;

      message("fundMessage", "Demo funds recorded successfully.", "success");

      if ($("fundAmount")) $("fundAmount").value = "";

      await Promise.all([loadOverview(), loadAudit()]);
    } catch (error) {
      console.error("Demo funding failed:", error);
      message("fundMessage", error.message || "Demo funding failed.", "error");
    } finally {
      setBusy(false);

      if ($("fundButton")) {
        $("fundButton").disabled = !selectedCustomer;
      }
    }
  }

  async function loadOverview() {
    try {
      const { count, error } = await supabase
        .from("nexora_balances")
        .select("user_id", { count: "exact", head: true });

      if (error || count === null) {
        $("customerCount").textContent = "Protected";
      } else {
        $("customerCount").textContent = String(count);
      }
    } catch {
      if ($("customerCount")) $("customerCount").textContent = "Protected";
    }

    try {
      const { count, error } = await supabase
        .from("nexora_withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (error || count === null) {
        $("pendingCount").textContent = "Protected";
      } else {
        $("pendingCount").textContent = String(count);
      }
    } catch {
      if ($("pendingCount")) $("pendingCount").textContent = "Protected";
    }
  }

  // DEPOSIT ADDRESSES

  async function loadDepositAddresses() {
    if (!supabase) return;

    message("depositAddressesMessage", "Loading saved addresses...");

    try {
      const { data, error } = await supabase
        .from("nexora_deposit_addresses")
        .select("asset, wallet_address");

      if (error) throw error;

      for (const asset of ["BTC", "ETH", "USDT"]) {
        const input = $(ADDRESS_FIELDS[asset]);
        if (!input) continue;

        const record = (data || []).find((item) => item.asset === asset);
        input.value = record?.wallet_address || "";
      }

      message("depositAddressesMessage", "Saved addresses loaded.", "success");
    } catch (error) {
      console.error("Loading deposit addresses failed:", error);

      message(
        "depositAddressesMessage",
        "Could not load addresses: " + (error.message || "Unknown error"),
        "error"
      );
    }
  }

  async function saveDepositAddresses(event) {
    event.preventDefault();

    if (!supabase || busy) return;

    const addresses = ["BTC", "ETH", "USDT"].map((asset) => ({
      asset,
      wallet_address: $(ADDRESS_FIELDS[asset])?.value.trim() || ""
    }));

    if (addresses.some((item) => item.wallet_address.length > 300)) {
      message(
        "depositAddressesMessage",
        "Each address must be 300 characters or fewer.",
        "error"
      );
      return;
    }

    if (!window.confirm(
      "Save these BTC, ETH and USDT deposit addresses?"
    )) return;

    setBusy(true);
    message("depositAddressesMessage", "Saving addresses...");

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Your admin session has expired. Sign in again.");

      const rows = addresses.map((item) => ({
        ...item,
        updated_at: new Date().toISOString(),
        updated_by: userId
      }));

      const { error } = await supabase
        .from("nexora_deposit_addresses")
        .upsert(rows, { onConflict: "asset" });

      if (error) throw error;

      message(
        "depositAddressesMessage",
        "Deposit addresses saved successfully.",
        "success"
      );
    } catch (error) {
      console.error("Saving deposit addresses failed:", error);

      message(
        "depositAddressesMessage",
        "Could not save addresses: " + (error.message || "Unknown error"),
        "error"
      );
    } finally {
      setBusy(false);

      if ($("fundButton")) {
        $("fundButton").disabled = !selectedCustomer;
      }
    }
  }

  // WITHDRAWALS — existing database decision function retained

  async function decideWithdrawal(withdrawalId, decision, buttons = []) {
    if (!supabase) {
      alert("Supabase is not connected.");
      return;
    }

    if (!["approved", "rejected"].includes(decision)) {
      alert("Invalid withdrawal decision.");
      return;
    }

    if (!window.confirm(
      "Are you sure you want to " + decision + " this demo withdrawal?"
    )) return;

    buttons.forEach((button) => { button.disabled = true; });

    try {
      const { error } = await supabase.rpc(
        "nexora_admin_decide_withdrawal",
        {
          p_withdrawal_id: withdrawalId,
          p_decision: decision
        }
      );

      if (error) throw error;

      message(
        "withdrawalMessage",
        "Withdrawal " + decision + " successfully.",
        "success"
      );

      await Promise.all([loadOverview(), loadWithdrawals(), loadAudit()]);
    } catch (error) {
      console.error("Withdrawal decision failed:", error);

      message(
        "withdrawalMessage",
        "Could not process withdrawal: " + (error.message || "Unknown error"),
        "error"
      );

      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  async function loadWithdrawals() {
    const body = $("withdrawalRows");
    if (!body || !supabase) return;

    body.replaceChildren();
    message("withdrawalMessage", "Loading withdrawal requests...");

    try {
      const { data, error } = await supabase.rpc(
        "nexora_admin_list_withdrawals"
      );

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      if (rows.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "No withdrawal requests found.";
        row.appendChild(cell);
        body.appendChild(row);
        message("withdrawalMessage", "No withdrawal requests found.");
        return;
      }

      for (const item of rows) {
        const row = document.createElement("tr");

        const values = [
          item.email || item.user_id || "Unknown customer",
          `${item.amount} ${item.asset}`,
          item.destination || "—",
          item.status || "Unknown",
          item.created_at
            ? new Date(item.created_at).toLocaleString()
            : "Unknown"
        ];

        for (const value of values) {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.appendChild(cell);
        }

        const actions = document.createElement("td");

        if (item.status === "pending") {
          const actionButtons = [];

          for (const decision of ["approved", "rejected"]) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = decision === "approved" ? "Approve" : "Reject";

            button.addEventListener("click", () => {
              decideWithdrawal(item.id, decision, actionButtons);
            });

            actionButtons.push(button);
            actions.appendChild(button);
          }
        } else {
          actions.textContent = "No action available";
        }

        row.appendChild(actions);
        body.appendChild(row);
      }

      message(
        "withdrawalMessage",
        rows.length + " withdrawal request(s) loaded.",
        "success"
      );
    } catch (error) {
      console.error("Withdrawal listing failed:", error);

      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "Could not load withdrawals: " + error.message;
      row.appendChild(cell);
      body.replaceChildren(row);

      message(
        "withdrawalMessage",
        "Could not load withdrawal requests.",
        "error"
      );
    }
  }

  // AUDIT LOG

  async function loadAudit() {
    const body = $("auditRows");
    if (!body || !supabase) return;

    body.replaceChildren();

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");
    loadingCell.colSpan = 5;
    loadingCell.textContent = "Loading audit records...";
    loadingRow.appendChild(loadingCell);
    body.appendChild(loadingRow);

    try {
      const { data, error } = await supabase.rpc("nexora_admin_list_audit");
      if (error) throw error;

      const records = Array.isArray(data) ? data : [];
      body.replaceChildren();

      if (records.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "No audit records found.";
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }

      const actionLabels = {
        account_created: "Account created",
        fund_demo_balance: "Demo funds added",
        fund_live_balance: "Demo funds added",
        withdrawal_requested: "Withdrawal requested",
        withdrawal_approved: "Withdrawal approved",
        withdrawal_rejected: "Withdrawal rejected",
        admin_login: "Admin login"
      };

      for (const item of records) {
        const row = document.createElement("tr");
        const details = item.details || {};

        const customerEmail =
          item.customer_email || details.email || "Email unavailable";

        const action =
          actionLabels[item.action] || item.action || "Unknown action";

        const admin =
          item.admin_email || item.admin_user_id || "System";

        const assetAmount = [
          item.asset || "",
          item.amount !== null && item.amount !== undefined
            ? String(item.amount)
            : ""
        ].filter(Boolean).join(" · ") || "—";

        const values = [
          action,
          customerEmail +
            (item.target_user_id ? "\n" + item.target_user_id : ""),
          admin,
          assetAmount,
          item.created_at
            ? new Date(item.created_at).toLocaleString()
            : "Unknown"
        ];

        for (const value of values) {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.appendChild(cell);
        }

        body.appendChild(row);
      }
    } catch (error) {
      console.error("Audit loading failed:", error);

      body.replaceChildren();

      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "Could not load audit records: " + error.message;
      row.appendChild(cell);
      body.appendChild(row);
    }
  }

  function connectEvents() {
    $("loginForm")?.addEventListener("submit", login);
    $("logoutButton")?.addEventListener("click", logout);

    $("customerSearchForm")?.addEventListener(
      "submit",
      searchCustomer
    );

    $("fundForm")?.addEventListener("submit", fundCustomer);

    $("depositAddressesForm")?.addEventListener(
      "submit",
      saveDepositAddresses
    );
  }

  async function start() {
    connectEvents();

    try {
      if (!(await getClient())) {
        showLogin();
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      if (!data.session) {
        showLogin();
      } else {
        const authorized = await verifyAdmin();

        if (authorized) {
          await Promise.all([
            loadOverview(),
            loadWithdrawals(),
            loadAudit(),
            loadDepositAddresses()
          ]);
        }
      }
    } catch (error) {
      console.error("Admin initialization failed:", error);

      message(
        "loginMessage",
        error.message || "Could not initialize the admin panel.",
        "error"
      );

      showLogin();
    }

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        showLogin();
      }
    });
  }

  start();
})();
