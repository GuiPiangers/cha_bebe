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

// Categoria virtual para itens adicionados pelos convidados.
export const OTHER_CATEGORY = { id: "outros", name: "Outros", icon: "🎁" };

// Lista plana de itens do catálogo, cada um com o id da sua categoria.
export function flattenItems(catalog) {
  return catalog.categories.flatMap((category) =>
    category.items.map((item) => ({ ...item, categoryId: category.id }))
  );
}

// Chave de agregação: itens do catálogo usam o id; itens extras cujo nome
// coincide com um item do catálogo somam nele; o resto agrupa pelo nome.
function resolveKey(entry, catalogByName) {
  if (entry.itemId) return entry.itemId;
  const match = catalogByName.get(normalizeName(entry.name));
  return match ? match.id : `custom:${normalizeName(entry.name)}`;
}

// Retorna [{ key, name, quantity, desiredQuantity | null, unit, categoryId }]
// ordenado por nome. Itens fora do catálogo ficam na categoria "outros".
export function aggregateContributions(catalog, contributions) {
  const items = flattenItems(catalog);
  const catalogById = new Map(items.map((item) => [item.id, item]));
  const catalogByName = new Map(
    items.map((item) => [normalizeName(item.name), item])
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
        unit: catalogItem?.unit ?? null,
        categoryId: catalogItem ? catalogItem.categoryId : OTHER_CATEGORY.id,
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
  return flattenItems(catalog)
    .map((item) => {
      const given = givenByKey.get(item.id) ?? 0;
      return { ...item, given, remaining: item.desiredQuantity - given };
    })
    .filter((item) => item.remaining > 0);
}

// Agrupa itens (que tenham categoryId) seguindo a ordem das categorias do
// catálogo, com "Outros" por último. Categorias sem itens são omitidas.
// Retorna [{ category, items }].
export function groupByCategory(catalog, items) {
  const categories = [...catalog.categories, OTHER_CATEGORY];
  return categories
    .map((category) => ({
      category,
      items: items.filter((item) => item.categoryId === category.id),
    }))
    .filter((group) => group.items.length > 0);
}
