/** Badge variant theo trạng thái job runner. */
export const jobBadgeVariant = (state: string) =>
  state === "done" ? "secondary" : state === "failed" || state === "lost" ? "destructive" : "outline";
