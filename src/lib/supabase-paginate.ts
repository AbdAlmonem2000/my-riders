// PostgREST applies a default max-rows cap to any request with no explicit
// `.range()` — even one with no `.limit()` in the code at all — so a plain
// `.select()` against a table that can realistically grow past that cap
// (many riders × many days of reports, a big roster, lots of documents)
// silently returns only the first page. The rest just vanishes: no error,
// no warning, nothing to notice it by. This fetches every row instead,
// paging through with a stable `.order("id")` cursor so pages never
// overlap or skip a row.
export async function fetchAllRows<T>(
  queryPage: (range: {
    from: number;
    to: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage({ from, to: from + pageSize - 1 });
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}
