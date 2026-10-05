// Camada de dados: única parte do app que sabe ONDE os dados ficam.
// Para trocar de banco (Google Sheets, Vercel KV, etc.), reimplemente
// apenas as funções exportadas mantendo as mesmas assinaturas assíncronas.
//
// Contribution = {
//   id: string,
//   guestName: string,
//   createdAt: string (ISO),
//   items: Array<{ itemId: string | null, name: string, quantity: number }>
// }
// itemId é null para itens adicionados pelo convidado (fora do catálogo).

const CATALOG_URL = "data/gifts.json";
const STORAGE_KEY = "cha-bebe:contributions";

export async function getCatalog() {
  const response = await fetch(CATALOG_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao carregar o catálogo (${response.status})`);
  }
  return response.json();
}

export async function getContributions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addContribution(contribution) {
  const contributions = await getContributions();
  const saved = {
    ...contribution,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  contributions.push(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contributions));
  return saved;
}
