"use client";

import { useEffect, useState } from "react";
import { factBody, onAuthSplashDone, pickDidYouKnowFact } from "@/lib/auth/did-you-know";

export function DidYouKnow() {
  const [fact, setFact] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setFact(pickDidYouKnowFact());
    const reveal = () => setShow(true);
    const off = onAuthSplashDone(reveal);
    const fallback = window.setTimeout(reveal, 3200);
    return () => {
      off();
      window.clearTimeout(fallback);
    };
  }, []);

  if (!fact || !show) {
    return <div className="login-didyouknow" aria-hidden="true" />;
  }

  return (
    <div className="login-didyouknow">
      <p className="login-didyouknow-label">Did you know</p>
      <p className="login-didyouknow-body">{factBody(fact)}</p>
    </div>
  );
}
