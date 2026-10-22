/**
 * Renders structured data. Server components only: the JSON is produced on the server and never
 * from user input.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // `JSON.stringify` cannot emit `</script>` from these values, and nothing here is user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
