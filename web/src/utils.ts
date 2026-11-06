export * from "../../shared/utils";
export function forecastMethod(name: string) {
  return (
    (
      {
        naive: "Last week",
        recent4: "Four-week mean",
        croston: "Croston",
        seasonal: "Same week last year",
        ml: "Gradient boosting",
      } as Record<string, string>
    )[name] || name
  );
}
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const escape = (x: unknown) =>
    '"' +
    String(x ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.map(escape).join(","),
          ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
        ].join("\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
