type ResumeDocument = Pick<
  Document,
  "addEventListener" | "removeEventListener" | "visibilityState"
> & { readonly wasDiscarded?: boolean };
type ResumeWindow = Pick<Window, "addEventListener" | "removeEventListener"> & {
  readonly navigator: Pick<Navigator, "onLine">;
};

export function observeDashboardResume(
  document: ResumeDocument,
  window: ResumeWindow,
  requestRefresh: (_requiresFollowUp: boolean) => void,
): () => void {
  let wasHidden = document.visibilityState === "hidden";
  function refreshWhenVisible(event?: Event): void {
    if (document.visibilityState === "hidden") wasHidden = true;
    if (document.visibilityState === "visible" && window.navigator.onLine) {
      const requiresFollowUp = wasHidden || event?.type === "online";
      wasHidden = false;
      requestRefresh(requiresFollowUp);
    }
  }
  function refreshRestoredPage(event: Event): void {
    if ((event as PageTransitionEvent).persisted) refreshWhenVisible();
  }

  document.addEventListener("visibilitychange", refreshWhenVisible);
  window.addEventListener("pageshow", refreshRestoredPage);
  window.addEventListener("online", refreshWhenVisible);
  if (document.wasDiscarded) refreshWhenVisible();

  return () => {
    document.removeEventListener("visibilitychange", refreshWhenVisible);
    window.removeEventListener("pageshow", refreshRestoredPage);
    window.removeEventListener("online", refreshWhenVisible);
  };
}
