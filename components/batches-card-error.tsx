/**
 * The body shown when a batches card can't load its data — a missing session id
 * or a failed `mf_service` call (see `loadUserBatches` in `@/lib/user-batches`).
 * Shared by the home `BatchesCard` and the `/batches` `BatchesListCard`, which
 * render the identical fallback: a quiet, muted line inside the card shell (the
 * card title + any header actions stay, so only the body degrades). Kept in one
 * place so the wording and styling can't drift between the two cards.
 */
export default function BatchesCardError() {
  return (
    <p className="text-sm text-foreground/50">
      Couldn&apos;t load batches right now.
    </p>
  );
}
