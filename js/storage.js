// Camada de dados: única parte do app que sabe ONDE os dados ficam.
// Para trocar de banco (Google Sheets, Vercel KV, etc.), reimplemente
// apenas as funções exportadas mantendo as mesmas assinaturas assíncronas.
//
// Contribution = {
//   id: string,
//   guestName: string,
//   attending: boolean,
//   createdAt: string (ISO),
//   items: Array<{ itemId: string | null, name: string, quantity: number }>
// }
// itemId é null para itens adicionados pelo convidado (fora do catálogo).

const CATALOG_URL = "data/gifts.json";
// Web App do Google Apps Script (código em apps-script/Code.gs).
// Ao publicar uma nova versão pelo "Gerenciar implantações", a URL não muda.
const API_URL =
  "https://script.google.com/macros/s/AKfycbwGZ2J9o-6cO91qdKqeKSFN9MxDtaK-0Y9mpxVIVOpDnIWvnyC8FNpFlbJefblYLgMn/exec";

// A API sempre responde HTTP 200 com { ok, data } ou { ok: false, error }.
async function request(options) {
  const response = await fetch(API_URL, options);
  if (!response.ok) {
    throw new Error(`Falha na API (${response.status})`);
  }
  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.error || "Erro desconhecido na API");
  }
  return body.data;
}

export async function getCatalog() {
  const response = await fetch(CATALOG_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar o catálogo (${response.status})`);
  }
  return response.json();
}

export async function getContributions() {
  const contributions = await request({ cache: "no-store" });
  return Array.isArray(contributions) ? contributions : [];
}

// text/plain evita o preflight de CORS, que o Apps Script não responde.
// O id e a data são gerados pelo servidor.
export async function addContribution(contribution) {
  return request({
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(contribution),
  });
}
