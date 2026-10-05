// Regras de negócio puras: não acessam DOM nem storage.

// "  Fralda  P " e "fralda p" e "FRÁLDA P" viram a mesma chave.
export function normalizeName(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Chave de agregação: itens do catálogo usam o id; itens extras cujo nome
// coincide com um item do catálogo somam nele; o resto agrupa pelo nome.
function resolveKey(entry, catalogByName) {
  if (entry.itemId) return entry.itemId;
  const match = catalogByName.get(normalizeName(entry.name));
  return match ? match.id : `custom:${normalizeName(entry.name)}`;
}

// Retorna [{ key, name, quantity, desiredQuantity | null }] ordenado por nome.
export function aggregateContributions(catalog, contributions) {
  const catalogById = new Map(catalog.items.map((item) => [item.id, item]));
  const catalogByName = new Map(
    catalog.items.map((item) => [normalizeName(item.name), item])
  );
  const totals = new Map();

  for (const contribution of contributions) {
    for (const entry of contribution.items ?? []) {
      const quantity = Number(entry.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const key = resolveKey(entry, catalogByName);
      const catalogItem = catalogById.get(key);
      const current = totals.get(key) ?? {
        key,
        name: catalogItem ? catalogItem.name : entry.name.trim(),
        quantity: 0,
        desiredQuantity: catalogItem ? catalogItem.desiredQuantity : null,
      };
      current.quantity += quantity;
      totals.set(key, current);
    }
  }

  return [...totals.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
}

// Itens do catálogo que ainda não atingiram a quantidade desejada,
// na ordem do JSON, com quanto já foi dado e quanto falta.
export function getAvailableSuggestions(catalog, aggregated) {
  const givenByKey = new Map(aggregated.map((a) => [a.key, a.quantity]));
  return catalog.items
    .map((item) => {
      const given = givenByKey.get(item.id) ?? 0;
      return { ...item, given, remaining: item.desiredQuantity - given };
    })
    .filter((item) => item.remaining > 0);
}
