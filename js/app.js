// Camada de interface: renderiza, valida e envia. Não conhece o storage
// por dentro nem as regras de agregação — usa storage.js e gifts.js.
import { getCatalog, getContributions, addContribution } from "./storage.js";
import {
  aggregateContributions,
  getAvailableSuggestions,
  groupByCategory,
} from "./gifts.js";

const $ = (selector) => document.querySelector(selector);

const els = {
  title: $("#form-title"),
  description: $("#form-description"),
  loadError: $("#load-error"),
  form: $("#gift-form"),
  guestName: $("#guest-name"),
  attendingInputs: document.querySelectorAll("input[name=attending]"),
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
    category: $("#category-template"),
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

// "3 pacotes" / "1 pacote" / "3". As unidades do catálogo estão no plural.
function formatQuantity(quantity, unit) {
  if (!unit) return String(quantity);
  return `${quantity} ${quantity === 1 ? unit.replace(/s$/, "") : unit}`;
}

// Título da categoria + seus itens, renderizados por renderItem.
function renderCategory({ category, items }, renderItem, { showNote = false } = {}) {
  const li = cloneTemplate(els.templates.category);
  li.querySelector(".category__icon").textContent = category.icon ?? "";
  li.querySelector(".category__name").textContent = category.name;
  if (showNote && category.note) {
    const note = li.querySelector(".category__note");
    note.textContent = category.note;
    note.hidden = false;
  }
  li.querySelector(".category__items").replaceChildren(...items.map(renderItem));
  return li;
}

function renderSuggestionItem(item) {
  const li = cloneTemplate(els.templates.suggestion);
  li.dataset.itemId = item.id;
  li.querySelector(".option__name").textContent = item.name;
  if (item.given > 0) {
    li.querySelector(".option__given").textContent =
      `já escolhidos: ${formatQuantity(item.given, item.unit)}`;
  }

  const check = li.querySelector(".option__check");
  const qtyLabel = li.querySelector(".option__qty");
  check.addEventListener("change", () => {
    qtyLabel.hidden = !check.checked;
    if (check.checked) qtyLabel.querySelector("input").focus();
  });
  return li;
}

function renderGivenItem(entry) {
  const li = cloneTemplate(els.templates.given);
  li.querySelector(".given__name").textContent = entry.name;
  li.querySelector(".given__qty").textContent =
    `Qtd: ${formatQuantity(entry.quantity, entry.unit)}`;
  return li;
}

function renderSuggestions(suggestions) {
  els.suggestions.replaceChildren(
    ...groupByCategory(catalog, suggestions).map((group) =>
      renderCategory(group, renderSuggestionItem, { showNote: true })
    )
  );
  els.suggestionsEmpty.hidden = suggestions.length > 0;
}

function renderGivenList(aggregated) {
  els.givenList.replaceChildren(
    ...groupByCategory(catalog, aggregated).map((group) =>
      renderCategory(group, renderGivenItem)
    )
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
  let invalidQuantity = false;
  const items = [];

  const guestName = els.guestName.value.trim();
  if (!guestName) {
    showError("guest-name", "Esta pergunta é obrigatória");
    els.guestName.classList.add("is-invalid");
    valid = false;
  }

  const attendingChoice = [...els.attendingInputs].find((input) => input.checked);
  if (!attendingChoice) {
    showError("attending", "Esta pergunta é obrigatória");
    valid = false;
  }
  const attending = attendingChoice?.value === "true";

  for (const li of els.suggestions.querySelectorAll(".option")) {
    if (!li.querySelector(".option__check").checked) continue;
    const qtyInput = li.querySelector(".text-input--qty");
    const quantity = parseQuantity(qtyInput);
    if (quantity === null) {
      qtyInput.classList.add("is-invalid");
      valid = false;
      invalidQuantity = true;
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
      invalidQuantity = true;
      continue;
    }
    items.push({ itemId: null, name, quantity });
  }

  if (!valid) {
    showError(
      "form",
      invalidQuantity
        ? "Revise os campos destacados. A quantidade deve ser um número inteiro maior que zero."
        : "Revise os campos destacados."
    );
    return null;
  }
  return { guestName, attending, items };
}

async function handleSubmit(event) {
  event.preventDefault();
  const contribution = collectForm();
  if (!contribution) return;

  els.submit.disabled = true;
  try {
    await addContribution(contribution);
  } catch (error) {
    console.error(error);
    showError("form", "Não foi possível enviar. Tente novamente.");
    return;
  } finally {
    els.submit.disabled = false;
  }

  els.form.reset();
  els.customItems.replaceChildren();
  els.form.hidden = true;
  els.success.hidden = false;
  els.success.scrollIntoView({ behavior: "smooth", block: "start" });

  // O envio já foi salvo: se a atualização da lista falhar, não exibimos erro
  // de envio, senão o convidado reenviaria e duplicaria a reserva.
  try {
    await refresh();
  } catch (error) {
    console.error(error);
  }
}

function startNewResponse() {
  els.success.hidden = true;
  els.form.hidden = false;
  clearErrors();
  els.guestName.focus();
}

// ---------- Inicialização ----------

function showLoadError(error) {
  console.error(error);
  els.form.hidden = true;
  els.loadError.textContent =
    "Não foi possível carregar a lista de presentes. Recarregue a página.";
  els.loadError.hidden = false;
}

async function init() {
  try {
    catalog = await getCatalog();
  } catch (error) {
    showLoadError(error);
    return;
  }

  renderHeader();
  try {
    await refresh();
  } catch (error) {
    showLoadError(error);
    return;
  }

  els.addCustom.addEventListener("click", addCustomRow);
  els.form.addEventListener("submit", handleSubmit);
  els.newResponse.addEventListener("click", startNewResponse);
}

init();
