import { RemixBrowser } from "@remix-run/react";
import { startTransition, StrictMode } from "react";
import { hydrate } from "react-dom/client";

const hydrate = () => {
  startTransition(() => {
    hydrate(<RemixBrowser />, document)
    // hydrateRoot(
    //   document,
    //   <StrictMode>
    //     <RemixBrowser />
    //   </StrictMode>
    // );

  });
};

if (window.requestIdleCallback) {
  window.requestIdleCallback(hydrate);
} else {
  // Safari doesn't support requestIdleCallback
  // https://caniuse.com/requestidlecallback
  window.setTimeout(hydrate, 1);
}
