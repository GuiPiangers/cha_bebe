// API do Chá de bebê da Sophie — Google Apps Script publicado como Web App.
// Cole este arquivo em Extensões > Apps Script da planilha.
//
// Abas esperadas (a 1ª linha é o cabeçalho; a ordem das colunas não importa):
//   Convidados: id, nome, presenca, data
//   Reservados: id, nome, presente_id, presente_nome, quantidade, data
// O "id" de Reservados é o id do envio, o mesmo da linha em Convidados.
//
// GET  -> { ok: true, data: Contribution[] }  (mesmo formato de js/storage.js)
// POST -> { ok: true, data: Contribution }
// Erros sempre retornam HTTP 200 com { ok: false, error }.

const SHEETS = { guests: "Convidados", reservations: "Reservados" };

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error(`Aba "${name}" não encontrada`);
  return sheet;
}

// Lê a aba como lista de objetos, usando os nomes do cabeçalho como chaves.
function readRows_(sheet) {
  const [header, ...rows] = sheet.getDataRange().getValues();
  const keys = header.map((key) => String(key).trim());
  return rows
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => {
      const obj = {};
      keys.forEach((key, i) => (obj[key] = row[i]));
      return obj;
    });
}

// A planilha converte datas gravadas em objetos Date; devolvemos sempre ISO.
function toIso_(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet() {
  try {
    return jsonResponse_({ ok: true, data: listContributions_() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function listContributions_() {
  const itemsById = {};
  for (const row of readRows_(getSheet_(SHEETS.reservations))) {
    const id = String(row.id);
    if (!itemsById[id]) itemsById[id] = [];
    itemsById[id].push({
      itemId: row.presente_id ? String(row.presente_id) : null,
      name: String(row.presente_nome),
      quantity: Number(row.quantidade) || 0,
    });
  }

  return readRows_(getSheet_(SHEETS.guests)).map((row) => ({
    id: String(row.id),
    guestName: String(row.nome),
    attending: String(row.presenca).trim() === "Sim",
    createdAt: toIso_(row.data),
    items: itemsById[String(row.id)] || [],
  }));
}

// Limites contra abuso: o endpoint é público para quem tiver a URL.
const MAX_TEXT_LENGTH = 100;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 999;

// O front deve enviar Content-Type: text/plain. O Web App não responde ao
// preflight de CORS que application/json dispararia.
function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error("Corpo da requisição não é um JSON válido");
    }
    return jsonResponse_({ ok: true, data: saveContribution_(validate_(body)) });
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message });
  }
}

function requireText_(value, field) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`Campo "${field}" é obrigatório`);
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Campo "${field}" excede ${MAX_TEXT_LENGTH} caracteres`);
  }
  return text;
}

function validate_(body) {
  if (!body || typeof body !== "object") throw new Error("Contribuição inválida");
  if (typeof body.attending !== "boolean") {
    throw new Error('Campo "attending" deve ser true ou false');
  }
  if (!Array.isArray(body.items)) throw new Error('Campo "items" deve ser uma lista');
  if (body.items.length > MAX_ITEMS) throw new Error(`Máximo de ${MAX_ITEMS} itens`);

  const items = body.items.map((item, i) => {
    const quantity = Number(item && item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error(`Item ${i + 1}: quantidade deve ser um inteiro entre 1 e ${MAX_QUANTITY}`);
    }
    return {
      itemId: item.itemId == null ? null : requireText_(item.itemId, `items[${i}].itemId`),
      name: requireText_(item.name, `items[${i}].name`),
      quantity,
    };
  });

  return {
    guestName: requireText_(body.guestName, "guestName"),
    attending: body.attending,
    items,
  };
}

// Impede que textos como "=IMPORTXML(...)" sejam interpretados como fórmula.
function asPlainText_(value) {
  return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
}

// Acrescenta objetos ao fim da aba, posicionando cada valor pela coluna do cabeçalho.
function appendObjects_(sheet, objects) {
  if (objects.length === 0) return;
  const header = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((key) => String(key).trim());
  for (const key of Object.keys(objects[0])) {
    if (!header.includes(key)) {
      throw new Error(`Coluna "${key}" não encontrada na aba "${sheet.getName()}"`);
    }
  }
  const rows = objects.map((obj) =>
    header.map((key) => (key in obj ? asPlainText_(obj[key]) : ""))
  );
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
}

function saveContribution_(contribution) {
  const id = Utilities.getUuid();
  const now = new Date();

  // Sem o lock, dois envios simultâneos leriam o mesmo getLastRow() e um
  // sobrescreveria as linhas do outro.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendObjects_(getSheet_(SHEETS.guests), [
      {
        id,
        nome: contribution.guestName,
        presenca: contribution.attending ? "Sim" : "Não",
        data: now,
      },
    ]);
    appendObjects_(
      getSheet_(SHEETS.reservations),
      contribution.items.map((item) => ({
        id,
        nome: contribution.guestName,
        presente_id: item.itemId || "",
        presente_nome: item.name,
        quantidade: item.quantity,
        data: now,
      }))
    );
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  return { ...contribution, id, createdAt: now.toISOString() };
}
