// Camada de interface: renderiza, valida e envia. Não conhece o storage
// por dentro nem as regras de agregação — usa storage.js e gifts.js.
import { getCatalog, getContributions, addContribution } from "./storage.js";
import { aggregateContributions, getAvailableSuggestions } from "./gifts.js";

const $ = (selector) => document.querySelector(selector);

const els = {
  title: $("#form-title"),
  description: $("#form-description"),
  loadError: $("#load-error"),
  form: $("#gift-form"),
  guestName: $("#guest-name"),
  suggestions: $("#suggestions"),
  suggestionsEmpty: $("#suggestions-empty"),
  customItems: $("#custom-items"),
  addCustom: $("#add-custom"),
  submit: $("#gift-form button[type=submit]"),
  success: $("#success"),
  newResponse: $("#new-response"),
  givenList: $("#given-list"),
  givenEmpty: $("#given-empty"),
  templates: {
    suggestion: $("#suggestion-template"),
    custom: $("#custom-template"),
    given: $("#given-template"),
  },
};

let catalog = null;

function cloneTemplate(template) {
  return template.content.firstElementChild.cloneNode(true);
}

// ---------- Renderização ----------

function renderHeader() {
  document.title = catalog.title;
  els.title.textContent = catalog.title;
  els.description.textContent = catalog.description ?? "";
}

function renderSuggestions(suggestions) {
  els.suggestions.replaceChildren(
    ...suggestions.map((item) => {
      const li = cloneTemplate(els.templates.suggestion);
      li.dataset.itemId = item.id;
      li.querySelector(".option__name").textContent = item.name;
      li.querySelector(".option__remaining").textContent =
        `faltam ${item.remaining} de ${item.desiredQuantity}`;

      const check = li.querySelector(".option__check");
      const qtyLabel = li.querySelector(".option__qty");
      check.addEventListener("change", () => {
        qtyLabel.hidden = !check.checked;
        if (check.checked) qtyLabel.querySelector("input").focus();
      });
      return li;
    })
  );
  els.suggestionsEmpty.hidden = suggestions.length > 0;
}

function renderGivenList(aggregated) {
  els.givenList.replaceChildren(
    ...aggregated.map((entry) => {
      const li = cloneTemplate(els.templates.given);
      li.querySelector(".given__name").textContent = entry.name;
      const qty = li.querySelector(".given__qty");
      if (entry.desiredQuantity === null) {
        qty.textContent = `Qtd: ${entry.quantity}`;
      } else {
        qty.textContent = `Qtd: ${entry.quantity} de ${entry.desiredQuantity}`;
        qty.classList.toggle("is-complete", entry.quantity >= entry.desiredQuantity);
      }
      return li;
    })
  );
  els.givenEmpty.hidden = aggregated.length > 0;
}

async function refresh() {
  const contributions = await getContributions();
  const aggregated = aggregateContributions(catalog, contributions);
  renderSuggestions(getAvailableSuggestions(catalog, aggregated));
  renderGivenList(aggregated);
}

function addCustomRow() {
  const li = cloneTemplate(els.templates.custom);
  li.querySelector(".custom-row__remove").addEventListener("click", () => li.remove());
  els.customItems.append(li);
  li.querySelector(".custom-row__name").focus();
}

// ---------- Validação e envio ----------

function parseQuantity(input) {
  const value = Number(input.value);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function showError(key, message) {
  const el = document.querySelector(`[data-error-for="${key}"]`);
  el.textContent = message;
  el.hidden = false;
}

function clearErrors() {
  document.querySelectorAll("[data-error-for]").forEach((el) => (el.hidden = true));
  document.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}

// Lê o formulário e retorna { contribution } ou null se houver erro (já exibido).
function collectForm() {
  clearErrors();
  let valid = true;
  const items = [];

  const guestName = els.guestName.value.trim();
  if (!guestName) {
    showError("guest-name", "Esta pergunta é obrigatória");
    els.guestName.classList.add("is-invalid");
    valid = false;
  }

  for (const li of els.suggestions.querySelectorAll(".option")) {
    if (!li.querySelector(".option__check").checked) continue;
    const qtyInput = li.querySelector(".text-input--qty");
    const quantity = parseQuantity(qtyInput);
    if (quantity === null) {
      qtyInput.classList.add("is-invalid");
      valid = false;
      continue;
    }
    items.push({
      itemId: li.dataset.itemId,
      name: li.querySelector(".option__name").textContent,
      quantity,
    });
  }

  for (const li of els.customItems.querySelectorAll(".custom-row")) {
    const name = li.querySelector(".custom-row__name").value.trim();
    if (!name) continue; // linha deixada em branco é ignorada
    const qtyInput = li.querySelector(".custom-row__qty");
    const quantity = parseQuantity(qtyInput);
    if (quantity === null) {
      qtyInput.classList.add("is-invalid");
      valid = false;
      continue;
    }
    items.push({ itemId: null, name, quantity });
  }

  if (!valid) {
    showError("form", "Revise os campos destacados. A quantidade deve ser um número inteiro maior que zero.");
    return null;
  }
  if (items.length === 0) {
    showError("form", "Escolha pelo menos um presente da lista ou adicione outro item.");
    return null;
  }
  return { guestName, items };
}

async function handleSubmit(event) {
  event.preventDefault();
  const contribution = collectForm();
  if (!contribution) return;

  els.submit.disabled = true;
  try {
    await addContribution(contribution);
    els.form.reset();
    els.customItems.replaceChildren();
    els.form.hidden = true;
    els.success.hidden = false;
    await refresh();
    els.success.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    showError("form", "Não foi possível enviar. Tente novamente.");
  } finally {
    els.submit.disabled = false;
  }
}

function startNewResponse() {
  els.success.hidden = true;
  els.form.hidden = false;
  clearErrors();
  els.guestName.focus();
}

// ---------- Inicialização ----------

async function init() {
  try {
    catalog = await getCatalog();
  } catch (error) {
    console.error(error);
    els.form.hidden = true;
    els.loadError.textContent =
      "Não foi possível carregar a lista de presentes. Recarregue a página.";
    els.loadError.hidden = false;
    return;
  }

  renderHeader();
  await refresh();

  els.addCustom.addEventListener("click", addCustomRow);
  els.form.addEventListener("submit", handleSubmit);
  els.newResponse.addEventListener("click", startNewResponse);
}

init();
