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
